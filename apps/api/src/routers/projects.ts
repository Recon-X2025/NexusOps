import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  projects,
  applications,
  strategicInitiatives,
  projectDependencies,
  projectMilestones,
  projectTasks,
  eq,
  and,
  asc,
  desc,
  count,
  inArray,
  sql,
  isNotNull,
  auditLogs,
} from "@nexusops/db";
import { getNextNumber } from "../lib/auto-number";
import { getRedis } from "../lib/redis";
import { rateLimit } from "../lib/rate-limit";
import { sendNotification } from "../services/notifications";

const STRATEGY_SUMMARY_CACHE_SEC = 60;

const NON_TERMINAL_PROJECT_STATUSES = ["proposed", "planning", "active", "on_hold"] as const;

/** US-STR-007: `from` depends on `to` — cycle if `to` can reach `from` along dependency edges. */
function wouldCreateDependencyCycle(
  edges: { fromProjectId: string; toProjectId: string }[],
  newFrom: string,
  newTo: string,
): boolean {
  if (newFrom === newTo) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.fromProjectId) ?? [];
    arr.push(e.toProjectId);
    adj.set(e.fromProjectId, arr);
  }
  const head = adj.get(newFrom) ?? [];
  if (!head.includes(newTo)) {
    adj.set(newFrom, [...head, newTo]);
  }
  const stack = [newTo];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === newFrom) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of adj.get(n) ?? []) stack.push(d);
  }
  return false;
}

async function getStrategyDashboardSummaryCached<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const key = `strategy:dashboardSummary:v3:${orgId}`;
  try {
    const redis = getRedis();
    const cached = await redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        await redis.del(key).catch(() => {});
      }
    }
    const result = await fn();
    await redis.setex(key, STRATEGY_SUMMARY_CACHE_SEC, JSON.stringify(result)).catch(() => {});
    return result;
  } catch {
    return fn();
  }
}

