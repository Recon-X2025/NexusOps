/**
 * Month-end depreciation sweep.
 * ─────────────────────────────
 * Runs on the EXISTING BullMQ periodic queue (`coheronconnect-hr-periodic`,
 * `hrPeriodicWorkflow.ts`) — the same mechanism the leave-accrual, gratuity and
 * offboarding-revocation sweeps use. No second scheduler.
 *
 * ## Cadence: monthly job, ANNUAL charge
 *
 * The engine's period is a YEAR, not a month: `usefulLifeYears`, periods
 * `1..life`, and SLM charges `(cost − salvage) / life` per period. A monthly
 * *charge* would therefore depreciate a five-year asset to nil in five months.
 * So the job runs monthly but charges each asset at most once per FINANCIAL
 * YEAR, and only for years that have fully ended.
 *
 * Monthly rather than annual because the charge is annual and therefore lumpy:
 * an asset enrolled today with a 2024 purchase date owes FY2024-25 and
 * FY2025-26. A once-a-year job would take two years to settle that; a monthly
 * one settles it at the next sweep. Running monthly is safe precisely because
 * the charge is keyed on the financial year — the eleven sweeps that have
 * nothing to do post nothing.
 *
 * ## Opt-in
 *
 * Nothing happens for a tenant unless `OrgSettings.financial
 * .depreciationAutoRunEnabled === true`. Absent means off.
 *
 * ## Visibility
 *
 * Every sweep writes an audit row per org that did something, and logs a line
 * per org either way. A background job that posts to the general ledger without
 * saying what it posted is not acceptable in an accounting module.
 */
import {
  organizations,
  auditLogs,
  eq,
  type Db,
} from "@coheronconnect/db";
import { parseOrgSettings } from "./org-settings";
import { runDepreciationForOrg, fyStartYear, fyKey } from "../routers/depreciation";

export interface DepreciationSweepOrgResult {
  orgId: string;
  enabled: boolean;
  throughFinancialYear: string;
  charged: number;
  assetsTouched: number;
  totalDepreciation: number;
  failures: Array<{ assetId: string; error: string }>;
  error?: string;
}

/**
 * Charge every opted-in org for each financial year that has fully ELAPSED.
 *
 * `throughFyStart` is the previous financial year: a year still in progress has
 * not earned its depreciation yet, and charging it early would overstate the
 * expense in interim accounts. Mirrors how `processMonthlySweep` accrues the
 * *prior* month.
 */
export async function runDepreciationSweep(
  db: Db,
  now: Date = new Date(),
): Promise<DepreciationSweepOrgResult[]> {
  const throughFyStart = fyStartYear(now) - 1;
  const results: DepreciationSweepOrgResult[] = [];

  const orgs = await db
    .select({ id: organizations.id, settings: organizations.settings })
    .from(organizations);

  for (const org of orgs) {
    const enabled =
      parseOrgSettings(org.settings).financial?.depreciationAutoRunEnabled === true;

    if (!enabled) {
      results.push({
        orgId: org.id,
        enabled: false,
        throughFinancialYear: fyKey(throughFyStart),
        charged: 0,
        assetsTouched: 0,
        totalDepreciation: 0,
        failures: [],
      });
      continue;
    }

    try {
      const res = await runDepreciationForOrg(db, {
        orgId: org.id,
        // No human pressed anything: the ledger rows and journal entries are
        // attributed to the system, not to whoever last logged in.
        userId: null,
        throughFyStart,
      });

      results.push({ orgId: org.id, enabled: true, ...res });

      if (res.charged > 0 || res.failures.length > 0) {
        // The run is only trustworthy if it is legible afterwards.
        await db.insert(auditLogs).values({
          orgId: org.id,
          action: "depreciation.sweep",
          resourceType: "asset_depreciation",
          resourceId: org.id,
          changes: {
            throughFinancialYear: res.throughFinancialYear,
            periodsCharged: res.charged,
            assetsTouched: res.assetsTouched,
            totalDepreciation: res.totalDepreciation,
            failures: res.failures,
            ranAt: now.toISOString(),
          },
        });
        console.info(
          `[depreciation-sweep] org=${org.id} fy=${res.throughFinancialYear} ` +
            `periods=${res.charged} assets=${res.assetsTouched} ` +
            `total=${res.totalDepreciation} failures=${res.failures.length}`,
        );
      } else {
        console.info(
          `[depreciation-sweep] org=${org.id} fy=${res.throughFinancialYear} nothing due`,
        );
      }
    } catch (err) {
      // One org's failure must not stop the rest of the tenants' month-end.
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        orgId: org.id,
        enabled: true,
        throughFinancialYear: fyKey(throughFyStart),
        charged: 0,
        assetsTouched: 0,
        totalDepreciation: 0,
        failures: [],
        error: message,
      });
      console.error(`[depreciation-sweep] org=${org.id} FAILED:`, message);
    }
  }

  return results;
}
