/**
 * EPFO ECR file formatter (`#~#`-delimited).
 *
 * Extracted verbatim from the retired second payroll engine
 * (`india/payroll-engine.ts`) so the EPFO GSP push byte-format is preserved
 * exactly while that engine is deleted. The delimiter/header here is the format
 * currently sent to EPFO by `hr.payroll.generateECR` and
 * `india-compliance.filing.submit`; reconciling it against the live engine's
 * `generateECR` (`|`-delimited) is a separate, deferred task.
 */

export interface ECRLine {
  uan: string;
  memberName: string;
  grossWages: number;
  epfWages: number;
  epsWages: number;
  edliWages: number;
  employeeEpf: number;
  employerEps: number;
  employerEpf: number;
  ncp: number; // Non-Contributing Period days
  refund: number;
}

/** The stored-payslip fields an ECR line reads (decimal columns arrive as strings). */
export interface EcrPayslipInput {
  grossEarnings: string | number;
  pfWageBase: string | number;
  pfEmployee: string | number;
  pfEmployerEps: string | number;
  pfEmployerEpf: string | number;
  lopDays: string | number;
}

/**
 * Build one ECR member line from a STORED payslip + the member's identity. Single source of
 * the member figures, so the EPFO reconciliation invariants hold by construction:
 *   - `epfWages` is the PERSISTED PF wage base (not raw basic) — so `epfWages × 12% == employeeEpf`
 *     even where the 50% clamp moved the base off basic (defect 1).
 *   - `employerEps` / `employerEpf` are the PERSISTED EPS (8.33%) and EPF (3.67%) shares: EPS is
 *     not folded into `employerEpf`, and neither carries EDLI/admin (which live only in the total
 *     employer PF, never on the ECR) — so the employer contribution is stated once (defect 6).
 *   - `ncp` is the payslip's LOP (non-contributory) days (defect 3).
 * `memberName` must be the person's name (defect 2); `uan` their UAN.
 */
export function buildEcrLine(
  slip: EcrPayslipInput,
  identity: { uan: string; memberName: string },
): ECRLine {
  const n = (v: string | number) => Number(v || 0);
  const epfWages = n(slip.pfWageBase);
  const cappedWages = Math.min(epfWages, 15000);
  return {
    uan: identity.uan,
    memberName: identity.memberName,
    grossWages: n(slip.grossEarnings),
    epfWages,
    epsWages: cappedWages,
    edliWages: cappedWages,
    employeeEpf: n(slip.pfEmployee),
    employerEps: n(slip.pfEmployerEps),
    employerEpf: n(slip.pfEmployerEpf),
    ncp: n(slip.lopDays),
    refund: 0,
  };
}

export function formatECRFile(
  orgEpfoId: string,
  month: number,
  year: number,
  lines: ECRLine[],
): string {
  const header = `#~#${orgEpfoId}#~#${String(month).padStart(2, "0")}/${year}#~#ECR`;
  const body = lines.map((l) =>
    [
      l.uan,
      l.memberName.toUpperCase(),
      l.grossWages,
      l.epfWages,
      l.epsWages,
      l.edliWages,
      l.employeeEpf,
      l.employerEps,
      l.employerEpf,
      l.ncp,
      l.refund,
    ].join("#~#"),
  );
  return [header, ...body].join("\n");
}
