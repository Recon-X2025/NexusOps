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
  eq,
  and,
  or,
  desc,
  gte,
  lte,
  max,
  type PayrollWorkflowMeta,
} from "@nexusops/db";
import { router, permissionProcedure, protectedProcedure } from "../lib/trpc";
import { computeTax, type EmployeeTaxProfile } from "../lib/india-tax-engine";
import { computeEmployeePayslip } from "../lib/payroll-cycle";
import {
  buildEmployeePayrollInput,
  calendarToFyMonth,
  computePayrollRunTotals,
} from "../services/payroll-run-aggregates";

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
    totalEmployerCost: tg + tpr,
    totalPF: tpe + tpr,
    totalESI: 0,
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
function taxComputationFromPayslip(p: typeof payslips.$inferSelect) {
  const grossM = Number(p.grossEarnings || 0);
  const basicM = Number(p.basic || 0) || Math.round(grossM * 0.4);
  const hraM = Number(p.hra || 0) || Math.round(basicM * 0.5);
  const specM = Number(p.specialAllowance || 0) || Math.max(0, grossM - basicM - hraM);
  const regime: "OLD" | "NEW" = p.taxRegimeUsed === "old" ? "OLD" : "NEW";
  const profile: EmployeeTaxProfile = {
    regime,
    annualCTC: Math.max(grossM * 12, 1),
    basicMonthly: basicM,
    hraMonthly: hraM,
    specialAllowance: specM,
    lta: Number(p.lta || 0) || 30_000,
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0,
    otherExemptions: 0,
    employeePFMonthly: Number(p.pfEmployee || 0),
    employerPFMonthly: Number(p.pfEmployer || 0),
    professionalTax: Number(p.professionalTax || 0) * 12,
    joiningMonth: 1,
    monthsInFY: 12,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
  };
  const t = computeTax(profile);
  return {
    regime,
    taxableIncome: t.taxableIncome,
    totalTaxLiability: t.totalTaxLiability,
    monthlyTDS: t.monthlyTDS,
  };
}

function mapPayslipRow(p: typeof payslips.$inferSelect) {
  return {
    id: p.id,
    month: p.month,
    year: p.year,
    basicEarned: Number(p.basic || 0),
    hraEarned: Number(p.hra || 0),
    specialAllowance: Number(p.specialAllowance || 0),
    lta: Number(p.lta || 0),
    overtime: 0,
    arrears: 0,
    bonus: Number(p.bonus || 0),
    otherEarnings: 0,
    grossEarnings: Number(p.grossEarnings || 0),
    employeePF: Number(p.pfEmployee || 0),
    employeeESI: 0,
    professionalTax: Number(p.professionalTax || 0),
    lwf: Number(p.lwf || 0),
    tds: Number(p.tds || 0),
    otherDeductions: 0,
    totalDeductions: Number(p.totalDeductions || 0),
    netPay: Number(p.netPay || 0),
    ytdGross: Number(p.ytdGross || 0),
    ytdPF: Number(p.pfEmployee || 0) * 12,
    ytdTDS: Number(p.ytdTds || 0),
    ytdNetPay: Number(p.netPay || 0) * 12,
    taxComputation: taxComputationFromPayslip(p),
    pdfUrl: p.pdfUrl,
  };
}

