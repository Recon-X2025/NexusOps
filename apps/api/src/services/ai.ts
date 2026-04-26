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

export interface ClassifyTicketInput {
  title: string;
  description: string;
}

export interface ClassifyTicketOutput {
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  confidence: number;
  reasoning: string;
}

/**
 * Classifies a ticket's category and priority based on title and description.
 * Returns { confidence: 0 } if AI is unavailable or times out.
 */
export async function classifyTicket(
  input: ClassifyTicketInput,
): Promise<ClassifyTicketOutput | { confidence: 0 }> {
  try {
    const client = getClient();

    const prompt = `You are an ITSM ticket classifier. Given a ticket title and description, determine the most appropriate category and priority.

Title: ${input.title}
Description: ${input.description}

Respond with valid JSON only:
{
  "category": "string (one of: hardware, software, access, network, facilities, security, hr, other)",
  "priority": "string (one of: low, medium, high, critical)",
  "confidence": number (0.0 to 1.0),
  "reasoning": "brief explanation"
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
    if (!jsonMatch) return { confidence: 0 };

    const parsed = JSON.parse(jsonMatch[0]) as ClassifyTicketOutput;
    const validCategories = ["hardware", "software", "access", "network", "facilities", "security", "hr", "other"];
    const validPriorities = ["low", "medium", "high", "critical"] as const;

    return {
      category: validCategories.includes(parsed.category) ? parsed.category : "other",
      priority: validPriorities.includes(parsed.priority as typeof validPriorities[number])
        ? (parsed.priority as typeof validPriorities[number])
        : "medium",
      confidence: typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
      reasoning: String(parsed.reasoning ?? ""),
    };
  } catch (err) {
    console.warn("[ai:classifyTicket] Failed:", (err as Error).message);
    return { confidence: 0 };
  }
}

export interface ParseSearchQueryInput {
  query: string;
}

export interface ParseSearchQueryOutput {
  filters: {
    status?: string;
    priority?: string;
    assignee?: string;
    category?: string;
    dateRange?: string;
  };
  searchTerm?: string;
  confidence: number;
}

/**
 * Parses a natural language ITSM search query into structured filters.
 * Returns { filters: {}, confidence: 0 } if AI is unavailable or times out.
 */
export async function parseSearchQuery(
  input: ParseSearchQueryInput,
): Promise<ParseSearchQueryOutput> {
  try {
    const client = getClient();

    const prompt = `Parse this natural language ITSM search query into structured filters.
Query: "${input.query}"

Examples:
- "critical tickets assigned to John" → {"priority": "critical", "assignee": "john"}
- "open hardware tickets last week" → {"status": "open", "category": "hardware", "dateRange": "last_week"}

Respond with JSON only: { "filters": {...}, "searchTerm": "...", "confidence": 0.0-1.0 }`;

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
    if (!jsonMatch) return { filters: {}, confidence: 0 };

    const parsed = JSON.parse(jsonMatch[0]) as ParseSearchQueryOutput;
    return {
      filters: typeof parsed.filters === "object" && parsed.filters !== null ? parsed.filters : {},
      searchTerm: parsed.searchTerm ? String(parsed.searchTerm) : undefined,
      confidence: typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
    };
  } catch (err) {
    console.warn("[ai:parseSearchQuery] Failed:", (err as Error).message);
    return { filters: {}, confidence: 0 };
  }
}

export interface SemanticResolutionCandidate {
  id: string;
  title: string;
  description: string;
  resolution?: string;
}

export interface SemanticResolutionResult {
  id: string;
  score: number;
  title: string;
  description: string;
  resolution?: string;
}

/**
 * Uses Claude to score each candidate resolved ticket by relevance to the target ticket,
 * returning the top 3 most relevant candidates with scores (0–1).
 * Returns null if AI is unavailable, times out, or no candidates are provided.
 */
export async function semanticResolutionSuggestions(input: {
  target: { title: string; description: string };
  candidates: SemanticResolutionCandidate[];
}): Promise<SemanticResolutionResult[] | null> {
  if (input.candidates.length === 0) return null;

  try {
    const client = getClient();

    const candidateList = input.candidates
      .map((c, i) =>
        `[${i}] id=${c.id}\nTitle: ${c.title}\nDescription: ${c.description.slice(0, 400)}\nResolution: ${c.resolution?.slice(0, 300) ?? "N/A"}`,
      )
      .join("\n\n");

    const prompt = `You are an ITSM relevance expert. Score each candidate resolved ticket by how semantically similar and useful it is for resolving the target ticket. Use a 0.0–1.0 scale where 1.0 means nearly identical issue with a clear resolution.

Target Ticket:
Title: ${input.target.title}
Description: ${input.target.description.slice(0, 600)}

Candidate Resolved Tickets:
${candidateList}

Return JSON only — an array of objects, one per candidate, sorted descending by score:
[{"id": "<id>", "score": <0.0-1.0>}, ...]`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
      TIMEOUT_MS,
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ id: string; score: number }>;
    if (!Array.isArray(parsed)) return null;

    const candidateMap = new Map(input.candidates.map((c) => [c.id, c]));

    return parsed
      .filter((r) => typeof r.id === "string" && typeof r.score === "number" && candidateMap.has(r.id))
      .slice(0, 3)
      .map((r) => {
        const c = candidateMap.get(r.id)!;
        return {
          id: c.id,
          score: Math.max(0, Math.min(1, r.score)),
          title: c.title,
          description: c.description,
          resolution: c.resolution,
        };
      });
  } catch (err) {
    console.warn("[ai:semanticResolutionSuggestions] Failed:", (err as Error).message);
    return null;
  }
}

/**
 * Short plain-text narrative for the Command Center hero. Returns null if AI is unavailable.
 */
export async function generateCommandCenterNarrative(prompt: string): Promise<string | null> {
  try {
    const client = getClient();
    const response = await withTimeout(
      client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
      TIMEOUT_MS,
    );
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const t = text.trim();
    return t.length > 0 ? t : null;
  } catch (err) {
    console.warn("[ai:generateCommandCenterNarrative] Failed:", (err as Error).message);
    return null;
  }
}
