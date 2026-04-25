import { TRPCError } from "@trpc/server";
import { organizations, users, auditLogs, eq } from "@nexusops/db";
import { parseOrgSettings } from "./org-settings";
import { sanitizeForAudit } from "./audit-sanitize";

type MfaCtx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  orgId: string | null;
  user: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  procedurePath?: string | null;
};

function effectiveMatrixRole(user: Record<string, unknown> | null): string {
  if (!user) return "";
  const m = user.matrixRole;
  if (typeof m === "string" && m.length > 0) return m;
  const r = user.role;
  return typeof r === "string" ? r : "";
}

/**
 * When org sets `settings.security.requireMfaForMatrixRoles`, users with a matching
 * matrix role must have `users.mfa_enrolled` before sensitive finance mutations.
 *
 * Reads current `organizations.settings` from the DB (not `ctx.org`) so policy edits apply
 * immediately without waiting for session/org cache refresh.
 */
export async function assertMfaIfRequired(ctx: MfaCtx): Promise<void> {
  if (!ctx.user || !ctx.orgId) return;

  const [row] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);

  const roles = parseOrgSettings(row?.settings).security?.requireMfaForMatrixRoles;
  if (!roles?.length) return;

  const mine = effectiveMatrixRole(ctx.user);
  if (!roles.includes(mine)) return;

  const uid = typeof ctx.user.id === "string" ? ctx.user.id : null;
  if (!uid) return;

  const [u] = await ctx.db
    .select({ mfaEnrolled: users.mfaEnrolled })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);

  if (u?.mfaEnrolled === true) return;

  if (ctx.orgId && uid) {
    ctx.db
      .insert(auditLogs)
      .values({
        orgId: ctx.orgId,
        userId: uid,
        action: "mfa_policy_denied",
        resourceType: "security",
        resourceId: mine || "unknown_matrix_role",
        changes: sanitizeForAudit({
          reason: "MFA_ENROLLMENT_REQUIRED",
          procedure: ctx.procedurePath ?? null,
        }),
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
      })
      .catch(() => {});
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "MFA_ENROLLMENT_REQUIRED",
  });
}
