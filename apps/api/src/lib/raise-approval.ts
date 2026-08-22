/**
 * raiseApproval — the single place an approval request is created.
 *
 * Extracted so the tRPC procedure (`approvals.raise`) and the modules that
 * raise on a user's behalf (procurement, contracts, expenses, …) share one
 * implementation. Two write sites for the same rule is the shape that produced
 * the deprecated-twin defects documented in CLAUDE.md: a guard added to one and
 * not the other leaves the hole fully open.
 *
 * Chain semantics, stated because `approval_chains.rules` is opaque jsonb:
 *   - `threshold`  — a rule applies when the request has no amount, or the
 *                    amount is at or above the threshold.
 *   - `approvers`  — user ids, taken in array order.
 *   - `condition`  — NOT interpreted. Nothing has ever written it, so there is
 *                    no established meaning to honour.
 *   - `sequential` — NOT read. `decide` advances one step at a time by
 *                    `approval_steps.sequence`, so every chain is sequential.
 *                    Parallel needs the mode stored on the request.
 */
import { TRPCError } from "@trpc/server";
import {
  approvalRequests,
  approvalSteps,
  approvalChains,
  users,
  eq,
  and,
  inArray,
} from "@coheronconnect/db";
import { getNextNumber } from "./auto-number";
import { checkDbUserPermission } from "./rbac-db";
import { sendNotification } from "../services/notifications";

export interface RaiseApprovalInput {
  orgId: string;
  /** Who is asking. Recorded as `requester_id`. */
  requesterId: string;
  requesterName?: string | null;
  entityType: string;
  entityId: string;
  title?: string | null;
  description?: string | null;
  type?: string | null;
  priority?: "urgent" | "high" | "normal";
  amount?: string | null;
  dueDate?: Date | null;
  /** Explicit approver — wins over the chain. */
  approverId?: string | null;
  /** Key on the DURABLE FACT, never a mutable status. */
  idempotencyKey?: string | null;
}

/** Approvers a chain resolves to for this entity type and amount, in order. */
export async function resolveApprovers(
  db: any, // any-ratchet-allow: db | tx
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

export async function raiseApproval(
  db: any, // any-ratchet-allow: db | tx
  input: RaiseApprovalInput,
) {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.orgId, input.orgId),
          eq(approvalRequests.idempotencyKey, input.idempotencyKey),
        ),
      );
    if (existing) return existing;
  }

  const amountNum = input.amount != null ? Number(input.amount) : null;
  let approvers = input.approverId
    ? [input.approverId]
    : await resolveApprovers(
        db,
        input.orgId,
        input.entityType,
        Number.isFinite(amountNum) ? amountNum : null,
      );

  // Refuse rather than invent an approver. A request nobody can act on sits
  // pending forever and reads as a backlog.
  if (approvers.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `No approver could be resolved for "${input.entityType}". Set an approval chain for it, or pass approverId.`,
    });
  }

  // Every approver must be a user in THIS org. `approver_id` is a plain FK to
  // users with no org predicate, so a foreign id would otherwise be accepted
  // and the request actionable by another tenant.
  const valid = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      matrixRole: users.matrixRole,
    })
    .from(users)
    .where(and(eq(users.orgId, input.orgId), inArray(users.id, approvers)));
  const validIds = new Set(valid.map((v: { id: string }) => v.id));
  const unknown = approvers.filter((a) => !validIds.has(a));
  if (unknown.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Approver(s) not found in this organisation: ${unknown.join(", ")}`,
    });
  }

  // …and must actually be able to approve. `decide` is gated on
  // approvals:approve, so routing to someone without it produces a request that
  // sits in their queue and 403s the moment they touch it.
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

  const requestNumber = await getNextNumber(db, input.orgId, "APR");

  const [created] = await db
    .insert(approvalRequests)
    .values({
      orgId: input.orgId,
      entityType: input.entityType,
      entityId: input.entityId,
      approverId: approvers[0]!,
      requesterId: input.requesterId,
      title: input.title ?? null,
      description: input.description ?? null,
      type: input.type ?? "change",
      priority: input.priority ?? "normal",
      amount: input.amount ?? null,
      dueDate: input.dueDate ?? null,
      requestNumber,
      status: "pending",
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();

  // One step per approver, in order. `decide` walks these by sequence, so
  // approver 2 is only reached once approver 1 has approved.
  await db.insert(approvalSteps).values(
    approvers.map((approverId, i) => ({
      orgId: input.orgId,
      requestId: created!.id,
      approverId,
      sequence: i + 1,
      status: "pending" as const,
    })),
  );

  try {
    await sendNotification({
      orgId: input.orgId,
      userId: approvers[0]!,
      title: `Approval requested: ${input.title ?? input.entityType}`,
      body: `${input.requesterName ?? "Someone"} raised ${requestNumber} for your approval.`,
      sourceType: input.entityType,
      sourceId: input.entityId,
    });
  } catch {
    /* non-fatal — the request is already persisted */
  }

  return created;
}
