/**
 * Lead write helpers (G5).
 * ────────────────────────
 * `crm_leads.score` is now a real, persisted value (see lib/crm/lead-score).
 * Both the flat `crm.createLead`/`crm.updateLead` procedures and the nested
 * `crm.leads.create`/`crm.leads.update` procedures write through these helpers
 * so the score is computed identically on every path and never left at 0.
 *
 * The score is resolved against the org's versioned `lead_scoring_rules` config
 * (falling back to the platform default row, then the built-in defaults) and
 * clamped to [0, maxScore]. On update we re-read the persisted row and merge the
 * patch before scoring, so changing e.g. `status` from `new`→`qualified`
 * re-scores the lead even when the title/source weren't part of the patch.
 */
import { crmLeads, eq, and, type DbOrTx } from "@coheronconnect/db";
import { TRPCError } from "@trpc/server";
import { computeLeadScore, type ScorableLead } from "./lead-score";
import { resolveLeadScoringConfig } from "./lead-scoring-rules";

type LeadRow = typeof crmLeads.$inferSelect;

export interface CreateLeadArgs {
  orgId: string;
  ownerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  title?: string;
  source: LeadRow["source"];
}

/** Insert a lead with its score computed from the org's scoring config. */
export async function createScoredLead(db: DbOrTx, args: CreateLeadArgs): Promise<LeadRow> {
  const { orgId, ownerId, ...rest } = args;
  const config = await resolveLeadScoringConfig(db, orgId);
  const score = computeLeadScore(toScorable({ ...rest, status: "new" }), config);
  const [lead] = await db
    .insert(crmLeads)
    .values({ orgId, ownerId, ...rest, score })
    .returning();
  return lead!;
}

export interface UpdateLeadPatch {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  status?: LeadRow["status"];
  archived?: boolean;
}

/**
 * Patch a lead and re-score it. Reads the current row, merges the patch, then
 * recomputes the score so any change to a scoring input (source/status/title/
 * company/contactability) is reflected. Returns undefined if the lead doesn't
 * belong to the org (mirrors the prior update semantics — no throw).
 */
export async function updateScoredLead(
  db: DbOrTx,
  orgId: string,
  id: string,
  patch: UpdateLeadPatch,
): Promise<LeadRow | undefined> {
  const [current] = await db
    .select()
    .from(crmLeads)
    .where(and(eq(crmLeads.id, id), eq(crmLeads.orgId, orgId)));
  if (!current) return undefined;

  const merged = { ...current, ...patch };
  const config = await resolveLeadScoringConfig(db, orgId);
  const score = computeLeadScore(toScorable(merged), config);

  const [lead] = await db
    .update(crmLeads)
    .set({ ...patch, score, updatedAt: new Date() })
    .where(and(eq(crmLeads.id, id), eq(crmLeads.orgId, orgId)))
    .returning();
  return lead;
}

/**
 * Recompute + persist the score for a single lead against the current config.
 * Used by the recompute sweep and after a config change. Throws NOT_FOUND if the
 * lead is missing so callers get a clear signal.
 */
export async function rescoreLead(db: DbOrTx, orgId: string, id: string): Promise<LeadRow> {
  const [current] = await db
    .select()
    .from(crmLeads)
    .where(and(eq(crmLeads.id, id), eq(crmLeads.orgId, orgId)));
  if (!current) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
  }
  const config = await resolveLeadScoringConfig(db, orgId);
  const score = computeLeadScore(toScorable(current), config);
  const [lead] = await db
    .update(crmLeads)
    .set({ score, updatedAt: new Date() })
    .where(and(eq(crmLeads.id, id), eq(crmLeads.orgId, orgId)))
    .returning();
  return lead!;
}

/**
 * Recompute + persist scores for every lead in an org against the current
 * config. Returns the number of leads rescored. Used when scoring rules change
 * so existing leads reflect the new weights.
 */
export async function rescoreOrgLeads(db: DbOrTx, orgId: string): Promise<number> {
  const config = await resolveLeadScoringConfig(db, orgId);
  const leads = await db.select().from(crmLeads).where(eq(crmLeads.orgId, orgId));
  let updated = 0;
  for (const lead of leads) {
    const score = computeLeadScore(toScorable(lead), config);
    if (score !== lead.score) {
      await db
        .update(crmLeads)
        .set({ score, updatedAt: new Date() })
        .where(and(eq(crmLeads.id, lead.id), eq(crmLeads.orgId, orgId)));
      updated += 1;
    }
  }
  return updated;
}

function toScorable(lead: {
  source: string;
  status: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}): ScorableLead {
  return {
    source: lead.source,
    status: lead.status,
    title: lead.title,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
  };
}
