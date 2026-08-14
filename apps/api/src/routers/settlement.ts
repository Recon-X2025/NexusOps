/**
 * Full-and-final settlement composition.
 * ─────────────────────────────────────────────────────────────────────────────
 * Decision 1 (owner): settlement is a SEPARATE event, not folded into the payroll run — the
 * two-working-day clock cannot wait for the payroll calendar. This composes the leaver's
 * settlement from its parts (last salary pro-rated to endDate · leave encashment, annual only ·
 * gratuity, if eligible · − recoveries) into one figure, stores every component as it was at
 * settlement (disputable/auditable), and is IDEMPOTENT: the `final_settlements` unique index on
 * employee makes a second settle a CONFLICT before anything is written or drawn — so it can
 * never pay twice. Completing it stamps the settlement date and sets F&F Status to completed
 * (semi-computed; the manual override remains for settlements done outside the system).
 *
 * TDS: last salary is taxed in the run; gratuity (≤₹20L) and encashment (≤₹25L) are exempt, and
 * any taxable excess is surfaced (`taxableGratuity` / `taxableEncashment`) for annual
 * reconciliation rather than mis-withheld here at a guessed slab.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  employees,
  salaryStructures,
  offboardingDetails,
  gratuitySettlements,
  finalSettlements,
  leavePolicies,
  leaveBalances,
  leaveAccrualEvents,
  leaveExitRules,
  eq,
  and,
  sum,
  type DbOrTx,
} from "@coheronconnect/db";
import {
  computeEmployeePayslip,
  computeGratuity,
  computeLeaveEncashment,
  composeSettlement,
} from "@coheronconnect/payroll-math";
import { router, permissionProcedure } from "../lib/trpc";
import { buildEmployeePayrollInput, calendarToFyMonth } from "../services/payroll-run-aggregates";
import { resolveSalaryStructureForPeriod } from "../lib/india/salary-structure-resolver";

/** Monthly Basic + DA from a structure — the gratuity/encashment wage base (Basic + DA). */
function monthlyBasicPlusDA(struct: typeof salaryStructures.$inferSelect | undefined): number {
  if (!struct) return 0;
  const ctc = Number(struct.ctcAnnual || 0);
  const basicPct = Number(struct.basicPercent ?? 40) / 100;
  const daPct = Number(struct.daPercent ?? 0) / 100;
  // Rounded to match gratuity.ts's wage base exactly, so a settlement's computed gratuity
  // equals a standalone gratuity_settlements record for the same employee.
  return Math.round((ctc * (basicPct + daPct)) / 12);
}

/** Completed years + trailing months of continuous service (for the gratuity gate). */
function serviceTenure(start: Date, end: Date): { completedYears: number; trailingMonths: number } {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  return { completedYears: Math.floor(months / 12), trailingMonths: months % 12 };
}

const recoveriesInput = z.object({
  noticeShortfall: z.number().min(0).optional(),
  advanceRecovery: z.number().min(0).optional(),
  assetRecovery: z.number().min(0).optional(),
});

