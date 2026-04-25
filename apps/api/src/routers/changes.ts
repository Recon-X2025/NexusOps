import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  changeRequests,
  changeApprovals,
  changeBlackoutWindows,
  problems,
  knownErrors,
  releases,
  kbArticles,
  eq,
  and,
  desc,
  asc,
  count,
  inArray,
  sql,
} from "@nexusops/db";
import { sendNotification } from "../services/notifications";
import { getNextNumber } from "../lib/auto-number";
import { getRedis } from "../lib/redis";



/**
 * Valid change request status lifecycle transitions.
 * create → approve → implement → close  (spec §6)
 */
/** Must align with `change_status` enum (`packages/db/src/schema/changes.ts`). */
const CHANGE_LIFECYCLE: Record<string, string[]> = {
  draft:         ["cab_review", "cancelled"],
  submitted:     ["cab_review", "cancelled"],
  cab_review:    ["approved", "cancelled"],
  approved:      ["scheduled", "implementing", "cancelled"],
  scheduled:     ["implementing", "cancelled"],
  implementing:  ["completed", "failed", "cancelled"],
  completed:     [],
  failed:        ["implementing", "cancelled"],
  cancelled:     [],
};

function assertChangeTransition(from: string, to: string) {
  const allowed = CHANGE_LIFECYCLE[from];
  if (!allowed) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown current status: ${from}` });
  }
  if (!allowed.includes(to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid lifecycle transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none"}`,
    });
  }
}

const CAB_RISK_Q_KEYS = ["impact", "likelihood", "rollbackValidated"] as const;

/** US-ITSM-007: high/critical CAB approval requires score + structured questionnaire. */
function assertCabRiskForApprove(
  risk: string,
  riskScore: number | null | undefined,
  riskQuestionnaire: Record<string, unknown> | null | undefined,
) {
  if (risk !== "high" && risk !== "critical") return;
  if (riskScore == null || riskScore < 1 || riskScore > 25) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "CAB approval requires riskScore between 1 and 25 for high/critical changes",
    });
  }
  const q = riskQuestionnaire ?? {};
  for (const k of CAB_RISK_Q_KEYS) {
    const v = q[k];
    if (v == null || String(v).trim() === "") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `CAB approval requires risk questionnaire field: ${k}`,
      });
    }
  }
}

