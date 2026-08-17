import { TRPCError } from "@trpc/server";
import { isInvoicePeriodClosed } from "./org-settings";

/**
 * The invoice state machine — the ONE place it exists.
 *
 * It previously existed only in the screens. `apps/web/src/app/app/financial/page.tsx`
 * drew the Approve/Pay buttons in three separate blocks with three different rules,
 * and two of them offered **Mark Paid on a `pending`, never-approved invoice**
 * (`:619`, `:700`). Neither `approveInvoice` nor `markPaid` checked the stored
 * status at all, so the server accepted it: the invoice flipped to `paid`, the
 * settlement journal entry posted, and `approvedById` stayed `null`.
 *
 * That also silently defeated segregation of duties. The SoD check reads
 * `existing.approvedById === user.id`; with no approver ever recorded it compares
 * `null` to a user id, passes, and one person has raised **and** paid a supplier
 * invoice with no approval anywhere in the record.
 *
 * Three rules live here, and both mutations call this — a guard on one procedure
 * of a pair is how the codebase's recurring defect starts (see `CLAUDE.md`:
 * "A guard that exists on a canonical procedure must exist on its deprecated
 * twin, from ONE shared helper").
 *
 *  1. **Terminal states are terminal.** `paid` and `cancelled` accept nothing.
 *     This is what stops `approveInvoice` regressing a settled invoice back to
 *     `approved` — which put already-paid money back into the AP aging report,
 *     since `apAging` selects `status IN ('pending','approved','overdue')`.
 *  2. **You cannot pay what was never approved.** Keyed on `approvedById`, not on
 *     status: `overdue` is reachable both before and after approval, so status
 *     alone cannot answer the question. The stored approver can.
 *  3. **A closed period is closed for both actions.** `markPaid` already checked
 *     this; `approveInvoice` did not, so an invoice dated inside a closed period
 *     could still be approved — a record the close was meant to freeze.
 *
 * Per `CLAUDE.md`, this validates the TRANSITION, not the stored row: invoices
 * written before this existed are never re-validated and nothing is rewritten.
 * A row only has to satisfy these rules if it is acted on again.
 */

/** Statuses that accept no further approve/pay action. */
const TERMINAL_STATUSES = new Set(["paid", "cancelled"]);

export type InvoiceAction = "approve" | "pay";

export interface InvoiceTransitionSubject {
  status: string;
  approvedById: string | null;
  invoiceDate: Date | null;
}

/**
 * Throws when `action` may not be applied to this invoice. Returns silently when
 * the transition is legal. Call BEFORE writing.
 */
export function assertInvoiceTransition(
  action: InvoiceAction,
  invoice: InvoiceTransitionSubject,
  orgSettings: unknown,
): void {
  // Rule 3 — a closed accounting period freezes the record for BOTH actions.
  if (isInvoicePeriodClosed(orgSettings, invoice.invoiceDate)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Accounting period is closed for this invoice date",
    });
  }

  // Rule 1 — terminal states accept nothing further.
  if (TERMINAL_STATUSES.has(invoice.status)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        invoice.status === "paid"
          ? "This invoice is already paid and cannot be changed"
          : "This invoice is cancelled and cannot be changed",
    });
  }

  // Rule 2 — approval is a precondition of payment, not a parallel step.
  if (action === "pay" && !invoice.approvedById) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This invoice must be approved before it can be marked paid",
    });
  }
}
