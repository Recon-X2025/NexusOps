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
  type Db,
  type DbOrTx,
} from "@coheronconnect/db";
import {
  computePeriodDepreciation,
  generateDepreciationSchedule,
  type DepreciationMethod,
} from "@coheronconnect/payroll-math";
import { postDepreciationJournalEntry } from "../lib/depreciation-journal";
import { currentFY } from "./accounting";

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

/** First calendar year of the India financial year containing `d` (April–March). */
export function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

/** `2026` → `"2026-2027"`. Same shape as `currentFY()` in the accounting router. */
export function fyKey(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

/**
 * Resolve the "charge through" financial year, refusing anything later than the
 * current one. Depreciation is recognised as time passes; charging a year that
 * has not begun is not a period the books can have. Without this, `run` would
 * happily charge an asset's whole life in one afternoon — which is exactly what
 * the pre-existing tests did, and exactly what a scheduler must never be able
 * to do by accident.
 */
export function resolveThroughFyStart(input: string | undefined, now: Date = new Date()): number {
  const currentStart = fyStartYear(now);
  if (!input) return currentStart;
  const requested = Number(input.split("-")[0]);
  if (!Number.isFinite(requested)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid financial year: ${input}` });
  }
  if (requested > currentStart) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot charge depreciation for ${input}: that financial year has not started. Current is ${fyKey(currentStart)}.`,
    });
  }
  return requested;
}

/**
 * The financial year that the asset's NEXT un-charged period belongs to.
 *
 * Period N is the Nth financial year from the one the register row starts in,
 * so the next period (`periodsElapsed + 1`) lands on `startFY + periodsElapsed`.
 * This is what makes the run idempotent on a calendar period rather than on an
 * ordinal counter — see the note on `assetDepreciationEntries.periodKey`.
 */
export function nextPeriodKey(row: DepreciationRow): string {
  return fyKey(fyStartYear(new Date(row.startDate)) + row.periodsElapsed);
}

/** What the next charge WOULD be, without writing anything. */
export function previewNextCharge(row: DepreciationRow) {
  const period = row.periodsElapsed + 1;
  const opening = Number(row.bookValue);
  const salvage = Number(row.salvageValue);
  const charge =
    period === row.usefulLifeYears
      ? Math.max(0, Math.round(opening - salvage))
      : computePeriodDepreciation(toDepreciationInput(row), opening);
  const accumulated = Number(row.accumulatedDepreciation) + charge;
  const closing = opening - charge;
  return {
    period,
    periodKey: nextPeriodKey(row),
    openingBookValue: opening,
    depreciation: charge,
    accumulatedDepreciation: accumulated,
    closingBookValue: closing,
    fullyDepreciated: period >= row.usefulLifeYears || closing <= salvage,
  };
}

/**
 * Charge one period for one already-locked register row. ONE implementation,
 * shared by `run` (single asset) and `runAll`/the scheduled sweep (batch) — the
 * two used to carry copy-pasted bodies, which is how the guards in this codebase
 * historically drift apart.
 *
 * Returns `charged: false` without writing when the asset has already been
 * charged for `periodKey`. That is the idempotency guard: it is enforced by the
 * unique index on `(asset_id, period_key)`, so a race loses at the database
 * rather than relying on the read below.
 */
