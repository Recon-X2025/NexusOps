/**
 * Workbench tRPC router.
 *
 * One read procedure per persona-driven workbench, gated by the `workbench`
 * RBAC module. Each procedure delegates to a payload builder under
 * `services/workbench-payloads/*` which aggregates from existing schemas
 * with per-panel timeouts and graceful `no_data` / `error` states.
 *
 * No business logic lives in this router — it is an aggregator surface only.
 */

import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { canAccessWorkbench, type WorkbenchKey, type SystemRole } from "@coheronconnect/types";
import { systemRolesForDbUser } from "../lib/rbac-db";
import { TRPCError } from "@trpc/server";
import {
  buildServiceDeskPayload,
  buildChangeReleasePayload,
  buildFieldServicePayload,
  buildSecOpsPayload,
  buildGrcPayload,
  buildHrOpsPayload,
  buildRecruiterPayload,
  buildCsmPayload,
  buildFinanceOpsPayload,
  buildProcurementPayload,
  buildCompanySecretaryPayload,
  buildPmoPayload,
} from "../services/workbench-payloads";

function assertWorkbenchAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: Record<string, any> | null,
  key: WorkbenchKey,
) {
  // ctx.user exposes the DB row (role + matrixRole). The RBAC matrix uses
  // SystemRole values, which are derived from those two fields. Ask the
  // shared helper rather than guessing field names — getting this wrong is
  // why the page would 403 even for org owners / admins.
  const dbRole = (user?.role as string | undefined) ?? "";
  const matrixRole = (user?.matrixRole as string | null | undefined) ?? null;
  const roles: SystemRole[] = dbRole ? systemRolesForDbUser(dbRole, matrixRole) : [];
  if (!canAccessWorkbench(roles, key)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `workbench_access_denied:${key}`,
    });
  }
}

export const workbenchRouter = router({
  serviceDesk: permissionProcedure("workbench", "read")
    .input(z.object({ page: z.number().optional().default(1) }).optional())
    .query(async ({ ctx, input }) => {
      assertWorkbenchAccess(ctx.user, "service-desk");
      return buildServiceDeskPayload({ db: ctx.db, orgId: ctx.org!.id as string, page: input?.page ?? 1 });
    }),

  changeRelease: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "change-release");
    return buildChangeReleasePayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  fieldService: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "field-service");
    return buildFieldServicePayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  secops: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "secops");
    return buildSecOpsPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  grc: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "grc");
    return buildGrcPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  hrOps: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "hr-ops");
    return buildHrOpsPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  recruiter: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "recruiter");
    return buildRecruiterPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  csm: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "csm");
    return buildCsmPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  financeOps: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "finance-ops");
    return buildFinanceOpsPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  procurement: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "procurement");
    return buildProcurementPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  companySecretary: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "company-secretary");
    return buildCompanySecretaryPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),

  pmo: permissionProcedure("workbench", "read").query(async ({ ctx }) => {
    assertWorkbenchAccess(ctx.user, "pmo");
    return buildPmoPayload({ db: ctx.db, orgId: ctx.org!.id as string });
  }),
});
