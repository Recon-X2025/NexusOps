# Audit Summary — Refresh, 2026-08-17

_Supersedes `audit-summary.md` (2026-07-31) as the current picture. That file is a **dated
snapshot and has deliberately not been edited** — `docs/quality-bar.md` rule 11 says audit and
sweep reports are never updated. Read it for the original reasoning; read this for where things
stand now._

**Method.** Every "fixed" claim below was re-verified against current source in this pass, with
`file:line`. Nothing here is carried forward from a document on trust. Written for a non-developer.

---

## 1. In plain English

The picture has changed substantially since July, and mostly for the better. The five recurring
mistakes that produced almost every finding in the original roll-up have **all had fixes shipped,
and I confirmed each one in the code today** — not by reading the notes that said so. The
data-protection notices now go to the customer's own contact instead of an internal mailbox and no
longer claim to have been "sent". The ledger no longer double-counts when two things happen at once.
The tax "same state or different state" decision now normalises both sides before comparing. Goods
receipts can now actually be recorded, which switches the supplier-invoice fraud check back on. And
there is now one shared ownership check instead of each screen inventing its own.

What replaced them is smaller and of a different character. A fresh audit of the invoicing and
payments area found **two real defects**, and neither is a missing feature — both are the same
change being made in one place and not its twin. That is now the dominant failure mode in this
codebase: not "we didn't build it", but "we built it, fixed it once, and left the identical copy
alone".

**The one thing to fix first** is the journal numbering on the invoice paths, because until it is
done, raising an invoice can fail outright with a database error.

## 2. Confirmed built — verified in source this pass

Capabilities that exist and are wired, each checked today:

| Capability | Evidence |
|---|---|
| Depreciation engine (SLM + WDV), sweep, GL posting | `lib/depreciation-sweep.ts`, `lib/depreciation-journal.ts`, `routers/depreciation.ts` |
| Balance sheet, P&L, trial balance, general ledger | `routers/accounting.ts:483, 517, 602, 684` |
| Chart of accounts + journals with post/reverse | `routers/accounting.ts:159, 259` |
| Bank reconciliation incl. match suggestions | `routers/accounting.ts:1178, 1272` |
| GSTR-1 / GSTR-3B generation, GSTR-2B ITC recon | `routers/accounting.ts:825, 1094` |
| Period close / transaction locking | `routers/financial.ts:1707` |
| Gratuity | `routers/gratuity.ts` (402 lines) |
| Leave accrual / carry-forward | `routers/leave-accrual.ts` (897 lines) |
| Full-and-final settlement | `routers/settlement.ts` (358 lines) |
| SAM licence reconciliation | `lib/sam/license-reconcile.ts`, `routers/assets.ts` |
| Tamper-evident audit chain | `lib/audit-hash.ts` (325 lines) |
| 3-way invoice match consuming real GRN data | `lib/invoice-po-match.ts`, `routers/procurement.ts:980-997` |
| e-Way bills (NIC), e-invoicing | `workflows/ewayBillWorkflow.ts`, `services/integrations/nic-ewaybill.ts` |

## 3. The five root causes — all fixed, each re-verified

**#1 — A finished action pointed at the wrong destination, stamped "done" regardless.**
**FIXED.** `lib/notification-dispatcher.ts` routes a DPDP notice only to the tenant's own
`organizations.dpdp_contact_email`, refuses cleanly when unset, and there is **no `sent` state at
all** by design (`:12-17`, `:45-50`). The software no longer claims a statutory duty was discharged.

**#2 — Read a value, write it back, nothing guarding the gap.**
**FIXED in both places it mattered.** `journal.post` now takes the entry row `FOR UPDATE` *before*
the "still a draft?" check (`routers/accounting.ts:372`). The audit chain takes a transaction-scoped
advisory lock and restricts its head-read to chained rows (`lib/audit-hash.ts:122, 134`) — the
`ORDER BY seq DESC` NULL-first bug that broke MFA enrolment is gone.

**#3 — "Same or different" decided by comparing text stored in two formats.**
**FIXED.** Both sides are normalised through `normaliseGstStateOrWarn` before any intra-vs-inter-state
comparison, on both the sales and purchase paths (`routers/financial.ts:137-138, 297-298`;
`routers/procurement.ts:524-525`). An unrecognised state now logs rather than silently defaulting.

