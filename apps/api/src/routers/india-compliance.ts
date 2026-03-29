import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  complianceCalendarItems,
  directors,
  portalUsers,
  tdsChallanRecords,
  epfoEcrSubmissions,
  eq,
  and,
  desc,
  gte,
  lte,
  sql,
} from "@nexusops/db";

export const indiaComplianceRouter = router({
  // ── Compliance Calendar ──────────────────────────────────────────────────
  calendar: router({
    list: permissionProcedure("secretarial", "read")
      .input(
        z.object({
          status: z.string().optional(),
          financialYear: z.string().optional(),
          daysAhead: z.number().int().positive().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(complianceCalendarItems.orgId, org!.id)];
        if (input.status) {
          conditions.push(eq(complianceCalendarItems.status, input.status as any));
        }
        if (input.financialYear) {
          conditions.push(eq(complianceCalendarItems.financialYear, input.financialYear));
        }
        if (input.daysAhead) {
          const future = new Date();
          future.setDate(future.getDate() + input.daysAhead);
          conditions.push(lte(complianceCalendarItems.dueDate, future));
        }
        return db
          .select()
          .from(complianceCalendarItems)
          .where(and(...conditions))
          .orderBy(complianceCalendarItems.dueDate);
      }),

    create: permissionProcedure("secretarial", "write")
      .input(
        z.object({
          complianceType: z.enum(["annual", "event_based", "monthly", "quarterly"]).default("annual"),
          eventName: z.string().min(1),
          mcaForm: z.string().optional(),
          financialYear: z.string().optional(),
          dueDate: z.coerce.date(),
          penaltyPerDayInr: z.number().min(0).default(100),
          assignedToId: z.string().uuid().optional(),
          notes: z.string().optional(),
          reminderDaysBefore: z.array(z.number()).default([30, 15, 7, 1]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [item] = await db
          .insert(complianceCalendarItems)
          .values({ orgId: org!.id, ...input, penaltyPerDayInr: String(input.penaltyPerDayInr) } as any)
          .returning();
        return item;
      }),

    markFiled: permissionProcedure("secretarial", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          filedDate: z.coerce.date(),
          srn: z.string().optional(),
          ackDocumentUrl: z.string().url().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [item] = await db
          .update(complianceCalendarItems)
          .set({
            status: "filed",
            filedDate: input.filedDate,
            srn: input.srn,
            ackDocumentUrl: input.ackDocumentUrl,
            updatedAt: new Date(),
          })
          .where(and(eq(complianceCalendarItems.id, input.id), eq(complianceCalendarItems.orgId, org!.id)))
          .returning();
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return item;
      }),

    updatePenalties: permissionProcedure("secretarial", "write")
      .input(z.object({ financialYear: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const now = new Date();
        const conditions = [
          eq(complianceCalendarItems.orgId, org!.id),
          lte(complianceCalendarItems.dueDate, now),
          eq(complianceCalendarItems.status, "overdue" as any),
        ];
        if (input.financialYear) {
          conditions.push(eq(complianceCalendarItems.financialYear, input.financialYear));
        }

        const overdueItems = await db
          .select()
          .from(complianceCalendarItems)
          .where(and(...conditions));

        let updated = 0;
        for (const item of overdueItems) {
          const daysOverdue = Math.floor((now.getTime() - item.dueDate.getTime()) / (1000 * 60 * 60 * 24));
          const totalPenalty = daysOverdue * Number(item.penaltyPerDayInr);
          await db
            .update(complianceCalendarItems)
            .set({ daysOverdue, totalPenaltyInr: String(totalPenalty), updatedAt: new Date() })
            .where(eq(complianceCalendarItems.id, item.id));
          updated++;
        }
        return { updated };
      }),
  }),

  // ── Directors ────────────────────────────────────────────────────────────
  directors: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({ isActive: z.boolean().optional(), dinKycStatus: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(directors.orgId, org!.id)];
        if (input.isActive !== undefined) conditions.push(eq(directors.isActive, input.isActive));
        if (input.dinKycStatus) conditions.push(eq(directors.dinKycStatus, input.dinKycStatus as any));
        return db.select().from(directors).where(and(...conditions));
      }),

    create: permissionProcedure("secretarial", "write")
      .input(
        z.object({
          din: z.string().length(8).regex(/^\d{8}$/),
          fullName: z.string().min(1),
          pan: z.string().optional(),
          aadhaar: z.string().optional(),
          dateOfBirth: z.coerce.date().optional(),
          directorType: z.enum(["executive", "non_executive", "independent", "nominee"]).default("executive"),
          dateOfAppointment: z.coerce.date().optional(),
          residentialAddress: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { validateDIN, validatePAN } = await import("../lib/india/validators.js");

        const dinValidation = validateDIN(input.din);
        if (!dinValidation.valid) throw new TRPCError({ code: "BAD_REQUEST", message: dinValidation.error });

        if (input.pan) {
          const panValidation = validatePAN(input.pan);
          if (!panValidation.valid) throw new TRPCError({ code: "BAD_REQUEST", message: panValidation.error });
        }

        const [director] = await db
          .insert(directors)
          .values({ orgId: org!.id, ...input, dinKycStatus: "active", isActive: true } as any)
          .returning();
        return director;
      }),

    triggerKYCReminders: permissionProcedure("secretarial", "write")
      .mutation(async ({ ctx }) => {
        const { db, org } = ctx;
        const now = new Date();
        const sept30 = new Date(now.getFullYear(), 8, 30); // September 30
        const msUntilDeadline = sept30.getTime() - now.getTime();
        const daysUntilDeadline = Math.ceil(msUntilDeadline / (1000 * 60 * 60 * 24));

        const activeDirectors = await db
          .select()
          .from(directors)
          .where(and(eq(directors.orgId, org!.id), eq(directors.isActive, true), eq(directors.dinKycStatus, "active")));

        const needsReminder = daysUntilDeadline <= 30 && daysUntilDeadline > 0;
        const isUrgent = daysUntilDeadline <= 7 && daysUntilDeadline > 0;
        const isOverdue = daysUntilDeadline <= 0;

        if (isOverdue) {
          for (const dir of activeDirectors) {
            if (!dir.dinKycLastCompleted || dir.dinKycLastCompleted < sept30) {
              await db
                .update(directors)
                .set({ dinKycStatus: "deactivated", updatedAt: new Date() })
                .where(eq(directors.id, dir.id));
            }
          }
        }

        return {
          daysUntilDeadline,
          directorsCount: activeDirectors.length,
          needsReminder,
          isUrgent,
          isOverdue,
          message: isOverdue
            ? `${activeDirectors.length} director(s) with overdue KYC have been deactivated`
            : needsReminder
            ? `Reminder: DIR-3 KYC due in ${daysUntilDeadline} days for ${activeDirectors.length} director(s)`
            : "No reminders needed at this time",
        };
      }),

    markKYCComplete: permissionProcedure("secretarial", "write")
      .input(z.object({ directorId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [director] = await db
          .update(directors)
          .set({ dinKycStatus: "active", dinKycLastCompleted: new Date(), updatedAt: new Date() })
          .where(and(eq(directors.id, input.directorId), eq(directors.orgId, org!.id)))
          .returning();
        if (!director) throw new TRPCError({ code: "NOT_FOUND" });
        return director;
      }),
  }),

  // ── Portal Users ─────────────────────────────────────────────────────────
  portalUsers: router({
    list: permissionProcedure("csm", "read")
      .input(z.object({ status: z.string().optional(), customerId: z.string().uuid().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(portalUsers.orgId, org!.id)];
        if (input.status) conditions.push(eq(portalUsers.status, input.status as any));
        if (input.customerId) conditions.push(eq(portalUsers.customerId, input.customerId));
        return db
          .select({
            id: portalUsers.id,
            portalUserId: portalUsers.portalUserId,
            fullName: portalUsers.fullName,
            email: portalUsers.email,
            role: portalUsers.role,
            status: portalUsers.status,
            isEmailVerified: portalUsers.isEmailVerified,
            mfaEnabled: portalUsers.mfaEnabled,
            lastLoginAt: portalUsers.lastLoginAt,
            createdAt: portalUsers.createdAt,
          })
          .from(portalUsers)
          .where(and(...conditions))
          .orderBy(desc(portalUsers.createdAt));
      }),

    create: permissionProcedure("csm", "write")
      .input(
        z.object({
          customerId: z.string().uuid().optional(),
          fullName: z.string().min(1),
          email: z.string().email(),
          phone: z.string().optional(),
          role: z.enum(["primary_contact", "secondary_contact", "read_only"]).default("primary_contact"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(portalUsers)
          .where(eq(portalUsers.orgId, org!.id));
        const seq = (countResult?.count ?? 0) + 1;
        const portalUserId = `PRT-${String(seq).padStart(5, "0")}`;

        const [user] = await db
          .insert(portalUsers)
          .values({
            orgId: org!.id,
            portalUserId,
            ...input,
            status: "pending_approval",
            isEmailVerified: false,
            isPhoneVerified: false,
            mfaEnabled: false,
            failedLoginCount: 0,
            isLocked: false,
            isSelfRegistered: false,
            createdByEmployeeId: ctx.user!.id,
          } as any)
          .returning();
        return user;
      }),

    suspend: permissionProcedure("csm", "write")
      .input(z.object({ portalUserId: z.string().uuid(), reason: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [user] = await db
          .update(portalUsers)
          .set({ status: "suspended", lockReason: input.reason, updatedAt: new Date() })
          .where(and(eq(portalUsers.id, input.portalUserId), eq(portalUsers.orgId, org!.id)))
          .returning();
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        return user;
      }),

    unlock: permissionProcedure("csm", "write")
      .input(z.object({ portalUserId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [user] = await db
          .update(portalUsers)
          .set({ isLocked: false, failedLoginCount: 0, lockedAt: null, lockReason: null, updatedAt: new Date() } as any)
          .where(and(eq(portalUsers.id, input.portalUserId), eq(portalUsers.orgId, org!.id)))
          .returning();
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        return user;
      }),
  }),

  // ── TDS Challans ─────────────────────────────────────────────────────────
  tdsChallans: router({
    list: permissionProcedure("hr", "read")
      .input(z.object({ month: z.number().int().optional(), year: z.number().int().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(tdsChallanRecords.orgId, org!.id)];
        if (input.month) conditions.push(eq(tdsChallanRecords.month, input.month));
        if (input.year) conditions.push(eq(tdsChallanRecords.year, input.year));
        return db.select().from(tdsChallanRecords).where(and(...conditions)).orderBy(desc(tdsChallanRecords.createdAt));
      }),

    markPaid: permissionProcedure("hr", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          bsrCode: z.string().min(7).max(7),
          challanSerialNumber: z.string().min(5),
          paymentDate: z.coerce.date(),
          totalDeposited: z.number().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [challan] = await db
          .update(tdsChallanRecords)
          .set({
            bsrCode: input.bsrCode,
            challanSerialNumber: input.challanSerialNumber,
            paymentDate: input.paymentDate,
            totalTdsDeposited: String(input.totalDeposited),
            status: "paid",
          })
          .where(and(eq(tdsChallanRecords.id, input.id), eq(tdsChallanRecords.orgId, org!.id)))
          .returning();
        if (!challan) throw new TRPCError({ code: "NOT_FOUND" });
        return challan;
      }),
  }),

  // ── EPFO ECR ─────────────────────────────────────────────────────────────
  epfoEcr: router({
    list: permissionProcedure("hr", "read")
      .input(z.object({ year: z.number().int().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(epfoEcrSubmissions.orgId, org!.id)];
        if (input.year) conditions.push(eq(epfoEcrSubmissions.year, input.year));
        return db.select().from(epfoEcrSubmissions).where(and(...conditions)).orderBy(desc(epfoEcrSubmissions.createdAt));
      }),

    markSubmitted: permissionProcedure("hr", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          epfoAckNumber: z.string().min(1),
          submittedAt: z.coerce.date(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [ecr] = await db
          .update(epfoEcrSubmissions)
          .set({
            submissionStatus: "submitted",
            epfoAckNumber: input.epfoAckNumber,
            submittedAt: input.submittedAt,
          })
          .where(and(eq(epfoEcrSubmissions.id, input.id), eq(epfoEcrSubmissions.orgId, org!.id)))
          .returning();
        if (!ecr) throw new TRPCError({ code: "NOT_FOUND" });
        return ecr;
      }),
  }),
});
