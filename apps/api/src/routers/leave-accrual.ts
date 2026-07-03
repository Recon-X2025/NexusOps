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
import { TRPCError } from "@trpc/server";
import {
  employees,
  salaryStructures,
  leavePolicies,
  leaveAccrualEvents,
  leaveBalances,
  eq,
  and,
  desc,
} from "@coheronconnect/db";
import {
  computeMonthlyLeaveAccrual,
  computeCarryForward,
  computeLeaveEncashment,
  roundDays,
  type LeavePolicyConfig,
} from "@coheronconnect/payroll-math";
import { router, permissionProcedure } from "../lib/trpc";

const leaveTypeSchema = z.enum([
  "vacation",
  "sick",
  "parental",
  "bereavement",
  "unpaid",
  "other",
]);

/** Monthly Basic+DA for an employee from their salary structure (Basic %). */
function monthlyBasicPlusDA(
  struct: typeof salaryStructures.$inferSelect | undefined,
): number {
  if (!struct) return 0;
  const ctc = Number(struct.ctcAnnual || 0);
  const basicPct = Number(struct.basicPercent ?? 40) / 100;
  return Math.round((ctc * basicPct) / 12);
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

    // Upsert the policy for a leave type (one per org+type).
    upsert: permissionProcedure("hr", "approve")
      .input(
        z.object({
          type: leaveTypeSchema,
          annualEntitlementDays: z.number().min(0),
          monthlyAccrualDays: z.number().min(0).nullish(),
          maxCarryForwardDays: z.number().min(0),
          encashable: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
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
        return { closingBalance: closing, ...cf };
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
            .select({ id: employees.id })
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

          await tx.insert(leaveAccrualEvents).values([
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
            {
              orgId: org!.id,
              employeeId: input.employeeId,
              type: input.type,
              eventType: "lapse" as const,
              year: input.year,
              month: null,
              days: String(-cf.lapsed),
              createdById: (user?.id as string) ?? null,
            },
          ]);

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

          return { closingBalance: closing, ...cf, nextYear };
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
          const [struct] = emp.salaryStructureId
            ? await db
                .select()
                .from(salaryStructures)
                .where(eq(salaryStructures.id, emp.salaryStructureId))
                .limit(1)
            : [undefined];
          wages = monthlyBasicPlusDA(struct);
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
            const [struct] = emp.salaryStructureId
              ? await tx
                  .select()
                  .from(salaryStructures)
                  .where(eq(salaryStructures.id, emp.salaryStructureId))
                  .limit(1)
              : [undefined];
            wages = monthlyBasicPlusDA(struct);
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
});
