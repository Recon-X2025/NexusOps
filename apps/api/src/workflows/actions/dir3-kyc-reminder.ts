import { directors, complianceCalendarItems, eq, and } from "@nexusops/db";
import { sendNotification } from "../../services/notifications";
import type { WorkflowAction } from "./types";

interface Input {
  recipientUserId: string;
}

export const dir3KycReminderAction: WorkflowAction<Input> = {
  name: "dir3_kyc_reminder",
  category: "statutory",
  displayName: "DIR-3 KYC annual reminder",
  description:
    "Annual MCA DIR-3 KYC filing reminder for every active director. Cadence handled by the workflow scheduler; this action just emits the notifications.",
  inputs: [{ key: "recipientUserId", label: "Compliance officer user id", type: "uuid", required: true }],
  async handler(ctx, input) {
    const dirs = await ctx.db
      .select({ id: directors.id, fullName: directors.fullName, din: directors.din })
      .from(directors)
      .where(eq(directors.orgId, ctx.orgId));
    if (dirs.length === 0) return { ok: true, details: "No directors on record" };

    const fy = new Date().getFullYear();
    for (const d of dirs as Array<{ id: string; fullName: string; din: string }>) {
      // Idempotency: only insert once per (orgId, FY, director)
      await ctx.db
        .insert(complianceCalendarItems)
        .values({
          orgId: ctx.orgId,
          complianceType: "annual",
          eventName: `DIR-3 KYC — ${d.fullName} (DIN ${d.din})`,
          mcaForm: "DIR-3 KYC",
          financialYear: `FY${String(fy).slice(2)}-${String(fy + 1).slice(2)}`,
          dueDate: new Date(`${fy}-09-30T00:00:00Z`),
          status: "upcoming",
        })
        .onConflictDoNothing();
      await sendNotification({
        orgId: ctx.orgId,
        userId: input.recipientUserId,
        title: `DIR-3 KYC due 30-Sep — ${d.fullName}`,
        body: `Annual DIR-3 KYC filing for DIN ${d.din}. Failure to file leads to deactivation of DIN.`,
        link: "/app/compliance",
        sourceType: "director",
        sourceId: d.id,
        type: "warning",
      });
    }
    return { ok: true, details: `Notified for ${dirs.length} director(s)` };
  },
};
