/**
 * Software Asset Management (SAM) reconciliation (G11).
 * ─────────────────────────────────────────────────────
 * A license row carries three numbers that must be reconciled:
 *   • entitled  — `software_licenses.total_seats` (what we paid for)
 *   • installed — `software_licenses.installed_count` (what's actually deployed
 *                 in the estate, ingested from an M365 / endpoint inventory)
 *   • assigned  — active `license_assignments` (seats we've handed out)
 *
 * The true-up delta the finance/audit team cares about is installed − entitled:
 *   • installed > entitled → OVER-DEPLOYED — under-licensed, direct audit risk.
 *   • installed < entitled → UNDER-UTILIZED — paying for unused seats.
 *   • installed == entitled → AT-PARITY.
 * `assigned` is surfaced too so admins can see how much of the entitlement is
 * even handed out.
 *
 * The pure `reconcileLicense` computes the posture from three numbers; the DB
 * helpers ingest installed counts and persist the reconciliation timestamp.
 */
import {
  softwareLicenses,
  licenseAssignments,
  eq,
  and,
  count,
  isNull,
  type DbOrTx,
} from "@coheronconnect/db";

export type ReconStatus = "over_deployed" | "under_utilized" | "at_parity" | "unknown";

export interface LicenseReconciliation {
  licenseId: string;
  name: string;
  entitled: number | null;
  installed: number | null;
  assigned: number;
  /** installed − entitled (positive = over-deployed). Null when either is null. */
  delta: number | null;
  status: ReconStatus;
  /** True when installed exceeds entitlement — the seat to buy / audit exposure. */
  shortfall: number;
}

/**
 * Pure reconciliation of one license's three seat numbers into a posture.
 * `entitled`/`installed` may be null (not yet ingested) → status `unknown`.
 */
export function reconcileLicense(args: {
  licenseId: string;
  name: string;
  entitled: number | null;
  installed: number | null;
  assigned: number;
}): LicenseReconciliation {
  const { licenseId, name, entitled, installed, assigned } = args;

  let status: ReconStatus = "unknown";
  let delta: number | null = null;
  let shortfall = 0;

  if (entitled !== null && installed !== null) {
    delta = installed - entitled;
    if (delta > 0) {
      status = "over_deployed";
      shortfall = delta;
    } else if (delta < 0) {
      status = "under_utilized";
    } else {
      status = "at_parity";
    }
  }

  return { licenseId, name, entitled, installed, assigned, delta, status, shortfall };
}

/** Count active (un-revoked) seat assignments for a license. */
async function countActiveAssignments(db: DbOrTx, licenseId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(licenseAssignments)
    .where(
      and(eq(licenseAssignments.licenseId, licenseId), isNull(licenseAssignments.revokedAt)),
    );
  return row?.n ?? 0;
}

/**
 * Ingest a discovered installed count for a single license and stamp
 * `reconciledAt`. Tenant-scoped. Returns the fresh reconciliation, or null when
 * the license doesn't belong to the org.
 */
export async function ingestInstalledCount(
  db: DbOrTx,
  orgId: string,
  licenseId: string,
  installedCount: number,
): Promise<LicenseReconciliation | null> {
  const [lic] = await db
    .update(softwareLicenses)
    .set({ installedCount, reconciledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(softwareLicenses.id, licenseId), eq(softwareLicenses.orgId, orgId)))
    .returning();
  if (!lic) return null;

  const assigned = await countActiveAssignments(db, licenseId);
  return reconcileLicense({
    licenseId: lic.id,
    name: lic.name,
    entitled: lic.totalSeats !== null ? Number(lic.totalSeats) : null,
    installed: lic.installedCount,
    assigned,
  });
}

/**
 * Reconcile every license in the org against its current installed/entitled
 * numbers (does not mutate installed — just recomputes posture). Sorted worst
 * first (over-deployed by shortfall desc) so the audit-risk rows surface.
 */
export async function reconcileOrgLicenses(
  db: DbOrTx,
  orgId: string,
): Promise<LicenseReconciliation[]> {
  const licenses = await db
    .select()
    .from(softwareLicenses)
    .where(eq(softwareLicenses.orgId, orgId));

  const out: LicenseReconciliation[] = [];
  for (const lic of licenses) {
    const assigned = await countActiveAssignments(db, lic.id);
    out.push(
      reconcileLicense({
        licenseId: lic.id,
        name: lic.name,
        entitled: lic.totalSeats !== null ? Number(lic.totalSeats) : null,
        installed: lic.installedCount,
        assigned,
      }),
    );
  }

  // Over-deployed (audit risk) first, biggest shortfall on top.
  const rank: Record<ReconStatus, number> = {
    over_deployed: 0,
    under_utilized: 1,
    at_parity: 2,
    unknown: 3,
  };
  out.sort((a, b) => rank[a.status] - rank[b.status] || b.shortfall - a.shortfall);
  return out;
}
