# Platform Gap Analysis — Cluster 1: Finance & Accounting

**Date:** 2026-07-03
**Hat worn:** CFO / Financial Controller (Indian mid-market context)
**Benchmarks:** Zoho Books, Tally Prime 5.0, Busy (accounting/GST/TDS); SAP Ariba, Coupa (procurement/P2P); NetSuite (period close, multi-entity)
**Modules covered:** General Ledger / Accounting, Financial reporting & Budgets, Expenses, India Tax (GST/TDS), Procurement (P2P), Inventory, Vendors
**Method:** Read-only code inventory with `file:line` citations, benchmarked against category leaders, scored REAL / PARTIAL / STUB, with prioritized fixes.

---

## 0. Executive verdict

The finance stack has a **genuinely strong accounting core** — enforced double-entry, real trial balance, real period close, a real AR/AP aging engine, a correct standalone GST computation engine, and a real line-keyed 3-way match. That is more than most "ERP-lite" products ship.

But it is **not yet a closed books system**, because the sub-ledgers don't reliably post to the GL, two of the three flagship financial statements are computed from balance snapshots rather than transactions, and the India statutory-return layer has a correctness bug plus a missing reconciliation that would fail a real GST audit.

**One-line summary:** *A well-built ledger surrounded by sub-ledgers that mostly don't post into it, and an India-tax layer that computes correctly in the engine but leaks at the return-filing boundary.*

**Maturity scores (0–100, "can a controller close a month and file returns on this alone?"):**

| Area | Score | Verdict |
|---|---|---|
| General Ledger / journals | 78 | REAL — enforced, reversible, balanced |
| Trial balance | 85 | REAL |
| P&L / Income statement | 30 | STUB — snapshot-based, ignores date range |
| Balance sheet | 10 | NOT IMPLEMENTED |
| Period close | 72 | REAL but doesn't lock sub-ledger posting |
| AR / AP aging | 80 | REAL |
| Bank reconciliation | 45 | PARTIAL — matches, doesn't post to GL |
| GST computation engine | 82 | REAL (`packages/payroll-math/src/gst-engine.ts`) |
| GSTR-1 return generation | 35 | BUG — hardcoded 18% rate |
| GSTR-2B / ITC reconciliation | 5 | MISSING |
| E-invoice / IRN | 25 | STUB — enqueue only, no IRP client |
| Vendor TDS automation | 20 | MISSING at transaction time |
| Procurement (requisition→PO→GRN) | 60 | REAL workflow |
| Procurement GL posting | 15 | STUB — placeholder account UUIDs |
| Strategic sourcing (RFx/auctions) | 5 | MISSING |
| Expenses | 40 | PARTIAL — two disconnected systems |
| Inventory valuation | 20 | MISSING (no FIFO/WAC) |
| Vendor master / scorecards / KYC | 25 | MINIMAL |
| **Cluster weighted average** | **~42** | **Strong core, leaky edges** |

---

## 1. General Ledger / Accounting — REAL core (78)

### What's real
- **Double-entry is enforced.** `accounting.journal.create` rejects unbalanced entries with a 0.001 tolerance (`apps/api/src/routers/accounting.ts:263-267`). This is the single most important correctness invariant in the whole platform and it holds.
- **Account balance posting** updates `currentBalance` on each affected COA row (`accounting.ts:322-328`).
- **Journal reversal** creates a proper contra-entry rather than mutating history (`accounting.ts:340-396`) — correct auditable behavior.
- **Trial balance is real** — it sums debits/credits across posted lines and returns an `isBalanced` flag (`accounting.ts:435-463`).

### The gaps a controller will hit at month-end
1. **P&L is a snapshot stub.** `incomeStatement` (`accounting.ts:465-483`) sums `currentBalance` on income/expense accounts and **ignores `startDate`/`endDate` entirely** (`accounting.ts:478-480`). It accepts the date params and throws them away. This means:
   - You cannot produce a *comparative* P&L (this month vs last).
   - You cannot produce a P&L for a closed prior period after new postings have moved the running balance.
   - The financial-year filter is cosmetic.
   *Benchmark: Zoho Books and Tally both compute P&L by summing posted transactions within the date range — the industry-standard approach — not from account snapshots.*
2. **No balance sheet.** There is no `balanceSheet` procedure. Assets/liabilities/equity are never rolled up. For an Indian private limited company this is a statutory-filing blocker (Schedule III balance sheet is mandatory for MCA AOC-4).
3. **No multi-currency / FX revaluation.** Fine for a single-entity INR ICP, but flag it before promising overseas-facing customers.
4. **No dimension/cost-center tagging on journal lines** beyond account — limits management reporting (by department, by project).

**Fix priority:** (a) rewrite `incomeStatement` to sum `journalEntryLines` within date range; (b) implement `balanceSheet` from the same posted-lines source; (c) add cost-center dimension. Items (a)/(b) are the highest-leverage fixes in the entire cluster — they convert "a ledger" into "financial statements."

---

