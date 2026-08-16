/**
 * ECR line conformance to the EPFO ECR 2.0 specification (Introduction_ECR2.0.pdf).
 * ─────────────────────────────────────────────────────────────────────────────
 * The spec — not our earlier docs — governs the ECR field constraints:
 *   - No 12%-of-EPF-wages equality on field 7 (EE Share Remitted); its only rule is "cannot be
 *     more than gross wages". So a VPF total belongs in field 7 and must be accepted.
 *   - EPS/EDLI wages derive from EPF wages, capped at ₹15,000.
 *   - NCP is full days only, and equals the days in the month when declared wages are 0.
 *   - No decimals in any numeric field.
 * Plus the reduced-rate reason (item 3): a 10% establishment records an enumerated EPFO ground.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildEcrLine, type EcrPayslipInput } from "../lib/india/ecr-format";
import { writeWizardData } from "../services/orgWizardWrite";
import { seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { organizations, eq } from "@coheronconnect/db";

function slip(over: Partial<EcrPayslipInput>): EcrPayslipInput {
  return {
    grossEarnings: 20000, pfWageBase: 10000, pfEmployee: 1200,
    pfEmployerEps: 833, pfEmployerEpf: 367, lopDays: 0, month: 4, year: 2026,
    ...over,
  };
}
const ID = { uan: "100200300400", memberName: "Asha Rao" };

describe("ECR line — EPFO ECR 2.0 spec conformance", () => {
  it("field 7 (EE share) carries the VPF total and is accepted — no equality check fires", () => {
    // 12% (1,200) + 8% VPF (800) = 2,000 on a ₹10,000 base; below gross → valid.
    const line = buildEcrLine(slip({ pfEmployee: 2000 }), ID);
    expect(line.employeeEpf).toBe(2000);
    expect(line.employeeEpf).toBeLessThanOrEqual(line.grossWages);
  });

  it("field 7 exceeding gross wages is refused", () => {
    expect(() => buildEcrLine(slip({ grossEarnings: 1000, pfEmployee: 2000 }), ID)).toThrow(/exceeds gross/i);
  });

  it("EDLI wages equal EPF wages below ₹15,000, and are capped at ₹15,000 above", () => {
    expect(buildEcrLine(slip({ pfWageBase: 10000 }), ID).edliWages).toBe(10000);
    expect(buildEcrLine(slip({ pfWageBase: 20000, pfEmployee: 2400, grossEarnings: 40000 }), ID).edliWages).toBe(15000);
  });

  it("EPS wages never exceed EPF wages, and are ₹15,000 where EPF wages exceed it", () => {
    const below = buildEcrLine(slip({ pfWageBase: 10000 }), ID);
    expect(below.epsWages).toBeLessThanOrEqual(below.epfWages);
    expect(below.epsWages).toBe(10000);
    const above = buildEcrLine(slip({ pfWageBase: 20000, pfEmployee: 2400, grossEarnings: 40000 }), ID);
    expect(above.epsWages).toBe(15000);
    expect(above.epsWages).toBeLessThanOrEqual(above.epfWages);
  });

  it("NCP equals the days in the month when declared wages are 0", () => {
    // The employer figures are zeroed alongside the wage. The fixture previously left
    // the ₹833/₹367 defaults in place while declaring a ₹0 wage — a payslip that cannot
    // exist (no wage, yet employer dues remitted). Nothing checked it until the
    // wage-vs-contribution guard was added. The assertion under test — NCP = days in
    // the month — is unchanged.
    const zeroWage = { grossEarnings: 0, pfWageBase: 0, pfEmployee: 0, pfEmployerEps: 0, pfEmployerEpf: 0, lopDays: 0 };
    expect(buildEcrLine(slip({ ...zeroWage, month: 4, year: 2026 }), ID).ncp).toBe(30); // April
    expect(buildEcrLine(slip({ ...zeroWage, month: 2, year: 2026 }), ID).ncp).toBe(28); // February
  });

  it("no numeric field emits a decimal (all whole numbers)", () => {
    const line = buildEcrLine(
      slip({ grossEarnings: "50000.50", pfWageBase: "14999.50", pfEmployee: "1799.50", pfEmployerEps: "1249.50", pfEmployerEpf: "550.50", lopDays: "3.5" }),
      ID,
    );
    for (const v of [line.grossWages, line.epfWages, line.epsWages, line.edliWages, line.employeeEpf, line.employerEps, line.employerEpf, line.ncp, line.refund]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("reduced PF rate — enumerated EPFO reason (item 3)", () => {
  let orgId: string;
  let actor: { type: "tenant_user"; id: string };
  beforeEach(async () => {
    const s = await seedFullOrg();
    orgId = s.orgId;
    actor = { type: "tenant_user", id: s.adminId };
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("an org set to 10% records a reason from the enumerated list", async () => {
    await writeWizardData(testDb(), orgId, { india: { pfContributionRate: 10, pfReducedRateReason: "under_20_employees" } }, actor);
    const [row] = await testDb().select({ rate: organizations.pfContributionRate, reason: organizations.pfReducedRateReason }).from(organizations).where(eq(organizations.id, orgId));
    expect(Number(row!.rate)).toBe(10);
    expect(row!.reason).toBe("under_20_employees");
  });

  it("a 10% rate with no reason is refused", async () => {
    await expect(
      writeWizardData(testDb(), orgId, { india: { pfContributionRate: 10 } }, actor),
    ).rejects.toThrow(/requires a reason/i);
  });

  it("an org at 12% carries no reason", async () => {
    await writeWizardData(testDb(), orgId, { india: { pfContributionRate: 12, pfReducedRateReason: "bidi" } }, actor);
    const [row] = await testDb().select({ rate: organizations.pfContributionRate, reason: organizations.pfReducedRateReason }).from(organizations).where(eq(organizations.id, orgId));
    expect(Number(row!.rate)).toBe(12);
    expect(row!.reason).toBeNull();
  });
});
