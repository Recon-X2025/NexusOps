/**
 * Compliance router — DPDP Act 2023 data-protection surface.
 *
 * Gated under the new `compliance` module (owned by the `privacy_officer` DPO
 * role; see packages/types/src/rbac-matrix.ts). Sprint 1.1 delivers the
 * Data Subject Request (DSR) lifecycle: intake, a statutory response clock,
 * a guarded status state machine, and an append-only event trail.
 */
import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  dpdpDataSubjectRequests,
  dpdpDsrEvents,
  dsrRequestTypeEnum,
  dsrStatusEnum,
  eq,
  and,
  desc,
  asc,
  sql,
} from "@coheronconnect/db";

// DSR state machine — allowed transitions. Terminal states (closed) accept none.
const DSR_TRANSITIONS: Record<string, string[]> = {
  received: ["verifying", "in_progress", "on_hold", "rejected"],
  verifying: ["in_progress", "on_hold", "rejected"],
  in_progress: ["on_hold", "fulfilled", "rejected"],
  on_hold: ["in_progress", "rejected"],
  fulfilled: ["closed"],
  rejected: ["closed"],
  closed: [],
};

type DsrStatus = (typeof dsrStatusEnum.enumValues)[number];

/** Generates the next per-org DSR case reference (DSR-YYYY-NNNN). */
async function nextDsrReference(db: any, orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DSR-${year}-`;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dpdpDataSubjectRequests)
    .where(
      and(
        eq(dpdpDataSubjectRequests.orgId, orgId),
        sql`${dpdpDataSubjectRequests.reference} LIKE ${prefix + "%"}`,
      ),
    );
  const seq = (row?.n ?? 0) + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export const complianceRouter = router({
  dsr: router({
    // ── List / filter ──────────────────────────────────────────────────────
    list: permissionProcedure("compliance", "read")
      .input(
        z
          .object({
            status: z.enum(dsrStatusEnum.enumValues).optional(),
            requestType: z.enum(dsrRequestTypeEnum.enumValues).optional(),
            overdueOnly: z.boolean().optional(),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(dpdpDataSubjectRequests.orgId, org!.id)];
        if (input?.status) conditions.push(eq(dpdpDataSubjectRequests.status, input.status));
        if (input?.requestType)
          conditions.push(eq(dpdpDataSubjectRequests.requestType, input.requestType));
        if (input?.overdueOnly) {
          conditions.push(sql`${dpdpDataSubjectRequests.closedAt} IS NULL`);
          conditions.push(sql`${dpdpDataSubjectRequests.dueAt} < now()`);
        }
        return db
          .select()
          .from(dpdpDataSubjectRequests)
          .where(and(...conditions))
          .orderBy(asc(dpdpDataSubjectRequests.dueAt));
      }),

    // ── Get one (with event trail) ───────────────────────────────────────────
    get: permissionProcedure("compliance", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [reqRow] = await db
          .select()
          .from(dpdpDataSubjectRequests)
          .where(
            and(
              eq(dpdpDataSubjectRequests.id, input.id),
              eq(dpdpDataSubjectRequests.orgId, org!.id),
            ),
          )
          .limit(1);
        if (!reqRow) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });
        const events = await db
          .select()
          .from(dpdpDsrEvents)
          .where(eq(dpdpDsrEvents.requestId, input.id))
          .orderBy(asc(dpdpDsrEvents.createdAt));
        return { ...reqRow, events };
      }),

    // ── Intake ───────────────────────────────────────────────────────────────
    create: permissionProcedure("compliance", "write")
      .input(
        z.object({
          requestType: z.enum(dsrRequestTypeEnum.enumValues),
          principalName: z.string().min(1).max(200),
          principalEmail: z.string().email().optional(),
          principalPhone: z.string().max(30).optional(),
          details: z.string().max(4000).optional(),
          assignedToUserId: z.string().uuid().optional(),
          linkedPrivacyMatterId: z.string().uuid().optional(),
          responseWindowDays: z.number().int().min(1).max(365).default(30),
          receivedAt: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
        const dueAt = new Date(
          receivedAt.getTime() + input.responseWindowDays * 24 * 60 * 60 * 1000,
        );
        const reference = await nextDsrReference(db, org!.id);

        return db.transaction(async (tx) => {
          const [reqRow] = await tx
            .insert(dpdpDataSubjectRequests)
            .values({
              orgId: org!.id,
              reference,
              requestType: input.requestType,
              status: "received",
              principalName: input.principalName,
              principalEmail: input.principalEmail,
              principalPhone: input.principalPhone,
              details: input.details,
              assignedToUserId: input.assignedToUserId,
              linkedPrivacyMatterId: input.linkedPrivacyMatterId,
              responseWindowDays: input.responseWindowDays,
              receivedAt,
              dueAt,
            })
            .returning();
          await tx.insert(dpdpDsrEvents).values({
            orgId: org!.id,
            requestId: reqRow!.id,
            eventType: "created",
            toStatus: "received",
            note: `DSR ${reference} received (${input.requestType})`,
            actorUserId: (user?.id as string) ?? null,
          });
          return reqRow!;
        });
      }),

    // ── Assign / reassign handler ─────────────────────────────────────────────
    assign: permissionProcedure("compliance", "write")
      .input(z.object({ id: z.string().uuid(), assignedToUserId: z.string().uuid().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(dpdpDataSubjectRequests)
            .set({ assignedToUserId: input.assignedToUserId, updatedAt: new Date() })
            .where(
              and(
                eq(dpdpDataSubjectRequests.id, input.id),
                eq(dpdpDataSubjectRequests.orgId, org!.id),
              ),
            )
            .returning();
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });
          await tx.insert(dpdpDsrEvents).values({
            orgId: org!.id,
            requestId: row.id,
            eventType: "assigned",
            note: input.assignedToUserId ? "Assigned handler" : "Unassigned",
            actorUserId: (user?.id as string) ?? null,
          });
          return row;
        });
      }),

    // ── State machine transition ──────────────────────────────────────────────
    transition: permissionProcedure("compliance", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          toStatus: z.enum(dsrStatusEnum.enumValues),
          note: z.string().max(4000).optional(),
          resolutionNote: z.string().max(4000).optional(),
          rejectionReason: z.string().max(4000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        return db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(dpdpDataSubjectRequests)
            .where(
              and(
                eq(dpdpDataSubjectRequests.id, input.id),
                eq(dpdpDataSubjectRequests.orgId, org!.id),
              ),
            )
            .limit(1);
          if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });

          const from = current.status as DsrStatus;
          const to = input.toStatus;
          if (from === to) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `DSR is already ${to}`,
            });
          }
          const allowed = DSR_TRANSITIONS[from] ?? [];
          if (!allowed.includes(to)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid DSR transition ${from} → ${to}`,
            });
          }
          if (to === "rejected" && !input.rejectionReason) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "rejectionReason is required to reject a DSR",
            });
          }

          const patch: Record<string, unknown> = { status: to, updatedAt: new Date() };
          if (to === "closed") patch["closedAt"] = new Date();
          if (input.resolutionNote) patch["resolutionNote"] = input.resolutionNote;
          if (to === "rejected") patch["rejectionReason"] = input.rejectionReason;

          const [row] = await tx
            .update(dpdpDataSubjectRequests)
            .set(patch)
            .where(eq(dpdpDataSubjectRequests.id, input.id))
            .returning();

          await tx.insert(dpdpDsrEvents).values({
            orgId: org!.id,
            requestId: input.id,
            eventType: "status_changed",
            fromStatus: from,
            toStatus: to,
            note: input.note ?? `${from} → ${to}`,
            actorUserId: (user?.id as string) ?? null,
          });
          return row!;
        });
      }),

    // ── Free-form note (no status change) ─────────────────────────────────────
    addNote: permissionProcedure("compliance", "write")
      .input(z.object({ id: z.string().uuid(), note: z.string().min(1).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [exists] = await db
          .select({ id: dpdpDataSubjectRequests.id })
          .from(dpdpDataSubjectRequests)
          .where(
            and(
              eq(dpdpDataSubjectRequests.id, input.id),
              eq(dpdpDataSubjectRequests.orgId, org!.id),
            ),
          )
          .limit(1);
        if (!exists) throw new TRPCError({ code: "NOT_FOUND", message: "DSR not found" });
        const [ev] = await db
          .insert(dpdpDsrEvents)
          .values({
            orgId: org!.id,
            requestId: input.id,
            eventType: "note",
            note: input.note,
            actorUserId: (user?.id as string) ?? null,
          })
          .returning();
        return ev!;
      }),

    // ── SLA summary (open / overdue / due-soon counts) ────────────────────────
    slaSummary: permissionProcedure("compliance", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await db
        .select({
          status: dpdpDataSubjectRequests.status,
          dueAt: dpdpDataSubjectRequests.dueAt,
          closedAt: dpdpDataSubjectRequests.closedAt,
        })
        .from(dpdpDataSubjectRequests)
        .where(eq(dpdpDataSubjectRequests.orgId, org!.id));

      const now = Date.now();
      const soonMs = 7 * 24 * 60 * 60 * 1000;
      let open = 0;
      let overdue = 0;
      let dueSoon = 0;
      let closed = 0;
      for (const r of rows) {
        if (r.closedAt || r.status === "closed") {
          closed++;
          continue;
        }
        open++;
        const due = new Date(r.dueAt).getTime();
        if (due < now) overdue++;
        else if (due - now <= soonMs) dueSoon++;
      }
      return { total: rows.length, open, overdue, dueSoon, closed };
    }),
  }),
});
