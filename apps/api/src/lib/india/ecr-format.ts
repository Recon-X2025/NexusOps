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
  month: number; // 1–12, for days-in-month (NCP zero-wage rule)
  year: number;
}

/**
 * Build one ECR member line from a STORED payslip + the member's identity, per the EPFO ECR 2.0
 * specification (Introduction_ECR2.0.pdf — the primary source). Constraints enforced:
 *   - EVERY numeric field is a whole number: the spec allows no decimals.
 *   - EE Share Remitted (field 7) = the TOTAL employee PF remitted, INCLUDING any VPF. The spec's
 *     only validation is "cannot be more than the gross wages" — there is NO 12%-of-EPF-wages
 *     equality check, so we impose none; we refuse only when it exceeds gross.
 *   - EPF Wages = the wage the dues were paid on: ₹15,000 when restricted to the ceiling, the full
 *     wage under Para 26(6) (spec: "that wage should be entered"). ≤ gross by construction.
 *   - EPS Wages / EDLI Wages = min(EPF wages, 15,000): EPS ≤ EPF wages and 15,000 above; EDLI equals
 *     EPF wages below 15,000 and is capped at 15,000.
 *   - NCP: full days only (no half days); equals the days in the month when declared wages are 0.
 * `memberName` is the person's name; `uan` their UAN.
 */
export function buildEcrLine(
  slip: EcrPayslipInput,
  identity: { uan: string; memberName: string },
): ECRLine {
  // No decimals anywhere (spec): round every numeric field.
  const n = (v: string | number) => Math.round(Number(v || 0));
  const grossWages = n(slip.grossEarnings);
  const epfWages = n(slip.pfWageBase);
  const cappedWages = Math.min(epfWages, 15000);
  const employeeEpf = n(slip.pfEmployee);
  // Spec field-7 validation: EE share remitted cannot exceed gross wages — refuse rather than file
  // a line EPFO will reject. (This is the spec's ACTUAL check; the old epfWages×12% equality was not.)
  if (employeeEpf > grossWages) {
    throw new Error(
      `ECR line for "${identity.memberName}" (UAN ${identity.uan}): EE share remitted (₹${employeeEpf}) ` +
        `exceeds gross wages (₹${grossWages}) — EPFO rejects this. Check the PF / VPF configuration.`,
    );
  }
  // NCP: full days only. When the member earned no wages this month the whole month is
  // non-contributory (spec), so NCP = days in the month; otherwise the LOP days, rounded.
  const daysInMonth = new Date(slip.year, slip.month, 0).getDate();
  const ncp = grossWages === 0 ? daysInMonth : Math.round(Number(slip.lopDays || 0));
  return {
    uan: identity.uan,
    memberName: identity.memberName,
    grossWages,
    epfWages,
    epsWages: cappedWages,
    edliWages: cappedWages,
    employeeEpf,
    employerEps: n(slip.pfEmployerEps),
    employerEpf: n(slip.pfEmployerEpf),
    ncp,
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
