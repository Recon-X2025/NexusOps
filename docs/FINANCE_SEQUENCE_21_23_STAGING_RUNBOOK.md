# Finance stack Seq 21–23 — staging runbook

**Purpose:** ENV and URLs to run **financial**, **inventory**, and **accounting** hero paths.

---

## 1. ENV

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Must include **accounting** tables (`chart_of_accounts`, `journal_entries`, …). Run **`pnpm db:migrate`** from repo root if COA seed returns `PRECONDITION_FAILED`. |
| `REDIS_URL` | Sessions / rate limit (match local compose if used). |

---

## 2. Local dev restart (web + API)

See **`docs/FINANCE_PROCUREMENT_STAGING_RUNBOOK.md` §2** (`pnpm --filter @nexusops/db build`, then API + web in separate terminals) — same pattern applies.

---

## 3. Smoke URLs (P1 admin)

| Seq | URL |
|-----|-----|
| 21 | `http://localhost:3000/app/financial` |
| 22 | `http://localhost:3000/app/work-orders/parts` |
| 23 | `http://localhost:3000/app/accounting` |

---

## 4. API procedures (quick reference)

- **21:** `financial.listInvoices`, `financial.createBudgetLine`, … (see FP pack).  
- **22:** `inventory.create`, `inventory.list`, `inventory.intake`, `inventory.issueStock`, `inventory.reorder`, `inventory.transactions`.  
- **23:** `accounting.coa.seed`, `accounting.coa.list`, `accounting.journal.create`, `accounting.journal.post`, `accounting.trialBalance`, `accounting.gstin.create`, `accounting.gstr.generateGSTR3B`.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Sprint C3 |
