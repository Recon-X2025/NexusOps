# Audit — Finance AR/AP (receivables, payables, procurement match, expenses)

Audited 2026-08-17 against `docs/quality-bar.md`. **Standing code, not a diff.**
Scope: customer/vendor invoicing (`financial.createInvoice`, `createReceivableInvoice`,
`createCreditDebitNote`, `listInvoices`, `getInvoice`, `approveInvoice`, `markPaid`, `apAging`),
invoice→GL posting (`lib/invoice-journal.ts`), the procurement purchase side (POs, GRN, 3-way match),
vendors, expenses, and the web surfaces `app/financial`, `app/financial/invoices/[id]`,
`app/customer-sales`, `app/procurement`, `app/vendors`, `app/finance/expenses`.

Prior audits read first so their findings are not re-reported as new:
`audit-money-accounting.md`, `audit-gst-invoicing.md`, `audit-assets-procurement-inventory.md`
(all 2026-07-31). Two of their findings have since been **fixed** and are recorded as such below.

---

## 1. In plain English

The money handling here is mostly sound, and two problems the last audit found have since been
fixed properly. But there are two real defects, and both are in the part of the system that decides
**when a bill gets paid**.

The first: every time the system records a customer or supplier invoice in the accounting books, it
picks the reference number for that book entry by counting the entries that already exist and adding
one. The rest of the platform stopped doing this months ago and switched to a safe counter — the
depreciation module was explicitly fixed, and the code comment there even describes the failure it
caused. The invoice side never got the same fix. Because the database refuses duplicate numbers, the
result is not corrupted books; it is that **creating an invoice simply fails**, with a database
error, once the two numbering schemes drift into each other. On any company that both pays invoices
and posts its own journal entries, that collision is close to inevitable over time.

The second: the rule that an invoice must be **approved before it can be paid** is enforced only in
the screens, not in the server. Three different places in the app draw the buttons, and they don't
agree with each other — two of them offer "Mark Paid" on an invoice that was never approved. The
server accepts it without complaint, and because no approver was ever recorded, the
separation-of-duties check that is supposed to stop one person approving and paying the same invoice
passes automatically. So the approval control can be walked around from two screens.

**Fix the numbering first.** It is a handful of lines, it matches a fix already made elsewhere in the
codebase, and until it is done a routine action — raising an invoice — can fail outright.

## 2. Verdict

The AR/AP **capability** is real and deeper than a surface read suggests: invoices post to the
ledger as balanced double entries, settlement posting is genuinely idempotent, credit and debit
notes have their own posting paths, period close is enforced on payment, MFA and step-up gates sit
on the money mutations, the 3-way match now consumes real goods-receipt data, and none of the AR/AP
screens are facades. The weaknesses are not gaps in what the system can do — they are **two
consistency failures**: an identifier allocator that was fixed in one module and not its twin, and a
state machine that lives in the UI instead of the server. Both are the signature of changes made
per-file rather than per-invariant.

## 3. Findings

### HIGH-1 — All five invoice GL-posting paths mint journal numbers with `count(*)+1`, colliding with the atomic counter the rest of the ledger uses

`apps/api/src/lib/invoice-journal.ts:125, 245, 346, 459, 556` — identical in all five:

```ts
const [c] = await tx.select({ n: dbCount() }).from(journalEntries).where(eq(journalEntries.orgId, orgId));
const seq = (c?.n ?? 0) + 1;
const number = `JE-${date.getFullYear()}-${String(seq).padStart(5, "0")}`;
```

Affected: `postInvoiceJournalEntry`, `postCreditNoteJournalEntry`, `postDebitNoteJournalEntry`,
`postInvoiceSettlementEntry`, `reverseInvoiceJournalEntry` — i.e. **every** AR/AP write to the
general ledger.

The other writers into the same namespace use the atomic per-`(org, "JE-<year>")` counter:
`accounting.journal.create` (`routers/accounting.ts:333`), its reversal (`:429`), and
`lib/depreciation-journal.ts`, whose comment reproduces this exact bug and states it was fixed.
`journal_entries.number` is UNIQUE per org (`je_org_number_idx`,
`packages/db/src/schema/accounting.ts:154`).

