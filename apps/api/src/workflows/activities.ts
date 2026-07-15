/**
 * activities.ts — Reusable workflow activity functions
 * These are pure async functions: no side effects beyond the documented action.
 * Each is idempotent-safe: callers must pass a dedupe key.
 */
import { users, eq, and, type Db } from "@coheronconnect/db";
import { sendNotification } from "../services/notifications";

export interface ActivityContext {
  db: Db;
  orgId: string;
  actorId: string;
}

/** Send an in-platform notification, and email the target user when SMTP is
 *  configured. These are per-user, event-driven notices (approval outcome, SLA
 *  breach, on-call escalation) — the target should be reachable out-of-band, not
 *  only when watching the in-app inbox. Email is best-effort: `sendNotification`
 *  always writes the in-app row (the source of truth) and degrades to a log line
 *  when no SMTP host is set, so this never blocks the workflow.
 *
 *  Idempotent — duplicate sends are no-ops in the notification service because
 *  the UI deduplicates by (userId, resourceId, event). */
export async function notifyActivity(
  ctx: ActivityContext,
  payload: {
    userId: string;
    title: string;
    message: string;
    resourceType: string;
    resourceId: string;
    link?: string;
  },
): Promise<void> {
  const [target] = await ctx.db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.id, payload.userId), eq(users.orgId, ctx.orgId)))
    .limit(1);

  await sendNotification(
    {
      orgId: ctx.orgId,
      userId: payload.userId,
      title: payload.title,
      body: payload.message,
      sourceType: payload.resourceType,
      sourceId: payload.resourceId,
      link: payload.link,
    },
    target?.email ?? undefined,
  );
}

/** Write an audit log entry for a workflow-driven status change. */
export async function writeWorkflowAuditLog(
  ctx: ActivityContext,
  payload: {
    resource: string;
    resourceId: string;
    action: string;
    changes: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { auditLogs } = await import("@coheronconnect/db");
    await ctx.db.insert(auditLogs).values({
      orgId: ctx.orgId,
      userId: ctx.actorId === "system" ? undefined : ctx.actorId,
      resourceType: payload.resource,
      resourceId: payload.resourceId,
      action: payload.action,
      changes: payload.changes,
    });
  } catch {
    // Audit log failure must never block the workflow
    console.error("[workflow:audit] Failed to write audit log", payload);
  }
}
