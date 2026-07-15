/**
 * DPDP sweep activity (Phase 1 — scheduler harness, B1).
 *
 * The worker stays intentionally thin: it owns only the *cadence*, not the
 * sweep logic. The actual DSR-overdue / breach-notify / consent-expiry work
 * lives in apps/api (apps/api/src/lib/dpdp-sweeps.ts) where it is exercised by
 * the API test harness against a real Postgres. This activity simply POSTs to
 * the token-protected internal endpoint that runs those sweeps for every org.
 *
 * Failures are surfaced (thrown) so Temporal's retry policy applies; the sweeps
 * themselves are idempotent per run window, so a retry is always safe.
 */

export interface DpdpSweepActivityResult {
  ok: boolean;
  orgs: number;
  totals: {
    dsrDispatched: number;
    breachDispatched: number;
    consentExpired: number;
  };
}

/**
 * Call the internal sweep endpoint. `orgId` may be provided to restrict the
 * sweep to a single org; omit it to sweep every org.
 */
export async function runDpdpSweeps(input?: { orgId?: string }): Promise<DpdpSweepActivityResult> {
  const baseUrl = process.env["INTERNAL_API_URL"] ?? "http://localhost:3001";
  const token = process.env["INTERNAL_API_TOKEN"];

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-internal-token"] = token;

  const res = await fetch(`${baseUrl}/internal/dpdp/sweep`, {
    method: "POST",
    headers,
    body: JSON.stringify(input?.orgId ? { orgId: input.orgId } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DPDP sweep endpoint returned ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as DpdpSweepActivityResult;
}

export interface DpdpSweepActivities {
  runDpdpSweeps: typeof runDpdpSweeps;
}

/** Factory mirroring createActivities() so index.ts can compose activity sets. */
export function createDpdpSweepActivities(): DpdpSweepActivities {
  return { runDpdpSweeps };
}