export const changesRouter = router({
  // ── Change Requests ──────────────────────────────────────────────────────
  list: permissionProcedure("changes", "read")
    .input(z.object({
      status: z.string().optional(),
      type: z.string().optional(),
      risk: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;

      // Short-lived cache for the dashboard change window widget.
      // Active only when called with the exact dashboard parameters (limit=3, no filters).
      // All other changes.list calls are unaffected.
      const cacheKey =
        input.limit === 3 &&
        !input.status && !input.type && !input.risk && !input.search && !input.cursor
          ? `changes:dashboard:${org!.id}`
          : null;
      if (cacheKey) {
        try {
          const hit = await getRedis().get(cacheKey);
          if (hit) return JSON.parse(hit);
        } catch {
          // Redis unavailable — proceed to DB
        }
      }

      const conditions = [eq(changeRequests.orgId, org!.id)];
      if (input.status) conditions.push(eq(changeRequests.status, input.status as any));
      if (input.type) conditions.push(eq(changeRequests.type, input.type as any));
      if (input.risk) conditions.push(eq(changeRequests.risk, input.risk as any));

      const rows = await db
        .select()
        .from(changeRequests)
        .where(and(...conditions))
        .orderBy(desc(changeRequests.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const result = { items, nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + items.length) : null };
      if (cacheKey)
        getRedis().setex(cacheKey, 90, JSON.stringify(result)).catch(() => {});
      return result;
    }),

  get: permissionProcedure("changes", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [change] = await db
        .select()
        .from(changeRequests)
        .where(and(eq(changeRequests.id, input.id), eq(changeRequests.orgId, org!.id)));
      if (!change) throw new TRPCError({ code: "NOT_FOUND" });

      const approvals = await db
        .select()
        .from(changeApprovals)
        .where(eq(changeApprovals.changeId, change.id))
        .orderBy(asc(changeApprovals.createdAt));

      return { ...change, approvals };
    }),

  create: permissionProcedure("changes", "write")
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["normal", "standard", "emergency", "expedited"]).default("normal"),
      risk: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      scheduledStart: z.string().optional(),
      scheduledEnd: z.string().optional(),
      rollbackPlan: z.string().optional(),
      implementationPlan: z.string().optional(),
      testPlan: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const number = await getNextNumber(db, org!.id, "CHG");
      const [change] = await db
        .insert(changeRequests)
        .values({
          orgId: org!.id,
          number,
          title: input.title,
          description: input.description,
          type: input.type,
          risk: input.risk,
          requesterId: user!.id,
          scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : undefined,
          scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : undefined,
          rollbackPlan: input.rollbackPlan,
          implementationPlan: input.implementationPlan,
          testPlan: input.testPlan,
        })
        .returning();
      return change;
    }),

  update: permissionProcedure("changes", "write")
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      risk: z.string().optional(),
      riskScore: z.coerce.number().int().min(1).max(25).optional(),
      riskQuestionnaire: z.record(z.unknown()).optional(),
      scheduledStart: z.string().optional(),
      scheduledEnd: z.string().optional(),
      rollbackPlan: z.string().optional(),
      cabDecision: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [change] = await db
        .update(changeRequests)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(changeRequests.id, id), eq(changeRequests.orgId, org!.id)))
        .returning();
      if (!change) throw new TRPCError({ code: "NOT_FOUND" });
      return change;
    }),

  submitForApproval: permissionProcedure("changes", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [current] = await db.select({ status: changeRequests.status, version: changeRequests.version })
        .from(changeRequests)
        .where(and(eq(changeRequests.id, input.id), eq(changeRequests.orgId, org!.id)));
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertChangeTransition(current.status, "cab_review");
      const [change] = await db
        .update(changeRequests)
        .set({ status: "cab_review", version: sql`${changeRequests.version} + 1`, updatedAt: new Date() })
        .where(and(
          eq(changeRequests.id, input.id),
          eq(changeRequests.orgId, org!.id),
          eq(changeRequests.version, current.version),
        ))
        .returning();
      if (!change) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Record was modified by another user. Please refresh and try again.",
        });
      }
      return change;
    }),

  approve: permissionProcedure("changes", "approve")
    .input(
      z.object({
        changeId: z.string().uuid(),
        comments: z.string().optional(),
        riskScore: z.coerce.number().int().min(1).max(25).optional(),
        riskQuestionnaire: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [current] = await db
        .select({
          status: changeRequests.status,
          version: changeRequests.version,
          requesterId: changeRequests.requesterId,
          title: changeRequests.title,
          number: changeRequests.number,
          risk: changeRequests.risk,
          riskScore: changeRequests.riskScore,
          riskQuestionnaire: changeRequests.riskQuestionnaire,
        })
        .from(changeRequests)
        .where(and(eq(changeRequests.id, input.changeId), eq(changeRequests.orgId, org!.id)));
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertChangeTransition(current.status, "approved");
      const mergedQ = {
        ...((current.riskQuestionnaire as Record<string, unknown> | null) ?? {}),
        ...(input.riskQuestionnaire ?? {}),
      };
      const mergedScore = input.riskScore ?? current.riskScore ?? undefined;
      assertCabRiskForApprove(String(current.risk), mergedScore, mergedQ);
      const [approval] = await db
        .insert(changeApprovals)
        .values({ changeId: input.changeId, approverId: user!.id, decision: "approved", comments: input.comments, decidedAt: new Date() })
        .returning();
      const [change] = await db.update(changeRequests)
        .set({
          status: "approved",
          riskScore: mergedScore ?? null,
          riskQuestionnaire: mergedQ,
          version: sql`${changeRequests.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(changeRequests.id, input.changeId),
          eq(changeRequests.orgId, org!.id),
          eq(changeRequests.version, current.version),
        ))
        .returning();
      if (!change) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Record was modified by another user. Please refresh and try again.",
        });
      }
      if (current.requesterId && current.requesterId !== user!.id) {
        sendNotification({
          orgId: org!.id,
          userId: current.requesterId,
          title: `Change request approved: ${current.number}`,
          body: current.title,
          link: `/app/changes/${input.changeId}`,
          type: "success",
          sourceType: "change_request",
          sourceId: input.changeId,
        }).catch(() => {});
      }
      return approval;
    }),

  reject: permissionProcedure("changes", "approve")
    .input(z.object({ changeId: z.string().uuid(), comments: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [current] = await db.select({ status: changeRequests.status, version: changeRequests.version, requesterId: changeRequests.requesterId, title: changeRequests.title, number: changeRequests.number })
        .from(changeRequests)
        .where(and(eq(changeRequests.id, input.changeId), eq(changeRequests.orgId, org!.id)));
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      assertChangeTransition(current.status, "cancelled");
      const [approval] = await db
        .insert(changeApprovals)
        .values({ changeId: input.changeId, approverId: user!.id, decision: "rejected", comments: input.comments, decidedAt: new Date() })
        .returning();
      const [change] = await db.update(changeRequests)
        .set({ status: "cancelled", version: sql`${changeRequests.version} + 1`, updatedAt: new Date() })
        .where(and(
          eq(changeRequests.id, input.changeId),
          eq(changeRequests.orgId, org!.id),
          eq(changeRequests.version, current.version),
        ))
        .returning();
      if (!change) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Record was modified by another user. Please refresh and try again.",
        });
      }
      if (current.requesterId && current.requesterId !== user!.id) {
        sendNotification({
          orgId: org!.id,
          userId: current.requesterId,
          title: `Change request rejected: ${current.number}`,
          body: input.comments,
          link: `/app/changes/${input.changeId}`,
          type: "error",
          sourceType: "change_request",
          sourceId: input.changeId,
        }).catch(() => {});
      }
      return approval;
    }),

  statusCounts: permissionProcedure("changes", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select({ status: changeRequests.status, cnt: count() })
      .from(changeRequests)
      .where(eq(changeRequests.orgId, org!.id))
      .groupBy(changeRequests.status);
    return Object.fromEntries(
      rows.map((r: { status: string; cnt: unknown }) => [r.status, Number(r.cnt)]),
    );
  }),

  addComment: permissionProcedure("changes", "write")
    .input(z.object({ changeId: z.string().uuid(), body: z.string().min(1), isInternal: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [change] = await db.select({ id: changeRequests.id }).from(changeRequests)
        .where(and(eq(changeRequests.id, input.changeId), eq(changeRequests.orgId, org!.id)));
      if (!change) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(changeRequests)
        .set({ updatedAt: new Date() })
        .where(eq(changeRequests.id, input.changeId));
      return { changeId: input.changeId, body: input.body, authorId: user!.id, createdAt: new Date() };
    }),

  // ── Problems ─────────────────────────────────────────────────────────────
  listProblems: permissionProcedure("problems", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(problems.orgId, org!.id)];
      if (input.status) conditions.push(eq(problems.status, input.status as any));
      return db.select().from(problems).where(and(...conditions)).orderBy(desc(problems.createdAt)).limit(input.limit);
    }),

  createProblem: permissionProcedure("problems", "write")
    .input(z.object({ title: z.string(), description: z.string().optional(), priority: z.string().default("medium") }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const number = await getNextNumber(db, org!.id, "PRB");
      const [problem] = await db.insert(problems).values({ orgId: org!.id, number, ...input }).returning();
      return problem;
    }),

  updateProblem: permissionProcedure("problems", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), rootCause: z.string().optional(), workaround: z.string().optional(), resolution: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [problem] = await db.update(problems).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(problems.id, id), eq(problems.orgId, org!.id))).returning();
      return problem;
    }),

  addProblemNote: permissionProcedure("problems", "write")
    .input(z.object({ problemId: z.string().uuid(), note: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [prob] = await db.select({ id: problems.id, notes: problems.notes }).from(problems)
        .where(and(eq(problems.id, input.problemId), eq(problems.orgId, org!.id)));
      if (!prob) throw new TRPCError({ code: "NOT_FOUND" });
      const existingNotes = (prob.notes as any[]) ?? [];
      const updatedNotes = [...existingNotes, { body: input.note, authorId: user!.id, createdAt: new Date().toISOString() }];
      await db.update(problems).set({ notes: updatedNotes as any, updatedAt: new Date() } as any)
        .where(eq(problems.id, input.problemId));
      return { success: true };
    }),

  publishProblemToKB: permissionProcedure("problems", "write")
    .input(z.object({ problemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [prob] = await db.select().from(problems)
        .where(and(eq(problems.id, input.problemId), eq(problems.orgId, org!.id)));
      if (!prob) throw new TRPCError({ code: "NOT_FOUND" });
      const [article] = await db.insert(kbArticles).values({
        orgId: org!.id,
        title: `[Known Error] ${prob.title}`,
        content: `**Problem:** ${prob.description ?? ""}\n\n**Root Cause:** ${prob.rootCause ?? "Under investigation."}\n\n**Workaround:** ${prob.workaround ?? "None documented."}`,
        status: "published",
        authorId: user!.id,
        tags: ["known-error", "problem-management"],
      }).returning();
      return article;
    }),

  getRelease: permissionProcedure("changes", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [release] = await db.select().from(releases)
        .where(and(eq(releases.id, input.id), eq(releases.orgId, org!.id)));
      if (!release) throw new TRPCError({ code: "NOT_FOUND", message: "Release not found" });
      return release;
    }),

  updateRelease: permissionProcedure("changes", "write")
    .input(z.object({ id: z.string().uuid(), status: z.string().optional(), notes: z.string().optional(), actualDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [release] = await db.update(releases)
        .set({ ...data, actualDate: data.actualDate ? new Date(data.actualDate) : undefined, updatedAt: new Date() } as any)
        .where(and(eq(releases.id, id), eq(releases.orgId, org!.id)))
        .returning();
      return release;
    }),

  // ── Releases ──────────────────────────────────────────────────────────────
  listReleases: permissionProcedure("changes", "read")
    .input(z.object({ status: z.string().optional(), limit: z.coerce.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(releases.orgId, org!.id)];
      if (input.status) conditions.push(eq(releases.status, input.status as any));
      return db.select().from(releases).where(and(...conditions)).orderBy(desc(releases.createdAt)).limit(input.limit);
    }),

  createRelease: permissionProcedure("changes", "write")
    .input(z.object({ name: z.string(), version: z.string(), plannedDate: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [release] = await db.insert(releases).values({
        orgId: org!.id, ...input,
        plannedDate: input.plannedDate ? new Date(input.plannedDate) : undefined,
        createdBy: user!.id,
      }).returning();
      return release;
    }),

  listKnownErrors: permissionProcedure("problems", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(knownErrors)
      .where(eq(knownErrors.orgId, org!.id))
      .orderBy(desc(knownErrors.createdAt))
      .limit(200);
  }),

  listBlackouts: permissionProcedure("changes", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select()
      .from(changeBlackoutWindows)
      .where(eq(changeBlackoutWindows.orgId, org!.id))
      .orderBy(desc(changeBlackoutWindows.startsAt));
  }),

  createBlackout: permissionProcedure("changes", "write")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const start = new Date(input.startsAt);
      const end = new Date(input.endsAt);
      if (!(start < end)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "startsAt must be before endsAt" });
      }
      const [row] = await db
        .insert(changeBlackoutWindows)
        .values({
          orgId: org!.id,
          name: input.name,
          startsAt: start,
          endsAt: end,
        })
        .returning();
      return row;
    }),

  /** Read-only overlap check for CAB (Phase B4). */
  checkBlackoutOverlap: permissionProcedure("changes", "read")
    .input(
      z.object({
        scheduledStart: z.string().datetime(),
        scheduledEnd: z.string().datetime(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const wStart = new Date(input.scheduledStart);
      const wEnd = new Date(input.scheduledEnd);
      if (!(wStart < wEnd)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "scheduledStart must be before scheduledEnd" });
      }

      const blackouts = await db
        .select()
        .from(changeBlackoutWindows)
        .where(eq(changeBlackoutWindows.orgId, org!.id));

      const overlappingBlackouts = blackouts.filter(
        (b: (typeof blackouts)[number]) => wStart < b.endsAt && b.startsAt < wEnd,
      );

      const scheduledChanges = await db
        .select({
          id: changeRequests.id,
          number: changeRequests.number,
          title: changeRequests.title,
          scheduledStart: changeRequests.scheduledStart,
          scheduledEnd: changeRequests.scheduledEnd,
          status: changeRequests.status,
        })
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.orgId, org!.id),
            sql`${changeRequests.scheduledStart} IS NOT NULL`,
            sql`${changeRequests.scheduledEnd} IS NOT NULL`,
            inArray(changeRequests.status, ["approved", "scheduled", "implementing"]),
          ),
        );

      const overlappingChanges = scheduledChanges.filter((c: (typeof scheduledChanges)[number]) => {
        if (!c.scheduledStart || !c.scheduledEnd) return false;
        return wStart < c.scheduledEnd && c.scheduledStart < wEnd;
      });

      return { overlappingBlackouts, overlappingChanges };
    }),
});
