/**
 * Fixed-asset depreciation router (Sprint 2.1).
 * ─────────────────────────────────────────────
 * Sits under the `cmdb` RBAC module (same as assets). Lets a controller:
 *   - setup   : enrol an asset in the depreciation register (method/life/salvage)
 *   - schedule: preview the full period-by-period schedule (pure-math, no writes)
 *   - run     : charge the next period for one asset (idempotent per period)
 *   - runAll  : charge the next due period for every enrolled, not-fully-
 *               depreciated asset (month/year-end batch)
 *   - register: list the register with current book values
 *   - entries : the depreciation ledger for one asset
 *
 * Reads gate on cmdb:read, mutations on cmdb:write. All queries are org-scoped.
 * Book value + accumulated depreciation are maintained on the register row so
 * the balance-sheet rollup (Sprint 2.2) can read them directly.
 */
import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assets,
  assetDepreciation,
  assetDepreciationEntries,
  eq,
  and,
  desc,
  asc,
} from "@coheronconnect/db";
import {
  computePeriodDepreciation,
  generateDepreciationSchedule,
  type DepreciationMethod,
} from "@coheronconnect/payroll-math";

type DepreciationRow = typeof assetDepreciation.$inferSelect;

/** Maps a register row into the pure-math input shape. */
function toDepreciationInput(row: DepreciationRow) {
  return {
    cost: Number(row.cost),
    salvageValue: Number(row.salvageValue),
    usefulLifeYears: row.usefulLifeYears,
    method: row.method as DepreciationMethod,
    wdvRate: row.wdvRate != null ? Number(row.wdvRate) : undefined,
  };
}

