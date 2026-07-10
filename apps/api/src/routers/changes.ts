import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  changeRequests,
  changeApprovals,
  changeBlackoutWindows,
  tickets,
  problems,
  knownErrors,
  releases,
  kbArticles,
  eq,
  and,
  or,
  isNull,
  isNotNull,
  gt,
  gte,
  lte,
  desc,
  asc,
  count,
  inArray,
  sql,
} from "@coheronconnect/db";
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

async function assertNoBlackoutOverlap(db: any, orgId: string, type: string | undefined, start?: Date, end?: Date) {
  if (!start) return;
  if (type === "emergency") return; // Emergency changes can bypass blackouts

  const endLimit = end || start;
  const blackouts = await db
    .select()
    .from(changeBlackoutWindows)
    .where(eq(changeBlackoutWindows.orgId, orgId));

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endLimitDay = new Date(endLimit.getFullYear(), endLimit.getMonth(), endLimit.getDate()).getTime();

  const overlap = blackouts.find((b: { startsAt: Date; endsAt: Date }) => {
    const bStartDay = new Date(b.startsAt.getFullYear(), b.startsAt.getMonth(), b.startsAt.getDate()).getTime();
    const bEndDay = new Date(b.endsAt.getFullYear(), b.endsAt.getMonth(), b.endsAt.getDate()).getTime();
    return bStartDay <= endLimitDay && bEndDay >= startDay;
  });

  if (overlap) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot schedule change during blackout window: ${overlap.name}`,
    });
  }
}

export const changesRouter = router({
  // ── Change Requests ──────────────────────────────────────────────────────
  list: permissionProcedure("changes", "read")
    .input(z.object({
      status: z.enum(["draft", "submitted", "cab_review", "approved", "scheduled", "implementing", "completed", "failed", "cancelled"]).optional(),
      type: z.enum(["normal", "standard", "emergency", "expedited"]).optional(),
      risk: z.enum(["low", "medium", "high", "critical"]).optional(),
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
      if (input.status === "approved") {
        conditions.push(
          and(
            eq(changeRequests.status, "approved"),
            or(isNull(changeRequests.scheduledStart), gt(changeRequests.scheduledStart, new Date()))
          )!
        );
      } else if (input.status === "scheduled") {
        conditions.push(
          or(
            eq(changeRequests.status, "scheduled"),
            and(
              eq(changeRequests.status, "approved"),
              isNotNull(changeRequests.scheduledStart),
              lte(changeRequests.scheduledStart, new Date())
            )
          )!
        );
      } else if (input.status) {
        conditions.push(eq(changeRequests.status, input.status));
      }
      if (input.type) conditions.push(eq(changeRequests.type, input.type));
      if (input.risk) conditions.push(eq(changeRequests.risk, input.risk));

      const rows = await db
        .select()
        .from(changeRequests)
        .where(and(...conditions))
        .orderBy(desc(changeRequests.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      const items = (hasMore ? rows.slice(0, -1) : rows).map(row => {
        if (row.status === "approved" && row.scheduledStart && row.scheduledStart <= new Date()) {
          return { ...row, status: "scheduled" as const };
        }
        return row;
      });
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

      const effectiveStatus = change.status === "approved" && change.scheduledStart && change.scheduledStart <= new Date()
        ? "scheduled" 
        : change.status;

      return { ...change, status: effectiveStatus, approvals };
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
      releaseId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      
      const scheduledStart = input.scheduledStart ? new Date(input.scheduledStart) : undefined;
      const scheduledEnd = input.scheduledEnd ? new Date(input.scheduledEnd) : undefined;
      
      await assertNoBlackoutOverlap(db, org!.id, input.type, scheduledStart, scheduledEnd);
      
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
          scheduledStart,
          scheduledEnd,
          rollbackPlan: input.rollbackPlan,
          implementationPlan: input.implementationPlan,
          testPlan: input.testPlan,
          releaseId: input.releaseId,
        })
        .returning();
      return change;
    }),

  update: permissionProcedure("changes", "write")
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["draft", "submitted", "cab_review", "approved", "scheduled", "implementing", "completed", "failed", "cancelled"]).optional(),
      risk: z.enum(["low", "medium", "high", "critical"]).optional(),
      riskScore: z.coerce.number().int().min(1).max(25).optional(),
      riskQuestionnaire: z.record(z.unknown()).optional(),
      scheduledStart: z.string().optional(),
      scheduledEnd: z.string().optional(),
      rollbackPlan: z.string().optional(),
      cabDecision: z.string().optional(),
      releaseId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, scheduledStart, scheduledEnd, ...rest } = input;
      
      const parsedStart = scheduledStart !== undefined ? new Date(scheduledStart) : undefined;
      const parsedEnd = scheduledEnd !== undefined ? new Date(scheduledEnd) : undefined;

      // If we are updating dates, fetch current change to get the type and validate against blackouts
      if (parsedStart !== undefined || parsedEnd !== undefined) {
        const [current] = await db.select({ type: changeRequests.type, scheduledStart: changeRequests.scheduledStart, scheduledEnd: changeRequests.scheduledEnd })
          .from(changeRequests).where(and(eq(changeRequests.id, id), eq(changeRequests.orgId, org!.id)));
          
        if (current) {
          const finalStart = parsedStart !== undefined ? parsedStart : current.scheduledStart ?? undefined;
          const finalEnd = parsedEnd !== undefined ? parsedEnd : current.scheduledEnd ?? undefined;
          await assertNoBlackoutOverlap(db, org!.id, current.type, finalStart, finalEnd);
        }
      }

      const [change] = await db
        .update(changeRequests)
        .set({
          ...rest,
          ...(scheduledStart !== undefined ? { scheduledStart: parsedStart } : {}),
          ...(scheduledEnd !== undefined ? { scheduledEnd: parsedEnd } : {}),
          updatedAt: new Date(),
        })
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
    const effectiveStatus = sql<string>`
      CASE 
        WHEN ${changeRequests.status} = 'approved' AND ${changeRequests.scheduledStart} IS NOT NULL AND ${changeRequests.scheduledStart} <= NOW() 
        THEN 'scheduled' 
        ELSE ${changeRequests.status} 
      END
    `.as("effective_status");
    
    const rows = await db
      .select({ status: effectiveStatus, cnt: count() })
      .from(changeRequests)
      .where(eq(changeRequests.orgId, org!.id))
      .groupBy(effectiveStatus);
      
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
    .input(z.object({
      status: z.enum(["new", "investigation", "root_cause_identified", "known_error", "resolved", "closed"]).optional(),
      limit: z.coerce.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(problems.orgId, org!.id)];
      if (input.status) conditions.push(eq(problems.status, input.status));
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
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "investigation", "root_cause_identified", "known_error", "resolved", "closed"]).optional(),
      rootCause: z.string().optional(),
      workaround: z.string().optional(),
      resolution: z.string().optional(),
      releaseId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [problem] = await db.update(problems).set({ ...data, updatedAt: new Date() })
        .where(and(eq(problems.id, id), eq(problems.orgId, org!.id))).returning();
      if (!problem) throw new TRPCError({ code: "NOT_FOUND" });

      // Ensure KEDB record exists if status is known_error or workaround is documented
      if (problem.status === "known_error" || problem.workaround) {
        const [existingKe] = await db.select().from(knownErrors)
          .where(and(eq(knownErrors.problemId, problem.id), eq(knownErrors.orgId, org!.id)));
        
        if (existingKe) {
          await db.update(knownErrors).set({ title: problem.title, workaround: problem.workaround || null })
            .where(eq(knownErrors.id, existingKe.id));
        } else {
          await db.insert(knownErrors).values({
            orgId: org!.id,
            problemId: problem.id,
            title: problem.title,
            workaround: problem.workaround || null,
            status: "active"
          });
        }
      }

      return problem;
    }),

  linkIncidentToProblem: permissionProcedure("problems", "write")
    .input(z.object({
      problemId: z.string().uuid(),
      ticketNumber: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      
      // 1. Find the incident (ticket)
      const [ticket] = await db.select().from(tickets)
        .where(
          and(
            eq(tickets.orgId, org!.id),
            or(
              eq(tickets.number, input.ticketNumber.toUpperCase().trim()),
              eq(tickets.id, input.ticketNumber)
            )
          )
        );
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Incident not found" });

      // 2. Find or create the known error record for this problem
      const [problem] = await db.select().from(problems)
        .where(and(eq(problems.id, input.problemId), eq(problems.orgId, org!.id)));
      if (!problem) throw new TRPCError({ code: "NOT_FOUND", message: "Problem not found" });

      let [ke] = await db.select().from(knownErrors)
        .where(and(eq(knownErrors.problemId, problem.id), eq(knownErrors.orgId, org!.id)));
      
      if (!ke) {
        [ke] = await db.insert(knownErrors).values({
          orgId: org!.id,
          problemId: problem.id,
          title: problem.title,
          workaround: problem.workaround || null,
          status: "active"
        }).returning();
      }

      // 3. Link the ticket to this known error
      await db.update(tickets).set({ knownErrorId: ke!.id, updatedAt: new Date() })
        .where(eq(tickets.id, ticket.id));
      
      return { success: true };
    }),

  unlinkIncident: permissionProcedure("problems", "write")
    .input(z.object({
      ticketId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db.update(tickets).set({ knownErrorId: null, updatedAt: new Date() })
        .where(and(eq(tickets.id, input.ticketId), eq(tickets.orgId, org!.id)));
      return { success: true };
    }),

  addProblemNote: permissionProcedure("problems", "write")
    .input(z.object({ problemId: z.string().uuid(), note: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [prob] = await db.select({ id: problems.id, notes: problems.notes }).from(problems)
        .where(and(eq(problems.id, input.problemId), eq(problems.orgId, org!.id)));
      if (!prob) throw new TRPCError({ code: "NOT_FOUND" });
      type ProblemNote = { body: string; authorId: string; createdAt: string };
      const existingNotes: ProblemNote[] = (prob.notes ?? []) as ProblemNote[];
      const updatedNotes: ProblemNote[] = [...existingNotes, { body: input.note, authorId: user!.id, createdAt: new Date().toISOString() }];
      await db.update(problems).set({ notes: updatedNotes, updatedAt: new Date() })
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
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(["planning", "build", "test", "deploy", "completed", "cancelled"]).optional(),
      notes: z.string().optional(),
      actualDate: z.string().optional(),
      deploymentPlan: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, actualDate, ...rest } = input;
      const [release] = await db.update(releases)
        .set({ ...rest, ...(actualDate !== undefined ? { actualDate: new Date(actualDate) } : {}), updatedAt: new Date() })
        .where(and(eq(releases.id, id), eq(releases.orgId, org!.id)))
        .returning();
      return release;
    }),

  // ── Releases ──────────────────────────────────────────────────────────────
  listReleases: permissionProcedure("changes", "read")
    .input(z.object({
      status: z.enum(["planning", "build", "test", "deploy", "completed", "cancelled"]).optional(),
      limit: z.coerce.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(releases.orgId, org!.id)];
      if (input.status) conditions.push(eq(releases.status, input.status));
      const rels = await db.select().from(releases).where(and(...conditions)).orderBy(desc(releases.createdAt)).limit(input.limit);

      if (rels.length === 0) return [];

      const releaseIds = rels.map(r => r.id);

      const linkedChanges = await db.select({ id: changeRequests.id, number: changeRequests.number, releaseId: changeRequests.releaseId })
        .from(changeRequests)
        .where(and(eq(changeRequests.orgId, org!.id), isNotNull(changeRequests.releaseId), inArray(changeRequests.releaseId, releaseIds)));
        
      const linkedProblems = await db.select({ id: problems.id, number: problems.number, releaseId: problems.releaseId })
        .from(problems)
        .where(and(eq(problems.orgId, org!.id), isNotNull(problems.releaseId), inArray(problems.releaseId, releaseIds)));

      return rels.map(r => ({
        ...r,
        linkedItems: [
          ...linkedChanges.filter(c => c.releaseId === r.id).map(c => c.number),
          ...linkedProblems.filter(p => p.releaseId === r.id).map(p => p.number)
        ]
      }));
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
