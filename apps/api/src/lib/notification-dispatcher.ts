/**
 * NotificationDispatcher (Phase 1 — DPDP automation loop).
 *
 * The automation sweeps (DSR overdue, breach notification, consent expiry) do
 * not send email/SMS directly. Instead they call a NotificationDispatcher, which
 * is the single seam for outbound delivery. This keeps the *engine* free of any
 * external integration: today the only implementation is `LogOnlyDispatcher`,
 * which persists a defensible audit artifact (`dpdp_notification_artifacts`) and
 * performs NO external send.
 *
 * When the external pass wires real delivery, an EmailDispatcher / SmsDispatcher
 * can implement the same interface (still writing the artifact, then flipping its
 * status to "sent"/"failed") without changing any caller.
 */
import { dpdpNotificationArtifacts, type DbOrTx } from "@coheronconnect/db";

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
  artifactId: string;
  /** Delivery state of the artifact. LogOnly always returns "logged". */
  status: "logged" | "sent" | "failed";
}

export interface NotificationDispatcher {
  dispatch(db: DbOrTx, input: NotificationInput): Promise<NotificationResult>;
}

/**
 * LogOnlyDispatcher — records the notification as an audit artifact and does not
 * deliver it externally. This is the only dispatcher available while external
 * integrations are out of scope; the artifact row is the auditable proof that the
 * obligation was recognised on schedule.
 */
export class LogOnlyDispatcher implements NotificationDispatcher {
  async dispatch(db: DbOrTx, input: NotificationInput): Promise<NotificationResult> {
    const [row] = await db
      .insert(dpdpNotificationArtifacts)
      .values({
        orgId: input.orgId,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
        channel: input.channel,
        audience: input.audience,
        subject: input.subject,
        body: input.body,
        status: "logged",
      })
      .returning({ id: dpdpNotificationArtifacts.id });

    return { artifactId: row!.id, status: "logged" };
  }
}

/**
 * The process-wide dispatcher. Swap this binding in the external pass to route
 * through a real delivery adapter. Kept as a module-level singleton so callers
 * (sweeps, router) share one instance.
 */
let activeDispatcher: NotificationDispatcher = new LogOnlyDispatcher();

export function getNotificationDispatcher(): NotificationDispatcher {
  return activeDispatcher;
}

/** Test/seam hook — replace the active dispatcher (e.g. with a real adapter later). */
export function setNotificationDispatcher(dispatcher: NotificationDispatcher): void {
  activeDispatcher = dispatcher;
}
