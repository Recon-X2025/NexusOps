import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  approvalRequests,
  approvalSteps,
  users,
  eq,
  and,
  desc,
  sql,
} from "@nexusops/db";
import { sendNotification } from "../services/notifications";
import { enqueueApprovalDecision } from "../workflows/approvalWorkflow";
import { getWorkflowService } from "../services/workflow";

export const approvalsRouter = router({
  myPending: permissionProcedure("approvals", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db.select().from(approvalRequests)
      .where(and(
        eq(approvalRequests.orgId, org!.id),
        eq(approvalRequests.approverId, ctx.user!.id),
        eq(approvalRequests.status, "pending"),
      ))
      .orderBy(desc(approvalRequests.createdAt));
    // Enrich with requester names
    const requesterIds = [...new Set(rows.map(r => r.requesterId).filter(Boolean))] as string[];
    const requesterMap: Record<string, string> = {};
    if (requesterIds.length > 0) {
      const requesterRows = await db.select({ id: users.id, name: users.name }).from(users)
        .where(sql`${users.id} = ANY(${requesterIds})`);
      for (const u of requesterRows) requesterMap[u.id] = u.name;
    }
    return rows.map(r => ({
      ...r,
      state: r.status,
      requestedBy: r.requesterId ? (requesterMap[r.requesterId] ?? r.requesterId) : "Unknown",
      requestedOn: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
      dueBy: r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "",
    }));
  }),

  mySubmitted: permissionProcedure("approvals", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db.select().from(approvalRequests)
      .where(and(
        eq(approvalRequests.orgId, org!.id),
        eq(approvalRequests.requesterId, ctx.user!.id),
      ))
      .orderBy(desc(approvalRequests.createdAt));
    return rows.map(r => ({
      ...r,
      state: r.status,
      requestedBy: "Me",
      requestedOn: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
      dueBy: r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "",
    }));
  }),

  decide: permissionProcedure("approvals", "approve")
    .input(z.object({
      requestId: z.string({ required_error: "requestId is required for approval decision" }).uuid({ message: "requestId must be a valid UUID" }),
      decision: z.enum(["approved", "rejected"]),
      comment: z.string().optional(),
      idempotencyKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;

      console.log("[ACTION]", {
        action: "approvals.decide",
        userId: ctx.user!.id,
        orgId: org!.id,
        requestId: input.requestId,
        decision: input.decision,
      });

      const [request] = await db.select().from(approvalRequests)
        .where(and(
          eq(approvalRequests.id, input.requestId),
          eq(approvalRequests.orgId, org!.id),
          eq(approvalRequests.approverId, ctx.user!.id),
        ));

      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Approval request not found" });

      // Idempotency: if already decided with the same key, return the existing result
      if (request.status !== "pending") {
        if (input.idempotencyKey && request.idempotencyKey === input.idempotencyKey) {
          console.log("[IDEMPOTENT]", { action: "approvals.decide", idempotencyKey: input.idempotencyKey, requestId: request.id });
          return request;
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request has already been decided" });
      }

      const [updated] = await db.update(approvalRequests)
        .set({
          status: input.decision,
          comment: input.comment,
          decidedAt: new Date(),
          idempotencyKey: input.idempotencyKey ?? null,
          version: sql`${approvalRequests.version} + 1`,
        })
        .where(and(
          eq(approvalRequests.id, input.requestId),
          eq(approvalRequests.version, request.version),
        ))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Record was modified by another user. Please refresh and try again.",
        });
      }

      // Update corresponding approval step if it exists
      const [step] = await db.select().from(approvalSteps)
        .where(and(
          eq(approvalSteps.requestId, input.requestId),
          eq(approvalSteps.approverId, ctx.user!.id),
          eq(approvalSteps.status, "pending"),
        ));

      if (step) {
        await db.update(approvalSteps)
          .set({
            status: input.decision,
            comments: input.comment,
            decidedAt: new Date(),
          })
          .where(eq(approvalSteps.id, step.id));
      }

      try {
        await sendNotification({
          orgId: org!.id,
          userId: ctx.user!.id,
          title: `Approval ${input.decision}`,
          body: `Request for ${request.entityType} has been ${input.decision}`,
          sourceType: request.entityType,
          sourceId: request.entityId,
        });
      } catch { /* non-fatal */ }

      // Enqueue durable post-decision workflow (notify requester, audit log)
      try {
        const { approvalQueue } = getWorkflowService();
        await enqueueApprovalDecision(approvalQueue, {
          requestId: input.requestId,
          orgId: org!.id,
          actorId: ctx.user!.id,
          requesterId: request.requesterId ?? request.approverId,
          decision: input.decision,
          comment: input.comment,
          resourceType: request.entityType ?? "Approval",
          resourceId: request.entityId ?? input.requestId,
          resourceTitle: request.entityType ?? "Request",
        });
      } catch (err) {
        // Workflow failure is non-fatal — decision is already persisted
        console.warn("[approvals.decide] Failed to enqueue workflow job:", err);
      }

      return updated;
    }),

  list: permissionProcedure("approvals", "read")
    .input(z.object({
      status: z.string().optional(),
      entityType: z.string().optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(approvalRequests.orgId, org!.id)];
      if (input.status) conditions.push(eq(approvalRequests.status, input.status));
      if (input.entityType) conditions.push(eq(approvalRequests.entityType, input.entityType));

      const rows = await db.select().from(approvalRequests)
        .where(and(...conditions))
        .orderBy(desc(approvalRequests.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;

      // Enrich with requester names
      const requesterIds = [...new Set(items.map(r => r.requesterId).filter(Boolean))] as string[];
      const requesterMap: Record<string, string> = {};
      if (requesterIds.length > 0) {
        const requesterRows = await db.select({ id: users.id, name: users.name }).from(users)
          .where(sql`${users.id} = ANY(${requesterIds})`);
        for (const u of requesterRows) requesterMap[u.id] = u.name;
      }

      return {
        items: items.map(r => ({
          ...r,
          state: r.status,
          requestedBy: r.requesterId ? (requesterMap[r.requesterId] ?? r.requesterId) : "Unknown",
          requestedOn: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
          dueBy: r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "",
        })),
        nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
      };
    }),
});
