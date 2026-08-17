/**
 * Which GL accounts a fixed asset posts to.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `depreciation-journal.ts` hardcoded two account CODES — 5500 depreciation
 * expense and 1290 accumulated depreciation — and looked them up per posting.
 * That gives every asset in the company one bucket: acceptable for a
 * forty-person startup, wrong for anyone with a real fixed-asset register, where
 * a building, a vehicle and a laptop capitalise into different asset accounts and
 * depreciate into different expense lines.
 *
 * ── The grain ───────────────────────────────────────────────────────────────
 * The mapping lives on the asset TYPE, with a per-asset override carried in the
 * schema but not yet exposed. `assets.type_id` is NOT NULL, so every existing
 * asset resolves through exactly one type and no backfill was needed.
 *
 *   asset override → type default → the constant codes below
 *
 * Keeping the constants as the final fallback is what lets this ship without
 * breaking a single tenant on day one: an org that has mapped nothing behaves
 * exactly as it did before.
 *
 * ── What is still allowed to fail ───────────────────────────────────────────
 * Resolution produces a CODE; the code still has to exist in the tenant's chart
 * of accounts. It frequently does not — `packages/db/src/seed.ts` seeds 21
 * accounts and includes neither 1290 nor 5500 (they arrive via the startup seed
 * reconciler). So an unresolvable account is a real, reachable condition, and
 * `assets.create` rejects on it by name rather than posting a half entry.
 */

import { chartOfAccounts, assets, assetTypes, eq, and, inArray, type DbOrTx } from "@coheronconnect/db";

/**
 * Fallback account codes, used when neither the asset nor its type maps one.
 *
 * 5500/1290 are the two `depreciation-journal.ts` has always used. 1200 "Fixed
 * Assets" is the parent capitalisation account from `INDIA_COA_SEED` — the
 * generic default. A tenant that wants laptops in 1210 and furniture in 1220
 * expresses that on the asset TYPE, which is the whole point of the mapping.
 */
export const DEFAULT_ASSET_ACCOUNT_CODES = {
  asset: "1200",
  accumulatedDepreciation: "1290",
  depreciationExpense: "5500",
} as const;

/**
 * The account the acquisition entry CREDITS.
 *
 * Accounts Payable, not Bank. Recording an asset does not assert that money left
 * a bank account: the asset may be on credit, on a purchase order, or already
 * paid through a separate transaction. Crediting Bank would invent a payment and
 * corrupt the balance that bank reconciliation ties out against a real statement.
 * Crediting AP states only what is certainly true at acquisition — the
 * organisation owes for this asset — and any later payment is its own entry
 * (Dr AP, Cr Bank) on the path that actually knows about the payment.
 */
export const ACQUISITION_CREDIT_CODE = "2110";

export interface ResolvedAssetAccounts {
  assetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
  /** Codes actually used, for the audit trail and error messages. */
  codes: { asset: string; accumulated: string; expense: string };
}

/** What could not be resolved, named so the message can say which. */
export interface AssetAccountResolutionFailure {
  missing: Array<{ role: string; code: string }>;
}

export type AssetAccountResolution =
  | { ok: true; accounts: ResolvedAssetAccounts }
  | { ok: false; failure: AssetAccountResolutionFailure };

/**
 * Resolve the three accounts for one asset.
 *
 * `assetId` is optional so the depreciation poster (which has the asset id) and
 * `assets.create` (which has only the type, before the row exists) share one
 * implementation. Divergent duplicates are this codebase's recurring defect.
 */
