/**
 * ECR body assembly for a payroll period.
 *
 * Extracted from `indiaCompliance.filing.submit` so the two consumers — the
 * customer-facing download and the GSP push — build the file from ONE
 * implementation. They previously could not drift because only one existed;
 * now that there are two callers, sharing this is what keeps them identical.
 *
 * The file is always regenerated from the payroll run rather than read back
 * from a stored blob, so what a customer downloads is what the current payroll
 * data implies — never a stale snapshot from an earlier assembly.
 */
import { and, eq } from "@coheronconnect/db";
import {
  buildEcrLine,
  ecrPreflight,
  formatECRFile,
  type ECRLine,
  type EcrBlocker,
  type EcrPreflightEmployee,
} from "./ecr-format.js";

export interface EcrBuildResult {
  /** The canonical `#~#` ECR body, ready to write to a .txt upload file. */
  ecrBody: string;
  /** One structured line per payslip in the run. */
  lines: ECRLine[];
  /** EPFO establishment code the file was stamped with. */
  establishmentId: string;
  /** Employees EPFO would reject the upload on. Empty means clean. */
  blockers: EcrBlocker[];
}

/** Raised with a message meant to be shown to the user verbatim. */
export class EcrBuildError extends Error {
  constructor(
    message: string,
    readonly code: "NO_EPF_CODE" | "NO_PAYROLL_RUN",
  ) {
    super(message);
    this.name = "EcrBuildError";
  }
}

/**
 * Build the ECR body for one org + period.
 *
 * `db` is the request-scoped Drizzle handle, so RLS tenancy is already applied;
 * every query below still filters on `orgId` explicitly rather than relying on
 * that alone.
 */
export async function buildEcrBodyForPeriod(
  // The concrete Drizzle type is not exported in a usable form here; the caller
  // always passes `ctx.db`, which is tenant-scoped.
  db: any,
  orgId: string,
  month: number,
  year: number,
): Promise<EcrBuildResult> {
  const {
    payrollRuns,
    payslips: payslipsTable,
    employees: employeesTable,
    users: usersTable,
    organizations: orgsTable,
  } = await import("@coheronconnect/db");

  // Establishment id from the org's REAL EPF code — refuse if absent, never
  // fabricate one from the org id.
  const [orgRow] = await db
    .select({ epfCode: orgsTable.epfCode })
    .from(orgsTable)
    .where(eq(orgsTable.id, orgId));
  const establishmentId = orgRow?.epfCode?.trim();
  if (!establishmentId) {
    // Message kept verbatim from the push path this was extracted from — it is
    // asserted on by the statutory-generation suite and names the field to fix.
    throw new EcrBuildError(
      "Cannot file the EPF ECR: the organisation has no EPF establishment code. " +
        "Set the EPF code in Organisation Settings → Statutory Identity before filing.",
      "NO_EPF_CODE",
    );
  }

  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.orgId, orgId), eq(payrollRuns.month, month), eq(payrollRuns.year, year)));
  if (!run) {
    throw new EcrBuildError("Payroll run for this return not found", "NO_PAYROLL_RUN");
  }

  const slips = await db.select().from(payslipsTable).where(eq(payslipsTable.payrollRunId, run.id));

  // Identity is read once per payslip and reused for both the line and the
  // pre-flight, rather than queried twice.
  const ecrEmployees: EcrPreflightEmployee[] = [];
  const lines: ECRLine[] = await Promise.all(
    slips.map(async (slip: { employeeId: string }) => {
      const [emp] = await db
        .select({
          id: employeesTable.id,
          uan: employeesTable.uan,
          employeeCode: employeesTable.employeeId,
          userId: employeesTable.userId,
          pfKycStatus: employeesTable.pfKycStatus,
        })
        .from(employeesTable)
        .where(eq(employeesTable.id, slip.employeeId));
      if (emp) {
        ecrEmployees.push({
          id: emp.id,
          employeeId: emp.employeeCode,
          uan: emp.uan,
          pfKycStatus: emp.pfKycStatus,
        });
      }
      const [u] = emp?.userId
        ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, emp.userId))
        : [];
      return buildEcrLine(slip as never, {
        uan: emp?.uan ?? "UNKNOWN",
        memberName: u?.name ?? emp?.employeeCode ?? "EMPLOYEE",
      });
    }),
  );

  return {
    ecrBody: formatECRFile(establishmentId, month, year, lines),
    lines,
    establishmentId,
    blockers: ecrPreflight(ecrEmployees),
  };
}

/**
 * EPFO's upload page accepts any filename, but a period-stamped one is what
 * makes a folder of downloads navigable a year later at audit time.
 */
export function ecrFileName(establishmentId: string, month: number, year: number): string {
  return `ECR_${establishmentId}_${String(month).padStart(2, "0")}${year}.txt`;
}
