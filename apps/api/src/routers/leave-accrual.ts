/**
 * Leave-accrual tRPC router.
 *
 * Under the `hr` module: reads require `hr:read`; the sensitive mutations
 * (policy upsert, monthly accrual, year-end close, encashment) require
 * `hr:approve` so they are restricted to HR managers/analysts — a plain
 * self-service member (who holds `hr:read/write` to raise HR cases) cannot
 * touch leave liabilities.
 *
 *   - policy: per-org, per-leave-type configuration (annual entitlement,
 *     monthly rate, carry-forward cap, encashable) that drives the engine.
 *   - accrual: idempotent monthly accrual per (employee, type, period),
 *     posted to both the ledger and the leave-balance total.
 *   - close: year-end carry-forward — caps the closing balance and lapses the
 *     excess, seeding next year's opening balance.
 *   - encash: values an unused-leave balance at (Basic+DA)/26 per day.
 *
 * Day/money math lives in @coheronconnect/payroll-math (pure); this router owns
 * persistence, tenancy and the leave-balance projection.
 */
import { z } from "zod";
import { assertSameOrg } from "../lib/assert-same-org";
import { TRPCError } from "@trpc/server";
import {
  employees,
  salaryStructures,
  leavePolicies,
  leaveAccrualEvents,
  leaveBalances,
  attendanceRecords,
  publicHolidays,
  eq,
  and,
  desc,
  gte,
  lte,
  isNotNull,
  sql,
} from "@coheronconnect/db";

/** Date → 'YYYY-MM-DD' key so two events on the same calendar day compare equal (ignores time). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
import {
  computeMonthlyLeaveAccrual,
  computeCarryForward,
  computeLeaveEncashment,
  roundDays,
  type LeavePolicyConfig,
} from "@coheronconnect/payroll-math";
import { router, permissionProcedure } from "../lib/trpc";
import { resolveSalaryStructureForPeriod } from "../lib/india/salary-structure-resolver";
import { LeaveTypeEnum } from "@coheronconnect/types";

// The leave-type set is single-sourced from `@coheronconnect/types` (which mirrors the db enum).
// This was a fourth hand-maintained copy (6 values) that omitted the db's `primary`/`annual`;
// aliased here so the many `leaveTypeSchema` references below are unchanged.
const leaveTypeSchema = LeaveTypeEnum;

/** Monthly Basic+DA for an employee from their salary structure (Basic %). */
function monthlyBasicPlusDA(
  struct: typeof salaryStructures.$inferSelect | undefined,
): number {
  if (!struct) return 0;
  const ctc = Number(struct.ctcAnnual || 0);
  const basicPct = Number(struct.basicPercent ?? 40) / 100;
  const daPct = Number(struct.daPercent ?? 0) / 100;
  // Encashment values leave at (Basic + DA)/26 per day — DA was previously omitted, understating
  // the payment by the DA share for any Basic+DA composition (same fix as gratuity, C11).
  return Math.round((ctc * (basicPct + daPct)) / 12);
}

/** Map a persisted policy row to the pure-engine config shape. */
function toPolicyConfig(
  row: typeof leavePolicies.$inferSelect,
): LeavePolicyConfig {
  return {
    annualEntitlementDays: Number(row.annualEntitlementDays),
    monthlyAccrualDays:
      row.monthlyAccrualDays == null ? undefined : Number(row.monthlyAccrualDays),
    maxCarryForwardDays: Number(row.maxCarryForwardDays),
    encashable: row.encashable,
  };
}

