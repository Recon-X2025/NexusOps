/**
 * The CRM lead was a contact record: every column described WHO the person is,
 * none what they might buy, what it is worth, or when. Change the header from
 * Leads to Contacts and nothing would look out of place.
 *
 * This suite covers the sales half — BANT qualification feeding the score, a lead
 * carrying its own activity history, and conversion carrying the opportunity shape
 * onto the deal instead of landing it in the pipeline worth zero.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { crmLeads, crmDeals, crmActivities, eq, and } from "@coheronconnect/db";
import { crmRouter } from "../routers/crm";
import { computeLeadScore, DEFAULT_LEAD_SCORING_CONFIG } from "../lib/crm/lead-score";

describe("CRM lead qualification", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  const base = { firstName: "Ada", lastName: "Lovelace", email: "ada@acme.test", phone: "+91 90000 00000" };

  // ── PART 2 · SCORING ───────────────────────────────────────────────────────
  describe("scoring", () => {
    it("a fully qualified lead scores materially higher than an identical unqualified one", async () => {
      const unqualified = await caller.leads.create({ ...base, source: "website" } as never);
      const qualified = await caller.leads.create({
        ...base, email: "grace@acme.test", source: "website",
        budgetBand: "over_25l", authority: "decision_maker",
        timeline: "immediate", need: "Replacing a spreadsheet-based payroll process",
      } as never);

      const u = (unqualified as { score: number }).score;
      const q = (qualified as { score: number }).score;
      expect(q).toBeGreaterThan(u);
      // Materially — not a rounding difference. BANT is worth up to 80 on its own.
      expect(q - u).toBeGreaterThanOrEqual(40);
    });

    it("the platform default path returns a deterministic score with NO BANT data", async () => {
      const a = computeLeadScore({ source: "website", status: "new", email: "x@y.z" });
      const b = computeLeadScore({ source: "website", status: "new", email: "x@y.z" });
      expect(a).toBe(b);
      expect(a).toBeGreaterThan(0);
    });

    it("a config written BEFORE the BANT keys existed still scores deterministically", async () => {
      // Simulates a stored per-org row that predates this round: the new maps are
      // absent entirely. The score must fall back, not throw or collapse to zero.
      const legacy = { ...DEFAULT_LEAD_SCORING_CONFIG } as Record<string, unknown>;
      delete legacy["budgetWeights"];
      delete legacy["authorityWeights"];
      delete legacy["timelineWeights"];
      delete legacy["hasNeed"];

      const score = computeLeadScore(
        { source: "referral", status: "contacted", title: "VP Sales", email: "a@b.c",
          budgetBand: "over_25l", authority: "decision_maker", timeline: "immediate", need: "x" },
        legacy as never,
      );
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThan(0);
    });

    it("the existing source/status/title/presence weights still contribute as before", () => {
      const bare = computeLeadScore({ source: "other", status: "new" });
      expect(computeLeadScore({ source: "referral", status: "new" })).toBeGreaterThan(bare);
      expect(computeLeadScore({ source: "other", status: "qualified" })).toBeGreaterThan(bare);
      expect(computeLeadScore({ source: "other", status: "new", title: "Chief Revenue Officer" })).toBeGreaterThan(bare);
      expect(computeLeadScore({ source: "other", status: "new", email: "a@b.c" })).toBeGreaterThan(bare);
    });

    it("re-scores on EDIT, so capturing BANT moves the score", async () => {
      const lead = await caller.leads.create({ ...base, email: "edit@acme.test", source: "website" } as never);
      const before = (lead as { score: number }).score;
      const after = await caller.leads.update({
        id: (lead as { id: string }).id,
        budgetBand: "over_25l", authority: "decision_maker", timeline: "immediate",
      } as never);
      expect((after as { score: number }).score).toBeGreaterThan(before);
    });
  });

  // ── PART 3 · ACTIVITIES ────────────────────────────────────────────────────
  describe("activity history", () => {
    it("an activity created against a lead is listed under that lead", async () => {
      const lead = await caller.leads.create({ ...base, email: "act@acme.test" } as never);
      const leadId = (lead as { id: string }).id;

      await caller.activities.create({
        leadId, type: "call", subject: "Discovery call", completedAt: new Date(),
      } as never);

      const listed = (await caller.activities.list({ leadId } as never)) as { subject: string }[];
      expect(listed).toHaveLength(1);
      expect(listed[0]!.subject).toBe("Discovery call");
    });

    it("appears as the lead's last activity on the list", async () => {
      const lead = await caller.leads.create({ ...base, email: "last@acme.test" } as never);
      const leadId = (lead as { id: string }).id;
      const when = new Date("2026-08-01T10:00:00Z");
      await caller.activities.create({ leadId, type: "call", subject: "Call", completedAt: when } as never);

      const rows = (await caller.leads.list({} as never)) as { id: string; lastActivityAt: Date | null }[];
      const row = rows.find((r) => r.id === leadId);
      expect(row?.lastActivityAt).toBeTruthy();
      expect(new Date(row!.lastActivityAt!).toISOString()).toBe(when.toISOString());
    });

    it("a lead with no activity reports null, not a fabricated date", async () => {
      const lead = await caller.leads.create({ ...base, email: "none@acme.test" } as never);
      const rows = (await caller.leads.list({} as never)) as { id: string; lastActivityAt: Date | null }[];
      expect(rows.find((r) => r.id === (lead as { id: string }).id)?.lastActivityAt).toBeNull();
    });

    it("deal activities are unaffected — a deal activity does not leak onto a lead", async () => {
      const lead = await caller.leads.create({ ...base, email: "leak@acme.test" } as never);
      const [deal] = await testDb().insert(crmDeals)
        .values({ orgId, title: "Existing deal", ownerId: userId } as never)
        .returning({ id: crmDeals.id });

      await caller.activities.create({
        dealId: deal!.id, type: "note", subject: "Deal note", completedAt: new Date(),
      } as never);

      const onLead = (await caller.activities.list({ leadId: (lead as { id: string }).id } as never)) as unknown[];
      expect(onLead).toHaveLength(0);
      const onDeal = (await caller.activities.list({ dealId: deal!.id } as never)) as unknown[];
      expect(onDeal).toHaveLength(1);
    });
  });

  // ── PART 4 · CONVERSION CARRY ──────────────────────────────────────────────
  describe("conversion", () => {
    async function leadWith(extra: Record<string, unknown>) {
      return (await caller.leads.create({ ...base, email: `conv-${Math.random().toString(36).slice(2, 8)}@acme.test`, ...extra } as never)) as { id: string };
    }

    it("REJECTS conversion with no estimated value, naming the missing field", async () => {
      const lead = await leadWith({ expectedClose: new Date("2026-12-31") });
      await expect(
        caller.leads.convert({ id: lead.id, dealTitle: "Acme rollout" } as never),
      ).rejects.toMatchObject({ message: expect.stringMatching(/estimated value/i) });
    });

    it("REJECTS conversion with no expected close, naming the missing field", async () => {
      const lead = await leadWith({ estimatedValue: "250000.00" });
      await expect(
        caller.leads.convert({ id: lead.id, dealTitle: "Acme rollout" } as never),
      ).rejects.toMatchObject({ message: expect.stringMatching(/expected close/i) });
    });

    it("carries BOTH onto the created deal, and links the lead as converted", async () => {
      const close = new Date("2026-12-31T00:00:00Z");
      const lead = await leadWith({ estimatedValue: "250000.00", expectedClose: close });

      const deal = (await caller.leads.convert({ id: lead.id, dealTitle: "Acme rollout" } as never)) as {
        id: string; value: string | null; expectedClose: Date | null;
      };

      // Decimal columns round-trip with trailing zeros — compare numerically.
      expect(Number(deal.value)).toBe(250000);
      expect(new Date(deal.expectedClose!).toISOString()).toBe(close.toISOString());

      const [after] = await testDb()
        .select({ status: crmLeads.status, convertedDealId: crmLeads.convertedDealId })
        .from(crmLeads).where(and(eq(crmLeads.id, lead.id), eq(crmLeads.orgId, orgId)));
      expect(after!.status).toBe("converted");
      expect(after!.convertedDealId).toBe(deal.id);
    });
  });
});