async function chargeLockedRow(
  tx: DbOrTx,
  args: { orgId: string; userId: string | null; row: DepreciationRow; periodKey: string },
) {
  const { orgId, userId, row, periodKey } = args;

  if (row.fullyDepreciated || row.periodsElapsed >= row.usefulLifeYears) {
    return { charged: false as const, reason: "fully_depreciated" as const, periodKey };
  }

  const p = previewNextCharge(row);
  // The row we hold says this period is next; if THAT financial year is already
  // in the ledger the run is a repeat and must do nothing.
  if (p.periodKey !== periodKey) {
    return { charged: false as const, reason: "not_due" as const, periodKey };
  }

  const [entry] = await tx
    .insert(assetDepreciationEntries)
    .values({
      orgId,
      assetId: row.assetId,
      period: p.period,
      periodKey,
      openingBookValue: String(p.openingBookValue),
      depreciation: String(p.depreciation),
      accumulatedDepreciation: String(p.accumulatedDepreciation),
      closingBookValue: String(p.closingBookValue),
      createdById: userId,
    })
    .onConflictDoNothing({
      target: [assetDepreciationEntries.assetId, assetDepreciationEntries.periodKey],
    })
    .returning();

  if (!entry) {
    return { charged: false as const, reason: "already_charged" as const, periodKey };
  }

  const jeDate = new Date();
  const journalEntryId = await postDepreciationJournalEntry(tx, {
    orgId,
    createdById: userId,
    assetId: row.assetId,
    period: p.period,
    charge: p.depreciation,
    date: jeDate,
    financialYear: currentFY(jeDate),
  });
  if (journalEntryId) {
    await tx
      .update(assetDepreciationEntries)
      .set({ journalEntryId })
      .where(eq(assetDepreciationEntries.id, entry.id));
  }

  await tx
    .update(assetDepreciation)
    .set({
      periodsElapsed: p.period,
      accumulatedDepreciation: String(p.accumulatedDepreciation),
      bookValue: String(p.closingBookValue),
      fullyDepreciated: p.fullyDepreciated,
      updatedAt: new Date(),
    })
    .where(eq(assetDepreciation.id, row.id));

  return {
    charged: true as const,
    period: p.period,
    periodKey,
    depreciation: p.depreciation,
    bookValue: p.closingBookValue,
    fullyDepreciated: p.fullyDepreciated,
    journalEntryId,
  };
}

/**
 * Charge every financial year an asset owes, up to and including `throughFyStart`.
 *
 * Catch-up matters because the charge is ANNUAL: an asset enrolled today with a
 * 2024 start date owes FY2024-25 and FY2025-26, and a job that charged only one
 * period per invocation would take years to settle that.
 */
