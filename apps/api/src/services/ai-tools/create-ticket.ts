import { tickets, ticketStatuses, eq, and, asc } from "@nexusops/db";
import type { AgentTool } from "./types";

/**
 * Write tool — create a service-desk ticket on behalf of the user.
 *
 * Confirmation: this tool is marked `isWrite` so the agent's system prompt
 * tells Claude to confirm with the user before invoking. The RBAC check
 * still runs server-side (`incidents.write`) — even if the model bypasses
 * confirmation, an agent acting for a read-only user gets a 403.
 */
export const createTicketTool: AgentTool<{
  title: string;
  description?: string;
  type?: "incident" | "request" | "problem" | "change";
  impact?: "low" | "medium" | "high";
  urgency?: "low" | "medium" | "high";
}> = {
  name: "create_ticket",
  description:
    "Create a new service-desk ticket on behalf of the current user. " +
    "Use this when a user explicitly asks the assistant to file an incident, " +
    "service request, problem, or change. ALWAYS confirm with the user before " +
    "invoking — read back the title, description, and type and wait for 'yes' / " +
    "'confirm' / 'create it'. Returns the new ticket id and number.",
  inputJsonSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title (≤200 chars). Required." },
      description: { type: "string", description: "Body / steps to reproduce. Optional but recommended." },
      type: { type: "string", description: "incident | request | problem | change. Default: request." },
      impact: { type: "string", description: "low | medium | high. Default: medium." },
      urgency: { type: "string", description: "low | medium | high. Default: medium." },
    },
    required: ["title"],
  },
  requiredPermission: { module: "incidents", action: "write" },
  async handler(ctx, input) {
    if (!input.title || input.title.trim().length === 0) {
      return { error: "title is required" };
    }

    // Resolve a default open status. Each org seeds at least one open
    // status during onboarding; if for some reason there is none, fail
    // loudly rather than insert an FK-violating row.
    const [openStatus] = await ctx.db
      .select({ id: ticketStatuses.id })
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, ctx.orgId), eq(ticketStatuses.category, "open")))
      .orderBy(asc(ticketStatuses.sortOrder))
      .limit(1);
    if (!openStatus) {
      return {
        error:
          "No 'open' ticket status configured for this organization. Ask an admin to seed ticket statuses.",
      };
    }

    // Generate a sequential ticket number scoped to the org. The full
    // tickets router uses a counter table; for the agent path we use a
    // count-based fallback that matches the format other adapters
    // produce ("AGENT-NNNN").
    const countRows = await ctx.db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.orgId, ctx.orgId));
    const number = `AGENT-${String(countRows.length + 1).padStart(4, "0")}`;

    const insertValues: typeof tickets.$inferInsert = {
      orgId: ctx.orgId,
      number,
      title: input.title.slice(0, 200),
      description: input.description ?? undefined,
      statusId: openStatus.id,
      requesterId: ctx.userId,
      intakeChannel: "agent",
    };
    if (input.type) insertValues.type = input.type;
    if (input.impact) insertValues.impact = input.impact;
    if (input.urgency) insertValues.urgency = input.urgency;

    const [created] = await ctx.db
      .insert(tickets)
      .values(insertValues)
      .returning({ id: tickets.id, number: tickets.number, title: tickets.title });

    return {
      ok: true,
      ticket: created,
      message: `Created ticket ${created?.number}: ${created?.title}`,
    };
  },
};
