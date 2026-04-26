import { contracts, eq, and, gte, lte, isNotNull, ne } from "@nexusops/db";
import { sendNotification } from "../../services/notifications";
import type { WorkflowAction } from "./types";

interface Input {
  recipientUserId: string;
  /** Trigger windows in days from today (default [90, 60, 30]). */
  daysBefore?: number[];
}

export const contractRenewalReminderAction: WorkflowAction<Input> = {
  name: "contract_renewal_reminder",
  category: "legal",
  displayName: "Contract renewal reminder",
  description: "Notify the contract owner at 90 / 60 / 30 days before contract end-date.",
  inputs: [
    { key: "recipientUserId", label: "Recipient user id", type: "uuid", required: true },
    { key: "daysBefore", label: "Days-before triggers (JSON array)", type: "json" },
  ],
  async handler(ctx, input) {
    const triggers = input.daysBefore ?? [90, 60, 30];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let notified = 0;

    for (const days of triggers) {
      const start = new Date(today.getTime() + days * 86_400_000);
      const end = new Date(start.getTime() + 86_400_000);
      const expiring = await ctx.db
        .select({
          id: contracts.id,
          number: contracts.contractNumber,
          title: contracts.title,
          counterparty: contracts.counterparty,
          endDate: contracts.endDate,
        })
        .from(contracts)
        .where(
          and(
            eq(contracts.orgId, ctx.orgId),
            ne(contracts.status, "terminated"),
            isNotNull(contracts.endDate),
            gte(contracts.endDate, start),
            lte(contracts.endDate, end),
          ),
        );
      for (const c of expiring as Array<{ id: string; number: string; title: string; counterparty: string; endDate: Date }>) {
        await sendNotification({
          orgId: ctx.orgId,
          userId: input.recipientUserId,
          title: `Contract renewal in ${days} days — ${c.counterparty}`,
          body: `${c.number}: ${c.title}. Ends ${c.endDate.toLocaleDateString("en-IN")}.`,
          link: `/app/contracts/${c.id}`,
          sourceType: "contract",
          sourceId: c.id,
          type: "warning",
        });
        notified += 1;
      }
    }
    return { ok: true, details: `Notified for ${notified} contract(s)` };
  },
};
