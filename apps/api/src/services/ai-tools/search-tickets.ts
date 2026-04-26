import { tickets, eq, and, desc, ilike, or, inArray } from "@nexusops/db";
import type { AgentTool } from "./types";

export const searchTicketsTool: AgentTool<{
  query?: string;
  status?: string[];
  priority?: string[];
  type?: string[];
  assignedToMe?: boolean;
  limit?: number;
}> = {
  name: "search_tickets",
  description:
    "Search service-desk tickets (incidents, requests, problems, changes). Returns id, title, status, priority, assignee, createdAt.",
  inputJsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text match against title/description" },
      status: {
        type: "array",
        items: { type: "string" },
        description: "open|in_progress|resolved|closed|on_hold",
      },
      priority: {
        type: "array",
        items: { type: "string" },
        description: "p1|p2|p3|p4 or low|medium|high|critical",
      },
      type: {
        type: "array",
        items: { type: "string" },
        description: "incident|request|problem|change",
      },
      assignedToMe: { type: "boolean" },
      limit: { type: "number", description: "Max 25, default 10" },
    },
  },
  requiredPermission: { module: "incidents", action: "read" },
  async handler(ctx, input) {
    const limit = Math.min(input.limit ?? 10, 25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [eq(tickets.orgId, ctx.orgId)];
    if (input.query) {
      conditions.push(
        or(ilike(tickets.title, `%${input.query}%`), ilike(tickets.description, `%${input.query}%`)),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (input.type?.length) conditions.push(inArray(tickets.type, input.type as any));
    if (input.assignedToMe) conditions.push(eq(tickets.assigneeId, ctx.userId));

    const rows = await ctx.db
      .select({
        id: tickets.id,
        title: tickets.title,
        type: tickets.type,
        priorityId: tickets.priorityId,
        statusId: tickets.statusId,
        assigneeId: tickets.assigneeId,
        createdAt: tickets.createdAt,
      })
      .from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt))
      .limit(limit);
    return { count: rows.length, items: rows };
  },
};