/**
 * The leave set a company can START with.
 *
 * `leave_policies` ships empty, so `hr.leave.create` has no policy to reference
 * and leave is unusable until somebody hand-builds every type. A startup will
 * not do that — it takes what comes with the product. This is that baseline:
 * enough to run leave on day one, sitting at or above the statutory floor.
 *
 * Where the numbers come from:
 *  - ANNUAL (earned/privilege): Factories Act 1948 s.79 earns ~15 days/yr
 *    (1 per 20 worked); state Shops & Establishments Acts run 12-21. 18 sits
 *    safely above the common floor. Carried forward to 30 (the Factories Act
 *    carry cap), the excess lapsing, and encashable — earned leave is the one
 *    type that must be paid out on exit.
 *  - CASUAL and SICK: 7 each. S&E Acts typically grant 7-12 of each. Both
 *    lapse at year end and neither is encashable, which is ordinary practice
 *    and is what `settlement.ts` already assumes ("annual encashable;
 *    sick/casual not").
 *  - MATERNITY: 182 days = 26 weeks. Maternity Benefit (Amendment) Act 2017.
 *    This one is LAW, not a preference, and must never ship lower.
 *  - PATERNITY: 5 days. NOT statutory in the private sector (only central
 *    government employees have a 15-day entitlement) — included because
 *    practically every employer offers something and zero reads as an
 *    omission rather than a decision.
 *  - BEREAVEMENT: 3 days. Practice, not statute.
 *  - COMPENSATORY_OFF: earned by working a holiday or rest day, so no annual
 *    entitlement. Expires on a 12-week window rather than at year end, so it
 *    cannot accrue indefinitely.
 *  - UNPAID (loss of pay): no entitlement and no balance to debit — it is the
 *    absence of leave, recorded so payroll can deduct it.
 *
 * Anything beyond this — sabbatical, study leave, menstrual leave, a longer
 * paternity policy, tenure-based slabs — is a POLICY DOCUMENT, not a schema
 * change. A tenant that wants different numbers edits these; the point is that
 * they start with something that works.
 */
const DEFAULT_LEAVE_POLICIES = [
  {
    type: "annual" as const,
    annualEntitlementDays: "18",
    monthlyAccrualDays: "1.5",
    maxCarryForwardDays: "30",
    encashable: true,
    yearEndTreatment: "forfeit" as const,
    exitTreatment: "encash_all" as const,
    encashmentBasis: "basic_da" as const,
    encashmentDivisor: 26,
    debitsBalance: true,
    expiryMode: "year_end" as const,
  },
  { type: "casual" as const, annualEntitlementDays: "7" , exitTreatment: "accrued_only" as const },
  { type: "sick" as const, annualEntitlementDays: "7" , exitTreatment: "accrued_only" as const },
  { type: "maternity" as const, annualEntitlementDays: "182" , exitTreatment: "accrued_only" as const },
  { type: "paternity" as const, annualEntitlementDays: "5" , exitTreatment: "accrued_only" as const },
  { type: "bereavement" as const, annualEntitlementDays: "3" , exitTreatment: "accrued_only" as const },
  {
    type: "compensatory_off" as const,
    annualEntitlementDays: "0",
    exitTreatment: "accrued_only" as const,
    expiryMode: "window_weeks" as const,
    expiryWindowWeeks: 12,
  },
  {
    type: "unpaid" as const,
    annualEntitlementDays: "0",
    exitTreatment: "accrued_only" as const,
    debitsBalance: false,
  },
];

