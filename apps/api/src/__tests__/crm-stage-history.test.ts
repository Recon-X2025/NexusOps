/**
 * CRM Phase 2 — item 6: deal stage history is written at BOTH transition sites.
 *
 * `crm_deals.stage` carries the CURRENT stage only, so time-in-stage, stage
 * ageing and conversion-between-stages are uncomputable — not unreported,
 * uncomputable. `crm_deal_stage_history` starts that record, forward from
 * migration 0099.
 *
 * The load-bearing assertion here is that BOTH `crm.deals.movePipeline` (the
 * canonical procedure) and `crm.movePipeline` (the deprecated flat twin) write
 * a row. They are copy-pasted bodies; a history write on only one of them would
 * lose every move made through the other, and nothing downstream could detect
 * the gap — the table would simply under-report, plausibly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmDeals, crmDealStageHistory, eq, asc } from "@coheronconnect/db";

describe("deal stage history", () => {
  let orgId: string;
  let adminId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;
  let dealId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    caller = crmRouter.createCaller(createMockContext(adminId, orgId));

    const [deal] = await testDb()
      .insert(crmDeals)
      .values({ orgId, title: "History deal", stage: "prospect", value: "100000" } as never)
      .returning();
    dealId = deal!.id;
  });

  const history = () =>
    testDb()
      .select()
      .from(crmDealStageHistory)
      .where(eq(crmDealStageHistory.dealId, dealId))
      .orderBy(asc(crmDealStageHistory.changedAt));

  it("starts EMPTY — the table is not backfilled", async () => {
    expect(await history()).toHaveLength(0);
  });

  it("records a move made through the CANONICAL procedure", async () => {
    await caller.deals.movePipeline({ id: dealId, stage: "qualification" });

    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fromStage).toBe("prospect");
    expect(rows[0]!.toStage).toBe("qualification");
    expect(rows[0]!.orgId).toBe(orgId);
    expect(rows[0]!.changedBy).toBe(adminId);
    expect(rows[0]!.changedAt).toBeInstanceOf(Date);
  });

  it("records a move made through the DEPRECATED FLAT TWIN — the trap", async () => {
    await caller.movePipeline({ id: dealId, stage: "qualification" });

    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fromStage).toBe("prospect");
    expect(rows[0]!.toStage).toBe("qualification");
    expect(rows[0]!.changedBy).toBe(adminId);
  });

  it("accumulates BOTH sites' moves onto one chain, in order", async () => {
    await caller.deals.movePipeline({ id: dealId, stage: "qualification" }); // canonical
    await caller.movePipeline({ id: dealId, stage: "proposal" });            // deprecated twin
    await caller.deals.movePipeline({ id: dealId, stage: "negotiation" });   // canonical

    const rows = await history();
    expect(rows.map((r) => [r.fromStage, r.toStage])).toEqual([
      ["prospect", "qualification"],
      ["qualification", "proposal"],
      ["proposal", "negotiation"],
    ]);

    // The chain is contiguous: each row's `from` is the previous row's `to`.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.fromStage).toBe(rows[i - 1]!.toStage);
    }
    // …and it ends where the deal actually is.
    const [deal] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, dealId));
    expect(deal!.stage).toBe(rows[rows.length - 1]!.toStage);
  });

  it("writes NOTHING when the stage does not actually change", async () => {
    // Re-asserting the current stage is accepted by movePipeline but is not a
    // transition. A row whose fromStage equals its toStage would inflate every
    // count and corrupt time-in-stage the moment anything reads this table.
    await caller.deals.movePipeline({ id: dealId, stage: "prospect" });
    await caller.movePipeline({ id: dealId, stage: "prospect" });

    expect(await history()).toHaveLength(0);
  });

  it("records the reverse move too — history is what happened, not what should have", async () => {
    await caller.deals.movePipeline({ id: dealId, stage: "negotiation" });
    await caller.deals.movePipeline({ id: dealId, stage: "qualification" });

    const rows = await history();
    expect(rows.map((r) => [r.fromStage, r.toStage])).toEqual([
      ["prospect", "negotiation"],
      ["negotiation", "qualification"],
    ]);
  });

  it("does NOT record deal creation — an opening stage is not a transition", async () => {
    const created = await caller.deals.create({ title: "Fresh", stage: "qualification" });
    const rows = await testDb()
      .select()
      .from(crmDealStageHistory)
      .where(eq(crmDealStageHistory.dealId, created!.id));
    expect(rows).toHaveLength(0);
  });
});
