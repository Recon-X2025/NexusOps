/**
 * G5 — Real lead scoring tests.
 *
 * Before G5, `crm_leads.score` was always 0 (never computed) yet leads were
 * sorted by `desc(score)` — a meaningless order. These tests prove:
 *   - create computes + persists a deterministic score from source/title/etc,
 *   - update re-scores when a scoring input (status/title/source) changes,
 *   - list orders by the persisted score,
 *   - a published org-scoped config overrides the built-in defaults and
 *     rescores existing leads,
 *   - the pure computeLeadScore matches the persisted values,
 *   - both the flat and nested create paths score identically.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmLeads, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";
import { computeLeadScore, DEFAULT_LEAD_SCORING_CONFIG } from "../lib/crm/lead-score";

describe("G5: real lead scoring", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, {
      email: `crm-${nanoid(6)}@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
    }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("computes + persists a deterministic score on create", async () => {
    const lead = await caller.createLead({
      firstName: "Ada",
      lastName: "Lovelace",
      email: `ada-${nanoid(4)}@example.com`,
      phone: "+911234567890",
      company: "Analytical Engines",
      title: "Chief Technology Officer",
      source: "referral",
    });

    // referral(25) + status new(0) + "chief"(20) + email(5) + phone(5) + company(5) = 60
    const expected = computeLeadScore(
      {
        source: "referral",
        status: "new",
        title: "Chief Technology Officer",
        email: lead!.email,
        phone: lead!.phone,
        company: lead!.company,
      },
      DEFAULT_LEAD_SCORING_CONFIG,
    );
    expect(lead!.score).toBe(expected);
    expect(lead!.score).toBe(60);

    const [persisted] = await testDb().select().from(crmLeads).where(eq(crmLeads.id, lead!.id));
    expect(persisted!.score).toBe(60);
  });

  it("re-scores when status advances new → qualified", async () => {
    const lead = await caller.createLead({
      firstName: "Grace",
      lastName: "Hopper",
      email: `grace-${nanoid(4)}@example.com`,
      phone: "+911234567891",
      company: "Navy",
      title: "Director",
      source: "website",
    });
    // website(10) + new(0) + director(12) + email(5) + phone(5) + company(5) = 37
    expect(lead!.score).toBe(37);

    const updated = await caller.updateLead({ id: lead!.id, status: "qualified" });
    // qualified(25) replaces new(0): 37 - 0 + 25 = 62
    expect(updated!.score).toBe(62);

    const [persisted] = await testDb().select().from(crmLeads).where(eq(crmLeads.id, lead!.id));
    expect(persisted!.score).toBe(62);
  });

  it("disqualifying clamps the score to 0 (never negative)", async () => {
    const lead = await caller.createLead({
      firstName: "Bare",
      lastName: "Lead",
      email: `bare-${nanoid(4)}@example.com`,
      phone: "+911234567892",
      source: "cold_outreach",
    });
    const updated = await caller.updateLead({ id: lead!.id, status: "disqualified" });
    // cold_outreach(5) + disqualified(-50) + email(5) + phone(5) = -35 → clamp 0
    expect(updated!.score).toBe(0);
  });

  it("lists leads ordered by persisted score (desc)", async () => {
    await caller.createLead({
      firstName: "Low", lastName: "Score", email: `low-${nanoid(4)}@e.com`,
      phone: "+911", source: "other",
    });
    await caller.createLead({
      firstName: "High", lastName: "Score", email: `high-${nanoid(4)}@e.com`,
      phone: "+912", company: "Co", title: "Founder", source: "referral",
    });

    const list = await caller.leads.list({ limit: 50 });
    expect(list.length).toBe(2);
    expect(list[0]!.firstName).toBe("High");
    expect(list[0]!.score).toBeGreaterThan(list[1]!.score);
  });

  it("published org config overrides defaults and rescores existing leads", async () => {
    const lead = await caller.createLead({
      firstName: "Config", lastName: "Test", email: `cfg-${nanoid(4)}@e.com`,
      phone: "+913", company: "Co", title: "Manager", source: "website",
    });
    // default: website(10) + manager(8) + email(5) + phone(5) + company(5) = 33
    expect(lead!.score).toBe(33);

    const { rescored } = await caller.leadScoring.publish({
      config: { sourceWeights: { website: 50 }, maxScore: 200 },
    });
    expect(rescored).toBeGreaterThanOrEqual(1);

    const [after] = await testDb().select().from(crmLeads).where(eq(crmLeads.id, lead!.id));
    // website now 50; other defaults inherited: 50 + manager(8) + 5 + 5 + 5 = 73
    expect(after!.score).toBe(73);

    const effective = await caller.leadScoring.effective();
    expect(effective.sourceWeights.website).toBe(50);
    expect(effective.maxScore).toBe(200);
    // untouched default weight is still inherited
    expect(effective.titleWeights.manager).toBe(DEFAULT_LEAD_SCORING_CONFIG.titleWeights.manager);
  });

  it("nested create path scores identically to the flat path", async () => {
    const args = {
      firstName: "Nested", lastName: "Path", email: `nested-${nanoid(4)}@e.com`,
      phone: "+914", company: "Co", title: "VP Sales", source: "partner" as const,
    };
    const nested = await caller.leads.create(args);
    // partner(20) + new(0) + vp(15) + email(5) + phone(5) + company(5) = 50
    expect(nested!.score).toBe(50);
  });
});
