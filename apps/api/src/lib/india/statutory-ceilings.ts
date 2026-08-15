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
 *
 * C5 (income-tax rate set): the same table also carries the income-tax config
 * (slabs per regime, standard deduction, s.87A rebate, surcharge bands, cess).
 * For the REGIME-SPECIFIC keys (income_tax_slabs, standard_deduction, rebate_87a)
 * the `stateCode` column is OVERLOADED to hold the tax regime ("OLD" / "NEW")
 * instead of an Indian state — see the schema column comment. Regime-agnostic keys
 * (surcharge_bands, cess_rate) leave it NULL. If no tax row matches, `taxConfig` is
 * omitted and `computeTax` uses its constants (byte-identical fallback).
 */
import {
  statutoryCeilings,
  professionalTaxSlabs,
  organizations,
  eq,
  and,
  or,
  lte,
  gt,
  isNull,
  type DbOrTx,
} from "@coheronconnect/db";
import type {
  StatutoryCeilingOverrides,
  TaxConfigOverride,
  TaxSlab,
  SurchargeBand,
} from "@coheronconnect/payroll-math";
import { normalizePtStateKey } from "@coheronconnect/payroll-math";

interface PTSlab {
  from: number;
  to: number;
  monthly: number;
}

type PtSlabTable = Record<
  string,
  { slabs: PTSlab[]; annualCap: number; levyPeriod?: "MONTHLY" | "HALF_YEARLY" }
>;
type LwfRateTable = Record<
  string,
  { employee: number; employer: number; frequency: "HALF_YEARLY" | "ANNUAL" }
>;

// C5 income-tax `slabsJson` shapes. `slabsJson` is an untyped blob, cast here.
// A malformed seed (wrong keys) resolves to undefined fields → `computeTax`'s
// `?? constant` fallback silently applies, so the round-trip test must assert the
// SEEDED value actually takes effect, not merely "no error".
//
// The open-ended top slab's `to` is stored as `null` in JSON (JSON cannot encode
// Infinity — `JSON.stringify(Infinity)` is `null`), and normalised back to
// `Infinity` here so `computeSlabTax` treats it as the unbounded top band exactly
// as the in-code constants do.
type SlabBlobEntry = { from: number; to: number | null; rate: number };
type SlabsBlob = { slabs: SlabBlobEntry[] };
type SurchargeBlob = { bands: SurchargeBand[] };
type Rebate87aBlob = { threshold: number; maxRebate: number };

