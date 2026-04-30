/**
 * AI Copilot agent — tool-calling loop using Anthropic Claude.
 *
 * Design:
 *   - Read-only tools first release. Write tools (v1.1) follow plan→preview→
 *     confirm→execute and require an explicit user confirmation step.
 *   - Every tool call is RBAC-checked against the calling user's effective
 *     permissions (same hasPermission used by tRPC procedures). If the user
 *     can't read the module, neither can the agent acting for them.
 *   - Tool calls are bounded — max 8 iterations, 60s wall-clock, 4096 tokens.
 *
 * Trace contract: every successful run returns the text answer + the full
 * trace of tool calls (name + args + summary of output). The UI renders the
 * trace below the answer so users can see grounding.
 */
import Anthropic from "@anthropic-ai/sdk";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool = AgentTool<any>;
import type { Module, RbacAction, SystemRole } from "@coheronconnect/types";
import { hasPermission } from "@coheronconnect/types";
import { allTools } from "./ai-tools";
import type { AgentTool } from "./ai-tools/types";

const MAX_ITERATIONS = 8;
const MAX_TOKENS = 4096;
const WALL_CLOCK_MS = 60_000;
const MODEL = process.env["ANTHROPIC_AGENT_MODEL"] ?? "claude-3-5-sonnet-20241022";

export interface AgentInvocation {
  question: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AgentTrace {
  toolName: string;
  args: Record<string, unknown>;
  resultPreview: string;
  ms: number;
}

export interface AgentResponse {
  answer: string;
  trace: AgentTrace[];
  iterations: number;
  truncated: boolean;
}

export interface AgentContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string;
  userId: string;
  /** Effective system roles for the user. */
  roles: SystemRole[];
  /** Locale hint for date / number formatting in the system prompt. */
  locale?: string;
}

function getClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

function buildSystemPrompt(ctx: AgentContext): string {
  return [
    "You are CoheronConnect Copilot, an executive assistant for an Indian mid-market company.",
    "You help with ITSM, HR & payroll, finance, statutory compliance, contracts, and CRM questions.",
    "",
    "RULES:",
    "- Always ground every factual claim in a tool call. Never invent ticket ids, employee names, invoice amounts, or compliance dates.",
    "- If a tool returns no results, say so plainly. Do not pretend.",
    "- If you don't have a tool for what the user asked, say what you can do instead.",
    "- Be terse. Lead with the answer. Use bullet points for lists, never long paragraphs.",
    "- Use INR with the ₹ symbol when reporting Indian currency. Format dates as 'DD-MMM-YYYY'.",
    "- For compliance topics (GST, TDS, MCA), include the relevant due date next to every item.",
    "- Never reveal another tenant's data — your tools enforce this; do not try to bypass.",
    "",
    "If a user asks you to *change* something (create a ticket, send a notification, approve a request), tell them this is currently a read-only assistant and they should perform the action in the UI. Write tools are coming in the next release.",
  ].join("\n");
}

function userCanUseTool(ctx: AgentContext, tool: AgentTool): boolean {
  return hasPermission(
    ctx.roles,
    tool.requiredPermission.module as Module,
    tool.requiredPermission.action as RbacAction,
  );
}

function summarizeToolResult(result: unknown, max = 1000): string {
  try {
    const json = JSON.stringify(result);
    if (json.length <= max) return json;
    return json.slice(0, max - 3) + "...";
  } catch {
    return String(result).slice(0, max);
  }
}

export async function invokeAgent(
  ctx: AgentContext,
  invocation: AgentInvocation,
): Promise<AgentResponse> {
  const startedAt = Date.now();
  const client = getClient();

  // Filter tools to those this user has RBAC for. The model must not even see
  // the tools it can't invoke, otherwise it'll try them.
  const availableTools: Tool[] = allTools.filter((t) => userCanUseTool(ctx, t));

  const anthropicTools = availableTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputJsonSchema,
  }));

  type Msg = Anthropic.MessageParam;
  const messages: Msg[] = [];
  for (const m of invocation.conversationHistory ?? []) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: invocation.question });

  const trace: AgentTrace[] = [];
  let truncated = false;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    if (Date.now() - startedAt > WALL_CLOCK_MS) {
      truncated = true;
      break;
    }
    iterations += 1;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(ctx),
      messages,
      tools: anthropicTools,
    });

    const toolUses = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );

    if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      return {
        answer: text || "I wasn't able to answer that with the tools I have.",
        trace,
        iterations,
        truncated,
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const tool = availableTools.find((t) => t.name === tu.name);
      const toolStart = Date.now();
      let resultObject: unknown;
      let isError = false;
      if (!tool) {
        resultObject = { error: `Tool '${tu.name}' not available to this user` };
        isError = true;
      } else {
        try {
          resultObject = await tool.handler(ctx, tu.input as Record<string, unknown>);
        } catch (e) {
          resultObject = { error: (e as Error).message };
          isError = true;
        }
      }
      trace.push({
        toolName: tu.name,
        args: tu.input as Record<string, unknown>,
        resultPreview: summarizeToolResult(resultObject, 200),
        ms: Date.now() - toolStart,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: summarizeToolResult(resultObject, 8000),
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    answer:
      "I hit the maximum number of tool calls before reaching a confident answer. Please refine the question or check the trace for partial results.",
    trace,
    iterations,
    truncated: true,
  };
}
