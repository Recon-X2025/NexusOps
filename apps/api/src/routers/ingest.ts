import { router, permissionProcedure } from "../lib/trpc";
import { z } from "zod";
import {
    legalMatters,
    contracts,
    crmLeads,
    crmContacts,
    crmDeals,
    vendors,
    invoices,
    gstinRegistry,
    eq,
    and,
    desc,
    type DbOrTx,
} from "@coheronconnect/db";
import { getNextNumber, syncOrgCounters } from "../lib/auto-number";
import { computeGST, type GSTRate } from "../lib/india/gst-engine";
import { postInvoiceJournalEntry } from "../lib/invoice-journal";
import { currentFY } from "./accounting";

const MatterIngestSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(["litigation", "employment", "ip", "regulatory", "ma", "data_privacy", "corporate", "commercial"]).default("commercial"),
    status: z.enum(["intake", "active", "discovery", "pre_trial", "trial", "closed", "settled"]).default("intake"),
    externalCounsel: z.string().optional(),
    jurisdiction: z.string().optional(),
    cnr: z.string().optional(),
    courtName: z.string().optional(),
    nextHearingAt: z.string().optional(),
    limitationDeadlineAt: z.string().optional(),
});

const ContractIngestSchema = z.object({
    title: z.string().min(1),
    contractType: z.enum([
        "nda", "msa", "sow", "license", "customer_agreement",
        "sla_support", "colocation", "employment", "vendor", "partnership",
    ]).default("vendor"),
    counterparty: z.string().min(1),
    amount: z.string().optional(),
    currency: z.string().default("INR"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.enum([
        "draft", "under_review", "legal_review", "awaiting_signature",
        "active", "expiring_soon", "expired", "terminated",
    ]).default("active"),
});

const LeadIngestSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
    source: z.enum(["website", "referral", "event", "cold_outreach", "partner", "advertising", "other"]).default("website"),
    status: z.enum(["new", "contacted", "qualified", "converted", "disqualified"]).default("new"),
    notes: z.string().optional(),
});

const ContactIngestSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().optional(),
    title: z.string().optional(),
});

const DealIngestSchema = z.object({
    title: z.string().min(1),
    stage: z.enum(["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"]).default("prospect"),
    value: z.string().optional(),
    probability: z.coerce.number().min(0).max(100).default(10),
    expectedClose: z.string().optional(),
});

const VendorIngestSchema = z.object({
    name: z.string().min(1),
    vendorType: z.string().default("goods_supplier"),
    gstin: z.string().optional(),
    pan: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    contactPersonName: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    paymentTerms: z.string().optional(),
    status: z.string().default("active"),
});

const InvoiceIngestSchema = z.object({
    invoiceNumber: z.string().min(1),
    vendorId: z.string().uuid(),
    // `amount` is the taxable value; GST is derived on top (mirrors createInvoice).
    amount: z.string().min(1),
    gstRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]).default(18),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
});

