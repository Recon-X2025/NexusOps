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
