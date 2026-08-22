import { router, permissionProcedure, paginationInput } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  approvalRequests,
  approvalSteps,
  approvalChains,
  employees,
  users,
  eq,
  and,
  inArray,
  asc,
  desc,
  sql,
} from "@coheronconnect/db";
import { sendNotification } from "../services/notifications";
import { enqueueApprovalDecision } from "../workflows/approvalWorkflow";
import { getWorkflowService } from "../services/workflow";
import { collectReportSubtreeEmployeeIds } from "../lib/employee-subtree";
import { getNextNumber } from "../lib/auto-number";
import { checkDbUserPermission } from "../lib/rbac-db";
import { raiseApproval } from "../lib/raise-approval";

export const approvalsRouter = router({
  /**
   * Raise an approval request. This is the half of the subsystem that did not
   * exist: `decide`, the queues and the notification worker were all built, but
   * nothing created a row, so `approval_requests` was permanently empty and the
   * sidebar badge could never be non-zero.
   */
  raise: permissionProcedure("approvals", "write")
    .input(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().uuid(),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(2000).optional(),
        type: z.string().optional(),
        priority: z.enum(["urgent", "high", "normal"]).default("normal"),
        amount: z.string().optional(),
        dueDate: z.string().datetime().optional(),
        /** Explicit approver — wins over the chain. */
        approverId: z.string().uuid().optional(),
        /**
         * Key on the DURABLE FACT (e.g. `pr:<id>:submit`), never on a mutable
         * status, so a retry cannot raise a second request for the same event.
         */
        idempotencyKey: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      return raiseApproval(db, {
        orgId: org!.id,
        requesterId: user!.id,
        requesterName: user!.name,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title ?? null,
        description: input.description ?? null,
        type: input.type ?? null,
        priority: input.priority,
        amount: input.amount ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        approverId: input.approverId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      });
    }),

  /**
   * Users in this org who actually hold `approvals:approve`.
   *
   * The chain editor picks from this rather than from every user, because
   * `raise` refuses an approver who cannot approve. Offering the full user list
   * would let someone build a chain that only fails later, at the moment
   * somebody tries to use it. Server-authoritative on purpose — duplicating the
   * RBAC mapping in the browser is how the two drift.
   */
  eligibleApprovers: permissionProcedure("approvals", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        matrixRole: users.matrixRole,
      })
      .from(users)
      .where(and(eq(users.orgId, org!.id), sql`${users.status} != 'disabled'`))
      .orderBy(asc(users.name));

    return rows
      .filter((u: { role: string; matrixRole: string | null }) =>
        checkDbUserPermission(u.role, "approvals", "approve", u.matrixRole ?? undefined),
      )
      .map((u: { id: string; name: string; email: string }) => ({
        id: u.id,
        name: u.name,
        email: u.email,
      }));
  }),

  /** Approval chains — which approvers an entity type routes to. */
  chains: router({
    list: permissionProcedure("approvals", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(approvalChains)
        .where(eq(approvalChains.orgId, org!.id))
        .orderBy(asc(approvalChains.entityType), asc(approvalChains.name));
    }),

    create: permissionProcedure("approvals", "admin")
      .input(
        z.object({
          entityType: z.string().trim().min(1).max(80),
          name: z.string().trim().min(1).max(120),
          rules: z
            .array(
              z.object({
                condition: z.record(z.unknown()).default({}),
                approvers: z.array(z.string().uuid()).min(1),
                threshold: z.number().optional(),
                sequential: z.boolean().default(true),
              }),
            )
            .min(1),
          isActive: z.boolean().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const ids = [...new Set(input.rules.flatMap((r) => r.approvers))];
        const valid = await db
          .select({ id: users.id, email: users.email, role: users.role, matrixRole: users.matrixRole })
          .from(users)
          .where(and(eq(users.orgId, org!.id), inArray(users.id, ids)));
        if (valid.length !== ids.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more approvers are not users in this organisation",
          });
        }
        // Must hold approvals:approve, same as `update`. Without this you could
        // CREATE a chain whose approver cannot approve but not EDIT one into
        // that state — the weaker of two guards is the one that matters.
        const cannot = valid.filter(
          (v: { role: string; matrixRole: string | null }) =>
            !checkDbUserPermission(v.role, "approvals", "approve", v.matrixRole ?? undefined),
        );
        if (cannot.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `These approvers cannot approve (missing approvals:approve): ${cannot
              .map((c: { email: string }) => c.email)
              .join(", ")}`,
          });
        }
        const [created] = await db
          .insert(approvalChains)
          .values({
            orgId: org!.id,
            entityType: input.entityType,
            name: input.name,
            rules: input.rules,
            isActive: input.isActive,
          })
          .returning();
        return created;
      }),

    /**
     * Edit a chain in place — including its approvers.
     *
     * Without this the only way to give an approver-less chain some approvers
     * was to delete and recreate it, which loses the row and any history
     * attached to it. `rules` is replaced wholesale rather than merged: the
     * approver ORDER is the meaning, and a merge cannot express "move Jane
     * after Raj" without inventing a patch language for jsonb.
     */
    update: permissionProcedure("approvals", "admin")
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(120).optional(),
          rules: z
            .array(
              z.object({
                condition: z.record(z.unknown()).default({}),
                approvers: z.array(z.string().uuid()).min(1),
                threshold: z.number().optional(),
                sequential: z.boolean().default(true),
              }),
            )
            .min(1)
            .optional(),
          isActive: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...rest } = input;

        const [target] = await db
          .select({ id: approvalChains.id })
          .from(approvalChains)
          .where(and(eq(approvalChains.id, id), eq(approvalChains.orgId, org!.id)));
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Approval chain not found" });

        // Same guard as create: an approver must exist in THIS org and must
        // actually hold approvals:approve, or the chain builds a request that
        // 403s the moment its approver touches it.
        if (rest.rules) {
          const ids = [...new Set(rest.rules.flatMap((r) => r.approvers))];
          const valid = await db
            .select({ id: users.id, email: users.email, role: users.role, matrixRole: users.matrixRole })
            .from(users)
            .where(and(eq(users.orgId, org!.id), inArray(users.id, ids)));
          if (valid.length !== ids.length) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One or more approvers are not users in this organisation",
            });
          }
          const cannot = valid.filter(
            (v: { role: string; matrixRole: string | null }) =>
              !checkDbUserPermission(v.role, "approvals", "approve", v.matrixRole ?? undefined),
          );
          if (cannot.length > 0) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `These approvers cannot approve (missing approvals:approve): ${cannot
                .map((c: { email: string }) => c.email)
                .join(", ")}`,
            });
          }
        }

        const [updated] = await db
          .update(approvalChains)
          .set(rest)
          .where(and(eq(approvalChains.id, id), eq(approvalChains.orgId, org!.id)))
          .returning();
        return updated;
      }),

    setActive: permissionProcedure("approvals", "admin")
      .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db
          .update(approvalChains)
          .set({ isActive: input.isActive })
          .where(and(eq(approvalChains.id, input.id), eq(approvalChains.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Approval chain not found" });
        return updated;
      }),

    remove: permissionProcedure("approvals", "admin")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [removed] = await db
          .delete(approvalChains)
          .where(and(eq(approvalChains.id, input.id), eq(approvalChains.orgId, org!.id)))
          .returning({ id: approvalChains.id });
        if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Approval chain not found" });
        return { ok: true };
      }),
  }),

  myPending: permissionProcedure("approvals", "read").input(paginationInput).query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const rows = await db.select().from(approvalRequests)
      .where(and(
        eq(approvalRequests.orgId, org!.id),
        eq(approvalRequests.approverId, ctx.user!.id),
        eq(approvalRequests.status, "pending"),
      ))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(input.limit).offset(input.offset);
    // Enrich with requester names
    const requesterIds = [...new Set(rows.map((r: (typeof rows)[number]) => r.requesterId).filter(Boolean))] as string[];
    const requesterMap: Record<string, string> = {};
    if (requesterIds.length > 0) {
      const requesterRows = await db.select({ id: users.id, name: users.name }).from(users)
        .where(inArray(users.id, requesterIds));
      for (const u of requesterRows) requesterMap[u.id] = u.name;
    }
    return rows.map((r: (typeof rows)[number]) => ({
      ...r,
      state: r.status,
      requestedBy: r.requesterId ? (requesterMap[r.requesterId] ?? r.requesterId) : "Unknown",
      requestedOn: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
      dueBy: r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "",
    }));
  }),

  mySubmitted: permissionProcedure("approvals", "read").input(paginationInput).query(async ({ ctx, input }) => {
    const { db, org } = ctx;
    const rows = await db.select().from(approvalRequests)
      .where(and(
        eq(approvalRequests.orgId, org!.id),
        eq(approvalRequests.requesterId, ctx.user!.id),
      ))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(input.limit).offset(input.offset);
    return rows.map((r: (typeof rows)[number]) => ({
      ...r,
      state: r.status,
      requestedBy: "Me",
      requestedOn: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "",
      dueBy: r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "",
    }));
  }),

  /** Manager view: pending approvals routed to anyone in the caller's primary
   *  reporting chain (their team subtree), excluding the caller's own queue.
   *  Lets a manager see what their reports still owe a decision on. */
  myTeamPending: permissionProcedure("approvals", "read").input(paginationInput).query(async ({ ctx, input }) => {
    const { db, org } = ctx;

    // Resolve the caller's employee record, then their report subtree.
    const [me] = await db.select({ id: employees.id }).from(employees)
      .where(and(eq(employees.orgId, org!.id), eq(employees.userId, ctx.user!.id)));
    if (!me) return [];

    const subtreeEmployeeIds = await collectReportSubtreeEmployeeIds(db, org!.id, me.id);
    if (subtreeEmployeeIds.length === 0) return [];

    // Map report employee records → their user IDs (approvals are keyed by user).
    const reportUserRows = await db.select({ userId: employees.userId }).from(employees)
      .where(and(eq(employees.orgId, org!.id), inArray(employees.id, subtreeEmployeeIds)));
    const reportUserIds = reportUserRows
      .map((r: (typeof reportUserRows)[number]) => r.userId)
      .filter(Boolean) as string[];
    if (reportUserIds.length === 0) return [];

    const rows = await db.select().from(approvalRequests)
      .where(and(
        eq(approvalRequests.orgId, org!.id),
        eq(approvalRequests.status, "pending"),
        inArray(approvalRequests.approverId, reportUserIds),
      ))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(input.limit).offset(input.offset);

    // Enrich with requester + approver names.
    const peopleIds = [...new Set([
      ...rows.map((r: (typeof rows)[number]) => r.requesterId),
      ...rows.map((r: (typeof rows)[number]) => r.approverId),
    ].filter(Boolean))] as string[];
    const nameMap: Record<string, string> = {};
    if (peopleIds.length > 0) {
      const nameRows = await db.select({ id: users.id, name: users.name }).from(users)
        .where(inArray(users.id, peopleIds));
      for (const u of nameRows) nameMap[u.id] = u.name;
    }

    return rows.map((r: (typeof rows)[number]) => ({
      ...r,
      state: r.status,
      requestedBy: r.requesterId ? (nameMap[r.requesterId] ?? r.requesterId) : "Unknown",
      assignedTo: r.approverId ? (nameMap[r.approverId] ?? r.approverId) : "Unassigned",
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

      // ── Chain advancement ────────────────────────────────────────────────
      // The step this user owns, and whether anyone is left after them.
      //
      // Advancement is SEQUENTIAL, driven by `approval_steps.sequence`. The
      // chain rule's `sequential: false` (parallel) is NOT honoured here and
      // cannot be: the request does not record which chain or rule produced it,
      // so the mode is unknown at decision time. Storing the mode on the
      // request is the fix; it needs a column, so it is queued rather than
      // guessed at.
      const steps = await db.select().from(approvalSteps)
        .where(eq(approvalSteps.requestId, input.requestId))
        .orderBy(asc(approvalSteps.sequence));

      const myStep = steps.find(
        (s: { approverId: string; status: string }) =>
          s.approverId === ctx.user!.id && s.status === "pending",
      );
      const laterPending = myStep
        ? steps.filter(
            (s: { sequence: number; status: string }) =>
              s.sequence > myStep.sequence && s.status === "pending",
          )
        : [];

      // A rejection ends the chain immediately — later approvers never see it.
      // An approval closes the request ONLY when nobody is left after this step.
      // A request with no steps at all (raised before chains existed, or seeded)
      // behaves as it always did: one decision closes it.
      const advancing = input.decision === "approved" && laterPending.length > 0;
      const nextApprover = advancing ? laterPending[0]!.approverId : null;

      const [updated] = await db.update(approvalRequests)
        .set({
          // Still pending while the chain has further approvers to hear from.
          status: advancing ? "pending" : input.decision,
          comment: input.comment,
          decidedAt: advancing ? null : new Date(),
          // `approver_id` is the pointer to the CURRENT approver — move it on,
          // otherwise the next person cannot load the request (the lookup above
          // filters on it) and the chain stalls silently.
          approverId: advancing ? nextApprover! : request.approverId,
          // PRESERVE the existing key when the decision does not carry one.
          // This used to write null, which erased the key `raise` stored on the
          // durable fact — so the unique index stopped protecting that request
          // and a retried raise could create a DUPLICATE for an event already
          // decided. One column serving both the raise key and the decide key
          // is the underlying design flaw; not widening it here.
          idempotencyKey: input.idempotencyKey ?? request.idempotencyKey,
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

      if (myStep) {
        await db.update(approvalSteps)
          .set({
            status: input.decision,
            comments: input.comment,
            decidedAt: new Date(),
          })
          .where(eq(approvalSteps.id, myStep.id));

        // On rejection the remaining steps are SKIPPED, not left pending —
        // a pending step on a rejected request would sit in someone's queue
        // forever and count towards the badge.
        if (input.decision === "rejected" && laterPending.length > 0) {
          await db.update(approvalSteps)
            .set({ status: "skipped", decidedAt: new Date() })
            .where(inArray(approvalSteps.id, laterPending.map((s: { id: string }) => s.id)));
        }
      }

      // Hand the baton on. Without this the next approver is never told.
      if (advancing && nextApprover) {
        try {
          await sendNotification({
            orgId: org!.id,
            userId: nextApprover,
            title: `Approval needed: ${request.title ?? request.entityType}`,
            body: `${request.requestNumber ?? "A request"} has passed the previous approver and now needs yours.`,
            sourceType: request.entityType,
            sourceId: request.entityId,
          });
        } catch { /* non-fatal — the advance is already persisted */ }
      }

      // Both of the following announce a FINAL outcome — the requester is told
      // their request was approved or rejected. Neither may fire while the chain
      // is still advancing, or approver 1 signing off would tell the requester
      // the whole thing was approved before approver 2 had seen it.
      if (!advancing) {
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
      } // end !advancing

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
      const requesterIds = [...new Set(items.map((r: (typeof items)[number]) => r.requesterId).filter(Boolean))] as string[];
      const requesterMap: Record<string, string> = {};
      if (requesterIds.length > 0) {
        const requesterRows = await db.select({ id: users.id, name: users.name }).from(users)
          .where(inArray(users.id, requesterIds));
        for (const u of requesterRows) requesterMap[u.id] = u.name;
      }

      return {
        items: items.map((r: (typeof items)[number]) => ({
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
