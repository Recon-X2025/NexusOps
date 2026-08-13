import { router, permissionProcedure, adminProcedure } from "../lib/trpc";
import { sendNotification } from "../services/notifications";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getTableColumns } from "drizzle-orm";
import { getNextNumber } from "../lib/auto-number";
import {
  vendors,
  purchaseRequests,
  prStatusEnum,
  purchaseRequestItems,
  purchaseOrders,
  poLineItems,
  goodsReceiptNotes,
  grnLineItems,
  invoices,
  approvalRequests,
  assets,
  assetTypes,
  organizations,
  legalEntities,
  budgetLines,
  chartOfAccounts,
  gstinRegistry,
  journalEntries,
  journalEntryLines,
  eq,
  and,
  desc,
  asc,
  count,
  sum,
  sql,
  inArray,
  type DbOrTx,
} from "@coheronconnect/db";
import { CreatePurchaseRequestSchema } from "@coheronconnect/types";
import {
  getProcurementMatchToleranceAbs,
  getProcurementApprovalTiers,
  getDuplicatePayablePolicy,
} from "../lib/org-settings";
import { computeInvoicePoMatch } from "../lib/invoice-po-match";
import { computeRetainUntil } from "../lib/retention";
import { computeGST, normaliseGstStateOrWarn, type GSTRate } from "../lib/india/gst-engine";

/**
 * Allowed GST slabs (percent). Defaults to 0 when OMITTED — the Direct-PO form always sends an
 * explicit rate (its dropdown defaults to 18%), so this default only governs programmatic callers
 * that don't model GST; they must get no phantom tax (keeps the accrual total = taxable value).
 */
const GST_RATE_INPUT = z
  .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
  .default(0);

/** The org's own place-of-supply state, from its primary/first active GSTIN (null ⇒ intra-state split). */
async function resolveOrgGstState(tx: DbOrTx, orgId: string): Promise<string | null> {
  const [row] = await tx
    .select({ stateCode: gstinRegistry.stateCode, stateName: gstinRegistry.stateName })
    .from(gstinRegistry)
    .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.isActive, true)))
    .orderBy(desc(gstinRegistry.isPrimary), gstinRegistry.createdAt)
    .limit(1);
  return row?.stateCode ?? row?.stateName ?? null;
}

async function determineApproval(amount: number, orgSettings: unknown): Promise<string> {
  const { prAutoApproveBelow, prDeptHeadMax } = getProcurementApprovalTiers(orgSettings);
  if (amount < prAutoApproveBelow) return "auto";
  if (amount < prDeptHeadMax) return "dept_head";
  return "vp_finance";
}

/**
 * Resolve (and lazily provision) the two Chart-of-Accounts entries used by the
 * PO accrual journal: a debit expense account and a credit accounts-payable
 * liability account. Previously the PO accrual hardcoded fabricated placeholder
 * UUIDs ("…0001"/"…0002") which do not exist in `chart_of_accounts` and violate
 * the `journal_entry_lines.account_id` FK (onDelete: restrict). We look up real
 * accounts by (org, type/subType); if an org has none yet, we create a system
 * account so the money path always references a valid COA row.
 *
 * `tx` is the surrounding Drizzle transaction so provisioning is atomic with the
 * PO + journal insert.
 */
async function resolveAccrualAccounts(
  tx: any, // any-ratchet-allow: temporary bypass
  orgId: string,
): Promise<{ expenseAccountId: string; payableAccountId: string }> {
  // Credit side: accounts-payable liability (subType is the strong signal).
  let [payable] = await tx
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.orgId, orgId),
        eq(chartOfAccounts.type, "liability"),
        eq(chartOfAccounts.subType, "accounts_payable"),
        eq(chartOfAccounts.isActive, true),
      ),
    )
    .limit(1);

  if (!payable) {
    [payable] = await tx
      .insert(chartOfAccounts)
      .values({
        orgId,
        code: "2000",
        name: "Accounts Payable",
        type: "liability" as const,
        subType: "accounts_payable" as const,
        isSystem: true,
      })
      .onConflictDoNothing({ target: [chartOfAccounts.orgId, chartOfAccounts.code] })
      .returning({ id: chartOfAccounts.id });

    // If code 2000 was already taken by a non-AP account, fall back to any
    // liability account for the org so the entry stays balanced and valid.
    if (!payable) {
      [payable] = await tx
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.type, "liability")))
        .limit(1);
    }
  }

  // Debit side: an expense account (prefer generic subType "expense").
  let [expense] = await tx
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.orgId, orgId),
        eq(chartOfAccounts.type, "expense"),
        eq(chartOfAccounts.isActive, true),
      ),
    )
    .orderBy(asc(chartOfAccounts.code))
    .limit(1);

  if (!expense) {
    [expense] = await tx
      .insert(chartOfAccounts)
      .values({
        orgId,
        code: "6000",
        name: "General Expense",
        type: "expense" as const,
        subType: "expense" as const,
        isSystem: true,
      })
      .onConflictDoNothing({ target: [chartOfAccounts.orgId, chartOfAccounts.code] })
      .returning({ id: chartOfAccounts.id });

    if (!expense) {
      [expense] = await tx
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.type, "expense")))
        .limit(1);
    }
  }

  if (!payable?.id || !expense?.id) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Unable to resolve accrual accounts: the organisation's Chart of Accounts is missing an expense and/or accounts-payable account.",
    });
  }

  return { expenseAccountId: expense.id, payableAccountId: payable.id };
}

