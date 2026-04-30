import { tickets, ticketStatuses, eq, and } from "@coheronconnect/db";
import type { AgentTool } from "./types";

/**
 * Write tool — move a ticket to a different status (acknowledge, resolve,
 * close, hold, etc.). The agent must pass either a status name or the
 * status category; we look up the actual UUID server-side so the model
 * doesn't need to know UUIDs.
 *
 * Same confirmation contract as `create_ticket`: the system prompt
 * instructs Claude to confirm with the user first.
 */
export const updateTicketStatusTool: AgentTool<{
  ticketId: string;
  statusName?: string;
  statusCategory?: "open" | "pending" | "resolved" | "closed";
  resolutionNotes?: string;
}> = {
  name: "update_ticket_status",
  description:
    "Change a ticket's status. Pass either `statusName` (matches an existing " +
    "ticket_statuses row in the org) or `statusCategory` ('resolved' will pick " +
    "the first resolved-category status, etc.). Set `resolutionNotes` when " +
    "moving to a resolved/closed state. ALWAYS confirm with the user first.",
  inputJsonSchema: {
    type: "object",
    properties: {
      ticketId: { type: "string", description: "UUID of the ticket. Required." },
      statusName: { type: "string", description: "Exact status name." },
      statusCategory: {
        type: "string",
        description: "open | pending | resolved | closed (chooses first match).",
      },
      resolutionNotes: { type: "string", description: "Required when moving to resolved/closed." },
    },
    required: ["ticketId"],
  },
  requiredPermission: { module: "incidents", action: "write" },
  async handler(ctx, input) {
    if (!input.statusName && !input.statusCategory) {
      return { error: "Provide either statusName or statusCategory" };
    }

    const [ticket] = await ctx.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, ctx.orgId)));
    if (!ticket) return { error: "Ticket not found" };

    const conditions = [eq(ticketStatuses.orgId, ctx.orgId)];
    if (input.statusName) conditions.push(eq(ticketStatuses.name, input.statusName));
    else if (input.statusCategory)
      conditions.push(
        eq(ticketStatuses.category, input.statusCategory as "open" | "pending" | "resolved" | "closed"),
      );
    const [target] = await ctx.db
      .select()
      .from(ticketStatuses)
      .where(and(...conditions))
      .limit(1);
    if (!target) {
      return {
        error:
          "Could not resolve a matching status. Ask the user for the exact status name configured in the org.",
      };
    }

    const isTerminal = target.category === "resolved" || target.category === "closed";
    if (isTerminal && !input.resolutionNotes) {
      return {
        error:
          "resolutionNotes are required when moving to a resolved/closed status. Ask the user for a brief note.",
      };
    }

    const updates: Record<string, unknown> = {
      statusId: target.id,
      updatedAt: new Date(),
    };
    if (target.category === "resolved") updates.resolvedAt = new Date();
    if (target.category === "closed") updates.closedAt = new Date();
    if (input.resolutionNotes) updates.resolutionNotes = input.resolutionNotes;

    await ctx.db.update(tickets).set(updates).where(eq(tickets.id, ticket.id));

    return {
      ok: true,
      ticketId: ticket.id,
      number: ticket.number,
      newStatus: target.name,
      newCategory: target.category,
    };
  },
};
