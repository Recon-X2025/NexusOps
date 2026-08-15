/**
 * A3 — every priority offered by the New Work Order form must be accepted.
 *
 * The web form sent "3_medium" while the router enum is
 * 1_critical | 2_high | 3_moderate | 4_low | 5_planning, so choosing the middle
 * priority — the default choice for routine work — failed validation with 400.
 *
 * Note this is deliberately NOT shared with tickets: apps/web .../tickets/new
 * uses "3_medium" legitimately as a FORM value that its urgency x impact matrix
 * maps to the DB enum. The two vocabularies must stay separate.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, seedUser, cleanupOrg, createMockContext } from "./helpers";
import { workOrdersRouter } from "../routers/work-orders";

const WO_PRIORITIES = ["1_critical", "2_high", "3_moderate", "4_low", "5_planning"] as const;

describe("Work order creation — priority vocabulary", () => {
  let orgId: string;
  let caller: ReturnType<typeof workOrdersRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    caller = workOrdersRouter.createCaller(createMockContext(userId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  it("accepts all five router priorities", async () => {
    for (const priority of WO_PRIORITIES) {
      const wo = await caller.create({
        shortDescription: `Replace UPS battery (${priority})`,
        priority,
      });
      expect(wo.priority).toBe(priority);
    }
  });

  it("every priority value the web form offers is a value the router accepts", () => {
    // Mirrors PRIORITIES in apps/web/src/app/app/work-orders/new/page.tsx.
    const FORM_VALUES = ["1_critical", "2_high", "3_moderate", "4_low"];
    for (const value of FORM_VALUES) {
      expect(WO_PRIORITIES).toContain(value as (typeof WO_PRIORITIES)[number]);
    }
  });

  it("rejects the ticket vocabulary's 3_medium (proves the two enums are distinct)", async () => {
    await expect(
      caller.create({
        shortDescription: "Should not be accepted",
        priority: "3_medium" as never,
      }),
    ).rejects.toThrow();
  });
});
