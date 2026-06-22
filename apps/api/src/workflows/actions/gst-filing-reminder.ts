import { complianceCalendarItems, eq, and, gte, lte } from "@coheronconnect/db";
import { sendNotification } from "../../services/notifications";
import type { WorkflowAction } from "./types";

interface Input {
  /** Cycle anchor — "11" for GSTR-1 (11th of month), "20" for GSTR-3B (20th). */
  filingDay: number;
  /** User to nudge — typically the finance head. */
  userId: string;
  /** Days ahead to fire on (default 3). */
  daysAhead?: number;
}

export const gstFilingReminderAction: WorkflowAction<Input> = {
  name: "gst_filing_reminder",
  category: "statutory",
  displayName: "GST filing reminder",
  description:
    "Looks at the compliance calendar and notifies a user when a GSTR filing is due within N days.",
  inputs: [
    {
      key: "filingDay",
      label: "Filing day (11 = GSTR-1, 20 = GSTR-3B)",
      type: "number",
      required: true,
    },
    { key: "userId", label: "Recipient user id", type: "uuid", required: true },
    { key: "daysAhead", label: "Trigger N days ahead (default 3)", type: "number" },
  ],
  async handler(ctx, input) {
    const ahead = input.daysAhead ?? 3;
    const now = new Date();
    const window = new Date(Date.now() + ahead * 86_400_000);

    const items = await ctx.db
      .select({
        id: complianceCalendarItems.id,
        eventName: complianceCalendarItems.eventName,
        dueDate: complianceCalendarItems.dueDate,
        status: complianceCalendarItems.status,
      })
      .from(complianceCalendarItems)
      .where(
        and(
          eq(complianceCalendarItems.orgId, ctx.orgId),
          gte(complianceCalendarItems.dueDate, now),
          lte(complianceCalendarItems.dueDate, window),
        ),
      );

    const due = items.filter(
      (i: { eventName: string; dueDate: Date; status: string }) =>
        /GSTR/i.test(i.eventName) &&
        i.dueDate.getDate() === input.filingDay &&
        i.status !== "filed",
    );
    if (due.length === 0) {
      return { ok: true, details: "No GSTR items due in window" };
    }
    for (const item of due) {
      await sendNotification({
        orgId: ctx.orgId,
        userId: input.userId,
        title: `${item.eventName} due ${item.dueDate.toLocaleDateString("en-IN")}`,
        body: `Filing day ${input.filingDay} approaching. Reconcile and file before the deadline.`,
        link: "/app/compliance",
        sourceType: "compliance_item",
        sourceId: item.id,
        type: "warning",
      });
    }
    return { ok: true, details: `Notified ${due.length} item(s)` };
  },
};