export const depreciationRouter = router({
  /** Enrol an asset in the depreciation register (idempotent upsert). */
  setup: permissionProcedure("cmdb", "write")
    .input(
      z.object({
        assetId: z.string().uuid(),
        method: z.enum(["SLM", "WDV"]).default("SLM"),
        cost: z.coerce.number().positive().optional(),
        salvageValue: z.coerce.number().min(0).default(0),
        usefulLifeYears: z.coerce.number().int().min(1).max(100),
        wdvRate: z.coerce.number().gt(0).lt(1).optional(),
        startDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [asset] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.id, input.assetId), eq(assets.orgId, org!.id)));
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });

      const cost = input.cost ?? (asset.purchaseCost != null ? Number(asset.purchaseCost) : undefined);
      if (cost == null || cost <= 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Asset has no purchase cost; provide an explicit cost to depreciate.",
        });
      }
      if (input.salvageValue >= cost) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Salvage value must be below cost." });
      }
      const startDate = input.startDate ?? asset.purchaseDate ?? new Date();

      const [existing] = await db
        .select()
        .from(assetDepreciation)
        .where(and(eq(assetDepreciation.assetId, input.assetId), eq(assetDepreciation.orgId, org!.id)));

      if (existing) {
        // Re-setup is only allowed before any period has been charged.
        if (existing.periodsElapsed > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Asset already has depreciation charged; cannot re-configure.",
          });
        }
        const [updated] = await db
          .update(assetDepreciation)
          .set({
            method: input.method,
            cost: String(cost),
            salvageValue: String(input.salvageValue),
            usefulLifeYears: input.usefulLifeYears,
            wdvRate: input.wdvRate != null ? String(input.wdvRate) : null,
            bookValue: String(cost),
            accumulatedDepreciation: "0",
            startDate,
            fullyDepreciated: false,
            updatedAt: new Date(),
          })
          .where(eq(assetDepreciation.id, existing.id))
          .returning();
        return updated!;
      }

      const [created] = await db
        .insert(assetDepreciation)
        .values({
          orgId: org!.id,
          assetId: input.assetId,
          method: input.method,
          cost: String(cost),
          salvageValue: String(input.salvageValue),
          usefulLifeYears: input.usefulLifeYears,
          wdvRate: input.wdvRate != null ? String(input.wdvRate) : null,
          accumulatedDepreciation: "0",
          bookValue: String(cost),
          periodsElapsed: 0,
          startDate,
          fullyDepreciated: false,
        })
        .returning();
      return created!;
    }),

  /** Preview the full schedule for an enrolled asset (no writes). */
  schedule: permissionProcedure("cmdb", "read")
    .input(z.object({ assetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select()
        .from(assetDepreciation)
        .where(and(eq(assetDepreciation.assetId, input.assetId), eq(assetDepreciation.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not enrolled in depreciation" });
      return generateDepreciationSchedule(toDepreciationInput(row));
    }),

  /** List the depreciation register with current book values. */
  register: permissionProcedure("cmdb", "read")
    .input(z.object({ includeFullyDepreciated: z.boolean().default(true) }).optional())
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conds = [eq(assetDepreciation.orgId, org!.id)];
      if (input?.includeFullyDepreciated === false) {
        conds.push(eq(assetDepreciation.fullyDepreciated, false));
      }
      const rows = await db
        .select()
        .from(assetDepreciation)
        .where(and(...conds))
        .orderBy(desc(assetDepreciation.updatedAt));

      const totalCost = rows.reduce((s, r) => s + Number(r.cost), 0);
      const totalAccumulated = rows.reduce((s, r) => s + Number(r.accumulatedDepreciation), 0);
      const totalBookValue = rows.reduce((s, r) => s + Number(r.bookValue), 0);
      return { items: rows, totalCost, totalAccumulated, totalBookValue };
    }),

  /** Depreciation ledger for one asset. */
  entries: permissionProcedure("cmdb", "read")
    .input(z.object({ assetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(assetDepreciationEntries)
        .where(and(eq(assetDepreciationEntries.assetId, input.assetId), eq(assetDepreciationEntries.orgId, org!.id)))
        .orderBy(asc(assetDepreciationEntries.period));
    }),

  /** Charge the next period for one asset. Idempotent per (asset, period). */
  run: permissionProcedure("cmdb", "write")
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(assetDepreciation)
          .where(and(eq(assetDepreciation.assetId, input.assetId), eq(assetDepreciation.orgId, org!.id)))
          .for("update");
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not enrolled in depreciation" });
        if (row.fullyDepreciated || row.periodsElapsed >= row.usefulLifeYears) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Asset is fully depreciated." });
        }

        const period = row.periodsElapsed + 1;
        const opening = Number(row.bookValue);
        // Use the schedule's trued-up charge for the final period; otherwise the
        // incremental single-period charge. Both come from the pure-math engine.
        const mathInput = toDepreciationInput(row);
        let charge: number;
        if (period === row.usefulLifeYears) {
          charge = Math.max(0, Math.round(opening - Number(row.salvageValue)));
        } else {
          charge = computePeriodDepreciation(mathInput, opening);
        }
        const accumulated = Number(row.accumulatedDepreciation) + charge;
        const closing = opening - charge;
        const fully = period >= row.usefulLifeYears || closing <= Number(row.salvageValue);

        const [entry] = await tx
          .insert(assetDepreciationEntries)
          .values({
            orgId: org!.id,
            assetId: input.assetId,
            period,
            openingBookValue: String(opening),
            depreciation: String(charge),
            accumulatedDepreciation: String(accumulated),
            closingBookValue: String(closing),
            createdById: user?.id ?? null,
          })
          .onConflictDoNothing({
            target: [assetDepreciationEntries.assetId, assetDepreciationEntries.period],
          })
          .returning();

        if (!entry) {
          // Period already charged by a concurrent run — idempotent no-op.
          return { charged: false, period, depreciation: 0, bookValue: opening };
        }

        await tx
          .update(assetDepreciation)
          .set({
            periodsElapsed: period,
            accumulatedDepreciation: String(accumulated),
            bookValue: String(closing),
            fullyDepreciated: fully,
            updatedAt: new Date(),
          })
          .where(eq(assetDepreciation.id, row.id));

        return { charged: true, period, depreciation: charge, bookValue: closing, fullyDepreciated: fully };
      });
    }),

  /** Batch: charge the next due period for every enrolled, active asset. */
  runAll: permissionProcedure("cmdb", "write")
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const { db, org, user } = ctx;
      const rows = await db
        .select()
        .from(assetDepreciation)
        .where(and(eq(assetDepreciation.orgId, org!.id), eq(assetDepreciation.fullyDepreciated, false)));

      let charged = 0;
      let totalDepreciation = 0;
      for (const row of rows) {
        if (row.periodsElapsed >= row.usefulLifeYears) continue;
        await db.transaction(async (tx) => {
          const [locked] = await tx
            .select()
            .from(assetDepreciation)
            .where(eq(assetDepreciation.id, row.id))
            .for("update");
          if (!locked || locked.fullyDepreciated || locked.periodsElapsed >= locked.usefulLifeYears) return;

          const period = locked.periodsElapsed + 1;
          const opening = Number(locked.bookValue);
          const mathInput = toDepreciationInput(locked);
          const charge =
            period === locked.usefulLifeYears
              ? Math.max(0, Math.round(opening - Number(locked.salvageValue)))
              : computePeriodDepreciation(mathInput, opening);
          const accumulated = Number(locked.accumulatedDepreciation) + charge;
          const closing = opening - charge;
          const fully = period >= locked.usefulLifeYears || closing <= Number(locked.salvageValue);

          const [entry] = await tx
            .insert(assetDepreciationEntries)
            .values({
              orgId: org!.id,
              assetId: locked.assetId,
              period,
              openingBookValue: String(opening),
              depreciation: String(charge),
              accumulatedDepreciation: String(accumulated),
              closingBookValue: String(closing),
              createdById: user?.id ?? null,
            })
            .onConflictDoNothing({
              target: [assetDepreciationEntries.assetId, assetDepreciationEntries.period],
            })
            .returning();
          if (!entry) return;

          await tx
            .update(assetDepreciation)
            .set({
              periodsElapsed: period,
              accumulatedDepreciation: String(accumulated),
              bookValue: String(closing),
              fullyDepreciated: fully,
              updatedAt: new Date(),
            })
            .where(eq(assetDepreciation.id, locked.id));

          charged += 1;
          totalDepreciation += charge;
        });
      }
      return { charged, totalDepreciation };
    }),
});
