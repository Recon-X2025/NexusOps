/**
 * Employee statutory ingestion — fairness checks (C2-STRUCT / C1 / C3 enabler).
 * ─────────────────────────────────────────────────────────────────────────────
 * Proves the statutory determinants that previously had no way onto the employee
 * record now steer the payroll engine correctly, and that the silent Maharashtra
 * PT fallback is gone. Each block maps to a fairness check in the build brief:
 *
 *   (i)   state reaches the engine — Kerala resolves as Kerala, not Maharashtra
 *   (ii)  Maharashtra PT is gender-split (female nil to ₹25k; male from ₹7,501)
 *   (iii) any Tier-1 exemption flag ⇒ PT nil regardless of state/gross
 *   (iv)  born > 65 years before the pay period ⇒ PT nil (age from DOB)
 *   (vi)  isMetro true ⇒ 50% HRA threshold vs 40%
 *
 * Pure money-math (no DB). computePT/computeEmployeePayslip are re-exported from
 * @coheronconnect/payroll-math via apps/api/src/lib/*.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computePT, type PTContext } from "../lib/india-statutory-deductions";
import { computeHRAExemption } from "../lib/india-tax-engine";
import {
  computeEmployeePayslip,
  ageInYearsAt,
  type EmployeePayrollInput,
} from "../lib/payroll-cycle";
import {
  buildEmployeePayrollInput,
  calendarToFyMonth,
} from "../services/payroll-run-aggregates";
import { seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { employees, salaryStructures } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const APR = 1; // FY month 1

function makeEmp(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  return {
    id: "emp-1",
    name: "Test Employee",
    employeeCode: "NX-001",
    pan: "ABCDE1234F",
    uan: "100123456789",
    designation: "Engineer",
    department: "Engineering",
    state: "Maharashtra",
    isMetro: false,
    joiningDate: new Date("2024-04-01"),
    basicMonthly: 50_000,
    hraMonthly: 20_000,
    specialAllowance: 20_000,
    ltaAnnual: 30_000,
    regime: "NEW",
    section80C: 0, section80D: 0, section80CCD1B: 0,
    section80TTA: 0, section24b: 0, hraExemption: 0,
    otherExemptions: 0, rentPaid: 0,
    daysInMonth: 30, daysWorked: 30, lopDays: 0,
    overtime: 0, arrears: 0, bonus: 0,
    otherEarnings: 0, otherDeductions: 0,
    isVoluntaryHigherPF: false,
    previousEmployerIncome: 0, previousEmployerTDS: 0,
    ytdGross: 0, ytdPF: 0, ytdTDS: 0, ytdNetPay: 0,
    month: 4, year: 2026,
    ...overrides,
  };
}

// ── (i) State reaches the engine — Kerala is NOT filed as Maharashtra ───────────
describe("state ingestion: the Maharashtra fallback is gone", () => {
  it("a Kerala employee resolves PT for Kerala, not Maharashtra", () => {
    // Kerala is not in the PT slab tables yet, so a correct engine returns nil for
    // Kerala. The regression this guards: the old `state ?? 'Maharashtra'` fallback
    // would have charged ₹200 Maharashtra PT on this ₹50,000 gross. Nil ≠ ₹200 proves
    // the real state reached the engine.
    expect(computePT(50_000, "Kerala", APR).ptAmount).toBe(0);
    // Sanity: the same gross under Maharashtra DOES charge — so nil above is Kerala,
    // not a universally-zero engine.
    expect(computePT(50_000, "Maharashtra", APR).ptAmount).toBe(200);
  });

  it("Maharashtra with no gender context still charges the male slab (safe default)", () => {
    // Unstated gender must fall to the male bracket (CA ruling), never accidentally
    // the more generous female one.
    expect(computePT(8_000, "Maharashtra", APR).ptAmount).toBe(175);
  });
});

// ── (ii) Maharashtra PT is gender-split ────────────────────────────────────────
describe("Maharashtra PT gender split via PTContext", () => {
  const female: PTContext = { gender: "female" };
  const male: PTContext = { gender: "male" };

  it("female: nil to ₹25,000, ₹200 above", () => {
    expect(computePT(25_000, "Maharashtra", APR, undefined, female).ptAmount).toBe(0);
    expect(computePT(10_000, "Maharashtra", APR, undefined, female).ptAmount).toBe(0);
    expect(computePT(25_001, "Maharashtra", APR, undefined, female).ptAmount).toBe(200);
  });

  it("male: ₹175 at ₹8,000 (above the ₹7,500 nil ceiling)", () => {
    expect(computePT(8_000, "Maharashtra", APR, undefined, male).ptAmount).toBe(175);
  });

  it("gender 'other' resolves to the male slab", () => {
    expect(computePT(8_000, "Maharashtra", APR, undefined, { gender: "other" }).ptAmount).toBe(175);
  });
});

// ── ESI six-month membership carries through the payslip engine (C3) ───────────
describe("ESI membership carries through computeEmployeePayslip (C3)", () => {
  const JUN = 3; // mid-period FY month
  it("a retained member above the ceiling still contributes; a non-member above the ceiling stays out", () => {
    // makeEmp's pay scale is ~₹90k, well above the ₹21k ESI ceiling.
    const member = computeEmployeePayslip(makeEmp({ esiMemberAtPeriodStart: true, month: 6 }), JUN);
    expect(member.employeeESI).toBeGreaterThan(0); // retention → contributes despite high gross
    const nonMember = computeEmployeePayslip(makeEmp({ esiMemberAtPeriodStart: false, month: 6 }), JUN);
    expect(nonMember.employeeESI).toBe(0); // entry assessed, but wages > ceiling → no join
  });

  it("a boundary month re-assesses from gross, overriding a stale membership flag", () => {
    // April is a period boundary: ₹90k gross > ceiling ⇒ not a member, regardless of the flag.
    const apr = computeEmployeePayslip(makeEmp({ esiMemberAtPeriodStart: true, month: 4 }), APR);
    expect(apr.employeeESI).toBe(0);
  });
});

// ── (iii) Tier-1 exemption flag ⇒ PT nil in every state ────────────────────────
describe("Tier-1 PT exemption bypasses PT regardless of state/gross", () => {
  it("computePT returns nil + exempt when ctx.exempt is true (Maharashtra, high gross)", () => {
    const r = computePT(80_000, "Maharashtra", APR, undefined, { exempt: true });
    expect(r.ptAmount).toBe(0);
    expect(r.annualPT).toBe(0);
    expect(r.exempt).toBe(true);
  });

  it("armed-forces flag zeroes PT on the full payslip path", () => {
    const charged = computeEmployeePayslip(makeEmp({ state: "Maharashtra" }), APR);
    expect(charged.professionalTax).toBeGreaterThan(0); // control: normally charged

    const exempt = computeEmployeePayslip(
      makeEmp({ state: "Maharashtra", ptExemptArmedForces: true }),
      APR,
    );
    expect(exempt.professionalTax).toBe(0);
  });

  it("own-disability and dependent-disability flags each zero PT", () => {
    expect(
      computeEmployeePayslip(makeEmp({ ptExemptDisability: true }), APR).professionalTax,
    ).toBe(0);
    expect(
      computeEmployeePayslip(makeEmp({ ptExemptDependentDisability: true }), APR)
        .professionalTax,
    ).toBe(0);
  });
});

// ── (iv) Over-65 exemption derived from DOB ────────────────────────────────────
describe("over-65 PT exemption derived from date of birth", () => {
  it("ageInYearsAt counts a birthday as reached on the day", () => {
    expect(ageInYearsAt(new Date("1960-04-01"), new Date("2026-04-01"))).toBe(66);
    expect(ageInYearsAt(new Date("1960-04-02"), new Date("2026-04-01"))).toBe(65);
    expect(ageInYearsAt(null, new Date("2026-04-01"))).toBeNull();
  });

  it("born > 65 years before the pay period ⇒ PT nil", () => {
    // Pay period April 2026; DOB Jan 1960 ⇒ 66 at period ⇒ exempt.
    const over65 = computeEmployeePayslip(
      makeEmp({ dateOfBirth: new Date("1960-01-01"), month: 4, year: 2026 }),
      APR,
    );
    expect(over65.professionalTax).toBe(0);
  });

  it("exactly 65 (not yet over 65) is still charged", () => {
    // DOB April 1961 ⇒ 65 at April 2026 ⇒ NOT > 65 ⇒ charged.
    const exactly65 = computeEmployeePayslip(
      makeEmp({ state: "Maharashtra", dateOfBirth: new Date("1961-04-01"), month: 4, year: 2026 }),
      APR,
    );
    expect(exactly65.professionalTax).toBeGreaterThan(0);
  });
});

// ── (vi) Metro HRA threshold: 50% vs 40% ───────────────────────────────────────
// The 50%/40% split lives in `computeHRAExemption`, which is annual-basic based. Note:
// `computeEmployeePayslip` does NOT yet call this (it takes a caller-supplied
// `hraExemption`), so `isMetro` on the employee record does not currently reach the
// payslip's HRA relief — that wiring is a separate item. This checks the metro
// threshold at the unit where it actually lives.
describe("isMetro drives the 50% HRA exemption threshold (computeHRAExemption)", () => {
  it("metro caps the exemption at 50% of basic, non-metro at 40%", () => {
    // Signature: computeHRAExemption(basicAnnual, hraReceived, rentPaid, isMetro).
    // Drive rent and HRA high so the basic-% cap is the binding minimum of the three:
    //   a = hraReceived        = 900,000 (not the binder)
    //   b = rentPaid − 10%×basic = 1,200,000 − 60,000 = 1,140,000 (not the binder)
    //   c = 50%/40% × basic    = 300,000 metro / 240,000 non-metro (THE binder)
    const basicAnnual = 600_000; // ₹50,000/mo
    const hraReceived = 900_000;
    const rentPaid = 1_200_000;
    const metro = computeHRAExemption(basicAnnual, hraReceived, rentPaid, true);
    const nonMetro = computeHRAExemption(basicAnnual, hraReceived, rentPaid, false);
    expect(metro).toBe(300_000);
    expect(nonMetro).toBe(240_000);
    expect(metro).toBeGreaterThan(nonMetro);
  });
});

// ── Aggregate boundary: the Maharashtra fallback is removed, null state now errors ──
// buildEmployeePayrollInput is what the run-lock path calls per active employee. It
// used to coalesce a missing state to "Maharashtra"; per owner decision it now throws
// (the row is excluded with a per-employee error, the run continues) and passes the
// real state + the new statutory fields straight through.
describe("payroll-run-aggregates: state ingestion", () => {
  let orgId: string;
  const YEAR = 2026;
  const MONTH = 5; // May

  async function seedEmp(
    overrides: Partial<typeof employees.$inferInsert> = {},
  ): Promise<{ emp: typeof employees.$inferSelect; struct: typeof salaryStructures.$inferSelect }> {
    const { userId } = await seedUser(orgId, { email: `emp-${nanoid(6)}@qa.coheronconnect.io` });
    const [struct] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: "Std",
        ctcAnnual: "780000",
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    const [emp] = await testDb()
      .insert(employees)
      .values({
        orgId,
        userId,
        employeeId: `EMP-${nanoid(4)}`,
        salaryStructureId: struct!.id,
        startDate: new Date("2020-01-01"),
        status: "active",
        ...overrides,
      })
      .returning();
    return { emp: emp!, struct: struct! };
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("throws (no silent Maharashtra fallback) when the employee has no state", async () => {
    const { emp, struct } = await seedEmp({ state: null });
    expect(() => buildEmployeePayrollInput(emp, struct, MONTH, YEAR)).toThrow(/no state/i);
  });

  it("a Kerala employee's state reaches the engine as Kerala (not Maharashtra)", async () => {
    const { emp, struct } = await seedEmp({ state: "Kerala" });
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    expect(input.state).toBe("Kerala");
    // And the resulting slip charges Kerala PT (nil — Kerala is not in the slab tables),
    // NOT the ₹200 the old Maharashtra fallback would have produced at this gross.
    const slip = computeEmployeePayslip(input, calendarToFyMonth(MONTH));
    expect(slip.professionalTax).toBe(0);
  });

  it("threads gender / DOB / exemption flags through to the built input", async () => {
    const { emp, struct } = await seedEmp({
      state: "Maharashtra",
      gender: "female",
      dateOfBirth: new Date("1990-01-01"),
      ptExemptDisability: true,
    });
    const input = buildEmployeePayrollInput(emp, struct, MONTH, YEAR);
    expect(input.gender).toBe("female");
    expect(input.ptExemptDisability).toBe(true);
    expect(input.dateOfBirth).toEqual(new Date("1990-01-01"));
  });
});

// ── Unknown/misspelled state ⇒ visible ₹0 PT, not a silent nil ─────────────────
// A state typed as "Karnatak" (not "Karnataka") normalises to KARNATAK, matches no
// slab config, and yields ₹0 PT — the SAME number a genuinely non-levying state
// (Delhi) returns. That silent-nil is a plausible-wrong outcome nobody sees. computePT
// now flags the UNRESOLVED case with `unknownState: true`, while a KNOWN non-levying
// state stays silent. This is the same shape as the removed Maharashtra fallback: a
// wrong ₹0 that used to be indistinguishable from a right ₹0.
describe("unknown PT state is flagged, not silently nil", () => {
  it("a misspelled state (Karnatak) computes ₹0 PT AND sets unknownState", () => {
    const pt = computePT(50_000, "Karnatak", APR);
    expect(pt.ptAmount).toBe(0);
    expect(pt.unknownState).toBe(true);
  });

  it("the correctly-spelled state (Karnataka) resolves — PT levied, no flag", () => {
    const pt = computePT(50_000, "Karnataka", APR);
    expect(pt.ptAmount).toBeGreaterThan(0);
    expect(pt.unknownState).toBeUndefined();
  });

  it("a KNOWN non-levying state (Delhi) is ₹0 but NOT flagged unknown (stays silent)", () => {
    const pt = computePT(50_000, "Delhi", APR);
    expect(pt.ptAmount).toBe(0);
    // Delhi has a config with empty slabs — the ₹0 is correct, not unresolved.
    expect(pt.unknownState).toBeUndefined();
  });

  it("the unknownState flag rides through to the payslip's statutoryDeductions.pt", () => {
    const slip = computeEmployeePayslip(makeEmp({ state: "Karnatak" }), APR);
    expect(slip.professionalTax).toBe(0);
    expect(slip.statutoryDeductions.pt.unknownState).toBe(true);
    // A resolved state does not carry the flag.
    const ok = computeEmployeePayslip(makeEmp({ state: "Karnataka" }), APR);
    expect(ok.statutoryDeductions.pt.unknownState).toBeUndefined();
  });
});
