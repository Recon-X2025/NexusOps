import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  employees, leaveRequests, leaveBalances,
  eq, and, desc, count, sql, asc, inArray,
} from "@nexusops/db";
import { collectReportSubtreeEmployeeIds } from "../lib/employee-subtree";

export const workforceRouter = router({

  // ── Headcount ───────────────────────────────────────────────────────────────

  headcount: permissionProcedure("workforce_analytics", "read")
    .input(
      z.object({
        days: z.number().default(180),
        /** US-HCM-005 — managers default to org-wide unless `my_team` (primary reporting chain). */
        scope: z.enum(["org", "my_team"]).default("org"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const since = new Date(Date.now() - input.days * 86400000).toISOString();

      let teamFilter: ReturnType<typeof inArray> | undefined;
      if (input.scope === "my_team") {
        const [me] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.orgId, org!.id), eq(employees.userId, user!.id)))
          .limit(1);
        if (!me) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No employee record for current user — cannot scope analytics to my_team.",
          });
        }
        const subtree = await collectReportSubtreeEmployeeIds(db, org!.id, me.id);
        teamFilter = inArray(
          employees.id,
          subtree.length ? subtree : ["00000000-0000-0000-0000-000000000001"],
        );
      }

      const scopeCond = teamFilter ? and(eq(employees.orgId, org!.id), teamFilter) : eq(employees.orgId, org!.id);

      const [total] = await db
        .select({ n: count() })
        .from(employees)
        .where(and(scopeCond, eq(employees.status, "active")));
      const [newHires] = await db
        .select({ n: count() })
        .from(employees)
        .where(
          and(scopeCond, sql`${employees.startDate} >= ${since}::timestamptz`),
        );
      const [resigned] = await db
        .select({ n: count() })
        .from(employees)
        .where(
          and(
            scopeCond,
            eq(employees.status, "terminated"),
            sql`${employees.updatedAt} >= ${since}::timestamptz`,
          ),
        );
      const [onLeave] = await db
        .select({ n: count() })
        .from(employees)
        .where(and(scopeCond, eq(employees.status, "on_leave")));

      const byDept = await db
        .select({ dept: employees.department, n: count() })
        .from(employees)
        .where(and(scopeCond, eq(employees.status, "active")))
        .groupBy(employees.department)
        .orderBy(desc(count()));

      const byEmploymentType = await db
        .select({ type: employees.employmentType, n: count() })
        .from(employees)
        .where(and(scopeCond, eq(employees.status, "active")))
        .groupBy(employees.employmentType);

      const byLocation = await db
        .select({ location: employees.location, n: count() })
        .from(employees)
        .where(and(scopeCond, eq(employees.status, "active")))
        .groupBy(employees.location)
        .orderBy(desc(count()));

      const attritionRate = total.n > 0 ? Math.round((resigned.n / total.n) * 100 * 10) / 10 : 0;

      return {
        scope: input.scope,
        total: total.n,
        newHires: newHires.n,
        resigned: resigned.n,
        onLeave: onLeave.n,
        attritionRate,
        byDept,
        byEmploymentType,
        byLocation,
      };
    }),

  // ── Tenure Distribution ─────────────────────────────────────────────────────

  tenure: permissionProcedure("workforce_analytics", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      const emps = await db.select({ startDate: employees.startDate, status: employees.status })
        .from(employees).where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")));

      const now = Date.now();
      const bands: Record<string, number> = { "<1yr": 0, "1-2yr": 0, "2-5yr": 0, "5-10yr": 0, ">10yr": 0 };
      for (const e of emps) {
        if (!e.startDate) continue;
        const yrs = (now - new Date(e.startDate).getTime()) / (365.25 * 86400000);
        const key = yrs < 1 ? "<1yr" : yrs < 2 ? "1-2yr" : yrs < 5 ? "2-5yr" : yrs < 10 ? "5-10yr" : ">10yr";
        bands[key] = (bands[key] ?? 0) + 1;
      }
      return Object.entries(bands).map(([label, value]) => ({ label, value }));
    }),

  // ── Leave Utilisation ───────────────────────────────────────────────────────

  leaveAnalytics: permissionProcedure("workforce_analytics", "read")
    .input(z.object({ year: z.number().default(new Date().getFullYear()) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const byType = await db.select({ type: leaveRequests.type, n: count() })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.orgId, org!.id), sql`extract(year from ${leaveRequests.startDate}) = ${input.year}`))
        .groupBy(leaveRequests.type).orderBy(desc(count()));

      const byStatus = await db.select({ status: leaveRequests.status, n: count() })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.orgId, org!.id), sql`extract(year from ${leaveRequests.startDate}) = ${input.year}`))
        .groupBy(leaveRequests.status);

      const monthly = await db.select({
        month: sql<number>`extract(month from ${leaveRequests.startDate})`,
        n: count(),
      })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.orgId, org!.id),
          sql`extract(year from ${leaveRequests.startDate}) = ${input.year}`,
          eq(leaveRequests.status, "approved"),
        ))
        .groupBy(sql`extract(month from ${leaveRequests.startDate})`)
        .orderBy(asc(sql`extract(month from ${leaveRequests.startDate})`));

      // Leave balance aggregates per type (join through employees to filter by org)
      const balances = await db.select({
        type: leaveBalances.type,
        avgTotal: sql<number>`avg(${leaveBalances.totalDays})`,
        avgUsed: sql<number>`avg(${leaveBalances.usedDays})`,
        avgPending: sql<number>`avg(${leaveBalances.pendingDays})`,
      })
        .from(leaveBalances)
        .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
        .where(and(eq(employees.orgId, org!.id), eq(leaveBalances.year, input.year)))
        .groupBy(leaveBalances.type);

      return { byType, byStatus, monthly, balances };
    }),

  // ── Attrition Trends ────────────────────────────────────────────────────────

  attrition: permissionProcedure("workforce_analytics", "read")
    .input(z.object({ months: z.number().default(12) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.months * 30 * 86400000).toISOString();

      const monthly = await db.select({
        month: sql<string>`to_char(${employees.updatedAt}, 'YYYY-MM')`,
        exits: count(),
      })
        .from(employees)
        .where(and(
          eq(employees.orgId, org!.id),
          eq(employees.status, "terminated"),
          sql`${employees.updatedAt} >= ${since}::timestamptz`,
        ))
        .groupBy(sql`to_char(${employees.updatedAt}, 'YYYY-MM')`)
        .orderBy(asc(sql`to_char(${employees.updatedAt}, 'YYYY-MM')`));

      const byDept = await db.select({ dept: employees.department, exits: count() })
        .from(employees)
        .where(and(
          eq(employees.orgId, org!.id),
          eq(employees.status, "terminated"),
          sql`${employees.updatedAt} >= ${since}::timestamptz`,
        ))
        .groupBy(employees.department).orderBy(desc(count()));

      return { monthly, byDept };
    }),

  // ── Department Distribution ──────────────────────────────────────────────────

  gradeDistribution: permissionProcedure("workforce_analytics", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      const byDepartment = await db
        .select({ department: employees.department, n: count() })
        .from(employees)
        .where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")))
        .groupBy(employees.department)
        .orderBy(employees.department);

      const byJobGrade = await db
        .select({
          jobGrade: sql<string>`COALESCE(${employees.jobGrade}, '(unspecified job grade)')`,
          n: count(),
        })
        .from(employees)
        .where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")))
        .groupBy(employees.jobGrade)
        .orderBy(employees.jobGrade);

      const byManager = await db
        .select({ managerId: employees.managerId, n: count() })
        .from(employees)
        .where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")))
        .groupBy(employees.managerId);
      const managersCount = byManager.filter((r: { managerId: string | null }) => r.managerId !== null).length;
      return {
        byDepartment,
        byJobGrade,
        /** @deprecated misleading name — use `byDepartment` / `byJobGrade` (US-HCM-002). */
        byGrade: byDepartment,
        managersCount,
      };
    }),

  // ── Full Summary for Dashboard ───────────────────────────────────────────────

  summary: permissionProcedure("workforce_analytics", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [total]   = await db.select({ n: count() }).from(employees).where(and(eq(employees.orgId, org!.id), eq(employees.status, "active")));
      const [onLeave] = await db.select({ n: count() }).from(employees).where(and(eq(employees.orgId, org!.id), eq(employees.status, "on_leave")));
      const [newHires] = await db.select({ n: count() }).from(employees)
        .where(and(eq(employees.orgId, org!.id), sql`${employees.startDate} >= (NOW() - INTERVAL '30 days')`));
      const [pending] = await db.select({ n: count() }).from(leaveRequests)
        .where(and(eq(leaveRequests.orgId, org!.id), eq(leaveRequests.status, "pending")));

      return { total: total.n, onLeave: onLeave.n, newHiresLast30: newHires.n, pendingLeaves: pending.n };
    }),
});
