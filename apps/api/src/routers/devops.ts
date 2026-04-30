import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { pipelineRuns, deployments, eq, and, desc, count, avg, sql } from "@coheronconnect/db";

export const devopsRouter = router({
  // ── Pipeline Runs ──────────────────────────────────────────────────────────
  listPipelines: permissionProcedure("projects", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(pipelineRuns.orgId, org!.id)];
      if (input.status) conditions.push(eq(pipelineRuns.status, input.status as any));
      return db.select().from(pipelineRuns).where(and(...conditions)).orderBy(desc(pipelineRuns.startedAt)).limit(input.limit);
    }),

  createPipelineRun: permissionProcedure("projects", "write")
    .input(z.object({
      pipelineName: z.string(),
      trigger: z.string().optional(),
      branch: z.string().optional(),
      commitSha: z.string().optional(),
      status: z.enum(["running", "success", "failed", "cancelled"]).default("running"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [run] = await db.insert(pipelineRuns).values({ orgId: org!.id, ...input }).returning();
      return run;
    }),

  completePipeline: permissionProcedure("projects", "write")
    .input(z.object({ id: z.string().uuid(), status: z.enum(["success", "failed", "cancelled"]), durationSeconds: z.coerce.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [run] = await ctx.db.update(pipelineRuns)
        .set({ status: input.status, durationSeconds: input.durationSeconds, completedAt: new Date() })
        .where(eq(pipelineRuns.id, input.id)).returning();
      return run;
    }),

  // ── Deployments ────────────────────────────────────────────────────────────
  listDeployments: permissionProcedure("projects", "read")
    .input(z.object({ environment: z.string().optional(), status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(deployments.orgId, org!.id)];
      if (input.environment) conditions.push(eq(deployments.environment, input.environment as any));
      if (input.status) conditions.push(eq(deployments.status, input.status as any));
      return db.select().from(deployments).where(and(...conditions)).orderBy(desc(deployments.startedAt)).limit(input.limit);
    }),

  createDeployment: permissionProcedure("projects", "write")
    .input(z.object({
      appName: z.string(),
      environment: z.enum(["dev", "qa", "staging", "uat", "production"]).default("dev"),
      version: z.string(),
      pipelineRunId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [dep] = await db.insert(deployments).values({ orgId: org!.id, ...input, deployedById: user!.id }).returning();
      return dep;
    }),

  completeDeployment: permissionProcedure("projects", "write")
    .input(z.object({ id: z.string().uuid(), status: z.enum(["success", "failed", "rolled_back"]), durationSeconds: z.coerce.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [dep] = await ctx.db.update(deployments)
        .set({ status: input.status, durationSeconds: input.durationSeconds, completedAt: new Date() })
        .where(eq(deployments.id, input.id)).returning();
      return dep;
    }),

  // ── DORA Metrics ───────────────────────────────────────────────────────────
  doraMetrics: permissionProcedure("projects", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const [deplCount] = await db.select({ cnt: count() }).from(deployments)
      .where(and(eq(deployments.orgId, org!.id), eq(deployments.environment, "production"), sql`started_at >= ${thirtyDaysAgo.toISOString()}`));

    const [failCount] = await db.select({ cnt: count() }).from(deployments)
      .where(and(eq(deployments.orgId, org!.id), eq(deployments.environment, "production"), eq(deployments.status, "failed"), sql`started_at >= ${thirtyDaysAgo.toISOString()}`));

    const [avgDuration] = await db.select({ avg: avg(deployments.durationSeconds) }).from(deployments)
      .where(and(eq(deployments.orgId, org!.id), eq(deployments.environment, "production"), eq(deployments.status, "success"), sql`started_at >= ${thirtyDaysAgo.toISOString()}`));

    const totalDeploys = Number(deplCount?.cnt ?? 0);
    const failedDeploys = Number(failCount?.cnt ?? 0);
    const changeFailureRate = totalDeploys > 0 ? ((failedDeploys / totalDeploys) * 100).toFixed(1) : null;
    const avgSec = Number(avgDuration?.avg ?? 0);
    const leadTimeMinutes = totalDeploys > 0 && avgSec > 0 ? Math.round(avgSec / 60) : null;

    return {
      deploymentFrequency: totalDeploys > 0 ? (totalDeploys / 30).toFixed(2) : "0",
      leadTimeMinutes,
      changeFailureRate: changeFailureRate != null ? `${changeFailureRate}%` : null,
      mttrMinutes: null,
      totalDeploys30d: totalDeploys,
    };
  }),
});
