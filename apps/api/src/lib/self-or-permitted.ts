/**
 * "Your own record, OR someone with the right permission" — ONE implementation.
 *
 * `hr.ts` already had `assertSelfOrHrWriter`, built in Round 4 when `requester`
 * was narrowed off `hr:write`: the genuinely self-service procedures (request
 * leave, clock in, submit an expense) must work for a plain employee acting on
 * their own record, while anyone holding `hr:write` may act on anybody's.
 *
 * That helper hardcoded `hr:write`. The gates the product owner set for payroll
 * and settlement need different role sets — "self, or payroll", "self, or HR, or
 * finance" — so the ONLY change here is to make the permitted set a parameter.
 * A second ownership helper is exactly the divergent-duplicate defect this
 * codebase keeps rediscovering (two lead dialogs, two ECR builders, two deal-card
 * paths), so `assertSelfOrHrWriter` is re-expressed in terms of this and there is
 * still one code path.
 *
 * ASYMMETRY IS DELIBERATE AND MUST BE PRESERVED BY THE CALLER. Some procedures
 * let you SEE your own figures but not ACT on them — `settlement.get`/`preview`
 * are self-or-role, while `settlement.settle` is role-only, because settling is
 * the act of paying someone out and the person being paid must not reach it.
 * That is expressed by NOT calling this helper on `settle`, not by a flag here.
 */
import { TRPCError } from "@trpc/server";
import { employees, eq, and } from "@coheronconnect/db";
import { checkDbUserPermission } from "./rbac-db";
import type { Context } from "./trpc";
import type { Module, RbacAction } from "@coheronconnect/types";

export type SelfServiceCtx = {
  db: Context["db"];
  org: Context["org"];
  user: Context["user"];
};

/** One (module, action) pair that grants access to ANY employee's record. */
export type PermittedGrant = readonly [module: Module, action: RbacAction];

/**
 * Throws unless the caller either holds one of `permitted`, or is the employee
 * identified by `employeeId`.
 *
 * @param permitted OR-ed — holding ANY one of them is enough. Order is irrelevant.
 */
export async function assertSelfOrPermitted(
  ctx: SelfServiceCtx,
  employeeId: string,
  permitted: readonly PermittedGrant[],
): Promise<void> {
  const user = ctx.user;
  if (!user || !ctx.org) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  // TENANCY FIRST, BEFORE PRIVILEGE. Holding `hr:write` authorises the ACTION;
  // it says nothing about whose employee this is. Until 2026-08-23 a privileged
  // caller returned early below without this check, so an HR/payroll/finance
  // user could pass another tenant's employeeId and the row that followed was
  // written stamped with the CALLER's org_id — a cross-tenant foreign key that
  // RLS cannot reject, because the row's own org_id is legitimately theirs.
  // NOT_FOUND, never FORBIDDEN: the two must be indistinguishable or the error
  // becomes a cross-tenant existence oracle.
  const [target] = await ctx.db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.orgId, ctx.org.id)))
    .limit(1);
  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
  }

  const role = String(user.role ?? "");
  const matrixRole = (user.matrixRole as string | null | undefined) ?? null;
  for (const [module, action] of permitted) {
    if (checkDbUserPermission(role, module, action, matrixRole, user.customPermissions)) {
      return;
    }
  }

  // Not privileged — the record must be theirs. Resolved from `employees.userId`,
  // never from a client-supplied id, so a caller cannot claim someone else's row.
  const [own] = await ctx.db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.userId, user.id), eq(employees.orgId, ctx.org.id)))
    .limit(1);

  if (!own || own.id !== employeeId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You may only do this for your own employee record.",
    });
  }
}
