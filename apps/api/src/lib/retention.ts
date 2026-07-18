/**
 * DPDP retention floor (Phase 1).
 *
 * Financial records (journal entries, payslips, invoices, purchase orders) carry a
 * statutory retention obligation under RBI / Companies Act 2013 / Income Tax Act. DPDP
 * §8(7) does not require erasure where retention is necessary for compliance with a law in
 * force, so we retain the financial fact for a fixed floor and only sever/anonymise the
 * personal-identity link AFTER the floor passes.
 *
 * This module is the single source of truth for the floor length and the "retain until"
 * computation. It is deliberately pure (no DB, no clock injection beyond the caller-supplied
 * anchor) so both the create-path stamping and the backfill derive identical values.
 */

/** Blanket statutory retention floor, in years (see docs/DPDP_ERASURE_STRATEGY.md §2). */
export const RETENTION_FLOOR_YEARS = 8;

/**
 * Given the record's statutory anchor date (e.g. journal `date`, run `paidAt`, invoice
 * `invoiceDate`, PO `createdAt`), return the date on/after which the identity link may be
 * anonymised. Returns a new Date; does not mutate the input.
 */
export function computeRetainUntil(anchor: Date): Date {
  const until = new Date(anchor.getTime());
  until.setFullYear(until.getFullYear() + RETENTION_FLOOR_YEARS);
  return until;
}
