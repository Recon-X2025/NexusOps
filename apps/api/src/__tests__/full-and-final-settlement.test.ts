/**
 * FULL-AND-FINAL — compose the exit settlement as a SEPARATE event.
 * ─────────────────────────────────────────────────────────────────────────────
 * A leaver's settlement = last salary (pro-rated to endDate) + leave encashment (annual only)
 * + gratuity (if eligible ≥5y) − recoveries (notice / advance / asset), floored at zero with any
 * excess surfaced as `unrecoveredShortfall`. It is computed OUTSIDE the payroll run (the two-
 * working-day clock cannot wait for the payroll calendar), stores every component AS IT WAS at
 * settlement (an employee disputes a PART, not the total), and is IDEMPOTENT — a second settle is
 * a CONFLICT, so money never moves twice.
 *
 * These tests assert: (1) the component figures + total persist; (2) the encashability filter
 * holds THROUGH the composition (sick leave is not encashed even here); (3) gratuity gates on
 * service and pays on Basic+DA; (4) settling twice pays once — the load-bearing one; (5) recoveries
 * over the payable parts floor at zero and surface the shortfall; (6) a bare leaver settles on last
 * salary alone; (7) under-ceiling gratuity/encashment carry no taxable excess (and the pure
 * composer surfaces it when they DO exceed the ceiling).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
// helpers imports the full appRouter (../routers) — keep it FIRST so the router graph evaluates
// in the correct order before the settlement router is pulled in on its own.
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { settlementRouter } from "../routers/settlement";
import { buildEmployeePayrollInput, calendarToFyMonth, computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { computeEmployeePayslip } from "../lib/payroll-cycle";
import { composeSettlement } from "@coheronconnect/payroll-math";
import {
  employees,
  salaryStructures,
  leavePolicies,
  leaveBalances,
  leaveAccrualEvents,
  finalSettlements,
  offboardingDetails,
  eq,
  and,
} from "@coheronconnect/db";
import { nanoid } from "nanoid";

const CTC = 1_200_000; // basic 40% → monthly basic+DA = ₹40,000 (the gratuity/encashment wage base)
const WAGES = 40_000;
const END = "2026-04-30"; // full final April → last salary is a whole month (no proration confound)
const END_YEAR = 2026;

describe("FULL-AND-FINAL: compose the settlement", () => {
  let orgId: string;
  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  /** Seed an employee + structure. startDate drives the gratuity service gate. */
  async function seedEmp(startDate: string, over: Partial<typeof employees.$inferInsert> = {}) {
    const { userId } = await seedUser(orgId, { email: `ff-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId, structureName: "Std", ctcAnnual: String(CTC), basicPercent: "40",
        hraPercentOfBasic: "50", effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId, userId, employeeId: `EMP-${nanoid(4)}`, salaryStructureId: struct!.familyId,
        startDate: new Date(startDate), endDate: new Date(END), status: "offboarded",
        state: "Karnataka", taxRegime: "new", ...over,
      })
      .returning();
    return { emp: emp!, struct: struct!, userId };
  }

  /** Seed a leave policy + a current-year balance for one type. */
  async function seedLeave(
    employeeId: string,
    type: string,
    encashable: boolean,
    totalDays: number,
    usedDays = 0,
    pendingDays = 0,
  ) {
    await testDb().insert(leavePolicies).values({
      orgId, type: type as any, annualEntitlementDays: String(totalDays), encashable,
    }).onConflictDoNothing();
    await testDb().insert(leaveBalances).values({
      employeeId, type: type as any, year: END_YEAR,
      totalDays: String(totalDays), usedDays: String(usedDays), pendingDays: String(pendingDays),
    });
  }

  /** The last salary the settlement will record — the EXIT-DATE engine's net for the final month. */
  function expectedLastSalary(emp: typeof employees.$inferSelect, struct: typeof salaryStructures.$inferSelect) {
    return computeEmployeePayslip(buildEmployeePayrollInput(emp, struct, 4, END_YEAR), calendarToFyMonth(4)).netPay;
  }

  const caller = (userId: string) => settlementRouter.createCaller(createMockContext(userId, orgId));

  // TEST 1 — the composition persists every component and the derived total.
  it("stores each component (last salary, encashment, gratuity) and the total", async () => {
    const { emp, struct, userId } = await seedEmp("2018-01-01"); // ~8y3m service
    await seedLeave(emp.id, "annual", true, 12);
    const lastSalary = expectedLastSalary(emp, struct);

    const row = await caller(userId).settle({ employeeId: emp.id, advanceRecovery: 5_000 });

    // gratuity: 8y (3m trailing rounds down) → 15/26 × 40,000 × 8
    const gratuity = Math.round((15 / 26) * WAGES * 8);
    // encashment: 12 available days × round(40,000/26)
    const encash = 12 * Math.round(WAGES / 26);
    expect(Number(row.gratuity)).toBe(gratuity);
    expect(Number(row.leaveEncashment)).toBe(encash);
    expect(Number(row.lastSalary)).toBe(lastSalary);
    expect(Number(row.grossSettlement)).toBe(lastSalary + encash + gratuity);
    expect(Number(row.totalRecoveries)).toBe(5_000);
    expect(Number(row.netSettlement)).toBe(lastSalary + encash + gratuity - 5_000);
    expect(Number(row.unrecoveredShortfall)).toBe(0);
    // The whole thing is persisted, not just returned.
    const [persisted] = await testDb().select().from(finalSettlements).where(eq(finalSettlements.employeeId, emp.id));
    expect(persisted).toBeTruthy();
    expect(Number(persisted!.netSettlement)).toBe(lastSalary + encash + gratuity - 5_000);
  });

  // TEST 2 — the encashability filter holds THROUGH the composition: sick leave is never encashed.
  it("encashes annual leave but not sick leave, even through the settlement", async () => {
    const { emp, userId } = await seedEmp("2018-01-01");
    await seedLeave(emp.id, "annual", true, 10);
    await seedLeave(emp.id, "sick", false, 8);

    const row = await caller(userId).settle({ employeeId: emp.id });

    expect(Number(row.leaveEncashment)).toBe(10 * Math.round(WAGES / 26)); // annual only
    const events = await testDb().select().from(leaveAccrualEvents)
      .where(and(eq(leaveAccrualEvents.employeeId, emp.id), eq(leaveAccrualEvents.eventType, "encashment")));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("annual"); // sick produced no encashment event
  });

  // TEST 3 — gratuity gates on 5 years' service.
  it("pays no gratuity below 5 years' service", async () => {
    const { emp, userId } = await seedEmp("2023-06-01"); // ~2y10m at 2026-04-30
    const row = await caller(userId).settle({ employeeId: emp.id });
    expect(Number(row.gratuity)).toBe(0);
  });

  // TEST 4 — THE load-bearing one: settling twice pays once.
  it("is idempotent — a second settle is rejected and money moves only once", async () => {
    const { emp, userId } = await seedEmp("2018-01-01");
    await seedLeave(emp.id, "annual", true, 12);

    const first = await caller(userId).settle({ employeeId: emp.id });
    await expect(caller(userId).settle({ employeeId: emp.id })).rejects.toThrow(/already settled/i);

    // Exactly one settlement, one encashment event, and the balance drawn down exactly once.
    const rows = await testDb().select().from(finalSettlements).where(eq(finalSettlements.employeeId, emp.id));
    expect(rows).toHaveLength(1);
    const events = await testDb().select().from(leaveAccrualEvents)
      .where(and(eq(leaveAccrualEvents.employeeId, emp.id), eq(leaveAccrualEvents.eventType, "encashment")));
    expect(events).toHaveLength(1);
    const [bal] = await testDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.type, "annual")));
    expect(Number(bal!.totalDays)).toBe(0); // 12 − 12, not 12 − 24
    expect(Number(first.leaveEncashment)).toBe(12 * Math.round(WAGES / 26));
  });

  // TEST 5 — recoveries exceeding the payable parts floor at zero and surface the shortfall.
  it("floors net at zero and surfaces the unrecovered shortfall when recoveries exceed the settlement", async () => {
    const { emp, struct, userId } = await seedEmp("2023-06-01"); // <5y → no gratuity; no leave seeded
    const lastSalary = expectedLastSalary(emp, struct);

    const row = await caller(userId).settle({ employeeId: emp.id, assetRecovery: 10_000_000 });

    expect(Number(row.grossSettlement)).toBe(lastSalary); // last salary alone
    expect(Number(row.netSettlement)).toBe(0); // floored, never negative
    expect(Number(row.unrecoveredShortfall)).toBe(10_000_000 - lastSalary); // the debt, not dropped
  });

  // TEST 6 — a bare leaver (no gratuity, no leave) settles on last salary alone.
  it("settles on last salary alone when there is no gratuity or leave", async () => {
    const { emp, struct, userId } = await seedEmp("2023-06-01"); // <5y, no leave
    const lastSalary = expectedLastSalary(emp, struct);
    const row = await caller(userId).settle({ employeeId: emp.id });
    expect(Number(row.gratuity)).toBe(0);
    expect(Number(row.leaveEncashment)).toBe(0);
    expect(Number(row.grossSettlement)).toBe(lastSalary);
    expect(Number(row.netSettlement)).toBe(lastSalary);
  });

  // TEST 7 — statutory: under-ceiling parts carry no taxable excess; the composer splits it out when they do.
  it("surfaces no taxable excess under ceiling, sets ffStatus, and the pure composer splits the excess above it", async () => {
    const { emp, userId } = await seedEmp("2018-01-01");
    await seedLeave(emp.id, "annual", true, 12);
    // Seed an offboarding record so the semi-computed F&F status can be asserted.
    await testDb().insert(offboardingDetails).values({ orgId, employeeId: emp.id, name: "X", ffStatus: "pending" });

    const row = await caller(userId).settle({ employeeId: emp.id });
    expect(Number(row.taxableGratuity)).toBe(0); // gratuity ≪ ₹20L s.10(10)
    expect(Number(row.taxableEncashment)).toBe(0); // encashment ≪ ₹25L s.10(10AA)
    expect(Number(row.tds)).toBe(0);
    const [off] = await testDb().select().from(offboardingDetails).where(eq(offboardingDetails.employeeId, emp.id));
    expect(off!.ffStatus).toBe("completed"); // semi-computed: settling stamps completion

    // Above the ceilings the excess is surfaced, not hidden (pure-composer contract).
    const big = composeSettlement({ lastSalary: 0, leaveEncashment: 3_000_000, gratuity: 2_500_000 });
    expect(big.taxableGratuity).toBe(2_500_000 - 2_000_000);
    expect(big.taxableEncashment).toBe(3_000_000 - 2_500_000);
  });

  // TEST 8 — the EXIT-DATE ↔ FULL-AND-FINAL reconciliation: the settlement pays the last salary
  // (within the exit clock), so a SETTLED leaver must drop out of the monthly run — otherwise the
  // run pays that final month a second time. An un-settled leaver still rides the run (EXIT-DATE).
  it("removes a settled leaver from the payroll run (no double-paid last salary), but not an un-settled one", async () => {
    // April leaver, un-settled → still selected + paid pro-rata by the run (EXIT-DATE safety net).
    const before = await seedEmp("2018-01-01", { endDate: new Date("2026-04-20") });
    let totals = await computePayrollRunTotals(testDb(), orgId, 4, END_YEAR);
    expect(totals.employeeCount).toBe(1);

    // Once settled, the settlement is their final payment — the run must no longer select them.
    await caller(before.userId).settle({ employeeId: before.emp.id });
    totals = await computePayrollRunTotals(testDb(), orgId, 4, END_YEAR);
    expect(totals.employeeCount).toBe(0); // no second payment of the last month
  });
});
