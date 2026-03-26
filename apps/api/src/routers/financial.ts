import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { budgetLines, chargebacks, invoices, eq, and, desc, sum, sql } from "@nexusops/db";

export const financialRouter = router({
  // ── Budget ─────────────────────────────────────────────────────────────────
  listBudget: permissionProcedure("budget", "read")
    .input(z.object({ fiscalYear: z.coerce.number().optional(), department: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(budgetLines.orgId, org!.id)];
      if (input.fiscalYear) conditions.push(eq(budgetLines.fiscalYear, input.fiscalYear));
      if (input.department) conditions.push(eq(budgetLines.department, input.department));
      return db.select().from(budgetLines).where(and(...conditions)).orderBy(budgetLines.category);
    }),

  createBudgetLine: permissionProcedure("budget", "write")
    .input(z.object({
      category: z.string(),
      department: z.string().optional(),
      fiscalYear: z.coerce.number(),
      budgeted: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [line] = await db.insert(budgetLines).values({ orgId: org!.id, ...input }).returning();
      return line;
    }),

  updateBudgetLine: permissionProcedure("budget", "write")
    .input(z.object({ id: z.string().uuid(), actual: z.string().optional(), committed: z.string().optional(), forecast: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { id, ...data } = input;
      const [line] = await db.update(budgetLines).set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(budgetLines.id, id), eq(budgetLines.orgId, org!.id))).returning();
      return line;
    }),

  getBudgetVariance: permissionProcedure("budget", "read")
    .input(z.object({ fiscalYear: z.coerce.number() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const rows = await db.select().from(budgetLines)
        .where(and(eq(budgetLines.orgId, org!.id), eq(budgetLines.fiscalYear, input.fiscalYear)));
      return rows.map((r: (typeof rows)[number]) => ({
        ...r,
        variance: Number(r.budgeted) - Number(r.actual),
        variancePct: Number(r.budgeted) > 0 ? ((Number(r.budgeted) - Number(r.actual)) / Number(r.budgeted) * 100).toFixed(1) : "0",
      }));
    }),

  // ── Invoices (AP/AR) ───────────────────────────────────────────────────────
  listInvoices: permissionProcedure("financial", "read")
    .input(z.object({
      direction: z.enum(["payable", "receivable"]).optional(),
      status: z.string().optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(invoices.orgId, org!.id)];
      if (input.status) conditions.push(eq(invoices.status, input.status as any));

      const rows = await db.select().from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = rows.length > input.limit;
      return { items: hasMore ? rows.slice(0, -1) : rows, nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null };
    }),

  approveInvoice: permissionProcedure("financial", "write")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [inv] = await db.update(invoices)
        .set({ status: "approved", approvedById: user!.id, updatedAt: new Date() })
        .where(and(eq(invoices.id, input.id), eq(invoices.orgId, org!.id)))
        .returning();
      return inv;
    }),

  markPaid: permissionProcedure("financial", "write")
    .input(z.object({ id: z.string().uuid(), paymentMethod: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [inv] = await db.update(invoices)
        .set({ status: "paid", paidAt: new Date(), paymentMethod: input.paymentMethod, updatedAt: new Date() })
        .where(and(eq(invoices.id, input.id), eq(invoices.orgId, org!.id)))
        .returning();
      return inv;
    }),

  apAging: permissionProcedure("financial", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db.select().from(invoices)
      .where(and(eq(invoices.orgId, org!.id), sql`status IN ('pending','approved','overdue')`))
      .orderBy(invoices.dueDate);
    const now = Date.now();
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    for (const inv of rows) {
      if (!inv.dueDate) { buckets.current += Number(inv.total); continue; }
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      if (days <= 0) buckets.current += Number(inv.total);
      else if (days <= 30) buckets.d30 += Number(inv.total);
      else if (days <= 60) buckets.d60 += Number(inv.total);
      else if (days <= 90) buckets.d90 += Number(inv.total);
      else buckets.over90 += Number(inv.total);
    }
    return buckets;
  }),

  // ── Chargebacks ────────────────────────────────────────────────────────────
  listChargebacks: permissionProcedure("chargebacks", "read")
    .input(z.object({ periodYear: z.coerce.number().optional(), periodMonth: z.coerce.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(chargebacks.orgId, org!.id)];
      if (input.periodYear) conditions.push(eq(chargebacks.periodYear, input.periodYear));
      if (input.periodMonth) conditions.push(eq(chargebacks.periodMonth, input.periodMonth));
      return db.select().from(chargebacks).where(and(...conditions)).orderBy(desc(chargebacks.createdAt));
    }),

  createChargeback: permissionProcedure("chargebacks", "write")
    .input(z.object({ department: z.string(), service: z.string(), amount: z.string(), periodMonth: z.coerce.number(), periodYear: z.coerce.number(), allocationMethod: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [cb] = await db.insert(chargebacks).values({ orgId: org!.id, ...input }).returning();
      return cb;
    }),
});
