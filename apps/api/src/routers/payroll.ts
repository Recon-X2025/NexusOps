/**
 * Payroll tRPC router — run lifecycle, payslips, and India tax preview.
 *
 * **Pipeline (12-step UI):** `DRAFT` → `lockPeriod` → `PERIOD_LOCKED` (+ run totals from `payroll-cycle`) →
 * `advanceComputationStep` (gross → … → TDS) → `computePayslips` → `PAYSLIPS_GENERATED` → HR / Finance / CFO
 * → statutory → completed. Legacy `status` enum stays in sync for reporting.
 * Employee payslip PDF: Fastify **GET `/payroll/payslip-pdf/:id`** (see `http/payroll-payslip-pdf.ts`).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  payrollRuns,
  payslips,
  employees,
  salaryStructures,
  users,
  organizations,
  epfoEcrSubmissions,
  esiChallanRecords,
  ptChallanRecords,
  tdsChallanRecords,
  documents,
  documentVersions,
  eq,
  and,
  or,
  desc,
  gte,
  lte,
  isNull,
  inArray,
  max,
  type DbOrTx,
  type PayrollWorkflowMeta,
} from "@coheronconnect/db";
import { putObject, buildDocumentKey, enqueueVirusScan } from "../services/storage";
import { generateForm16PDF } from "../services/form16-pdf";
import { buildForm16Input } from "../lib/india/form16-aggregator";
import { decryptPan } from "../lib/pan";
import { router, permissionProcedure, anyPermissionProcedure, protectedProcedure } from "../lib/trpc";
import { computeTax, computeHRAExemption, type EmployeeTaxProfile } from "../lib/india-tax-engine";
import { computePayslipTaxFigures } from "../lib/payslip-tax";
import { buildPayslipView, payslipViewToPortalRow } from "../lib/payslip-view";
import { computeEmployeePayslip } from "../lib/payroll-cycle";
import { resolveStatutoryCeilings } from "../lib/india/statutory-ceilings";
import { resolveSalaryStructureForPeriod, structureNotEffectiveError } from "../lib/india/salary-structure-resolver";
import { computeAttendanceLopForPeriod } from "../lib/india/attendance-lop";
import { computeRetainUntil } from "../lib/retention";
import {
  buildEmployeePayrollInput,
  buildPtHalfYearlyContext,
  calendarToFyMonth,
  computePayrollRunTotals,
  esiContributionPeriodStart,
  PAYROLL_EMPLOYED_STATUSES,
} from "../services/payroll-run-aggregates";
import { checkDbUserPermission } from "../lib/rbac-db";

function legacyStatusForPipeline(pipeline: string) {
  if (pipeline === "DRAFT") return "draft" as const;
  if (
    [
      "PERIOD_LOCKED",
      "GROSS_COMPUTED",
      "PF_COMPUTED",
      "ESI_COMPUTED",
      "PT_COMPUTED",
      "LWF_COMPUTED",
      "TDS_COMPUTED",
      "PAYSLIPS_GENERATED",
      "FAILED",
    ].includes(pipeline)
  ) {
    return "under_review" as const;
  }
  if (pipeline === "HR_APPROVED") return "hr_approved" as const;
  if (pipeline === "FINANCE_APPROVED") return "finance_approved" as const;
  if (pipeline === "CFO_APPROVED" || pipeline === "STATUTORY_GENERATED") return "cfo_approved" as const;
  if (pipeline === "COMPLETED") return "paid" as const;
  return "draft" as const;
}

function mapRunRow(row: typeof payrollRuns.$inferSelect) {
  const meta: PayrollWorkflowMeta = row.workflowMetadata ?? { errors: [], approvals: [] };
  const tg = Number(row.totalGross || 0);
  const tpe = Number(row.totalPfEmployee || 0);
  const tpr = Number(row.totalPfEmployer || 0);
  return {
    id: row.id,
    runNumber: String(row.runNumber),
    month: row.month,
    year: row.year,
    status: row.pipelineStatus,
    employeeCount: meta.payrollEmployeeCount ?? 0,
    totalGross: tg,
    totalDeductions: Number(row.totalDeductions || 0),
    totalNet: Number(row.totalNet || 0),
    totalEmployerCost: tg + tpr + Number(row.totalEsiEmployer || 0),
    totalPfEmployee: tpe,
    totalPfEmployer: tpr,
    totalESI: Number(row.totalEsiEmployee || 0) + Number(row.totalEsiEmployer || 0),
    totalPT: Number(row.totalPt || 0),
    totalTDS: Number(row.totalTds || 0),
    errors: meta.errors,
    approvals: meta.approvals,
  };
}

/** Single-step advance from period locked through TDS (exclusive of payslip generation). */
const COMPUTATION_NEXT: Record<string, string> = {
  PERIOD_LOCKED: "GROSS_COMPUTED",
  GROSS_COMPUTED: "PF_COMPUTED",
  PF_COMPUTED: "ESI_COMPUTED",
  ESI_COMPUTED: "PT_COMPUTED",
  PT_COMPUTED: "LWF_COMPUTED",
  LWF_COMPUTED: "TDS_COMPUTED",
};

function fyCondition(startYear: number) {
  return or(
    and(eq(payslips.year, startYear), gte(payslips.month, 4)),
    and(eq(payslips.year, startYear + 1), lte(payslips.month, 3)),
  );
}

/** Rough monthly tax snapshot for the employee portal (full FY projection lives in `taxPreview`). */
// PT2: annual tax figures for a stored payslip come from one shared helper so the screen
// (here) and the downloadable PDF cannot drift. See `../lib/payslip-tax`.
function taxComputationFromPayslip(p: typeof payslips.$inferSelect) {
  return computePayslipTaxFigures(p);
}

function mapPayslipRow(p: typeof payslips.$inferSelect) {
  // C6: read from the SHARED payslip view (no tenant identity — the portal shows amounts +
  // attendance only) so the on-screen breakdown and the statutory PDF cannot drift. This is
  // where ESI and LOP were previously hardcoded to 0; the builder reads the stored columns.
  const view = buildPayslipView({ slip: p });
  return payslipViewToPortalRow(view, {
    id: p.id,
    taxComputation: taxComputationFromPayslip(p),
    pdfUrl: p.pdfUrl,
  });
}