function buildTaxProfileFromEmployee(args: {
  employee: typeof employees.$inferSelect;
  structure: typeof salaryStructures.$inferSelect | null;
  fyGross: number;
  monthsWithData: number;
}): EmployeeTaxProfile {
  const { employee, structure, fyGross, monthsWithData } = args;
  const annualCTC = structure ? Number(structure.ctcAnnual || 0) : fyGross > 0 ? fyGross : 1_200_000;
  const basicPct = structure ? Number(structure.basicPercent || 40) / 100 : 0.4;
  const hraPctOfBasic = structure ? Number(structure.hraPercentOfBasic || 50) / 100 : 0.5;
  const basicMonthly = (annualCTC * basicPct) / 12;
  const hraMonthly = basicMonthly * hraPctOfBasic;
  const specialMonthly = Math.max(0, annualCTC / 12 - basicMonthly - hraMonthly - 2500);
  const ltaAnnual = structure ? Number(structure.ltaAnnual || 0) : 30_000;
  return {
    regime: employee.taxRegime === "old" ? "OLD" : "NEW",
    annualCTC,
    basicMonthly,
    hraMonthly,
    specialAllowance: specialMonthly,
    lta: ltaAnnual,
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section80TTA: 0,
    section24b: 0,
    hraExemption: 0,
    otherExemptions: 0,
    employeePFMonthly: basicMonthly * 0.12 > 1800 ? 1800 : Math.round(basicMonthly * 0.12),
    employerPFMonthly: basicMonthly * 0.12 > 1800 ? 1800 : Math.round(basicMonthly * 0.12),
    professionalTax: 2400,
    joiningMonth: 1,
    monthsInFY: monthsWithData > 0 ? Math.min(12, monthsWithData) : 12,
    previousEmployerIncome: 0,
    previousEmployerTDS: 0,
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

const runsRouter = router({
  list: permissionProcedure("hr", "read").input(z.object({}).optional()).query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.orgId, org!.id))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
    return rows.map(mapRunRow);
  }),

  get: permissionProcedure("hr", "read")
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

  create: permissionProcedure("hr", "write")
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

  lockPeriod: permissionProcedure("hr", "write")
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

  advanceComputationStep: permissionProcedure("hr", "write")
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

  computePayslips: permissionProcedure("hr", "write")
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
      const empRows = await db
        .select({ emp: employees, st: salaryStructures })
        .from(employees)
        .innerJoin(salaryStructures, eq(employees.salaryStructureId, salaryStructures.id))
        .where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")));

      await db.transaction(async (tx) => {
        await tx.delete(payslips).where(eq(payslips.payrollRunId, input.runId));
        for (const { emp, st } of empRows) {
          const empInput = buildEmployeePayrollInput(emp, st, row.month, row.year);
          const slip = computeEmployeePayslip(empInput, fyMonth);
          await tx.insert(payslips).values({
            orgId: org!.id,
            employeeId: emp.id,
            payrollRunId: row.id,
            month: row.month,
            year: row.year,
            basic: String(slip.basicEarned),
            hra: String(slip.hraEarned),
            specialAllowance: String(slip.specialAllowance),
            lta: String(slip.lta),
            medicalAllowance: "0",
            conveyanceAllowance: "0",
            bonus: String(slip.bonus),
            grossEarnings: String(slip.grossEarnings),
            pfEmployee: String(slip.employeePF),
            pfEmployer: String(slip.employerPF),
            professionalTax: String(slip.professionalTax),
            lwf: String(slip.lwf),
            tds: String(slip.tds),
            totalDeductions: String(slip.totalDeductions),
            netPay: String(slip.netPay),
            ytdGross: String(slip.ytdGross),
            ytdTds: String(slip.ytdTDS),
            taxRegimeUsed: emp.taxRegime,
          });
        }
        await tx
          .update(payrollRuns)
          .set({
            pipelineStatus: "PAYSLIPS_GENERATED",
            status: legacyStatusForPipeline("PAYSLIPS_GENERATED"),
          })
          .where(eq(payrollRuns.id, input.runId));
      });

      const [updated] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      return mapRunRow(updated!);
    }),

  approve: permissionProcedure("hr", "write")
    .input(
      z.object({
        runId: z.string().uuid(),
        step: z.enum(["HR", "FINANCE", "CFO"]),
        decision: z.enum(["APPROVED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

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

  generateStatutory: permissionProcedure("hr", "write")
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.pipelineStatus !== "CFO_APPROVED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CFO approval required first." });
      }
      const next = "STATUTORY_GENERATED";
      const [updated] = await db
        .update(payrollRuns)
        .set({ pipelineStatus: next, status: legacyStatusForPipeline(next) })
        .where(eq(payrollRuns.id, input.runId))
        .returning();
      return mapRunRow(updated!);
    }),

  complete: permissionProcedure("hr", "write")
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

export const payrollRouter = router({
  runs: runsRouter,
  payslips: payslipsRouter,

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

      const structure = employee.salaryStructureId
        ? (
            await db
              .select()
              .from(salaryStructures)
              .where(eq(salaryStructures.id, employee.salaryStructureId))
          )[0] ?? null
        : null;

      const slipRows = await db
        .select()
        .from(payslips)
        .where(and(eq(payslips.employeeId, employee.id), fyCondition(fyStart)));

      const fyGross = slipRows.reduce((s, p) => s + Number(p.grossEarnings || 0), 0);
      const monthsWithData = slipRows.length;

      const oldProfile = buildTaxProfileFromEmployee({
        employee: { ...employee, taxRegime: "old" },
        structure,
        fyGross,
        monthsWithData,
      });
      const newProfile = buildTaxProfileFromEmployee({
        employee: { ...employee, taxRegime: "new" },
        structure,
        fyGross,
        monthsWithData,
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
