/**
 * A tenant must be able to run leave on day one.
 *
 * `leave_policies` was empty in every organisation, and nothing seeds it — so
 * `hr.leave.create` had no policy to reference and leave was unusable until an
 * admin hand-built each type. Startups will not do that; they take what ships.
 *
 * This seeds a defensible Indian baseline in one call, the same shape as the
 * existing `hr.holidays.seedIndiaHolidays`. Anything beyond the baseline —
 * sabbatical, study leave, menstrual leave, longer paternity — stays a policy
 * document, not a schema change.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "@coheronconnect/db";
import { leavePolicies } from "@coheronconnect/db";
import { appRouter } from "../routers";
import { seedFullOrg, makeContext, testDb, cleanupOrg } from "./helpers";

type Caller = ReturnType<typeof appRouter.createCaller>;

describe("Default leave policies give a tenant a working baseline", () => {
  let orgId: string;
  let caller: Caller;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = appRouter.createCaller(makeContext(seeded.adminId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  const read = async () =>
    testDb().select().from(leavePolicies).where(eq(leavePolicies.orgId, orgId));

  const ofType = async (t: string) => {
    const [row] = await testDb()
      .select()
      .from(leavePolicies)
      .where(and(eq(leavePolicies.orgId, orgId), eq(leavePolicies.type, t as never)));
    return row;
  };

  it("starts empty — this is the gap being closed", async () => {
    expect(await read()).toHaveLength(0);
  });

  it("seeds the baseline set in one call", async () => {
    const res = await caller.leaveAccrual.policy.seedDefaults();
    const rows = await read();
    expect(res.seeded).toBeGreaterThan(0);
    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(
      [
        "annual",
        "bereavement",
        "casual",
        "compensatory_off",
        "maternity",
        "paternity",
        "sick",
        "unpaid",
      ].sort(),
    );
  });

  it("gives maternity the statutory 26 weeks", async () => {
    await caller.leaveAccrual.policy.seedDefaults();
    // Maternity Benefit (Amendment) Act 2017 — 26 weeks = 182 days. This one is
    // law, not a preference, so it must not ship as a lower 'sensible default'.
    expect(Number((await ofType("maternity"))!.annualEntitlementDays)).toBe(182);
  });

  it("makes only earned leave encashable", async () => {
    await caller.leaveAccrual.policy.seedDefaults();
    expect((await ofType("annual"))!.encashable).toBe(true);
    for (const t of ["casual", "sick", "maternity", "paternity", "bereavement"]) {
      expect((await ofType(t))!.encashable).toBe(false);
    }
  });

  it("carries earned leave forward and lets the rest lapse", async () => {
    await caller.leaveAccrual.policy.seedDefaults();
    expect(Number((await ofType("annual"))!.maxCarryForwardDays)).toBeGreaterThan(0);
    expect(Number((await ofType("casual"))!.maxCarryForwardDays)).toBe(0);
    expect(Number((await ofType("sick"))!.maxCarryForwardDays)).toBe(0);
  });

  it("expires comp-off on a window, not at year end", async () => {
    await caller.leaveAccrual.policy.seedDefaults();
    const c = (await ofType("compensatory_off"))!;
    expect(c.expiryMode).toBe("window_weeks");
    expect(c.expiryWindowWeeks).toBeGreaterThan(0);
  });

  it("does not debit a balance for loss of pay", async () => {
    await caller.leaveAccrual.policy.seedDefaults();
    expect((await ofType("unpaid"))!.debitsBalance).toBe(false);
  });

  it("is idempotent and never overwrites a policy the tenant has tuned", async () => {
    await caller.leaveAccrual.policy.seedDefaults();
    await caller.leaveAccrual.policy.upsert({
      type: "annual",
      annualEntitlementDays: 24,
      maxCarryForwardDays: 45,
      encashable: true,
    } as never);

    const again = await caller.leaveAccrual.policy.seedDefaults();
    expect(again.seeded).toBe(0);

    // The tenant's own number survives a second seed.
    expect(Number((await ofType("annual"))!.annualEntitlementDays)).toBe(24);
    expect(await read()).toHaveLength(8);
  });

  it("leaves a real leave request able to reference a policy", async () => {
    await caller.leaveAccrual.policy.seedDefaults();
    const annual = await ofType("annual");
    expect(annual).toBeTruthy();
    expect(Number(annual!.annualEntitlementDays)).toBeGreaterThan(0);
  });
});