## 2. Period close — REAL but incomplete lock (72)

`financial.ts:711-883` implements a real period-close workflow (open→closed state, close date, closed-by actor). Good.

**Gap:** closing a period does **not** hard-block postings into that period at the `journal.create` boundary, and does not force sub-ledger cutoff. A real close must reject back-dated journals into a locked period. Benchmark: NetSuite/Tally both refuse to post into a closed period without an explicit reopen. Add a period-lock check inside `accounting.journal.create`.

---

## 3. AR / AP aging — REAL (80)

`financial.ts:307-396` produces real aging buckets for both receivables and payables. This is a genuine strength and matches what Zoho Books gives you out of the box. Minor gap: no automated dunning/reminder ladder tied to the buckets.

---

## 4. Bank reconciliation — PARTIAL (45)

Matching logic exists, but reconciled bank transactions **do not post the corresponding GL entry** (e.g. bank charges, interest received). In a closed-books system, reconciliation is also a posting event. Today it's a matching exercise that leaves the GL untouched — so the bank GL account will drift from the statement. Benchmark: Zoho Books auto-creates adjustment entries on reconciliation.

---

## 5. India Tax — GST engine REAL, return layer LEAKS

### 5.1 GST computation engine — REAL (82)
The core engine lives in **`packages/payroll-math/src/gst-engine.ts`** (note: *not* under `apps/api/src/lib/india/` as an older audit stub implied). It correctly implements:
- Intra-state → **CGST + SGST** (50/50 split); inter-state → **IGST**.
- **ITC set-off sequence** per s.49 (the 7-step utilization order: IGST→IGST, then IGST→CGST/SGST, etc.).
- **Blocked ITC** under s.17(5).
- **Reverse-charge (RCM)** handling.

This is genuinely correct India-GST math and is the strongest single piece of statutory logic in the codebase.

### 5.2 GSTR-1 generation — BUG (35)
`generateGSTR1` (`accounting.ts` around :571-609) builds a real GSTN-shaped B2B/B2CS payload, **but hardcodes the tax rate**: every line item is emitted with `rt: 18` (`accounting.ts:583`), regardless of the invoice's actual `gstRate`. Any invoice at 0/5/12/28% will file with the wrong rate slab. This is a **filing-correctness bug** — GSTN portal reconciliation and the buyer's GSTR-2B would mismatch. **This must be fixed before any customer files a real GSTR-1.**

### 5.3 GSTR-2B / ITC reconciliation — MISSING (5)
There is no ingestion of the GSTN-published GSTR-2B and no auto-reconciliation of purchase invoices against it. This is the **single biggest India-GST gap** relative to the market:
- **Tally Prime 5.0** ships automated GSTR-2B reconciliation as a headline feature.
- Zoho Books offers it (natively/add-on).
Without it, a customer cannot safely claim ITC — Rule 36(4) requires ITC to be matched to 2B. This is arguably the highest-value India-tax feature to build.

### 5.4 E-invoice / IRN — STUB (25)
E-invoice generation only **enqueues a job**; there is no IRP/IRN client (no ClearTax/NIC API call, no signed QR/IRN return). The only *real* external statutory integration in the codebase is ClearTax **GST** (`cleartax-gst.ts:54`) — e-invoicing isn't wired to it. Mandatory for turnover ≥ ₹5cr, so it's in-ICP for larger customers.

### 5.5 Vendor TDS — MISSING at transaction time (20)
TDS is not automatically computed/withheld when a vendor invoice/payment is booked. There's no 194C/194J rate table applied at posting, and no 26Q/27Q return assembly. Benchmark: **Tally is the TDS leader** (auto-calc, 26Q/27Q); Zoho's TDS module is comparatively narrow. For Indian AP this is table-stakes.

---

## 6. Procurement (P2P) — workflow REAL, GL posting STUB

### What's real (60)
- Requisition → PO → GRN workflow exists with approval gating.
- **3-way match is genuinely real** and line-keyed: it pairs invoice lines to PO lines and to GRN receipts within a ₹1 tolerance (`apps/api/src/lib/invoice-po-match.ts:60-70`), including greedy line pairing and per-line delta reporting. This is better than many mid-market tools.

### The critical gap (15)
**PO accrual journal entries post to placeholder account UUIDs.** On PO approval the accrual JE is written to `accountId: "00000000-...0001"` (debit) and `...0002` (credit) — literal placeholders, with an inline comment admitting *"In a real system, we'd lookup specific COA IDs"* (`apps/api/src/routers/procurement.ts:372-388`). Consequences:
- These accounts don't exist in any tenant's COA, so the accrual is orphaned — it never lands in the trial balance correctly.
- The whole procurement→GL bridge is effectively non-functional despite the double-entry being "written."

**This is the finance cluster's most misleading gap:** the code *looks* like it posts to the ledger, but posts nowhere real. Fix: resolve accrual/expense/liability accounts from a per-tenant COA mapping (accounting config), not constants.