export const leaveAccrualRouter = router({
  // ── Policy: per-org, per-leave-type configuration ──────────────────────────
  policy: router({
    list: permissionProcedure("hr", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(leavePolicies)
        .where(eq(leavePolicies.orgId, org!.id))
        .orderBy(leavePolicies.type);
    }),

    /**
     * Give this tenant the baseline leave set, once.
     *
     * Idempotent by construction: `leave_policies` is UNIQUE on (org_id, type)
     * and this inserts with ON CONFLICT DO NOTHING, so re-running never
     * overwrites a policy the tenant has since tuned. `seeded` reports how many
     * were actually new, so a second call honestly returns 0 rather than
     * claiming it did work.
     */
    seedDefaults: permissionProcedure("hr", "approve").mutation(async ({ ctx }) => {
      const { db, org } = ctx;
      const before = await db
        .select({ type: leavePolicies.type })
        .from(leavePolicies)
        .where(eq(leavePolicies.orgId, org!.id));
      const existing = new Set(before.map((r) => r.type as string));

      const rows = DEFAULT_LEAVE_POLICIES.filter((p) => !existing.has(p.type)).map((p) => ({
        orgId: org!.id,
        ...p,
      }));
      if (rows.length === 0) return { seeded: 0, skipped: existing.size };

      await db.insert(leavePolicies).values(rows).onConflictDoNothing();
      return { seeded: rows.length, skipped: existing.size };
    }),

    // Upsert the policy for a leave type (one per org+type).
    upsert: permissionProcedure("hr", "approve")
      .input(
        z.object({
          type: leaveTypeSchema,
          annualEntitlementDays: z.number().min(0),
          monthlyAccrualDays: z.number().min(0).nullish(),
          maxCarryForwardDays: z.number().min(0),
          encashable: z.boolean(),
          // Year-end treatment of the balance ABOVE the cap — encash or forfeit,
          // independent of the cap. Defaults to "forfeit" (today's behaviour) when omitted.
          yearEndTreatment: z.enum(["forfeit", "encash"]).default("forfeit"),
          // Exit treatment — how much is encashed on offboarding. Defaults to "encash_all"
          // (the whole balance; behaviour-preserving and never underpays a leaver).
          exitTreatment: z.enum(["encash_all", "capped", "accrued_only"]).default("encash_all"),
          // LEAVE-MODEL axes — all default to today's behaviour.
          encashmentBasis: z.enum(["basic_da", "gross"]).default("basic_da"),
          encashmentDivisor: z.union([z.literal(26), z.literal(30)]).default(26),
          debitsBalance: z.boolean().default(true),
          expiryMode: z.enum(["year_end", "window_weeks"]).default("year_end"),
          expiryWindowWeeks: z.number().int().min(1).max(52).nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        // LEAVE-MODEL: maternity is a CENTRAL statutory floor (Maternity Benefit Act 1961 —
        // 26 weeks = 182 days). A tenant may exceed it but not go below; the quantum does NOT
        // vary by state. (Non-debiting / non-encashable are the tenant's to set, defaulted so.)
        if (input.type === "maternity" && input.annualEntitlementDays < 182) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Maternity leave is a central statutory floor of 26 weeks (182 days) under the " +
              "Maternity Benefit Act 1961 — a company may grant more but not less.",
          });
        }
        const [existing] = await db
          .select({ id: leavePolicies.id })
          .from(leavePolicies)
          .where(
            and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)),
          )
          .limit(1);
        const values = {
          annualEntitlementDays: String(input.annualEntitlementDays),
          monthlyAccrualDays:
            input.monthlyAccrualDays == null ? null : String(input.monthlyAccrualDays),
          maxCarryForwardDays: String(input.maxCarryForwardDays),
          encashable: input.encashable,
          yearEndTreatment: input.yearEndTreatment,
          exitTreatment: input.exitTreatment,
          encashmentBasis: input.encashmentBasis,
          encashmentDivisor: input.encashmentDivisor,
          debitsBalance: input.debitsBalance,
          expiryMode: input.expiryMode,
          expiryWindowWeeks: input.expiryWindowWeeks ?? null,
          updatedAt: new Date(),
        };
        if (existing) {
          const [row] = await db
            .update(leavePolicies)
            .set(values)
            .where(eq(leavePolicies.id, existing.id))
            .returning();
          return row!;
        }
        const [row] = await db
          .insert(leavePolicies)
          .values({ orgId: org!.id, type: input.type, ...values })
          .returning();
        return row!;
      }),
  }),

  // ── Accrual: idempotent monthly leave crediting ────────────────────────────
  accrual: router({
    // Ledger for an employee (most recent first).
    list: permissionProcedure("hr", "read")
      .input(
        z.object({ employeeId: z.string().uuid(), type: leaveTypeSchema.optional() }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [
          eq(leaveAccrualEvents.orgId, org!.id),
          eq(leaveAccrualEvents.employeeId, input.employeeId),
        ];
        if (input.type) conds.push(eq(leaveAccrualEvents.type, input.type));
        return db
          .select()
          .from(leaveAccrualEvents)
          .where(and(...conds))
          .orderBy(desc(leaveAccrualEvents.year), desc(leaveAccrualEvents.month));
      }),

    // Accrue one month for a single employee. Idempotent per
    // (employee, type, year, month): re-running updates in place and keeps the
    // leave-balance total consistent.
    accrue: permissionProcedure("hr", "approve")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          type: leaveTypeSchema,
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
          daysWorked: z.number().min(0).optional(),
          daysInMonth: z.number().min(1).max(31).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [emp] = await tx
            .select()
            .from(employees)
            .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)))
            .limit(1);
          if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

          const [policy] = await tx
            .select()
            .from(leavePolicies)
            .where(
              and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)),
            )
            .limit(1);
          if (!policy)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `No leave policy configured for type '${input.type}'`,
            });

          const days = computeMonthlyLeaveAccrual(toPolicyConfig(policy), {
            daysWorked: input.daysWorked,
            daysInMonth: input.daysInMonth,
          });

          // Upsert the ledger event (idempotent per period).
          const [existing] = await tx
            .select({ id: leaveAccrualEvents.id, days: leaveAccrualEvents.days })
            .from(leaveAccrualEvents)
            .where(
              and(
                eq(leaveAccrualEvents.employeeId, input.employeeId),
                eq(leaveAccrualEvents.type, input.type),
                eq(leaveAccrualEvents.eventType, "accrual"),
                eq(leaveAccrualEvents.year, input.year),
                eq(leaveAccrualEvents.month, input.month),
              ),
            )
            .limit(1);

          let priorDays = 0;
          let event;
          if (existing) {
            priorDays = Number(existing.days);
            const [row] = await tx
              .update(leaveAccrualEvents)
              .set({ days: String(days) })
              .where(eq(leaveAccrualEvents.id, existing.id))
              .returning();
            event = row!;
          } else {
            const [row] = await tx
              .insert(leaveAccrualEvents)
              .values({
                orgId: org!.id,
                employeeId: input.employeeId,
                type: input.type,
                eventType: "accrual",
                year: input.year,
                month: input.month,
                days: String(days),
                createdById: (user?.id as string) ?? null,
              })
              .returning();
            event = row!;
          }

          // Project the delta onto the leave-balance total for the year.
          const delta = roundDays(days - priorDays);
          const [bal] = await tx
            .select()
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.employeeId, input.employeeId),
                eq(leaveBalances.type, input.type),
                eq(leaveBalances.year, input.year),
              ),
            )
            .limit(1);
          if (bal) {
            await tx
              .update(leaveBalances)
              .set({
                totalDays: String(roundDays(Number(bal.totalDays) + delta)),
                updatedAt: new Date(),
              })
              .where(eq(leaveBalances.id, bal.id));
          } else {
            await tx.insert(leaveBalances).values({
              employeeId: input.employeeId,
              type: input.type,
              year: input.year,
              totalDays: String(roundDays(delta)),
            });
          }

          return event;
        });
      }),

    // Accrue one month for the whole active workforce, for a leave type.
    // Idempotent: safe to re-run.
    accrueAll: permissionProcedure("hr", "approve")
      .input(
        z.object({
          type: leaveTypeSchema,
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [policy] = await db
          .select()
          .from(leavePolicies)
          .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)))
          .limit(1);
        if (!policy)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `No leave policy configured for type '${input.type}'`,
          });
        const cfg = toPolicyConfig(policy);
        const days = computeMonthlyLeaveAccrual(cfg);

        const roster = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")));

        let accrued = 0;
        for (const { id: employeeId } of roster) {
          await db.transaction(async (tx) => {
            const [existing] = await tx
              .select({ id: leaveAccrualEvents.id, days: leaveAccrualEvents.days })
              .from(leaveAccrualEvents)
              .where(
                and(
                  eq(leaveAccrualEvents.employeeId, employeeId),
                  eq(leaveAccrualEvents.type, input.type),
                  eq(leaveAccrualEvents.eventType, "accrual"),
                  eq(leaveAccrualEvents.year, input.year),
                  eq(leaveAccrualEvents.month, input.month),
                ),
              )
              .limit(1);
            const priorDays = existing ? Number(existing.days) : 0;
            if (existing) {
              await tx
                .update(leaveAccrualEvents)
                .set({ days: String(days) })
                .where(eq(leaveAccrualEvents.id, existing.id));
            } else {
              await tx.insert(leaveAccrualEvents).values({
                orgId: org!.id,
                employeeId,
                type: input.type,
                eventType: "accrual",
                year: input.year,
                month: input.month,
                days: String(days),
                createdById: (user?.id as string) ?? null,
              });
            }
            const delta = roundDays(days - priorDays);
            const [bal] = await tx
              .select()
              .from(leaveBalances)
              .where(
                and(
                  eq(leaveBalances.employeeId, employeeId),
                  eq(leaveBalances.type, input.type),
                  eq(leaveBalances.year, input.year),
                ),
              )
              .limit(1);
            if (bal) {
              await tx
                .update(leaveBalances)
                .set({
                  totalDays: String(roundDays(Number(bal.totalDays) + delta)),
                  updatedAt: new Date(),
                })
                .where(eq(leaveBalances.id, bal.id));
            } else {
              await tx.insert(leaveBalances).values({
                employeeId,
                type: input.type,
                year: input.year,
                totalDays: String(roundDays(delta)),
              });
            }
          });
          accrued++;
        }
        return { accrued, daysEach: days };
      }),
  }),

  // ── Year-end close: carry-forward + lapse ──────────────────────────────────
  close: router({
    // Preview the carry-forward split for an employee without persisting.
    preview: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          type: leaveTypeSchema,
          year: z.number().int().min(2000).max(2100),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [policy] = await db
          .select()
          .from(leavePolicies)
          .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)))
          .limit(1);
        if (!policy)
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No leave policy" });
        const [bal] = await db
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, input.employeeId),
              eq(leaveBalances.type, input.type),
              eq(leaveBalances.year, input.year),
            ),
          )
          .limit(1);
        const closing = bal
          ? roundDays(Number(bal.totalDays) - Number(bal.usedDays))
          : 0;
        const cf = computeCarryForward(closing, toPolicyConfig(policy));
        // Surface how the excess (cf.lapsed) will be treated: encashed (encashable type
        // only) or forfeited. Rupee value is resolved by close.run, not this read path.
        const excessTreatment =
          cf.lapsed > 0 && policy.yearEndTreatment === "encash" && policy.encashable
            ? "encash"
            : "forfeit";
        return { closingBalance: closing, ...cf, yearEndTreatment: policy.yearEndTreatment, excessTreatment };
      }),

    // Persist the year-end carry-forward: writes carry_forward + lapse ledger
    // events and seeds next year's opening balance. One close per
    // (employee, type, year).
    run: permissionProcedure("hr", "approve")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          type: leaveTypeSchema,
          year: z.number().int().min(2000).max(2100),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [emp] = await tx
            .select({ id: employees.id, salaryStructureId: employees.salaryStructureId })
            .from(employees)
            .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)))
            .limit(1);
          if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

          const [policy] = await tx
            .select()
            .from(leavePolicies)
            .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)))
            .limit(1);
          if (!policy)
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No leave policy" });

          // Guard against a double close for the same year.
          const [alreadyClosed] = await tx
            .select({ id: leaveAccrualEvents.id })
            .from(leaveAccrualEvents)
            .where(
              and(
                eq(leaveAccrualEvents.employeeId, input.employeeId),
                eq(leaveAccrualEvents.type, input.type),
                eq(leaveAccrualEvents.eventType, "carry_forward"),
                eq(leaveAccrualEvents.year, input.year),
              ),
            )
            .limit(1);
          if (alreadyClosed)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Year already closed for this leave type",
            });

          const [bal] = await tx
            .select()
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.employeeId, input.employeeId),
                eq(leaveBalances.type, input.type),
                eq(leaveBalances.year, input.year),
              ),
            )
            .limit(1);
          const closing = bal
            ? roundDays(Number(bal.totalDays) - Number(bal.usedDays))
            : 0;
          const cf = computeCarryForward(closing, toPolicyConfig(policy));

          // The retained (capped) balance always carries forward. The EXCESS (cf.lapsed)
          // is then either encashed or forfeited per the tenant's year-end treatment —
          // independent of the cap. Encash applies only to an encashable type; a
          // non-encashable type set to "encash" still lapses (encashability wins, matching
          // encash.run's refusal). Idempotency is the carry_forward guard above: a second
          // close throws CONFLICT, so the excess is never encashed twice.
          const events: (typeof leaveAccrualEvents.$inferInsert)[] = [
            {
              orgId: org!.id,
              employeeId: input.employeeId,
              type: input.type,
              eventType: "carry_forward" as const,
              year: input.year,
              month: null,
              days: String(cf.carriedForward),
              createdById: (user?.id as string) ?? null,
            },
          ];

          let encashedExcess: ReturnType<typeof computeLeaveEncashment> | null = null;
          if (cf.lapsed > 0 && policy.yearEndTreatment === "encash" && policy.encashable) {
            // Encash the excess at the FY-start structure version's basic+DA — the same
            // wage basis encash.run uses (anchored to 1 April of the leave year).
            const struct = emp.salaryStructureId
              ? await resolveSalaryStructureForPeriod(
                  tx,
                  org!.id,
                  emp.salaryStructureId,
                  new Date(input.year, 3, 1),
                )
              : null;
            const wages = monthlyBasicPlusDA(struct ?? undefined);
            encashedExcess = computeLeaveEncashment(cf.lapsed, wages, { encashable: true });
            events.push({
              orgId: org!.id,
              employeeId: input.employeeId,
              type: input.type,
              eventType: "encashment" as const,
              year: input.year,
              month: null,
              days: String(-encashedExcess.encashableDays),
              amount: String(encashedExcess.amount),
              createdById: (user?.id as string) ?? null,
            });
          } else {
            // Forfeit: lapse the excess (also the fallback for a non-encashable type).
            events.push({
              orgId: org!.id,
              employeeId: input.employeeId,
              type: input.type,
              eventType: "lapse" as const,
              year: input.year,
              month: null,
              days: String(-cf.lapsed),
              createdById: (user?.id as string) ?? null,
            });
          }

          await tx.insert(leaveAccrualEvents).values(events);

          // Seed next year's opening balance with the carried-forward days.
          const nextYear = input.year + 1;
          const [nextBal] = await tx
            .select()
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.employeeId, input.employeeId),
                eq(leaveBalances.type, input.type),
                eq(leaveBalances.year, nextYear),
              ),
            )
            .limit(1);
          if (nextBal) {
            await tx
              .update(leaveBalances)
              .set({
                totalDays: String(
                  roundDays(Number(nextBal.totalDays) + cf.carriedForward),
                ),
                updatedAt: new Date(),
              })
              .where(eq(leaveBalances.id, nextBal.id));
          } else {
            await tx.insert(leaveBalances).values({
              employeeId: input.employeeId,
              type: input.type,
              year: nextYear,
              totalDays: String(cf.carriedForward),
            });
          }

          return {
            closingBalance: closing,
            ...cf,
            nextYear,
            yearEndTreatment: policy.yearEndTreatment,
            // Present only when the excess was encashed (rupee amount for the run/ledger).
            encashedExcess,
          };
        });
      }),
  }),

  // ── Encashment: value an unused-leave balance ──────────────────────────────
  encash: router({
    preview: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          type: leaveTypeSchema,
          days: z.number().min(0),
          lastDrawnBasicPlusDA: z.number().min(0).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [emp] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)))
          .limit(1);
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        const [policy] = await db
          .select()
          .from(leavePolicies)
          .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)))
          .limit(1);

        let wages = input.lastDrawnBasicPlusDA;
        if (wages == null) {
          // M-05: resolve the structure version in force now (familyId), not by bare id.
          const struct = emp.salaryStructureId
            ? await resolveSalaryStructureForPeriod(db, org!.id, emp.salaryStructureId, new Date())
            : null;
          wages = monthlyBasicPlusDA(struct ?? undefined);
        }
        return computeLeaveEncashment(input.days, wages, {
          encashable: policy?.encashable ?? false,
        });
      }),

    // Record an encashment: a negative-day ledger event with a rupee amount.
    run: permissionProcedure("hr", "approve")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          type: leaveTypeSchema,
          year: z.number().int().min(2000).max(2100),
          days: z.number().min(0),
          lastDrawnBasicPlusDA: z.number().min(0).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [emp] = await tx
            .select()
            .from(employees)
            .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)))
            .limit(1);
          if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
          const [policy] = await tx
            .select()
            .from(leavePolicies)
            .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, input.type)))
            .limit(1);
          if (!policy)
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No leave policy" });
          if (!policy.encashable)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Leave type '${input.type}' is not encashable`,
            });

          let wages = input.lastDrawnBasicPlusDA;
          if (wages == null) {
            // M-05: resolve the structure version in force for the encashment's leave
            // year (familyId), anchored to that FY start (1 April), not by bare id.
            const struct = emp.salaryStructureId
              ? await resolveSalaryStructureForPeriod(
                  tx,
                  org!.id,
                  emp.salaryStructureId,
                  new Date(input.year, 3, 1),
                )
              : null;
            wages = monthlyBasicPlusDA(struct ?? undefined);
          }

          const enc = computeLeaveEncashment(input.days, wages, { encashable: true });

          const [event] = await tx
            .insert(leaveAccrualEvents)
            .values({
              orgId: org!.id,
              employeeId: input.employeeId,
              type: input.type,
              eventType: "encashment",
              year: input.year,
              month: null,
              days: String(-enc.encashableDays),
              amount: String(enc.amount),
              createdById: (user?.id as string) ?? null,
            })
            .returning();

          // Draw the encashed days down from the balance total.
          const [bal] = await tx
            .select()
            .from(leaveBalances)
            .where(
              and(
                eq(leaveBalances.employeeId, input.employeeId),
                eq(leaveBalances.type, input.type),
                eq(leaveBalances.year, input.year),
              ),
            )
            .limit(1);
          if (bal) {
            await tx
              .update(leaveBalances)
              .set({
                totalDays: String(
                  roundDays(Number(bal.totalDays) - enc.encashableDays),
                ),
                updatedAt: new Date(),
              })
              .where(eq(leaveBalances.id, bal.id));
          }

          return { ...enc, event };
        });
      }),
  }),

  // ── Comp-off: earn from worked holidays/weekends, expire on a rolling window ──
  // Comp-off is the one type that does NOT lapse at year-end (close.run) — it expires on a
  // fixed window (leave_policies.expiry_mode = window_weeks). The window is anchored to the
  // WORKED date, carried on the accrual event's eventDate.
  compOff: router({
    /**
     * COMPOFF-EARN (attendance-driven): credit compensatory_off for each day the employee
     * checked in on a public holiday or weekend that has no credit yet. IDEMPOTENT per
     * (employee, worked-date) via the accrual event's eventDate — re-running never double-credits.
     * Requires a compensatory_off policy (an org that does not offer comp-off earns none). One
     * worked non-working day = 1 comp-off day.
     */
    reconcile: permissionProcedure("hr", "write")
      .input(z.object({
        employeeId: z.string().uuid(),
        from: z.coerce.date(),
        to: z.coerce.date(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [emp] = await db.select({ id: employees.id }).from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id))).limit(1);
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        const [policy] = await db.select().from(leavePolicies)
          .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, "compensatory_off"))).limit(1);
        if (!policy) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No compensatory_off leave policy configured" });

        // Worked days = attendance records with a check-in in the range.
        const worked = await db.select().from(attendanceRecords).where(and(
          eq(attendanceRecords.orgId, org!.id),
          eq(attendanceRecords.employeeId, input.employeeId),
          gte(attendanceRecords.date, input.from),
          lte(attendanceRecords.date, input.to),
          isNotNull(attendanceRecords.checkIn),
        ));
        // Public holidays in range (org calendar).
        const hols = await db.select({ date: publicHolidays.date }).from(publicHolidays).where(and(
          eq(publicHolidays.orgId, org!.id),
          gte(publicHolidays.date, input.from),
          lte(publicHolidays.date, input.to),
        ));
        const holSet = new Set(hols.map((h) => dayKey(h.date)));
        // Already-credited worked dates (idempotency guard).
        const existing = await db.select({ d: leaveAccrualEvents.eventDate }).from(leaveAccrualEvents).where(and(
          eq(leaveAccrualEvents.employeeId, input.employeeId),
          eq(leaveAccrualEvents.type, "compensatory_off"),
          eq(leaveAccrualEvents.eventType, "accrual"),
          isNotNull(leaveAccrualEvents.eventDate),
        ));
        const credited = new Set(existing.filter((e) => e.d).map((e) => dayKey(e.d!)));

        let n = 0;
        for (const rec of worked) {
          const k = dayKey(rec.date);
          if (credited.has(k)) continue;
          const dow = rec.date.getDay(); // 0 Sun … 6 Sat
          // A worked NON-working day: the attendance feed marked it weekend/holiday, OR it is on
          // the public-holiday calendar, OR it is a Sat/Sun (self-service sign-ins are always
          // 'present', so the calendar check is what catches a Sunday worked via sign-in).
          const isNonWorking = rec.status === "weekend" || rec.status === "holiday" || holSet.has(k) || dow === 0 || dow === 6;
          if (!isNonWorking) continue;
          await db.transaction(async (tx) => {
            await tx.insert(leaveAccrualEvents).values({
              // month: null — the monthly-accrual unique index is per (…, year, month); comp-off
              // has MANY credits per month, anchored by eventDate, so month must be null to avoid
              // that one-per-month collision (NULLs are distinct in the unique index).
              orgId: org!.id, employeeId: input.employeeId, type: "compensatory_off",
              eventType: "accrual", year: rec.date.getFullYear(), month: null,
              days: "1", eventDate: rec.date, createdById: (user?.id as string) ?? null,
            });
            await tx.insert(leaveBalances).values({
              employeeId: input.employeeId, type: "compensatory_off", year: rec.date.getFullYear(),
              totalDays: "1", usedDays: "0", pendingDays: "0",
            }).onConflictDoUpdate({
              target: [leaveBalances.employeeId, leaveBalances.type, leaveBalances.year],
              set: { totalDays: sql`${leaveBalances.totalDays} + 1` },
            });
          });
          credited.add(k);
          n++;
        }
        return { credited: n };
      }),

    /**
     * COMPOFF-EXPIRE: lapse comp-off credits older than expiry_window_weeks from the WORKED date
     * (NOT year-end). IDEMPOTENT per (employee, worked-date): a lapse event carrying the same
     * eventDate is the guard, so a credit is lapsed at most once — the same shape as close.run's
     * carry-forward guard. Only applies when the policy's expiry_mode is window_weeks.
     */
    expire: permissionProcedure("hr", "write")
      .input(z.object({ employeeId: z.string().uuid(), asOf: z.coerce.date().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        // The leave POLICY was org-checked below; the employee never was, so a
        // lapse event was written under this org for another tenant's employee.
        await assertSameOrg(db, employees, input.employeeId, org!.id, "Employee");
        const [policy] = await db.select().from(leavePolicies)
          .where(and(eq(leavePolicies.orgId, org!.id), eq(leavePolicies.type, "compensatory_off"))).limit(1);
        if (!policy) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No compensatory_off leave policy configured" });
        if (policy.expiryMode !== "window_weeks" || !policy.expiryWindowWeeks) {
          return { lapsed: 0, note: "comp-off policy does not use window_weeks expiry" as const };
        }
        const asOf = input.asOf ?? new Date();
        const windowMs = policy.expiryWindowWeeks * 7 * 24 * 60 * 60 * 1000;

        const credits = await db.select().from(leaveAccrualEvents).where(and(
          eq(leaveAccrualEvents.employeeId, input.employeeId),
          eq(leaveAccrualEvents.type, "compensatory_off"),
          eq(leaveAccrualEvents.eventType, "accrual"),
          isNotNull(leaveAccrualEvents.eventDate),
        ));
        const lapses = await db.select({ d: leaveAccrualEvents.eventDate }).from(leaveAccrualEvents).where(and(
          eq(leaveAccrualEvents.employeeId, input.employeeId),
          eq(leaveAccrualEvents.type, "compensatory_off"),
          eq(leaveAccrualEvents.eventType, "lapse"),
          isNotNull(leaveAccrualEvents.eventDate),
        ));
        const alreadyLapsed = new Set(lapses.filter((l) => l.d).map((l) => dayKey(l.d!)));

        let n = 0;
        for (const c of credits) {
          if (!c.eventDate) continue;
          const k = dayKey(c.eventDate);
          if (alreadyLapsed.has(k)) continue;
          if (c.eventDate.getTime() + windowMs >= asOf.getTime()) continue; // still inside the window
          await db.transaction(async (tx) => {
            await tx.insert(leaveAccrualEvents).values({
              orgId: org!.id, employeeId: input.employeeId, type: "compensatory_off",
              eventType: "lapse", year: c.eventDate!.getFullYear(), month: null,
              days: String(-Number(c.days)), eventDate: c.eventDate, createdById: (user?.id as string) ?? null,
            });
            await tx.update(leaveBalances).set({
              totalDays: sql`GREATEST(0, ${leaveBalances.totalDays} - ${c.days})`,
            }).where(and(
              eq(leaveBalances.employeeId, input.employeeId),
              eq(leaveBalances.type, "compensatory_off"),
              eq(leaveBalances.year, c.eventDate!.getFullYear()),
            ));
          });
          alreadyLapsed.add(k);
          n++;
        }
        return { lapsed: n };
      }),
  }),
});
