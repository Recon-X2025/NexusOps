/**
 * ai.ts router — AI-powered ticket assistant procedures
 *
 * Gated by incidents.read permission (agents and above).
 * All AI calls are non-blocking and return null on failure.
 */
import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { tickets, ticketComments, kbArticles, eq, and, ne, desc } from "@nexusops/db";
import { summarizeTicket, suggestResolution, classifyTicket, parseSearchQuery, semanticResolutionSuggestions } from "../services/ai";

export const aiRouter = router({
  /**
   * Summarize a ticket's description + recent comments into a concise overview.
   * Returns null if ANTHROPIC_API_KEY is not set or AI times out.
   */
  summarizeTicket: permissionProcedure("incidents", "read")
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, org!.id)));

      if (!ticket) return null;

      const comments = await db
        .select({ body: ticketComments.body, isInternal: ticketComments.isInternal })
        .from(ticketComments)
        .where(eq(ticketComments.ticketId, ticket.id))
        .orderBy(desc(ticketComments.createdAt))
        .limit(10);

      return summarizeTicket({
        title: ticket.title,
        description: ticket.description ?? "",
        comments: comments.map((c: { body: string; isInternal: boolean | null }) => ({ body: c.body, isInternal: c.isInternal ?? false })),
        type: ticket.type,
      });
    }),

  /**
   * Suggest a resolution based on similar resolved tickets and matching KB articles.
   * Returns null if no relevant context found or AI unavailable.
   */
  suggestResolution: permissionProcedure("incidents", "read")
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, org!.id)));

      if (!ticket) return null;

      // Find similar resolved tickets (same org, same category, title similarity via full-text)
      const similarTickets = await db
        .select({
          title: tickets.title,
          description: tickets.description,
        })
        .from(tickets)
        .where(and(
          eq(tickets.orgId, org!.id),
          eq(tickets.categoryId, ticket.categoryId ?? ""),
        ))
        .orderBy(desc(tickets.createdAt))
        .limit(5);

      // Find relevant KB articles
      const articles = await db
        .select({ title: kbArticles.title, content: kbArticles.content })
        .from(kbArticles)
        .where(eq(kbArticles.orgId, org!.id))
        .orderBy(desc(kbArticles.createdAt))
        .limit(3);

      return suggestResolution({
        title: ticket.title,
        description: ticket.description ?? "",
        category: ticket.categoryId ?? undefined,
        similarTickets: similarTickets.map((t: { title: string; description: string | null }) => ({
          title: t.title,
          description: t.description ?? "",
        })),
        kbArticles: articles.map((a: { title: string; content: string }) => ({
          title: a.title,
          content: a.content ?? "",
        })),
      });
    }),

  /**
   * Classify a ticket's category and priority from its title and description.
   * Returns { confidence: 0 } if AI is unavailable or times out — callers
   * should treat low confidence as "no suggestion".
   */
  classifyTicket: permissionProcedure("incidents", "read")
    .input(z.object({ title: z.string(), description: z.string() }))
    .mutation(async ({ input }) => {
      return classifyTicket({ title: input.title, description: input.description });
    }),

  /**
   * Parse a natural language search query into structured ITSM filters.
   * Returns { filters: {}, confidence: 0 } on AI failure — callers fall back to
   * plain text search in that case.
   */
  parseSearchQuery: permissionProcedure("incidents", "read")
    .input(z.object({ query: z.string() }))
    .mutation(async ({ input }) => {
      return parseSearchQuery({ query: input.query });
    }),

  /**
   * Semantic resolution suggestions using Claude to rank resolved tickets by relevance.
   * Returns null if AI is unavailable or no resolved candidates exist.
   */
  semanticSuggestResolution: permissionProcedure("incidents", "read")
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, org!.id)));

      if (!ticket) return null;

      const candidates = await db
        .select({
          id: tickets.id,
          title: tickets.title,
          description: tickets.description,
          resolutionNotes: tickets.resolutionNotes,
        })
        .from(tickets)
        .where(and(
          eq(tickets.orgId, org!.id),
          ne(tickets.id, ticket.id),
          eq(tickets.type, ticket.type),
        ))
        .orderBy(desc(tickets.resolvedAt))
        .limit(20);

      return semanticResolutionSuggestions({
        target: { title: ticket.title, description: ticket.description ?? "" },
        candidates: candidates.map((c: { id: string; title: string; description: string | null; resolutionNotes: string | null }) => ({
          id: c.id,
          title: c.title,
          description: c.description ?? "",
          resolution: c.resolutionNotes ?? undefined,
        })),
      });
    }),
});
