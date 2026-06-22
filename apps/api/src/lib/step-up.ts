import { TRPCError } from "@trpc/server";
import { parseOrgSettings } from "./org-settings";
import { isSessionStepUpValid } from "./step-up-session";

type StepUpCtx = {
  user?: Record<string, unknown> | null;
  org?: Record<string, unknown> | null;
  sessionId?: string | null;
};

function effectiveMatrixRole(ctx: StepUpCtx): string {
  const u = ctx.user as Record<string, unknown> | null;
  if (!u) return "";
  const m = u.matrixRole;
  if (typeof m === "string" && m.length > 0) return m;
  const r = u.role;
  return typeof r === "string" ? r : "";
}

/**
 * When org enables `settings.security.requireStepUpForMatrixRoles`, privileged routes
 * must run after `auth.verifyStepUp` (password re-check) within the TTL window.
 * State is stored in Redis (session token hash) so login `SELECT users` is not blocked
 * when optional DB migrations have not been applied.
 */
export async function assertStepUpIfRequired(ctx: StepUpCtx): Promise<void> {
  const org = ctx.org as Record<string, unknown> | null;
  if (!org || !ctx.user) return;

  const roles = parseOrgSettings(org.settings).security?.requireStepUpForMatrixRoles;
  if (!roles?.length) return;

  const mine = effectiveMatrixRole(ctx);
  if (!roles.includes(mine)) return;

  const sid = ctx.sessionId;
  if (!sid) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "STEP_UP_REQUIRES_INTERACTIVE_SESSION",
    });
  }
  if (!(await isSessionStepUpValid(sid))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "STEP_UP_REQUIRED",
    });
  }
}
