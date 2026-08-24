/**
 * HIGH regression: the year-end close must NOT lapse comp-off.
 *
 * Comp-off (expiryMode window_weeks) expires on its own rolling per-earning
 * window, never at year-end. The annual close ran the normal cap-and-lapse over
 * it, forfeiting comp-off still inside its window. Now a window_weeks policy
 * carries its whole closing balance forward at year-end and lapses nothing; a
 * year_end policy still caps and lapses as before.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, seedUser, testDb } from "./helpers";
import { leaveAccrualRouter } from "../routers/leave-accrual";
import { employees, leavePolicies, leaveBalances } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const YEAR = 2025;

describe("year-end close does not lapse comp-off (HIGH regression)", () => {
  let orgId: string;
  let caller: any;
  let empId: string;

  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    caller = leaveAccrualRouter.createCaller(createMockContext(s.adminId, orgId));
    const { userId } = await seedUser(orgId);
    const [e] = await testDb()
      .insert(employees)
      .values({ orgId, userId, employeeId: `EMP-${nanoid(6)}`, status: "active", startDate: new Date("2020-01-01") })
      .returning();
    empId = e!.id;
  });

  const seedPolicy = (type: string, expiryMode: "year_end" | "window_weeks") =>
    testDb().insert(leavePolicies).values({
      orgId,
      type: type as never,
      annualEntitlementDays: "18",
      maxCarryForwardDays: "5", // cap below the closing balance, so a lapse WOULD occur
      yearEndTreatment: "forfeit",
      expiryMode: expiryMode as never,
      ...(expiryMode === "window_weeks" ? { expiryWindowWeeks: 12 } : {}),
    } as never);

  const seedBalance = (type: string) =>
    testDb().insert(leaveBalances).values({ employeeId: empId, type: type as never, year: YEAR, totalDays: "8", usedDays: "0" } as never);

  it("carries the full comp-off balance forward and lapses nothing", async () => {
    await seedPolicy("compensatory_off", "window_weeks");
    await seedBalance("compensatory_off");
    const res = await caller.close.run({ employeeId: empId, type: "compensatory_off", year: YEAR });
    // Closing 8, cap 5 — but window_weeks must NOT lapse at year-end.
    expect(res.carriedForward).toBe(8);
    expect(res.lapsed).toBe(0);
  });

  it("a year_end policy still caps and lapses the excess", async () => {
    await seedPolicy("annual", "year_end");
    await seedBalance("annual");
    const res = await caller.close.run({ employeeId: empId, type: "annual", year: YEAR });
    expect(res.carriedForward).toBe(5);
    expect(res.lapsed).toBe(3);
  });
});
