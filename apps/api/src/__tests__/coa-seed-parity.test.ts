/**
 * Chart-of-accounts seed parity — regression for `audit-finance-ar-ap.md` F4 /
 * `audit-plan-2026-08-17.md` ZB-F4.
 *
 * There are TWO chart-of-accounts seed lists:
 *
 *   1. `INDIA_COA_SEED` (`routers/accounting.ts`) — the canonical 47-account list.
 *      Used by the `coa.seed` mutation, by self-serve signup, and by the startup
 *      seed reconciler.
 *   2. `coaSeed` (`packages/db/src/seed.ts`) — a 21-account subset used by the base
 *      `db:seed` script.
 *
 * The second omits **1290 Accumulated Depreciation** and **5500 Depreciation** —
 * exactly the two accounts `postDepreciationJournalEntry` requires. When they are
 * absent it returns `null`: the depreciation charge is recorded against the asset
 * and the general ledger never moves.
 *
 * In practice this self-heals, because `reconcileSeedsForAllOrgs` back-fills every
 * org from the canonical list at API startup (`index.ts:851`) — which is why the
 * audit rated it LOW rather than HIGH. What has no guard at all is the **drift**:
 * nothing stops the two lists diverging further, and the `coaSeed` type union
 * still declares `"contra_asset"` while no row uses it, the fingerprint of a
 * trimmed copy.
 *
 * This test is a STATIC SOURCE CHECK — it parses `packages/db/src/seed.ts` rather
 * than importing it (the list is a local `const` inside a function, in a different
 * package). Same approach as `apps/web/src/lib/__tests__/route-integrity.test.ts`.
 * It never runs a seed and needs no database.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDIA_COA_SEED } from "../routers/accounting";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // apps/api/src/__tests__
const DB_SEED = path.resolve(HERE, "../../../../packages/db/src/seed.ts");

/**
 * Account codes that a GL posting path will look up and REFUSE TO POST without.
 * Every one of these must exist in both seed lists, or the posting silently
 * no-ops on a freshly seeded database.
 *
 * Sources:
 *  - `lib/depreciation-journal.ts` — 5500 (expense), 1290 (accumulated depreciation)
 *  - `lib/invoice-journal.ts`      — 5000/4100 (P&L), 2110/1130 (control), GST legs
 *  - `postInvoiceSettlementEntry`  — 2110/1130 + a cash leg (1120 or 1110)
 */
const REQUIRED_POSTING_CODES = [
  "1110", // Cash and Cash Equivalents  (settlement cash leg fallback)
  "1120", // Bank Accounts              (settlement cash leg)
  "1130", // Accounts Receivable        (AR control)
  "1290", // Accumulated Depreciation   (depreciation credit leg)
  "2110", // Accounts Payable           (AP control)
  "4100", // Revenue from Operations    (AR revenue leg)
  "5000", // Expenses                   (AP expense leg)
  "5500", // Depreciation               (depreciation debit leg)
] as const;

/** Pull every `code: "NNNN"` out of the `coaSeed` literal in packages/db/src/seed.ts. */
function baseSeedCodes(): Set<string> {
  const src = fs.readFileSync(DB_SEED, "utf8");
  const start = src.indexOf("const coaSeed");
  expect(start, "Could not find `const coaSeed` in packages/db/src/seed.ts — has it been renamed?").toBeGreaterThan(-1);
  const end = src.indexOf("];", start);
  expect(end, "Could not find the end of the coaSeed literal.").toBeGreaterThan(start);
  const block = src.slice(start, end);
  return new Set(Array.from(block.matchAll(/code:\s*"(\d+)"/g), (m) => m[1]!));
}

describe("chart-of-accounts seed parity", () => {
  const canonical = new Map(INDIA_COA_SEED.map((a) => [a.code, a]));

  it("every code a GL posting path requires exists in the CANONICAL list", () => {
    const missing = REQUIRED_POSTING_CODES.filter((c) => !canonical.has(c));
    expect(
      missing,
      `INDIA_COA_SEED is missing account codes that GL posting paths look up. ` +
        `A posting that cannot find its account returns null and the ledger never moves.`,
    ).toEqual([]);
  });

  it("every code a GL posting path requires exists in the BASE db seed too", () => {
    const base = baseSeedCodes();
    const missing = REQUIRED_POSTING_CODES.filter((c) => !base.has(c));
    expect(
      missing,
      `packages/db/src/seed.ts omits account code(s) ${missing.join(", ")} that a GL posting ` +
        `path requires. On a database seeded by \`db:seed\`, those postings silently no-op ` +
        `until the startup reconciler back-fills them. Add them to coaSeed — the two lists ` +
        `must not drift on any code a posting path depends on.`,
    ).toEqual([]);
  });

  it("REQUIRED_POSTING_CODES stays in step with what the posting code actually looks up", () => {
    // A cheap guard against this list going stale: the two depreciation legs are
    // named as string literals in `lib/depreciation-journal.ts`, so if someone
    // repoints that posting at different accounts this test names the drift
    // instead of the parity check quietly passing against the wrong codes.
    const depJournal = fs.readFileSync(path.resolve(HERE, "../lib/depreciation-journal.ts"), "utf8");
    const codes = depJournal.match(/const codes = \{[^}]*\}/)?.[0] ?? "";
    for (const c of ["5500", "1290"]) {
      expect(
        codes.includes(c),
        `depreciation-journal.ts no longer references account ${c}. Update REQUIRED_POSTING_CODES ` +
          `in this test and both seed lists together.`,
      ).toBe(true);
    }
  });

  it("the base seed introduces no account code the canonical list does not define", () => {
    const orphans = Array.from(baseSeedCodes()).filter((c) => !canonical.has(c)).sort();
    expect(
      orphans,
      `packages/db/src/seed.ts defines account code(s) ${orphans.join(", ")} that are absent ` +
        `from INDIA_COA_SEED. The reconciler seeds FROM the canonical list, so an account that ` +
        `exists only in the base seed can never be created on any other org.`,
    ).toEqual([]);
  });
});