**#4 — The reading side was built; the thing that creates the data never was.**
**FIXED for the headline case.** Goods receipts now have a real write path
(`routers/procurement.ts:980-997`, with line items at `:997`) and the matcher consumes them
(`lib/invoice-po-match.ts:33-78`). **The 3-way match is genuinely three-way.** The July audit
correctly reported it was not, at that time.

**#5 — Trusting an ID the caller handed you without checking they own it.**
**FIXED.** One shared helper, `lib/self-or-permitted.ts`, used across `routers/payroll.ts`,
`routers/hr.ts` and `routers/settlement.ts` instead of a per-screen check.

## 4. What the new AR/AP audit found (2026-08-17)

Full detail in `reports/audit-finance-ar-ap.md`.

**HIGH — invoice journal numbering collides with the rest of the ledger.** All five GL-posting
functions in `lib/invoice-journal.ts` (`:125, 245, 346, 459, 556`) number entries by counting
existing rows and adding one. `journal.create` (`routers/accounting.ts:333`) and
`lib/depreciation-journal.ts` both use the atomic `org_counters` allocator into the *same* unique
namespace. Because posting runs inside the invoice-creation transaction unguarded
(`routers/financial.ts:352`), a collision rolls back the whole invoice — the user cannot create it.
There is a test asserting exactly this invariant (`numbering-concurrency.test.ts:353`) that covers
only the already-fixed path.

**HIGH — the approve-before-pay rule exists only in the screens, and they disagree.** Neither
`approveInvoice` (`routers/financial.ts:1043`) nor `markPaid` (`:1057`) checks the invoice's current
status. Three UI blocks draw the buttons with three different rules; two of them offer "Mark Paid"
on a `pending`, never-approved invoice (`app/financial/page.tsx:619, 700`). Since no approver is
recorded, the segregation-of-duties check at `:1070` passes automatically. One person can raise and
pay a supplier invoice with no approval anywhere.

**MEDIUM ×2** — `approveInvoice` can regress a paid invoice back to `approved`, which returns
settled money to the AP aging report (`:1108`); and it has no period-close check while `markPaid`
does (`:1063`).

## 5. What has NOT changed — the habit underneath

The July roll-up named it: **tests that check what the code does, not what the requirement demands**,
so defects ship green and re-ship green. That is still the pattern, but it has evolved into a
sharper form:

> **A fix gets applied where the bug was reported, not across the invariant it belongs to.**

Both new HIGH findings are this. The numbering fix landed in `depreciation-journal.ts` — with a
comment describing the exact failure — and not in the five identical call sites next door. The
transition guard exists on the CRM deal path (`CLAUDE.md`: *"validate the TRANSITION, not the stored
row"*) and not on invoices. This is the same shape as the deprecated-CRM-twin trap already written
into `CLAUDE.md`, and it is now the most reliable place to look for the next defect: **find a fix,
then look for its untouched twin.**

## 6. Order of work

1. **Invoice journal numbering** — five call sites, correct implementation already exists two files
   away. Extend `numbering-concurrency.test.ts` to cover them.
2. **One shared `assertInvoiceTransition` helper** called by both `approveInvoice` and `markPaid`.
   Resolves both MEDIUMs for free. One helper, not a check per procedure.
3. **Retire `/app/accounting`** — the duplicate finance console. Now safe: the two screens it was
   stranding (GSTR Generation, Trial Balance) were given real routes and sidebar entries on
   2026-08-17. Deleting it also removes `incomeStatement`, whose only caller it was.

## 7. Scope and honesty notes

- The 16 subsystem audits behind the original roll-up were **not** re-run. This refresh re-verifies
  the five root causes and adds one new subsystem audit (AR/AP). Individual findings inside the
  other 15 reports may have shipped fixes I have not checked.
- Expenses and vendors were checked for facade controls only, not traced end to end.
- `createCreditDebitNote`'s sign handling against the 4130/4140 contra-revenue convention is
  untraced and worth its own pass.
- No source file was modified to produce this document.
