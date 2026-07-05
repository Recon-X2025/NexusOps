import { router, permissionProcedure, adminProcedure, mfaGate, stepUpGate } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getTableColumns } from "drizzle-orm";
import {
  budgetLines,
  chargebacks,
  invoices,
  invoiceStatusEnum,
  journalEntries,
  vendors,
  legalEntities,
  gstinRegistry,
  organizations,
  eq,
  and,
  or,
  desc,
  sum,
  sql,
  count,
  gte,
  lt,
  notInArray,
  type DbOrTx,
} from "@coheronconnect/db";
import { computeGST, type GSTRate } from "../lib/india/gst-engine";
import {
  getDuplicatePayablePolicy,
  isInvoicePeriodClosed,
  parseOrgSettings,
} from "../lib/org-settings";
import {
  enqueueIrnGenerationJob,
} from "../workflows/irnGenerationWorkflow";
import { getWorkflowService } from "../services/workflow";
import {
  postInvoiceJournalEntry,
  postInvoiceSettlementEntry,
  reverseInvoiceJournalEntry,
} from "../lib/invoice-journal";
import { currentFY } from "./accounting";
import { runEntityBusinessRules } from "../services/business-rules-engine";
import { emitDomainEvent } from "../services/workflow-events";

/** GST rates permitted at invoice entry; mirrors the `GSTRate` engine union. */
const GST_RATE_INPUT = z
  .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
  .default(18);

/**
 * The org's own place-of-supply state, read from its primary (or first active)
 * GSTIN registration. Returns `null` when the org has no GSTIN on file, in
 * which case GST falls back to the intra-state split (CGST+SGST) — the total
 * tax is identical either way; only the CGST/SGST-vs-IGST breakdown differs.
 */
async function resolveOrgState(db: DbOrTx, orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ stateCode: gstinRegistry.stateCode, stateName: gstinRegistry.stateName })
    .from(gstinRegistry)
    .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.isActive, true)))
    .orderBy(desc(gstinRegistry.isPrimary), gstinRegistry.createdAt)
    .limit(1);
  return row?.stateName ?? row?.stateCode ?? null;
}

/**
 * Computes CGST/SGST/IGST for an invoice by treating the entered `amount` as
 * the taxable value and applying `gstRate`. Interstate-vs-intrastate is decided
 * by comparing the org's state against the counterparty's state; when either is
 * unknown we treat the supply as intra-state (the safe, most-common default).
 * Returns numeric-string columns ready to spread into an `invoices` insert.
 */