**Concrete failure scenario.** An org posts three manual journal entries — `org_counters` for
`JE-2026` now reads 3, numbers `JE-2026-00001..00003`. The org then records three vendor invoices;
each calls `postInvoiceJournalEntry`, which counts existing rows (3, 4, 5) and mints
`JE-2026-00004`, `-00005`, `-00006`. The counter is never advanced and still reads 3. The
accountant's next manual journal entry calls `getNextYearScopedSeq`, which returns 4, builds
`JE-2026-00004`, and hits a duplicate-key violation. The counter only self-seeds from `MAX(...)`
when its row does not yet exist (`lib/auto-number.ts:150-170`), so it never recovers.

It fails in the other direction too: `count(*)` is not year-scoped while the number is, so after a
year boundary the count keeps climbing and can land straight on top of an existing number.

**Why this is worse than a failed ledger write:** `postInvoiceJournalEntry` is called *inside* the
invoice-creation transaction and is not wrapped (`routers/financial.ts:352`, `:488`, `:857`,
`:933`, `:1396`). A collision rolls back the whole transaction, so **the invoice is not created at
all** and the user sees a raw database error.

**Test gap.** `apps/api/src/__tests__/numbering-concurrency.test.ts:353` is titled *"the counter,
not the row count, drives the number (a deleted row does not rewind it)"* — the exact invariant
these five functions violate. It only exercises `accounting.journal.create`. No test covers any
`invoice-journal.ts` path.

*What this means in practice:* raising an invoice can fail with a database error, and the more the
company uses its own books, the likelier it gets.

---

### HIGH-2 — The invoice approve→pay state machine exists only in the UI, is inconsistent across three screens, and two of them let an unapproved invoice be paid

Server side, neither mutation checks the invoice's current status:

- `approveInvoice` (`routers/financial.ts:1043-1046`) — a bare `UPDATE … SET status='approved'`
  with no transition guard.
- `markPaid` (`routers/financial.ts:1057-1095`) — selects the invoice, checks period close (`:1063`)
  and segregation of duties (`:1070`), then flips to `paid`. **It never checks that the invoice was
  approved.**

The rule lives in three UI sites, which disagree:

| Site | Approve shown when | Pay shown when |
|---|---|---|
| `app/financial/page.tsx:531, 540` | `pending` | `approved` ✅ |
| `app/financial/page.tsx:616, 619` | `pending` | `pending` **or** `overdue` ❌ |
| `app/financial/page.tsx:697, 700` | `pending` | `pending`, `approved` **or** `overdue` ❌ |

**Concrete failure scenario.** A user with `financial:write` opens the invoice list rendered by the
second or third block, clicks **Mark Paid** on a `pending` invoice that no one has approved. The
server accepts it, flips the status to `paid`, and posts the settlement journal entry relieving
Accounts Payable against Bank. `approvedById` is still `null` — so the segregation-of-duties guard
at `:1070` (`existing.approvedById === user!.id`) compares `null` to the user id, passes, and the
same person has now both raised and paid the invoice with no approval recorded anywhere.

*What this means in practice:* the approval step on supplier payments can be skipped entirely from
two of the three screens, and the control that stops one person doing both halves goes with it.

---

### MEDIUM-1 — `approveInvoice` can regress a paid invoice, putting settled money back into the payables report

`routers/financial.ts:1043-1046` sets `status = "approved"` unconditionally. Calling it on an
invoice already `paid` moves it back to `approved`.

`apAging` selects `status IN ('pending','approved','overdue')` (`routers/financial.ts:1108`), so the
regressed invoice **reappears as an outstanding payable** even though its settlement entry is
already in the ledger. The ledger stays correct; the aging report does not.

Reachability: the UI only offers Approve on `pending`, so this needs a direct API call, the bulk
importer, or a workflow — not a normal click. That is why it is MEDIUM and not HIGH, but the
server-side hole is what makes the next caller dangerous.

*What this means in practice:* an integration or import could make the payables report show money
you have already paid.

---

### MEDIUM-2 — `approveInvoice` has no period-close check, while `markPaid` does

`markPaid` refuses to act on an invoice whose date falls in a closed accounting period
(`routers/financial.ts:1063-1068`). `approveInvoice` has no equivalent. An invoice dated inside a
closed period can still be approved, changing a record the close was meant to freeze.