export const procurementRouter = router({
  vendors: router({
    list: permissionProcedure("vendors", "read").query(async ({ ctx }) => {
      return ctx.db.select().from(vendors).where(eq(vendors.orgId, ctx.org!.id));
    }),

    create: permissionProcedure("vendors", "write")
      .input(
        z.object({
          name: z.string().min(1).max(200),
          contactEmail: z.string().email().optional(),
          contactPhone: z.string().optional(),
          address: z.string().optional(),
          paymentTerms: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const [vendor] = await ctx.db
          .insert(vendors)
          .values({ orgId: ctx.org!.id, ...input })
          .returning();
        return vendor;
      }),
  }),

  /** Org legal entities for PO tagging (procurement read — no separate `financial` permission required). */
  legalEntityOptions: permissionProcedure("procurement", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;
    return db
      .select({ id: legalEntities.id, code: legalEntities.code, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.orgId, org!.id))
      .orderBy(asc(legalEntities.code));
  }),

  purchaseRequests: router({
    list: permissionProcedure("procurement", "read")
      .input(z.object({ status: z.enum(prStatusEnum.enumValues).optional() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const conditions = [eq(purchaseRequests.orgId, org!.id)];
        if (input.status) conditions.push(eq(purchaseRequests.status, input.status));

        return db.select().from(purchaseRequests).where(and(...conditions)).orderBy(desc(purchaseRequests.createdAt));
      }),

    create: permissionProcedure("procurement", "write")
      .input(CreatePurchaseRequestSchema)
      .mutation(async ({ ctx, input }) => {
      const { db, org, user } = ctx;

      console.log("[ACTION]", {
        action: "procurement.purchaseRequests.create",
        userId: user.id,
        orgId: org!.id,
        title: input.title,
        itemCount: input.items.length,
      });

      // Idempotency: if the caller already created a PR with this key, return it
      if (input.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.orgId, org!.id), eq(purchaseRequests.idempotencyKey, input.idempotencyKey)))
          .limit(1);
        if (existing) {
          console.log("[IDEMPOTENT]", { action: "procurement.purchaseRequests.create", idempotencyKey: input.idempotencyKey, prId: existing.id });
          return existing;
        }
      }

      const totalAmount = input.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );

      const [freshOrg] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const approvalLevel = await determineApproval(totalAmount, freshOrg?.settings ?? org!.settings);
      const status = approvalLevel === "auto" ? "approved" : "pending";

      // Number allocation + header + line items are one unit: a failed item
      // insert must roll back both the PR header and the consumed PR number.
      const pr = await db.transaction(async (tx) => {
        const prNumber = await getNextNumber(tx, org!.id, "PR");

        const [created] = await tx
          .insert(purchaseRequests)
          .values({
            orgId: org!.id,
            number: prNumber,
            requesterId: user!.id,
            title: input.title,
            justification: input.justification,
            totalAmount: totalAmount.toString(),
            status,
            priority: input.priority ?? "medium",
            department: input.department,
            budgetCode: input.budgetCode,
            idempotencyKey: input.idempotencyKey ?? null,
          })
          .returning();

        if (input.items.length > 0) {
          await tx.insert(purchaseRequestItems).values(
            input.items.map((item: { description: string; quantity: number; unitPrice: number; vendorId?: string; assetTypeId?: string }) => ({
              prId: created!.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              vendorId: item.vendorId,
              assetTypeId: item.assetTypeId,
            })),
          );
        }

        return created;
      });

      return { ...pr, approvalRequired: approvalLevel !== "auto", approvalLevel };
    }),

    get: permissionProcedure("procurement", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [pr] = await db
          .select()
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.orgId, org!.id)));
        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });

        const items = await db
          .select()
          .from(purchaseRequestItems)
          .where(eq(purchaseRequestItems.prId, pr.id));

        return { ...pr, items };
      }),

    approve: permissionProcedure("approvals", "approve")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // State-transition guard: a PR may only be decided from `pending`. The
        // `status = 'pending'` predicate is carried in the UPDATE's own WHERE, so
        // a second manager acting off a stale (pending) view matches zero rows
        // once the first decision has landed → CONFLICT, rather than silently
        // overwriting it. (purchase_requests has no version column; the status
        // predicate serves the same compare-and-set role for this transition.)
        const [existing] = await db
          .select({ status: purchaseRequests.status })
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.orgId, org!.id)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        const [updated] = await db
          .update(purchaseRequests)
          .set({ status: "approved", updatedAt: new Date() })
          .where(and(
            eq(purchaseRequests.id, input.id),
            eq(purchaseRequests.orgId, org!.id),
            eq(purchaseRequests.status, "pending"),
          ))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Purchase request is no longer pending. Please refresh and try again.",
          });
        }

        if (updated.requesterId) {
          sendNotification({
            orgId: org!.id,
            userId: updated.requesterId,
            title: `Purchase request approved: ${updated.number}`,
            body: updated.title,
            link: `/app/procurement`,
            type: "success",
            sourceType: "purchase_request",
            sourceId: updated.id,
          }).catch(() => {});
        }

        return updated;
      }),

    reject: permissionProcedure("procurement", "approve")
      .input(z.object({ id: z.string().uuid(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // Same state-transition guard as approve: a PR may only be decided from
        // `pending`. The `status = 'pending'` predicate in the UPDATE's WHERE
        // means a racing reject on an already-approved request matches zero rows
        // → CONFLICT, rather than silently flipping the decision.
        const [existing] = await db
          .select({ status: purchaseRequests.status })
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.orgId, org!.id)));
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        const [updated] = await db
          .update(purchaseRequests)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(and(
            eq(purchaseRequests.id, input.id),
            eq(purchaseRequests.orgId, org!.id),
            eq(purchaseRequests.status, "pending"),
          ))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Purchase request is no longer pending. Please refresh and try again.",
          });
        }

        if (updated.requesterId) {
          sendNotification({
            orgId: org!.id,
            userId: updated.requesterId,
            title: `Purchase request rejected: ${updated.number}`,
            body: input.reason ?? updated.title,
            link: `/app/procurement`,
            type: "error",
            sourceType: "purchase_request",
            sourceId: updated.id,
          }).catch(() => {});
        }

        return updated;
      }),
  }),

  purchaseOrders: router({
    list: permissionProcedure("purchase_orders", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select({
          ...getTableColumns(purchaseOrders),
          legalEntityCode: legalEntities.code,
          legalEntityName: legalEntities.name,
          vendorName: vendors.name,
        })
        .from(purchaseOrders)
        .leftJoin(legalEntities, eq(purchaseOrders.legalEntityId, legalEntities.id))
        .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
        .where(eq(purchaseOrders.orgId, org!.id))
        .orderBy(desc(purchaseOrders.createdAt));
    }),

    get: permissionProcedure("purchase_orders", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [po] = await db
          .select({
            ...getTableColumns(purchaseOrders),
            legalEntityCode: legalEntities.code,
            legalEntityName: legalEntities.name,
            vendorName: vendors.name,
          })
          .from(purchaseOrders)
          .leftJoin(legalEntities, eq(purchaseOrders.legalEntityId, legalEntities.id))
          .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
          .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)));

        if (!po) throw new TRPCError({ code: "NOT_FOUND" });

        const items = await db
          .select()
          .from(poLineItems)
          .where(eq(poLineItems.poId, po.id));

        return { ...po, items };
      }),

    create: permissionProcedure("purchase_orders", "write")
      .input(
        z.object({
          vendorId: z.string().uuid(),
          notes: z.string().optional(),
          totalAmount: z.number().min(0),
          expectedDelivery: z.coerce.date().optional(),
          legalEntityId: z.string().uuid().optional(),
          items: z.array(z.object({
            description: z.string().min(1),
            quantity: z.number().min(1),
            unitPrice: z.number().min(0),
            hsnSacCode: z.string().optional(),
            gstRate: GST_RATE_INPUT,
          })).min(1),
          department: z.string().optional(),
          category: z.string().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // PO header, line items, budget commitment, and the draft accrual JE
        // (+ its lines) form one financial event. A partial write would commit
        // budget without a PO, or leave a one-sided GL accrual — both corrupt
        // the books. Run the whole thing in a single transaction.
        return await db.transaction(async (tx) => {
          const poNumber = await getNextNumber(tx, org!.id, "PO");

          // ── GST: compute each line's tax server-side (never trust a client total) ──
          // Place of supply: vendor (supplier) state vs the org's (buyer's) own GST state.
          // Intra-state ⇒ CGST+SGST; inter-state ⇒ IGST. The TOTAL tax is identical either
          // way — only the split differs — so an unknown state falls back to the intra split.
          const [vendorRow] = await tx
            .select({ gstin: vendors.gstin, state: vendors.state })
            .from(vendors)
            .where(and(eq(vendors.id, input.vendorId), eq(vendors.orgId, org!.id)))
            .limit(1);
          const orgState = normaliseGstStateOrWarn(await resolveOrgGstState(tx, org!.id), "org");
          const vendorState = normaliseGstStateOrWarn(vendorRow?.state ?? null, "counterparty") ?? orgState;

          const lineRows = input.items.map((item) => {
            const taxableValue = Math.round(item.quantity * item.unitPrice * 100) / 100;
            const gst = computeGST({
              taxableValue,
              gstRate: item.gstRate as GSTRate,
              supplierState: vendorState ?? "",
              buyerState: orgState ?? "",
            });
            return {
              description: item.description,
              hsnSacCode: item.hsnSacCode ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              taxableValue: taxableValue.toString(),
              gstRate: item.gstRate.toString(),
              cgstAmount: gst.cgstAmount.toString(),
              sgstAmount: gst.sgstAmount.toString(),
              igstAmount: gst.igstAmount.toString(),
              receivedQuantity: 0,
            };
          });
          // Authoritative PO totals: sum of the line taxable values + their tax. This overrides
          // any client-sent `totalAmount` (kept for compat), so budget + GL never disagree with tax.
          const poTaxable = Math.round(lineRows.reduce((s, l) => s + Number(l.taxableValue), 0) * 100) / 100;
          const poGst = Math.round(lineRows.reduce((s, l) => s + Number(l.cgstAmount) + Number(l.sgstAmount) + Number(l.igstAmount), 0) * 100) / 100;
          const poTotal = Math.round((poTaxable + poGst) * 100) / 100;

          const [po] = await tx
            .insert(purchaseOrders)
            .values({
              orgId: org!.id,
              poNumber,
              vendorId: input.vendorId,
              vendorGstin: vendorRow?.gstin ?? null,
              taxableValue: poTaxable.toString(),
              gstAmount: poGst.toString(),
              totalAmount: poTotal.toString(),
              status: "draft",
              notes: input.notes,
              expectedDelivery: input.expectedDelivery,
              legalEntityId: input.legalEntityId ?? null,
              retainUntilDate: computeRetainUntil(new Date()),
            })
            .returning();

          await tx.insert(poLineItems).values(
            lineRows.map((l) => ({ ...l, poId: po!.id })),
          );

          // ── Financial Integration: Budget Commitment ───────────────────────
          if (input.department && input.category) {
            await tx.update(budgetLines)
              .set({
                committed: sql`${budgetLines.committed} + ${poTotal}`,
                updatedAt: new Date(),
              })
              .where(and(
                eq(budgetLines.orgId, org!.id),
                eq(budgetLines.department, input.department),
                eq(budgetLines.category, input.category),
                eq(budgetLines.fiscalYear, new Date().getFullYear()),
              ));
          }

          // ── Financial Integration: Draft Journal Entry ──────────────────────
          const [je] = await tx.insert(journalEntries).values({
            orgId: org!.id,
            number: `JE-PO-${po!.poNumber}`,
            date: new Date(),
            type: "invoice",
            status: "draft",
            description: `Accrual for PO ${po!.poNumber}`,
            totalDebit: poTotal.toString(),
            totalCredit: poTotal.toString(),
            createdById: ctx.user!.id,
            retainUntilDate: computeRetainUntil(new Date()),
          }).returning();

          if (je) {
            // Debit Expense, Credit Accrued Liability (Accounts Payable) using
            // the org's real Chart of Accounts. Accounts are resolved by
            // type/subType and lazily provisioned if the org has none yet, so
            // the money path never references fabricated placeholder UUIDs.
            const { expenseAccountId, payableAccountId } = await resolveAccrualAccounts(
              tx,
              org!.id,
            );
            await tx.insert(journalEntryLines).values([
              {
                journalEntryId: je.id,
                orgId: org!.id,
                accountId: expenseAccountId,
                debitAmount: poTotal.toString(),
                description: `Expense accrual for PO ${po!.poNumber}`,
              },
              {
                journalEntryId: je.id,
                orgId: org!.id,
                accountId: payableAccountId,
                creditAmount: poTotal.toString(),
                description: `Accrued liability for PO ${po!.poNumber}`,
              }
            ]);
          }

          return po;
        });
      }),

    createFromPR: permissionProcedure("purchase_orders", "write")
      .input(
        z.object({
          prId: z.string().uuid(),
          vendorId: z.string().uuid(),
          expectedDelivery: z.coerce.date().optional(),
          legalEntityId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        if (input.legalEntityId) {
          const [leRow] = await db
            .select({ id: legalEntities.id })
            .from(legalEntities)
            .where(and(eq(legalEntities.id, input.legalEntityId), eq(legalEntities.orgId, org!.id)));
          if (!leRow) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Legal entity not found" });
          }
        }

        const [pr] = await db
          .select()
          .from(purchaseRequests)
          .where(and(eq(purchaseRequests.id, input.prId), eq(purchaseRequests.orgId, org!.id)));

        if (!pr) throw new TRPCError({ code: "NOT_FOUND" });
        if (pr.status !== "approved") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PR must be approved before creating PO" });
        }

        const prItems = await db
          .select()
          .from(purchaseRequestItems)
          .where(eq(purchaseRequestItems.prId, input.prId));

        // PO header + lines + flipping the source PR to "ordered" are one unit:
        // a failure must not leave a PO without its PR marked ordered (which
        // would allow a second PO off the same PR) or vice versa.
        return await db.transaction(async (tx) => {
          const poNumber = await getNextNumber(tx, org!.id, "PO");

          // The PR total is tax-EXCLUSIVE (Σ quantity × unitPrice; unit prices are
          // taxable prices, no GST added — see purchaseRequests.create), so it is
          // the PO's taxable value. Carry it onto `taxableValue` so the three-way
          // match compares like tax basis for like (invoice.taxableValue vs
          // po.taxableValue). Without this, taxableValue defaults to "0" and every
          // PO created from a PR fails the match on a phantom gap.
          const [po] = await tx
            .insert(purchaseOrders)
            .values({
              orgId: org!.id,
              poNumber,
              prId: input.prId,
              vendorId: input.vendorId,
              taxableValue: pr.totalAmount,
              totalAmount: pr.totalAmount,
              status: "draft",
              expectedDelivery: input.expectedDelivery,
              legalEntityId: input.legalEntityId ?? null,
              retainUntilDate: computeRetainUntil(new Date()),
            })
            .returning();

          if (prItems.length > 0) {
            await tx.insert(poLineItems).values(
              prItems.map((item: typeof purchaseRequestItems.$inferSelect) => ({
                poId: po!.id,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                // Per-line taxable value = quantity × unit price (tax-exclusive).
                taxableValue: (item.quantity * parseFloat(item.unitPrice)).toFixed(2),
                receivedQuantity: 0,
              })),
            );
          }

          await tx
            .update(purchaseRequests)
            .set({ status: "ordered" })
            .where(eq(purchaseRequests.id, input.prId));

          return po;
        });
      }),

    receive: permissionProcedure("purchase_orders", "write")
      .input(
        z.object({
          id: z.string().uuid(),
          lineItems: z.array(z.object({ lineItemId: z.string().uuid(), receivedQty: z.coerce.number().int().nonnegative() })),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        // Per-line received quantities and the resulting PO status must move
        // together: a mid-loop failure would mark some lines received while the
        // PO status (received / partially_received) reflects a different reality.
        return await db.transaction(async (tx) => {
          for (const item of input.lineItems) {
            await tx
              .update(poLineItems)
              .set({ receivedQuantity: item.receivedQty })
              .where(eq(poLineItems.id, item.lineItemId));
          }

          // Check if fully received
          const allItems = await tx.select().from(poLineItems).where(eq(poLineItems.poId, input.id));
          const allReceived = allItems.every((item: typeof poLineItems.$inferSelect) => item.receivedQuantity >= item.quantity);

          const [updated] = await tx
            .update(purchaseOrders)
            .set({
              status: allReceived ? "received" : "partially_received",
              updatedAt: new Date(),
            })
            .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)))
            .returning();

          return updated;
        });
      }),

    send: permissionProcedure("purchase_orders", "write")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db
          .update(purchaseOrders)
          .set({ status: "sent", updatedAt: new Date() })
          .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),

    markReceived: permissionProcedure("purchase_orders", "write")
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [updated] = await db
          .update(purchaseOrders)
          .set({ status: "received", updatedAt: new Date() })
          .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
  }),

  invoices: router({
    list: permissionProcedure("financial", "read").query(async ({ ctx }) => {
      return ctx.db.select().from(invoices).where(eq(invoices.orgId, ctx.org!.id)).orderBy(desc(invoices.createdAt));
    }),

    matchToOrder: permissionProcedure("financial", "read")
      .input(z.object({ invoiceId: z.string().uuid(), poId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const out = await computeInvoicePoMatch(db, org!.id, input.invoiceId, input.poId);
        return {
          invoice: out.invoice,
          po: out.po,
          matched: out.matched,
          discrepancy: out.discrepancy,
          toleranceUsed: out.toleranceUsed,
          discrepancyPct: out.discrepancyPct,
          invoiceLineSum: out.invoiceLineSum,
          poLineSum: out.poLineSum,
          poLineCount: out.poLineCount,
          invoiceLineCount: out.invoiceLineCount,
          poInvoiceLineDelta: out.poInvoiceLineDelta,
          lineKeyedMatched: out.lineKeyedMatched,
          lineMatchRows: out.lineMatchRows,
          grnReceivedValue: out.grnReceivedValue,
        };
      }),

    /** Persist successful three-way match: links `poId` and sets `matchingStatus` to `matched` (pay-ready for period close). */
    applyMatchToOrder: permissionProcedure("financial", "write")
      .input(z.object({ invoiceId: z.string().uuid(), poId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const out = await computeInvoicePoMatch(db, org!.id, input.invoiceId, input.poId);
        if (!out.matched) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "INVOICE_PO_MATCH_FAILED",
          });
        }
        const [updated] = await db
          .update(invoices)
          .set({
            poId: input.poId,
            matchingStatus: "matched",
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, org!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        return {
          ok: true as const,
          invoice: updated,
          match: {
            discrepancy: out.discrepancy,
            toleranceUsed: out.toleranceUsed,
            lineKeyedMatched: out.lineKeyedMatched,
          },
        };
      }),
  }),

  /**
   * Goods receipts (GRN) — the "receive goods against a PO" document (A9).
   *
   * This is the create path the three-way match needs: it writes a
   * `goods_receipt_notes` header + `grn_line_items`, so an invoice can reference a
   * real GRN (`invoices.grnId`) and the match reads accepted-qty × PO unit price
   * (invoice-po-match.ts) instead of silently degrading to a two-way match.
   *
   * NOTE (superseded): `purchaseOrders.receive` predates this and only stamps
   * `poLineItems.receivedQuantity` + PO status — it does NOT create a GRN. It is
   * left in place for now; new receiving should go through this path.
   *
   * OWNERSHIP: this is new write surface. Both checks below are load-bearing —
   *   (1) the referenced PO must belong to ctx.org, and
   *   (2) every submitted poLineItemId must belong to THAT PO.
   * Linking by id without verifying ownership would open a cross-tenant hole; do
   * not relax either check. The negative tests pin both.
   */
  goodsReceipts: router({
    list: permissionProcedure("purchase_orders", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      return db
        .select()
        .from(goodsReceiptNotes)
        .where(eq(goodsReceiptNotes.orgId, org!.id))
        .orderBy(desc(goodsReceiptNotes.createdAt));
    }),

    get: permissionProcedure("purchase_orders", "read")
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const { db, org } = ctx;
        const [grn] = await db
          .select()
          .from(goodsReceiptNotes)
          .where(and(eq(goodsReceiptNotes.id, input.id), eq(goodsReceiptNotes.orgId, org!.id)));
        if (!grn) throw new TRPCError({ code: "NOT_FOUND", message: "Goods receipt not found" });
        const lines = await db
          .select()
          .from(grnLineItems)
          .where(eq(grnLineItems.grnId, grn.id));
        return { ...grn, lines };
      }),

    create: permissionProcedure("purchase_orders", "write")
      .input(
        z.object({
          poId: z.string().uuid(),
          vendorDeliveryChallan: z.string().optional(),
          lines: z
            .array(
              z.object({
                poLineItemId: z.string().uuid(),
                receivedQuantity: z.coerce.number().int().nonnegative(),
                acceptedQuantity: z.coerce.number().int().nonnegative(),
                rejectedQuantity: z.coerce.number().int().nonnegative().optional(),
                rejectionReason: z.string().optional(),
              }),
            )
            .min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { db, org } = ctx;

        return await db.transaction(async (tx) => {
          // (1) OWNERSHIP — the PO must belong to this tenant. Load it scoped by
          //     orgId; a foreign or non-existent PO resolves to nothing and is
          //     rejected before any write.
          const [po] = await tx
            .select({ id: purchaseOrders.id })
            .from(purchaseOrders)
            .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.orgId, org!.id)));
          if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });

          // (2) MEMBERSHIP — every submitted PO line must belong to THAT PO. We
          //     load the PO's own lines and reject any submitted id that is not
          //     among them, so a caller cannot splice in another PO's (or another
          //     tenant's) line by id.
          const poLines = await tx
            .select({
              id: poLineItems.id,
              quantity: poLineItems.quantity,
              receivedQuantity: poLineItems.receivedQuantity,
              acceptedQuantity: poLineItems.acceptedQuantity,
            })
            .from(poLineItems)
            .where(eq(poLineItems.poId, input.poId));
          const poLineById = new Map(poLines.map((l) => [l.id, l]));

          for (const line of input.lines) {
            const poLine = poLineById.get(line.poLineItemId);
            if (!poLine) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "PO line item does not belong to this purchase order",
              });
            }

            // Per-line integrity: accepted + rejected cannot exceed received, and a
            // rejection must carry a reason.
            const rejected = line.rejectedQuantity ?? 0;
            if (line.acceptedQuantity + rejected > line.receivedQuantity) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "accepted + rejected quantity cannot exceed received quantity",
              });
            }
            if (rejected > 0 && !line.rejectionReason?.trim()) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "A rejection reason is required when rejectedQuantity > 0",
              });
            }

            // No over-receipt (pilot rule — CONFIRM WITH CUSTOMER): this receipt's
            // received qty may not push the PO line past its ordered quantity.
            const outstanding = poLine.quantity - poLine.receivedQuantity;
            if (line.receivedQuantity > outstanding) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Over-receipt not allowed: received ${line.receivedQuantity} exceeds outstanding ${outstanding} for the PO line`,
              });
            }
          }

          const grnNumber = await getNextNumber(tx, org!.id, "GRN");

          const [grn] = await tx
            .insert(goodsReceiptNotes)
            .values({
              orgId: org!.id,
              grnNumber,
              poId: input.poId,
              receivedById: ctx.user!.id,
              vendorDeliveryChallan: input.vendorDeliveryChallan,
              status: "draft", // reconciled below from the line data
            })
            .returning();

          const anyRejected = input.lines.some((l) => (l.rejectedQuantity ?? 0) > 0);
          const anyShort = input.lines.some((l) => {
            const poLine = poLineById.get(l.poLineItemId)!;
            return l.receivedQuantity < poLine.quantity - poLine.receivedQuantity;
          });

          await tx.insert(grnLineItems).values(
            input.lines.map((l) => {
              const poLine = poLineById.get(l.poLineItemId)!;
              return {
                grnId: grn!.id,
                poLineItemId: l.poLineItemId,
                orderedQuantity: poLine.quantity,
                receivedQuantity: l.receivedQuantity,
                acceptedQuantity: l.acceptedQuantity,
                rejectedQuantity: l.rejectedQuantity ?? 0,
                rejectionReason: l.rejectionReason ?? null,
              };
            }),
          );

          // Roll this receipt's quantities onto the PO lines (summed across GRNs),
          // then derive PO + GRN status from the resulting state.
          for (const l of input.lines) {
            const poLine = poLineById.get(l.poLineItemId)!;
            await tx
              .update(poLineItems)
              .set({
                receivedQuantity: poLine.receivedQuantity + l.receivedQuantity,
                acceptedQuantity: (poLine.acceptedQuantity ?? 0) + l.acceptedQuantity,
              })
              .where(eq(poLineItems.id, l.poLineItemId));
          }

          const totalAccepted = input.lines.reduce((n, l) => n + l.acceptedQuantity, 0);
          const grnStatus = totalAccepted === 0 ? "rejected" : anyRejected || anyShort ? "partial_acceptance" : "accepted";

          await tx
            .update(goodsReceiptNotes)
            .set({
              status: grnStatus,
              shortageNoted: anyShort,
              damageNoted: anyRejected,
              updatedAt: new Date(),
            })
            .where(eq(goodsReceiptNotes.id, grn!.id));

          // PO status reflects whether every line is now fully received.
          const refreshed = await tx
            .select({ quantity: poLineItems.quantity, receivedQuantity: poLineItems.receivedQuantity })
            .from(poLineItems)
            .where(eq(poLineItems.poId, input.poId));
          const allReceived = refreshed.every((l) => l.receivedQuantity >= l.quantity);
          await tx
            .update(purchaseOrders)
            .set({ status: allReceived ? "received" : "partially_received", updatedAt: new Date() })
            .where(and(eq(purchaseOrders.id, input.poId), eq(purchaseOrders.orgId, org!.id)));

          return { ...grn!, status: grnStatus };
        });
      }),
  }),

  dashboard: permissionProcedure("procurement", "read").query(async ({ ctx }) => {
    const { db, org } = ctx;

    const [pendingCount] = await db
      .select({ count: count() })
      .from(purchaseRequests)
      .where(and(eq(purchaseRequests.orgId, org!.id), eq(purchaseRequests.status, "pending")));

    const [totalSpend] = await db
      .select({ total: sum(purchaseOrders.totalAmount) })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.orgId, org!.id), sql`${purchaseOrders.status} NOT IN ('cancelled', 'draft')`));

    return {
      pendingApprovals: pendingCount?.count ?? 0,
      totalSpend: totalSpend?.total ?? "0",
    };
  }),

  /** DB-backed PR approval tiers (US-FIN-003). */
  approvalRules: router({
    get: permissionProcedure("procurement", "read").query(async ({ ctx }) => {
      const { db, org } = ctx;
      const [row] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, org!.id));
      const settings = row?.settings ?? org!.settings;
      const tiers = getProcurementApprovalTiers(settings);
      return {
        ...tiers,
        poMatchToleranceAbs: getProcurementMatchToleranceAbs(settings),
        duplicatePayableInvoicePolicy: getDuplicatePayablePolicy(settings),
        currencyNote: "Amounts use the same numeric basis as PR line totals (org default: INR-style integers in product copy).",
      };
    }),

    update: adminProcedure
      .input(
        z.object({
          prAutoApproveBelow: z.coerce.number().min(0).max(1e12),
          prDeptHeadMax: z.coerce.number().min(1).max(1e12),
          /** Absolute amount allowed between PO total and invoice total for `matchToOrder` (default 1). */
          poMatchToleranceAbs: z.coerce.number().min(0).max(1e9).optional(),
          /** Payable invoice: duplicate vendor + invoice # — `off` (no check), `warn` (allow + flag), `block` (reject). */
          duplicatePayableInvoicePolicy: z.enum(["off", "warn", "block"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.prDeptHeadMax <= input.prAutoApproveBelow) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "prDeptHeadMax must be greater than prAutoApproveBelow",
          });
        }
        const { db, org } = ctx;
        const [row] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, org!.id));
        const raw = (row?.settings ?? {}) as Record<string, unknown>;
        const prevProc = (raw.procurement as Record<string, unknown> | undefined) ?? {};
        const procurement: Record<string, unknown> = {
          ...prevProc,
          prAutoApproveBelow: input.prAutoApproveBelow,
          prDeptHeadMax: input.prDeptHeadMax,
        };
        if (input.poMatchToleranceAbs !== undefined) {
          procurement.poMatchToleranceAbs = input.poMatchToleranceAbs;
        }
        if (input.duplicatePayableInvoicePolicy !== undefined) {
          procurement.duplicatePayableInvoicePolicy = input.duplicatePayableInvoicePolicy;
        }
        await db
          .update(organizations)
          .set({
            settings: {
              ...raw,
              procurement,
            },
          })
          .where(eq(organizations.id, org!.id));

        return {
          ok: true as const,
          prAutoApproveBelow: input.prAutoApproveBelow,
          prDeptHeadMax: input.prDeptHeadMax,
          poMatchToleranceAbs: procurement.poMatchToleranceAbs,
          duplicatePayableInvoicePolicy: procurement.duplicatePayableInvoicePolicy,
          previous: {
            prAutoApproveBelow: prevProc.prAutoApproveBelow,
            prDeptHeadMax: prevProc.prDeptHeadMax,
            poMatchToleranceAbs: prevProc.poMatchToleranceAbs,
            duplicatePayableInvoicePolicy: prevProc.duplicatePayableInvoicePolicy,
          },
        };
      }),
  }),
});