export async function chargeOwedPeriods(
  db: Db,
  args: { orgId: string; userId: string | null; assetId: string; throughFyStart: number },
) {
  const results: Array<Awaited<ReturnType<typeof chargeLockedRow>>> = [];
  // Bounded by useful life; the loop always terminates because every successful
  // charge advances periodsElapsed and every unsuccessful one breaks.
  for (let guard = 0; guard < 200; guard++) {
    // Typed `Db` rather than `DbOrTx` because this STARTS a transaction: the
    // union's two call signatures are not assignable to one another, and casting
    // it away would hide a real distinction. At runtime `ctx.db` may already be
    // the RLS transaction handle, in which case this opens a savepoint — which
    // is exactly the per-asset isolation the batch wants.
    const done: boolean = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(assetDepreciation)
        .where(
          and(eq(assetDepreciation.assetId, args.assetId), eq(assetDepreciation.orgId, args.orgId)),
        )
        .for("update");
      if (!locked) return true;

      const key = nextPeriodKey(locked);
      const keyStart = Number(key.split("-")[0]);
      if (keyStart > args.throughFyStart) {
        // Nothing owed for the requested year. Record WHY on the first pass so a
        // caller that charged nothing can say so instead of returning a silent
        // empty result — "it did nothing" and "it had nothing to do" look
        // identical otherwise.
        if (results.length === 0) {
          results.push({ charged: false as const, reason: "not_due" as const, periodKey: key });
        }
        return true;
      }

      const res = await chargeLockedRow(tx, {
        orgId: args.orgId,
        userId: args.userId,
        row: locked,
        periodKey: key,
      });
      results.push(res);
      return !res.charged;
    });
    if (done) break;
  }
  return results;
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

  /**
   * Whether the automatic month-end sweep is on for this tenant, and when it
   * last did anything. Read by the screen so the state of a background job that
   * posts to the ledger is never invisible.
   */
  autoRun: permissionProcedure("cmdb", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const { organizations, auditLogs, desc: dbDesc } = await import("@coheronconnect/db");
    const { parseOrgSettings } = await import("../lib/org-settings.js");

    const [row] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, org!.id));

    const [lastRun] = await db
      .select({ createdAt: auditLogs.createdAt, changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, org!.id), eq(auditLogs.action, "depreciation.sweep")))
      .orderBy(dbDesc(auditLogs.createdAt))
      .limit(1);

    return {
      enabled: parseOrgSettings(row?.settings).financial?.depreciationAutoRunEnabled === true,
      lastRunAt: lastRun?.createdAt ?? null,
      lastRun: (lastRun?.changes as Record<string, unknown> | undefined) ?? null,
    };
  }),

  /** Turn the automatic month-end sweep on or off for this tenant (3f). */
  setAutoRun: permissionProcedure("cmdb", "write")
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { organizations } = await import("@coheronconnect/db");
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const raw = (row?.settings ?? {}) as Record<string, unknown>;
      const prevFin = (raw["financial"] as Record<string, unknown> | undefined) ?? {};
      await db
        .update(organizations)
        .set({
          settings: {
            ...raw,
            financial: { ...prevFin, depreciationAutoRunEnabled: input.enabled },
          },
        })
        .where(eq(organizations.id, org!.id));
      return { enabled: input.enabled };
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

  /**
   * What a run would post, WITHOUT posting it (2c).
   *
   * The screen shows this before enabling the Post control: an accountant does
   * not press a button that silently writes to the ledger. Rows already charged
   * for their next financial year come back `alreadyCharged` so the preview also
   * answers "why is this asset not in the list".
   */
  preview: permissionProcedure("cmdb", "read")
    .input(z.object({ throughFinancialYear: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const throughFyStart = resolveThroughFyStart(input?.throughFinancialYear);

      const rows = await db
        .select()
        .from(assetDepreciation)
        .where(and(eq(assetDepreciation.orgId, org!.id), eq(assetDepreciation.fullyDepreciated, false)));

      const charged = await db
        .select({
          assetId: assetDepreciationEntries.assetId,
          periodKey: assetDepreciationEntries.periodKey,
        })
        .from(assetDepreciationEntries)
        .where(eq(assetDepreciationEntries.orgId, org!.id));
      const chargedKeys = new Set(charged.map((c) => `${c.assetId}::${c.periodKey}`));

      /**
       * Every enrolled asset gets a row with a STATUS, not just the ones that
       * would post. "Why is this asset missing from the run?" is the first
       * question an accountant asks of a preview, and an asset silently absent
       * from the list cannot answer it.
       */
      const items: Array<{
        assetId: string;
        status: "postable" | "already_charged" | "not_due" | "fully_depreciated";
        period: number;
        periodKey: string;
        openingBookValue: number;
        depreciation: number;
        closingBookValue: number;
        fullyDepreciated: boolean;
      }> = [];

      for (const row of rows) {
        const p = previewNextCharge(row);
        const nextStart = Number(p.periodKey.split("-")[0]);
        let status: (typeof items)[number]["status"];
        if (row.periodsElapsed >= row.usefulLifeYears) status = "fully_depreciated";
        else if (chargedKeys.has(`${row.assetId}::${fyKey(throughFyStart)}`)) status = "already_charged";
        else if (nextStart > throughFyStart) status = "not_due";
        else status = "postable";

        items.push({
          assetId: row.assetId,
          status,
          period: p.period,
          periodKey: p.periodKey,
          openingBookValue: p.openingBookValue,
          // Only a postable row has a charge to show; anything else would be a
          // figure the run is not about to post.
          depreciation: status === "postable" ? p.depreciation : 0,
          closingBookValue: status === "postable" ? p.closingBookValue : p.openingBookValue,
          fullyDepreciated: p.fullyDepreciated,
        });
      }

      const postable = items.filter((i) => i.status === "postable");
      return {
        throughFinancialYear: fyKey(throughFyStart),
        items,
        postableCount: postable.length,
        totalDepreciation: postable.reduce((s, i) => s + i.depreciation, 0),
      };
    }),

  /**
   * Charge one asset up to the given financial year (defaults to the current
   * one). Idempotent on (asset, financial year) — a second call in the same
   * period posts nothing and reports why.
   */
  run: permissionProcedure("cmdb", "write")
    .input(
      z.object({
        assetId: z.string().uuid(),
        throughFinancialYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [row] = await db
        .select()
        .from(assetDepreciation)
        .where(and(eq(assetDepreciation.assetId, input.assetId), eq(assetDepreciation.orgId, org!.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Asset not enrolled in depreciation" });
      if (row.fullyDepreciated || row.periodsElapsed >= row.usefulLifeYears) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Asset is fully depreciated." });
      }

      const throughFyStart = resolveThroughFyStart(input.throughFinancialYear);

      const results = await chargeOwedPeriods(db, {
        orgId: org!.id,
        userId: user?.id ?? null,
        assetId: input.assetId,
        throughFyStart,
      });

      const posted = results.filter((r) => r.charged);
      const last = posted[posted.length - 1];
      return {
        charged: posted.length > 0,
        periodsCharged: posted.length,
        depreciation: posted.reduce((s, r) => s + (r.charged ? r.depreciation : 0), 0),
        period: last?.charged ? last.period : row.periodsElapsed,
        bookValue: last?.charged ? last.bookValue : Number(row.bookValue),
        fullyDepreciated: last?.charged ? last.fullyDepreciated : row.fullyDepreciated,
        // Why nothing happened, when nothing happened.
        skipped: results.filter((r) => !r.charged).map((r) => ({ reason: r.reason, periodKey: r.periodKey })),
        // `postDepreciationJournalEntry` returns null — without throwing — when
        // COA codes 5500/1290 are not on the org's chart of accounts. The charge
        // is still recorded and book value still drops, so the register looks
        // settled while the general ledger never moved: the balance sheet and
        // P&L stay wrong and nothing anywhere says so. Surfaced (not swallowed)
        // so the screen can tell the user their charge did not reach the ledger.
        unposted: posted.filter((r) => r.charged && !r.journalEntryId).length,
      };
    }),

  /**
   * Batch: charge every enrolled asset up to the given financial year.
   *
   * Transactional PER ASSET, not per run — one asset that fails (a missing COA
   * account, a lock timeout) leaves the assets already charged committed and the
   * rest untouched, and the next invocation picks up exactly where this one
   * stopped because each asset's progress is recorded on its own row. A single
   * transaction across the whole batch would be worse: one bad asset would roll
   * back a month-end close that was otherwise correct.
   */
  runAll: permissionProcedure("cmdb", "write")
    .input(z.object({ throughFinancialYear: z.string().regex(/^\d{4}-\d{4}$/).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      return runDepreciationForOrg(db, {
        orgId: org!.id,
        userId: user?.id ?? null,
        throughFyStart: resolveThroughFyStart(input?.throughFinancialYear),
      });
    }),
});

/**
 * Charge every enrolled asset in one org up to `throughFyStart`. Shared by the
 * `runAll` procedure and the scheduled sweep so the manual and automatic paths
 * cannot diverge.
 */
export async function runDepreciationForOrg(
  db: Db,
  args: { orgId: string; userId: string | null; throughFyStart: number },
) {
  const rows = await db
    .select()
    .from(assetDepreciation)
    .where(and(eq(assetDepreciation.orgId, args.orgId), eq(assetDepreciation.fullyDepreciated, false)));

  let charged = 0;
  let totalDepreciation = 0;
  let assetsTouched = 0;
  // Charges that were recorded but never reached the general ledger — see the
  // `unposted` note on `run` below. Counted, not swallowed.
  let unposted = 0;
  const failures: Array<{ assetId: string; error: string }> = [];

  for (const row of rows) {
    if (row.periodsElapsed >= row.usefulLifeYears) continue;
    try {
      const results = await chargeOwedPeriods(db, {
        orgId: args.orgId,
        userId: args.userId,
        assetId: row.assetId,
        throughFyStart: args.throughFyStart,
      });
      const posted = results.filter((r) => r.charged);
      if (posted.length > 0) assetsTouched += 1;
      charged += posted.length;
      totalDepreciation += posted.reduce((s, r) => s + (r.charged ? r.depreciation : 0), 0);
      unposted += posted.filter((r) => r.charged && !r.journalEntryId).length;
    } catch (err) {
      // Per-asset isolation: record and continue, so one bad row cannot abort a
      // month-end close for every other asset.
      failures.push({ assetId: row.assetId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    charged,
    assetsTouched,
    totalDepreciation,
    throughFinancialYear: fyKey(args.throughFyStart),
    failures,
    unposted,
  };
}
