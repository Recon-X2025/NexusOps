/**
 * CRM management view (Phase 3) — figures, org isolation, and honest emptiness.
 *
 * The isolation assertion is the load-bearing one. This codebase has an open
 * isolation audit with nine cross-org findings, and every aggregate here sums
 * across a whole table — precisely the shape that leaks when a WHERE org_id is
 * dropped from one of several queries. A per-figure assertion against a second,
 * populated org is the only thing that catches a single missing predicate.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmDeals, crmQuotes, crmPipelineStages, eq } from "@coheronconnect/db";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe("crm.dashboard.managementView", () => {
  let orgId: string;
  let adminId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    caller = crmRouter.createCaller(createMockContext(adminId, orgId));
    // Give this org a stage config so weighting is defined.
    await caller.deals.stages.list();
  });

  it("reports emptiness as EMPTINESS, not as zero", async () => {
    const v = await caller.dashboard.managementView();
    expect(v.hasAnyDeals).toBe(false);
    expect(v.hasAnyQuotes).toBe(false);
    // Every stage is present so the screen can name them, each with no deals.
    expect(v.pipelineByStage.length).toBeGreaterThan(0);
    expect(v.pipelineByStage.every((s) => s.dealCount === 0)).toBe(true);
    expect(v.winLoss.lostReasons).toHaveLength(0);
  });

  it("counts and sums per stage, and weights by the STAGE's probability", async () => {
    await testDb().insert(crmDeals).values([
      { orgId, title: "A", stage: "prospect", value: "100000", ownerId: adminId },
      { orgId, title: "B", stage: "prospect", value: "50000", ownerId: adminId },
      { orgId, title: "C", stage: "negotiation", value: "200000", ownerId: adminId },
    ] as never);

    const v = await caller.dashboard.managementView();
    const prospect = v.pipelineByStage.find((s) => s.key === "prospect")!;
    const negotiation = v.pipelineByStage.find((s) => s.key === "negotiation")!;

    expect(prospect.dealCount).toBe(2);
    expect(Number(prospect.value)).toBe(150000);
    // Factory default probability for prospect is 10%.
    expect(Number(prospect.weightedValue)).toBeCloseTo(15000, 2);
    expect(negotiation.dealCount).toBe(1);
    expect(Number(negotiation.weightedValue)).toBeCloseTo(140000, 2); // 200000 @ 70%

    expect(v.openPipeline.dealCount).toBe(3);
    expect(Number(v.openPipeline.value)).toBe(350000);
    expect(Number(v.openPipeline.weightedValue)).toBeCloseTo(155000, 2);
  });

  it("EXCLUDES another org's deals and quotes from every figure", async () => {
    const other = await seedFullOrg();
    const otherCaller = crmRouter.createCaller(createMockContext(other.adminId!, other.orgId));
    await otherCaller.deals.stages.list();

    await testDb().insert(crmDeals).values([
      { orgId, title: "MINE", stage: "prospect", value: "1000", ownerId: adminId },
    ] as never);
    // Deliberately large and distinctive: if any predicate is missing, these
    // dominate the totals and the assertion cannot pass by coincidence.
    await testDb().insert(crmDeals).values([
      { orgId: other.orgId, title: "THEIRS-1", stage: "prospect", value: "9999999", ownerId: other.adminId },
      { orgId: other.orgId, title: "THEIRS-2", stage: "closed_won", value: "8888888", ownerId: other.adminId },
      { orgId: other.orgId, title: "THEIRS-3", stage: "closed_lost", value: "7777777", ownerId: other.adminId, lostReason: "THEIR REASON" },
    ] as never);
    await testDb().insert(crmQuotes).values([
      { orgId: other.orgId, quoteNumber: `QT-OTHER-${rnd()}`, status: "sent", total: "6666666", subtotal: "0", taxableValue: "0", taxTotal: "0" },
    ] as never);

    const v = await caller.dashboard.managementView();

    expect(v.pipelineByStage.find((s) => s.key === "prospect")!.dealCount).toBe(1);
    expect(Number(v.openPipeline.value)).toBe(1000);
    expect(v.winLoss.won.dealCount).toBe(0);
    expect(v.winLoss.lost.dealCount).toBe(0);
    expect(v.winLoss.lostReasons).toHaveLength(0);
    expect(v.hasAnyQuotes).toBe(false);
    // Owner panel must not name the other org's user either.
    expect(v.byOwner.every((o) => o.ownerId !== other.adminId)).toBe(true);

    // And the other org sees its own, not ours — isolation in both directions.
    const theirs = await otherCaller.dashboard.managementView();
    expect(Number(theirs.pipelineByStage.find((s) => s.key === "prospect")!.value)).toBe(9999999);
    expect(theirs.winLoss.lostReasons[0]!.reason).toBe("THEIR REASON");
  });

  it("reads the ORG's stage config — label, order and probability", async () => {
    await testDb()
      .update(crmPipelineStages)
      .set({ label: "Discovery", probability: 35 })
      .where(eq(crmPipelineStages.orgId, orgId));

    await testDb().insert(crmDeals).values([
      { orgId, title: "A", stage: "proposal", value: "100000", ownerId: adminId },
    ] as never);

    const v = await caller.dashboard.managementView();
    expect(v.stageConfigSource).toBe("org-configured");
    const proposal = v.pipelineByStage.find((s) => s.key === "proposal")!;
    expect(proposal.label).toBe("Discovery");
    expect(proposal.probability).toBe(35);
    expect(Number(proposal.weightedValue)).toBeCloseTo(35000, 2);
  });

  it("reports a deal with NO owner rather than dropping it", async () => {
    await testDb().insert(crmDeals).values([
      { orgId, title: "Unowned", stage: "prospect", value: "4200", ownerId: null },
    ] as never);

    const v = await caller.dashboard.managementView();
    const unowned = v.byOwner.find((o) => o.ownerId === null);
    expect(unowned).toBeDefined();
    expect(unowned!.ownerName).toBeNull();
    expect(Number(unowned!.value)).toBe(4200);
    // The owner panel must reconcile with the stage panel — an INNER join here
    // would silently drop this deal and the two panels would disagree.
    const ownerTotal = v.byOwner.reduce((a, o) => a + Number(o.value), 0);
    const stageTotal = v.pipelineByStage.reduce((a, s) => a + Number(s.value), 0);
    expect(ownerTotal).toBe(stageTotal);
  });

  it("counts deals with NO value separately, since money totals exclude them", async () => {
    await testDb().insert(crmDeals).values([
      { orgId, title: "Priced", stage: "prospect", value: "1000", ownerId: adminId },
      { orgId, title: "Unpriced", stage: "prospect", value: null, ownerId: adminId },
    ] as never);

    const v = await caller.dashboard.managementView();
    const prospect = v.pipelineByStage.find((s) => s.key === "prospect")!;
    expect(prospect.dealCount).toBe(2);
    expect(Number(prospect.value)).toBe(1000);
    expect(prospect.dealsWithNoValue).toBe(1);
    expect(v.dealsWithNoValue).toBe(1);
  });

  it("groups quotes by the schema's five statuses and no others", async () => {
    const [deal] = await testDb()
      .insert(crmDeals)
      .values({ orgId, title: "D", stage: "prospect", value: "1", ownerId: adminId } as never)
      .returning();
    await testDb().insert(crmQuotes).values([
      { orgId, dealId: deal!.id, quoteNumber: `QT-${rnd()}`, status: "draft", total: "100", subtotal: "0", taxableValue: "0", taxTotal: "0" },
      { orgId, dealId: deal!.id, quoteNumber: `QT-${rnd()}`, status: "draft", total: "200", subtotal: "0", taxableValue: "0", taxTotal: "0" },
      { orgId, dealId: deal!.id, quoteNumber: `QT-${rnd()}`, status: "accepted", total: "500", subtotal: "0", taxableValue: "0", taxTotal: "0" },
    ] as never);

    const v = await caller.dashboard.managementView();
    expect(v.quotesByStatus.map((q) => q.status)).toEqual([
      "draft", "sent", "accepted", "rejected", "expired",
    ]);
    expect(v.quotesByStatus.find((q) => q.status === "draft")!.quoteCount).toBe(2);
    expect(Number(v.quotesByStatus.find((q) => q.status === "draft")!.value)).toBe(300);
    expect(v.quotesByStatus.find((q) => q.status === "sent")!.quoteCount).toBe(0);
  });
});
