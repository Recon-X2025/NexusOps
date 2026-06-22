import { crmLeads, eq, and, lte, isNotNull, ne } from "@coheronconnect/db";
import { sendNotification } from "../../services/notifications";
import type { WorkflowAction } from "./types";

interface Input {
  /** Days of inactivity (no row updates) before a lead is stale (default 7). */
  staleAfterDays?: number;
}

/**
 * Stale-lead nudge — finds CRM leads whose row hasn't been touched in N days
 * and pings the owner. We treat `updatedAt` as the activity proxy: any
 * comment, status change, or call log triggers an updatedAt bump.
 */
export const staleLeadNudgeAction: WorkflowAction<Input> = {
  name: "stale_lead_nudge",
  category: "crm",
  displayName: "Stale lead nudge",
  description: "Notify the lead owner when a lead has had no activity for N days.",
  inputs: [{ key: "staleAfterDays", label: "Stale-after days (default 7)", type: "number" }],
  async handler(ctx, input) {
    const cutoff = new Date(Date.now() - (input.staleAfterDays ?? 7) * 86_400_000);

    const stale = await ctx.db
      .select({
        id: crmLeads.id,
        firstName: crmLeads.firstName,
        lastName: crmLeads.lastName,
        ownerId: crmLeads.ownerId,
      })
      .from(crmLeads)
      .where(
        and(
          eq(crmLeads.orgId, ctx.orgId),
          isNotNull(crmLeads.ownerId),
          ne(crmLeads.status, "qualified"),
          ne(crmLeads.status, "converted"),
          ne(crmLeads.status, "disqualified"),
          lte(crmLeads.updatedAt, cutoff),
        ),
      )
      .limit(200);

    let notified = 0;
    for (const l of stale as Array<{ id: string; firstName: string; lastName: string; ownerId: string }>) {
      await sendNotification({
        orgId: ctx.orgId,
        userId: l.ownerId,
        title: `Stale lead: ${l.firstName} ${l.lastName}`,
        body: `No activity for ${input.staleAfterDays ?? 7} days. Reach out or close the lead.`,
        link: `/app/crm/leads/${l.id}`,
        sourceType: "lead",
        sourceId: l.id,
        type: "info",
      });
      notified += 1;
    }
    return { ok: true, details: `Nudged owners on ${notified} stale lead(s)` };
  },
};
