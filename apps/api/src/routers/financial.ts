import { router, permissionProcedure, stepUpGate } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getTableColumns } from "drizzle-orm";
import {
  budgetLines,
  chargebacks,
  invoices,
  vendors,
  legalEntities,
  eq,
  and,
  desc,
  sum,
  sql,
  count,
  notInArray,
} from "@nexusops/db";
import {
  getDuplicatePayablePolicy,
  isInvoicePeriodClosed,
} from "../lib/org-settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countDuplicatePayable(db: any, orgId: string, vendorId: string, invoiceNumber: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        eq(invoices.vendorId, vendorId),
        eq(invoices.invoiceNumber, invoiceNumber),
        eq(invoices.invoiceFlow, "payable"),
        notInArray(invoices.status, ["cancelled", "disputed"]),
      ),
    );
  return Number(row?.c ?? 0);
}

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
  createInvoice: permissionProcedure("financial", "write")
    .input(z.object({
      vendorId: z.string().uuid(),
      invoiceNumber: z.string().min(1),
      amount: z.string(),
      dueDate: z.string().optional(),
      invoiceDate: z.string().optional(),
      notes: z.string().optional(),
      legalEntityId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const policy = getDuplicatePayablePolicy(org!.settings);
      const dup = await countDuplicatePayable(db, org!.id, input.vendorId, input.invoiceNumber);
      if (dup > 0 && policy === "block") {
        throw new TRPCError({ code: "CONFLICT", message: "DUPLICATE_PAYABLE_INVOICE" });
      }
      if (input.legalEntityId) {
        const [le] = await db
          .select({ id: legalEntities.id })
          .from(legalEntities)
          .where(and(eq(legalEntities.id, input.legalEntityId), eq(legalEntities.orgId, org!.id)));
        if (!le) throw new TRPCError({ code: "BAD_REQUEST", message: "Legal entity not found" });
      }
      const [inv] = await db.insert(invoices).values({
        orgId: org!.id,
        vendorId: input.vendorId,
        legalEntityId: input.legalEntityId ?? null,
        invoiceFlow: "payable",
        invoiceNumber: input.invoiceNumber,
        invoiceType: "tax_invoice",
        amount: input.amount,
        taxableValue: input.amount,
        status: "pending",
        matchingStatus: "pending",
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : new Date(),
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      } as any).returning();
      return { ...inv, duplicatePayableWarning: dup > 0 && policy === "warn" };
    }),

  /** Customer AR: counterparty is a row in `vendors` (e.g. vendor_type = customer). */
  createReceivableInvoice: permissionProcedure("financial", "write")
    .input(
      z.object({
        customerVendorId: z.string().uuid(),
        invoiceNumber: z.string().min(1),
        amount: z.string(),
        dueDate: z.string().optional(),
        invoiceDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [inv] = await db
        .insert(invoices)
        .values({
          orgId: org!.id,
          vendorId: input.customerVendorId,
          invoiceFlow: "receivable",
          invoiceNumber: input.invoiceNumber,
          invoiceType: "tax_invoice",
          amount: input.amount,
          taxableValue: input.amount,
          status: "pending",
          matchingStatus: "pending",
          invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : new Date(),
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        } as any)
        .returning();
      return inv;
    }),

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
      if (input.direction) {
        conditions.push(eq(invoices.invoiceFlow, input.direction));
      }
      if (input.status) conditions.push(eq(invoices.status, input.status as any));

      const base = await db
        .select({
          ...getTableColumns(invoices),
          vendorName: vendors.name,
        })
        .from(invoices)
        .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
        .where(and(...conditions))
        .orderBy(desc(invoices.createdAt))
        .limit(input.limit + 1)
        .offset(input.cursor ? parseInt(input.cursor) : 0);

      const hasMore = base.length > input.limit;
      const slice = hasMore ? base.slice(0, -1) : base;
      const items = slice.map((row: (typeof base)[number]) => ({
        ...row,
        totalAmount: row.amount,
        direction: row.invoiceFlow,
        customerName: row.invoiceFlow === "receivable" ? row.vendorName : undefined,
      }));

      return {
        items,
        nextCursor: hasMore ? String((input.cursor ? parseInt(input.cursor) : 0) + input.limit) : null,
      };
    }),

  approveInvoice: permissionProcedure("financial", "write")
    .use(stepUpGate)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [inv] = await db.update(invoices)
        .set({ status: "approved", approvedById: user!.id, updatedAt: new Date() })
        .where(and(eq(invoices.id, input.id), eq(invoices.orgId, org!.id)))
        .returning();
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return inv;
    }),

  markPaid: permissionProcedure("financial", "write")
    .use(stepUpGate)
    .input(z.object({ id: z.string().uuid(), paymentMethod: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;
      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.orgId, org!.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      if (isInvoicePeriodClosed(org!.settings, existing.invoiceDate ? new Date(existing.invoiceDate as Date) : null)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Accounting period is closed for this invoice date",
        });
      }

      if (existing.approvedById && existing.approvedById === user!.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "SoD: approver cannot mark the same invoice as paid",
        });
      }

      const [inv] = await db.update(invoices)
        .set({ status: "paid", paidAt: new Date(), paymentMethod: input.paymentMethod, updatedAt: new Date() })
        .where(and(eq(invoices.id, input.id), eq(invoices.orgId, org!.id)))
        .returning();
      return inv;
    }),

  apAging: permissionProcedure("financial", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, org!.id),
          eq(invoices.invoiceFlow, "payable"),
          sql`status IN ('pending','approved','overdue')`,
        ),
      )
      .orderBy(invoices.dueDate);
    const now = Date.now();
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    for (const inv of rows) {
      if (!inv.dueDate) { buckets.current += Number(inv.amount); continue; }
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      if (days <= 0) buckets.current += Number(inv.amount);
      else if (days <= 30) buckets.d30 += Number(inv.amount);
      else if (days <= 60) buckets.d60 += Number(inv.amount);
      else if (days <= 90) buckets.d90 += Number(inv.amount);
      else buckets.over90 += Number(inv.amount);
    }
    return buckets;
  }),

  /** Consolidated AP/AR KPIs for exec dashboards (US-FIN-002). */
  executiveSummary: permissionProcedure("financial", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    const orgId = org!.id as string;

    const payableRows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, orgId),
          eq(invoices.invoiceFlow, "payable"),
          sql`status IN ('pending','approved','overdue')`,
        ),
      );

    const receivableRows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, orgId),
          eq(invoices.invoiceFlow, "receivable"),
          sql`status IN ('pending','approved','overdue')`,
        ),
      );

    const now = Date.now();
    const apBuckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    let payableOverdueCount = 0;
    for (const inv of payableRows) {
      if (!inv.dueDate) {
        apBuckets.current += Number(inv.amount);
        continue;
      }
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      if (days > 0) payableOverdueCount += 1;
      if (days <= 0) apBuckets.current += Number(inv.amount);
      else if (days <= 30) apBuckets.d30 += Number(inv.amount);
      else if (days <= 60) apBuckets.d60 += Number(inv.amount);
      else if (days <= 90) apBuckets.d90 += Number(inv.amount);
      else apBuckets.over90 += Number(inv.amount);
    }

    let arOutstanding = 0;
    let receivableOverdueCount = 0;
    for (const inv of receivableRows) {
      arOutstanding += Number(inv.amount);
      if (inv.dueDate) {
        const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
        if (days > 0) receivableOverdueCount += 1;
      }
    }

    return {
      apAging: apBuckets,
      apOpenCount: payableRows.length,
      payableOverdueCount,
      arOutstanding,
      arOpenCount: receivableRows.length,
      receivableOverdueCount,
    };
  }),

  listLegalEntities: permissionProcedure("financial", "read").query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.orgId, ctx.org!.id))
      .orderBy(legalEntities.code);
  }),

  createLegalEntity: permissionProcedure("financial", "write")
    .input(
      z.object({
        code: z.string().min(1).max(32),
        name: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .insert(legalEntities)
        .values({ orgId: org!.id, code: input.code, name: input.name })
        .returning();
      return row;
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

  // ── GST Engine ────────────────────────────────────────────────────────────
  computeGST: permissionProcedure("financial", "read")
    .input(
      z.object({
        taxableValue: z.number().positive(),
        gstRate: z.union([
          z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28),
        ]),
        supplierState: z.string(),
        buyerState: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { computeGST } = await import("../lib/india/gst-engine.js");
      return computeGST({
        taxableValue: input.taxableValue,
        gstRate: input.gstRate as 0 | 5 | 12 | 18 | 28,
        supplierState: input.supplierState,
        buyerState: input.buyerState,
      });
    }),

  validateGSTIN: permissionProcedure("financial", "read")
    .input(z.object({ gstin: z.string() }))
    .query(async ({ input }) => {
      const { validateGSTIN } = await import("../lib/india/validators.js");
      return validateGSTIN(input.gstin);
    }),

  computeITC: permissionProcedure("financial", "read")
    .input(
      z.object({
        balance: z.object({ igst: z.number(), cgst: z.number(), sgst: z.number() }),
        liability: z.object({ igst: z.number(), cgst: z.number(), sgst: z.number() }),
      }),
    )
    .query(async ({ input }) => {
      const { computeITCUtilisation } = await import("../lib/india/gst-engine.js");
      return computeITCUtilisation(input.balance, input.liability);
    }),

  gstFilingCalendar: permissionProcedure("financial", "read")
    .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int() }))
    .query(async ({ input }) => {
      const { getGSTFilingCalendar } = await import("../lib/india/gst-engine.js");
      return getGSTFilingCalendar(input.month, input.year);
    }),

  createGSTInvoice: permissionProcedure("financial", "write")
    .input(
      z.object({
        vendorId: z.string().uuid(),
        poId: z.string().uuid().optional(),
        invoiceNumber: z.string().min(1),
        invoiceDate: z.coerce.date(),
        supplierGstin: z.string().min(15).max(15),
        buyerGstin: z.string().min(15).max(15).optional(),
        placeOfSupply: z.string(),
        isReverseCharge: z.boolean().default(false),
        lineItems: z.array(
          z.object({
            description: z.string(),
            hsnSacCode: z.string().optional(),
            quantity: z.number().positive(),
            unitPrice: z.number().positive(),
            gstRate: z.union([
              z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28),
            ]),
          }),
        ),
        orgState: z.string(),
        vendorState: z.string(),
        legalEntityId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { computeGST, isEInvoiceRequired, isEWayBillRequired } = await import("../lib/india/gst-engine.js");
      const { validateGSTIN } = await import("../lib/india/validators.js");

      const gstinValidation = validateGSTIN(input.supplierGstin);
      if (!gstinValidation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: gstinValidation.error });
      }

      let totalTaxableValue = 0;
      let totalCgst = 0, totalSgst = 0, totalIgst = 0;
      let isInterstate = false;

      for (const item of input.lineItems) {
        const taxableValue = item.quantity * item.unitPrice;
        const gstResult = computeGST({
          taxableValue,
          gstRate: item.gstRate as 0 | 5 | 12 | 18 | 28,
          supplierState: input.orgState,
          buyerState: input.vendorState,
        });
        totalTaxableValue += taxableValue;
        totalCgst += gstResult.cgstAmount;
        totalSgst += gstResult.sgstAmount;
        totalIgst += gstResult.igstAmount;
        isInterstate = gstResult.isInterstate;
      }

      const totalTax = totalCgst + totalSgst + totalIgst;
      const totalAmount = totalTaxableValue + totalTax;

      const policy = getDuplicatePayablePolicy(org!.settings);
      const dup = await countDuplicatePayable(db, org!.id, input.vendorId, input.invoiceNumber);
      if (dup > 0 && policy === "block") {
        throw new TRPCError({ code: "CONFLICT", message: "DUPLICATE_PAYABLE_INVOICE" });
      }
      if (input.legalEntityId) {
        const [le] = await db
          .select({ id: legalEntities.id })
          .from(legalEntities)
          .where(and(eq(legalEntities.id, input.legalEntityId), eq(legalEntities.orgId, org!.id)));
        if (!le) throw new TRPCError({ code: "BAD_REQUEST", message: "Legal entity not found" });
      }

      const [invoice] = await db
        .insert(invoices)
        .values({
          orgId: org!.id,
          invoiceNumber: input.invoiceNumber,
          invoiceType: "tax_invoice",
          vendorId: input.vendorId,
          legalEntityId: input.legalEntityId ?? null,
          poId: input.poId ?? null,
          supplierGstin: input.supplierGstin,
          buyerGstin: input.buyerGstin ?? null,
          placeOfSupply: input.placeOfSupply,
          isInterstate,
          isReverseCharge: input.isReverseCharge,
          taxableValue: String(totalTaxableValue),
          cgstAmount: String(totalCgst),
          sgstAmount: String(totalSgst),
          igstAmount: String(totalIgst),
          totalTaxAmount: String(totalTax),
          amount: String(totalAmount),
          invoiceDate: input.invoiceDate,
          status: "confirmed",
          matchingStatus: "pending",
        } as any)
        .returning();

      const eInvoiceRequired = isEInvoiceRequired(0);
      const eWayBillRequired = isEWayBillRequired({ isGoods: true, consignmentValue: totalTaxableValue });

      return {
        invoice,
        eInvoiceRequired,
        eWayBillRequired,
        duplicatePayableWarning: dup > 0 && policy === "warn",
        summary: { totalTaxableValue, totalCgst, totalSgst, totalIgst, totalTax, totalAmount, isInterstate },
      };
    }),

  gstr2bReconcile: permissionProcedure("financial", "write")
    .input(
      z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int(),
        gstr2bLines: z.array(
          z.object({
            supplierGstin: z.string(),
            invoiceNumber: z.string(),
            invoiceDate: z.string(),
            taxableValue: z.number(),
            igst: z.number(),
            cgst: z.number(),
            sgst: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const { reconcileGSTR2B } = await import("../lib/india/gst-engine.js");

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0);

      const allInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.orgId, org!.id)) as any[];

      const bookLines = allInvoices
        .filter((inv: any) => {
          if (!inv.invoiceDate) return false;
          const d = new Date(inv.invoiceDate);
          return d >= startDate && d <= endDate;
        })
        .map((inv: any) => ({
          supplierGstin: inv.supplierGstin ?? "",
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : "",
          taxableValue: Number(inv.taxableValue ?? 0),
          igst: Number(inv.igstAmount ?? 0),
          cgst: Number(inv.cgstAmount ?? 0),
          sgst: Number(inv.sgstAmount ?? 0),
        }));

      const result = reconcileGSTR2B(bookLines, input.gstr2bLines);
      const summary = {
        matched: result.filter((r) => r.status === "matched").length,
        mismatch: result.filter((r) => r.status === "mismatch").length,
        missingIn2B: result.filter((r) => r.status === "missing_in_2b").length,
        missingInBooks: result.filter((r) => r.status === "missing_in_books").length,
      };
      return { summary, lines: result };
    }),
});