### Strategic sourcing — MISSING (5)
No RFI/RFP/RFQ, no reverse auctions, no supplier bid comparison. Benchmark split:
- **SAP Ariba** = strategic sourcing depth (RFx, auctions, punchout catalogs, global supplier network, full source-to-pay).
- **Coupa** = supplier onboarding/risk/performance, sourcing events, budget controls, ease of use.
The platform today is "PO management," not "procurement." For the ICP, the **Coupa-style** direction (onboarding, budget control, spend visibility) is more valuable to build than Ariba-style auctions.

---

## 7. Expenses — PARTIAL, and fragmented (40)

There are **two disconnected expense systems**:
- `expenses.ts` → `expenseReports`
- `hr.ts` → `expenseClaims`

They don't share a model, an approval chain, or a GL-posting path. A controller sees expenses in two places that don't reconcile. Neither reliably posts to the GL. Benchmark: Zoho Expense / SAP Concur unify claim → approval → reimbursement → GL posting → (India) GST-ITC-on-eligible-expenses. **Consolidate to one expense sub-ledger** and wire it to the GL and to payroll reimbursement.

---

## 8. Inventory — MINIMAL (20)

- **No costing method** — no FIFO, no weighted-average cost. Without valuation you cannot compute COGS or an inventory line on the balance sheet.
- **No multi-warehouse / multi-location** stock.
- **No cycle counting / stock adjustment with GL posting.**
Benchmark: Zoho Inventory / Tally both do WAC/FIFO and post COGS automatically. If inventory is in-ICP, valuation is the first thing to build; if it isn't, consider descoping it rather than shipping a hollow module.

---

## 9. Vendors — MINIMAL (25)

Vendor master is thin: no vendor scorecards, no KYC/PAN/GSTIN validation at onboarding, no bank-detail verification, no duplicate-vendor detection, no MSME classification flag (which matters for the MSMED Act 45-day payment / interest rule — and ties directly to the contract-audit MSME finding). Benchmark: Coupa's supplier management (onboarding, risk, performance) is the reference. At minimum add GSTIN/PAN validation and the MSME flag.

---

## 10. Prioritized fix list (CFO ranking)

| # | Fix | Area | Effort | Why it ranks here |
|---|---|---|---|---|
| 1 | **Fix GSTR-1 hardcoded 18% rate** (`accounting.ts:583`) | GST | Low | Filing-correctness bug; one-line-ish; blocks real filing |
| 2 | **Rewrite P&L to sum posted lines in date range** (`accounting.ts:465-483`) | GL | Med | Converts snapshot into real financial statement |
| 3 | **Implement balance sheet** from posted lines | GL | Med | Statutory (AOC-4 Schedule III); pairs with #2 |
| 4 | **Resolve procurement accrual accounts** from per-tenant COA (`procurement.ts:372-388`) | P2P→GL | Med | Makes the procurement→GL bridge actually work |
| 5 | **GSTR-2B ingestion + ITC reconciliation** | GST | High | Biggest India-tax gap; Rule 36(4) compliance; Tally parity |
| 6 | **Vendor TDS automation** (194C/194J at posting + 26Q/27Q) | AP/Tax | High | Table-stakes Indian AP; Tally parity |
| 7 | **Period-lock enforcement** in `journal.create` | Close | Low | Prevents back-dated postings into closed periods |
| 8 | **Consolidate the two expense systems** + GL posting | Expenses | Med | Removes a reconciliation blind spot |
| 9 | **Bank-rec GL posting** (charges/interest adjustment entries) | Bank | Low | Stops bank GL account drifting from statement |
| 10 | **E-invoice IRP client** (wire IRN via ClearTax) | GST | Med | Mandatory ≥₹5cr turnover customers |
| 11 | **Inventory WAC/FIFO valuation + COGS posting** | Inventory | High | Only if inventory is in-ICP; else descope |
| 12 | **Vendor GSTIN/PAN validation + MSME flag** | Vendors | Low | Cheap; supports MSMED + KYC |

Items **1, 7, 9, 12 are cheap** and remove disproportionate risk — do them first. Items **2, 3, 4** are the "turn a ledger into books" trio. Items **5, 6** are the India-tax depth that differentiates against Zoho and matches Tally.

---

## 11. Bottom line for this cluster

You have a **real accounting kernel** (double-entry, reversal, trial balance, period close, aging, 3-way match, GST engine) that most competitors don't build correctly. The gaps are concentrated at **three seams**:
1. **Sub-ledger → GL posting** (procurement placeholder accounts, bank rec, expenses) — the ledger is real but the tributaries don't reliably flow into it.
2. **Statements** (P&L snapshot bug, no balance sheet) — you have a trial balance but not financial statements.
3. **India return-filing boundary** (GSTR-1 rate bug, no GSTR-2B, no automated TDS) — the *math* is right, the *filing* leaks.

Close those three seams and this moves from ~42 to a genuinely creditable ~70+ finance suite that a mid-market Indian controller could actually run a month-end and a GST cycle on.
