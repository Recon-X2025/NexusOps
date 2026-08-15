import { router, permissionProcedure } from "../lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
    legalMatters,
    contracts,
    crmLeads,
    crmContacts,
    crmDeals,
    vendors,
    invoices,
    invoiceLineItems,
    gstinRegistry,
    employees,
    users,
    salaryStructures,
    professionalTaxSlabs,
    eq,
    and,
    or,
    isNull,
    desc,
    type DbOrTx,
} from "@coheronconnect/db";
import { getNextNumber, getNextEmployeeNumber, syncOrgCounters } from "../lib/auto-number";
import { computeGST, normaliseGstStateOrWarn, type GSTRate } from "../lib/india/gst-engine";
import { computeInvoiceFromLines } from "../lib/invoice-lines";
import { postInvoiceJournalEntry } from "../lib/invoice-journal";
import { computeRetainUntil } from "../lib/retention";
import { panColumnsTolerant, employeePanField } from "../lib/pan";
import { currentFY } from "./accounting";
import { SalaryStructureFormSchema } from "./payroll";

/**
 * Salary-structure import template — the SINGLE source for both the downloadable template and
 * the importer's required-column check, so the two cannot drift (SHA-DRIFT precedent). Basic is
 * derived (50 − DA), so it is deliberately NOT a column.
 */
const STRUCTURE_TEMPLATE_COLUMNS = [
  { key: "structure_name", required: true, note: "The employee importer links on this — must match exactly" },
  { key: "base_pay_annual", required: true, note: "The payslip's Gross Earnings × 12. Includes the employee's own PF; excludes employer PF, gratuity, bonus" },
  { key: "da_percent", required: true, note: "0 for basic-alone. Basic is derived as 50 − DA, not supplied" },
  { key: "hra_percent_of_basic", required: true, note: "40 or 50 typical — what is paid, unrelated to the exemption cap" },
  { key: "lta_annual", required: false, note: "Default 0. Sits inside Base Pay" },
  { key: "effective_from", required: true, note: "YYYY-MM-DD" },
  { key: "effective_to", required: false, note: "Blank = open-ended" },
] as const;

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

const GstRateInput = z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]).default(18);

