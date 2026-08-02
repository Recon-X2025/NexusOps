/**
 * NotificationDispatcher (DPDP automation loop).
 *
 * The automation sweeps (DSR overdue, breach notification, consent expiry) do
 * not send email/SMS directly. Instead they call a NotificationDispatcher, which
 * is the single seam for outbound delivery.
 *
 * HONESTY CONTRACT (A3). Under India's DPDP Act, notifying the Data Protection
 * Board or affected principals is the TENANT's legal act — never the platform's.
 * So this dispatcher:
 *   • delivers a notice ONLY to the tenant's own configured DPDP contact
 *     (`organizations.dpdp_contact_email`) — never to a platform inbox, never to
 *     a regulator address;
 *   • REFUSES cleanly when that contact is unset — it records NOTHING and delivers
 *     NOTHING, rather than silently falling back to a default;
 *   • records only whether delivery to that tenant contact left the building
 *     (`logged`/`failed`). There is deliberately NO `sent` state: the software
 *     cannot know a statutory duty was discharged, so it never claims one was.
 */
import {
  dpdpNotificationArtifacts,
  organizations,
  eq,
  type DbOrTx,
} from "@coheronconnect/db";

export type NotificationChannel = "email" | "board" | "principal" | "internal";
export type NotificationRelatedType = "dsr" | "breach" | "consent";

export interface NotificationInput {
  orgId: string;
  channel: NotificationChannel;
  /** Role name, email address, or principal reference the notice is aimed at. */
  audience: string;
  subject: string;
  body: string;
  relatedType: NotificationRelatedType;
  relatedId: string;
}

export interface NotificationResult {
  /** Null when the dispatcher refused (no tenant DPDP contact configured). */
  artifactId: string | null;
  /**
   * Delivery state of the artifact. There is NO `sent` state by design — see the
   * honesty contract above.
   *  - "logged":   artifact recorded (LogOnly), or mail to the tenant contact left
   *                the building. Carries no statutory-fulfilment meaning.
   *  - "failed":   delivery to the tenant contact was attempted and errored.
   *  - "refused":  no tenant DPDP contact configured; nothing recorded, nothing sent.
   */
  status: "logged" | "failed" | "refused";
}

export interface NotificationDispatcher {
  dispatch(db: DbOrTx, input: NotificationInput): Promise<NotificationResult>;
}

import { sendTransactionalEmail } from "../services/notifications";

/**
 * Resolve the tenant's own DPDP notice destination. Returns null when the org has
 * no `dpdp_contact_email` configured — the caller MUST then refuse (record and
 * deliver nothing), never fall back to a default. This is the single point that
 * decides where a DPDP notice may go; there is deliberately no platform fallback.
 */
async function resolveTenantContact(db: DbOrTx, orgId: string): Promise<string | null> {
  const [org] = await db
    .select({ contact: organizations.dpdpContactEmail })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const contact = org?.contact?.trim();
  return contact && contact.includes("@") ? contact : null;
}

/**
 * LogOnlyDispatcher — records the notification as an audit artifact and does not
 * deliver it externally. The artifact row is the auditable proof that the
 * obligation was recognised on schedule. It still honours the tenant-contact
 * contract: if the org has no DPDP contact configured, it refuses and records
 * nothing (a logged artifact would misleadingly imply a destination existed).
 */
export class LogOnlyDispatcher implements NotificationDispatcher {
  async dispatch(db: DbOrTx, input: NotificationInput): Promise<NotificationResult> {
    const contact = await resolveTenantContact(db, input.orgId);
    if (!contact) return { artifactId: null, status: "refused" };

    const [row] = await db
      .insert(dpdpNotificationArtifacts)
      .values({
        orgId: input.orgId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        channel: input.channel,
        audience: contact,
        subject: input.subject,
        body: input.body,
        status: "logged",
      })
      .returning({ id: dpdpNotificationArtifacts.id });

    return { artifactId: row!.id, status: "logged" };
  }
}

/**
 * EmailDispatcher — records the notification as an audit artifact and delivers it
 * to the TENANT's own DPDP contact. It never resolves a platform or regulator
 * address, and it never claims a statutory duty was discharged: a successful send
 * leaves the artifact `logged` (mail to the tenant contact left the building);
 * a failure marks it `failed`. When no tenant contact is configured it refuses —
 * recording and delivering nothing.
 */
export class EmailDispatcher implements NotificationDispatcher {
  async dispatch(db: DbOrTx, input: NotificationInput): Promise<NotificationResult> {
    const contact = await resolveTenantContact(db, input.orgId);
    if (!contact) return { artifactId: null, status: "refused" };

    const [row] = await db
      .insert(dpdpNotificationArtifacts)
      .values({
        orgId: input.orgId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        channel: input.channel,
        audience: contact,
        subject: input.subject,
        body: input.body,
        status: "logged",
      })
      .returning({ id: dpdpNotificationArtifacts.id });

    const artifactId = row!.id;

    try {
      await sendTransactionalEmail(contact, input.subject, input.body);
      // Stays "logged": delivery to the tenant contact left the building. We do
      // NOT stamp "sent" — that would imply a statutory duty was discharged, which
      // the software cannot know.
      return { artifactId, status: "logged" };
    } catch {
      await db
        .update(dpdpNotificationArtifacts)
        .set({ status: "failed" })
        .where(eq(dpdpNotificationArtifacts.id, artifactId));
      return { artifactId, status: "failed" };
    }
  }
}

/**
 * The process-wide dispatcher. Swap this binding in the external pass to route
 * through a real delivery adapter. Kept as a module-level singleton so callers
 * (sweeps, router) share one instance.
 */
let activeDispatcher: NotificationDispatcher = new EmailDispatcher();

export function getNotificationDispatcher(): NotificationDispatcher {
  return activeDispatcher;
}

/** Test/seam hook — replace the active dispatcher (e.g. with a real adapter later). */
export function setNotificationDispatcher(dispatcher: NotificationDispatcher): void {
  activeDispatcher = dispatcher;
}
