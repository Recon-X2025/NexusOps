/**
 * Gratuity tRPC router — Payment of Gratuity Act, 1972.
 *
 * Two surfaces under the `hr` module: reads require `hr:read`, while the
 * sensitive mutations (provisioning + settlement) require `hr:approve` so they
 * are restricted to HR managers/analysts — a plain self-service member (who has
 * `hr:read/write` to raise HR cases) cannot touch gratuity liabilities.
 *   - accrual: monthly liability provisioning (idempotent per employee+period),
 *     driven by `computeMonthlyGratuityAccrual` in @coheronconnect/payroll-math.
 *   - settlement: the final statutory payout at exit, driven by `computeGratuity`
 *     (15/26 × last-drawn Basic+DA × completed years, capped at ₹20L).
 *
 * Money math lives in payroll-math (pure); this router owns persistence,
 * tenancy, and the running cumulative provisioned liability.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  employees,
  salaryStructures,
  gratuityAccruals,
  gratuitySettlements,
  eq,
  and,
  desc,
} from "@coheronconnect/db";
import {
  computeGratuity,
  computeMonthlyGratuityAccrual,
} from "@coheronconnect/payroll-math";
import { router, permissionProcedure } from "../lib/trpc";

/** Monthly Basic+DA for an employee from their salary structure (Basic %). */
function monthlyBasicPlusDA(struct: typeof salaryStructures.$inferSelect | undefined): number {
  if (!struct) return 0;
  const ctc = Number(struct.ctcAnnual || 0);
  const basicPct = Number(struct.basicPercent ?? 40) / 100;
  return Math.round((ctc * basicPct) / 12);
}

/** Completed years + trailing months between two dates. */
function serviceTenure(start: Date, end: Date): { completedYears: number; trailingMonths: number } {
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  return { completedYears: Math.floor(months / 12), trailingMonths: months % 12 };
}

