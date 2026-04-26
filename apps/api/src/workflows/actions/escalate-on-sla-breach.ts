import { tickets, employees, eq, and } from "@nexusops/db";
import { sendNotification } from "../../services/notifications";
import type { WorkflowAction } from "./types";

interface Input {
  ticketId: string;
  /** Optional override of who to escalate to. Default: the assignee's manager via employees.managerId. */
  escalateToUserId?: string;
  message?: string;
}

export const escalateOnSlaBreachAction: WorkflowAction<Input> = {
  name: "escalate_on_sla_breach",
  category: "itsm",
  displayName: "Escalate ticket on SLA breach",
  description: "Notify the assignee's manager (or a specific user) when a ticket's SLA pauses or breaches.",
  inputs: [
    { key: "ticketId", label: "Ticket id", type: "uuid", required: true },
    { key: "escalateToUserId", label: "Escalate to user id (optional)", type: "uuid" },
    { key: "message", label: "Custom message", type: "string" },
  ],
  async handler(ctx, input) {
    const [t] = await ctx.db
      .select({
        id: tickets.id,
        title: tickets.title,
        number: tickets.number,
        assigneeId: tickets.assigneeId,
      })
      .from(tickets)
      .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, ctx.orgId)))
      .limit(1);
    if (!t) return { ok: false, details: "Ticket not found" };

    let target = input.escalateToUserId ?? null;
    if (!target && t.assigneeId) {
      // assigneeId references users.id; we look up the assignee's employee row,
      // then the manager's user_id via employees.managerId → employees.id.
      const [assigneeEmp] = await ctx.db
        .select({ managerId: employees.managerId })
        .from(employees)
        .where(and(eq(employees.userId, t.assigneeId), eq(employees.orgId, ctx.orgId)))
        .limit(1);
      if (assigneeEmp?.managerId) {
        const [managerEmp] = await ctx.db
          .select({ userId: employees.userId })
          .from(employees)
          .where(and(eq(employees.id, assigneeEmp.managerId), eq(employees.orgId, ctx.orgId)))
          .limit(1);
        target = managerEmp?.userId ?? null;
      }
    }
    if (!target) return { ok: false, details: "No escalation target found" };

    await sendNotification({
      orgId: ctx.orgId,
      userId: target,
      title: `SLA breach: ${t.number ?? t.id} — ${t.title}`,
      body:
        input.message ??
        "This ticket's SLA has been paused or breached. Please review and assign or resolve.",
      link: `/app/tickets/${t.id}`,
      sourceType: "ticket",
      sourceId: t.id,
      type: "warning",
    });
    return { ok: true, details: `Escalated to ${target}` };
  },
};
