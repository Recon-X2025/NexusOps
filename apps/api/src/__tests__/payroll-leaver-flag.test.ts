/**
 * A leaver in the pay period is FLAGGED, never silently dropped.
 * ─────────────────────────────────────────────────────────────────────────────
 * The run pays PAYROLL_EMPLOYED_STATUSES {active, probation, on_leave}; resigned/terminated/
 * offboarded are not paid. But a leaver who worked part of the period is owed a final payslip
 * (Code on Wages: settlement within two working days). There is NO last-working-day recorded
 * anywhere — employees.endDate is declared but never written, and offboarding stores only a status —
 * so final pay CANNOT be computed and must not be guessed. The honest floor: flag each unpaid
 * leaver in the run's errors, naming them and the missing datum. These assert against the run's own
 * output (computePayrollRunTotals.errors / employeeCount), not a column.
 */
import { describe, it, expect, afterEach } from "vitest";
import { computePayrollRunTotals } from "../services/payroll-run-aggregates";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { employees, salaryStructures } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const CTC_ANNUAL = "240000"; // ESI-eligible; PF/ESI non-zero
const LEAVER_RE = /final payslip|last working day/i;

type Status = "active" | "probation" | "on_leave" | "resigned" | "terminated" | "offboarded";

describe("payroll run — leavers are flagged, not silently dropped", () => {
  const createdOrgs: string[] = [];
  afterEach(async () => {
    for (const id of createdOrgs) await cleanupOrg(id);
    createdOrgs.length = 0;
  });

  /** Fresh org, one shared structure, one fully-set employee per status; returns run totals. */
  async function run(statuses: Status[]) {
    const { orgId } = await seedTestOrg();
    createdOrgs.push(orgId);
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: "Std", ctcAnnual: CTC_ANNUAL, basicPercent: "40", effectiveFrom: new Date("2015-01-01") })
      .returning();
    for (const status of statuses) {
      const { userId } = await seedUser(orgId, { email: `lv-${nanoid(6)}@qa.coheronconnect.io` });
      await testDb()
        .insert(employees)
        .values({
          orgId,
          userId,
          employeeId: `EMP-${nanoid(5)}`,
          salaryStructureId: struct!.id, // a real employee who then left
          state: "Karnataka",
          startDate: new Date("2020-01-01"),
          status,
          taxRegime: "new",
        });
    }
    return computePayrollRunTotals(testDb(), orgId, 4, 2026);
  }

  it("an offboarded employee is NOT paid and IS named in the run's errors", async () => {
    const totals = await run(["active", "offboarded"]);

    expect(totals.employeeCount).toBe(1); // only the active employee is paid
    const leaverErr = totals.errors.find((e) => LEAVER_RE.test(e.message));
    expect(leaverErr).toBeTruthy(); // RED before: the leaver was silently dropped, no error
    expect(leaverErr!.message).toMatch(/offboarded/);
  });

  it("resigned and terminated employees are flagged too, and none are paid", async () => {
    const totals = await run(["resigned", "terminated"]);

    expect(totals.employeeCount).toBe(0);
    expect(totals.errors.filter((e) => LEAVER_RE.test(e.message))).toHaveLength(2);
  });

  it("an active-only org is unchanged — no leaver flag, active still paid (byte-identity)", async () => {
    const totals = await run(["active"]);

    expect(totals.employeeCount).toBe(1);
    expect(totals.totalGross).toBeGreaterThan(0);
    expect(totals.errors.filter((e) => LEAVER_RE.test(e.message))).toHaveLength(0);
  });

  it("probation still paid identically to active (last pass must not regress)", async () => {
    const baseline = await run(["active"]);
    const withProbation = await run(["active", "probation"]);

    expect(withProbation.employeeCount).toBe(2);
    expect(withProbation.totalGross).toBe(2 * baseline.totalGross);
    expect(withProbation.totalPfEmployee).toBe(2 * baseline.totalPfEmployee);
    expect(withProbation.totalEsiEmployee).toBe(2 * baseline.totalEsiEmployee);
    // and a leaver added to that run is flagged, not paid
    const mixed = await run(["active", "probation", "offboarded"]);
    expect(mixed.employeeCount).toBe(2);
    expect(mixed.errors.filter((e) => LEAVER_RE.test(e.message))).toHaveLength(1);
  });
});
