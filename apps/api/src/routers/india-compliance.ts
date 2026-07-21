import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getTableColumns } from "drizzle-orm";
import {
  complianceCalendarItems,
  directors,
  portalUsers,
  tdsChallanRecords,
  epfoEcrSubmissions,
  esiChallanRecords,
  ptChallanRecords,
  statutoryCeilings,
  statutoryMetricKeyEnum,
  complianceItemStatusEnum,
  complianceTypeEnum,
  dinKycStatusEnum,
  portalUserStatusEnum,
  eq,
  and,
  desc,
  gte,
  lte,
  isNull,
  or,
  sql,
} from "@coheronconnect/db";
import { deriveAadhaar } from "../lib/aadhaar";
import { panColumns } from "../lib/pan";

/**
 * Director columns returned from read paths. Raw Aadhaar is no longer stored (dropped in
 * migration 0037 for DPDP minimisation); only `aadhaarMaskedHash`/`aadhaarMaskedDisplay` and
 * the raw PAN + its masked aids remain, so this mirrors the table.
 */
const directorPublicColumns = getTableColumns(directors);

export const indiaComplianceRouter = router({
  // ── Compliance Calendar ──────────────────────────────────────────────────
  calendar: router({
    list: permissionProcedure("secretarial", "read")
      .input(
        z.object({
          status: z.enum(complianceItemStatusEnum.enumValues).optional(),
          financialYear: z.string().optional(),
          daysAhead: z.number().int().positive().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(complianceCalendarItems.orgId, org!.id)];
        if (input.status) {
          conditions.push(eq(complianceCalendarItems.status, input.status));
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
          .values({ orgId: org!.id, ...input, penaltyPerDayInr: String(input.penaltyPerDayInr) })
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
          eq(complianceCalendarItems.status, "overdue"),
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

    seed: permissionProcedure("secretarial", "write")
      .input(z.object({ financialYear: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const fy = input.financialYear;
        const parts = fy.split("-");
        let year = parseInt(parts[1] || (parseInt(parts[0] || "2024") + 1).toString());
        if (year < 100) year += 2000;

        const standardItems: Array<{
          eventName: string;
          mcaForm?: string;
          complianceType: (typeof complianceTypeEnum.enumValues)[number];
          dueDate: Date;
          penaltyPerDayInr: string;
          notes: string;
        }> = [
          {
            eventName: "DIR-3 KYC (Director KYC)",
            mcaForm: "DIR-3 KYC",
            complianceType: "annual",
            dueDate: new Date(year - 1, 8, 30), // 30th Sep
            penaltyPerDayInr: "5000",
            notes: "Annual KYC for directors holding DIN",
          },
          {
            eventName: "Form MSME-1 (H1)",
            mcaForm: "MSME-1",
            complianceType: "quarterly",
            dueDate: new Date(year - 1, 9, 31),
            penaltyPerDayInr: "100",
            notes: "Details of outstanding dues to MSME suppliers (Apr-Sep)",
          },
          {
            eventName: "Form MSME-1 (H2)",
            mcaForm: "MSME-1",
            complianceType: "quarterly",
            dueDate: new Date(year, 3, 30),
            penaltyPerDayInr: "100",
            notes: "Details of outstanding dues to MSME suppliers (Oct-Mar)",
          },
          {
            eventName: "Form DPT-3 (Return of Deposits)",
            mcaForm: "DPT-3",
            complianceType: "annual",
            dueDate: new Date(year, 5, 30),
            penaltyPerDayInr: "100",
            notes: "Return of deposits and particulars of transactions not considered as deposit",
          },
          {
            eventName: "Form AOC-4 (Financial Statements)",
            mcaForm: "AOC-4",
            complianceType: "annual",
            dueDate: new Date(year - 1, 9, 30),
            penaltyPerDayInr: "100",
            notes: "Filing of audited financial statements with ROC",
          },
          {
            eventName: "Form MGT-7 (Annual Return)",
            mcaForm: "MGT-7",
            complianceType: "annual",
            dueDate: new Date(year - 1, 10, 29),
            penaltyPerDayInr: "100",
            notes: "Filing of annual return with ROC",
          },
          {
            eventName: "Form ADT-1 (Auditor Appointment)",
            mcaForm: "ADT-1",
            complianceType: "event_based",
            dueDate: new Date(year - 1, 9, 15),
            penaltyPerDayInr: "100",
            notes: "Notice to ROC for appointment of auditor",
          },
          {
            eventName: "TDS Payment",
            complianceType: "monthly",
            dueDate: new Date(year - 1, 3, 7), // 7th of every month
            penaltyPerDayInr: "100",
            notes: "Monthly TDS deposit with Income Tax Dept",
          },
          {
            eventName: "GST GSTR-1",
            complianceType: "monthly",
            dueDate: new Date(year - 1, 3, 11), // 11th of every month
            penaltyPerDayInr: "50",
            notes: "Monthly return for outward supplies",
          },
          {
            eventName: "GST GSTR-3B",
            complianceType: "monthly",
            dueDate: new Date(year - 1, 3, 20), // 20th of every month
            penaltyPerDayInr: "50",
            notes: "Monthly summary return and tax payment",
          },
          {
            eventName: "EPF & ESI Deposit",
            complianceType: "monthly",
            dueDate: new Date(year - 1, 3, 15), // 15th of every month
            penaltyPerDayInr: "100",
            notes: "Monthly contribution for EPF and ESI",
          },
        ];

        // For monthly items, generate for all 12 months
        const monthlyItems = standardItems.filter(i => i.complianceType === "monthly");
        const annualItems = standardItems.filter(i => i.complianceType !== "monthly");

        const allItemsToSeed = [...annualItems];
        for (const mi of monthlyItems) {
          for (let m = 0; m < 12; m++) {
            const itemDate = new Date(year - 1, 3 + m, mi.dueDate.getDate());
            allItemsToSeed.push({
              ...mi,
              eventName: `${mi.eventName} - ${itemDate.toLocaleString('default', { month: 'long' })} ${itemDate.getFullYear()}`,
              dueDate: itemDate,
            });
          }
        }

        let seeded = 0;
        for (const item of allItemsToSeed) {
          // Check if already exists for this org/fy/form
          const [existing] = await db
            .select()
            .from(complianceCalendarItems)
            .where(
              and(
                eq(complianceCalendarItems.orgId, org!.id),
                eq(complianceCalendarItems.financialYear, fy),
                eq(complianceCalendarItems.eventName, item.eventName),
              ),
            );

          if (!existing) {
            await db.insert(complianceCalendarItems).values({
              orgId: org!.id,
              financialYear: fy,
              ...item,
            });
            seeded++;
          }
        }

        return { seeded };
      }),
  }),

  // ── Directors ────────────────────────────────────────────────────────────
  directors: router({
    list: permissionProcedure("secretarial", "read")
      .input(z.object({ isActive: z.boolean().optional(), dinKycStatus: z.enum(dinKycStatusEnum.enumValues).optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(directors.orgId, org!.id)];
        if (input.isActive !== undefined) conditions.push(eq(directors.isActive, input.isActive));
        if (input.dinKycStatus) conditions.push(eq(directors.dinKycStatus, input.dinKycStatus));
        return db.select(directorPublicColumns).from(directors).where(and(...conditions));
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
        const { validateDIN } = await import("../lib/india/validators.js");

        const dinValidation = validateDIN(input.din);
        if (!dinValidation.valid) throw new TRPCError({ code: "BAD_REQUEST", message: dinValidation.error });

        // DPDP Aadhaar minimisation: never persist raw Aadhaar. Derive a one-way hash +
        // visual mask and drop the raw value before insert. (`aadhaar` and `pan` are
        // intentionally pulled out of the spread below.)
        const { aadhaar: rawAadhaar, pan: rawPan, ...directorInput } = input;
        let aadhaarMaskedHash: string | undefined;
        let aadhaarMaskedDisplay: string | undefined;
        if (rawAadhaar) {
          const derived = deriveAadhaar(rawAadhaar);
          if ("error" in derived) throw new TRPCError({ code: "BAD_REQUEST", message: derived.error });
          aadhaarMaskedHash = derived.hash;
          aadhaarMaskedDisplay = derived.masked;
        }

        // DPDP PAN minimisation: keep raw PAN (statutory filing) + stamp the match hash/display.
        // panColumns validates and throws on an invalid PAN; surface it as BAD_REQUEST.
        let panCols: ReturnType<typeof panColumns>;
        try {
          panCols = panColumns(rawPan);
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message });
        }

        const [director] = await db
          .insert(directors)
          .values({
            orgId: org!.id,
            ...directorInput,
            ...panCols,
            aadhaarMaskedHash,
            aadhaarMaskedDisplay,
            dinKycStatus: "active",
            isActive: true,
          })
          .returning();
        return director;
      }),

    triggerKYCReminders: permissionProcedure("secretarial", "write")
      .input(z.object({}).optional())
      .mutation(async ({ ctx }) => {
        const { db, org } = ctx;
        const now = new Date();
        const sept30 = new Date(now.getFullYear(), 8, 30); // September 30
        const msUntilDeadline = sept30.getTime() - now.getTime();
        const daysUntilDeadline = Math.ceil(msUntilDeadline / (1000 * 60 * 60 * 24));

        const activeDirectors = await db
          .select(directorPublicColumns)
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
      .input(z.object({ status: z.enum(portalUserStatusEnum.enumValues).optional(), customerId: z.string().uuid().optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(portalUsers.orgId, org!.id)];
        if (input.status) conditions.push(eq(portalUsers.status, input.status));
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
          })
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
          .set({ isLocked: false, failedLoginCount: 0, lockedAt: null, lockReason: null, updatedAt: new Date() })
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

  // ── Statutory Ceilings (G1: versioned PF/ESI/PT/LWF config) ───────────────
  statutoryCeilings: router({
    list: permissionProcedure("hr", "read")
      .input(
        z
          .object({ metricKey: z.enum(statutoryMetricKeyEnum.enumValues).optional() })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [
          or(eq(statutoryCeilings.orgId, org!.id), isNull(statutoryCeilings.orgId)),
        ];
        if (input?.metricKey) {
          conditions.push(eq(statutoryCeilings.metricKey, input.metricKey));
        }
        return db
          .select()
          .from(statutoryCeilings)
          .where(and(...conditions))
          .orderBy(desc(statutoryCeilings.effectiveFrom));
      }),

    upsert: permissionProcedure("hr", "write")
      .input(
        z
          .object({
            metricKey: z.enum(statutoryMetricKeyEnum.enumValues),
            stateCode: z.string().min(1).optional(),
            value: z.number().nonnegative().optional(),
            slabsJson: z.record(z.string(), z.unknown()).optional(),
            effectiveFrom: z.coerce.date(),
            effectiveTo: z.coerce.date().optional(),
            sourceRef: z.string().optional(),
          })
          .refine(
            (v) =>
              v.metricKey === "pt_slab" || v.metricKey === "lwf_rate"
                ? v.slabsJson !== undefined && !!v.stateCode
                : v.value !== undefined,
            {
              message:
                "pt_slab/lwf_rate require stateCode + slabsJson; pf/esi ceilings require value.",
            },
          ),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [row] = await db
          .insert(statutoryCeilings)
          .values({
            orgId: org!.id,
            metricKey: input.metricKey,
            stateCode: input.stateCode ?? null,
            value: input.value !== undefined ? String(input.value) : null,
            slabsJson: input.slabsJson ?? null,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            sourceRef: input.sourceRef ?? null,
          })
          .returning();
        return row;
      }),
  }),

  // ── Statutory filing portal push (G2) ────────────────────────────────────
  // Closes the compute→file loop: `submit` rebuilds the canonical ECR member
  // body for a generated return, enqueues the EPFO GSP push (idempotent per
  // submission, soft-fails `not_configured` until creds land), and `status`
  // surfaces the persisted TRRN / error the worker writes back.
  filing: router({
    submit: permissionProcedure("hr", "write")
      .input(z.object({ ecrSubmissionId: z.string().uuid(), force: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [submission] = await db
          .select()
          .from(epfoEcrSubmissions)
          .where(
            and(
              eq(epfoEcrSubmissions.id, input.ecrSubmissionId),
              eq(epfoEcrSubmissions.orgId, org!.id),
            ),
          );
        if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "ECR submission not found" });
        if (!input.force && submission.epfoAckNumber) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ECR already filed (ack present)" });
        }

        // Rebuild the canonical `#~#` ECR body from the payroll run behind this
        // return so the pushed payload is always regenerated from source of truth.
        const { payrollRuns, payslips: payslipsTable, employees: employeesTable } = await import(
          "@coheronconnect/db"
        );
        const { formatECRFile } = await import("../lib/india/payroll-engine.js");

        const [run] = await db
          .select()
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.orgId, org!.id),
              eq(payrollRuns.month, submission.month),
              eq(payrollRuns.year, submission.year),
            ),
          );
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run for this return not found" });

        const slips = await db
          .select()
          .from(payslipsTable)
          .where(eq(payslipsTable.payrollRunId, run.id));

        const ecrLines = await Promise.all(
          slips.map(async (slip) => {
            const [emp] = await db
              .select()
              .from(employeesTable)
              .where(eq(employeesTable.id, slip.employeeId));
            const pfWages = Math.min(Number(slip.basic), 15000);
            return {
              uan: emp?.uan ?? "UNKNOWN",
              memberName: emp?.employeeId ?? "EMPLOYEE",
              grossWages: Number(slip.grossEarnings),
              epfWages: pfWages,
              epsWages: pfWages,
              edliWages: pfWages,
              employeeEpf: Number(slip.pfEmployee),
              employerEps: Math.min(Math.round(pfWages * 0.0833), 1250),
              employerEpf: Number(slip.pfEmployer),
              ncp: 0,
              refund: 0,
            };
          }),
        );
        const orgEpfoId = `EPFO_${org!.id.slice(0, 8).toUpperCase()}`;
        const ecrBody = formatECRFile(orgEpfoId, submission.month, submission.year, ecrLines);

        const { enqueueStatutoryFilingJob } = await import(
          "../workflows/statutoryFilingWorkflow.js"
        );
        const { getWorkflowService } = await import("../services/workflow.js");
        await enqueueStatutoryFilingJob(getWorkflowService().statutoryFilingQueue, {
          ecrSubmissionId: submission.id,
          orgId: org!.id,
          ecrBody,
          force: input.force,
        });

        return { queued: true, ecrSubmissionId: submission.id, lines: ecrLines.length };
      }),

    status: permissionProcedure("hr", "read")
      .input(z.object({ ecrSubmissionId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [submission] = await db
          .select()
          .from(epfoEcrSubmissions)
          .where(
            and(
              eq(epfoEcrSubmissions.id, input.ecrSubmissionId),
              eq(epfoEcrSubmissions.orgId, org!.id),
            ),
          );
        if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "ECR submission not found" });
        return submission;
      }),

    // ── ESI monthly return push ────────────────────────────────────────────
    // Rebuilds the ESIC monthly-contribution (MC) line list from the payroll
    // run behind the record, then enqueues the ESIC GSP push (idempotent per
    // record, soft-fails `not_configured` until creds land).
    submitEsi: permissionProcedure("hr", "write")
      .input(z.object({ esiChallanId: z.string().uuid(), force: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [record] = await db
          .select()
          .from(esiChallanRecords)
          .where(
            and(
              eq(esiChallanRecords.id, input.esiChallanId),
              eq(esiChallanRecords.orgId, org!.id),
            ),
          );
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "ESI challan record not found" });
        if (!input.force && record.challanNumber) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ESI return already filed (challan present)" });
        }

        // Rebuild the canonical MC lines from the payroll run: one `#~#` member
        // line per employee with gross + the ESI employee/employer split at the
        // statutory rates (0.75% employee, 3.25% employer) so the pushed payload
        // is always regenerated from the source-of-truth roster.
        const { payrollRuns, payslips: payslipsTable, employees: employeesTable } = await import(
          "@coheronconnect/db"
        );
        const [run] = await db
          .select()
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.orgId, org!.id),
              eq(payrollRuns.month, record.month),
              eq(payrollRuns.year, record.year),
            ),
          );
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run for this return not found" });

        const slips = await db
          .select()
          .from(payslipsTable)
          .where(eq(payslipsTable.payrollRunId, run.id));

        const mcRows = await Promise.all(
          slips.map(async (slip) => {
            const [emp] = await db
              .select()
              .from(employeesTable)
              .where(eq(employeesTable.id, slip.employeeId));
            const gross = Number(slip.grossEarnings);
            // ESI applies only up to the wage ceiling; the resolved ceiling lives
            // on the record's persisted totals, so we derive per-IP contributions
            // at statutory rates and let the portal reconcile against the ceiling.
            const employee = Math.round(gross * 0.0075);
            const employer = Math.round(gross * 0.0325);
            return [
              emp?.uan ?? emp?.employeeId ?? "UNKNOWN",
              emp?.employeeId ?? "EMPLOYEE",
              gross,
              employee,
              employer,
            ].join("#~#");
          }),
        );
        const mcLines = mcRows.join("\n");

        const { enqueueEsiReturnJob } = await import("../workflows/esiReturnWorkflow.js");
        const { getWorkflowService } = await import("../services/workflow.js");
        await enqueueEsiReturnJob(getWorkflowService().esiReturnQueue, {
          esiChallanId: record.id,
          orgId: org!.id,
          mcLines,
          force: input.force,
        });

        return { queued: true, esiChallanId: record.id, lines: mcRows.length };
      }),

    statusEsi: permissionProcedure("hr", "read")
      .input(z.object({ esiChallanId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [record] = await db
          .select()
          .from(esiChallanRecords)
          .where(
            and(
              eq(esiChallanRecords.id, input.esiChallanId),
              eq(esiChallanRecords.orgId, org!.id),
            ),
          );
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "ESI challan record not found" });
        return record;
      }),

    // ── PT challan push ────────────────────────────────────────────────────
    // Rebuilds the per-employee PT line list from the payroll run behind the
    // record, then enqueues the state-PT GSP push (idempotent per record,
    // soft-fails `not_configured` until creds land).
    submitPt: permissionProcedure("hr", "write")
      .input(z.object({ ptChallanId: z.string().uuid(), force: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [record] = await db
          .select()
          .from(ptChallanRecords)
          .where(
            and(
              eq(ptChallanRecords.id, input.ptChallanId),
              eq(ptChallanRecords.orgId, org!.id),
            ),
          );
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "PT challan record not found" });
        if (!input.force && record.challanNumber) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PT challan already filed (challan present)" });
        }

        const { payrollRuns, payslips: payslipsTable, employees: employeesTable } = await import(
          "@coheronconnect/db"
        );
        const [run] = await db
          .select()
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.orgId, org!.id),
              eq(payrollRuns.month, record.month),
              eq(payrollRuns.year, record.year),
            ),
          );
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run for this challan not found" });

        const slips = await db
          .select()
          .from(payslipsTable)
          .where(eq(payslipsTable.payrollRunId, run.id));

        // One line per employee with PT withheld > 0 (PT is a flat state slab, so
        // employees below the first slab contribute nothing and are omitted).
        const ptRows = await Promise.all(
          slips
            .filter((slip) => Number(slip.professionalTax) > 0)
            .map(async (slip) => {
              const [emp] = await db
                .select()
                .from(employeesTable)
                .where(eq(employeesTable.id, slip.employeeId));
              return [
                emp?.employeeId ?? "EMPLOYEE",
                Number(slip.grossEarnings),
                Number(slip.professionalTax),
              ].join("#~#");
            }),
        );
        const ptLines = ptRows.join("\n");

        const { enqueuePtChallanJob } = await import("../workflows/ptChallanWorkflow.js");
        const { getWorkflowService } = await import("../services/workflow.js");
        await enqueuePtChallanJob(getWorkflowService().ptChallanQueue, {
          ptChallanId: record.id,
          orgId: org!.id,
          ptLines,
          force: input.force,
        });

        return { queued: true, ptChallanId: record.id, lines: ptRows.length };
      }),

    statusPt: permissionProcedure("hr", "read")
      .input(z.object({ ptChallanId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [record] = await db
          .select()
          .from(ptChallanRecords)
          .where(
            and(
              eq(ptChallanRecords.id, input.ptChallanId),
              eq(ptChallanRecords.orgId, org!.id),
            ),
          );
        if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "PT challan record not found" });
        return record;
      }),
  }),
});