export const projectsRouter = router({
  list: permissionProcedure("projects", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(projects.orgId, org!.id)];
      if (input.status) conditions.push(eq(projects.status, input.status as any));
      return db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.createdAt)).limit(input.limit);
    }),

  get: permissionProcedure("projects", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const [project] = await db.select().from(projects).where(and(eq(projects.id, input.id), eq(projects.orgId, org!.id)));
    if (!project) throw new TRPCError({ code: "NOT_FOUND" });

    const milestones = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, project.id)).orderBy(asc(projectMilestones.dueDate));
    const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, project.id)).orderBy(asc(projectTasks.createdAt));

    return { ...project, milestones, tasks };
  }),

  create: permissionProcedure("projects", "write")
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      budgetTotal: z.string().optional(),
      department: z.string().optional(),
      status: z.enum(["proposed", "planning", "active", "on_hold", "completed", "cancelled"]).optional(),
      initiativeId: z.string().uuid().optional(),
      benefitType: z.string().optional(),
      benefitTarget: z.string().optional(),
      benefitActual: z.string().optional(),
      linkedApplicationIds: z.array(z.string().uuid()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const number = await getNextNumber(db, org!.id, "PRJ");
      const { linkedApplicationIds, status, ...rest } = input;
      const [project] = await db.insert(projects).values({
        orgId: org!.id,
        number,
        ...rest,
        ownerId: user!.id,
        status: status ?? "planning",
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        linkedApplicationIds: linkedApplicationIds ?? [],
      }).returning();
      return project;
    }),

  update: permissionProcedure("projects", "write")
    .input(z.object({
      id: z.string().uuid(),
      status: z.string().optional(),
      health: z.string().optional(),
      phase: z.string().optional(),
      budgetSpent: z.string().optional(),
      initiativeId: z.string().uuid().nullable().optional(),
      benefitType: z.string().nullable().optional(),
      benefitTarget: z.string().nullable().optional(),
      benefitActual: z.string().nullable().optional(),
      linkedApplicationIds: z.array(z.string().uuid()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [project] = await db.update(projects).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(projects.id, id), eq(projects.orgId, org!.id))).returning();
      return project;
    }),

  listStrategicInitiatives: permissionProcedure("projects", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(strategicInitiatives)
      .where(eq(strategicInitiatives.orgId, org!.id))
      .orderBy(desc(strategicInitiatives.createdAt));
  }),

  createStrategicInitiative: permissionProcedure("projects", "write")
    .input(z.object({ name: z.string().min(1), theme: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .insert(strategicInitiatives)
        .values({ orgId: org!.id, name: input.name, theme: input.theme })
        .returning();
      return row;
    }),

  addProjectDependency: permissionProcedure("projects", "write")
    .input(
      z.object({
        fromProjectId: z.string().uuid(),
        toProjectId: z.string().uuid(),
        dependencyType: z.string().max(64).optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [fromP] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.fromProjectId), eq(projects.orgId, org!.id)));
      const [toP] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.toProjectId), eq(projects.orgId, org!.id)));
      if (!fromP || !toP) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const existing = await db
        .select({ fromProjectId: projectDependencies.fromProjectId, toProjectId: projectDependencies.toProjectId })
        .from(projectDependencies)
        .where(eq(projectDependencies.orgId, org!.id));
      if (wouldCreateDependencyCycle(existing, input.fromProjectId, input.toProjectId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This dependency would create a cycle in the portfolio graph",
        });
      }
      const [row] = await db
        .insert(projectDependencies)
        .values({
          orgId: org!.id,
          fromProjectId: input.fromProjectId,
          toProjectId: input.toProjectId,
          dependencyType: input.dependencyType ?? "finish_to_start",
          notes: input.notes,
        })
        .returning();
      return row;
    }),

  listPortfolioDependencies: permissionProcedure("projects", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(projectDependencies)
      .where(eq(projectDependencies.orgId, org!.id))
      .orderBy(desc(projectDependencies.createdAt));
  }),

  approveIntakeProject: permissionProcedure("projects", "write")
    .input(z.object({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.orgId, org!.id)));
      if (!proj) throw new TRPCError({ code: "NOT_FOUND" });
      if (proj.status !== "proposed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only proposed projects can pass intake approval" });
      }
      const [updated] = await db
        .update(projects)
        .set({ status: "planning", updatedAt: new Date() })
        .where(and(eq(projects.id, input.projectId), eq(projects.orgId, org!.id)))
        .returning();
      await db.insert(auditLogs).values({
        orgId: org!.id,
        userId: user!.id,
        action: "project_intake_approved",
        resourceType: "project",
        resourceId: input.projectId,
        changes: {
          fromStatus: "proposed",
          toStatus: "planning",
          number: proj.number,
          name: proj.name,
        },
      });
      if (proj.ownerId && proj.ownerId !== user!.id) {
        sendNotification({
          orgId: org!.id,
          userId: proj.ownerId,
          title: `Project intake approved: ${proj.number}`,
          body: proj.name,
          link: `/app/projects`,
          type: "success",
          sourceType: "project",
          sourceId: input.projectId,
        }).catch(() => {});
      }
      return updated;
    }),

  // ── Milestones ─────────────────────────────────────────────────────────────
  createMilestone: permissionProcedure("projects", "write")
    .input(z.object({ projectId: z.string().uuid(), title: z.string(), dueDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [ms] = await ctx.db.insert(projectMilestones).values({
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      }).returning();
      return ms;
    }),

  updateMilestone: permissionProcedure("projects", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, status } = input;
      const updates: Record<string, any> = {};
      if (status) { updates.status = status; if (status === "completed") updates.completedAt = new Date(); }
      const [ms] = await ctx.db.update(projectMilestones).set(updates).where(eq(projectMilestones.id, id)).returning();
      return ms;
    }),

  // ── Tasks ──────────────────────────────────────────────────────────────────
  createTask: permissionProcedure("projects", "write")
    .input(z.object({
      projectId: z.string().uuid(),
      milestoneId: z.string().uuid().optional(),
      title: z.string(),
      description: z.string().optional(),
      assigneeId: z.string().uuid().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      storyPoints: z.coerce.number().optional(),
      sprint: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await ctx.db.insert(projectTasks).values(input as any).returning();
      return task;
    }),

  updateTask: permissionProcedure("projects", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), assigneeId: z.string().uuid().optional(), sprint: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updates: Record<string, any> = { ...data, updatedAt: new Date() };
      if (data.status === "done") updates.completedAt = new Date();
      const [task] = await ctx.db.update(projectTasks).set(updates).where(eq(projectTasks.id, id)).returning();
      return task;
    }),

  getAgileBoard: permissionProcedure("projects", "read")
    .input(z.object({ projectId: z.string().uuid(), sprint: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const conditions = [eq(projectTasks.projectId, input.projectId)];
      if (input.sprint) conditions.push(eq(projectTasks.sprint, input.sprint));
      const tasks = await db.select().from(projectTasks).where(and(...conditions)).orderBy(asc(projectTasks.createdAt));
      const board: Record<string, typeof tasks> = { backlog: [], todo: [], in_progress: [], in_review: [], done: [] };
      for (const task of tasks) { board[task.status]?.push(task); }
      return board;
    }),

  portfolioHealth: permissionProcedure("projects", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db.select({ health: projects.health, cnt: count() })
      .from(projects).where(and(eq(projects.orgId, org!.id), eq(projects.status, "active")))
      .groupBy(projects.health);
    return Object.fromEntries(
      rows.map((r: { health: string | null; cnt: unknown }) => [r.health, Number(r.cnt)]),
    );
  }),

  /**
   * Single hub-oriented snapshot: active project health buckets + APM counts (US-STR-002).
   * Rate-limited; short Redis cache per org.
   */
  strategyDashboardSummary: permissionProcedure("projects", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    await rateLimit(ctx.user?.id, org?.id, "projects.strategyDashboardSummary");

    return getStrategyDashboardSummaryCached(org!.id, async () => {
      const healthRows = await db
        .select({ health: projects.health, cnt: count() })
        .from(projects)
        .where(and(eq(projects.orgId, org!.id), eq(projects.status, "active")))
        .groupBy(projects.health);

      const portfolioHealth: Record<string, number> = {};
      let activeProjectCount = 0;
      let atRiskByHealth = 0;
      for (const r of healthRows) {
        const k = r.health ?? "unknown";
        const n = Number(r.cnt ?? 0);
        portfolioHealth[k] = n;
        activeProjectCount += n;
        if (k === "amber" || k === "red") atRiskByHealth += n;
      }

      const [appsTotal] = await db
        .select({ cnt: count() })
        .from(applications)
        .where(eq(applications.orgId, org!.id));
      const [appsRetiring] = await db
        .select({ cnt: count() })
        .from(applications)
        .where(
          and(
            eq(applications.orgId, org!.id),
            inArray(applications.lifecycle, ["retiring", "obsolete"]),
          ),
        );

      const [initiativeAligned] = await db
        .select({ cnt: count() })
        .from(projects)
        .where(
          and(
            eq(projects.orgId, org!.id),
            inArray(projects.status, [...NON_TERMINAL_PROJECT_STATUSES]),
            isNotNull(projects.initiativeId),
          ),
        );

      const [initiativeDen] = await db
        .select({ cnt: count() })
        .from(projects)
        .where(and(eq(projects.orgId, org!.id), inArray(projects.status, [...NON_TERMINAL_PROJECT_STATUSES])));

      const [benefitsTracked] = await db
        .select({ cnt: count() })
        .from(projects)
        .where(
          and(eq(projects.orgId, org!.id), isNotNull(projects.benefitTarget)),
        );

      const [benefitsWithActual] = await db
        .select({ cnt: count() })
        .from(projects)
        .where(
          and(eq(projects.orgId, org!.id), isNotNull(projects.benefitActual)),
        );

      const [apmLinkedInFlight] = await db
        .select({ cnt: count() })
        .from(projects)
        .where(
          and(
            eq(projects.orgId, org!.id),
            inArray(projects.status, [...NON_TERMINAL_PROJECT_STATUSES]),
            sql`jsonb_array_length(coalesce(${projects.linkedApplicationIds}, '[]'::jsonb)) > 0`,
          ),
        );

      const portfolioEdges = await db
        .select({
          fromProjectId: projectDependencies.fromProjectId,
          toProjectId: projectDependencies.toProjectId,
        })
        .from(projectDependencies)
        .where(eq(projectDependencies.orgId, org!.id));

      const statusRows = await db
        .select({ id: projects.id, status: projects.status })
        .from(projects)
        .where(eq(projects.orgId, org!.id));
      const statusById = new Map(statusRows.map((r) => [r.id, r.status]));

      let dependencyRiskEdges = 0;
      for (const e of portfolioEdges) {
        const succ = statusById.get(e.fromProjectId);
        const pred = statusById.get(e.toProjectId);
        if (!succ || !pred) continue;
        const succBusy = NON_TERMINAL_PROJECT_STATUSES.includes(succ as (typeof NON_TERMINAL_PROJECT_STATUSES)[number]);
        const predOpen = pred !== "completed" && pred !== "cancelled";
        if (succBusy && predOpen) dependencyRiskEdges += 1;
      }

      const inFlight = Number(initiativeDen?.cnt ?? 0);

      return {
        portfolioHealth,
        activeProjectCount,
        atRiskByHealth,
        applications: {
          total: Number(appsTotal?.cnt ?? 0),
          retiring: Number(appsRetiring?.cnt ?? 0),
        },
        initiativeCoverage: {
          aligned: Number(initiativeAligned?.cnt ?? 0),
          inFlight,
        },
        benefits: {
          tracked: Number(benefitsTracked?.cnt ?? 0),
          withActual: Number(benefitsWithActual?.cnt ?? 0),
        },
        portfolioDependencies: {
          edgeCount: portfolioEdges.length,
          riskSignalCount: dependencyRiskEdges,
        },
        apmProjectLinks: {
          inFlightWithLinkedApps: Number(apmLinkedInFlight?.cnt ?? 0),
          inFlightTotal: inFlight,
        },
      };
    });
  }),
});
