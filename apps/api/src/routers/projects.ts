import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { projects, projectMilestones, projectTasks, eq, and, asc, desc, count, sql } from "@nexusops/db";
import { getNextNumber } from "../lib/auto-number";

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
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const number = await getNextNumber(db, org!.id, "PRJ");
      const [project] = await db.insert(projects).values({
        orgId: org!.id, number, ...input, ownerId: user!.id,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      }).returning();
      return project;
    }),

  update: permissionProcedure("projects", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), health: z.string().optional(), phase: z.string().optional(), budgetSpent: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [project] = await db.update(projects).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(projects.id, id), eq(projects.orgId, org!.id))).returning();
      return project;
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
});