*What this means in practice:* closing the books does not fully freeze them.

---

## 4. What is genuinely solid (recorded so it is not re-litigated)

- **Settlement posting is idempotent.** `postInvoiceSettlementEntry` checks for an existing
  `type='payment'` entry on the same invoice number before writing (`invoice-journal.ts:411-423`),
  so a double `markPaid` cannot double-relieve the control account. I expected a defect here and
  there is not one.
- **The 3-way match is genuinely three-way now.** A GRN write path exists
  (`routers/procurement.ts:980-997`, with `grnLineItems` at `:997`) and the matcher consumes it
  (`lib/invoice-po-match.ts:33-78`, `hasGrn` / `grnByPoLine`). **This reverses the 2026-07-31
  assets-procurement finding**, which correctly reported no GRN write path at that time.
- Balanced double-entry is guarded before every write, including settlement
  (`invoice-journal.ts:451-457`).
- `approveInvoice` and `markPaid` both sit behind `mfaGate` and `stepUpGate`
  (`routers/financial.ts:1038-1039`, `:1052-1053`).
- Invoice header and line items are written in one transaction (`routers/financial.ts:347-351`).
- Automation hooks fire **after** commit, so a failing rule cannot roll back an invoice
  (`routers/financial.ts:369-375`).
- **No facade controls** were found on `app/financial`, `app/procurement`, `app/vendors`, or
  `app/finance/expenses` — no toast-only handlers, no "coming soon". `app/customer-sales` is a
  16-line hub wrapper, not an AR screen.

## 5. Root causes

**1. Two allocators own one unique namespace, and the fix was applied per-file.** The atomic
counter was introduced and correctly adopted by `journal.create`, its reversal, and
`depreciation-journal.ts` — the last of which documents the duplicate-key incident in detail. Nobody
swept the other writers into the same `JE-YYYY-NNNNN` namespace. HIGH-1 is five instances of one
missed sweep. The lesson is the one already written into `CLAUDE.md` about deprecated CRM twins: a
rule that exists on one side of a duplicated pair must be extracted and shared, not copied.

**2. Business rules were implemented in the screens instead of the server.** The approve→pay state
machine has no server-side existence at all; it is drawn three times in one file and the three
copies have drifted. HIGH-2 and MEDIUM-1 are both consequences. `CLAUDE.md`'s own standing decision
— *"validate the TRANSITION, not the stored row"* — is exactly the missing piece, and it is already
applied on the CRM deal path.

**3. Guards were added to one procedure of a pair.** `markPaid` accumulated a period-close check and
an SoD check; `approveInvoice`, its counterpart in the same workflow, received neither (MEDIUM-1,
MEDIUM-2). The pattern matches root cause 1: the change was made where the bug was reported, not
across the invariant.

## 6. Recommended order of work

1. **HIGH-1 — replace `count(*)+1` with `getNextYearScopedSeq` in all five `invoice-journal.ts`
   functions**, and extend `numbering-concurrency.test.ts` to cover at least the invoice-posting and
   settlement paths. Largest blast radius, smallest change, and the correct implementation already
   exists two files away in `depreciation-journal.ts`.
2. **HIGH-2 — enforce the transition on the server.** Add a shared
   `assertInvoiceTransition(from, to)` helper called by both `approveInvoice` and `markPaid`, so
   `pending → paid` is rejected regardless of which screen calls it. Fix the two UI blocks to match.
   One helper, not a check per procedure — that is what root cause 1 says.
3. **MEDIUM-1 and MEDIUM-2** fall out of step 2 for free: a transition guard blocks
   `paid → approved`, and the period-close check moves into the shared helper alongside it.

## 7. Scope not covered

- **Expenses** (`routers/expenses.ts`, 304 lines) and **vendors** were read only for facade
  controls and entry points, not traced end to end. No finding either way.
- **`createCreditDebitNote`** was confirmed to have GL posting paths
  (`routers/financial.ts:722`, `:737`) but its amount and sign handling was not traced against the
  4130/4140 contra-revenue convention. Worth its own pass.
- The GST state-code defect from `audit-gst-invoicing.md` was **not** re-verified here; `CLAUDE.md`
  records it as fixed on the `financial.ts` path.
