/**
 * EPFO ECR — the reported wage must be the wage the contribution was computed on.
 * ─────────────────────────────────────────────────────────────────────────────
 * The defect: `hr.payroll.generateECR` built its member lines inline from the RAW
 * BASIC —
 *     pfWages = min(Number(slip.basic), 15000)   → epfWages / epsWages / edliWages
 * — while the contribution beside it (`slip.pfEmployee`) had been computed on the
 * RESOLVED wage base (the Labour-Codes 50% clamp). Those are different numbers.
 *
 * This suite drives the REAL chain — `calculateLabourCodeWageBase` → `computePF` →
 * `buildEcrLine` — rather than hand-feeding `pfWageBase`, because hand-feeding it
 * would prove only that the builder echoes its input. The point is that the wage
 * the ECR reports and the wage the money was computed on are the same number by
 * construction.
 *
 * The golden pair is the whole defect: two pay structures that resolve the SAME
 * wage base must file identical figures. Under the old code the reported wage
 * tracked basic (₹8,000 vs ₹16,000) while the contribution stayed at ₹1,200 —
 * 15% in one case and 8% in the other, from one and the same real base.
 */
import { describe, it, expect } from "vitest";
import { buildEcrLine, type EcrPayslipInput } from "../lib/india/ecr-format";
import { calculateLabourCodeWageBase, computePF } from "@coheronconnect/payroll-math";

const ID = { uan: "100200300400", memberName: "Asha Rao" };

/** Run a pay structure through the real chain and produce the ECR line it yields. */
function ecrLineFor(basic: number, exclusions: number, over: Partial<EcrPayslipInput> = {}) {
  const { statutoryWageBase } = calculateLabourCodeWageBase(basic, exclusions);
  const pf = computePF(statutoryWageBase);
  const slip: EcrPayslipInput = {
    grossEarnings: basic + exclusions,
    // This is the field the defect was about: the STORED base the run computed on.
    pfWageBase: statutoryWageBase,
    pfEmployee: pf.employeePF,
    pfEmployerEps: pf.employerEPS,
    pfEmployerEpf: pf.employerEPF,
    lopDays: 0,
    month: 4,
    year: 2026,
    ...over,
  };
  return { line: buildEcrLine(slip, ID), statutoryWageBase, pf };
}

