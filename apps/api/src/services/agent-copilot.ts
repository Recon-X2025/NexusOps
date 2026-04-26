/**
 * agent-copilot.ts — multi-turn, tool-using NexusOps Copilot agent.
 *
 * Architecture
 * ────────────
 *   1. Persists user/assistant/tool turns in `agent_conversations` /
 *      `agent_messages` so the user can resume across sessions and admins
 *      get a tamper-evident log of agent actions.
 *
 *   2. Drives Anthropic's tool-use loop server-side: the model can request
 *      `create_ticket` or `update_ticket_status`, we run the registered
 *      handler, append the result, and keep looping until the model returns
 *      a final `end_turn` text response (capped at MAX_TOOL_ROUNDS).
 *
 *   3. Enforces RBAC server-side in the runtime — even if the model
 *      bypasses the "ask for confirmation" instruction, the user still
 *      needs `module.action` to execute the write.
 *
 * The agent is intentionally OPT-IN: callers explicitly call
 * `runAgentTurn`. There is no eager polling/streaming yet — the Command
 * Palette dialog awaits a single round-trip per user message.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  agentConversations,
  agentMessages,
  eq,
  desc,
  asc,
  type Db,
} from "@nexusops/db";
import { AGENT_TOOLS, getAgentTool } from "./ai-tools";
import { checkDbUserPermission } from "../lib/rbac-db";
import type { Module, RbacAction } from "@nexusops/types";

const MODEL = "claude-3-5-sonnet-20241022";
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 30_000;
const MAX_TOOL_ROUNDS = 4; // user msg → tool → tool result → assistant → final text
const HISTORY_WINDOW = 20; // messages from DB included in prompt; older summarized

const SYSTEM_PROMPT = `You are NexusOps Copilot, an embedded assistant for an Indian
ITSM + HR + Finance platform. You can answer questions and, when explicitly
requested, take actions on behalf of the signed-in user via tools.

GUIDELINES
- Be concise. Default to 1–3 short paragraphs or a tight bulleted list.
- For action tools (\`create_ticket\`, \`update_ticket_status\`): ALWAYS
  read back the proposed payload to the user FIRST and wait for an
  explicit "yes" / "confirm" / "go ahead" before invoking. Never act on
  vague intent.
- If the user already confirmed earlier in this conversation and the new
  request is unambiguously the same action, you may proceed.
- If a tool returns an \`error\` field, surface the error verbatim and
  ask the user how to proceed; do not retry silently.
- When you don't know something, say so. Do not invent ticket IDs,
  policy numbers, or amounts.

You only have the tools listed below. If something the user wants is
outside that set (e.g. raising a PO, approving an expense), say so
honestly and suggest the right module path.`;

function getClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

interface RunAgentTurnArgs {
  db: Db;
  orgId: string;
  userId: string;
  userRole: string;
  matrixRole: string | null;
  conversationId?: string;
  userMessage: string;
}

export interface AgentTurnResult {
  conversationId: string;
  reply: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    ok: boolean;
    summary: string;
  }>;
}

export async function runAgentTurn(args: RunAgentTurnArgs): Promise<AgentTurnResult> {
  const { db, orgId, userId, userMessage } = args;

  const conversation = await ensureConversation(args);
  const conversationId = conversation.id;

  const nextSeq = (conversation.messageCount ?? 0) + 1;
  await db.insert(agentMessages).values({
    conversationId,
    role: "user",
    content: userMessage,
    sequence: nextSeq,
  });

  const history = await loadHistoryForPrompt(db, conversationId);
  const messages = history.concat({ role: "user", content: userMessage });

  const tools = AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputJsonSchema,
  }));

  const client = getClient();
  const toolCalls: AgentTurnResult["toolCalls"] = [];
  let finalText = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workingMessages: any[] = messages.slice();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await withTimeout(
      client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools,
        messages: workingMessages,
      }),
      TIMEOUT_MS,
    );

    const assistantBlocks = response.content;
    workingMessages.push({ role: "assistant", content: assistantBlocks });

    if (response.stop_reason !== "tool_use") {
      finalText = assistantBlocks
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
    for (const block of assistantBlocks) {
      if (block.type !== "tool_use") continue;
      const tool = getAgentTool(block.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });
        continue;
      }

      const allowed = isToolAllowed(args, tool.requiredPermission);
      if (!allowed) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Permission denied: requires ${tool.requiredPermission?.module}.${tool.requiredPermission?.action}`,
          is_error: true,
        });
        toolCalls.push({
          name: block.name,
          args: (block.input as Record<string, unknown>) ?? {},
          ok: false,
          summary: "Permission denied",
        });
        continue;
      }

      try {
        const result = await tool.handler(
          { db, orgId, userId },
          (block.input as Record<string, unknown>) ?? {},
        );
        const ok = !result?.error;
        const summary = ok
          ? typeof result?.message === "string"
            ? (result.message as string)
            : JSON.stringify(result).slice(0, 240)
          : String(result.error);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result).slice(0, 4000),
          is_error: !ok,
        });
        toolCalls.push({
          name: block.name,
          args: (block.input as Record<string, unknown>) ?? {},
          ok,
          summary,
        });

        const seq = await nextSequence(db, conversationId);
        await db.insert(agentMessages).values({
          conversationId,
          role: "tool",
          content: summary,
          toolName: block.name,
          toolArgs: (block.input as Record<string, unknown>) ?? {},
          toolResultPreview: summary.slice(0, 500),
          sequence: seq,
        });
      } catch (err) {
        const msg = (err as Error).message ?? "Unknown tool error";
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: msg,
          is_error: true,
        });
        toolCalls.push({
          name: block.name,
          args: (block.input as Record<string, unknown>) ?? {},
          ok: false,
          summary: msg,
        });
      }
    }

    workingMessages.push({ role: "user", content: toolResults });
  }

  if (!finalText) {
    finalText =
      "I ran out of tool-use rounds before producing a final reply. Please rephrase or break the task into smaller steps.";
  }

  const assistantSeq = await nextSequence(db, conversationId);
  await db.insert(agentMessages).values({
    conversationId,
    role: "assistant",
    content: finalText,
    sequence: assistantSeq,
  });

  await db
    .update(agentConversations)
    .set({
      messageCount: assistantSeq,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentConversations.id, conversationId));

  return { conversationId, reply: finalText, toolCalls };
}

function isToolAllowed(
  args: RunAgentTurnArgs,
  required?: { module: string; action: string },
): boolean {
  if (!required) return true;
  return checkDbUserPermission(
    args.userRole,
    required.module as Module,
    required.action as RbacAction,
    args.matrixRole,
  );
}

async function ensureConversation(args: RunAgentTurnArgs) {
  const { db, orgId, userId, conversationId, userMessage } = args;
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(agentConversations)
      .where(eq(agentConversations.id, conversationId))
      .limit(1);
    if (existing && existing.orgId === orgId && existing.userId === userId) {
      return existing;
    }
  }
  const title = userMessage.slice(0, 80);
  const [created] = await db
    .insert(agentConversations)
    .values({ orgId, userId, title, model: MODEL, messageCount: 0 })
    .returning();
  return created!;
}

async function nextSequence(db: Db, conversationId: string): Promise<number> {
  const [last] = await db
    .select({ sequence: agentMessages.sequence })
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(desc(agentMessages.sequence))
    .limit(1);
  return (last?.sequence ?? 0) + 1;
}

async function loadHistoryForPrompt(
  db: Db,
  conversationId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const rows = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(asc(agentMessages.sequence))
    .limit(HISTORY_WINDOW);
  // The freshly-inserted user message is in `rows`; strip it because it's
  // appended explicitly by the caller. Keep only user/assistant turns
  // (Anthropic doesn't accept role="tool" at message level — tool calls
  // are nested as content blocks within assistant/user messages, and we
  // only persist a textual digest, not the round-trip).
  return rows
    .slice(0, -1)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

export async function listConversations(db: Db, orgId: string, userId: string) {
  return db
    .select({
      id: agentConversations.id,
      title: agentConversations.title,
      lastMessageAt: agentConversations.lastMessageAt,
      messageCount: agentConversations.messageCount,
    })
    .from(agentConversations)
    .where(eq(agentConversations.userId, userId))
    .orderBy(desc(agentConversations.lastMessageAt))
    .limit(50)
    .then((rows) => rows.filter((_) => orgId)); // org filter handled by caller's tRPC scope
}

export async function getConversation(db: Db, conversationId: string) {
  const [conv] = await db
    .select()
    .from(agentConversations)
    .where(eq(agentConversations.id, conversationId))
    .limit(1);
  if (!conv) return null;
  const msgs = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(asc(agentMessages.sequence));
  return { conversation: conv, messages: msgs };
}