/** Resolve every settlement component for a leaver as at their last working day. */
async function resolveComponents(
  db: DbOrTx,
  orgId: string,
  employeeId: string,
  reason: string | undefined,
) {
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.orgId, orgId)))
    .limit(1);
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
  if (!emp.endDate)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No last working day on record — offboard the employee first.",
    });

  const endDate = new Date(emp.endDate);
  const endMonth = endDate.getMonth() + 1;
  const endYear = endDate.getFullYear();
  const struct = emp.salaryStructureId
    ? await resolveSalaryStructureForPeriod(db, orgId, emp.salaryStructureId, endDate)
    : null;

  // Last salary: the pro-rated final month, computed on demand via the EXIT-DATE engine (net) so
  // the settlement does not wait for the payroll run to meet the clock.
  let lastSalary = 0;
  if (struct) {
    const slip = computeEmployeePayslip(
      buildEmployeePayrollInput(emp, struct, endMonth, endYear),
      calendarToFyMonth(endMonth),
    );
    lastSalary = slip.netPay;
  }

  const wages = monthlyBasicPlusDA(struct ?? undefined);
  // Gross monthly (Base Pay / 12) — the alternate encashment basis (greytHR: some orgs use gross).
  const monthlyGross = struct ? Math.round(Number(struct.ctcAnnual || 0) / 12) : 0;

  // Gratuity: an existing standalone settlement wins (consistency); else compute, eligibility
  // enforced by computeGratuity (5-year gate; death/disablement waives it).
  let gratuity = 0;
  const [existingGratuity] = await db
    .select({ amount: gratuitySettlements.gratuityAmount })
    .from(gratuitySettlements)
    .where(eq(gratuitySettlements.employeeId, employeeId))
    .limit(1);
  if (existingGratuity) {
    gratuity = Number(existingGratuity.amount || 0);
  } else if (emp.startDate) {
    const { completedYears, trailingMonths } = serviceTenure(new Date(emp.startDate), endDate);
    const g = computeGratuity({
      lastDrawnBasicPlusDA: wages,
      completedYears,
      trailingMonths,
      waiveMinimumService: reason === "death" || reason === "disablement",
    });
    gratuity = g.gratuity;
  }

  // Leave encashment: encashable leave types only. The policy.encashable flag is the type filter
  // (annual encashable; sick/casual not) — read through it, never around it. The encashable figure
  // is the AVAILABLE balance (total − used − pending), not the credited total, so days already
  // consumed are never paid out again. leave_balances is keyed by employee (tenant-scoped through
  // the org-verified employee above), so it carries no orgId.
  const balances = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.year, endYear)));
  const drawdowns: Array<{ type: (typeof leaveBalances.$inferSelect)["type"]; days: number; amount: number }> = [];
  let leaveEncashment = 0;
  for (const bal of balances) {
    const available = Math.max(
      0,
      Number(bal.totalDays || 0) - Number(bal.usedDays || 0) - Number(bal.pendingDays || 0),
    );
    if (available <= 0) continue;
    const [policy] = await db
      .select({
        encashable: leavePolicies.encashable,
        exitTreatment: leavePolicies.exitTreatment,
        maxCarryForwardDays: leavePolicies.maxCarryForwardDays,
        encashmentBasis: leavePolicies.encashmentBasis,
        encashmentDivisor: leavePolicies.encashmentDivisor,
      })
      .from(leavePolicies)
      .where(and(eq(leavePolicies.orgId, orgId), eq(leavePolicies.type, bal.type)))
      .limit(1);

    // accrued-this-year, computed lazily (only for accrued_only treatments).
    const accruedThisYear = async (): Promise<number> => {
      const [acc] = await db
        .select({ d: sum(leaveAccrualEvents.days) })
        .from(leaveAccrualEvents)
        .where(and(
          eq(leaveAccrualEvents.employeeId, employeeId),
          eq(leaveAccrualEvents.type, bal.type),
          eq(leaveAccrualEvents.eventType, "accrual"),
          eq(leaveAccrualEvents.year, endYear),
        ));
      return Math.max(0, Number(acc?.d ?? 0));
    };

    // LEAVE-MODEL: exit treatment is keyed by the exit REASON (CCS Rule 39 structure —
    // resignation vs retirement vs dismissal differ). A per-reason `leave_exit_rules` row
    // OVERRIDES the per-type `exit_treatment` fallback; both default to the whole balance
    // (encash_full), so a tenant that sets nothing keeps today's behaviour. Encashability
    // still outranks all of it (a non-encashable type pays 0, enforced below).
    let payoutDays = available; // encash_full default
    const [rule] = reason
      ? await db
          .select({ treatment: leaveExitRules.treatment, param: leaveExitRules.param })
          .from(leaveExitRules)
          .where(and(
            eq(leaveExitRules.orgId, orgId),
            eq(leaveExitRules.type, bal.type),
            eq(leaveExitRules.reason, reason),
          ))
          .limit(1)
      : [undefined];
    if (rule) {
      const p = Number(rule.param ?? 0);
      if (rule.treatment === "proportion") payoutDays = available * p;
      else if (rule.treatment === "capped") payoutDays = Math.min(available, p);
      else if (rule.treatment === "accrued_only") payoutDays = Math.min(available, await accruedThisYear());
      else if (rule.treatment === "forfeit") payoutDays = 0;
      // encash_full → available (default)
    } else if (policy?.exitTreatment === "capped") {
      payoutDays = Math.min(available, Number(policy.maxCarryForwardDays ?? 0));
    } else if (policy?.exitTreatment === "accrued_only") {
      payoutDays = Math.min(available, await accruedThisYear());
    }
    if (payoutDays <= 0) continue;

    // Encashment wage basis (Basic+DA or Gross) and per-day divisor (26 or 30) are policy.
    const wageBase = policy?.encashmentBasis === "gross" ? monthlyGross : wages;
    const enc = computeLeaveEncashment(payoutDays, wageBase, {
      encashable: policy?.encashable ?? false,
      workingDaysPerMonth: policy?.encashmentDivisor ?? 26,
    });
    if (enc.amount > 0) {
      leaveEncashment += enc.amount;
      drawdowns.push({ type: bal.type, days: enc.encashableDays, amount: enc.amount });
    }
  }

  return { emp, endYear, lastSalary, gratuity, leaveEncashment, drawdowns };
}

