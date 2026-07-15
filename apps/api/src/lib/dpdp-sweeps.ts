/**
 * DPDP automation sweeps (Phase 1 — automation loop).
 *
 * These are pure, org-scoped functions that *act* on the DPDP clocks the engine
 * already tracks. They are the reusable core; a Temporal scheduled workflow (in
 * apps/worker) simply calls them on a recurring cadence, per org. Keeping the
 * logic here (rather than inside a Temporal activity) means it is testable with
 * the normal API test harness (real Postgres) without a running Temporal server.
 *
 * None of these functions perform external delivery — they route every outbound
 * notice through the NotificationDispatcher, which today only logs an artifact.
 *
 * All three are idempotent per run window:
 *  - consentExpirySweep mutates state that no longer matches after it runs.
 *  - dsrOverdueSweep / breachNotifySweep skip an item if an artifact for the same
 *    (relatedType, relatedId, channel) already exists inside the dedupe window.
 */
import {
  and,
  eq,
  gte,
  sql,
  dpdpDataSubjectRequests,
  dpdpConsentRecords,
  dpdpConsentEvents,
  dpdpBreachIncidents,
  dpdpNotificationArtifacts,
  type DbOrTx,
} from "@coheronconnect/db";
import {
  getNotificationDispatcher,
  type NotificationChannel,
  type NotificationRelatedType,
} from "./notification-dispatcher";

/** Default window used to avoid re-notifying the same item every sweep tick. */
const DEFAULT_DEDUPE_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * True if a notification artifact already exists for this (org, relatedType,
 * relatedId, channel) within `windowMs`. Used to make the alerting sweeps
 * idempotent so a frequently-running schedule does not spam duplicate notices.
 */