function gstInvoiceColumns(params: {
  taxableValue: number;
  gstRate: GSTRate;
  orgState: string | null;
  counterpartyState: string | null;
}): {
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTaxAmount: string;
  isInterstate: boolean;
  amount: string;
} {
  const orgState = params.orgState ?? "";
  const counterpartyState = params.counterpartyState ?? orgState;
  const gst = computeGST({
    taxableValue: params.taxableValue,
    gstRate: params.gstRate,
    supplierState: orgState,
    buyerState: counterpartyState,
  });
  return {
    taxableValue: String(gst.taxableValue),
    cgstAmount: String(gst.cgstAmount),
    sgstAmount: String(gst.sgstAmount),
    igstAmount: String(gst.igstAmount),
    totalTaxAmount: String(gst.totalTaxAmount),
    isInterstate: gst.isInterstate,
    amount: String(gst.invoiceTotal),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countDuplicatePayable(db: DbOrTx, orgId: string, vendorId: string, invoiceNumber: string): Promise<number> {
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
    .input(z.object({
      fiscalYear: z.coerce.number().optional(),
      department: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(budgetLines.orgId, org!.id)];
      if (input.fiscalYear) conditions.push(eq(budgetLines.fiscalYear, input.fiscalYear));
      if (input.department) conditions.push(eq(budgetLines.department, input.department));
      return db.select().from(budgetLines).where(and(...conditions))
        .orderBy(budgetLines.category)
        .limit(input.limit).offset(input.offset);
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
      const [line] = await db.update(budgetLines).set({ ...data, updatedAt: new Date() })
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
      gstRate: GST_RATE_INPUT,
      dueDate: z.string().optional(),
      invoiceDate: z.string().optional(),
      notes: z.string().optional(),
      legalEntityId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [orgRow] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const settings = orgRow?.settings ?? org!.settings;
      const policy = getDuplicatePayablePolicy(settings);
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
      // Resolve both states so we split CGST/SGST vs IGST correctly, then let
      // the GST engine derive tax + gross total from the taxable `amount`.
      const [vendorRow] = await db
        .select({ gstin: vendors.gstin, state: vendors.state })
        .from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.orgId, org!.id)));
      const orgState = await resolveOrgState(db, org!.id);
      const gst = gstInvoiceColumns({
        taxableValue: Number(input.amount),
        gstRate: input.gstRate as GSTRate,
        orgState,
        counterpartyState: vendorRow?.state ?? null,
      });
      const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();
      // Insert the invoice and post its balanced GL journal entry atomically —
      // so balance-based dashboards (burn rate, cash runway, AP aging) see the
      // same money the AP/AR page reads directly from `invoices`.
      const inv = await db.transaction(async (tx) => {
        const [row] = await tx.insert(invoices).values({
          orgId: org!.id,
          vendorId: input.vendorId,
          legalEntityId: input.legalEntityId ?? null,
          invoiceFlow: "payable",
          invoiceNumber: input.invoiceNumber,
          invoiceType: "tax_invoice",
          supplierGstin: vendorRow?.gstin ?? null,
          amount: gst.amount,
          taxableValue: gst.taxableValue,
          cgstAmount: gst.cgstAmount,
          sgstAmount: gst.sgstAmount,
          igstAmount: gst.igstAmount,
          totalTaxAmount: gst.totalTaxAmount,
          isInterstate: gst.isInterstate,
          status: "pending",
          matchingStatus: "pending",
          invoiceDate,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        }).returning();
        await postInvoiceJournalEntry(tx, {
          orgId: org!.id,
          createdById: ctx.user!.id,
          invoiceFlow: "payable",
          invoiceNumber: input.invoiceNumber,
          date: invoiceDate,
          taxableValue: Number(gst.taxableValue),
          cgstAmount: Number(gst.cgstAmount),
          sgstAmount: Number(gst.sgstAmount),
          igstAmount: Number(gst.igstAmount),
          isInterstate: gst.isInterstate,
          grossTotal: Number(gst.amount),
          financialYear: currentFY(invoiceDate),
        });
        return row;
      });

      // Fire-and-forget automation hooks — AFTER the TX commits, so a failing
      // rule/webhook can never roll back the invoice + its journal entry.
      if (inv) {
        const entity = inv as unknown as Record<string, unknown>;
        void runEntityBusinessRules(db, { orgId: org!.id, entityType: "invoice", event: "created", entity, changes: {} });
        void emitDomainEvent(db, { orgId: org!.id, type: "invoice_created", payload: { invoiceId: inv.id } });
      }

      return { ...inv, duplicatePayableWarning: dup > 0 && policy === "warn" };
    }),

  /** Customer AR: counterparty is a row in `vendors` (e.g. vendor_type = customer). */
  createReceivableInvoice: permissionProcedure("financial", "write")
    .input(
      z.object({
        customerVendorId: z.string().uuid(),
        invoiceNumber: z.string().min(1),
        amount: z.string(),
        gstRate: GST_RATE_INPUT,
        dueDate: z.string().optional(),
        invoiceDate: z.string().optional(),
        legalEntityId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      if (input.legalEntityId) {
        const [le] = await db
          .select({ id: legalEntities.id })
          .from(legalEntities)
          .where(and(eq(legalEntities.id, input.legalEntityId), eq(legalEntities.orgId, org!.id)));
        if (!le) throw new TRPCError({ code: "BAD_REQUEST", message: "Legal entity not found" });
      }
      // AR: the org is the supplier, the customer (a `vendors` row) is the buyer.
      const [customerRow] = await db
        .select({ gstin: vendors.gstin, state: vendors.state })
        .from(vendors)
        .where(and(eq(vendors.id, input.customerVendorId), eq(vendors.orgId, org!.id)));
      const orgState = await resolveOrgState(db, org!.id);
      const gst = gstInvoiceColumns({
        taxableValue: Number(input.amount),
        gstRate: input.gstRate as GSTRate,
        orgState,
        counterpartyState: customerRow?.state ?? null,
      });
      const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();
      // Insert + post the balanced AR journal entry atomically (see createInvoice).
      const inv = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(invoices)
          .values({
            orgId: org!.id,
            vendorId: input.customerVendorId,
            legalEntityId: input.legalEntityId ?? null,
            invoiceFlow: "receivable",
            invoiceNumber: input.invoiceNumber,
            invoiceType: "tax_invoice",
            buyerGstin: customerRow?.gstin ?? null,
            amount: gst.amount,
            taxableValue: gst.taxableValue,
            cgstAmount: gst.cgstAmount,
            sgstAmount: gst.sgstAmount,
            igstAmount: gst.igstAmount,
            totalTaxAmount: gst.totalTaxAmount,
            isInterstate: gst.isInterstate,
            status: "pending",
            matchingStatus: "pending",
            invoiceDate,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          })
          .returning();
        await postInvoiceJournalEntry(tx, {
          orgId: org!.id,
          createdById: ctx.user!.id,
          invoiceFlow: "receivable",
          invoiceNumber: input.invoiceNumber,
          date: invoiceDate,
          taxableValue: Number(gst.taxableValue),
          cgstAmount: Number(gst.cgstAmount),
          sgstAmount: Number(gst.sgstAmount),
          igstAmount: Number(gst.igstAmount),
          isInterstate: gst.isInterstate,
          grossTotal: Number(gst.amount),
          financialYear: currentFY(invoiceDate),
        });
        return row;
      });
      return inv;
    }),

  /**
   * Recomputes GST for legacy invoices that were saved before the entry path
   * applied the GST engine (rows with `totalTaxAmount = 0`). The existing
   * `taxableValue` is preserved and tax is added on top; the gross `amount` is
   * updated to `taxableValue + tax`. Interstate split is re-derived per row from
   * the org + counterparty state. Admin-only; scoped to the caller's org.
   *
   * Pass `invoiceId` to fix a single invoice, or omit it to backfill every
   * zero-tax `tax_invoice` row in the org. `gstRate` defaults to 18%.
   */
  backfillInvoiceGst: adminProcedure
    .use(mfaGate)
    .input(
      z.object({
        gstRate: GST_RATE_INPUT,
        invoiceId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [
        eq(invoices.orgId, org!.id),
        eq(invoices.invoiceType, "tax_invoice"),
        eq(invoices.totalTaxAmount, "0"),
      ];
      if (input.invoiceId) conditions.push(eq(invoices.id, input.invoiceId));

      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          invoiceFlow: invoices.invoiceFlow,
          vendorId: invoices.vendorId,
          taxableValue: invoices.taxableValue,
          amount: invoices.amount,
          invoiceDate: invoices.invoiceDate,
        })
        .from(invoices)
        .where(and(...conditions));

      const orgState = await resolveOrgState(db, org!.id);
      const updated: Array<{ id: string; taxableValue: number; totalTax: number; total: number }> = [];

      for (const row of rows) {
        const [counterparty] = await db
          .select({ state: vendors.state })
          .from(vendors)
          .where(and(eq(vendors.id, row.vendorId), eq(vendors.orgId, org!.id)));
        // Prefer the stored taxable value; older rows set it equal to `amount`.
        const taxable = Number(row.taxableValue) || Number(row.amount);
        const gst = gstInvoiceColumns({
          taxableValue: taxable,
          gstRate: input.gstRate as GSTRate,
          orgState,
          counterpartyState: counterparty?.state ?? null,
        });
        const flow = row.invoiceFlow === "receivable" ? "receivable" : "payable";
        const jeDate = row.invoiceDate ?? new Date();
        // Rewrite the amounts, reverse any stale invoice JE, and re-post at the
        // new figures — all atomically so the ledger never diverges from the
        // invoice. If no JE was ever posted, the reversal is a no-op and we
        // simply post the fresh entry.
        await db.transaction(async (tx) => {
          await tx
            .update(invoices)
            .set({
              taxableValue: gst.taxableValue,
              cgstAmount: gst.cgstAmount,
              sgstAmount: gst.sgstAmount,
              igstAmount: gst.igstAmount,
              totalTaxAmount: gst.totalTaxAmount,
              isInterstate: gst.isInterstate,
              amount: gst.amount,
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, row.id));
          const reversed = await reverseInvoiceJournalEntry(tx, {
            orgId: org!.id,
            createdById: ctx.user!.id,
            invoiceNumber: row.invoiceNumber,
            date: jeDate,
            financialYear: currentFY(jeDate),
          });
          // Only re-post when we reversed an existing entry; otherwise the
          // create/receivable path (or a later backfillInvoiceJournals run) owns
          // the initial posting.
          if (reversed) {
            await postInvoiceJournalEntry(tx, {
              orgId: org!.id,
              createdById: ctx.user!.id,
              invoiceFlow: flow,
              invoiceNumber: row.invoiceNumber,
              date: jeDate,
              taxableValue: Number(gst.taxableValue),
              cgstAmount: Number(gst.cgstAmount),
              sgstAmount: Number(gst.sgstAmount),
              igstAmount: Number(gst.igstAmount),
              isInterstate: gst.isInterstate,
              grossTotal: Number(gst.amount),
              financialYear: currentFY(jeDate),
            });
          }
        });
        updated.push({
          id: row.id,
          taxableValue: Number(gst.taxableValue),
          totalTax: Number(gst.totalTaxAmount),
          total: Number(gst.amount),
        });
      }

      return { scanned: rows.length, updated: updated.length, invoices: updated };
    }),

  /**
   * Posts the missing GL journal entry for invoices created before invoice
   * creation began posting to the ledger. Idempotent: an invoice is skipped
   * when a `type = "invoice"` journal entry already references its number
   * (invoice numbers are unique per org). Each posting is atomic per invoice
   * so a mid-run failure never leaves a half-posted ledger. Admin-only; scoped
   * to the caller's org. Returns per-invoice results plus a skipped count.
   */
  backfillInvoiceJournals: adminProcedure
    .use(mfaGate)
    .input(z.object({ invoiceId: z.string().uuid().optional() }).default({}))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(invoices.orgId, org!.id)];
      if (input.invoiceId) conditions.push(eq(invoices.id, input.invoiceId));

      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          invoiceFlow: invoices.invoiceFlow,
          taxableValue: invoices.taxableValue,
          cgstAmount: invoices.cgstAmount,
          sgstAmount: invoices.sgstAmount,
          igstAmount: invoices.igstAmount,
          isInterstate: invoices.isInterstate,
          amount: invoices.amount,
          invoiceDate: invoices.invoiceDate,
        })
        .from(invoices)
        .where(and(...conditions));

      // Numbers that already carry an invoice-type journal entry — skip these.
      const existing = await db
        .select({ reference: journalEntries.reference })
        .from(journalEntries)
        .where(and(eq(journalEntries.orgId, org!.id), eq(journalEntries.type, "invoice")));
      const alreadyPosted = new Set(existing.map((e) => e.reference).filter(Boolean) as string[]);

      const posted: Array<{ id: string; invoiceNumber: string; journalEntryId: string }> = [];
      let skipped = 0;
      let unposted = 0; // COA not seeded → helper returned null

      for (const row of rows) {
        if (alreadyPosted.has(row.invoiceNumber)) {
          skipped++;
          continue;
        }
        const jeId = await db.transaction((tx) =>
          postInvoiceJournalEntry(tx, {
            orgId: org!.id,
            createdById: ctx.user!.id,
            invoiceFlow: row.invoiceFlow === "receivable" ? "receivable" : "payable",
            invoiceNumber: row.invoiceNumber,
            date: row.invoiceDate ?? new Date(),
            taxableValue: Number(row.taxableValue),
            cgstAmount: Number(row.cgstAmount),
            sgstAmount: Number(row.sgstAmount),
            igstAmount: Number(row.igstAmount),
            isInterstate: row.isInterstate,
            grossTotal: Number(row.amount),
            financialYear: currentFY(row.invoiceDate ?? new Date()),
          }),
        );
        if (jeId === null) {
          unposted++;
          continue;
        }
        // Guard against a duplicate number within this same batch.
        alreadyPosted.add(row.invoiceNumber);
        posted.push({ id: row.id, invoiceNumber: row.invoiceNumber, journalEntryId: jeId });
      }

      return { scanned: rows.length, posted: posted.length, skipped, unposted, invoices: posted };
    }),

  listInvoices: permissionProcedure("financial", "read")
    .input(z.object({
      direction: z.enum(["payable", "receivable"]).optional(),
      status: z.enum(invoiceStatusEnum.enumValues).optional(),
      limit: z.coerce.number().default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const conditions = [eq(invoices.orgId, org!.id)];
      if (input.direction) {
        conditions.push(eq(invoices.invoiceFlow, input.direction));
      }
      if (input.status) conditions.push(eq(invoices.status, input.status));

      const base = await db
        .select({
          ...getTableColumns(invoices),
          vendorName: vendors.name,
          legalEntityCode: legalEntities.code,
          legalEntityName: legalEntities.name,
        })
        .from(invoices)
        .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
        .leftJoin(legalEntities, eq(invoices.legalEntityId, legalEntities.id))
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

  getInvoice: permissionProcedure("financial", "read")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({
          ...getTableColumns(invoices),
          vendorName: vendors.name,
          legalEntityCode: legalEntities.code,
          legalEntityName: legalEntities.name,
        })
        .from(invoices)
        .leftJoin(vendors, eq(invoices.vendorId, vendors.id))
        .leftJoin(legalEntities, eq(invoices.legalEntityId, legalEntities.id))
        .where(and(eq(invoices.id, input.id), eq(invoices.orgId, org!.id)));

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  approveInvoice: permissionProcedure("financial", "write")
    .use(mfaGate)
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
    .use(mfaGate)
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

      // Flip the status and post the settlement entry atomically so the AP/AR
      // control account is relieved against cash in the same transaction.
      const paidAt = new Date();
      const inv = await db.transaction(async (tx) => {
        const [row] = await tx.update(invoices)
          .set({ status: "paid", paidAt, paymentMethod: input.paymentMethod, updatedAt: paidAt })
          .where(and(eq(invoices.id, input.id), eq(invoices.orgId, org!.id)))
          .returning();
        await postInvoiceSettlementEntry(tx, {
          orgId: org!.id,
          createdById: user!.id,
          invoiceFlow: existing.invoiceFlow === "receivable" ? "receivable" : "payable",
          invoiceNumber: existing.invoiceNumber,
          date: paidAt,
          grossTotal: Number(existing.amount),
          financialYear: currentFY(paidAt),
        });
        return row;
      });
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

      const [orgRowGst] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const settingsGst = orgRowGst?.settings ?? org!.settings;
      const policy = getDuplicatePayablePolicy(settingsGst);
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

      // Insert the invoice and post its balanced GL journal entry atomically so
      // the AP control account and balance-based dashboards track this path too
      // (mirrors createInvoice). Tax is already computed per line above.
      const invoice = await db.transaction(async (tx) => {
        const [row] = await tx
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
          })
          .returning();
        await postInvoiceJournalEntry(tx, {
          orgId: org!.id,
          createdById: ctx.user!.id,
          invoiceFlow: "payable",
          invoiceNumber: input.invoiceNumber,
          date: input.invoiceDate,
          taxableValue: totalTaxableValue,
          cgstAmount: totalCgst,
          sgstAmount: totalSgst,
          igstAmount: totalIgst,
          isInterstate,
          grossTotal: totalAmount,
          financialYear: currentFY(input.invoiceDate),
        });
        return row;
      });

      const eInvoiceRequired = isEInvoiceRequired(0);
      const eWayBillRequired = isEWayBillRequired({ isGoods: true, consignmentValue: totalTaxableValue });

      // Dual-write hook: enqueue ClearTax IRN generation. Worker is
      // soft-fail when no integration is connected, so this is safe even
      // for tenants who haven't onboarded ClearTax yet.
      let eInvoiceQueued = false;
      if (eInvoiceRequired && invoice) {
        try {
          await db
            .update(invoices)
            .set({ eInvoiceStatus: "pending" })
            .where(eq(invoices.id, invoice.id));
          await enqueueIrnGenerationJob(getWorkflowService().irnQueue, {
            invoiceId: invoice.id,
            orgId: org!.id,
          });
          eInvoiceQueued = true;
        } catch (err) {
          // Workflow service may not be initialised in unit tests; never
          // fail the user's save because of an out-of-band queue issue.
          console.warn("[financial] IRN enqueue skipped:", (err as Error).message);
        }
      }

      return {
        invoice,
        eInvoiceRequired,
        eInvoiceQueued,
        eWayBillRequired,
        duplicatePayableWarning: dup > 0 && policy === "warn",
        summary: { totalTaxableValue, totalCgst, totalSgst, totalIgst, totalTax, totalAmount, isInterstate },
      };
    }),

  /**
   * Admin-driven retry of a failed IRN generation. Re-enqueues with `force=true`
   * which bypasses the "already issued" guard so a new IRN is requested.
   * Use when ClearTax was unreachable during the original save and the
   * background retries also failed.
   */
  retryEInvoiceGeneration: permissionProcedure("financial", "write")
    .use(mfaGate)
    .input(z.object({ invoiceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { db, org } = ctx;
      const [inv] = await db
        .select({ id: invoices.id, status: invoices.eInvoiceStatus })
        .from(invoices)
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, org!.id)));
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      await db
        .update(invoices)
        .set({ eInvoiceStatus: "pending", eInvoiceError: null, updatedAt: new Date() })
        .where(eq(invoices.id, inv.id));
      await enqueueIrnGenerationJob(getWorkflowService().irnQueue, {
        invoiceId: inv.id,
        orgId: org!.id,
        force: true,
      });
      return { ok: true };
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
        .where(eq(invoices.orgId, org!.id));

      const bookLines = allInvoices
        .filter((inv) => {
          if (!inv.invoiceDate) return false;
          const d = new Date(inv.invoiceDate);
          return d >= startDate && d <= endDate;
        })
        .map((inv) => ({
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

  /**
   * Stateful GSTR-2B ITC reconciliation.
   *
   * Unlike `gstr2bReconcile` (which reconciles on the fly and returns a
   * transient result), this *ingests* a portal GSTR-2B statement for a period,
   * reconciles it against the book purchase invoices, and persists both the
   * per-invoice outcome and the period totals. The eligible ITC that may be
   * claimed in GSTR-3B is the tax on `matched` lines only — mismatches are held
   * pending correction and `missing_in_2b` invoices aren't yet claimable because
   * the supplier hasn't filed. Re-ingesting a period replaces the prior run.
   */
  gstr2b: router({
    ingest: permissionProcedure("financial", "write")
      .input(
        z.object({
          gstinId: z.string().uuid().optional(),
          month: z.number().int().min(1).max(12),
          year: z.number().int(),
          lines: z.array(
            z.object({
              supplierGstin: z.string().min(1),
              invoiceNumber: z.string().min(1),
              invoiceDate: z.string().optional(),
              taxableValue: z.number().default(0),
              igst: z.number().default(0),
              cgst: z.number().default(0),
              sgst: z.number().default(0),
            }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org, user } = ctx;
        const { reconcileGSTR2B } = await import("../lib/india/gst-engine.js");
        const { gstr2bImports, gstr2bReconLines, gstinRegistry } = await import("@coheronconnect/db");

        // Validate the GSTIN (if supplied) belongs to this org.
        if (input.gstinId) {
          const [g] = await db
            .select()
            .from(gstinRegistry)
            .where(and(eq(gstinRegistry.id, input.gstinId), eq(gstinRegistry.orgId, org!.id)));
          if (!g) throw new TRPCError({ code: "NOT_FOUND", message: "GSTIN not found" });
        }

        const startDate = new Date(input.year, input.month - 1, 1);
        const endDate = new Date(input.year, input.month, 0, 23, 59, 59);

        const allInvoices = await db.select().from(invoices).where(eq(invoices.orgId, org!.id));
        const bookLines = allInvoices
          .filter((inv) => {
            if (!inv.invoiceDate) return false;
            const d = new Date(inv.invoiceDate);
            return d >= startDate && d <= endDate;
          })
          .map((inv) => ({
            supplierGstin: inv.supplierGstin ?? "",
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : "",
            taxableValue: Number(inv.taxableValue ?? 0),
            igst: Number(inv.igstAmount ?? 0),
            cgst: Number(inv.cgstAmount ?? 0),
            sgst: Number(inv.sgstAmount ?? 0),
          }));

        const portalLines = input.lines.map((l) => ({ ...l, invoiceDate: l.invoiceDate ?? "" }));
        const result = reconcileGSTR2B(bookLines, portalLines);

        // Portal ITC = all tax in the 2B statement; eligible = matched-line tax.
        const portalItc = input.lines.reduce((s, l) => s + l.igst + l.cgst + l.sgst, 0);
        const eligibleItc = result
          .filter((r) => r.status === "matched")
          .reduce((s, r) => s + (r.gstr2bValues ? r.gstr2bValues.igst + r.gstr2bValues.cgst + r.gstr2bValues.sgst : 0), 0);

        const counts = {
          matched: result.filter((r) => r.status === "matched").length,
          mismatch: result.filter((r) => r.status === "mismatch").length,
          missingIn2b: result.filter((r) => r.status === "missing_in_2b").length,
          missingInBooks: result.filter((r) => r.status === "missing_in_books").length,
        };

        const fy = input.month >= 4 ? `${input.year}-${input.year + 1}` : `${input.year - 1}-${input.year}`;

        return await db.transaction(async (tx) => {
          // Re-ingesting a period replaces the prior run (recon lines cascade).
          const prior = await tx
            .select({ id: gstr2bImports.id })
            .from(gstr2bImports)
            .where(
              and(
                eq(gstr2bImports.orgId, org!.id),
                eq(gstr2bImports.month, input.month),
                eq(gstr2bImports.year, input.year),
                input.gstinId ? eq(gstr2bImports.gstinId, input.gstinId) : sql`${gstr2bImports.gstinId} is null`,
              ),
            );
          for (const p of prior) {
            await tx.delete(gstr2bImports).where(eq(gstr2bImports.id, p.id));
          }

          const [imp] = await tx
            .insert(gstr2bImports)
            .values({
              orgId: org!.id,
              gstinId: input.gstinId ?? null,
              month: input.month,
              year: input.year,
              financialYear: fy,
              totalLines: result.length,
              matchedCount: counts.matched,
              mismatchCount: counts.mismatch,
              missingIn2bCount: counts.missingIn2b,
              missingInBooksCount: counts.missingInBooks,
              portalItc: String(portalItc),
              eligibleItc: String(eligibleItc),
              createdById: user?.id ?? null,
            })
            .returning();

          if (result.length > 0) {
            await tx.insert(gstr2bReconLines).values(
              result.map((r) => ({
                orgId: org!.id,
                importId: imp!.id,
                supplierGstin: r.supplierGstin,
                invoiceNumber: r.invoiceNumber,
                invoiceDate: r.bookValues?.invoiceDate ?? r.gstr2bValues?.invoiceDate ?? null,
                status: r.status,
                bookTaxable: r.bookValues ? String(r.bookValues.taxableValue) : null,
                bookIgst: r.bookValues ? String(r.bookValues.igst) : null,
                bookCgst: r.bookValues ? String(r.bookValues.cgst) : null,
                bookSgst: r.bookValues ? String(r.bookValues.sgst) : null,
                portalTaxable: r.gstr2bValues ? String(r.gstr2bValues.taxableValue) : null,
                portalIgst: r.gstr2bValues ? String(r.gstr2bValues.igst) : null,
                portalCgst: r.gstr2bValues ? String(r.gstr2bValues.cgst) : null,
                portalSgst: r.gstr2bValues ? String(r.gstr2bValues.sgst) : null,
              })),
            );
          }

          return { import: imp!, counts, portalItc, eligibleItc };
        });
      }),

    /** List persisted GSTR-2B import runs (newest first). */
    list: permissionProcedure("financial", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const { gstr2bImports } = await import("@coheronconnect/db");
      return db
        .select()
        .from(gstr2bImports)
        .where(eq(gstr2bImports.orgId, org!.id))
        .orderBy(desc(gstr2bImports.createdAt));
    }),

    /** Full detail (header + reconciled lines) of one import run. */
    get: permissionProcedure("financial", "read")
      .input(z.object({ importId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const { gstr2bImports, gstr2bReconLines } = await import("@coheronconnect/db");
        const [imp] = await db
          .select()
          .from(gstr2bImports)
          .where(and(eq(gstr2bImports.id, input.importId), eq(gstr2bImports.orgId, org!.id)));
        if (!imp) throw new TRPCError({ code: "NOT_FOUND" });
        const lines = await db
          .select()
          .from(gstr2bReconLines)
          .where(eq(gstr2bReconLines.importId, imp.id));
        return { import: imp, lines };
      }),
  }),

  /** Closed accounting months (`YYYY-MM`) — blocks mark-paid in those periods (US-FIN-007 / US-CRM-007 checklist). */
  periodClose: router({
    get: permissionProcedure("financial", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const closed = parseOrgSettings(row?.settings).financial?.closedPeriods;
      return { closedPeriods: [...(closed ?? [])].sort() };
    }),

    setClosedPeriods: adminProcedure
      .input(
        z.object({
          periods: z.array(z.string().regex(/^\d{4}-\d{2}$/)).max(240),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const normalized = [...new Set(input.periods)].sort();
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevFin = (raw.financial as Record<string, unknown> | undefined) ?? {};
        const financial = {
          ...prevFin,
          closedPeriods: normalized,
        };
        await db
          .update(organizations)
          .set({
            settings: {
              ...raw,
              financial,
            },
          })
          .where(eq(organizations.id, org!.id));

        return { ok: true as const, closedPeriods: normalized };
      }),

    /**
     * Pre-close checklist for a calendar month (`YYYY-MM`, UTC boundaries).
     * US-CRM-007 / US-FIN-007 — finance self-service before adding the month to `closedPeriods`.
     */
    preflight: permissionProcedure("financial", "read")
      .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [y, mo] = input.period.split("-").map((x) => Number(x));
        if (!y || !mo || mo < 1 || mo > 12) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid period" });
        }
        const start = new Date(Date.UTC(y, mo - 1, 1));
        const endExclusive = new Date(Date.UTC(y, mo, 1));

        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const closed = parseOrgSettings(row?.settings).financial?.closedPeriods ?? [];
        const alreadyClosed = closed.includes(input.period);

        const terminal = ["paid", "cancelled"] as const;

        const [apRow] = await db
          .select({ c: count() })
          .from(invoices)
          .where(
            and(
              eq(invoices.orgId, org!.id),
              eq(invoices.invoiceFlow, "payable"),
              gte(invoices.invoiceDate, start),
              lt(invoices.invoiceDate, endExclusive),
              notInArray(invoices.status, [...terminal]),
            ),
          );

        const [arRow] = await db
          .select({ c: count() })
          .from(invoices)
          .where(
            and(
              eq(invoices.orgId, org!.id),
              eq(invoices.invoiceFlow, "receivable"),
              gte(invoices.invoiceDate, start),
              lt(invoices.invoiceDate, endExclusive),
              notInArray(invoices.status, [...terminal]),
            ),
          );

        const [matchRow] = await db
          .select({ c: count() })
          .from(invoices)
          .where(
            and(
              eq(invoices.orgId, org!.id),
              eq(invoices.invoiceFlow, "payable"),
              gte(invoices.invoiceDate, start),
              lt(invoices.invoiceDate, endExclusive),
              notInArray(invoices.status, ["cancelled"]),
              or(eq(invoices.matchingStatus, "pending"), eq(invoices.matchingStatus, "exception")),
            ),
          );

        const openAp = Number(apRow?.c ?? 0);
        const openAr = Number(arRow?.c ?? 0);
        const matchingAttention = Number(matchRow?.c ?? 0);

        const monthName = new Date(Date.UTC(y, mo - 1, 15)).toLocaleString("en-IN", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });

        const checks = [
          {
            key: "period_not_closed",
            label: "Period not already closed in org settings",
            ok: !alreadyClosed,
            count: alreadyClosed ? 1 : 0,
            hint: alreadyClosed
              ? "This month is in the closed list — remove it under Admin → Accounting periods to post or pay in-period invoices."
              : "Safe to proceed toward close once other checks pass.",
          },
          {
            key: "open_ap",
            label: "No open AP invoices dated in this month",
            ok: openAp === 0,
            count: openAp,
            hint:
              openAp > 0
                ? "Approve / pay / cancel remaining vendor invoices dated in this month, or move dates."
                : "All payable invoices for this month are paid or cancelled.",
          },
          {
            key: "open_ar",
            label: "No open AR invoices dated in this month",
            ok: openAr === 0,
            count: openAr,
            hint:
              openAr > 0
                ? "Collect or write off customer invoices dated in this month."
                : "All receivable invoices for this month are paid or cancelled.",
          },
          {
            key: "matching_clear",
            label: "No payable matching exceptions left in this month",
            ok: matchingAttention === 0,
            count: matchingAttention,
            hint:
              matchingAttention > 0
                ? "Resolve PO/GRN matching (pending or exception) before locking the period."
                : "No pending or exception matching rows for this month.",
          },
        ] as const;

        const allClear = checks.every((c) => c.ok);

        return {
          period: input.period,
          rangeLabel: `${monthName} (UTC)`,
          alreadyClosed,
          openApInPeriod: openAp,
          openArInPeriod: openAr,
          payableMatchingAttention: matchingAttention,
          checks: [...checks],
          allClear,
        };
      }),
  }),
});
