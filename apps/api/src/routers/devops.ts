import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { pipelineRuns, deployments, tickets, pipelineStatusEnum, deploymentEnvEnum, deploymentStatusEnum, eq, and, desc, count, avg, sql, isNotNull } from "@coheronconnect/db";
import { createIncidentFromSystem } from "../services/itom-correlation";

export const devopsRouter = router({
  // ── Pipeline Runs ──────────────────────────────────────────────────────────
  listPipelines: permissionProcedure("projects", "read")
    .input(z.object({ status: z.enum(pipelineStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(pipelineRuns.orgId, org!.id)];
      if (input.status) conditions.push(eq(pipelineRuns.status, input.status));
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
      const { db, org } = ctx;
      const [run] = await db.update(pipelineRuns)
        .set({ status: input.status, durationSeconds: input.durationSeconds, completedAt: new Date() })
        .where(and(eq(pipelineRuns.id, input.id), eq(pipelineRuns.orgId, org!.id))).returning();
      return run;
    }),

  // ── Deployments ────────────────────────────────────────────────────────────
  listDeployments: permissionProcedure("projects", "read")
    .input(z.object({ environment: z.enum(deploymentEnvEnum.enumValues).optional(), status: z.enum(deploymentStatusEnum.enumValues).optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(deployments.orgId, org!.id)];
      if (input.environment) conditions.push(eq(deployments.environment, input.environment));
      if (input.status) conditions.push(eq(deployments.status, input.status));
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
      const { db, org } = ctx;
      const [dep] = await db.update(deployments)
        .set({ status: input.status, durationSeconds: input.durationSeconds, completedAt: new Date() })
        .where(and(eq(deployments.id, input.id), eq(deployments.orgId, org!.id))).returning();

      // Deploy→incident linkage for MTTR (Sprint 3.4b). On a failed deployment,
      // auto-create a linked incident. Guarded: runs AFTER the status update has
      // returned and never rolls it back (mirrors the invoice post-commit hook).
      if (dep && input.status === "failed") {
        try {
          await createIncidentFromSystem(db, {
            orgId: org!.id,
            title: `Deployment failed: ${dep.appName} ${dep.version} (${dep.environment})`,
            description:
              `Auto-created by the deploy pipeline.\n` +
              `App: ${dep.appName}\nVersion: ${dep.version}\nEnvironment: ${dep.environment}`,
            isMajorIncident: dep.environment === "production",
            deploymentId: dep.id,
            intakeChannel: "devops",
            source: "devops",
          });
        } catch (err) {
          console.error("[devops] auto-incident on deploy failure failed", dep.id, (err as Error).message);
        }
      }

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

    // MTTR (Sprint 3.4b): mean time to restore for production deployments in the
    // last 30d that FAILED and have a linked incident that has been resolved.
    // avg(resolved_at − deployment.completed_at) in minutes; null when none.
    const [mttrRow] = await db
      .select({
        avgMinutes: sql<number | null>`avg(extract(epoch from (${tickets.resolvedAt} - ${deployments.completedAt})) / 60)`,
      })
      .from(deployments)
      .innerJoin(tickets, eq(tickets.deploymentId, deployments.id))
      .where(
        and(
          eq(deployments.orgId, org!.id),
          eq(deployments.environment, "production"),
          eq(deployments.status, "failed"),
          isNotNull(deployments.completedAt),
          isNotNull(tickets.resolvedAt),
          sql`${deployments.startedAt} >= ${thirtyDaysAgo.toISOString()}`,
        ),
      );

    const totalDeploys = Number(deplCount?.cnt ?? 0);
    const failedDeploys = Number(failCount?.cnt ?? 0);
    const changeFailureRate = totalDeploys > 0 ? ((failedDeploys / totalDeploys) * 100).toFixed(1) : null;
    const avgSec = Number(avgDuration?.avg ?? 0);
    const leadTimeMinutes = totalDeploys > 0 && avgSec > 0 ? Math.round(avgSec / 60) : null;
    const mttrRaw = mttrRow?.avgMinutes;
    const mttrMinutes = mttrRaw != null && Number(mttrRaw) > 0 ? Math.round(Number(mttrRaw)) : null;

    return {
      deploymentFrequency: totalDeploys > 0 ? (totalDeploys / 30).toFixed(2) : "0",
      leadTimeMinutes,
      changeFailureRate: changeFailureRate != null ? `${changeFailureRate}%` : null,
      mttrMinutes,
      totalDeploys30d: totalDeploys,
    };
  }),
});
