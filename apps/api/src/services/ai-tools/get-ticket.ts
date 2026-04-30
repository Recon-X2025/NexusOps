import { tickets, ticketComments, eq, and, desc } from "@coheronconnect/db";
import type { AgentTool } from "./types";

export const getTicketTool: AgentTool<{ id: string }> = {
  name: "get_ticket",
  description: "Fetch a single ticket by id with the latest 5 comments.",
  inputJsonSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Ticket UUID" } },
    required: ["id"],
  },
  requiredPermission: { module: "incidents", action: "read" },
  async handler(ctx, input) {
    const [t] = await ctx.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, input.id), eq(tickets.orgId, ctx.orgId)))
      .limit(1);
    if (!t) return { found: false };
    const comments = await ctx.db
      .select({ body: ticketComments.body, isInternal: ticketComments.isInternal, createdAt: ticketComments.createdAt })
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, t.id))
      .orderBy(desc(ticketComments.createdAt))
      .limit(5);
    return { found: true, ticket: t, comments };
  },
};
