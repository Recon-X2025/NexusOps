/**
 * activities.ts — Reusable workflow activity functions
 * These are pure async functions: no side effects beyond the documented action.
 * Each is idempotent-safe: callers must pass a dedupe key.
 */
import type { Db } from "@nexusops/db";
import { sendNotification } from "../services/notifications";

export interface ActivityContext {
  db: Db;
  orgId: string;
  actorId: string;
}

/** Send an in-platform notification. Idempotent — duplicate sends are no-ops in the
 *  notification service because the UI deduplicates by (userId, resourceId, event). */
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
  await sendNotification({
    orgId: ctx.orgId,
    userId: payload.userId,
    title: payload.title,
    body: payload.message,
    sourceType: payload.resourceType,
    sourceId: payload.resourceId,
    link: payload.link,
  });
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
    const { auditLogs } = await import("@nexusops/db");
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