async function recentlyNotified(
  db: DbOrTx,
  orgId: string,
  relatedType: NotificationRelatedType,
  relatedId: string,
  channel: NotificationChannel,
  windowMs: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ id: dpdpNotificationArtifacts.id })
    .from(dpdpNotificationArtifacts)
    .where(
      and(
        eq(dpdpNotificationArtifacts.orgId, orgId),
        eq(dpdpNotificationArtifacts.relatedType, relatedType),
        eq(dpdpNotificationArtifacts.relatedId, relatedId),
        eq(dpdpNotificationArtifacts.channel, channel),
        gte(dpdpNotificationArtifacts.dispatchedAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export interface SweepResult {
  /** How many items were eligible (overdue / due / lapsed). */
  eligible: number;
  /** How many notices were actually dispatched (after dedupe). */
  dispatched: number;
}

/**
 * DSR overdue sweep — for every open DSR whose statutory clock has elapsed,
 * dispatch an internal alert to the handling team. Mirrors the exact
 * open/overdue logic in compliance.dsr.slaSummary.
 */
export async function dsrOverdueSweep(
  db: DbOrTx,
  orgId: string,
  opts: { now?: number; dedupeMs?: number } = {},
): Promise<SweepResult> {
  const now = opts.now ?? Date.now();
  const dedupeMs = opts.dedupeMs ?? DEFAULT_DEDUPE_MS;
  const dispatcher = getNotificationDispatcher();

  const rows = await db
    .select({
      id: dpdpDataSubjectRequests.id,
      reference: dpdpDataSubjectRequests.reference,
      status: dpdpDataSubjectRequests.status,
      dueAt: dpdpDataSubjectRequests.dueAt,
      closedAt: dpdpDataSubjectRequests.closedAt,
    })
    .from(dpdpDataSubjectRequests)
    .where(eq(dpdpDataSubjectRequests.orgId, orgId));

  let eligible = 0;
  let dispatched = 0;
  for (const r of rows) {
    if (r.closedAt || r.status === "closed") continue; // not open
    const due = new Date(r.dueAt).getTime();
    if (due >= now) continue; // not overdue
    eligible++;
    if (await recentlyNotified(db, orgId, "dsr", r.id, "internal", dedupeMs)) continue;
    await dispatcher.dispatch(db, {
      orgId,
      channel: "internal",
      audience: "privacy_officer",
      subject: `DSR ${r.reference} is overdue`,
      body: `Data Subject Request ${r.reference} has passed its statutory response deadline (${new Date(
        r.dueAt,
      ).toISOString()}) and is still open. Please action it.`,
      relatedType: "dsr",
      relatedId: r.id,
    });
    dispatched++;
  }
  return { eligible, dispatched };
}

/**
 * Breach notification sweep — for every breach whose notification clock has
 * elapsed and whose principals have NOT yet been notified, dispatch board +
 * principal notices. Does not auto-advance breach state (that stays a human
 * action via breach.transition); it surfaces and records the obligation.
 */
export async function breachNotifySweep(
  db: DbOrTx,
  orgId: string,
  opts: { now?: number; dedupeMs?: number } = {},
): Promise<SweepResult> {
  const now = opts.now ?? Date.now();
  const dedupeMs = opts.dedupeMs ?? DEFAULT_DEDUPE_MS;
  const dispatcher = getNotificationDispatcher();

  const rows = await db
    .select({
      id: dpdpBreachIncidents.id,
      reference: dpdpBreachIncidents.reference,
      title: dpdpBreachIncidents.title,
      status: dpdpBreachIncidents.status,
      notifyDueAt: dpdpBreachIncidents.notifyDueAt,
      principalsNotifiedAt: dpdpBreachIncidents.principalsNotifiedAt,
      closedAt: dpdpBreachIncidents.closedAt,
    })
    .from(dpdpBreachIncidents)
    .where(eq(dpdpBreachIncidents.orgId, orgId));

  let eligible = 0;
  let dispatched = 0;
  for (const r of rows) {
    if (r.closedAt || r.status === "closed") continue;
    if (r.principalsNotifiedAt) continue; // notification obligation already met
    const due = new Date(r.notifyDueAt).getTime();
    if (due >= now) continue; // clock not yet elapsed
    eligible++;

    // Board notice
    if (!(await recentlyNotified(db, orgId, "breach", r.id, "board", dedupeMs))) {
      await dispatcher.dispatch(db, {
        orgId,
        channel: "board",
        audience: "data_protection_board",
        subject: `Breach ${r.reference} notification is due`,
        body: `Personal-data breach ${r.reference} ("${r.title}") has reached its notification deadline (${new Date(
          r.notifyDueAt,
        ).toISOString()}). The Data Protection Board notification is due.`,
        relatedType: "breach",
        relatedId: r.id,
      });
      dispatched++;
    }
    // Principal notice
    if (!(await recentlyNotified(db, orgId, "breach", r.id, "principal", dedupeMs))) {
      await dispatcher.dispatch(db, {
        orgId,
        channel: "principal",
        audience: "affected_principals",
        subject: `Breach ${r.reference} — affected principals must be notified`,
        body: `Affected Data Principals for breach ${r.reference} ("${r.title}") have not yet been notified and the deadline has passed.`,
        relatedType: "breach",
        relatedId: r.id,
      });
      dispatched++;
    }
  }
  return { eligible, dispatched };
}

/**
 * Consent expiry sweep — expire every "granted" consent whose expiresAt has
 * passed, recording a "expired" event. This is the scheduled equivalent of the
 * compliance.consent.expireLapsed mutation, using identical logic. Idempotent by
 * construction: once expired, a record no longer matches the filter.
 */
export async function consentExpirySweep(
  db: DbOrTx,
  orgId: string,
): Promise<{ expired: number }> {
  const lapsed = await db
    .select({ id: dpdpConsentRecords.id })
    .from(dpdpConsentRecords)
    .where(
      and(
        eq(dpdpConsentRecords.orgId, orgId),
        eq(dpdpConsentRecords.status, "granted"),
        sql`${dpdpConsentRecords.expiresAt} IS NOT NULL`,
        sql`${dpdpConsentRecords.expiresAt} < now()`,
      ),
    );
  for (const row of lapsed) {
    await db
      .update(dpdpConsentRecords)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(dpdpConsentRecords.id, row.id));
    await db.insert(dpdpConsentEvents).values({
      orgId,
      consentId: row.id,
      eventType: "expired",
      fromStatus: "granted",
      toStatus: "expired",
      channel: "system",
      actorUserId: null,
    });
  }
  return { expired: lapsed.length };
}

/**
 * Run all three sweeps for one org. This is what the scheduled worker activity
 * calls per org on each tick.
 */
export async function runDpdpSweepsForOrg(
  db: DbOrTx,
  orgId: string,
  opts: { now?: number; dedupeMs?: number } = {},
): Promise<{
  dsr: SweepResult;
  breach: SweepResult;
  consent: { expired: number };
}> {
  const dsr = await dsrOverdueSweep(db, orgId, opts);
  const breach = await breachNotifySweep(db, orgId, opts);
  const consent = await consentExpirySweep(db, orgId);
  return { dsr, breach, consent };
}
