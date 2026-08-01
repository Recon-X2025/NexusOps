# Money & Accounting — Audit

Subsystem: **money-accounting** (the general ledger, journal entries — debits must
equal credits — invoice-to-ledger posting, and the balance/P&L reports)
Audited against: `docs/quality-bar.md` (rule 3 "money must balance"; the
"auto-numbered records stay unique per org" and "exports/aggregates must not
truncate" invariants; the Tests section)
Date: 2026-07-31
Scope: standing code at migration head `0059_volatile_midnight` — not a diff.

---

## 1. In plain English

The core accounting rule — that every journal entry's debits equal its credits —
is enforced correctly and well tested; an unbalanced entry is rejected before it
touches the database. That is the most important thing, and it holds. However,
the way the system **numbers** journal entries is fragile: instead of using the
safe, atomic counter the rest of the platform uses, it counts the existing
entries and adds one. When two things happen at the same moment for the same
company (two invoices posting together, or a bulk import), they can pick the same
number and one of them fails — the system retries a few times, but under real
load a legitimate entry can be rejected with an error. Separately, two of the
financial **reports** are quietly wrong: the "Profit & Loss" summary can overstate
figures when there is a refund or a reversal, and the "Balance Sheet as at a date"
ignores the date you ask for and always shows today's numbers. Finally, if a user
double-clicks "Post" on a draft entry, the account balances can be added up twice,
silently skewing the ledger. **The one thing to fix first** is the journal
numbering, because it is the difference between "an accountant occasionally sees a
save error" and "the ledger is trustworthy under load." The reports being wrong is
close behind — those numbers get shown to owners and could be filed.

## 2. Verdict

The ledger's **write-time integrity** (double-entry balance, transactional
header+lines, atomic posting) is genuinely solid and is the part that matters most
for not losing money. The weaknesses are all **concurrency and reporting**: the
entry-numbering scheme drifted away from the platform's own atomic-counter
contract (and a code comment now claims a protection that isn't wired), the
`post` step has an unguarded read-then-write race, and two report procedures do
sign/date arithmetic that is wrong under inputs a real finance user will produce
(refunds, reversals, historical "as-at" queries). Nothing here silently *destroys*
committed money, but the ledger balances and the reported figures can drift from
reality without an error being raised. Four HIGH, one MEDIUM.

## 3. Findings

### HIGH

---

**H-1 — Journal-entry numbers are generated with `COUNT(*)`, not the atomic
counter; the safety comment claims otherwise.**

`apps/api/src/routers/accounting.ts:292-294` (journal.create):
```ts
const [c] = await tx.select({ n: dbCount() }).from(journalEntries).where(dbEq(journalEntries.orgId, org!.id));
const seq = (c?.n ?? 0) + 1;
const number = `JE-${input.date.getFullYear()}-${String(seq).padStart(5, "0")}`;
```
Same pattern in `accounting.ts:377-379` (journal.reverse),
`apps/api/src/lib/invoice-journal.ts:125-127` (postInvoiceJournalEntry), and
`invoice-journal.ts:251-253` (postInvoiceSettlementEntry).

The retry middleware's own comment asserts the opposite —
`apps/api/src/lib/trpc.ts:469-470`:
```
//   same inputs will succeed on the next attempt … For 23505 (unique_violation),
//   the org_counters atomic counter prevents duplicate auto-numbers;
```
But these paths never call `getNextSeq`/`org_counters` (`apps/api/src/lib/auto-number.ts:53`).
`SELECT COUNT(*)` under the default READ COMMITTED isolation takes no lock and does
not block a concurrent inserting transaction, and there is no `pg_advisory_xact_lock`
here (contrast `apps/api/src/lib/audit-hash.ts:114` and
`apps/api/src/lib/ensure-ticket-workflow.ts:16`, which do lock).

*Concrete failure scenario:* A company runs a bulk invoice import that posts 6
invoice journal entries for the same org near-simultaneously (or two users each
save a manual entry at the same instant). Several transactions read `COUNT(*) = N`
before any commits, all compute `JE-2026-000(N+1)`, and collide on the unique index
`je_org_number_idx` (`packages/db/src/schema/accounting.ts:154`), raising Postgres
`23505`. `retryMutation` re-runs the handler, but it is capped at `MAX_ATTEMPTS = 3`
(`apps/api/src/lib/db-retry.ts:21`). With more than three genuinely concurrent
creates for one org, the attempts are exhausted and the entry surfaces to the user
as a 500 `INTERNAL_SERVER_ERROR` even though the input was valid.

*What this means in practice:* Under real posting load, a valid journal entry or
invoice can be rejected with an error for no reason the user can see or fix — and
the code comment tells the next developer the problem is already handled, so it
won't be looked at.

---

**H-2 — `journal.post` reads the draft status outside the transaction, so a
double-post double-counts account balances.**

`apps/api/src/routers/accounting.ts:331-355`:
```ts
const [je] = await db.select().from(journalEntries)
  .where(dbAnd(dbEq(journalEntries.id, input.id), dbEq(journalEntries.orgId, org!.id))).limit(1);
if (!je) throw new TRPCError({ code: "NOT_FOUND" });
if (je.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft entries can be posted" });

const lines = await db.select().from(journalEntryLines).where(dbEq(journalEntryLines.journalEntryId, je.id));

return await db.transaction(async (tx) => {
  for (const line of lines) {
    const net = Number(line.debitAmount) - Number(line.creditAmount);
    await tx.update(chartOfAccounts)
      .set({ currentBalance: sql`current_balance + ${String(net)}`, updatedAt: new Date() })
      .where(dbEq(chartOfAccounts.id, line.accountId));
  }
  const [posted] = await tx.update(journalEntries).set({ status: "posted", … }).returning();
  return posted!;
});
```
The status check (line 334) is a plain read with no `FOR UPDATE`, and it happens
*before* the balance-mutating transaction. There is no re-check of `status = 'draft'`
inside the `UPDATE journalEntries` at line 348 (it filters only by `id`).

*Concrete failure scenario:* A user double-clicks "Post" on draft `JE-2026-00005`
(₹1,000 Dr Cash / ₹1,000 Cr Sales). Two requests arrive. Both read `status = "draft"`
and pass the guard. Both enter their own transaction and run
`current_balance = current_balance + 1000` on Cash and `+1000`-equivalent on Sales.
Cash is credited ₹2,000 instead of ₹1,000. The second status flip to `"posted"` is a
harmless no-op, so no error is raised.

*What this means in practice:* Account balances — and therefore the trial balance,
P&L and balance sheet that read `currentBalance` — silently drift by the amount of
any entry that gets posted twice, with no error and no obvious cause.

---

**H-3 — `incomeStatement` uses `Math.abs()` on account balances and ignores the
date range it accepts, so P&L is wrong on any refund/reversal and is never
period-scoped.**

`apps/api/src/routers/accounting.ts:522-538`:
```ts
incomeStatement: permissionProcedure("financial", "read").input(z.object({
  financialYear: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
})).query(async ({ ctx }) => {           // ← input is never read
  …
  const totalIncome   = income.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
  const totalExpenses = expenses.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
  const netProfit     = totalIncome - totalExpenses;
```
Two defects: (1) the `startDate`/`endDate`/`financialYear` inputs are declared but
the handler destructures only `{ ctx }` — they are silently discarded, so the result
is always inception-to-date. (2) `Math.abs()` forces every account to count as a
positive contribution. The sibling `profitAndLoss` procedure at
`accounting.ts:582-590` does this correctly with sign-aware arithmetic
(`amount: -(net)` for income, `net` for expense); `incomeStatement` does not.

*Concrete failure scenario:* An expense account "4200 Sales Returns" or an expense
that was reversed carries a **credit** (negative) `currentBalance` of −₹5,000
(legitimately reducing expenses). `Math.abs(-5000) = 5000` adds it as ₹5,000 of
*expense* instead of subtracting ₹5,000. Reported expenses are overstated by ₹10,000
and net profit understated by ₹10,000. Likewise a customer refund driving an income
account negative is reported as extra income.

*What this means in practice:* The Profit & Loss figure shown to an owner can be
materially wrong whenever there is a refund, credit note, or reversal — the exact
events that produce a "wrong-sign" balance — and asking for a specific quarter
silently returns all-time figures instead.

---

**H-4 — `balanceSheet` accepts `asOfDate` but never uses it; every "as at" balance
sheet shows today's snapshot.**

`apps/api/src/routers/accounting.ts:617-666`:
```ts
balanceSheet: permissionProcedure("financial", "read").input(z.object({
  asOfDate: z.coerce.date().optional(),
}).optional()).query(async ({ ctx }) => {     // ← asOfDate never read
  …
  const accounts = await db.select().from(chartOfAccounts).where(dbEq(chartOfAccounts.orgId, org!.id));
  // balances come straight from currentBalance — the live snapshot
```
The handler destructures only `{ ctx }`; `asOfDate` is discarded. All figures come
from `chartOfAccounts.currentBalance`, which is the live opening-plus-all-posted
snapshot, with no filtering by date.

*Concrete failure scenario:* On 2026-07-31 a user requests the balance sheet
"as at 2026-03-31" (financial year end) to close the books. The API ignores the date
and returns the 2026-07-31 position — including four months of subsequent postings.
The `isBalanced` flag is still true (assets still equal liabilities + equity today),
so nothing signals that the wrong date was served.

*What this means in practice:* Any historical or year-end balance sheet is wrong and
looks right. If those figures are used for a filing, a board pack, or an audit, they
misstate the financial position as of the requested date.

### MEDIUM

---

**M-1 — The tests assert the happy path only; none would catch H-1, H-2, H-3, or H-4.**

- `apps/api/src/__tests__/money-invariants.test.ts:49-64` correctly tests that an
  unbalanced entry is rejected (this would fail if the balance check at
  `accounting.ts:282` were inverted — good). But nothing exercises concurrency.
- `apps/api/src/__tests__/accounting_fix.test.ts:41` posts a draft exactly once;
  there is no test that posting the same draft twice leaves balances unchanged
  (H-2 would pass undetected).
- No test creates two journal entries concurrently for one org, so the `COUNT(*)`
  numbering race (H-1) is uncovered.
- No test calls `incomeStatement` or `balanceSheet` with a wrong-sign balance or a
  date parameter, so the `Math.abs` sign bug (H-3) and the ignored `asOfDate` (H-4)
  are uncovered. The pure-function GST/payroll invariants in
  `money-invariants.test.ts` are strong, but they do not touch the report
  procedures where H-3/H-4 live.

*Concrete failure scenario:* A developer "fixes" H-3 by changing `profitAndLoss`
and leaves `incomeStatement` as-is (or vice versa); the suite stays green because no
test compares the two or checks a signed balance. The wrong report ships.

*What this means in practice:* The safety net covers the one invariant that is
already correct and misses all four of the defects above, so any of them could be
reintroduced or left unfixed without the tests complaining.

---

## 4. Root causes

1. **Two auto-numbering strategies exist, and the money path is on the wrong one.**
   The platform has a correct atomic counter (`org_counters` / `getNextSeq`,
   `auto-number.ts:53`) used for tickets, POs, etc., but the accounting code was
   written in a separate pass that rolls its own `COUNT(*)+1` scheme. The retry
   middleware's comment (`trpc.ts:469`) was written *assuming* the whole codebase
   uses the atomic counter — a drifted contract between two modules. This single
   divergence is H-1 and is the reason the numbering is fragile.

2. **State transitions read-then-write without a lock or a status-guarded update.**
   `post` (and the same shape would apply to any future `void`/`reverse`-style
   transition) checks the current status in a separate read and trusts it through a
   later mutation. There is no `SELECT … FOR UPDATE` and no `WHERE status = 'draft'`
   on the write. That gap is H-2, and it is the classic generated-code "happy path,
   no concurrent caller imagined" failure.

3. **The report procedures were written independently and never reconciled.**
   `profitAndLoss` is sign-correct and date-scoped; `incomeStatement` and
   `balanceSheet` are not, yet all three accept date inputs. The `Math.abs`
   shortcut and the ignored date parameters (H-3, H-4) come from reports being
   built as "sum the snapshot" one-offs rather than to a single, tested definition
   of what each statement means. The tests (M-1) codified the snapshot behaviour
   instead of the accounting requirement.

## 5. Recommended order of work

Ranked by blast radius, not count:

1. **H-1 (journal numbering).** Highest blast radius: it affects every posting path
   (manual, invoice, settlement, reversal) and fails under exactly the load a
   growing customer generates. Move all four sites to the atomic `getNextSeq`
   counter (or an org-scoped advisory lock), and correct the `trpc.ts:469` comment
   so it stops asserting a protection that isn't there.
2. **H-2 (double-post).** Silent ledger corruption. Guard the write with
   `WHERE id = ? AND status = 'draft'` and check the update affected one row (or
   `SELECT … FOR UPDATE` the entry inside the transaction). Cheap fix, high value.
3. **H-3 and H-4 (wrong reports).** These reach owners and possibly filings. Make
   `incomeStatement` sign-aware and period-scoped (reuse `profitAndLoss`'s logic)
   and make `balanceSheet` honour `asOfDate` — or, if "as-at" is not yet supported,
   reject the parameter instead of silently ignoring it.
4. **M-1 (tests).** Add a double-post test, a concurrent-create test, a
   signed-balance P&L test, and an `asOfDate` balance-sheet test — each written to
   fail if the corresponding invariant is broken, so fixes for 1–3 are locked in.

---

*Not findings (verified and cleared):* the debit=credit check
(`accounting.ts:282`, tolerance 0.001) is correct and tested; invoice-to-ledger
posting is atomic with invoice creation (`financial.ts:252-291`) and the settlement
path is idempotent on the invoice reference (`invoice-journal.ts:204-215`); invoice
numbers are user-supplied and protected by their own unique index (not auto-counted),
so createInvoice cannot double-create on retry; `trialBalance`, `profitAndLoss`,
`balanceSheet` and `generateGSTR1` apply **no** pagination cap and return the
complete set, satisfying the "exports/aggregates must not truncate" rule
(`accounting.ts:473`, `559`, `623`, `736`).