export const gratuityRouter = router({
  // ── Accrual: monthly liability provisioning ────────────────────────────────
  accrual: router({
    // List an employee's accrual ledger (most recent first).
    list: permissionProcedure("hr", "read")
      .input(z.object({ employeeId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db
          .select()
          .from(gratuityAccruals)
          .where(
            and(
              eq(gratuityAccruals.orgId, org!.id),
              eq(gratuityAccruals.employeeId, input.employeeId),
            ),
          )
          .orderBy(desc(gratuityAccruals.year), desc(gratuityAccruals.month));
      }),

    // Provision one month's gratuity liability for a single employee.
    // Idempotent per (employee, year, month): re-running updates in place and
    // keeps the running cumulative correct.
    provision: permissionProcedure("hr", "approve")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
          /** Override Basic+DA; otherwise derived from the salary structure. */
          basicPlusDA: z.number().min(0).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        return db.transaction(async (tx) => {
          const [emp] = await tx
            .select()
            .from(employees)
            .where(and(eq(employees.id, input.employeeId), eq(employees.orgId, org!.id)))
            .limit(1);
          if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

          let basicPlusDA = input.basicPlusDA;
          if (basicPlusDA == null) {
            const [struct] = emp.salaryStructureId
              ? await tx
                  .select()
                  .from(salaryStructures)
                  .where(eq(salaryStructures.id, emp.salaryStructureId))
                  .limit(1)
              : [undefined];
            basicPlusDA = monthlyBasicPlusDA(struct);
          }
          const accrualAmount = computeMonthlyGratuityAccrual(basicPlusDA);

          // Prior cumulative excludes this period so re-provisioning is idempotent.
          const priorRows = await tx
            .select({
              amt: gratuityAccruals.accrualAmount,
              y: gratuityAccruals.year,
              m: gratuityAccruals.month,
            })
            .from(gratuityAccruals)
            .where(
              and(
                eq(gratuityAccruals.orgId, org!.id),
                eq(gratuityAccruals.employeeId, input.employeeId),
              ),
            );
          const priorCumulative = priorRows
            .filter((r) => !(r.y === input.year && r.m === input.month))
            .reduce((sum, r) => sum + Number(r.amt || 0), 0);
          const cumulative = priorCumulative + accrualAmount;

          const [existing] = await tx
            .select({ id: gratuityAccruals.id })
            .from(gratuityAccruals)
            .where(
              and(
                eq(gratuityAccruals.employeeId, input.employeeId),
                eq(gratuityAccruals.year, input.year),
                eq(gratuityAccruals.month, input.month),
              ),
            )
            .limit(1);

          if (existing) {
            const [row] = await tx
              .update(gratuityAccruals)
              .set({
                basicPlusDA: String(basicPlusDA),
                accrualAmount: String(accrualAmount),
                cumulativeAccrued: String(cumulative),
              })
              .where(eq(gratuityAccruals.id, existing.id))
              .returning();
            return row!;
          }
          const [row] = await tx
            .insert(gratuityAccruals)
            .values({
              orgId: org!.id,
              employeeId: input.employeeId,
              year: input.year,
              month: input.month,
              basicPlusDA: String(basicPlusDA),
              accrualAmount: String(accrualAmount),
              cumulativeAccrued: String(cumulative),
            })
            .returning();
          return row!;
        });
      }),

    // Provision the whole active workforce for a period (monthly job).
    // Idempotent: safe to re-run.
    provisionAll: permissionProcedure("hr", "approve")
      .input(
        z.object({
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const roster = await db
          .select({ emp: employees, struct: salaryStructures })
          .from(employees)
          .leftJoin(salaryStructures, eq(employees.salaryStructureId, salaryStructures.id))
          .where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")));

        let provisioned = 0;
        let totalAccrued = 0;
        for (const { emp, struct } of roster) {
          const basicPlusDA = monthlyBasicPlusDA(struct ?? undefined);
          const accrualAmount = computeMonthlyGratuityAccrual(basicPlusDA);
          await db.transaction(async (tx) => {
            const priorRows = await tx
              .select({
                amt: gratuityAccruals.accrualAmount,
                y: gratuityAccruals.year,
                m: gratuityAccruals.month,
              })
              .from(gratuityAccruals)
              .where(
                and(
                  eq(gratuityAccruals.orgId, org!.id),
                  eq(gratuityAccruals.employeeId, emp.id),
                ),
              );
            const priorCumulative = priorRows
              .filter((r) => !(r.y === input.year && r.m === input.month))
              .reduce((sum, r) => sum + Number(r.amt || 0), 0);
            const cumulative = priorCumulative + accrualAmount;

            const [existing] = await tx
              .select({ id: gratuityAccruals.id })
              .from(gratuityAccruals)
              .where(
                and(
                  eq(gratuityAccruals.employeeId, emp.id),
                  eq(gratuityAccruals.year, input.year),
                  eq(gratuityAccruals.month, input.month),
                ),
              )
              .limit(1);
            if (existing) {
              await tx
                .update(gratuityAccruals)
                .set({
                  basicPlusDA: String(basicPlusDA),
                  accrualAmount: String(accrualAmount),
                  cumulativeAccrued: String(cumulative),
                })
                .where(eq(gratuityAccruals.id, existing.id));
            } else {
              await tx.insert(gratuityAccruals).values({
                orgId: org!.id,
                employeeId: emp.id,
                year: input.year,
                month: input.month,
                basicPlusDA: String(basicPlusDA),
                accrualAmount: String(accrualAmount),
                cumulativeAccrued: String(cumulative),
              });
            }
          });
          provisioned++;
          totalAccrued += accrualAmount;
        }
        return { provisioned, totalAccrued };
      }),
  }),

  // ── Settlement: final statutory payout at exit ─────────────────────────────
  settlement: router({
    // Preview the computed gratuity without persisting.
    preview: permissionProcedure("hr", "read")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          asOf: z.string().datetime().optional(),
          lastDrawnBasicPlusDA: z.number().min(0).optional(),
          waiveMinimumService: z.boolean().optional(),
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
        if (!emp.startDate)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Employee has no start date" });

        const asOf = input.asOf ? new Date(input.asOf) : emp.endDate ? new Date(emp.endDate) : new Date();
        const { completedYears, trailingMonths } = serviceTenure(new Date(emp.startDate), asOf);

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

        return computeGratuity({
          lastDrawnBasicPlusDA: wages,
          completedYears,
          trailingMonths,
          waiveMinimumService: input.waiveMinimumService,
        });
      }),

    // Get the settlement (if any) for an employee.
    get: permissionProcedure("hr", "read")
      .input(z.object({ employeeId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .select()
          .from(gratuitySettlements)
          .where(
            and(
              eq(gratuitySettlements.orgId, org!.id),
              eq(gratuitySettlements.employeeId, input.employeeId),
            ),
          )
          .limit(1);
        return row ?? null;
      }),

    // Compute and persist the final settlement (one per employee).
    settle: permissionProcedure("hr", "approve")
      .input(
        z.object({
          employeeId: z.string().uuid(),
          asOf: z.string().datetime().optional(),
          lastDrawnBasicPlusDA: z.number().min(0).optional(),
          reason: z
            .enum(["resignation", "retirement", "death", "disablement", "termination"])
            .optional(),
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
          if (!emp.startDate)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Employee has no start date" });

          const [dup] = await tx
            .select({ id: gratuitySettlements.id })
            .from(gratuitySettlements)
            .where(eq(gratuitySettlements.employeeId, input.employeeId))
            .limit(1);
          if (dup)
            throw new TRPCError({
              code: "CONFLICT",
              message: "Gratuity already settled for this employee",
            });

          const asOf = input.asOf
            ? new Date(input.asOf)
            : emp.endDate
              ? new Date(emp.endDate)
              : new Date();
          const { completedYears, trailingMonths } = serviceTenure(new Date(emp.startDate), asOf);

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

          // Death / disablement waive the 5-year minimum (§4(1) proviso).
          const waiveMinimumService =
            input.reason === "death" || input.reason === "disablement";
          const g = computeGratuity({
            lastDrawnBasicPlusDA: wages,
            completedYears,
            trailingMonths,
            waiveMinimumService,
          });

          const [row] = await tx
            .insert(gratuitySettlements)
            .values({
              orgId: org!.id,
              employeeId: input.employeeId,
              lastDrawnBasicPlusDA: String(g.lastDrawnBasicPlusDA),
              completedYears,
              trailingMonths,
              countedYears: g.countedYears,
              eligible: g.eligible,
              grossGratuity: String(g.grossGratuity),
              gratuityAmount: String(g.gratuity),
              cappedAtCeiling: g.cappedAtCeiling,
              reason: input.reason,
              settledById: (user?.id as string) ?? null,
            })
            .returning();
          return row!;
        });
      }),
  }),
});
