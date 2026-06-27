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
    eq,
    and,
} from "@coheronconnect/db";
import { getNextNumber, syncOrgCounters } from "../lib/auto-number";

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
    contractType: z.string().default("general"),
    counterparty: z.string().optional(),
    amount: z.string().optional(),
    currency: z.string().default("INR"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.string().default("active"),
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
    amount: z.string().min(1),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
});

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

                results.push(row.id);
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
                const { startDate, endDate, ...rest } = item;

                const [row] = await db.insert(contracts).values({
                    orgId: org!.id,
                    contractNumber,
                    ...rest,
                    ownerId: user!.id,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                }).returning();

                results.push(row.id);
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
            const { db, org } = ctx;
            const results: string[] = [];
            const skipped: Array<{ invoiceNumber: string; reason: string }> = [];

            for (const item of input) {
                // Vendor must belong to this org.
                const [vendor] = await db
                    .select({ id: vendors.id })
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

                const [row] = await db.insert(invoices).values({
                    orgId: org!.id,
                    vendorId: item.vendorId,
                    invoiceFlow: "payable",
                    invoiceNumber: item.invoiceNumber,
                    invoiceType: "tax_invoice",
                    amount: item.amount,
                    taxableValue: item.amount,
                    status: "pending",
                    matchingStatus: "pending",
                    invoiceDate: item.invoiceDate ? new Date(item.invoiceDate) : new Date(),
                    dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
                } as any).returning();
                results.push(row!.id);
            }

            return { imported: results.length, ids: results, skipped };
        }),
});
