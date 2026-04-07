import { router, permissionProcedure, protectedProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  expenseReports,
  expenseItems,
  eq,
  and,
  desc,
  sum,
  sql,
} from "@nexusops/db";

const expenseReportInput = z.object({
  title: z.string().min(1).max(200),
  businessPurpose: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  currency: z.string().length(3).default("INR"),
});

const expenseItemInput = z.object({
  reportId: z.string().uuid(),
  category: z.enum([
    "travel", "accommodation", "meals", "transport",
    "office_supplies", "software", "marketing", "training",
    "entertainment", "medical", "other",
  ]),
  description: z.string().min(1).max(500),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Valid decimal required"),
  currency: z.string().length(3).default("INR"),
  merchant: z.string().max(200).optional(),
  expenseDate: z.string().datetime({ offset: true }).optional(),
  receiptUrl: z.string().url().optional(),
  receiptFileName: z.string().max(255).optional(),
  isBillable: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

export const expensesRouter = router({
  // ── List reports ─────────────────────────────────────────────────────────
  listReports: permissionProcedure("financial", "read")
    .input(z.object({
      status: z.string().optional(),
      submittedById: z.string().uuid().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(expenseReports.orgId, org!.id)];
      if (input.status) conditions.push(eq(expenseReports.status, input.status as any));
      if (input.submittedById) conditions.push(eq(expenseReports.submittedById, input.submittedById));
      return db
        .select()
        .from(expenseReports)
        .where(and(...conditions))
        .orderBy(desc(expenseReports.createdAt))
        .limit(input.limit);
    }),

  // ── My reports (submitter sees own) ──────────────────────────────────────
  myReports: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      return db
        .select()
        .from(expenseReports)
        .where(and(eq(expenseReports.orgId, org!.id), eq(expenseReports.submittedById, user!.id)))
        .orderBy(desc(expenseReports.createdAt))
        .limit(input.limit);
    }),

  // ── Get single report + items ─────────────────────────────────────────────
  getReport: permissionProcedure("financial", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [report] = await db
        .select()
        .from(expenseReports)
        .where(and(eq(expenseReports.id, input.id), eq(expenseReports.orgId, org!.id)));
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db
        .select()
        .from(expenseItems)
        .where(and(eq(expenseItems.reportId, input.id), eq(expenseItems.orgId, org!.id)));
      return { report, items };
    }),

  // ── Create report ─────────────────────────────────────────────────────────
  createReport: protectedProcedure
    .input(expenseReportInput)
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const number = `EXP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      const [report] = await db
        .insert(expenseReports)
        .values({
          orgId: org!.id,
          number,
          title: input.title,
          businessPurpose: input.businessPurpose,
          notes: input.notes,
          currency: input.currency,
          submittedById: user!.id,
          status: "draft",
        } as any)
        .returning();
      return report;
    }),

  // ── Update report ─────────────────────────────────────────────────────────
  updateReport: protectedProcedure
    .input(expenseReportInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const { id, ...data } = input;
      const [report] = await db
        .update(expenseReports)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(
          eq(expenseReports.id, id),
          eq(expenseReports.orgId, org!.id),
          eq(expenseReports.submittedById, user!.id),
          eq(expenseReports.status, "draft"),
        ))
        .returning();
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      return report;
    }),

  // ── Submit for approval ───────────────────────────────────────────────────
  submitReport: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [report] = await db
        .update(expenseReports)
        .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() } as any)
        .where(and(
          eq(expenseReports.id, input.id),
          eq(expenseReports.orgId, org!.id),
          eq(expenseReports.submittedById, user!.id),
          eq(expenseReports.status, "draft"),
        ))
        .returning();
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      return report;
    }),

  // ── Approve / Reject ──────────────────────────────────────────────────────
  reviewReport: permissionProcedure("financial", "write")
    .input(z.object({
      id: z.string().uuid(),
      decision: z.enum(["approved", "rejected"]),
      rejectionReason: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const updates: Record<string, any> = {
        status: input.decision,
        approverId: user!.id,
        updatedAt: new Date(),
      };
      if (input.decision === "approved") updates.approvedAt = new Date();
      if (input.decision === "rejected" && input.rejectionReason)
        updates.rejectionReason = input.rejectionReason;

      const [report] = await db
        .update(expenseReports)
        .set(updates)
        .where(and(
          eq(expenseReports.id, input.id),
          eq(expenseReports.orgId, org!.id),
        ))
        .returning();
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      return report;
    }),

  // ── Add line item ─────────────────────────────────────────────────────────
  addItem: protectedProcedure
    .input(expenseItemInput)
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [item] = await db
        .insert(expenseItems)
        .values({
          orgId: org!.id,
          reportId: input.reportId,
          category: input.category,
          description: input.description,
          amount: input.amount,
          currency: input.currency,
          merchant: input.merchant,
          expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
          receiptUrl: input.receiptUrl,
          receiptFileName: input.receiptFileName,
          isBillable: input.isBillable,
          notes: input.notes,
        } as any)
        .returning();

      // Update report total
      const totals = await db
        .select({ total: sum(expenseItems.amount) })
        .from(expenseItems)
        .where(and(eq(expenseItems.reportId, input.reportId), eq(expenseItems.orgId, org!.id)));
      const newTotal = totals[0]?.total ?? "0";
      await db
        .update(expenseReports)
        .set({ totalAmount: newTotal, reimbursableAmount: newTotal, updatedAt: new Date() } as any)
        .where(and(eq(expenseReports.id, input.reportId), eq(expenseReports.orgId, org!.id)));

      return item;
    }),

  // ── Delete line item ──────────────────────────────────────────────────────
  deleteItem: protectedProcedure
    .input(z.object({ id: z.string().uuid(), reportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      await db
        .delete(expenseItems)
        .where(and(
          eq(expenseItems.id, input.id),
          eq(expenseItems.orgId, org!.id),
          eq(expenseItems.reportId, input.reportId),
        ));

      // Update report total
      const totals = await db
        .select({ total: sum(expenseItems.amount) })
        .from(expenseItems)
        .where(and(eq(expenseItems.reportId, input.reportId), eq(expenseItems.orgId, org!.id)));
      const newTotal = totals[0]?.total ?? "0";
      await db
        .update(expenseReports)
        .set({ totalAmount: newTotal, reimbursableAmount: newTotal, updatedAt: new Date() } as any)
        .where(and(eq(expenseReports.id, input.reportId), eq(expenseReports.orgId, org!.id)));

      return { success: true };
    }),

  // ── Summary stats ─────────────────────────────────────────────────────────
  summary: permissionProcedure("financial", "read")
    .query(async ({ ctx }) => {
      const { db, org } = ctx;
      const rows = await db
        .select({
          status: expenseReports.status,
          total: sum(expenseReports.totalAmount),
          count: sql<number>`count(*)::int`,
        })
        .from(expenseReports)
        .where(eq(expenseReports.orgId, org!.id))
        .groupBy(expenseReports.status);
      return rows;
    }),
});
