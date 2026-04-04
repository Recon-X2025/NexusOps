import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  jobRequisitions, candidates, candidateApplications, interviews, jobOffers,
  eq, and, desc, asc, count, sql, inArray,
} from "@nexusops/db";

const STAGE_ORDER = [
  "applied", "screening", "phone_screen", "technical", "panel", "hr_round", "offer", "hired",
] as const;

export const recruitmentRouter = router({

  // ── Job Requisitions ────────────────────────────────────────────────────────

  requisitions: router({
    list: permissionProcedure("recruitment", "read")
      .input(z.object({
        status: z.string().optional(),
        department: z.string().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(jobRequisitions.orgId, org!.id)];
        if (input.status) conds.push(eq(jobRequisitions.status, input.status as any));
        if (input.department) conds.push(eq(jobRequisitions.department, input.department));
        const rows = await db.select().from(jobRequisitions)
          .where(and(...conds)).orderBy(desc(jobRequisitions.createdAt));
        if (input.search) {
          const q = input.search.toLowerCase();
          return rows.filter((r: any) => r.title.toLowerCase().includes(q) || r.department.toLowerCase().includes(q));
        }
        return rows;
      }),

    get: permissionProcedure("recruitment", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [req] = await db.select().from(jobRequisitions)
          .where(and(eq(jobRequisitions.id, input.id), eq(jobRequisitions.orgId, org!.id)));
        if (!req) throw new TRPCError({ code: "NOT_FOUND" });
        const apps = await db.select().from(candidateApplications)
          .where(eq(candidateApplications.jobId, input.id))
          .orderBy(desc(candidateApplications.createdAt));
        return { requisition: req, applications: apps };
      }),

    create: permissionProcedure("recruitment", "write")
      .input(z.object({
        title:           z.string().min(2),
        department:      z.string().min(1),
        location:        z.string().optional(),
        workMode:        z.string().optional(),
        type:            z.enum(["full_time","part_time","contract","internship","freelance"]).default("full_time"),
        level:           z.enum(["intern","junior","mid","senior","lead","manager","director","vp","c_level"]).default("mid"),
        openings:        z.number().min(1).default(1),
        description:     z.string().optional(),
        requirements:    z.string().optional(),
        niceToHave:      z.string().optional(),
        salaryMin:       z.number().optional(),
        salaryMax:       z.number().optional(),
        targetDate:      z.string().optional(),
        hiringManagerId: z.string().uuid().optional(),
        recruiterId:     z.string().uuid().optional(),
        /** When false (default), requisition is draft until published — industry-standard approval gate. */
        publishImmediately: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const { publishImmediately, targetDate, ...fields } = input;
        const [last] = await db.select({ n: count() }).from(jobRequisitions).where(eq(jobRequisitions.orgId, org!.id));
        const num = `REQ-${String((last?.n ?? 0) + 1).padStart(4, "0")}`;
        const [row] = await db.insert(jobRequisitions).values({
          ...fields,
          orgId: org!.id,
          number: num,
          status: publishImmediately ? "open" : "draft",
          createdBy: user!.id,
          targetDate: targetDate ? new Date(targetDate) : undefined,
        }).returning();
        return row;
      }),

    update: permissionProcedure("recruitment", "write")
      .input(z.object({
        id:          z.string().uuid(),
        title:       z.string().optional(),
        status:      z.enum(["draft","open","on_hold","closed","cancelled"]).optional(),
        department:  z.string().optional(),
        description: z.string().optional(),
        requirements: z.string().optional(),
        openings:    z.number().optional(),
        salaryMin:   z.number().optional(),
        salaryMax:   z.number().optional(),
        targetDate:  z.string().optional(),
        recruiterId: z.string().uuid().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, targetDate, ...rest } = input;
        const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
        if (targetDate !== undefined) patch.targetDate = targetDate ? new Date(targetDate) : null;
        Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
        const [row] = await db.update(jobRequisitions)
          .set(patch as any)
          .where(and(eq(jobRequisitions.id, id), eq(jobRequisitions.orgId, org!.id)))
          .returning();
        return row;
      }),
  }),

  // ── Candidates ──────────────────────────────────────────────────────────────

  candidates: router({
    list: permissionProcedure("recruitment", "read")
      .input(z.object({ search: z.string().optional(), jobId: z.string().uuid().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        if (input.jobId) {
          return db.select({ candidate: candidates, application: candidateApplications })
            .from(candidates)
            .innerJoin(candidateApplications, and(
              eq(candidateApplications.candidateId, candidates.id),
              eq(candidateApplications.jobId, input.jobId),
            ))
            .where(eq(candidates.orgId, org!.id))
            .orderBy(desc(candidateApplications.appliedAt));
        }
        const rows = await db.select().from(candidates)
          .where(eq(candidates.orgId, org!.id)).orderBy(desc(candidates.createdAt));
        if (input.search) {
          const q = input.search.toLowerCase();
          return rows.filter((r: any) =>
            `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            (r.currentTitle ?? "").toLowerCase().includes(q),
          );
        }
        return rows;
      }),

    get: permissionProcedure("recruitment", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [cand] = await db.select().from(candidates)
          .where(and(eq(candidates.id, input.id), eq(candidates.orgId, org!.id)));
        if (!cand) throw new TRPCError({ code: "NOT_FOUND" });
        const apps = await db.select({
          application: candidateApplications,
          job: jobRequisitions,
        })
          .from(candidateApplications)
          .innerJoin(jobRequisitions, eq(jobRequisitions.id, candidateApplications.jobId))
          .where(eq(candidateApplications.candidateId, input.id));
        const ivws = await db.select().from(interviews)
          .where(inArray(interviews.applicationId, apps.map((a: any) => a.application.id)))
          .orderBy(desc(interviews.scheduledAt));
        return { candidate: cand, applications: apps, interviews: ivws };
      }),

    create: permissionProcedure("recruitment", "write")
      .input(z.object({
        firstName:    z.string().min(1),
        lastName:     z.string().min(1),
        email:        z.string().email(),
        phone:        z.string().optional(),
        location:     z.string().optional(),
        currentTitle: z.string().optional(),
        currentCo:    z.string().optional(),
        experience:   z.number().optional(),
        skills:       z.array(z.string()).default([]),
        resumeUrl:    z.string().optional(),
        linkedinUrl:  z.string().optional(),
        source:       z.string().optional(),
        notes:        z.string().optional(),
        jobId:        z.string().uuid().optional(),  // directly apply to a job
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { jobId, ...candData } = input;
        const [cand] = await db.insert(candidates).values({
          ...candData,
          orgId: org!.id,
          source: (candData.source as any) ?? "other",
        }).returning();
        if (jobId) {
          const [existing] = await db.select({ id: candidateApplications.id }).from(candidateApplications)
            .where(and(
              eq(candidateApplications.candidateId, cand.id),
              eq(candidateApplications.jobId, jobId),
              eq(candidateApplications.orgId, org!.id),
            ));
          if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: "This candidate already has an application for this job." });
          }
          await db.insert(candidateApplications).values({
            orgId: org!.id, candidateId: cand.id, jobId, stage: "applied",
          });
        }
        return cand;
      }),

    update: permissionProcedure("recruitment", "write")
      .input(z.object({
        id:         z.string().uuid(),
        firstName:  z.string().optional(),
        lastName:   z.string().optional(),
        phone:      z.string().optional(),
        currentTitle: z.string().optional(),
        currentCo:  z.string().optional(),
        experience: z.number().optional(),
        skills:     z.array(z.string()).optional(),
        notes:      z.string().optional(),
        tags:       z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...rest } = input;
        const [row] = await db.update(candidates)
          .set({ ...rest, updatedAt: new Date() })
          .where(and(eq(candidates.id, id), eq(candidates.orgId, org!.id)))
          .returning();
        return row;
      }),
  }),

  // ── Applications / Pipeline ─────────────────────────────────────────────────

  applications: router({
    pipeline: permissionProcedure("recruitment", "read")
      .input(z.object({ jobId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const apps = await db.select({
          application: candidateApplications,
          candidate: candidates,
        })
          .from(candidateApplications)
          .innerJoin(candidates, eq(candidates.id, candidateApplications.candidateId))
          .where(and(
            eq(candidateApplications.jobId, input.jobId),
            eq(candidateApplications.orgId, org!.id),
          ))
          .orderBy(desc(candidateApplications.stageUpdatedAt));
        const byStage: Record<string, typeof apps> = {};
        for (const stage of STAGE_ORDER) byStage[stage] = [];
        byStage["rejected"] = [];
        for (const a of apps) (byStage[a.application.stage] ??= []).push(a);
        return { byStage, total: apps.length };
      }),

    moveStage: permissionProcedure("recruitment", "write")
      .input(z.object({
        applicationId: z.string().uuid(),
        stage:         z.enum(["applied","screening","phone_screen","technical","panel","hr_round","offer","hired","rejected","withdrawn"]),
        feedback:      z.string().optional(),
        rejectionReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const updates: Record<string, any> = {
          stage: input.stage,
          stageUpdatedAt: new Date(),
          updatedAt: new Date(),
        };
        if (input.feedback) updates.feedback = input.feedback;
        if (input.rejectionReason) updates.rejectionReason = input.rejectionReason;
        if (input.stage === "hired") updates.hiredAt = new Date();
        const [app] = await db.update(candidateApplications)
          .set(updates)
          .where(and(eq(candidateApplications.id, input.applicationId), eq(candidateApplications.orgId, org!.id)))
          .returning();
        if (input.stage === "hired") {
          const [req] = await db.select().from(jobRequisitions)
            .where(and(eq(jobRequisitions.id, app.jobId), eq(jobRequisitions.orgId, org!.id)));
          if (req && req.filled < req.openings) {
            await db.update(jobRequisitions)
              .set({ filled: sql`${jobRequisitions.filled} + 1`, updatedAt: new Date() })
              .where(eq(jobRequisitions.id, app.jobId));
          }
        }
        return app;
      }),

    rate: permissionProcedure("recruitment", "write")
      .input(z.object({ applicationId: z.string().uuid(), rating: z.number().min(1).max(5), feedback: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db.update(candidateApplications)
          .set({ rating: input.rating, feedback: input.feedback, updatedAt: new Date() })
          .where(and(eq(candidateApplications.id, input.applicationId), eq(candidateApplications.orgId, org!.id)))
          .returning();
        return row;
      }),
  }),

  // ── Interviews ──────────────────────────────────────────────────────────────

  interviews: router({
    list: permissionProcedure("recruitment", "read")
      .input(z.object({ applicationId: z.string().uuid().optional(), upcoming: z.boolean().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(interviews.orgId, org!.id)];
        if (input.applicationId) conds.push(eq(interviews.applicationId, input.applicationId));
        if (input.upcoming) conds.push(sql`${interviews.scheduledAt} >= NOW()`);
        return db.select().from(interviews).where(and(...conds)).orderBy(asc(interviews.scheduledAt));
      }),

    schedule: permissionProcedure("recruitment", "write")
      .input(z.object({
        applicationId: z.string().uuid(),
        type:          z.enum(["phone","video","onsite","technical","case_study","hr"]).default("video"),
        title:         z.string().min(2),
        scheduledAt:   z.string(),
        durationMins:  z.number().default(60),
        location:      z.string().optional(),
        meetingLink:   z.string().optional(),
        interviewers:  z.array(z.string().uuid()).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [row] = await db.insert(interviews).values({
          ...input,
          orgId: org!.id,
          status: "scheduled",
          scheduledAt: new Date(input.scheduledAt),
          createdBy: user!.id,
        }).returning();
        return row;
      }),

    complete: permissionProcedure("recruitment", "write")
      .input(z.object({
        id:            z.string().uuid(),
        overallRating: z.number().min(1).max(5).optional(),
        decision:      z.enum(["strong_yes","yes","no","strong_no"]).optional(),
        notes:         z.string().optional(),
        scorecard:     z.record(z.unknown()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...rest } = input;
        const [row] = await db.update(interviews)
          .set({ ...rest, status: "completed", updatedAt: new Date() })
          .where(and(eq(interviews.id, id), eq(interviews.orgId, org!.id)))
          .returning();
        return row;
      }),

    cancel: permissionProcedure("recruitment", "write")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db.update(interviews)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(eq(interviews.id, input.id), eq(interviews.orgId, org!.id)))
          .returning();
        return row;
      }),
  }),

  // ── Offers ──────────────────────────────────────────────────────────────────

  offers: router({
    list: permissionProcedure("recruitment", "read")
      .input(z.object({ status: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(jobOffers.orgId, org!.id)];
        if (input.status) conds.push(eq(jobOffers.status, input.status as any));
        return db.select().from(jobOffers).where(and(...conds)).orderBy(desc(jobOffers.createdAt));
      }),

    create: permissionProcedure("recruitment", "write")
      .input(z.object({
        applicationId: z.string().uuid(),
        candidateId:   z.string().uuid(),
        title:         z.string().min(2),
        department:    z.string().optional(),
        baseSalary:    z.number().optional(),
        variablePay:   z.number().optional(),
        joiningBonus:  z.number().optional(),
        currency:      z.string().default("INR"),
        startDate:     z.string().optional(),
        expiryDate:    z.string().optional(),
        components:    z.record(z.unknown()).optional(),
        notes:         z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [row] = await db.insert(jobOffers).values({
          ...input,
          orgId: org!.id,
          status: "draft",
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          createdBy: user!.id,
        }).returning();
        return row;
      }),

    updateStatus: permissionProcedure("recruitment", "write")
      .input(z.object({
        id:     z.string().uuid(),
        status: z.enum(["draft","sent","accepted","declined","expired","revoked"]),
        notes:  z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const updates: Record<string, any> = { status: input.status, updatedAt: new Date() };
        if (input.notes) updates.notes = input.notes;
        if (input.status === "sent") updates.sentAt = new Date();
        if (["accepted","declined"].includes(input.status)) updates.respondedAt = new Date();
        const [row] = await db.update(jobOffers)
          .set(updates)
          .where(and(eq(jobOffers.id, input.id), eq(jobOffers.orgId, org!.id)))
          .returning();
        return row;
      }),
  }),

  // ── Analytics ───────────────────────────────────────────────────────────────

  analytics: permissionProcedure("recruitment", "read")
    .input(z.object({ days: z.number().default(90) }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const since = new Date(Date.now() - input.days * 86400000).toISOString();

      const [openReqs]  = await db.select({ n: count() }).from(jobRequisitions)
        .where(and(eq(jobRequisitions.orgId, org!.id), eq(jobRequisitions.status, "open")));
      const [totalApps] = await db.select({ n: count() }).from(candidateApplications)
        .where(and(eq(candidateApplications.orgId, org!.id), sql`${candidateApplications.appliedAt} >= ${since}::timestamptz`));
      const [hired]     = await db.select({ n: count() }).from(candidateApplications)
        .where(and(eq(candidateApplications.orgId, org!.id), eq(candidateApplications.stage, "hired"), sql`${candidateApplications.hiredAt} >= ${since}::timestamptz`));
      const [rejected]  = await db.select({ n: count() }).from(candidateApplications)
        .where(and(eq(candidateApplications.orgId, org!.id), eq(candidateApplications.stage, "rejected"), sql`${candidateApplications.stageUpdatedAt} >= ${since}::timestamptz`));

      const byStage = await db.select({ stage: candidateApplications.stage, n: count() })
        .from(candidateApplications).where(eq(candidateApplications.orgId, org!.id))
        .groupBy(candidateApplications.stage);
      const bySource = await db.select({ source: candidates.source, n: count() })
        .from(candidates).where(eq(candidates.orgId, org!.id)).groupBy(candidates.source);
      const byDept = await db.select({ department: jobRequisitions.department, n: count() })
        .from(jobRequisitions)
        .where(and(eq(jobRequisitions.orgId, org!.id), eq(jobRequisitions.status, "open")))
        .groupBy(jobRequisitions.department);

      const conversionRate = totalApps.n > 0 ? Math.round((hired.n / totalApps.n) * 100) : 0;

      return {
        openReqs: openReqs.n,
        totalApplications: totalApps.n,
        hired: hired.n,
        rejected: rejected.n,
        conversionRate,
        byStage,
        bySource,
        byDept,
      };
    }),
});
