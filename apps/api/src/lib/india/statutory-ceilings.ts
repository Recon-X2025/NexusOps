/**
 * Statutory-ceiling resolver (G1).
 * ───────────────────────────────
 * Reads the versioned `statutory_ceilings` config and builds the
 * `StatutoryCeilingOverrides` shape consumed by `@coheronconnect/payroll-math`.
 *
 * Selection rule for a given pay period:
 *   effectiveFrom <= period AND (effectiveTo IS NULL OR period < effectiveTo)
 * Org-specific rows (orgId = org) override platform defaults (orgId IS NULL);
 * within a scope the latest `effectiveFrom` wins.
 *
 * When no rows exist the resolver returns `{}`, so payroll-math falls back to
 * its built-in constants and behaviour is unchanged.
 */
import {
  statutoryCeilings,
  eq,
  and,
  or,
  lte,
  gt,
  isNull,
  type DbOrTx,
} from "@coheronconnect/db";
import type { StatutoryCeilingOverrides } from "@coheronconnect/payroll-math";

interface PTSlab {
  from: number;
  to: number;
  monthly: number;
}

type PtSlabTable = Record<string, { slabs: PTSlab[]; annualCap: number }>;
type LwfRateTable = Record<
  string,
  { employee: number; employer: number; frequency: "HALF_YEARLY" | "ANNUAL" }
>;

export async function resolveStatutoryCeilings(
  db: DbOrTx,
  orgId: string,
  period: Date,
): Promise<StatutoryCeilingOverrides> {
  const rows = await db
    .select()
    .from(statutoryCeilings)
    .where(
      and(
        or(eq(statutoryCeilings.orgId, orgId), isNull(statutoryCeilings.orgId)),
        lte(statutoryCeilings.effectiveFrom, period),
        or(
          isNull(statutoryCeilings.effectiveTo),
          gt(statutoryCeilings.effectiveTo, period),
        ),
      ),
    );

  // For each (metricKey, stateCode) pick the winning row: org-scoped beats
  // platform default, then latest effectiveFrom.
  const best = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.metricKey}::${row.stateCode ?? ""}`;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, row);
      continue;
    }
    const rowOrgScoped = row.orgId !== null;
    const prevOrgScoped = prev.orgId !== null;
    if (rowOrgScoped !== prevOrgScoped) {
      if (rowOrgScoped) best.set(key, row);
      continue;
    }
    if (row.effectiveFrom > prev.effectiveFrom) best.set(key, row);
  }

  const overrides: StatutoryCeilingOverrides = {};
  const ptSlabs: PtSlabTable = {};
  const lwfRates: LwfRateTable = {};
  let hasPt = false;
  let hasLwf = false;

  for (const row of best.values()) {
    switch (row.metricKey) {
      case "pf_wage_ceiling":
        if (row.value !== null) overrides.pfWageCeiling = Number(row.value);
        break;
      case "esi_wage_ceiling":
        if (row.value !== null) overrides.esiWageCeiling = Number(row.value);
        break;
      case "bonus_eligibility_ceiling":
        if (row.value !== null)
          overrides.bonusEligibilityCeiling = Number(row.value);
        break;
      case "pt_slab":
        if (row.stateCode && row.slabsJson) {
          ptSlabs[row.stateCode.toUpperCase()] = row.slabsJson as PtSlabTable[string];
          hasPt = true;
        }
        break;
      case "lwf_rate":
        if (row.stateCode && row.slabsJson) {
          lwfRates[row.stateCode.toUpperCase()] = row.slabsJson as LwfRateTable[string];
          hasLwf = true;
        }
        break;
    }
  }

  if (hasPt) overrides.ptSlabs = ptSlabs;
  if (hasLwf) overrides.lwfRates = lwfRates;
  return overrides;
}