function buildTaxProfileFromEmployee(args: {
  employee: typeof employees.$inferSelect;
  structure: typeof salaryStructures.$inferSelect | null;
  fyGross: number;
  monthsWithData: number;
  /** Calendar year the India FY starts in (e.g. 2026 for FY 2026-2027). */
  fyStart: number;
}): EmployeeTaxProfile {
  const { employee, structure, fyGross, monthsWithData, fyStart } = args;
  // PT1: reconcile the screen's tax basis to the run path. The run
  // (`payroll-run-aggregates` → `computeEmployeePayslip`) taxes the SUM OF ACTUAL PAID
  // COMPONENTS, never the contracted CTC — that is the only legally correct TDS basis
  // (CA ruling): it auto-handles mid-month joiners, unpaid leave, and mid-year revisions,
  // whereas contracted CTC does not. This screen previously taxed `structure.ctcAnnual`
  // (contracted) with a `joiningMonth: 1` shortcut, so the two paths taxed different
  // incomes and never agreed. When real payslips exist for the FY, `fyGross` (their summed
  // gross) is the actual-paid basis; fall back to CTC only when there is no run history to
  // read. The `- 2500` special-allowance shave (the annual MH PT cap applied monthly, 12×
  // too large — the same PT1 bug as the run path) is removed here too.
  const contractedCtc = structure ? Number(structure.ctcAnnual || 0) : 0;
  const annualCTC = fyGross > 0 ? fyGross : contractedCtc > 0 ? contractedCtc : 1_200_000;
  const basicPct = structure ? Number(structure.basicPercent || 40) / 100 : 0.4;
  const hraPctOfBasic = structure ? Number(structure.hraPercentOfBasic || 50) / 100 : 0.5;
  const basicMonthly = (annualCTC * basicPct) / 12;
  const hraMonthly = basicMonthly * hraPctOfBasic;
  const specialMonthly = Math.max(0, annualCTC / 12 - basicMonthly - hraMonthly);
  const ltaAnnual = structure ? Number(structure.ltaAnnual || 0) : 30_000;
  const regime = employee.taxRegime === "old" ? "OLD" : "NEW";
  // HRA exemption (s.10(13A)) so the on-screen projection matches the run. Old regime
  // only (the engine ignores it for NEW); 0 when no rent is declared. Uses the same
  // annualised basic/HRA basis as the run's `computeEmployeePayslip`.
  const hraExemption =
    regime === "OLD"
      ? computeHRAExemption(
          basicMonthly * 12,
          hraMonthly * 12,
          Number(employee.rentPaidAnnual || 0),
          employee.isMetroCity ?? false,
        )
      : 0;
  // PT4 (screen parity): derive the FY joining month from the employee's start date so a
  // MID-YEAR joiner takes the engine's mid-year branch — the ONLY branch that folds
  // `previousEmployerIncome` into the annual base (tax-engine.ts:275-285). The screen
  // previously hardcoded `joiningMonth: 1`, so every employee was projected as a full-year
  // employee and a joiner's declared prior salary was silently ignored (while the run path,
  // which derives a real joining month, included it). FY month: April = 1 … March = 12; a
  // start date on/before 1 April of the FY (or none) ⇒ joiningMonth 1, byte-identical to
  // today for existing full-year employees. When actual payslips exist, `monthsWithData`
  // remains the truth for the actual-paid basis; absent history we scale from the join.
  const fyStartDate = new Date(fyStart, 3, 1); // 1 April fyStart
  const start = employee.startDate ? new Date(employee.startDate) : null;
  const joiningMonth =
    start && start > fyStartDate
      ? Math.min(12, Math.max(1, calendarToFyMonth(start.getMonth() + 1)))
      : 1;
  const monthsFromJoin = 12 - joiningMonth + 1;
  const monthsInFY =
    monthsWithData > 0 ? Math.min(12, monthsWithData) : monthsFromJoin;
  return {
    regime,
    annualCTC,
    basicMonthly,
    hraMonthly,
    specialAllowance: specialMonthly,
    lta: ltaAnnual,
    // TODO(compliance): Wire up actual employee tax declarations intake table.
    // section80C/D/CCD1B/TTA/24b still hardcoded to 0 (no declaration intake table yet);
    // old-regime Chapter VI-A is over-deducted until that ships. HRA exemption IS now
    // computed above from the employee's declared rent + metro flag.
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption,
    otherExemptions: 0,
    employeePFMonthly: basicMonthly * 0.12 > 1800 ? 1800 : Math.round(basicMonthly * 0.12),
    employerPFMonthly: basicMonthly * 0.12 > 1800 ? 1800 : Math.round(basicMonthly * 0.12),
    professionalTax: 2400,
    joiningMonth,
    monthsInFY,
    // PT4 (screen parity): a mid-year joiner's Form 12B prior-employer figures must feed
    // the on-screen regime-comparison projection exactly as they already feed the run path
    // (`buildEmployeePayrollInput`). Hardcoding these to 0 — combined with the fixed
    // `joiningMonth: 1` above — excluded prior salary from the annual base while the run
    // included it, so the projected tax understated the joiner's true s.192(2) liability.
    // Read from the same employee row; 0 (no 12B) stays correct.
    previousEmployerIncome: Number(employee.previousEmployerIncome || 0),
    previousEmployerTDS: Number(employee.previousEmployerTds || 0),
  };
}

function regimeSlice(t: ReturnType<typeof computeTax>) {
  return {
    grossSalary: t.grossSalary,
    standardDeduction: t.standardDeduction,
    hraExemption: t.hraExemption,
    chapter6ADeductions: t.chapter6ADeductions,
    section24bDeduction: t.section24bDeduction,
    taxableIncome: t.taxableIncome,
    totalTaxLiability: t.totalTaxLiability,
    monthlyTDS: t.monthlyTDS,
  };
}

// Read access to the payroll run SURFACE (page list + run detail). Admits the
// payroll operator (payroll.read) AND the Finance/CFO approver (financial.write),
// so the person authorised to approve a step can open the run and reach the
// control. Write/compute/lock/generate paths below remain payroll.write-only;
// the approve ACTION keeps its own stricter per-step gate + SoD unchanged.
const PAYROLL_RUN_READ_SURFACE = [
  ["payroll", "read"],
  ["financial", "write"],
] as const;

