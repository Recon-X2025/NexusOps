/**
 * Three product decisions on the deal stage, pinned.
 *
 *  1. STAGE DEFAULT PROBABILITY. A rep opening a deal had to invent the number,
 *     so across seven tenants it would be blank or 50 for everything and the
 *     weighted-pipeline tile would be computed from noise. The default now comes
 *     from `crm_pipeline_stages.probability` — a DEFAULT, never a lock.
 *  2. LOST REASON. `crm_deals.lostReason` existed as a column only the analytics
 *     seed had ever written. It is now required on the move to closed_lost.
 *  3. CLOSED-WON GUARD. A deal could reach closed_won carrying no value and no
 *     expected close, making every forecast figure wrong from the moment it
 *     landed. Rejected at the API, naming what is missing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { DEFAULT_PIPELINE_STAGES } from "../routers/crm/deals";
import { crmDeals, crmPipelineStages, eq, and } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("CRM deal stage rules", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, {
      email: `stage-${nanoid(6)}@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
    }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  /** A deal that satisfies the closed-won guard. */
  async function completeDeal(value = "100000") {
    return caller.deals.create({
      title: `Deal ${nanoid(4)}`,
      value,
      expectedClose: "2026-12-31",
      stage: "negotiation",
    } as never) as Promise<{ id: string }>;
  }

  // ── 1 · stage default probability ────────────────────────────────────────
  describe("stage default probability", () => {
    it("seeds all seven stages with the factory defaults, rising monotonically", async () => {
      const stages = await caller.deals.stages.list();
      const byKey = new Map(stages.map((s) => [s.key, s.probability]));

      expect(byKey.get("prospect")).toBe(10);
      expect(byKey.get("qualification")).toBe(25);
      expect(byKey.get("proposal")).toBe(50);
      expect(byKey.get("negotiation")).toBe(70);
      expect(byKey.get("verbal_commit")).toBe(90);
      // Terminal stages are definitional, not estimates.
      expect(byKey.get("closed_won")).toBe(100);
      expect(byKey.get("closed_lost")).toBe(0);

      // Monotonic across the open stages, in rank order.
      const open = stages
        .filter((s) => !s.key.startsWith("closed_"))
        .sort((a, b) => a.rank - b.rank)
        .map((s) => s.probability);
      for (let i = 1; i < open.length; i++) {
        expect(open[i]!).toBeGreaterThan(open[i - 1]!);
      }
    });

    it("the factory constant and the migration backfill agree", () => {
      // The two live in different files and MUST stay in step; drift would leave
      // orgs created before 0089 behaving differently from those created after.
      const expected: Record<string, number> = {
        prospect: 10, qualification: 25, proposal: 50, negotiation: 70,
        verbal_commit: 90, closed_won: 100, closed_lost: 0,
      };
      for (const s of DEFAULT_PIPELINE_STAGES) {
        expect(s.probability, s.key).toBe(expected[s.key]);
      }
    });

    it("an admin can change a stage's probability, and it persists", async () => {
      const before = await caller.deals.stages.list();
      const draft = before.map((s) => ({
        key: s.key as never, label: s.label, color: s.color, rank: s.rank, active: s.active,
        probability: s.key === "proposal" ? 40 : s.probability,
      }));
      await caller.deals.stages.update({ stages: draft } as never);

      const [row] = await testDb().select().from(crmPipelineStages)
        .where(and(eq(crmPipelineStages.orgId, orgId), eq(crmPipelineStages.key, "proposal")));
      expect(row?.probability).toBe(40);
    });

    it("an update that omits probability leaves the configured value alone", async () => {
      // An older caller sending only label/colour/rank/active must not silently
      // reset a tenant's tuned probability back to a default.
      const before = await caller.deals.stages.list();
      const tuned = before.map((s) => ({
        key: s.key as never, label: s.label, color: s.color, rank: s.rank, active: s.active,
        probability: s.key === "negotiation" ? 65 : s.probability,
      }));
      await caller.deals.stages.update({ stages: tuned } as never);

      const withoutProbability = before.map((s) => ({
        key: s.key as never, label: s.label, color: s.color, rank: s.rank, active: s.active,
      }));
      await caller.deals.stages.update({ stages: withoutProbability } as never);

      const [row] = await testDb().select().from(crmPipelineStages)
        .where(and(eq(crmPipelineStages.orgId, orgId), eq(crmPipelineStages.key, "negotiation")));
      expect(row?.probability).toBe(65);
    });

    it("weightedValue computes from whatever probability lands on the deal", async () => {
      const deal = await caller.deals.create({
        title: `W ${nanoid(4)}`, value: "200000", probability: 70, expectedClose: "2026-12-31",
      } as never) as { id: string };
      const [row] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, deal.id));
      expect(Number(row?.weightedValue)).toBe(140000); // 200000 × 0.70
    });

    it("a MOVE never rewrites the probability the rep set", async () => {
      // The stage default seeds a NEW deal only. Rewriting it on a move would
      // change the forecast under the rep without them touching anything.
      const deal = await caller.deals.create({
        title: `M ${nanoid(4)}`, value: "100000", probability: 33,
        expectedClose: "2026-12-31", stage: "prospect",
      } as never) as { id: string };

      await caller.deals.movePipeline({ id: deal.id, stage: "verbal_commit" });

      const [row] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, deal.id));
      expect(row?.stage).toBe("verbal_commit");
      expect(row?.probability).toBe(33);              // not 90
      expect(Number(row?.weightedValue)).toBe(33000); // and the forecast is unchanged
    });
  });

  // ── 2 · lost reason ──────────────────────────────────────────────────────
  describe("lost reason", () => {
    it("REFUSES a move to closed_lost with no reason", async () => {
      const deal = await completeDeal();
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "closed_lost" }))
        .rejects.toThrow(/reason is required/i);
    });

    it("captures and persists the reason", async () => {
      const deal = await completeDeal();
      await caller.deals.movePipeline({
        id: deal.id, stage: "closed_lost", lostReason: "Lost to a competitor",
      });
      const [row] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, deal.id));
      expect(row?.stage).toBe("closed_lost");
      expect(row?.lostReason).toBe("Lost to a competitor");
      expect(row?.closedAt).toBeTruthy();
    });

    it("stores free text verbatim when the rep chooses Other", async () => {
      // "Other" is never itself stored — what the rep typed is.
      const deal = await completeDeal();
      await caller.deals.movePipeline({
        id: deal.id, stage: "closed_lost", lostReason: "Procurement froze all vendor onboarding",
      });
      const [row] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, deal.id));
      expect(row?.lostReason).toBe("Procurement froze all vendor onboarding");
    });

    it("moving back OUT of closed_lost clears the reason", async () => {
      const deal = await completeDeal();
      await caller.deals.movePipeline({ id: deal.id, stage: "closed_lost", lostReason: "Timing — revisit later" });
      await caller.deals.movePipeline({ id: deal.id, stage: "negotiation" });
      const [row] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, deal.id));
      expect(row?.stage).toBe("negotiation");
      // A lost reason on a live deal describes a conclusion that no longer holds.
      expect(row?.lostReason).toBeNull();
    });

    it("no other transition demands a reason", async () => {
      const deal = await completeDeal();
      for (const stage of ["prospect", "qualification", "proposal", "negotiation", "verbal_commit"] as const) {
        await expect(caller.deals.movePipeline({ id: deal.id, stage })).resolves.toBeDefined();
      }
    });

    it("is enforced on the deprecated flat path too", async () => {
      const deal = await completeDeal();
      await expect(caller.movePipeline({ id: deal.id, stage: "closed_lost" } as never))
        .rejects.toThrow(/reason is required/i);
    });
  });

  // ── 3 · closed-won guard ─────────────────────────────────────────────────
  describe("closed-won guard", () => {
    it("REJECTS a close with no value, naming the value", async () => {
      const deal = await caller.deals.create({
        title: `NV ${nanoid(4)}`, expectedClose: "2026-12-31",
      } as never) as { id: string };
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "closed_won" }))
        .rejects.toThrow(/deal value/i);
    });

    it("REJECTS a close with no expected close, naming that", async () => {
      const deal = await caller.deals.create({
        title: `NC ${nanoid(4)}`, value: "50000",
      } as never) as { id: string };
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "closed_won" }))
        .rejects.toThrow(/expected close date/i);
    });

    it("names BOTH when both are missing", async () => {
      const deal = await caller.deals.create({ title: `NB ${nanoid(4)}` } as never) as { id: string };
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "closed_won" }))
        .rejects.toThrow(/deal value and an expected close date/i);
    });

    it("treats a zero value as missing — a won deal worth ₹0 is not a win", async () => {
      const deal = await caller.deals.create({
        title: `Z ${nanoid(4)}`, value: "0", expectedClose: "2026-12-31",
      } as never) as { id: string };
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "closed_won" }))
        .rejects.toThrow(/deal value/i);
    });

    it("ALLOWS the close when both are present", async () => {
      const deal = await completeDeal("250000");
      const moved = await caller.deals.movePipeline({ id: deal.id, stage: "closed_won" });
      expect(moved?.stage).toBe("closed_won");
      const [row] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, deal.id));
      expect(row?.stage).toBe("closed_won");
      expect(row?.closedAt).toBeTruthy();
    });

    it("does NOT touch a deal already sitting in closed_won without a value", async () => {
      // Existing rows must not break and nothing may be rewritten. The guard is
      // on the TRANSITION, so a row written before it existed is simply left be.
      const [legacy] = await testDb().insert(crmDeals).values({
        orgId, title: `Legacy ${nanoid(4)}`, ownerId: userId, stage: "closed_won",
      }).returning();

      const listed = await caller.deals.list({ limit: 100 });
      const found = listed.find((d) => d.id === legacy!.id);
      expect(found?.stage).toBe("closed_won");
      expect(found?.value).toBeNull();

      const [after] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, legacy!.id));
      expect(after?.stage).toBe("closed_won");
      expect(after?.value).toBeNull();
    });

    it("other transitions are unaffected by the guard", async () => {
      const deal = await caller.deals.create({ title: `U ${nanoid(4)}` } as never) as { id: string };
      // No value, no expected close — every non-won move still works.
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "qualification" })).resolves.toBeDefined();
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "verbal_commit" })).resolves.toBeDefined();
    });

    it("the approval tier still fires above the threshold", async () => {
      // The guard runs BEFORE the tier check, so a complete-but-unapproved deal
      // must still be stopped by the tier — the new guard must not shadow it.
      const deal = await completeDeal("9000000"); // above the 5,000,000 executive line
      await expect(caller.deals.movePipeline({ id: deal.id, stage: "closed_won" }))
        .rejects.toThrow(/approval/i);
    });

    it("is enforced on the deprecated flat path too", async () => {
      const deal = await caller.deals.create({ title: `DF ${nanoid(4)}` } as never) as { id: string };
      await expect(caller.movePipeline({ id: deal.id, stage: "closed_won" } as never))
        .rejects.toThrow(/deal value/i);
    });
  });
});