/**
 * The org's own place-of-supply state (primary/first active GSTIN registration),
 * used to decide the intra-vs-inter-state GST split. Returns `null` when the org
 * has no GSTIN on file — the intra-state split is then the safe default (total
 * tax is identical either way; only the CGST/SGST-vs-IGST breakdown differs).
 * Mirrors `resolveOrgState` in `routers/financial.ts`.
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

export const ingestRouter = router({
    /**
     * Bulk import legal matters.
     * Automatically assigns matter numbers and syncs org counters.
     */
    importMatters: permissionProcedure("legal", "write")
        .input(z.array(MatterIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org, user } = ctx;
            const results = [];

            for (const item of input) {
                const matterNumber = await getNextNumber(db, org!.id, "MAT");
                const { nextHearingAt, limitationDeadlineAt, ...rest } = item;

                const [row] = await db.insert(legalMatters).values({
                    orgId: org!.id,
                    matterNumber,
                    ...rest,
                    assignedTo: user!.id,
                    nextHearingAt: nextHearingAt ? new Date(nextHearingAt) : undefined,
                    limitationDeadlineAt: limitationDeadlineAt ? new Date(limitationDeadlineAt) : undefined,
                }).returning();

                if (row) results.push(row.id);
            }

            // Sync counters after bulk import to ensure no collisions
            await syncOrgCounters(db);

            return { imported: results.length, ids: results };
        }),

    /**
     * Bulk import contracts.
     */
    importContracts: permissionProcedure("contracts", "write")
        .input(z.array(ContractIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org, user } = ctx;
            const results = [];

            for (const item of input) {
                const contractNumber = await getNextNumber(db, org!.id, "CON");
                const { startDate, endDate, contractType, amount, ...rest } = item;

                const [row] = await db.insert(contracts).values({
                    orgId: org!.id,
                    contractNumber,
                    ...rest,
                    type: contractType,
                    value: amount,
                    internalOwnerId: user!.id,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                }).returning();

                if (row) results.push(row.id);
            }

            await syncOrgCounters(db);

            return { imported: results.length, ids: results };
        }),

    /**
     * Bulk import CRM leads. UUID-keyed; no auto-number.
     */
    importLeads: permissionProcedure("accounts", "write")
        .input(z.array(LeadIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org, user } = ctx;
            const results: string[] = [];

            for (const item of input) {
                const [row] = await db.insert(crmLeads).values({
                    orgId: org!.id,
                    ...item,
                    ownerId: user!.id,
                }).returning();
                results.push(row!.id);
            }

            return { imported: results.length, ids: results };
        }),

    /**
     * Bulk import CRM contacts. UUID-keyed; no auto-number.
     */
    importContacts: permissionProcedure("accounts", "write")
        .input(z.array(ContactIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org } = ctx;
            const results: string[] = [];

            for (const item of input) {
                const [row] = await db.insert(crmContacts).values({
                    orgId: org!.id,
                    ...item,
                }).returning();
                results.push(row!.id);
            }

            return { imported: results.length, ids: results };
        }),

    /**
     * Bulk import CRM deals. weightedValue derived from value * probability.
     */
    importDeals: permissionProcedure("accounts", "write")
        .input(z.array(DealIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org, user } = ctx;
            const results: string[] = [];

            for (const item of input) {
                const { expectedClose, value, probability, ...rest } = item;
                const weightedValue = value
                    ? String(Number(value) * (probability / 100))
                    : undefined;
                const [row] = await db.insert(crmDeals).values({
                    orgId: org!.id,
                    ...rest,
                    value,
                    probability,
                    weightedValue,
                    ownerId: user!.id,
                    expectedClose: expectedClose ? new Date(expectedClose) : undefined,
                }).returning();
                results.push(row!.id);
            }

            return { imported: results.length, ids: results };
        }),

    /**
     * Bulk import vendors. UUID-keyed; GSTIN/PAN are natural match keys.
     */
    importVendors: permissionProcedure("procurement", "write")
        .input(z.array(VendorIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org } = ctx;
            const results: string[] = [];

            for (const item of input) {
                const [row] = await db.insert(vendors).values({
                    orgId: org!.id,
                    ...item,
                }).returning();
                results.push(row!.id);
            }

            return { imported: results.length, ids: results };
        }),

    /**
     * Bulk import payable invoices. invoiceNumber comes from the source document
     * (vendor's number) and must reference an existing vendor in the org.
     * Skips rows whose (vendor, invoiceNumber) already exists to avoid duplicates.
     */
    importInvoices: permissionProcedure("financial", "write")
        .input(z.array(InvoiceIngestSchema))
        .mutation(async ({ ctx, input }) => {
            const { db, org, user } = ctx;
            const results: string[] = [];
            const skipped: Array<{ invoiceNumber: string; reason: string }> = [];

            // Org place-of-supply state is stable across the batch — resolve once.
            const orgState = await resolveOrgState(db, org!.id);

            for (const item of input) {
                // Vendor must belong to this org. Pull its state so GST splits
                // intra-vs-inter-state correctly (as createInvoice does).
                const [vendor] = await db
                    .select({ id: vendors.id, gstin: vendors.gstin, state: vendors.state })
                    .from(vendors)
                    .where(and(eq(vendors.id, item.vendorId), eq(vendors.orgId, org!.id)));
                if (!vendor) {
                    skipped.push({ invoiceNumber: item.invoiceNumber, reason: "vendor not found in org" });
                    continue;
                }

                // De-dupe on (vendor, invoiceNumber).
                const [dup] = await db
                    .select({ id: invoices.id })
                    .from(invoices)
                    .where(and(
                        eq(invoices.orgId, org!.id),
                        eq(invoices.vendorId, item.vendorId),
                        eq(invoices.invoiceNumber, item.invoiceNumber),
                    ));
                if (dup) {
                    skipped.push({ invoiceNumber: item.invoiceNumber, reason: "duplicate (vendor + number)" });
                    continue;
                }

                // Treat the imported `amount` as the taxable value and derive GST
                // on top — the bulk path previously stored zero tax and posted no
                // journal entry, so GL-balance dashboards drifted from AP/AR.
                const supplierState = orgState ?? "";
                const gst = computeGST({
                    taxableValue: Number(item.amount),
                    gstRate: item.gstRate as GSTRate,
                    supplierState,
                    buyerState: vendor.state ?? supplierState,
                });
                const invoiceDate = item.invoiceDate ? new Date(item.invoiceDate) : new Date();

                // Insert the invoice and post its balanced GL journal entry
                // atomically, mirroring financial.createInvoice.
                const row = await db.transaction(async (tx) => {
                    const [inserted] = await tx.insert(invoices).values({
                        orgId: org!.id,
                        vendorId: item.vendorId,
                        invoiceFlow: "payable",
                        invoiceNumber: item.invoiceNumber,
                        invoiceType: "tax_invoice",
                        supplierGstin: vendor.gstin ?? null,
                        amount: String(gst.invoiceTotal),
                        taxableValue: String(gst.taxableValue),
                        cgstAmount: String(gst.cgstAmount),
                        sgstAmount: String(gst.sgstAmount),
                        igstAmount: String(gst.igstAmount),
                        totalTaxAmount: String(gst.totalTaxAmount),
                        isInterstate: gst.isInterstate,
                        status: "pending",
                        matchingStatus: "pending",
                        invoiceDate,
                        dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
                    }).returning();
                    await postInvoiceJournalEntry(tx, {
                        orgId: org!.id,
                        createdById: user!.id,
                        invoiceFlow: "payable",
                        invoiceNumber: item.invoiceNumber,
                        date: invoiceDate,
                        taxableValue: gst.taxableValue,
                        cgstAmount: gst.cgstAmount,
                        sgstAmount: gst.sgstAmount,
                        igstAmount: gst.igstAmount,
                        isInterstate: gst.isInterstate,
                        grossTotal: gst.invoiceTotal,
                        financialYear: currentFY(invoiceDate),
                    });
                    return inserted;
                });
                results.push(row!.id);
            }

            return { imported: results.length, ids: results, skipped };
        }),
});