const runsRouter = router({
  list: anyPermissionProcedure(PAYROLL_RUN_READ_SURFACE).input(z.object({}).optional()).query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.orgId, org!.id))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
    return rows.map(mapRunRow);
  }),

  get: anyPermissionProcedure(PAYROLL_RUN_READ_SURFACE)
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.id), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return mapRunRow(row);
    }),

  create: permissionProcedure("payroll", "write")
    .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2000).max(2100) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [dup] = await db
        .select({ id: payrollRuns.id })
        .from(payrollRuns)
        .where(
          and(
            eq(payrollRuns.orgId, org!.id),
            eq(payrollRuns.month, input.month),
            eq(payrollRuns.year, input.year),
          ),
        );
      if (dup) throw new TRPCError({ code: "CONFLICT", message: "A run already exists for this month." });

      const [agg] = await db
        .select({ maxRun: max(payrollRuns.runNumber) })
        .from(payrollRuns)
        .where(eq(payrollRuns.orgId, org!.id));
      const nextRun = Number(agg?.maxRun ?? 0) + 1;

      const [created] = await db
        .insert(payrollRuns)
        .values({
          orgId: org!.id,
          month: input.month,
          year: input.year,
          status: "draft",
          pipelineStatus: "DRAFT",
          runNumber: nextRun,
          workflowMetadata: { errors: [], approvals: [] },
        })
        .returning();
      return mapRunRow(created!);
    }),

  lockPeriod: permissionProcedure("payroll", "write")
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.pipelineStatus !== "DRAFT") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Run is not in DRAFT state." });
      }
      const totals = await computePayrollRunTotals(db, org!.id, row.month, row.year);
      const prevMeta: PayrollWorkflowMeta = row.workflowMetadata ?? { errors: [], approvals: [] };
      const computeErrors = totals.errors.map((e) => ({
        employeeId: e.employeeId,
        message: e.message,
      }));
      const meta: PayrollWorkflowMeta = {
        ...prevMeta,
        errors: [...(prevMeta.errors ?? []), ...computeErrors],
        payrollEmployeeCount: totals.employeeCount,
      };
      const nextPipeline = "PERIOD_LOCKED";
      const [updated] = await db
        .update(payrollRuns)
        .set({
          pipelineStatus: nextPipeline,
          status: legacyStatusForPipeline(nextPipeline),
          totalGross: String(totals.totalGross),
          totalDeductions: String(totals.totalDeductions),
          totalNet: String(totals.totalNet),
          totalPfEmployee: String(totals.totalPfEmployee),
          totalPfEmployer: String(totals.totalPfEmployer),
          totalPt: String(totals.totalPt),
          totalTds: String(totals.totalTds),
          workflowMetadata: meta,
        })
        .where(eq(payrollRuns.id, input.runId))
        .returning();
      return mapRunRow(updated!);
    }),

  advanceComputationStep: permissionProcedure("payroll", "write")
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.pipelineStatus === "TDS_COMPUTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "TDS already computed — use computePayslips to generate payslip rows.",
        });
      }
      const nextPipeline = COMPUTATION_NEXT[row.pipelineStatus];
      if (!nextPipeline) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot advance computation from state ${row.pipelineStatus}.`,
        });
      }
      const [updated] = await db
        .update(payrollRuns)
        .set({
          pipelineStatus: nextPipeline,
          status: legacyStatusForPipeline(nextPipeline),
        })
        .where(eq(payrollRuns.id, input.runId))
        .returning();
      return mapRunRow(updated!);
    }),

  computePayslips: permissionProcedure("payroll", "write")
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.pipelineStatus !== "TDS_COMPUTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Run must be in TDS_COMPUTED before generating payslips.",
        });
      }

      const fyMonth = calendarToFyMonth(row.month);
      // DPDP retention floor anchor: prefer the run's paidAt; payslips are generated
      // pre-payment (TDS_COMPUTED), so fall back to now when the run is not yet paid.
      const retainUntilDate = computeRetainUntil(row.paidAt ?? new Date());
      // M-05: resolve each employee's salary-structure VERSION in force for THIS pay
      // period (not the current version). `salaryStructureId` holds a familyId; the
      // resolver returns the version whose window contains the period. Employees whose
      // family has no version covering the period are skipped — preserving the old
      // inner-join semantics (only employees with an applicable structure are paid).
      const periodDate = new Date(row.year, row.month - 1, 1);
      // Anyone employed during the period is paid (probation + on_leave included, per
      // PAYROLL_EMPLOYED_STATUSES); leavers stay excluded pending a full-and-final path.
      const activeEmps = await db
        .select()
        .from(employees)
        .where(and(eq(employees.orgId, org!.id), inArray(employees.status, [...PAYROLL_EMPLOYED_STATUSES])));
      const empRows: Array<{ emp: typeof employees.$inferSelect; st: typeof salaryStructures.$inferSelect }> = [];
      // Employees dropped because their structure has no version in effect for the period.
      // Previously a bare `continue` here left the exclusion in NEITHER the empRows nor the
      // skipped channel — the headcount shrank at payslip time with no explanation. Name each,
      // by code, in the run's error channel below. The message is identical to the lock/totals
      // path (computePayrollRunTotals), so the two de-dup to a single flag on the run.
      const excludedNoEffectiveStructure: Array<{ employeeId: string; message: string }> = [];
      for (const emp of activeEmps) {
        if (!emp.salaryStructureId) continue; // structureless: flagged by the lock/totals path
        const st = await resolveSalaryStructureForPeriod(db, org!.id, emp.salaryStructureId, periodDate);
        if (st) empRows.push({ emp, st });
        else excludedNoEffectiveStructure.push({ employeeId: emp.id, message: structureNotEffectiveError(emp.employeeId, row.month, row.year) });
      }

      // G1: resolve effective-dated statutory ceilings for this pay period.
      const ceilings = await resolveStatutoryCeilings(
        db,
        org!.id,
        periodDate,
      );
      // G8: derive LOP from attendance so unpaid absence reduces gross pay.
      const lopMap = await computeAttendanceLopForPeriod(db, org!.id, row.month, row.year);
      // C2-STRUCT: half-yearly PT (Kerala, Tamil Nadu) — period income from payslip history,
      // resolved before the transaction (reads earlier months, untouched by this run's delete).
      const ptHalfYearlyMap = await buildPtHalfYearlyContext(db, org!.id, empRows, row.month, row.year);

      await db.transaction(async (tx) => {
        await tx.delete(payslips).where(eq(payslips.payrollRunId, input.runId));

        let newTotalGross = 0;
        let newTotalDeductions = 0;
        let newTotalNet = 0;
        let newTotalPfEmployee = 0;
        let newTotalPfEmployer = 0;
        let newTotalEsiEmployee = 0;
        let newTotalEsiEmployer = 0;
        let newTotalPt = 0;
        let newTotalTds = 0;
        // Employees whose input could not be built (e.g. no state on record →
        // buildEmployeePayrollInput throws). Collected and surfaced on the run below,
        // never allowed to abort the whole write. See the catch inside the loop.
        const skipped: Array<{ employeeId: string; message: string }> = [];

        for (const { emp, st } of empRows) {
          let slip: ReturnType<typeof computeEmployeePayslip>;
          try {
            const empInput = buildEmployeePayrollInput(emp, st, row.month, row.year, lopMap.get(emp.id), ptHalfYearlyMap.get(emp.id));
            slip = computeEmployeePayslip(empInput, fyMonth, ceilings);
          } catch (e) {
            // One employee's bad data must NOT roll back the transaction and leave every
            // OTHER employee unpaid. Skip this one, record why, and continue — mirroring
            // the preview/totals path (computePayrollRunTotals catches the same throw per
            // employee, payroll-run-aggregates.ts). Narrow on purpose: only the pure
            // input build + compute is guarded, so a genuine DB error on the insert below
            // still aborts the transaction rather than committing a partial run.
            skipped.push({ employeeId: emp.id, message: e instanceof Error ? e.message : "Computation failed" });
            continue;
          }

          // ESI six-month rule: persist the membership the engine assessed so later
          // months carry it. Write on a NEW period (boundary re-assessment) OR when
          // membership CHANGED this month — because ENTRY is monthly: a non-member who
          // drops to/under the ceiling joins mid-period, and that must stick so the
          // retention lock applies for the rest of the period. (Exit only happens at a
          // boundary, so membership never flips true→false mid-period.)
          const currentPeriodStart = esiContributionPeriodStart(row.month, row.year);
          const storedStart = emp.esiMemberPeriodStart ? new Date(emp.esiMemberPeriodStart) : null;
          const samePeriod =
            !!storedStart &&
            storedStart.getFullYear() === currentPeriodStart.getFullYear() &&
            storedStart.getMonth() === currentPeriodStart.getMonth();
          const newMember = slip.statutoryDeductions.esi.memberForPeriod;
          if (!samePeriod || emp.esiMember !== newMember) {
            await tx
              .update(employees)
              .set({ esiMember: newMember, esiMemberPeriodStart: currentPeriodStart })
              .where(eq(employees.id, emp.id));
          }

          newTotalGross += slip.grossEarnings;
          newTotalDeductions += slip.totalDeductions;
          newTotalNet += slip.netPay;
          newTotalPfEmployee += slip.employeePF;
          newTotalPfEmployer += slip.employerPF;
          newTotalEsiEmployee += slip.employeeESI;
          newTotalEsiEmployer += slip.employerESI;
          newTotalPt += slip.professionalTax;
          newTotalTds += slip.tds;

          await tx.insert(payslips).values({
            orgId: org!.id,
            employeeId: emp.id,
            payrollRunId: row.id,
            month: row.month,
            year: row.year,
            paidDays: String(slip.daysWorked),
            lopDays: String(slip.lopDays),
            basic: String(slip.basicEarned),
            da: String(slip.daEarned),
            hra: String(slip.hraEarned),
            specialAllowance: String(slip.specialAllowance),
            lta: String(slip.lta),
            medicalAllowance: "0",
            conveyanceAllowance: "0",
            bonus: String(slip.bonus),
            grossEarnings: String(slip.grossEarnings),
            pfEmployee: String(slip.employeePF),
            pfEmployer: String(slip.employerPF),
            // Persist the PF wage base + the EPS/EPF employer split the engine computed, so the
            // statutory ECR carries the numbers the run actually used (not a reverse-engineered
            // pfEmployee ÷ 0.12) and the employer split is no longer inferred (defect 6).
            pfWageBase: String(slip.statutoryDeductions.pf.pfWageBase),
            pfEmployerEps: String(slip.statutoryDeductions.pf.employerEPS),
            pfEmployerEpf: String(slip.statutoryDeductions.pf.employerEPF),
            esiEmployee: String(slip.employeeESI),
            esiEmployer: String(slip.employerESI),
            professionalTax: String(slip.professionalTax),
            lwf: String(slip.lwf),
            tds: String(slip.tds),
            totalDeductions: String(slip.totalDeductions),
            netPay: String(slip.netPay),
            ytdGross: String(slip.ytdGross),
            ytdTds: String(slip.ytdTDS),
            // Persist real YTD net + employee PF on the same basis as ytdGross
            // (computed in computeEmployeePayslip). Replaces the old display-time
            // (thisMonth × 12) fabrication that made YTD Net exceed YTD Gross.
            ytdNet: String(slip.ytdNetPay),
            ytdPf: String(slip.ytdPF),
            taxRegimeUsed: emp.taxRegime,
            retainUntilDate,
          });
        }
        // Surface any skipped employees on the run so an admin who runs the write WITHOUT
        // opening the preview still sees them, named — the write path's own flag channel,
        // parity with the totals path. Merge into the existing workflow errors (the lock
        // step persisted the preview warnings here) and de-dup by (employeeId, message) so
        // a re-run — and a skip whose message already matches a lock-time flag — does not
        // pile up duplicates. payrollEmployeeCount becomes the count actually written.
        const prevMeta: PayrollWorkflowMeta = row.workflowMetadata ?? { errors: [], approvals: [] };
        const seenErr = new Set((prevMeta.errors ?? []).map((e) => `${e.employeeId ?? ""}|${e.message}`));
        // Both the effective-structure exclusions (resolved before the transaction) and the
        // compute-time skips reach the run's error channel, de-duped by (employeeId, message).
        // The exclusion message matches the lock/totals path exactly, so a flag the lock step
        // already persisted here collapses to one rather than doubling.
        const writePathFlags = [...excludedNoEffectiveStructure, ...skipped];
        const mergedErrors = [
          ...(prevMeta.errors ?? []),
          ...writePathFlags.filter((s) => !seenErr.has(`${s.employeeId}|${s.message}`)),
        ];
        await tx
          .update(payrollRuns)
          .set({
            pipelineStatus: "PAYSLIPS_GENERATED",
            status: legacyStatusForPipeline("PAYSLIPS_GENERATED"),
            totalGross: String(newTotalGross),
            totalDeductions: String(newTotalDeductions),
            totalNet: String(newTotalNet),
            totalPfEmployee: String(newTotalPfEmployee),
            totalPfEmployer: String(newTotalPfEmployer),
            totalEsiEmployee: String(newTotalEsiEmployee),
            totalEsiEmployer: String(newTotalEsiEmployer),
            totalPt: String(newTotalPt),
            totalTds: String(newTotalTds),
            workflowMetadata: {
              ...prevMeta,
              errors: mergedErrors,
              payrollEmployeeCount: empRows.length - skipped.length,
            },
          })
          .where(eq(payrollRuns.id, input.runId));
      });

      const [updated] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      return mapRunRow(updated!);
    }),

  approve: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        step: z.enum(["HR", "FINANCE", "CFO"]),
        decision: z.enum(["APPROVED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      
      const role = String(ctx.user!.role ?? "");
      const matrixRole = ctx.user!.matrixRole as string | null | undefined;
      const requiredModule = input.step === "HR" ? "hr" : "financial";
      
      if (!checkDbUserPermission(role, requiredModule, "write", matrixRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Permission denied: ${requiredModule}.write required for ${input.step} approval`,
        });
      }

      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.decision === "APPROVED" && process.env.DISABLE_PAYROLL_SOD !== "true") {
        if (input.step === "FINANCE" && row.approvedByHrId === ctx.user!.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Segregation of duties: cannot approve FINANCE step if you approved HR step.",
          });
        }
        if (
          input.step === "CFO" &&
          (row.approvedByHrId === ctx.user!.id || row.approvedByFinanceId === ctx.user!.id)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Segregation of duties: cannot approve CFO step if you approved a previous step.",
          });
        }
      }

      const meta: PayrollWorkflowMeta = row.workflowMetadata ?? { errors: [], approvals: [] };
      const approval = {
        id: crypto.randomUUID(),
        step: input.step,
        status: input.decision,
        decidedAt: new Date().toISOString(),
        comments: null as string | null,
      };
      meta.approvals = [...meta.approvals, approval];

      if (input.decision === "REJECTED") {
        const [updated] = await db
          .update(payrollRuns)
          .set({
            pipelineStatus: "FAILED",
            status: legacyStatusForPipeline("FAILED"),
            workflowMetadata: meta,
          })
          .where(eq(payrollRuns.id, input.runId))
          .returning();
        return mapRunRow(updated!);
      }

      const transitions: Record<string, Record<string, string>> = {
        HR: { PAYSLIPS_GENERATED: "HR_APPROVED" },
        FINANCE: { HR_APPROVED: "FINANCE_APPROVED" },
        CFO: { FINANCE_APPROVED: "CFO_APPROVED" },
      };
      const next = transitions[input.step]?.[row.pipelineStatus];
      if (!next) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot ${input.step}-approve from state ${row.pipelineStatus}.`,
        });
      }

      const [updated] = await db
        .update(payrollRuns)
        .set({
          pipelineStatus: next,
          status: legacyStatusForPipeline(next),
          workflowMetadata: meta,
          ...(input.step === "HR" ? { approvedByHrId: ctx.user!.id } : {}),
          ...(input.step === "FINANCE" ? { approvedByFinanceId: ctx.user!.id } : {}),
          ...(input.step === "CFO" ? { approvedByCfoId: ctx.user!.id } : {}),
        })
        .where(eq(payrollRuns.id, input.runId))
        .returning();
      return mapRunRow(updated!);
    }),

  // Step 13 — close the compute→file loop. A run at CFO_APPROVED implies statutory
  // returns; this creates the submission/challan RECORDS from the run's own payslips
  // (the missing producer — the indiaCompliance.filing.* push paths only ever consumed
  // records nothing created). One EPFO ECR + one ESI challan (members only) + one PT
  // challan per state + one salary-TDS (24Q) challan, all keyed by (org, period) so a
  // re-run upserts rather than duplicating. Identity is REFUSED, never fabricated: if a
  // levy is owed and its org identifier is absent, the whole step fails naming the field.
  generateStatutory: permissionProcedure("payroll", "write")
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      // Do NOT weaken the approval chain: records exist only for a CFO-approved run.
      if (row.pipelineStatus !== "CFO_APPROVED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CFO approval required first." });
      }

      // The run's payslips, with each member's name (users) and state (employees).
      const slips = await db
        .select({
          pfEmployee: payslips.pfEmployee,
          pfEmployer: payslips.pfEmployer,
          pfEmployerEps: payslips.pfEmployerEps,
          pfEmployerEpf: payslips.pfEmployerEpf,
          pfWageBase: payslips.pfWageBase,
          esiEmployee: payslips.esiEmployee,
          esiEmployer: payslips.esiEmployer,
          professionalTax: payslips.professionalTax,
          tds: payslips.tds,
          state: employees.state,
        })
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .where(eq(payslips.payrollRunId, row.id));

      const [orgRow] = await db
        .select({
          epfCode: organizations.epfCode,
          esiEstablishmentNumber: organizations.esiEstablishmentNumber,
          ptRegistrationNumber: organizations.ptRegistrationNumber,
        })
        .from(organizations)
        .where(eq(organizations.id, org!.id));

      const num = (v: string | null) => Number(v || 0);

      // Which levies does this run owe?
      let totPfEmployee = 0, totPfEmployer = 0, totEps = 0, totEpf = 0, totTds = 0;
      let epfOwed = false;
      const esiMembers = slips.filter((s) => num(s.esiEmployee) > 0);
      const ptByState = new Map<string, { total: number; count: number }>();
      for (const s of slips) {
        totPfEmployee += num(s.pfEmployee);
        totPfEmployer += num(s.pfEmployer);
        totEps += num(s.pfEmployerEps);
        totEpf += num(s.pfEmployerEpf);
        totTds += num(s.tds);
        if (num(s.pfWageBase) > 0 || num(s.pfEmployee) > 0) epfOwed = true;
        if (num(s.professionalTax) > 0) {
          const st = (s.state ?? "").trim();
          const cur = ptByState.get(st) ?? { total: 0, count: 0 };
          cur.total += num(s.professionalTax);
          cur.count += 1;
          ptByState.set(st, cur);
        }
      }
      const esiOwed = esiMembers.length > 0;
      const ptOwed = ptByState.size > 0;

      // Refuse before creating anything — name the field and where to set it, never fabricate.
      if (epfOwed && !orgRow?.epfCode?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot generate the EPF ECR: the organisation has no EPF establishment code. " +
            "Set the EPF code in Organisation Settings → Statutory Identity before generating statutory outputs.",
        });
      }
      if (esiOwed && !orgRow?.esiEstablishmentNumber?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot generate the ESI challan: the organisation has no ESI establishment number. " +
            "Set the ESI establishment number in Organisation Settings → Statutory Identity before generating statutory outputs.",
        });
      }
      if (ptOwed && !orgRow?.ptRegistrationNumber?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot generate the PT challan: the organisation has no professional-tax registration number. " +
            "Set the PT registration number in Organisation Settings → Statutory Identity before generating statutory outputs.",
        });
      }

      await db.transaction(async (tx) => {
        if (epfOwed) {
          const epfVals = {
            totalEmployeeContribution: String(totPfEmployee),
            totalEmployerContribution: String(totPfEmployer),
            totalEpsContribution: String(totEps),
            totalEpfContribution: String(totEpf),
          };
          await tx
            .insert(epfoEcrSubmissions)
            .values({ orgId: org!.id, month: row.month, year: row.year, ...epfVals })
            .onConflictDoUpdate({
              target: [epfoEcrSubmissions.orgId, epfoEcrSubmissions.month, epfoEcrSubmissions.year],
              set: epfVals,
            });
        }
        if (esiOwed) {
          const esiVals = {
            totalEmployees: esiMembers.length,
            totalEmployeeContribution: String(esiMembers.reduce((a, s) => a + num(s.esiEmployee), 0)),
            totalEmployerContribution: String(esiMembers.reduce((a, s) => a + num(s.esiEmployer), 0)),
          };
          await tx
            .insert(esiChallanRecords)
            .values({ orgId: org!.id, month: row.month, year: row.year, ...esiVals })
            .onConflictDoUpdate({
              target: [esiChallanRecords.orgId, esiChallanRecords.month, esiChallanRecords.year],
              set: esiVals,
            });
        }
        for (const [stateName, agg] of ptByState) {
          const ptVals = {
            ptRegistrationNumber: orgRow!.ptRegistrationNumber,
            totalEmployees: agg.count,
            totalPtDeducted: String(agg.total),
          };
          await tx
            .insert(ptChallanRecords)
            .values({ orgId: org!.id, stateCode: stateName, month: row.month, year: row.year, ...ptVals })
            .onConflictDoUpdate({
              target: [
                ptChallanRecords.orgId,
                ptChallanRecords.stateCode,
                ptChallanRecords.month,
                ptChallanRecords.year,
              ],
              set: ptVals,
            });
        }
        if (slips.length > 0) {
          // Salary TDS is section 192, filed on Form 24Q. A wrong section is a rejected return.
          const tdsVals = { totalTdsDeducted: String(totTds) };
          await tx
            .insert(tdsChallanRecords)
            .values({ orgId: org!.id, tdsSection: "192", formType: "24Q", month: row.month, year: row.year, ...tdsVals })
            .onConflictDoUpdate({
              target: [tdsChallanRecords.orgId, tdsChallanRecords.month, tdsChallanRecords.year],
              set: tdsVals,
            });
        }

        const next = "STATUTORY_GENERATED";
        await tx
          .update(payrollRuns)
          .set({ pipelineStatus: next, status: legacyStatusForPipeline(next) })
          .where(eq(payrollRuns.id, row.id));
      });

      const [updated] = await db
        .select()
        .from(payrollRuns)
        .where(eq(payrollRuns.id, row.id));
      return mapRunRow(updated!);
    }),

  // Run-scoped statutory outputs — so the admin who ran the payroll sees what step 13
  // produced without leaving the payroll surface. Reads the records by the run's period.
  statutoryOutputs: permissionProcedure("payroll", "read")
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [run] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      const [epfoEcr] = await db
        .select()
        .from(epfoEcrSubmissions)
        .where(and(eq(epfoEcrSubmissions.orgId, org!.id), eq(epfoEcrSubmissions.month, run.month), eq(epfoEcrSubmissions.year, run.year)));
      const [esiChallan] = await db
        .select()
        .from(esiChallanRecords)
        .where(and(eq(esiChallanRecords.orgId, org!.id), eq(esiChallanRecords.month, run.month), eq(esiChallanRecords.year, run.year)));
      const ptChallans = await db
        .select()
        .from(ptChallanRecords)
        .where(and(eq(ptChallanRecords.orgId, org!.id), eq(ptChallanRecords.month, run.month), eq(ptChallanRecords.year, run.year)));
      const [tdsChallan] = await db
        .select()
        .from(tdsChallanRecords)
        .where(and(eq(tdsChallanRecords.orgId, org!.id), eq(tdsChallanRecords.month, run.month), eq(tdsChallanRecords.year, run.year)));
      return { epfoEcr: epfoEcr ?? null, esiChallan: esiChallan ?? null, ptChallans, tdsChallan: tdsChallan ?? null };
    }),

  complete: permissionProcedure("payroll", "write")
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.pipelineStatus !== "STATUTORY_GENERATED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Statutory step must be completed first." });
      }
      const next = "COMPLETED";
      const [updated] = await db
        .update(payrollRuns)
        .set({
          pipelineStatus: next,
          status: legacyStatusForPipeline(next),
          paidAt: new Date(),
        })
        .where(eq(payrollRuns.id, input.runId))
        .returning();
      return mapRunRow(updated!);
    }),
});

const payslipsRouter = router({
  myPayslips: protectedProcedure
    .input(z.object({ year: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      if (!org || !user) return [];

      const [emp] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.orgId, org.id), eq(employees.userId, user.id)));

      if (!emp) return [];

      const rows = await db
        .select()
        .from(payslips)
        .where(and(eq(payslips.employeeId, emp.id), fyCondition(input.year)))
        .orderBy(desc(payslips.year), desc(payslips.month));

      return rows.map(mapPayslipRow);
    }),
});

/**
 * M-05: refuse editing a structure VERSION once any payslip was computed from it. The
 * correct route for a change after payslips exist is arrears in the current month (per
 * the CA's ruling) or a NEW financial-year version — never mutating a version that has
 * already fed a filed return. A version "has payslips" when an employee linked to its
 * family has a payslip whose (year, month) falls inside the version's effective window.
 */
async function versionHasPayslips(
  db: DbOrTx,
  orgId: string,
  version: typeof salaryStructures.$inferSelect,
): Promise<boolean> {
  const from = version.effectiveFrom;
  const to = version.effectiveTo; // null = open-ended
  const rows = await db
    .select({ month: payslips.month, year: payslips.year })
    .from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id))
    .where(
      and(
        eq(payslips.orgId, orgId),
        eq(employees.salaryStructureId, version.familyId),
      ),
    );
  return rows.some((r) => {
    const period = new Date(r.year, r.month - 1, 1);
    return period >= from && (to === null || period < to);
  });
}

const salaryStructuresRouter = router({
  // Assign-time list: one row per FAMILY (the latest live version), so a superseded
  // version is readable elsewhere but never appears as a selectable option here.
  list: permissionProcedure("payroll", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select()
      .from(salaryStructures)
      .where(and(eq(salaryStructures.orgId, org!.id), eq(salaryStructures.isArchived, false)))
      .orderBy(desc(salaryStructures.effectiveFrom));
    // Collapse to the latest-effective version per family (rows are effectiveFrom-desc).
    const byFamily = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!byFamily.has(r.familyId)) byFamily.set(r.familyId, r);
    return [...byFamily.values()];
  }),

  // Every version of a family, newest window first — for history / audit views. A
  // superseded version stays fully readable here (Form-16, re-runs depend on it).
  listVersions: permissionProcedure("payroll", "read")
    .input(z.object({ familyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(salaryStructures)
        .where(
          and(
            eq(salaryStructures.orgId, org!.id),
            eq(salaryStructures.familyId, input.familyId),
          ),
        )
        .orderBy(desc(salaryStructures.effectiveFrom));
    }),

  upsert: permissionProcedure("payroll", "write")
    .input(
      z.object({
        id: z.string().uuid().optional(),
        structureName: z.string().min(1).max(200),
        ctcAnnual: z.coerce.number().nonnegative(),
        basicPercent: z.coerce.number().min(0).max(100).default(40),
        daPercent: z.coerce.number().min(0).max(100).default(0),
        hraPercentOfBasic: z.coerce.number().min(0).max(100).default(50),
        ltaAnnual: z.coerce.number().nonnegative().default(0),
        medicalAllowanceAnnual: z.coerce.number().nonnegative().default(15000),
        conveyanceAllowanceAnnual: z.coerce.number().nonnegative().default(19200),
        bonusAnnual: z.coerce.number().nonnegative().default(0),
        effectiveFrom: z.coerce.date(),
        effectiveTo: z.coerce.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const values = {
        structureName: input.structureName,
        ctcAnnual: input.ctcAnnual.toFixed(2),
        basicPercent: input.basicPercent.toFixed(2),
        daPercent: input.daPercent.toFixed(2),
        hraPercentOfBasic: input.hraPercentOfBasic.toFixed(2),
        ltaAnnual: input.ltaAnnual.toFixed(2),
        medicalAllowanceAnnual: input.medicalAllowanceAnnual.toFixed(2),
        conveyanceAllowanceAnnual: input.conveyanceAllowanceAnnual.toFixed(2),
        bonusAnnual: input.bonusAnnual.toFixed(2),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      };
      if (input.id) {
        // Edit an existing VERSION — refused once payslips have been computed from it.
        const [existing] = await db
          .select()
          .from(salaryStructures)
          .where(and(eq(salaryStructures.id, input.id), eq(salaryStructures.orgId, org!.id)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        if (await versionHasPayslips(db, org!.id, existing)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This salary-structure version already has payslips and cannot be edited. " +
              "Post the change as arrears in the current month, or create a new " +
              "financial-year version.",
          });
        }
        const [updated] = await db
          .update(salaryStructures)
          .set(values)
          .where(and(eq(salaryStructures.id, input.id), eq(salaryStructures.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }
      // Create a brand-new family: the first version's familyId is its own id, so an
      // employee link (a familyId) always references a live row (the origin version).
      // Generate the id up front so id === familyId in a single insert.
      const newId = crypto.randomUUID();
      const [created] = await db
        .insert(salaryStructures)
        .values({ id: newId, orgId: org!.id, familyId: newId, ...values })
        .returning();
      return created;
    }),

  // Add a new financial-year version to an existing family. Auto-closes the prior open
  // version (effectiveTo = the instant the new one starts) in one transaction, so two
  // versions of a family can never be live at once.
  newVersion: permissionProcedure("payroll", "write")
    .input(
      z.object({
        familyId: z.string().uuid(),
        structureName: z.string().min(1).max(200),
        ctcAnnual: z.coerce.number().nonnegative(),
        basicPercent: z.coerce.number().min(0).max(100).default(40),
        daPercent: z.coerce.number().min(0).max(100).default(0),
        hraPercentOfBasic: z.coerce.number().min(0).max(100).default(50),
        ltaAnnual: z.coerce.number().nonnegative().default(0),
        medicalAllowanceAnnual: z.coerce.number().nonnegative().default(15000),
        conveyanceAllowanceAnnual: z.coerce.number().nonnegative().default(19200),
        bonusAnnual: z.coerce.number().nonnegative().default(0),
        effectiveFrom: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db.transaction(async (tx) => {
        const family = await tx
          .select()
          .from(salaryStructures)
          .where(
            and(
              eq(salaryStructures.familyId, input.familyId),
              eq(salaryStructures.orgId, org!.id),
            ),
          );
        if (family.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Structure family not found" });
        if (family.some((v) => v.effectiveFrom >= input.effectiveFrom)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "New version must start after every existing version in the family.",
          });
        }
        // Auto-close the current open version at the instant the new one begins.
        await tx
          .update(salaryStructures)
          .set({ effectiveTo: input.effectiveFrom })
          .where(
            and(
              eq(salaryStructures.familyId, input.familyId),
              eq(salaryStructures.orgId, org!.id),
              isNull(salaryStructures.effectiveTo),
            ),
          );
        const [created] = await tx
          .insert(salaryStructures)
          .values({
            orgId: org!.id,
            familyId: input.familyId,
            structureName: input.structureName,
            ctcAnnual: input.ctcAnnual.toFixed(2),
            basicPercent: input.basicPercent.toFixed(2),
            daPercent: input.daPercent.toFixed(2),
            hraPercentOfBasic: input.hraPercentOfBasic.toFixed(2),
            ltaAnnual: input.ltaAnnual.toFixed(2),
            medicalAllowanceAnnual: input.medicalAllowanceAnnual.toFixed(2),
            conveyanceAllowanceAnnual: input.conveyanceAllowanceAnnual.toFixed(2),
            bonusAnnual: input.bonusAnnual.toFixed(2),
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
          })
          .returning();
        return created;
      });
    }),

  delete: permissionProcedure("payroll", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      // Resolve the version's family: employees link to the FAMILY, so a version cannot
      // be deleted while any employee is assigned to its family (deleting the origin
      // version — id === familyId — would also null those links via the FK).
      const [version] = await db
        .select({ familyId: salaryStructures.familyId })
        .from(salaryStructures)
        .where(and(eq(salaryStructures.id, input.id), eq(salaryStructures.orgId, org!.id)));
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });
      const inUse = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.salaryStructureId, version.familyId), eq(employees.orgId, org!.id)))
        .limit(1);
      if (inUse.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot delete: this salary structure is assigned to one or more employees.",
        });
      }
      const [deleted] = await db
        .delete(salaryStructures)
        .where(and(eq(salaryStructures.id, input.id), eq(salaryStructures.orgId, org!.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),

  archive: permissionProcedure("payroll", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [archived] = await db
        .update(salaryStructures)
        .set({ isArchived: true })
        .where(and(eq(salaryStructures.id, input.id), eq(salaryStructures.orgId, org!.id)))
        .returning();
      if (!archived) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),
});

export const payrollRouter = router({
  runs: runsRouter,
  payslips: payslipsRouter,
  salaryStructures: salaryStructuresRouter,

  generateForm16ToDms: permissionProcedure("payroll", "write")
    .input(z.object({ employeeId: z.string().uuid(), fy: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      if (!/^\d{4}-\d{4}$/.test(input.fy)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid fy (expected YYYY-YYYY)" });
      const fyStart = Number(input.fy.split("-")[0]);
      const fyEnd = fyStart + 1;
      
      const [empRow] = await db
        .select({ emp: employees, userRow: users })
        .from(employees)
        .innerJoin(users, eq(employees.userId, users.id))
        .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)))
        .limit(1);
      if (!empRow) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const slips = await db
        .select()
        .from(payslips)
        .where(
          and(
            eq(payslips.orgId, org!.id),
            eq(payslips.employeeId, empRow.emp.id),
            or(
              and(eq(payslips.year, fyStart), gte(payslips.month, 4)),
              and(eq(payslips.year, fyEnd), lte(payslips.month, 3)),
            ),
          ),
        );
      if (slips.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: `No payslips on file for FY ${input.fy}` });

      const orgRow = org as typeof organizations.$inferSelect & { settings?: unknown };
      // Decrypt the stored (envelope) PAN back to plaintext for the certificate; legacy
      // pre-encryption plaintext rows pass through unchanged.
      const employeePan = await decryptPan(empRow.emp.pan);
      const pdfInput = buildForm16Input({
        org: orgRow,
        employee: { ...empRow.emp, pan: employeePan ?? null, name: empRow.userRow.name as string },
        fySlips: slips,
        financialYear: input.fy,
      });
      const buffer = await generateForm16PDF(pdfInput);

      const [doc] = await db.insert(documents).values({
        orgId: org!.id,
        name: `Form16_${empRow.emp.employeeId ?? empRow.emp.id}_${input.fy}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: buffer.length,
        storageKey: "",
        sha256: "",
        currentVersion: 1,
        folderPath: null,
        classification: "internal",
        scanStatus: "pending",
        retentionPolicyId: null,
        sourceType: "form16",
        sourceId: empRow.emp.id,
        ownerId: user!.id,
      }).returning();
      if (!doc) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create document" });

      const key = buildDocumentKey(doc.id, 1, "pdf");
      const put = await putObject({ orgId: org!.id, key, body: buffer, mimeType: "application/pdf" });
      await db.update(documents).set({ storageKey: put.key, sha256: put.sha256, updatedAt: new Date() }).where(eq(documents.id, doc.id));
      await db.insert(documentVersions).values({ documentId: doc.id, version: 1, storageKey: put.key, sha256: put.sha256, sizeBytes: put.sizeBytes, uploadedById: user!.id });
      await enqueueVirusScan(doc.id);

      return { ok: true, documentId: doc.id };
    }),

  /**
   * Export a payroll run to a bank-disbursement file (NEFT / NACH-Credit).
   *
   * Returns the file body base64-encoded so the web client can download
   * it without an extra round-trip. We don't push the file to S3 yet —
   * payroll teams overwhelmingly want a one-click download into their
   * bank portal, not a managed file. Storage + audit trail of exported
   * files is a P2 follow-up.
   */
  exportBankFile: permissionProcedure("payroll", "write")
    .input(
      z.object({
        runId: z.string().uuid(),
        format: z.enum([
          "hdfc_neft",
          "icici_connected_banking",
          "sbi_cmp",
          "axis_power_access",
          "kotak_fynn",
          "nach_credit",
          "generic_neft",
        ]),
        debitAccount: z.string().min(4).max(35),
        valueDate: z.coerce.date().optional(),
        sponsorBankCode: z.string().optional(),
        utilityCode: z.string().optional(),
        utilityName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [run] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });

      if (!["CFO_APPROVED", "STATUTORY_GENERATED", "COMPLETED"].includes(run.pipelineStatus)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Payroll run must be CFO approved to generate bank disbursement files.",
        });
      }

      // Pull all payslips for the run, joined to the employee for bank/IFSC.
      const slipRows = await db
        .select({ slip: payslips, emp: employees })
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .where(and(eq(payslips.payrollRunId, run.id), eq(payslips.orgId, org!.id)));
      if (slipRows.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No payslips computed for this run yet — generate payslips first.",
        });
      }

      const { generateBankFile } = await import("../lib/india/bank-file-generator.js");

      const valueDate =
        (input.valueDate ?? new Date()).toISOString().slice(0, 10);

      const bankRows = slipRows.map(({ slip, emp }: { slip: typeof payslips.$inferSelect; emp: typeof employees.$inferSelect }) => ({
        employeeId: emp.employeeId ?? String(emp.id).slice(0, 12),
        employeeName: emp.title ?? emp.employeeId ?? "Employee",
        bankAccountNumber: emp.bankAccountNumber ?? "",
        bankIfsc: emp.bankIfsc ?? "",
        bankName: emp.bankName ?? "",
        amount: Number(slip.netPay || 0),
        valueDate,
        narration: `Payroll ${slip.month}/${slip.year}`,
      }));

      const result = generateBankFile({
        format: input.format,
        rows: bankRows,
        debitAccount: input.debitAccount,
        ...(input.sponsorBankCode ? { sponsorBankCode: input.sponsorBankCode } : {}),
        ...(input.utilityCode ? { utilityCode: input.utilityCode } : {}),
        ...(input.utilityName ? { utilityName: input.utilityName } : {}),
        fileSlug: `payroll-${run.year}-${String(run.month).padStart(2, "0")}`,
      });

      return {
        filename: result.filename,
        contentBase64: Buffer.from(result.body, "utf8").toString("base64"),
        byteLength: result.byteLength,
        recordCount: result.recordCount,
        totalAmount: result.totalAmount,
        skipped: result.skipped,
      };
    }),

  taxPreview: protectedProcedure
    .input(
      z.object({
        employeeId: z.string(),
        financialYear: z.string().regex(/^\d{4}-\d{4}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      if (!org || !user) return null;

      const fyStart = Number(input.financialYear.split("-")[0]);
      if (!Number.isFinite(fyStart)) return null;

      let targetEmployeeId = input.employeeId;
      if (!targetEmployeeId) {
        const [empSelf] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.orgId, org.id), eq(employees.userId, user.id)));
        if (!empSelf) return null;
        targetEmployeeId = empSelf.id;
      }

      const [employee] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, targetEmployeeId), eq(employees.orgId, org.id)));
      if (!employee) return null;

      // M-05: resolve the structure version in force for this financial year (India FY
      // starts 1 April of fyStart), not the current version — so a prior-year tax
      // preview reflects the structure that actually applied then.
      const structure = employee.salaryStructureId
        ? await resolveSalaryStructureForPeriod(
            db,
            org.id,
            employee.salaryStructureId,
            new Date(fyStart, 3, 1),
          )
        : null;

      const slipRows = await db
        .select()
        .from(payslips)
        .where(and(eq(payslips.employeeId, employee.id), fyCondition(fyStart)));

      const fyGross = slipRows.reduce(
        (s: number, p: (typeof slipRows)[number]) => s + Number(p.grossEarnings || 0),
        0,
      );
      const monthsWithData = slipRows.length;

      const oldProfile = buildTaxProfileFromEmployee({
        employee: { ...employee, taxRegime: "old" },
        structure,
        fyGross,
        monthsWithData,
        fyStart,
      });
      const newProfile = buildTaxProfileFromEmployee({
        employee: { ...employee, taxRegime: "new" },
        structure,
        fyGross,
        monthsWithData,
        fyStart,
      });

      const oldRegime = regimeSlice(computeTax({ ...oldProfile, regime: "OLD" }));
      const newRegime = regimeSlice(computeTax({ ...newProfile, regime: "NEW" }));

      const oldTax = oldRegime.totalTaxLiability;
      const newTax = newRegime.totalTaxLiability;
      const recommendation = newTax <= oldTax ? ("NEW" as const) : ("OLD" as const);
      const savings = Math.abs(oldTax - newTax);

      return {
        recommendation,
        savings,
        oldRegime,
        newRegime,
        currentRegime: employee.taxRegime === "old" ? "OLD" : "NEW",
        regimeLocked: false,
      };
    }),
});
