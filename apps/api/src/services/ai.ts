/**
 * ai.ts — AI service for NexusOps
 *
 * Uses @anthropic-ai/sdk (Claude). Designed for:
 * - summarizeTicket(): condenses description + comments into 2–3 sentences
 * - suggestResolution(): RAG-style suggestion using similar resolved tickets + KB articles
 *
 * All functions:
 * - Are async and non-blocking
 * - Have explicit timeouts (15s) to avoid blocking tRPC responses
 * - Gracefully return null on failure — callers always have fallback UI
 * - Never leak raw API errors to clients
 */
import Anthropic from "@anthropic-ai/sdk";

const MAX_TOKENS = 512;
const TIMEOUT_MS = 15_000;

function getClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

/** Wrap a promise with a timeout; rejects with a timeout error if exceeded. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export interface SummarizeTicketInput {
  title: string;
  description: string;
  comments: Array<{ body: string; isInternal?: boolean }>;
  type?: string;
  priority?: string;
}

export interface SummarizeTicketOutput {
  summary: string;
  keyPoints: string[];
}

/**
 * Summarizes a ticket's description and agent comments into a concise 2–3 sentence summary
 * plus up to 3 key points. Returns null if AI is unavailable or times out.
 */
export async function summarizeTicket(
  input: SummarizeTicketInput,
): Promise<SummarizeTicketOutput | null> {
  try {
    const client = getClient();

    const commentText = input.comments
      .slice(-10) // last 10 comments max
      .map((c) => `[${c.isInternal ? "Agent" : "User"}]: ${c.body}`)
      .join("\n");

    const prompt = `You are an IT service management assistant. Summarize the following ticket concisely for an agent who needs a quick overview.

Ticket Type: ${input.type ?? "incident"}
Priority: ${input.priority ?? "unknown"}
Title: ${input.title}

Description:
${input.description}

${commentText ? `Recent Comments:\n${commentText}` : ""}

Respond with JSON only:
{
  "summary": "<2-3 sentence summary of the issue, current state, and key facts>",
  "keyPoints": ["<point 1>", "<point 2>", "<point 3>"]
}`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
      TIMEOUT_MS,
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as SummarizeTicketOutput;
    return {
      summary: String(parsed.summary ?? ""),
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 3).map(String) : [],
    };
  } catch (err) {
    console.warn("[ai:summarizeTicket] Failed:", (err as Error).message);
    return null;
  }
}

export interface SuggestResolutionInput {
  title: string;
  description: string;
  category?: string;
  similarTickets: Array<{
    title: string;
    description: string;
    resolution?: string;
  }>;
  kbArticles: Array<{
    title: string;
    content: string;
  }>;
}

export interface SuggestResolutionOutput {
  suggestion: string;
  confidence: "high" | "medium" | "low";
  sources: Array<{ type: "ticket" | "kb"; title: string }>;
}

/**
 * Suggests a resolution based on similar past tickets and knowledge base articles.
 * Returns null if AI is unavailable, times out, or no useful context exists.
 */
export async function suggestResolution(
  input: SuggestResolutionInput,
): Promise<SuggestResolutionOutput | null> {
  if (input.similarTickets.length === 0 && input.kbArticles.length === 0) {
    return null; // No context to reason from
  }

  try {
    const client = getClient();

    const ticketContext = input.similarTickets
      .slice(0, 5)
      .map((t, i) => `[Past Ticket ${i + 1}]: ${t.title}\n${t.description}\nResolution: ${t.resolution ?? "N/A"}`)
      .join("\n\n");

    const kbContext = input.kbArticles
      .slice(0, 3)
      .map((a, i) => `[KB Article ${i + 1}]: ${a.title}\n${a.content.slice(0, 800)}`)
      .join("\n\n");

    const prompt = `You are an IT support expert. Based on similar past tickets and knowledge base articles, suggest a resolution for this ticket.

Current Ticket:
Title: ${input.title}
Category: ${input.category ?? "general"}
Description: ${input.description}

${ticketContext ? `Similar Resolved Tickets:\n${ticketContext}` : ""}
${kbContext ? `\nRelevant Knowledge Base Articles:\n${kbContext}` : ""}

Respond with JSON only:
{
  "suggestion": "<Step-by-step resolution suggestion in 3-5 sentences>",
  "confidence": "<high|medium|low based on how closely the context matches>",
  "sources": [{"type": "<ticket|kb>", "title": "<source title>"}]
}`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
      TIMEOUT_MS,
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as SuggestResolutionOutput;
    return {
      suggestion: String(parsed.suggestion ?? ""),
      confidence: (["high", "medium", "low"] as const).includes(parsed.confidence) ? parsed.confidence : "low",
      sources: Array.isArray(parsed.sources)
        ? parsed.sources.slice(0, 5).map((s: any) => ({
            type: (["ticket", "kb"] as const).includes(s.type) ? s.type : "ticket",
            title: String(s.title ?? ""),
          }))
        : [],
    };
  } catch (err) {
    console.warn("[ai:suggestResolution] Failed:", (err as Error).message);
    return null;
  }
}