function normaliseSlabs(slabs: SlabBlobEntry[]): TaxSlab[] {
  return slabs.map((s) => ({
    from: s.from,
    to: s.to === null ? Infinity : s.to,
    rate: s.rate,
  }));
}

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

  // C5: assemble the income-tax config from the matching rows. `hasTax` gates
  // whether we attach `overrides.taxConfig` at all — if no tax row matched, the
  // field stays undefined and `computeTax` uses its module constants (the
  // byte-identical fallback every org relies on today).
  const taxConfig: TaxConfigOverride = {};
  let hasTax = false;
  // For the regime-specific tax keys, `row.stateCode` carries the REGIME
  // ("OLD"/"NEW"), not a state — see the schema column comment (deliberate
  // overload, mirroring how PT reuses stateCode).
  const regimeOf = (row: (typeof rows)[number]): "OLD" | "NEW" | null => {
    const code = row.stateCode?.toUpperCase();
    return code === "OLD" || code === "NEW" ? code : null;
  };

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
      case "income_tax_slabs": {
        const regime = regimeOf(row);
        const blob = row.slabsJson as SlabsBlob | null;
        if (regime && blob?.slabs) {
          const slabs = normaliseSlabs(blob.slabs);
          if (regime === "OLD") taxConfig.oldSlabs = slabs;
          else taxConfig.newSlabs = slabs;
          hasTax = true;
        }
        break;
      }
      case "standard_deduction": {
        const regime = regimeOf(row);
        if (regime && row.value !== null) {
          if (regime === "OLD") taxConfig.stdDeductionOld = Number(row.value);
          else taxConfig.stdDeductionNew = Number(row.value);
          hasTax = true;
        }
        break;
      }
      case "rebate_87a": {
        const regime = regimeOf(row);
        const blob = row.slabsJson as Rebate87aBlob | null;
        if (
          regime &&
          blob &&
          typeof blob.threshold === "number" &&
          typeof blob.maxRebate === "number"
        ) {
          const rebate = { threshold: blob.threshold, maxRebate: blob.maxRebate };
          if (regime === "OLD") taxConfig.rebate87aOld = rebate;
          else taxConfig.rebate87aNew = rebate;
          hasTax = true;
        }
        break;
      }
      case "surcharge_bands": {
        const blob = row.slabsJson as SurchargeBlob | null;
        if (blob?.bands) {
          taxConfig.surchargeBands = blob.bands;
          hasTax = true;
        }
        break;
      }
      case "cess_rate":
        if (row.value !== null) {
          taxConfig.cessRate = Number(row.value);
          hasTax = true;
        }
        break;
    }
  }

  if (hasPt) overrides.ptSlabs = ptSlabs;
  if (hasLwf) overrides.lwfRates = lwfRates;
  if (hasTax) overrides.taxConfig = taxConfig;

  // ── Professional Tax: the dedicated `professional_tax_slabs` table (the one PT
  // rate mechanism, seeded from docs/reference/professional-tax-slabs.json). Same
  // scope/effective rules as above: org beats platform default, latest effectiveFrom
  // wins. This SUPERSEDES the legacy `pt_slab` metric branch (which has no rows).
  const ptRows = await db
    .select()
    .from(professionalTaxSlabs)
    .where(
      and(
        or(eq(professionalTaxSlabs.orgId, orgId), isNull(professionalTaxSlabs.orgId)),
        lte(professionalTaxSlabs.effectiveFrom, period),
        or(
          isNull(professionalTaxSlabs.effectiveTo),
          gt(professionalTaxSlabs.effectiveTo, period),
        ),
      ),
    );
  const bestPt = new Map<string, (typeof ptRows)[number]>();
  for (const row of ptRows) {
    const key = row.stateCode;
    const prev = bestPt.get(key);
    if (!prev) {
      bestPt.set(key, row);
      continue;
    }
    const rowOrgScoped = row.orgId !== null;
    const prevOrgScoped = prev.orgId !== null;
    if (rowOrgScoped !== prevOrgScoped) {
      if (rowOrgScoped) bestPt.set(key, row);
      continue;
    }
    if (row.effectiveFrom > prev.effectiveFrom) bestPt.set(key, row);
  }

  const ptFromTable: PtSlabTable = {};
  let hasPtTable = false;
  for (const row of bestPt.values()) {
    // The engine keys PT on the NORMALISED state name ("Tamil Nadu" → "TAMIL_NADU").
    // Call payroll-math's own normaliser rather than re-implementing it here: this
    // was a duplicated inline copy, so when the normaliser learned to treat "&" and
    // "and" as equivalent, an inline copy would have silently diverged from the
    // lookup it is supposed to feed.
    const stateKey = normalizePtStateKey(row.stateName);

    // levies=false is a RECORDED FACT: emit an empty-slab config so the engine returns a
    // silent, levied nil — distinguishable from an UNKNOWN state (no row at all → the
    // engine flags `unknownState`). This is the defect this table exists to remove.
    if (!row.levies) {
      ptFromTable[stateKey] = { slabs: [], annualCap: 0 };
      hasPtTable = true;
      continue;
    }

    // Only project cadences the engine can actually compute: MONTHLY, or HALF_YEARLY for
    // the two states whose collection timing is wired in payroll-math
    // (PT_HALF_YEARLY_DEPOSIT_MONTH = Kerala, Tamil Nadu). Quarterly, annual, and any other
    // half-yearly state (e.g. Puducherry) are STORED as data but NOT projected — the engine
    // then flags them as unknown rather than compute a wrong amount. See the report.
    const cadence = row.cadence;
    const computableHalfYearly =
      cadence === "halfYearly" && (stateKey === "KERALA" || stateKey === "TAMIL_NADU");
    if (cadence !== "monthly" && !computableHalfYearly) continue;

    const bands = (row.bands ?? []) as Array<{ min: number; max: number | null; amount: number }>;
    // Bands → engine slabs. `max: null` is an open-ended top band (JSON cannot encode
    // Infinity), normalised to Infinity so the engine's `<= to` match treats it as unbounded.
    const slabs: PTSlab[] = bands.map((b) => ({
      from: b.min,
      to: b.max === null ? Infinity : b.max,
      monthly: b.amount,
    }));
    ptFromTable[stateKey] = {
      slabs,
      // Per-state annual caps are not in the source (only the constitutional ₹2,500
      // per-person cap). This flows only to the annual-PT ESTIMATE in the tax profile,
      // never to the monthly PT deduction (which is band-driven).
      annualCap: 2500,
      ...(computableHalfYearly ? { levyPeriod: "HALF_YEARLY" as const } : {}),
    };
    hasPtTable = true;
  }
  if (hasPtTable) overrides.ptSlabs = ptFromTable;

  // Establishment PF contribution rate (org-level; 10% for small/sick, else 12%). Resolved here
  // so both run paths (totals + payslip write) pick it up via the same overrides object. Only
  // emit the override when the establishment is on a NON-default rate: at 12% the engine's
  // built-in rate already applies, and emitting nothing preserves the resolver's "empty when
  // nothing configured" contract (a bare org resolves to {}). 10% → 0.10 override.
  const [orgRow] = await db
    .select({ pfContributionRate: organizations.pfContributionRate })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const pfRatePct = Number(orgRow?.pfContributionRate ?? 12);
  if (pfRatePct > 0 && pfRatePct !== 12) overrides.pfContributionRate = pfRatePct / 100;

  return overrides;
}