export const settlementRouter = router({
  // Compute the composed settlement without persisting — for the offboarding screen.
  preview: permissionProcedure("offboarding", "read")
    .input(z.object({ employeeId: z.string().uuid(), reason: z.string().optional() }).merge(recoveriesInput))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const c = await resolveComponents(db, org!.id, input.employeeId, input.reason);
      return composeSettlement({
        lastSalary: c.lastSalary,
        leaveEncashment: c.leaveEncashment,
        gratuity: c.gratuity,
        noticeShortfall: input.noticeShortfall,
        advanceRecovery: input.advanceRecovery,
        assetRecovery: input.assetRecovery,
      });
    }),

  // Get the settlement for an employee (if any).
  get: permissionProcedure("offboarding", "read")
    .input(z.object({ employeeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(finalSettlements)
        .where(and(eq(finalSettlements.orgId, org!.id), eq(finalSettlements.employeeId, input.employeeId)))
        .limit(1);
      return row ?? null;
    }),

  // Compose and PERSIST the settlement — one per employee, idempotent, stops the clock.
  settle: permissionProcedure("offboarding", "write")
    .input(
      z
        .object({
          employeeId: z.string().uuid(),
          reason: z.enum(["resignation", "retirement", "death", "disablement", "termination", "dismissal"]).optional(),
        })
        .merge(recoveriesInput),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      return db.transaction(async (tx) => {
        // Idempotency FIRST: a settlement already recorded ⇒ CONFLICT, before anything is drawn.
        const [dup] = await tx
          .select({ id: finalSettlements.id })
          .from(finalSettlements)
          .where(and(eq(finalSettlements.orgId, org!.id), eq(finalSettlements.employeeId, input.employeeId)))
          .limit(1);
        if (dup)
          throw new TRPCError({ code: "CONFLICT", message: "Employee is already settled" });

        const c = await resolveComponents(tx, org!.id, input.employeeId, input.reason);
        const s = composeSettlement({
          lastSalary: c.lastSalary,
          leaveEncashment: c.leaveEncashment,
          gratuity: c.gratuity,
          noticeShortfall: input.noticeShortfall,
          advanceRecovery: input.advanceRecovery,
          assetRecovery: input.assetRecovery,
        });

        // Draw the encashed leave down and record each as a ledger event (money moves once — the
        // idempotency guard above stops a second settle from drawing again).
        for (const d of c.drawdowns) {
          await tx.insert(leaveAccrualEvents).values({
            orgId: org!.id, employeeId: input.employeeId, type: d.type, eventType: "encashment",
            year: c.endYear, month: null, days: String(-d.days), amount: String(d.amount),
            createdById: (user?.id as string) ?? null,
          });
          const [bal] = await tx
            .select()
            .from(leaveBalances)
            .where(and(eq(leaveBalances.employeeId, input.employeeId), eq(leaveBalances.type, d.type), eq(leaveBalances.year, c.endYear)))
            .limit(1);
          if (bal)
            await tx.update(leaveBalances)
              .set({ totalDays: String(Math.max(0, Number(bal.totalDays) - d.days)), updatedAt: new Date() })
              .where(eq(leaveBalances.id, bal.id));
        }

        const [row] = await tx
          .insert(finalSettlements)
          .values({
            orgId: org!.id,
            employeeId: input.employeeId,
            lastSalary: String(s.lastSalary),
            leaveEncashment: String(s.leaveEncashment),
            gratuity: String(s.gratuity),
            noticeShortfall: String(s.noticeShortfall),
            advanceRecovery: String(s.advanceRecovery),
            assetRecovery: String(s.assetRecovery),
            totalRecoveries: String(s.totalRecoveries),
            grossSettlement: String(s.grossSettlement),
            netSettlement: String(s.netSettlement),
            unrecoveredShortfall: String(s.unrecoveredShortfall),
            taxableGratuity: String(s.taxableGratuity),
            taxableEncashment: String(s.taxableEncashment),
            tds: "0",
            reason: input.reason,
            settledById: (user?.id as string) ?? null,
          })
          .returning();

        // Semi-computed F&F Status: settling stamps completion (stops the clock). A manual
        // override remains available on the offboarding form for out-of-system settlements.
        await tx
          .update(offboardingDetails)
          .set({ ffStatus: "completed", updatedAt: new Date() })
          .where(and(eq(offboardingDetails.orgId, org!.id), eq(offboardingDetails.employeeId, input.employeeId)));

        return row!;
      });
    }),
});