/** One authoritative bulk-import line (A7); mirrors financial.ts INVOICE_LINE_INPUT. */
const InvoiceLineIngestSchema = z.object({
    description: z.string().min(1),
    taxableValue: z.number(),
    gstRate: GstRateInput,
    hsnSacCode: z.string().optional(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    unitPrice: z.number().optional(),
    discountPercent: z.number().optional(),
    discountAmount: z.number().optional(),
});

const InvoiceIngestSchema = z.object({
    invoiceNumber: z.string().min(1),
    vendorId: z.string().uuid(),
    // `amount` is the taxable value; GST is derived on top (mirrors createInvoice).
    amount: z.string().min(1),
    gstRate: GstRateInput,
    // A7: optional authoritative line items. When present, tax is per-line
    // (half-up 2dp) and the header is the rounded sum; `amount`/`gstRate` ignored.
    lines: z.array(InvoiceLineIngestSchema).min(1).optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
});

/**
 * ONE bulk-import employee row.
 *
 * DELIBERATELY TOLERANT at the tRPC boundary — every field is an optional string. tRPC validates
 * the whole `z.array` before the mutation body runs, so a strict per-field schema (like
 * `importVendors`) would reject the ENTIRE batch on one bad row. The onboarding brief is the
 * opposite: skip the bad row, name it, import the rest. So the boundary accepts anything and the
 * mutation validates each row itself (email format + uniqueness, PAN format via `employeePanField`,
 * structure-name resolution, state presence, enum + date checks), collecting failures into
 * `skipped[]` — the `importInvoices` shape, not `importVendors`'. Values arrive as raw CSV strings.
 */
const EmployeeIngestRowSchema = z
    .object({
        // Identity — name + email are required (a user row is created per employee; users.userId is
        // NOT NULL, users.email is unique per org). Validated in the body, not here, so a bad row skips.
        name: z.string().optional(),
        email: z.string().optional(),
        // Pay — resolved by NAME to a salary-structure family; never auto-created (a structure invented
        // at import time would set everyone's basic %, the figure under CA review for the 50% wage floor).
        structureName: z.string().optional(),
        // Org placement.
        department: z.string().optional(),
        title: z.string().optional(),
        jobGrade: z.string().optional(),
        employmentType: z.string().optional(),
        location: z.string().optional(),
        // Statutory location — state drives PT slab selection (required in the body).
        state: z.string().optional(),
        city: z.string().optional(),
        isMetroCity: z.string().optional(),
        taxRegime: z.string().optional(),
        startDate: z.string().optional(),
        // Statutory identity.
        pan: z.string().optional(),
        uan: z.string().optional(),
        esiIpNumber: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        bankIfsc: z.string().optional(),
        bankName: z.string().optional(),
        bankAccountName: z.string().optional(),
        gender: z.string().optional(),
        dateOfBirth: z.string().optional(),
        // NOTE: the C1 declaration-intake figures (previousEmployerIncome / previousEmployerTds /
        // rentPaidAnnual) are DELIBERATELY NOT importable. Each declared figure must carry a
        // provenance status (provisional / proven / lapsed, with the Feb→Mar catch-up spread) so
        // the relief can be withdrawn and tax recovered if never proven. A CSV cell is a bare
        // number with no status — importing it would create rows that look declared but are not
        // classifiable, which C1 would then inherit unable to tell apart. They belong to C1's
        // intake, not here.
    })
    .passthrough();

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contractor", "intern"] as const;
const GENDERS = ["male", "female", "other"] as const;
const TAX_REGIMES = ["old", "new"] as const;

/** Thrown by a per-row validator to skip THAT row with a reason (never aborts the batch). */
class EmployeeRowError extends Error {}

const cleanStr = (v?: string): string | undefined => {
    const t = (v ?? "").trim();
    return t === "" ? undefined : t;
};
/** Required, non-empty; throws a named row error otherwise. */
function required(v: string | undefined, message: string): string {
    const t = cleanStr(v);
    if (t === undefined) throw new EmployeeRowError(message);
    return t;
}
/** Optional enum (case-insensitive); undefined when blank; throws on an out-of-set value. */
function optionalEnum<T extends readonly string[]>(v: string | undefined, allowed: T, label: string): T[number] | undefined {
    const t = cleanStr(v)?.toLowerCase();
    if (t === undefined) return undefined;
    if (!(allowed as readonly string[]).includes(t)) {
        throw new EmployeeRowError(`invalid ${label} "${t}" — must be one of: ${allowed.join(", ")}`);
    }
    return t as T[number];
}
/**
 * REQUIRED enum (case-insensitive). Distinguishes a BLANK cell from an out-of-set value with
 * different messages, and never falls back to a column default — used for `taxRegime`, where the
 * value is a statutory election (filed on Form 24Q / Form 16) that must never be silently defaulted.
 * The column's PRESENCE is enforced separately at the file level; this handles a blank cell WITHIN
 * a present column, which is a row error the customer can see and fix.
 */
function requiredEnum<T extends readonly string[]>(v: string | undefined, allowed: T, label: string): T[number] {
    const t = cleanStr(v)?.toLowerCase();
    if (t === undefined) {
        throw new EmployeeRowError(`${label} is blank — enter one of: ${allowed.join(", ")} (no default is applied)`);
    }
    if (!(allowed as readonly string[]).includes(t)) {
        throw new EmployeeRowError(`invalid ${label} "${t}" — must be one of: ${allowed.join(", ")}`);
    }
    return t as T[number];
}
/** Optional date: undefined when blank; throws on an unparseable value. */
function optionalDate(v: string | undefined, label: string): Date | undefined {
    const t = cleanStr(v);
    if (t === undefined) return undefined;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) throw new EmployeeRowError(`${label} is not a valid date (got "${t}")`);
    return d;
}
/** Optional boolean from a CSV token (true/false/yes/no/1/0). */
function optionalBool(v: string | undefined, label: string): boolean | undefined {
    const t = cleanStr(v)?.toLowerCase();
    if (t === undefined) return undefined;
    if (["true", "1", "yes", "y"].includes(t)) return true;
    if (["false", "0", "no", "n"].includes(t)) return false;
    throw new EmployeeRowError(`invalid ${label} "${t}" — use true or false`);
}

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
    // Prefer the canonical 2-digit code (always present, NOT NULL) over the
    // display name; GST comparison normalises to a code anyway.
    return row?.stateCode ?? row?.stateName ?? null;
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
                const { pan: rawPan, ...vendorItem } = item;
                // DPDP: keep raw PAN (encrypted) + stamp match hash/display; a malformed PAN in a
                // bulk row degrades to encrypted-raw rather than aborting the import — never
                // plaintext. Shared with hr.employees.create/update via `panColumnsTolerant`.
                const panCols = await panColumnsTolerant(rawPan);
                const [row] = await db.insert(vendors).values({
                    orgId: org!.id,
                    ...vendorItem,
                    ...panCols,
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
                // Normalise both sides to a canonical GST state code first: the
                // org side is a code, `vendor.state` is a free-text name — a raw
                // code-vs-name compare would tax a local sale as inter-state IGST.
                const supplierState = normaliseGstStateOrWarn(orgState, "org") ?? "";
                const buyerState = normaliseGstStateOrWarn(vendor.state, "vendor") ?? supplierState;
                // A7: derive the header from authoritative lines when supplied;
                // otherwise treat `amount` as a single taxable value (legacy path).
                const computedLines = item.lines
                    ? computeInvoiceFromLines({
                        lines: item.lines.map((l) => ({ ...l, gstRate: l.gstRate as GSTRate })),
                        orgState: supplierState,
                        counterpartyState: buyerState,
                    })
                    : null;
                const gst = computedLines
                    ? {
                        taxableValue: computedLines.header.taxableValue,
                        cgstAmount: computedLines.header.cgstAmount,
                        sgstAmount: computedLines.header.sgstAmount,
                        igstAmount: computedLines.header.igstAmount,
                        totalTaxAmount: computedLines.header.totalTaxAmount,
                        isInterstate: computedLines.header.isInterstate,
                        invoiceTotal: computedLines.header.invoiceTotal,
                    }
                    : computeGST({
                        taxableValue: Number(item.amount),
                        gstRate: item.gstRate as GSTRate,
                        supplierState,
                        buyerState,
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
                        retainUntilDate: computeRetainUntil(invoiceDate),
                        dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
                    }).returning();
                    if (computedLines && inserted) {
                        await tx.insert(invoiceLineItems).values(
                            computedLines.lines.map((l) => ({ ...l, invoiceId: inserted.id })),
                        );
                    }
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

    /**
     * Bulk import employees (onboarding). Built to onboard 30–80 employees per pilot without
     * hand-keying each one, so the whole design is skip-the-bad-row-and-report, never
     * abort-the-batch:
     *
     *  • TOLERANT boundary — the row schema is all-optional-strings, so no row is rejected before
     *    the body runs. Each row is validated HERE (email format + uniqueness, PAN format via the
     *    shared `employeePanField`, salary-structure name resolution, state presence, enums,
     *    numeric/date parsing); a failure becomes a named `skipped[]` entry, the rest import.
     *  • DRY RUN BY DEFAULT — `dryRun` defaults to true; a caller must pass `dryRun: false` to
     *    write. The safe mode is the one you get by accident: a dry run validates everything and
     *    reports what WOULD happen (`wouldImport`) but writes nothing.
     *  • PAN encrypted at rest (`panColumnsTolerant`), never plaintext. A malformed PAN is caught
     *    by `employeePanField` above and skips the row, so the tolerant fallback's encrypted-raw
     *    branch is never reached here.
     *  • Salary structure is resolved by NAME to a family id; not found OR ambiguous ⇒ the row is a
     *    skip, NEVER a created employee with no structure (that employee would silently never be
     *    paid). Structures are never auto-created from CSV columns.
     *  • Each user + employee pair is inserted in ONE transaction, so a mid-row failure can never
     *    leave an orphan user (users.userId on employees is NOT NULL/unique).
     *  • EMP-NNNN via `getNextEmployeeNumber` (atomic, delete-proof, monotonic) — shared with
     *    `hr.employees.create`, so the two paths cannot hand out the same number after a delete.
     *  • Automation hooks are DELIBERATELY SUPPRESSED: unlike `hr.employees.create`, this path does
     *    NOT call `runEntityBusinessRules` / `emitDomainEvent`. Firing hundreds of fire-and-forget
     *    rule evaluations during a bulk onboarding is load with no benefit; rules re-evaluate on the
     *    employee's first real change.
     */
    importEmployees: permissionProcedure("hr", "assign")
        .input(z.object({
            dryRun: z.boolean().default(true),
            // The column KEYS present in the uploaded file's header. Required — the client drops
            // blank cells, so from `rows` alone the server cannot tell a MISSING column from a
            // column where every cell happens to be blank. `columns` restores that distinction so
            // the taxRegime column-presence check below can refuse the whole FILE (missing column)
            // while a blank cell inside a PRESENT column stays a per-row skip.
            columns: z.array(z.string()),
            rows: z.array(EmployeeIngestRowSchema).min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const { db, org } = ctx;
            const orgId = org!.id;
            const ids: string[] = [];
            const skipped: Array<{ row: number; identifier: string; reason: string }> = [];
            let wouldImport = 0;

            // ── File-level refusal: the taxRegime column must be PRESENT ──────────────────────
            // taxRegime (old vs new, s.115BAC) is a statutory election filed on Form 24Q / Form 16.
            // The DB column is NOT NULL DEFAULT 'new', so a file with no taxRegime column would
            // silently elect the NEW regime for the entire workforce — a wrong filing caused by a
            // missing spreadsheet header. Refuse the whole request before ANY row is processed;
            // nothing is written. (A blank cell inside a PRESENT column is handled per-row below —
            // a visible, correctable omission.) This is the server-side guarantee; the modal marks
            // the column required too, but a direct API caller must not be able to bypass it.
            if (!input.columns.includes("taxRegime")) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message:
                        "The uploaded file has no 'taxRegime' column. Add a taxRegime column with a value " +
                        "of 'old' or 'new' for every employee — a bulk import must not silently elect the " +
                        "tax regime. Nothing was imported.",
                });
            }

            // Salary-structure NAME → set of distinct family ids (case-insensitive), resolved once
            // for the whole batch. 0 matches ⇒ "not found"; >1 distinct family ⇒ "ambiguous". A
            // structure carries multiple effective-dated VERSIONS that all share one family id and
            // one name, so collapsing to the family-id set is what makes a genuinely ambiguous name
            // (two different families) distinguishable from a normal multi-version structure.
            const structRows = await db
                .select({ familyId: salaryStructures.familyId, name: salaryStructures.structureName })
                .from(salaryStructures)
                .where(and(eq(salaryStructures.orgId, orgId), eq(salaryStructures.isArchived, false)));
            const familiesByName = new Map<string, Set<string>>();
            for (const s of structRows) {
                const key = s.name.trim().toLowerCase();
                let set = familiesByName.get(key);
                if (!set) { set = new Set(); familiesByName.set(key, set); }
                set.add(s.familyId);
            }

            // Accepted WORK states, resolved once for the batch from the SAME table the
            // professional-tax lookup reads: `professional_tax_slabs.state_name`, platform
            // defaults (org_id IS NULL) plus any org override. That table is canonical by
            // definition — `statutory-ceilings.ts` keys the PT engine's overrides on
            // `stateName.toUpperCase().replace(/\s+/g, "_")`, so a value absent from it can
            // never resolve a slab.
            //
            // Until now `state` was checked for PRESENCE only. "Atlantis" and "Karnatak" both
            // imported clean and then produced ₹0 PT with only a warning at run time, long
            // after the person who typed the CSV had moved on. Matched case-insensitively and
            // whitespace-insensitively (the engine's own normalisation) so "karnataka" and
            // "Tamil  Nadu" are accepted; anything else is a named skip.
            const ptStateRows = await db
                .select({ stateName: professionalTaxSlabs.stateName })
                .from(professionalTaxSlabs)
                .where(or(eq(professionalTaxSlabs.orgId, orgId), isNull(professionalTaxSlabs.orgId)));
            const normaliseStateKey = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "_");
            /** normalised key → the canonical spelling, for the error message and the stored value. */
            const acceptedStates = new Map<string, string>();
            for (const r of ptStateRows) acceptedStates.set(normaliseStateKey(r.stateName), r.stateName);
            const acceptedStateNames = [...acceptedStates.values()].sort();

            // Existing org emails (lowercased). users has a unique (org_id, email) index; pre-checking
            // turns a collision into a named skip instead of a batch-aborting constraint error.
            const existing = await db.select({ email: users.email }).from(users).where(eq(users.orgId, orgId));
            const takenEmails = new Set(existing.map((u) => u.email.trim().toLowerCase()));
            const seenEmails = new Set<string>(); // reserved within THIS batch

            let rowNum = 0;
            for (const raw of input.rows) {
                rowNum++;
                const email = cleanStr(raw.email);
                const name = cleanStr(raw.name);
                const identifier = email ?? name ?? `row ${rowNum}`;
                try {
                    // ── Required identity ──
                    const empName = required(raw.name, "name is required");
                    const empEmail = required(raw.email, "email is required");
                    if (!z.string().email().safeParse(empEmail).success) {
                        throw new EmployeeRowError(`invalid email "${empEmail}"`);
                    }
                    const emailKey = empEmail.toLowerCase();
                    if (takenEmails.has(emailKey)) {
                        throw new EmployeeRowError(`email "${empEmail}" already belongs to a user in this org`);
                    }
                    if (seenEmails.has(emailKey)) {
                        throw new EmployeeRowError(`email "${empEmail}" is duplicated earlier in this file`);
                    }

                    // ── Salary structure — resolve by name; never auto-create ──
                    const structureName = required(
                        raw.structureName,
                        "structureName is required (resolved to a salary-structure family)",
                    );
                    const families = familiesByName.get(structureName.toLowerCase());
                    if (!families || families.size === 0) {
                        throw new EmployeeRowError(`salary structure "${structureName}" not found`);
                    }
                    if (families.size > 1) {
                        throw new EmployeeRowError(
                            `salary structure "${structureName}" is ambiguous — ${families.size} families share that name; rename or merge them first`,
                        );
                    }
                    const salaryStructureId = [...families][0]!;

                    // ── Statutory state (drives PT slab; no safe silent default) ──
                    const stateRaw = required(
                        raw.state,
                        "state is required — enter the employee's WORK state (office location), which sets the professional-tax slab, not their home address",
                    );
                    // Reject anything the PT engine could not resolve, naming the offending
                    // value. Store the canonical spelling so the row matches a slab exactly.
                    const stateCanonical = acceptedStates.get(normaliseStateKey(stateRaw));
                    if (!stateCanonical) {
                        throw new EmployeeRowError(
                            `unknown work state "${stateRaw}" — no professional-tax slab exists for it, so PT would compute as ₹0. ` +
                            `Accepted states: ${acceptedStateNames.join(", ")}`,
                        );
                    }
                    const state = stateCanonical;

                    // ── PAN (optional; when present must match AAAAA9999A — the SAME schema as create) ──
                    const panParse = employeePanField.safeParse(raw.pan);
                    if (!panParse.success) {
                        throw new EmployeeRowError(panParse.error.issues[0]?.message ?? "invalid PAN");
                    }
                    const pan = cleanStr(raw.pan);

                    // ── Enums / booleans / dates ──
                    const employmentType = optionalEnum(raw.employmentType, EMPLOYMENT_TYPES, "employmentType");
                    const gender = optionalEnum(raw.gender, GENDERS, "gender");
                    // taxRegime is REQUIRED per row (its column is guaranteed present by the file-level
                    // check above): a blank cell is a named skip, never the silent NEW-regime default.
                    // isMetroCity / gender stay optional-with-default on purpose — they err toward
                    // over-deduction, which is recoverable; the regime election is not.
                    const taxRegime = requiredEnum(raw.taxRegime, TAX_REGIMES, "taxRegime");
                    const isMetroCity = optionalBool(raw.isMetroCity, "isMetroCity");
                    const startDate = optionalDate(raw.startDate, "startDate");
                    const dateOfBirth = optionalDate(raw.dateOfBirth, "dateOfBirth");

                    // Row is fully valid — reserve its email against the rest of the batch.
                    seenEmails.add(emailKey);

                    if (input.dryRun) {
                        wouldImport++;
                        continue;
                    }

                    // DPDP: PAN stored ENCRYPTED (KMS envelope) + match-hash + masked display. Computed
                    // BEFORE the transaction and inside its own guard: `panColumnsTolerant` degrades a
                    // MALFORMED PAN to encrypted-raw, but if ENCRYPTION ITSELF fails (KMS/APP_SECRET
                    // outage) its fallback re-calls encrypt and re-throws — a plain Error, not an
                    // EmployeeRowError. Left unguarded that would escape the per-row catch below and
                    // abort the WHOLE batch, which is exactly what the tolerant boundary forbids. So we
                    // convert an encryption failure into a NAMED per-row skip: the rest of the batch —
                    // including rows with no PAN, which never encrypt — still imports. (Format was
                    // already validated above, so the malformed-degrade path is unreachable here.)
                    let panCols: Awaited<ReturnType<typeof panColumnsTolerant>>;
                    try {
                        panCols = await panColumnsTolerant(pan);
                    } catch (encErr) {
                        throw new EmployeeRowError(
                            `could not encrypt PAN — ${encErr instanceof Error ? encErr.message : "encryption failed"}`,
                        );
                    }

                    // Insert the user + employee in ONE transaction so a mid-row failure can never
                    // orphan a user row. EMP-NNNN is allocated INSIDE the tx (rolls back with it).
                    const employee = await db.transaction(async (tx) => {
                        const [u] = await tx
                            .insert(users)
                            .values({ orgId, name: empName, email: empEmail, role: "member" })
                            .returning();
                        const employeeId = await getNextEmployeeNumber(tx, orgId);
                        const [row] = await tx
                            .insert(employees)
                            .values({
                                orgId,
                                userId: u!.id,
                                employeeId,
                                salaryStructureId,
                                department: cleanStr(raw.department),
                                title: cleanStr(raw.title),
                                jobGrade: cleanStr(raw.jobGrade),
                                employmentType,
                                location: cleanStr(raw.location),
                                state,
                                city: cleanStr(raw.city),
                                isMetroCity,
                                taxRegime,
                                startDate,
                                dateOfBirth,
                                gender,
                                ...panCols,
                                uan: cleanStr(raw.uan),
                                esiIpNumber: cleanStr(raw.esiIpNumber),
                                bankAccountNumber: cleanStr(raw.bankAccountNumber),
                                bankIfsc: cleanStr(raw.bankIfsc),
                                bankName: cleanStr(raw.bankName),
                                bankAccountName: cleanStr(raw.bankAccountName),
                                status: "active",
                            })
                            .returning();
                        return row!;
                    });
                    ids.push(employee.id);
                } catch (e) {
                    if (e instanceof EmployeeRowError) {
                        skipped.push({ row: rowNum, identifier, reason: e.message });
                        continue;
                    }
                    throw e; // an unexpected error is a real fault — let it surface
                }
            }

            return {
                imported: ids.length,
                ids,
                skipped,
                dryRun: input.dryRun,
                wouldImport: input.dryRun ? wouldImport : ids.length,
            };
        }),

    /**
     * Bulk-create salary structures (UNIT B). Same posture as importEmployees: DRY RUN BY
     * DEFAULT, skip-the-bad-row-and-report, never abort the batch. Validation goes through the
     * form's own `SalaryStructureFormSchema` (not a copy) so a rule cannot live on one path and
     * not the other. Basic is DERIVED (50 − DA) — the template never asks for it. Structures must
     * be imported BEFORE employees, because the employee importer links to a structure by name.
     */
    importStructures: permissionProcedure("payroll", "write")
        .input(z.object({
            dryRun: z.boolean().default(true),
            columns: z.array(z.string()),
            rows: z.array(z.record(z.string(), z.string().nullish())).min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            const { db, org } = ctx;
            const orgId = org!.id;

            // File-level: every REQUIRED template column must be present (nothing written).
            const missingCols = STRUCTURE_TEMPLATE_COLUMNS
                .filter((c) => c.required && !input.columns.includes(c.key))
                .map((c) => c.key);
            if (missingCols.length > 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `The uploaded file is missing required column(s): ${missingCols.join(", ")}. Nothing was imported.`,
                });
            }

            // Existing family names (case-insensitive). A duplicate name would make the employee
            // importer's name→family lookup AMBIGUOUS (it refuses >1 family per name), so an
            // existing name is a per-row skip — consistent with the system's existing handling of
            // duplicate structure names, not a new rule. (The form itself has no name uniqueness.)
            const existing = await db
                .select({ name: salaryStructures.structureName })
                .from(salaryStructures)
                .where(and(eq(salaryStructures.orgId, orgId), eq(salaryStructures.isArchived, false)));
            const existingNames = new Set(existing.map((s) => s.name.trim().toLowerCase()));
            const seenNames = new Set<string>();

            const reqNum = (v: unknown, label: string): number => {
                const t = required(cleanStr(v as string | undefined), `${label} is required`);
                const n = Number(t);
                if (!Number.isFinite(n)) throw new EmployeeRowError(`${label} must be a number (got "${t}")`);
                return n;
            };

            const ids: string[] = [];
            const skipped: Array<{ row: number; identifier: string; reason: string }> = [];
            let wouldImport = 0;
            let rowNum = 0;

            for (const raw of input.rows) {
                rowNum++;
                const nameRaw = cleanStr(raw.structure_name as string | undefined);
                const identifier = nameRaw ?? `row ${rowNum}`;
                try {
                    const structureName = required(nameRaw, "structure_name is required");
                    const key = structureName.toLowerCase();
                    if (existingNames.has(key)) {
                        throw new EmployeeRowError(
                            `a salary structure named "${structureName}" already exists — importing would create a duplicate the employee importer cannot resolve by name`,
                        );
                    }
                    if (seenNames.has(key)) {
                        throw new EmployeeRowError(`structure name "${structureName}" is duplicated earlier in this file`);
                    }

                    // Composition rule, named explicitly (not a generic rejection): Basic is DERIVED
                    // as 50 − DA, so DA must be 0–50. A migrating customer whose old Basic was 20–35%
                    // sets DA 15–30; a value outside the range is what this refuses.
                    const daPercent = reqNum(raw.da_percent, "da_percent");
                    if (daPercent < 0 || daPercent > 50) {
                        throw new EmployeeRowError(
                            `DA % must be between 0 and 50 — Basic is derived as 50 − DA (you gave DA ${daPercent}%, which makes Basic ${50 - daPercent}%). A typical IT/retail Basic of 20–35% means a DA of 15–30.`,
                        );
                    }
                    const ltaRaw = cleanStr(raw.lta_annual as string | undefined);
                    const candidate = {
                        structureName,
                        ctcAnnual: reqNum(raw.base_pay_annual, "base_pay_annual"),
                        basicPercent: 50 - daPercent, // DERIVED
                        daPercent,
                        hraPercentOfBasic: reqNum(raw.hra_percent_of_basic, "hra_percent_of_basic"),
                        ltaAnnual: ltaRaw ? Number(ltaRaw) : 0,
                        effectiveFrom: required(cleanStr(raw.effective_from as string | undefined), "effective_from is required"),
                        effectiveTo: cleanStr(raw.effective_to as string | undefined),
                    };
                    // Validate through the FORM's schema — the one object, not a copy.
                    const parsed = SalaryStructureFormSchema.safeParse(candidate);
                    if (!parsed.success) {
                        const issue = parsed.error.issues[0]!;
                        throw new EmployeeRowError(`${(issue.path ?? []).join(".") || "row"}: ${issue.message}`);
                    }

                    wouldImport++;
                    seenNames.add(key);
                    if (!input.dryRun) {
                        const v = parsed.data;
                        const newId = crypto.randomUUID();
                        await db.insert(salaryStructures).values({
                            id: newId,
                            orgId,
                            familyId: newId,
                            structureName: v.structureName,
                            ctcAnnual: v.ctcAnnual.toFixed(2),
                            basicPercent: v.basicPercent.toFixed(2),
                            daPercent: v.daPercent.toFixed(2),
                            hraPercentOfBasic: v.hraPercentOfBasic.toFixed(2),
                            ltaAnnual: v.ltaAnnual.toFixed(2),
                            effectiveFrom: v.effectiveFrom,
                            effectiveTo: v.effectiveTo ?? null,
                        });
                        ids.push(newId);
                    }
                } catch (e) {
                    if (e instanceof EmployeeRowError) {
                        skipped.push({ row: rowNum, identifier, reason: e.message });
                        continue;
                    }
                    throw e;
                }
            }

            return {
                imported: ids.length,
                ids,
                skipped,
                dryRun: input.dryRun,
                wouldImport: input.dryRun ? wouldImport : ids.length,
            };
        }),

    /** Downloadable structure-import template — GENERATED from STRUCTURE_TEMPLATE_COLUMNS, so it
     *  cannot drift from what importStructures accepts. */
    structureImportTemplate: permissionProcedure("payroll", "read").query(() => ({
        columns: STRUCTURE_TEMPLATE_COLUMNS.map((c) => ({ key: c.key, required: c.required, note: c.note })),
        headerRow: STRUCTURE_TEMPLATE_COLUMNS.map((c) => c.key),
        note: "Import structures BEFORE employees — the employee importer links to a structure by its exact name. Basic is derived as 50 − DA and is not a column.",
    })),
});
