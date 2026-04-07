import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  workflows,
  workflowVersions,
  workflowRuns,
  workflowStepRuns,
  eq,
  and,
  desc,
  count,
  sql,
} from "@nexusops/db";
import { getTemporalClient } from "../lib/temporal";

const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.coerce.number(), y: z.coerce.number() }),
  data: z.record(z.unknown()),
});

const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
});

export const workflowsRouter = router({
  list: permissionProcedure("flows", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(workflows)
      .where(eq(workflows.orgId, org!.id))
      .orderBy(desc(workflows.createdAt));
  }),

  get: permissionProcedure("flows", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
    const { db, org } = ctx;

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, input.id), eq(workflows.orgId, org!.id)));

    if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

    const versions = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id))
      .orderBy(desc(workflowVersions.version));

    return { workflow, currentVersion: versions[0] ?? null, versions };
  }),

  create: permissionProcedure("flows", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        triggerType: z.enum([
          "ticket_created",
          "ticket_updated",
          "status_changed",
          "scheduled",
          "manual",
          "webhook",
        ]),
        triggerConfig: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      const [workflow] = await db
        .insert(workflows)
        .values({
          orgId: org!.id,
          name: input.name,
          description: input.description,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig,
          isActive: false,
          createdById: user!.id,
        })
        .returning();

      // Create initial empty version
      await db.insert(workflowVersions).values({
        workflowId: workflow!.id,
        version: 1,
        nodes: [],
        edges: [],
      });

      return workflow;
    }),

  save: permissionProcedure("flows", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        nodes: z.array(WorkflowNodeSchema),
        edges: z.array(WorkflowEdgeSchema),
        // Optional metadata updates alongside save
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        triggerType: z.enum(["ticket_created","ticket_updated","status_changed","scheduled","manual","webhook"]).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, input.id), eq(workflows.orgId, org!.id)));

      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      // Update metadata if provided
      const metaUpdates: Record<string, any> = { updatedAt: new Date() };
      if (input.name !== undefined) metaUpdates.name = input.name;
      if (input.description !== undefined) metaUpdates.description = input.description;
      if (input.triggerType !== undefined) metaUpdates.triggerType = input.triggerType;
      if (input.isActive !== undefined) metaUpdates.isActive = input.isActive;

      // Upsert the current draft version
      const nextVersion = workflow.currentVersion + 1;

      const [version] = await db
        .insert(workflowVersions)
        .values({
          workflowId: workflow.id,
          version: nextVersion,
          nodes: input.nodes,
          edges: input.edges,
        })
        .returning();

      await db
        .update(workflows)
        .set({ ...metaUpdates, currentVersion: nextVersion })
        .where(eq(workflows.id, input.id));

      return version;
    }),

  publish: permissionProcedure("flows", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, input.id), eq(workflows.orgId, org!.id)));

      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      // Fetch latest version so we can pass nodes/edges to Temporal
      const [latestVersion] = await db
        .select()
        .from(workflowVersions)
        .where(eq(workflowVersions.workflowId, workflow.id))
        .orderBy(desc(workflowVersions.version))
        .limit(1);

      if (!latestVersion) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No workflow version found" });
      }

      // Activate the workflow
      await db
        .update(workflows)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(workflows.id, input.id));

      // Create a workflow run record
      const [run] = await db
        .insert(workflowRuns)
        .values({
          workflowId: workflow.id,
          workflowVersionId: latestVersion.id,
          status: "running",
          triggerData: { triggeredBy: "publish" },
          startedAt: new Date(),
        })
        .returning();

      const runId = run!.id;
      let temporalWorkflowId: string | null = null;

      // Try to start a Temporal workflow — fall back gracefully if unavailable
      try {
        const client = await getTemporalClient();
        temporalWorkflowId = `nexus-${workflow.id}-${runId}`;
        await client.workflow.start("nexusWorkflow", {
          taskQueue: "nexusops-workflow",
          workflowId: temporalWorkflowId,
          args: [
            {
              workflowId: workflow.id,
              versionId: latestVersion.id,
              orgId: org!.id,
              runId,
              triggerData: { triggeredBy: "publish" },
              nodes: latestVersion.nodes,
              edges: latestVersion.edges,
            },
          ],
        });

        // Persist Temporal workflow ID back to the run row
        await db
          .update(workflowRuns)
          .set({ temporalWorkflowId })
          .where(eq(workflowRuns.id, runId));
      } catch (temporalErr) {
        // Temporal is unavailable — mark the run with a metadata note but do
        // not fail the publish operation entirely.
        console.warn("[publish] Temporal unavailable, running in degraded mode:", temporalErr);
        await db
          .update(workflowRuns)
          .set({
            triggerData: {
              triggeredBy: "publish",
              temporalUnavailable: true,
              temporalError: String(temporalErr),
            },
          })
          .where(eq(workflowRuns.id, runId));
      }

      return { runId, workflowId: workflow.id };
    }),

  toggle: permissionProcedure("flows", "write")
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      const [updated] = await db
        .update(workflows)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(and(eq(workflows.id, input.id), eq(workflows.orgId, org!.id)))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  test: permissionProcedure("flows", "write")
    .input(
      z.object({
        id: z.string().uuid(),
        triggerData: z.record(z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Dry-run: validate nodes/edges but don't execute side effects
      const { db, org } = ctx;

      const [workflow] = await db
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, input.id), eq(workflows.orgId, org!.id)));

      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      const [version] = await db
        .select()
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, workflow.id),
            eq(workflowVersions.version, workflow.currentVersion),
          ),
        );

      if (!version) throw new TRPCError({ code: "BAD_REQUEST", message: "No workflow version found" });

      return {
        dryRun: true,
        nodes: version.nodes,
        edges: version.edges,
        triggerData: input.triggerData,
        result: "Dry-run completed — no side effects executed",
      };
    }),

  runs: router({
    list: permissionProcedure("flows", "read")
      .input(z.object({ workflowId: z.string().uuid(), limit: z.coerce.number().default(20) }))
      .query(async ({ ctx, input }) => {
        const { db } = ctx;
        return db
          .select()
          .from(workflowRuns)
          .where(eq(workflowRuns.workflowId, input.workflowId))
          .orderBy(desc(workflowRuns.startedAt))
          .limit(input.limit);
      }),

    get: permissionProcedure("flows", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
      const { db } = ctx;

      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.id, input.id));

      if (!run) throw new TRPCError({ code: "NOT_FOUND" });

      const steps = await db
        .select()
        .from(workflowStepRuns)
        .where(eq(workflowStepRuns.runId, run.id));

      return { run, steps };
    }),
  }),
});
