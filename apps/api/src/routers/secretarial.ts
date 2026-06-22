import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  boardMeetings, boardResolutions, secretarialFilings,
  shareCapital, esopGrants, companyDirectors,
  eq, and, desc, asc, count, sql,
} from "@coheronconnect/db";

export const secretarialRouter = router({

  // ── Board Meetings ──────────────────────────────────────────────────────────

  meetings: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({
        status: z.string().optional(),
        type: z.string().optional(),
        upcoming: z.boolean().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(boardMeetings.orgId, org!.id)];
        if (input.status) conds.push(eq(boardMeetings.status, input.status as any));
        if (input.type)   conds.push(eq(boardMeetings.type, input.type as any));
        if (input.upcoming) conds.push(sql`${boardMeetings.scheduledAt} >= NOW()`);
        return db.select().from(boardMeetings).where(and(...conds))
          .orderBy(desc(boardMeetings.scheduledAt));
      }),

    get: permissionProcedure("secretarial", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [mtg] = await db.select().from(boardMeetings)
          .where(and(eq(boardMeetings.id, input.id), eq(boardMeetings.orgId, org!.id)));
        if (!mtg) throw new TRPCError({ code: "NOT_FOUND" });
        const resolutions = await db.select().from(boardResolutions)
          .where(eq(boardResolutions.meetingId, input.id)).orderBy(asc(boardResolutions.number));
        return { meeting: mtg, resolutions };
      }),

    create: permissionProcedure("secretarial", "write")
      .input(z.object({
        type:         z.enum(["board","audit_committee","nomination_committee","compensation_committee","agm","egm","creditors"]).default("board"),
        title:        z.string().min(2),
        scheduledAt:  z.string(),
        duration:     z.number().default(120),
        venue:        z.string().optional(),
        videoLink:    z.string().optional(),
        agenda:       z.array(z.object({ item: z.string(), presenter: z.string().optional(), durationMins: z.number().optional() })).default([]),
        chairpersonId: z.string().uuid().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const { chairpersonId, scheduledAt, ...rest } = input;
        const [last] = await db.select({ n: count() }).from(boardMeetings).where(eq(boardMeetings.orgId, org!.id));
        const year = new Date().getFullYear();
        const num = `BM-${year}-${String((last?.n ?? 0) + 1).padStart(3, "0")}`;
        const [row] = await db.insert(boardMeetings).values({
          ...rest,
          chairperson: chairpersonId ?? null,
          orgId: org!.id,
          number: num,
          status: "scheduled",
          scheduledAt: new Date(scheduledAt),
          createdBy: user!.id,
        }).returning();
        return row;
      }),

    updateStatus: permissionProcedure("secretarial", "write")
      .input(z.object({
        id:        z.string().uuid(),
        status:    z.enum(["scheduled","in_progress","completed","cancelled","adjourned"]),
        quorumMet: z.boolean().optional(),
        minutesDraft: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...rest } = input;
        const [row] = await db.update(boardMeetings)
          .set({ ...rest, updatedAt: new Date() })
          .where(and(eq(boardMeetings.id, id), eq(boardMeetings.orgId, org!.id))).returning();
        return row;
      }),
  }),

  // ── Resolutions ─────────────────────────────────────────────────────────────

  resolutions: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({ meetingId: z.string().uuid().optional(), status: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(boardResolutions.orgId, org!.id)];
        if (input.meetingId) conds.push(eq(boardResolutions.meetingId, input.meetingId));
        if (input.status) conds.push(eq(boardResolutions.status, input.status as any));
        return db.select().from(boardResolutions).where(and(...conds)).orderBy(desc(boardResolutions.passedAt));
      }),

    create: permissionProcedure("secretarial", "write")
      .input(z.object({
        meetingId: z.string().uuid().optional(),
        type:      z.enum(["ordinary","special","board","circular"]).default("board"),
        title:     z.string().min(2),
        body:      z.string().min(5),
        tags:      z.array(z.string()).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const [last] = await db.select({ n: count() }).from(boardResolutions).where(eq(boardResolutions.orgId, org!.id));
        const year = new Date().getFullYear();
        const num = `BR-${year}-${String((last?.n ?? 0) + 1).padStart(4, "0")}`;
        const [row] = await db.insert(boardResolutions).values({
          ...input,
          orgId: org!.id,
          number: num,
          status: "draft",
          createdBy: user!.id,
        }).returning();
        return row;
      }),

    pass: permissionProcedure("secretarial", "write")
      .input(z.object({
        id:           z.string().uuid(),
        votesFor:     z.number().default(0),
        votesAgainst: z.number().default(0),
        abstentions:  z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { id, ...rest } = input;
        const [row] = await db.update(boardResolutions)
          .set({ ...rest, status: "passed", passedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(boardResolutions.id, id), eq(boardResolutions.orgId, org!.id))).returning();
        return row;
      }),
  }),

  // ── MCA / ROC Filings ───────────────────────────────────────────────────────

  filings: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({ status: z.string().optional(), fy: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(secretarialFilings.orgId, org!.id)];
        if (input.status) conds.push(eq(secretarialFilings.status, input.status as any));
        if (input.fy) conds.push(eq(secretarialFilings.fy, input.fy));
        return db.select().from(secretarialFilings).where(and(...conds)).orderBy(asc(secretarialFilings.dueDate));
      }),

    create: permissionProcedure("secretarial", "write")
      .input(z.object({
        formNumber: z.string().min(1),
        title:      z.string().min(2),
        authority:  z.string().min(1),
        category:   z.string().min(1),
        dueDate:    z.string(),
        fy:         z.string().optional(),
        fees:       z.number().optional(),
        assignedTo: z.string().uuid().optional(),
        notes:      z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db.insert(secretarialFilings).values({
          ...input,
          orgId: org!.id,
          status: "upcoming",
          dueDate: new Date(input.dueDate),
        }).returning();
        return row;
      }),

    markFiled: permissionProcedure("secretarial", "write")
      .input(z.object({ id: z.string().uuid(), srn: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db.update(secretarialFilings)
          .set({ status: "filed", filedAt: new Date(), srn: input.srn, notes: input.notes, updatedAt: new Date() })
          .where(and(eq(secretarialFilings.id, input.id), eq(secretarialFilings.orgId, org!.id))).returning();
        return row;
      }),

    upcomingAlerts: permissionProcedure("secretarial", "read")
      .query(async ({ ctx }) => {
        const { db, org } = ctx;
        const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString();
        return db.select().from(secretarialFilings)
          .where(and(
            eq(secretarialFilings.orgId, org!.id),
            sql`${secretarialFilings.dueDate} <= ${thirtyDays}::timestamptz`,
            sql`${secretarialFilings.status} IN ('upcoming','in_progress')`,
          ))
          .orderBy(asc(secretarialFilings.dueDate));
      }),

    seed: permissionProcedure("secretarial", "write")
      .input(z.object({ financialYear: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const fy = input.financialYear;
        const parts = fy.split("-");
        let year = parseInt(parts[1] || (parseInt(parts[0] || "2024") + 1).toString());
        if (year < 100) year += 2000;

        const standardFilings = [
          {
            formNumber: "MGT-7",
            title: "Annual Return",
            authority: "MCA (ROC)",
            category: "annual_return",
            dueDate: new Date(year - 1, 10, 29), // 29th Nov (60 days from Sep 30 AGM)
            fy,
            notes: "Filing of annual return by companies as per Section 92(1) of Companies Act, 2013",
          },
          {
            formNumber: "AOC-4",
            title: "Financial Statements",
            authority: "MCA (ROC)",
            category: "financial_statement",
            dueDate: new Date(year - 1, 9, 30), // 30th Oct (30 days from Sep 30 AGM)
            fy,
            notes: "Filing of audited financial statements as per Section 137 of Companies Act, 2013",
          },
          {
            formNumber: "ADT-1",
            title: "Auditor Appointment",
            authority: "MCA (ROC)",
            category: "auditor_appointment",
            dueDate: new Date(year - 1, 9, 15), // 15th Oct (15 days from Sep 30 AGM)
            fy,
            notes: "Intimation of appointment of auditor as per Section 139(1) of Companies Act, 2013",
          },
          {
            formNumber: "DIR-3 KYC",
            title: "Director KYC",
            authority: "MCA",
            category: "director_kyc",
            dueDate: new Date(year - 1, 8, 30), // 30th Sep
            fy,
            notes: "Annual KYC of Directors holding DIN as on 31st March",
          },
          {
            formNumber: "MSME-1",
            title: "MSME Return (H1)",
            authority: "MCA",
            category: "msme_return",
            dueDate: new Date(year - 1, 9, 31), // 31st Oct
            fy,
            notes: "Details of outstanding dues to MSME suppliers (April - Sept)",
          },
          {
            formNumber: "MSME-1",
            title: "MSME Return (H2)",
            authority: "MCA",
            category: "msme_return",
            dueDate: new Date(year, 3, 30), // 30th April
            fy,
            notes: "Details of outstanding dues to MSME suppliers (Oct - March)",
          },
          {
            formNumber: "DPT-3",
            title: "Return of Deposits",
            authority: "MCA",
            category: "deposit_return",
            dueDate: new Date(year, 5, 30), // 30th June
            fy,
            notes: "Return of deposits or information not considered as deposit as per Companies Act, 2013",
          },
        ];

        let seeded = 0;
        for (const f of standardFilings) {
          const [existing] = await db.select().from(secretarialFilings)
            .where(and(
              eq(secretarialFilings.orgId, org!.id),
              eq(secretarialFilings.formNumber, f.formNumber),
              eq(secretarialFilings.fy, f.fy),
              eq(secretarialFilings.title, f.title),
            ));
          
          if (!existing) {
            await db.insert(secretarialFilings).values({
              orgId: org!.id,
              status: "upcoming",
              ...f,
            }).returning();
            seeded++;
          }
        }

        return { seeded };
      }),
  }),

  // ── Share Capital ───────────────────────────────────────────────────────────

  shares: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({ shareClass: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(shareCapital.orgId, org!.id)];
        if (input.shareClass) conds.push(eq(shareCapital.shareClass, input.shareClass as any));
        return db.select().from(shareCapital).where(and(...conds)).orderBy(shareCapital.folio);
      }),

    summary: permissionProcedure("secretarial", "read")
      .query(async ({ ctx }) => {
        const { db, org } = ctx;
        const rows = await db.select({
          shareClass: shareCapital.shareClass,
          holders: count(),
          totalQty: sql<number>`sum(${shareCapital.quantity})`,
        })
          .from(shareCapital).where(eq(shareCapital.orgId, org!.id))
          .groupBy(shareCapital.shareClass);
        return rows;
      }),

    create: permissionProcedure("secretarial", "write")
      .input(z.object({
        holderName:   z.string().min(1),
        holderType:   z.string().default("individual"),
        shareClass:   z.enum(["equity","preference","esop_pool","convertible"]).default("equity"),
        nominalValue: z.number().default(10),
        quantity:     z.number().min(1),
        pan:          z.string().optional(),
        address:      z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [last] = await db.select({ n: count() }).from(shareCapital).where(eq(shareCapital.orgId, org!.id));
        const folio = `SH-${String((last?.n ?? 0) + 1).padStart(4, "0")}`;
        const [row] = await db.insert(shareCapital).values({ ...input, orgId: org!.id, folio }).returning();
        return row;
      }),
  }),

  // ── ESOP ────────────────────────────────────────────────────────────────────

  esop: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({ event: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(esopGrants.orgId, org!.id)];
        if (input.event) conds.push(eq(esopGrants.event, input.event as any));
        return db.select().from(esopGrants).where(and(...conds)).orderBy(desc(esopGrants.grantDate));
      }),

    summary: permissionProcedure("secretarial", "read")
      .query(async ({ ctx }) => {
        const { db, org } = ctx;
        const rows = await db.select({
          event: esopGrants.event,
          count: count(),
          totalOptions: sql<number>`sum(${esopGrants.options})`,
        })
          .from(esopGrants).where(eq(esopGrants.orgId, org!.id))
          .groupBy(esopGrants.event);
        return rows;
      }),

    grant: permissionProcedure("secretarial", "write")
      .input(z.object({
        employeeId:    z.string().uuid().optional(),
        employeeName:  z.string().min(1),
        options:       z.number().min(1),
        exercisePrice: z.number().min(0),
        grantDate:     z.string(),
        vestingStart:  z.string().optional(),
        vestingEnd:    z.string().optional(),
        notes:         z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [last] = await db.select({ n: count() }).from(esopGrants).where(eq(esopGrants.orgId, org!.id));
        const num = `ESOP-${String((last?.n ?? 0) + 1).padStart(4, "0")}`;
        const [row] = await db.insert(esopGrants).values({
          ...input,
          orgId: org!.id,
          event: "grant",
          grantNumber: num,
          grantDate: new Date(input.grantDate),
          vestingStart: input.vestingStart ? new Date(input.vestingStart) : undefined,
          vestingEnd: input.vestingEnd ? new Date(input.vestingEnd) : undefined,
        }).returning();
        return row;
      }),
  }),

  // ── Directors ───────────────────────────────────────────────────────────────

  directors: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({ activeOnly: z.boolean().default(true) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conds = [eq(companyDirectors.orgId, org!.id)];
        if (input.activeOnly) conds.push(eq(companyDirectors.isActive, true));
        return db.select().from(companyDirectors).where(and(...conds)).orderBy(companyDirectors.name);
      }),

    create: permissionProcedure("secretarial", "write")
      .input(z.object({
        name:        z.string().min(2),
        din:         z.string().min(8),
        designation: z.string().min(2),
        category:    z.string().default("non_executive"),
        pan:         z.string().optional(),
        email:       z.string().email().optional(),
        phone:       z.string().optional(),
        appointedAt: z.string().optional(),
        address:     z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db.insert(companyDirectors).values({
          ...input,
          orgId: org!.id,
          isActive: true,
          appointedAt: input.appointedAt ? new Date(input.appointedAt) : undefined,
        }).returning();
        return row;
      }),

    updateKyc: permissionProcedure("secretarial", "write")
      .input(z.object({ id: z.string().uuid(), kyc: z.enum(["pending","filed","expired"]), kycDueDate: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db.update(companyDirectors)
          .set({ kyc: input.kyc, kycDueDate: input.kycDueDate ? new Date(input.kycDueDate) : undefined, updatedAt: new Date() })
          .where(and(eq(companyDirectors.id, input.id), eq(companyDirectors.orgId, org!.id))).returning();
        return row;
      }),
  }),

  // ── Dashboard Overview ──────────────────────────────────────────────────────

  overview: permissionProcedure("secretarial", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      const today = new Date().toISOString();
      const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString();

      const [upcomingMeetings] = await db.select({ n: count() }).from(boardMeetings)
        .where(and(eq(boardMeetings.orgId, org!.id), sql`${boardMeetings.scheduledAt} >= ${today}::timestamptz`, eq(boardMeetings.status, "scheduled")));
      const [pendingResolutions] = await db.select({ n: count() }).from(boardResolutions)
        .where(and(eq(boardResolutions.orgId, org!.id), eq(boardResolutions.status, "draft")));
      const [overdueFilings] = await db.select({ n: count() }).from(secretarialFilings)
        .where(and(eq(secretarialFilings.orgId, org!.id), eq(secretarialFilings.status, "overdue")));
      const [upcomingFilings] = await db.select({ n: count() }).from(secretarialFilings)
        .where(and(
          eq(secretarialFilings.orgId, org!.id),
          sql`${secretarialFilings.dueDate} <= ${thirtyDays}::timestamptz`,
          sql`${secretarialFilings.status} IN ('upcoming','in_progress')`,
        ));
      const [totalDirectors] = await db.select({ n: count() }).from(companyDirectors)
        .where(and(eq(companyDirectors.orgId, org!.id), eq(companyDirectors.isActive, true)));
      const [kycExpiring] = await db.select({ n: count() }).from(companyDirectors)
        .where(and(
          eq(companyDirectors.orgId, org!.id),
          eq(companyDirectors.isActive, true),
          sql`${companyDirectors.kycDueDate} <= ${thirtyDays}::timestamptz`,
        ));

      return {
        upcomingMeetings: upcomingMeetings.n,
        pendingResolutions: pendingResolutions.n,
        overdueFilings: overdueFilings.n,
        upcomingFilings: upcomingFilings.n,
        totalDirectors: totalDirectors.n,
        kycExpiring: kycExpiring.n,
      };
    }),
});