export async function resolveAssetAccounts(
  db: DbOrTx,
  params: { orgId: string; typeId: string; assetId?: string | null },
): Promise<AssetAccountResolution> {
  const { orgId, typeId, assetId } = params;

  // ── Layer 1: the per-asset override (schema-only today) ───────────────────
  let override: {
    assetAccountId: string | null;
    accumulatedDepreciationAccountId: string | null;
    depreciationExpenseAccountId: string | null;
  } | null = null;
  if (assetId) {
    const [row] = await db
      .select({
        assetAccountId: assets.assetAccountId,
        accumulatedDepreciationAccountId: assets.accumulatedDepreciationAccountId,
        depreciationExpenseAccountId: assets.depreciationExpenseAccountId,
      })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.orgId, orgId)));
    override = row ?? null;
  }

  // ── Layer 2: the type default ─────────────────────────────────────────────
  const [type] = await db
    .select({
      assetAccountId: assetTypes.assetAccountId,
      accumulatedDepreciationAccountId: assetTypes.accumulatedDepreciationAccountId,
      depreciationExpenseAccountId: assetTypes.depreciationExpenseAccountId,
    })
    .from(assetTypes)
    .where(and(eq(assetTypes.id, typeId), eq(assetTypes.orgId, orgId)));

  const directIds = {
    asset: override?.assetAccountId ?? type?.assetAccountId ?? null,
    accumulated:
      override?.accumulatedDepreciationAccountId ?? type?.accumulatedDepreciationAccountId ?? null,
    expense: override?.depreciationExpenseAccountId ?? type?.depreciationExpenseAccountId ?? null,
  };

  // ── Layer 3: the constant codes, for whatever is still unmapped ───────────
  const wantedCodes: string[] = [];
  if (!directIds.asset) wantedCodes.push(DEFAULT_ASSET_ACCOUNT_CODES.asset);
  if (!directIds.accumulated) wantedCodes.push(DEFAULT_ASSET_ACCOUNT_CODES.accumulatedDepreciation);
  if (!directIds.expense) wantedCodes.push(DEFAULT_ASSET_ACCOUNT_CODES.depreciationExpense);

  const byCode = new Map<string, string>();
  if (wantedCodes.length > 0) {
    const rows = await db
      .select({ id: chartOfAccounts.id, code: chartOfAccounts.code })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, orgId), inArray(chartOfAccounts.code, wantedCodes)));
    for (const r of rows) byCode.set(r.code, r.id);
  }

  const resolve = (
    direct: string | null,
    code: string,
  ): { id: string | null; code: string } =>
    direct ? { id: direct, code: "(mapped)" } : { id: byCode.get(code) ?? null, code };

  const assetAcct = resolve(directIds.asset, DEFAULT_ASSET_ACCOUNT_CODES.asset);
  const accumAcct = resolve(directIds.accumulated, DEFAULT_ASSET_ACCOUNT_CODES.accumulatedDepreciation);
  const expenseAcct = resolve(directIds.expense, DEFAULT_ASSET_ACCOUNT_CODES.depreciationExpense);

  const missing: Array<{ role: string; code: string }> = [];
  if (!assetAcct.id) missing.push({ role: "asset account", code: assetAcct.code });
  if (!accumAcct.id) missing.push({ role: "accumulated depreciation", code: accumAcct.code });
  if (!expenseAcct.id) missing.push({ role: "depreciation expense", code: expenseAcct.code });

  if (missing.length > 0) return { ok: false, failure: { missing } };

  return {
    ok: true,
    accounts: {
      assetAccountId: assetAcct.id!,
      accumulatedDepreciationAccountId: accumAcct.id!,
      depreciationExpenseAccountId: expenseAcct.id!,
      codes: { asset: assetAcct.code, accumulated: accumAcct.code, expense: expenseAcct.code },
    },
  };
}

/** A message the person creating the asset can act on, naming what is missing. */
export function describeAccountFailure(failure: AssetAccountResolutionFailure): string {
  const parts = failure.missing.map((m) =>
    m.code === "(mapped)" ? m.role : `${m.role} (expected account code ${m.code})`,
  );
  return `This asset cannot be posted to the ledger because the following account${
    failure.missing.length === 1 ? " is" : "s are"
  } not on the chart of accounts: ${parts.join(", ")}. Map them on the asset type, or add the account under Finance → Chart of Accounts.`;
}
