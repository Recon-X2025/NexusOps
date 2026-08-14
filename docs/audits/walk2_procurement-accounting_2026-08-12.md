# WALK 2 — Procurement & Accounting (localhost, SHA 5c5490d)

**Method:** browser is the test; every control clicked, network watched, screenshots in `docs/audits/walk2-shots/`.

## Accounting

### ✅ Journal entry — works end to end, debit=credit invariant enforced (screenshots 33–34)
`/app/finance/accounting/journal` → **New Entry**. The modal has account dropdowns (full seeded CoA), Debit/Credit per line, live Total Debit / Total Credit and a **Balanced / Unbalanced** flag.
- **Unbalanced blocked:** debit ₹1,000 vs credit ₹500 → **"Unbalanced"**, **Save Entry disabled**. (`33-journal-unbalanced-blocked.png`)
- **Balanced posts:** credit → ₹1,000 → **"Balanced"**, Save enabled → **`accounting.journal.create` 200** → **JE-2026-00001 "QA balance test" ₹1,000** appears in the list. (`34-journal-posted.png`)
- The money-path invariant (debits = credits) holds in the UI. This create path **is wired** — contrast F2 below.

### F2 (HIGH, re-confirmed) — CoA "Add Account" is INERT
`/app/finance/accounting/coa` → **Add Account**: no dialog, no `accounting.coa.create`, no console error (only the page-load `coa.list`). Backend exists (`accounting.ts`), front-end never wired. The **Seed India COA** button DOES work (~47 accounts seeded at onboarding). So within one page: seed works, journal-create works, **but manual account-add is dead**.

### F3 (LOW, re-confirmed) — CoA category chips mis-pluralised
Filter chips render **`LIABILITYS` / `EQUITYS` / `INCOMES`** (naive `+S`).

## Procurement

### Requisition create — works, but auto-approves with no approval step (screenshot 37)
`/app/procurement` → **New Requisition** → filled Title/Dept/Justification/Item/Unit-price → **Submit** → `procurement.purchaseRequests.create` 200. The new **PR-0001** lands in the Purchase Requisitions tab already in state **"Approved"** — the Approval Pipeline counters (Awaiting Approval, Pending Approval) stay **0**. So a requisition **bypasses any approval workflow** and is immediately Approved. (May be intended for an admin/owner, but there is no visible approve/reject gate — worth confirming against the intended PR approval design.)

### F18 (MED) — "+ PO" (create PO from an approved requisition) is INERT
On the approved PR-0001 row, the **"+ PO"** action fires **no network request**, opens **no modal/form**, shows **no error**, and creates no PO (Open Purchase Orders stays 0). Either inert or silently failing (possibly because 0 vendors exist — but then it should say so). Echoes the COA Add-Account inert pattern. `37-procurement-requisition-plusPO-inert.png`
- **Walk-1's "PO approve 404"** could not be reproduced from this path because requisitions auto-approve and offer no separate Approve button; the dashboard pending-approval widget that triggered it had 0 items. Recorded as **not reproduced / not disproved** — the approval surface that walk-1 hit isn't reachable on an empty-queue tenant.

### F19 (LOW) — `₹$` double currency symbol + truncated ids (re-confirmed walk-1 format bugs)
- Requisition **Estimate** renders **`₹$50,000`**; the dashboard **"Spend by Category"** tiles render **`₹$1L` / `₹$0L`** — a `₹` prepended to a `$`-formatted value.
- "Requested By" shows a **truncated raw id `…5ecc78`** instead of a user name (same class as walk-1's truncated vendor ids in the invoice list).

## Not tested (reason)
- Full **3-way match** (invoice ≈ PO ≈ GRN) — needs a PO + GRN + invoice, blocked by F18 (can't create a PO from the UI) and no invoice-line write path. Recorded as **blocked by F18**.
- GST on a real invoice (CGST/SGST vs IGST split) — needs an invoice with line items; the known GSTR-1 per-line-vs-header issue (docs/quality-bar.md #10) was not re-exercised this walk.
