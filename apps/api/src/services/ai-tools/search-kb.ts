import { kbArticles, eq, and, ilike, or, desc } from "@coheronconnect/db";
import type { AgentTool } from "./types";

export const searchKbTool: AgentTool<{ query: string; limit?: number }> = {
  name: "search_kb",
  description: "Search the knowledge-base for articles matching the query (title or body).",
  inputJsonSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number", description: "Default 5, max 15" },
    },
    required: ["query"],
  },
  requiredPermission: { module: "knowledge", action: "read" },
  async handler(ctx, input) {
    const limit = Math.min(input.limit ?? 5, 15);
    const rows = await ctx.db
      .select({
        id: kbArticles.id,
        title: kbArticles.title,
        tags: kbArticles.tags,
        updatedAt: kbArticles.updatedAt,
      })
      .from(kbArticles)
      .where(
        and(
          eq(kbArticles.orgId, ctx.orgId),
          eq(kbArticles.status, "published"),
          or(
            ilike(kbArticles.title, `%${input.query}%`),
            ilike(kbArticles.content, `%${input.query}%`),
          ),
        ),
      )
      .orderBy(desc(kbArticles.updatedAt))
      .limit(limit);
    return { count: rows.length, items: rows };
  },
};
