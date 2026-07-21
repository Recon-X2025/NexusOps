/**
 * Notification service — sends in-app notifications (always), email (when SMTP
 * configured), and fans out to external channels (Slack, SMS) via a durable
 * BullMQ worker when the org has the integration connected.
 */
import { getDb, notifications } from "@coheronconnect/db";
import nodemailer from "nodemailer";
import { getWorkflowService } from "./workflow";
import {
  enqueueNotificationDispatch,
  type NotificationDispatchChannel,
  type SmsDispatchPayload,
} from "../workflows/notificationDispatchWorkflow";

export interface NotificationPayload {
  orgId: string;
  userId: string;
  title: string;
  body: string;
  link?: string;
  type?: "info" | "warning" | "success" | "error";
  sourceType?: string;
  sourceId?: string;
  /**
   * DLT-compliant SMS payload. When present, "sms" is added to the external
   * fan-out and the message is delivered via MSG91 (best-effort, no-op when the
   * org has not connected the sms_msg91 integration).
   */
  sms?: SmsDispatchPayload;
}

let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? "587"),
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    secure: false,
  });
  return _transporter;
}

async function sendEmail(to: string, subject: string, html: string) {
  const transporter = getTransporter();
  const from = process.env["SMTP_FROM"] ?? "CoheronConnect <noreply@coheronconnect.coheron.com>";
  if (!transporter) {
    console.info(`[EMAIL] Would send to ${to}: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error("[EMAIL] Failed to send:", err);
  }
}

function buildEmailHtml(title: string, body: string, link?: string) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#6366f1;border-radius:8px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-size:18px;font-weight:700;">C</span>
      </div>
      <span style="font-size:18px;font-weight:700;color:#1e293b;">CoheronConnect</span>
    </div>
    <h2 style="font-size:18px;font-weight:600;color:#1e293b;margin:0 0 8px;">${title}</h2>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">${body}</p>
    ${link ? `<a href="${link}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;">View in CoheronConnect →</a>` : ""}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">You received this because you're a CoheronConnect team member. <a href="#" style="color:#6366f1;">Manage preferences</a></p>
  </div>
</body>
</html>`;
}

/**
 * Send a standalone transactional email (no in-app notification record).
 *
 * Used for recipients that have no `userId` yet or no in-app context — e.g.
 * password-reset links (sent to an email at the login screen) and org invites
 * (recipient has no account). Degrades gracefully: when SMTP is not configured
 * the message is logged rather than sent, and delivery failures are swallowed
 * so auth flows never leak account existence or break on mail-server issues.
 */
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  body: string,
  link?: string,
): Promise<void> {
  await sendEmail(to, subject, buildEmailHtml(subject, body, link));
}

/**
 * Send an in-app notification and optionally an email.
 * Never throws — errors are logged and swallowed.
 */
export async function sendNotification(
  payload: NotificationPayload,
  emailTo?: string,
): Promise<void> {
  const db = getDb();
  try {
    await db.insert(notifications).values({
      orgId: payload.orgId,
      userId: payload.userId,
      title: payload.title,
      body: payload.body,
      link: payload.link,
      type: payload.type ?? "info",
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      isRead: false,
    });
  } catch (err) {
    console.error("[NOTIFY] DB insert failed:", err);
  }

  if (emailTo) {
    const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
    const link = payload.link ? `${appUrl}${payload.link}` : undefined;
    await sendEmail(
      emailTo,
      payload.title,
      buildEmailHtml(payload.title, payload.body, link),
    );
  }

  // Fan out to external channels (Slack) via the durable dispatch worker. This
  // is best-effort: if the workflow service isn't booted (scripts/tests) or
  // Redis is unavailable, we log and move on — the in-app record above is the
  // source of truth and is never blocked by external-channel delivery.
  try {
    const queue = getWorkflowService().notificationDispatchQueue;
    const channels: NotificationDispatchChannel[] = ["slack"];
    if (payload.sms) channels.push("sms");
    const dispatch: Parameters<typeof enqueueNotificationDispatch>[1] = {
      orgId: payload.orgId,
      channels,
      title: payload.title,
      body: payload.body,
    };
    if (payload.link) dispatch.link = payload.link;
    if (payload.type) dispatch.type = payload.type;
    if (payload.sms) dispatch.sms = payload.sms;
    await enqueueNotificationDispatch(queue, dispatch);
  } catch (err) {
    console.error("[NOTIFY] External fan-out enqueue skipped:", (err as Error).message);
  }
}
