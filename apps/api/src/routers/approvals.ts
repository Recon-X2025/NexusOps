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

/**
 * Resolve the approver sequence for an entity.
 *
 * Order of precedence:
 *   1. An explicit `approverId` on the call — the caller already knows who.
 *   2. The active `approval_chains` row for (org, entityType).
 *
 * What the chain rules mean here, stated plainly because the column is opaque
 * jsonb and guessing would be worse than declaring:
 *   - `threshold`  — a rule applies when the request has no amount, or the
 *                    amount is at or above the threshold.
 *   - `approvers`  — user ids, taken in array order.
 *   - `condition`  — NOT interpreted. Nothing has ever written this column, so
 *                    there is no established meaning to honour. A chain that
 *                    relies on `condition` alone resolves to its approvers as
 *                    though the condition passed.
 *   - `sequential` — NOT read. `decide` advances one step at a time in
 *                    `approval_steps.sequence` order, so every chain behaves
 *                    sequentially. Parallel cannot be honoured yet: the request
 *                    does not record which chain or rule produced it, so the
 *                    mode is unknown at decision time. That needs a column on
 *                    the request, so it is queued rather than guessed at.
 */
async function resolveApprovers(
  db: any,
  orgId: string,
  entityType: string,
  amount: number | null,
): Promise<string[]> {
  const chains = await db
    .select()
    .from(approvalChains)
    .where(and(eq(approvalChains.orgId, orgId), eq(approvalChains.entityType, entityType)));

  const active = chains.filter((c: { isActive: boolean | null }) => c.isActive !== false);
  const out: string[] = [];
  for (const chain of active) {
    for (const rule of chain.rules ?? []) {
      const threshold = typeof rule.threshold === "number" ? rule.threshold : null;
      if (threshold !== null && amount !== null && amount < threshold) continue;
      for (const a of rule.approvers ?? []) if (!out.includes(a)) out.push(a);
    }
  }
  return out;
}

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

      if (input.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(approvalRequests)
          .where(
            and(
              eq(approvalRequests.orgId, org!.id),
              eq(approvalRequests.idempotencyKey, input.idempotencyKey),
            ),
          );
        if (existing) return existing;
      }

      const amount = input.amount != null ? Number(input.amount) : null;
      let approvers = input.approverId
        ? [input.approverId]
        : await resolveApprovers(db, org!.id, input.entityType, Number.isFinite(amount) ? amount : null);

      // Refuse rather than invent an approver. A request nobody can act on is
      // worse than no request — it sits pending forever and reads as a backlog.
      if (approvers.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No approver could be resolved for "${input.entityType}". Set an approval chain for it, or pass approverId.`,
        });
      }

      // Every approver must be a user in THIS org. `approver_id` is a plain FK
      // to users with no org predicate, so without this a foreign user id would
      // be accepted and the request would be actionable by another tenant.
      const valid = await db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          matrixRole: users.matrixRole,
        })
        .from(users)
        .where(and(eq(users.orgId, org!.id), inArray(users.id, approvers)));
      const validIds = new Set(valid.map((v: { id: string }) => v.id));
      const unknown = approvers.filter((a) => !validIds.has(a));
      if (unknown.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Approver(s) not found in this organisation: ${unknown.join(", ")}`,
        });
      }

      // …and must actually be able to approve. `decide` is gated on
      // approvals:approve, so routing to someone without it produces a request
      // that sits in their queue and 403s the moment they touch it — the same
      // "nobody can act on this" failure the check above exists to prevent,
      // just discovered later and by the wrong person.
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

      approvers = approvers.filter((a) => validIds.has(a));

      const requestNumber = await getNextNumber(db, org!.id, "APR");

      const [created] = await db
        .insert(approvalRequests)
        .values({
          orgId: org!.id,
          entityType: input.entityType,
          entityId: input.entityId,
          approverId: approvers[0]!,
          requesterId: user!.id,
          title: input.title ?? null,
          description: input.description ?? null,
          type: input.type ?? "change",
          priority: input.priority,
          amount: input.amount ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          requestNumber,
          status: "pending",
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      // One step per approver, in order. `decide` walks these by sequence, so
      // approver 2 is only reached once approver 1 has approved.
      await db.insert(approvalSteps).values(
        approvers.map((approverId, i) => ({
          orgId: org!.id,
          requestId: created!.id,
          approverId,
          sequence: i + 1,
          status: "pending" as const,
        })),
      );

      try {
        await sendNotification({
          orgId: org!.id,
          userId: approvers[0]!,
          title: `Approval requested: ${input.title ?? input.entityType}`,
          body: `${user!.name ?? "Someone"} raised ${requestNumber} for your approval.`,
          sourceType: input.entityType,
          sourceId: input.entityId,
        });
      } catch {
        /* non-fatal — the request is already persisted */
      }

      return created;
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
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.orgId, org!.id), inArray(users.id, ids)));
        if (valid.length !== ids.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more approvers are not users in this organisation",
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
