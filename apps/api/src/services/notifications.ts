/**
 * Notification service — sends in-app notifications (always) and email (when SMTP configured).
 * Future: Slack webhook support.
 */
import { getDb, notifications } from "@nexusops/db";
import nodemailer from "nodemailer";

export interface NotificationPayload {
  orgId: string;
  userId: string;
  title: string;
  body: string;
  link?: string;
  type?: "info" | "warning" | "success" | "error";
  sourceType?: string;
  sourceId?: string;
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
  const from = process.env["SMTP_FROM"] ?? "NexusOps <noreply@nexusops.coheron.com>";
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
        <span style="color:#fff;font-size:18px;font-weight:700;">N</span>
      </div>
      <span style="font-size:18px;font-weight:700;color:#1e293b;">NexusOps</span>
    </div>
    <h2 style="font-size:18px;font-weight:600;color:#1e293b;margin:0 0 8px;">${title}</h2>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">${body}</p>
    ${link ? `<a href="${link}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;">View in NexusOps →</a>` : ""}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">You received this because you're a NexusOps team member. <a href="#" style="color:#6366f1;">Manage preferences</a></p>
  </div>
</body>
</html>`;
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
}
