/**
 * Per-org seed reconciler (2026-08-07).
 *
 * Some seeds are copied into EACH org once (at signup), from a definition that grows
 * over time — so when a new entry is added to the definition, orgs created earlier
 * silently miss it. (This is how COA accounts 4130/4140 for the credit/debit-note
 * ledger came to be absent on the live org: they were added to INDIA_COA_SEED after
 * that org was seeded.) This module brings EVERY org up to the CURRENT definition on
 * each deploy, inserting only what is missing — killing the drift pattern rather than
 * patching one instance.
 *
 * AUDIT (2026-08-07): COA is currently the ONLY seed with this drift. Statutory
 * ceilings / income-tax config use the platform-default-row pattern (a single
 * `orgId = NULL` row every org falls back to via `resolveStatutoryCeilings`), and PT
 * slabs are an in-code constant — neither is copied per org, so neither drifts. The
 * platform-default pattern is the correct one; COA is the exception. Any FUTURE
 * per-org seed with the same shape should register below rather than get its own path.
 */
import type { DbOrTx } from "@coheronconnect/db";
import { seedChartOfAccountsForOrg } from "../routers/accounting";

export interface ReconcileLogger {
  info: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}

/** A per-org seed whose definition can grow. `reconcile` inserts whatever `orgId`
 *  is missing vs the CURRENT definition and returns the identifiers it inserted
 *  (empty when already aligned). It MUST be idempotent, insert-only, and must not
 *  touch balances or existing rows. */
export interface PerOrgSeedReconciler {
  name: string;
  reconcile: (db: DbOrTx, orgId: string) => Promise<string[]>;
}

/** The registry. COA is the first (and, per the audit above, currently only) member. */
export const PER_ORG_SEED_RECONCILERS: PerOrgSeedReconciler[] = [
  { name: "chart_of_accounts", reconcile: seedChartOfAccountsForOrg },
];

/**
 * Run every registered reconciler for a SINGLE org. Logs (loudly) whenever it inserts
 * anything, with the codes; stays silent when the org is already aligned. NEVER THROWS
 * — a failing reconciler is logged and the rest still run.
 */
export async function reconcileOrgSeeds(db: DbOrTx, orgId: string, label: string, log: ReconcileLogger): Promise<void> {
  for (const r of PER_ORG_SEED_RECONCILERS) {
    try {
      const inserted = await r.reconcile(db, orgId);
      if (inserted.length > 0) {
        log.info(`[seed-reconcile] ${r.name}: org=${label} inserted ${inserted.length} — ${inserted.join(", ")}`);
      }
      // Silent when nothing was missing (already aligned).
    } catch (err) {
      log.error(`[seed-reconcile] ${r.name} FAILED for org=${label} — continuing`, err);
    }
  }
}

/**
 * Reconcile every org against the current per-org seed definitions. Runs at API
 * startup (every deploy), so a grown seed reaches existing orgs automatically.
 *
 * NEVER THROWS. A missing seed row degrades gracefully today; a platform that will
 * not boot does not. Every error is caught and logged loudly, and the API keeps
 * serving.
 */
export async function reconcileSeedsForAllOrgs(db: DbOrTx, log: ReconcileLogger): Promise<void> {
  try {
    const { organizations } = await import("@coheronconnect/db");
    const orgs = await db.select({ id: organizations.id, slug: organizations.slug }).from(organizations);
    for (const org of orgs) {
      await reconcileOrgSeeds(db, org.id, org.slug ?? org.id, log);
    }
  } catch (err) {
    // Could not even enumerate orgs (e.g. DB not ready): skip entirely, non-fatal.
    log.error("[seed-reconcile] could not enumerate organisations; skipping reconciliation (non-fatal)", err);
  }
}
