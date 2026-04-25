import { TRPCError } from "@trpc/server";
import { parseOrgSettings } from "./org-settings";

type StepUpCtx = {
  user?: Record<string, unknown> | null;
  org?: Record<string, unknown> | null;
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
 */
export function assertStepUpIfRequired(ctx: StepUpCtx): void {
  const org = ctx.org as Record<string, unknown> | null;
  if (!org || !ctx.user) return;

  const roles = parseOrgSettings(org.settings).security?.requireStepUpForMatrixRoles;
  if (!roles?.length) return;

  const mine = effectiveMatrixRole(ctx);
  if (!roles.includes(mine)) return;

  const untilRaw = (ctx.user as { stepUpVerifiedUntil?: Date | string | null }).stepUpVerifiedUntil;
  if (!untilRaw) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "STEP_UP_REQUIRED",
    });
  }
  const until = untilRaw instanceof Date ? untilRaw : new Date(String(untilRaw));
  if (Number.isNaN(until.getTime()) || until.getTime() < Date.now()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "STEP_UP_REQUIRED",
    });
  }
}
