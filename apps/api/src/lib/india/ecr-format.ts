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
/** One employee who would make an ECR upload fail, and the reason. */
export interface EcrBlocker {
  employeeId: string;
  employeeCode: string;
  reason: string;
}

/** The employee fields the ECR pre-flight reads. */
export interface EcrPreflightEmployee {
  id: string;
  employeeId: string | null;
  uan: string | null;
  pfKycStatus: "pending" | "done" | "rejected" | null;
}

/**
 * ECR PRE-FLIGHT — catch the upload rejections BEFORE the file goes to EPFO.
 *
 * Two conditions, both of which EPFO rejects on and neither of which was detectable here before:
 *
 *  1. **No UAN.** `generateECR` substituted the literal string `"UNKNOWN"` for a missing UAN, so a
 *     member with no UAN produced a syntactically valid line carrying a fabricated identifier —
 *     the same "invent a displayed identifier" defect class called out in CLAUDE.md, except this
 *     one leaves the building and goes to a regulator.
 *  2. **UAN KYC not done.** An un-KYC'd UAN is a leading cause of ECR rejection. The whole reason
 *     `employees.pf_kyc_status` exists is to be checked here; storing it and never reading it
 *     would be the "stored but never evaluated" anti-pattern.
 *
 * Returns the blockers, NAMED. It does not decide what to do with them — the preview path lists
 * them so an operator can fix them, and the portal-submit path refuses. `rejected` and `pending`
 * are both blockers: neither is a KYC that EPFO will accept.
 */
export function ecrPreflight(employees: EcrPreflightEmployee[]): EcrBlocker[] {
  const blockers: EcrBlocker[] = [];
  for (const e of employees) {
    const code = e.employeeId ?? e.id.slice(0, 8);
    if (!e.uan?.trim()) {
      blockers.push({
        employeeId: e.id,
        employeeCode: code,
        reason: "No UAN on record — EPFO cannot match the member.",
      });
    }
    if (e.pfKycStatus !== "done") {
      blockers.push({
        employeeId: e.id,
        employeeCode: code,
        reason: `UAN KYC is ${e.pfKycStatus ?? "not recorded"} — EPFO rejects un-KYC'd members.`,
      });
    }
  }
  return blockers;
}

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
  const employerEps = n(slip.pfEmployerEps);
  const employerEpf = n(slip.pfEmployerEpf);

  // ── Wage-vs-contribution plausibility guard ────────────────────────────────
  //
  // EPFO's revamped ECR validates the reported wage against the contribution and
  // rejects the upload when they disagree. A rejection costs a filing cycle;
  // catching it here costs nothing. This is the check that would have caught the
  // raw-basic wage defect: an ₹8,000 wage carrying ₹1,200 of dues reads as 15%.
  //
  // It keys on the EMPLOYER share, deliberately NOT the employee share. The
  // employee figure includes any VPF and can legitimately run far above 12% — up
  // to 100% of the wage base — so it carries no usable upper bound (the spec's
  // only employee-side check is "not more than gross", enforced above). The
  // employer share has no VPF component: it is the statutory rate on the wage
  // base, split into EPS (8.33%, capped) and EPF (the remainder), and that
  // identity holds above the ceiling too under Para 26(6). So employer total
  // ÷ EPF wages must land on the statutory rate.
  //
  // The bound is an UPPER one only, and that is deliberate.
  //
  // The defect this catches under-reports the WAGE while the contribution stays
  // put, which drives the ratio UP (₹1,200 on a declared ₹8,000 reads as 15%).
  // An upper bound catches that, and cannot false-positive.
  //
  // A lower bound was tried and REMOVED: it is not sound here. Above the PF
  // ceiling — Para 26(6), contribution on the uncapped base — EPS is capped at
  // 8.33% of ₹15,000 while employer EPF is computed on the full base, so the
  // employer total is legitimately ~9.9% of a ₹20,000 wage, not 12%. A 10% floor
  // rejected exactly those filings. The reduced-rate establishments (10%, see
  // `organizations.pf_reduced_rate_reason`) sit under a 12% floor too. Since the
  // EPS cap and the reduced rate both only ever push the ratio DOWN, a floor
  // cannot distinguish them from an over-reported wage — so it is left out rather
  // than shipped as a source of false rejections. Over-reporting the wage is
  // therefore not caught here; it is caught by `epfWages` coming from the stored
  // `pf_wage_base` in the first place.
  //
  // Tolerance: +₹1 absolute. Every ECR field is a whole rupee (the spec allows no
  // decimals), so employer EPS and EPF each carry up to ₹0.50 of rounding — ₹1
  // together. A percentage tolerance was rejected: at small wages it is tighter
  // than the rounding it has to absorb.
  const employerTotal = employerEps + employerEpf;
  const ROUNDING_SLACK = 1;
  const maxEmployer = epfWages * 0.12 + ROUNDING_SLACK;
  if (employerTotal > maxEmployer) {
    const pct = epfWages > 0 ? ((employerTotal / epfWages) * 100).toFixed(2) : "n/a";
    throw new Error(
      `ECR line for "${identity.memberName}" (UAN ${identity.uan}): employer contribution ` +
        `₹${employerTotal} is ${pct}% of the reported EPF wages (₹${epfWages}) — above the ` +
        `statutory 12% ceiling on the employer share. The reported wage and the contribution ` +
        `disagree, and EPFO rejects this. The reported wage must be the one the contribution ` +
        `was computed on (payslips.pf_wage_base).`,
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
    employerEps,
    employerEpf,
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