describe("ECR wage ≡ the wage the contribution was computed on", () => {
  // ── The golden pair ───────────────────────────────────────────────────────
  it("basic ₹8,000 + exclusions ₹12,000 → reports wages ₹10,000 and contribution ₹1,200", () => {
    // Core (8,000) sits BELOW half of total remuneration (10,000), so the add-back
    // lifts it UP to the half. Old code would have reported ₹8,000 here.
    const { line, statutoryWageBase } = ecrLineFor(8_000, 12_000);
    expect(statutoryWageBase).toBe(10_000);
    expect(line.epfWages).toBe(10_000);
    expect(line.employeeEpf).toBe(1_200);
  });

  it("basic ₹16,000 + exclusions ₹4,000 → the SAME ₹10,000 and ₹1,200", () => {
    // Core (16,000) sits ABOVE the half, so the clamp brings it back DOWN to it.
    // Old code would have reported ₹15,000 (raw basic, ceiling-capped) here.
    const { line, statutoryWageBase } = ecrLineFor(16_000, 4_000);
    expect(statutoryWageBase).toBe(10_000);
    expect(line.epfWages).toBe(10_000);
    expect(line.employeeEpf).toBe(1_200);
  });

  it("REALLOCATION IS INVISIBLE TO THE ECR — the pair files identical member figures", () => {
    // This is the defect stated as an invariant. Moving pay between basic and
    // allowances, at constant total remuneration, must not move the filed wage.
    const a = ecrLineFor(8_000, 12_000).line;
    const b = ecrLineFor(16_000, 4_000).line;
    expect(a.epfWages).toBe(b.epfWages);
    expect(a.epsWages).toBe(b.epsWages);
    expect(a.edliWages).toBe(b.edliWages);
    expect(a.employeeEpf).toBe(b.employeeEpf);
    expect(a.employerEps).toBe(b.employerEps);
    expect(a.employerEpf).toBe(b.employerEpf);
  });

  it("the contribution is 12% of the REPORTED wage, not of the raw basic", () => {
    // The arithmetic EPFO actually validates. 1,200 / 10,000 = 12%. Against the old
    // reported ₹8,000 it was 15%, which is the rejection.
    const { line } = ecrLineFor(8_000, 12_000);
    expect(line.employeeEpf / line.epfWages).toBeCloseTo(0.12, 5);
    expect((line.employerEps + line.employerEpf) / line.epfWages).toBeCloseTo(0.12, 5);
  });

  // ── The guard (2c) ────────────────────────────────────────────────────────
  describe("wage-vs-contribution plausibility guard", () => {
    it("REFUSES a line whose employer contribution is not a statutory share of the wage", () => {
      // Exactly the old defect's shape: ₹1,200 of dues declared against ₹8,000 of
      // wages — 15%, which EPFO rejects. Refuse locally instead of at the portal.
      expect(() =>
        buildEcrLine(
          {
            grossEarnings: 20_000, pfWageBase: 8_000, pfEmployee: 1_200,
            pfEmployerEps: 833, pfEmployerEpf: 367, lopDays: 0, month: 4, year: 2026,
          },
          ID,
        ),
      ).toThrow(/above the statutory 12% ceiling on the employer share/i);
    });

    it("ACCEPTS the 10% reduced rate — a fixed 12% test would reject those tenants", () => {
      // A notified reduced-rate establishment (organizations.pf_reduced_rate_reason).
      const pf = computePF(10_000, false, 15_000, 0, 0.10);
      const line = buildEcrLine(
        {
          grossEarnings: 20_000, pfWageBase: 10_000, pfEmployee: pf.employeePF,
          pfEmployerEps: pf.employerEPS, pfEmployerEpf: pf.employerEPF,
          lopDays: 0, month: 4, year: 2026,
        },
        ID,
      );
      expect(line.epfWages).toBe(10_000);
      expect(line.employerEps + line.employerEpf).toBe(1_000); // 10%
    });

    it("ACCEPTS a VPF line — the guard keys on the employer share, which VPF never touches", () => {
      // 12% + 8% VPF = ₹2,000 employee on a ₹10,000 base. The employee ratio is 20%,
      // which is legitimate; guarding the employee side would have rejected this.
      const pf = computePF(10_000, false, 15_000, 0.08);
      const line = buildEcrLine(
        {
          grossEarnings: 20_000, pfWageBase: 10_000, pfEmployee: pf.employeePF,
          pfEmployerEps: pf.employerEPS, pfEmployerEpf: pf.employerEPF,
          lopDays: 0, month: 4, year: 2026,
        },
        ID,
      );
      expect(line.employeeEpf).toBe(2_000);
      expect(line.employerEps + line.employerEpf).toBe(1_200); // employer unchanged by VPF
    });

    it("ACCEPTS a Para 26(6) line above the ceiling — the EPS cap legitimately lowers the ratio", () => {
      // Contribution on the uncapped base: EPS caps at 8.33% of ₹15,000 while employer
      // EPF is computed on the full base, so the employer total is ~9.9% of a ₹20,000
      // wage. A lower bound of 10% rejected exactly this, which is why the guard is
      // an upper bound only.
      const pf = computePF(20_000, true);
      const line = buildEcrLine(
        {
          grossEarnings: 40_000, pfWageBase: 20_000, pfEmployee: pf.employeePF,
          pfEmployerEps: pf.employerEPS, pfEmployerEpf: pf.employerEPF,
          lopDays: 0, month: 4, year: 2026,
        },
        ID,
      );
      expect((line.employerEps + line.employerEpf) / line.epfWages).toBeLessThan(0.10);
    });

    it("ACCEPTS a zero-wage month — no contribution, no false positive", () => {
      const line = buildEcrLine(
        {
          grossEarnings: 0, pfWageBase: 0, pfEmployee: 0,
          pfEmployerEps: 0, pfEmployerEpf: 0, lopDays: 0, month: 2, year: 2026,
        },
        ID,
      );
      expect(line.epfWages).toBe(0);
      expect(line.ncp).toBe(28); // whole month non-contributory
    });

    it("tolerates whole-rupee rounding at an awkward wage", () => {
      // ₹8,333 base: 12% = 999.96 → the split rounds and must not trip the guard.
      const pf = computePF(8_333);
      expect(() =>
        buildEcrLine(
          {
            grossEarnings: 20_000, pfWageBase: 8_333, pfEmployee: pf.employeePF,
            pfEmployerEps: pf.employerEPS, pfEmployerEpf: pf.employerEPF,
            lopDays: 0, month: 4, year: 2026,
          },
          ID,
        ),
      ).not.toThrow();
    });
  });

  // ── EPFO's documented wage relationships (2d) ─────────────────────────────
  describe("EPS ≤ EPF wages, and EDLI = min(EPF wages, ₹15,000)", () => {
    it("below the ceiling: EPS and EDLI both equal EPF wages", () => {
      const { line } = ecrLineFor(8_000, 12_000); // base 10,000
      expect(line.epsWages).toBe(10_000);
      expect(line.edliWages).toBe(10_000);
      expect(line.epsWages).toBeLessThanOrEqual(line.epfWages);
    });

    it("above the ceiling: EPF wages stay full, EPS and EDLI cap at ₹15,000", () => {
      // Para 26(6) — contribution on the uncapped base. The spec says the full wage
      // "should be entered" as EPF wages, so the ₹15,000 cap belongs on EPS/EDLI,
      // NOT on the reported EPF wage.
      const pf = computePF(20_000, true); // uncapped base
      const line = buildEcrLine(
        {
          grossEarnings: 40_000, pfWageBase: 20_000, pfEmployee: pf.employeePF,
          pfEmployerEps: pf.employerEPS, pfEmployerEpf: pf.employerEPF,
          lopDays: 0, month: 4, year: 2026,
        },
        ID,
      );
      expect(line.epfWages).toBe(20_000);
      expect(line.epsWages).toBe(15_000);
      expect(line.edliWages).toBe(15_000);
      expect(line.epsWages).toBeLessThanOrEqual(line.epfWages);
    });
  });
});
