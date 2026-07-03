# Sprint 2 — Build Audit Report

**Date:** 2026-07-03
**Scope:** Sprint 2 "financial intelligence" from `docs/PLATFORM_GAP_INDEX_2026-07-03.md`, **excluding** the GRC Add-on (₹25k) and GRC Advanced (₹50k) product tiers.
**Branch:** `main` — **12 commits ahead of `origin/main`, NOT pushed** (8 from Sprint 1 incl. its audit + 4 from Sprint 2). Pushing auto-deploys to Vultr and requires user approval; take a snapshot first per CLAUDE.md.
**Test DB:** PostgreSQL `coheronconnect_test` on port 5433.

---

## 1. Executive summary

All **4 planned Sprint 2 items are complete**, each shipped as a single focused
commit with invariant tests that pass against a real Postgres and a clean
`tsc --noEmit`. The sprint turns the platform's accounting from *snapshot-only*
reporting into *period-accurate, movement-derived* financial intelligence, and
adds two India-compliance / operations money engines (fixed-asset depreciation,
inventory valuation) plus statutory ITC reconciliation.

Design stance held throughout: **new capability sits alongside the existing
quantity/snapshot code rather than mutating it.** Depreciation is a new router
over a new register; P&L/balance-sheet are new procedures that sum *posted*
journal lines (the existing `trialBalance`/`incomeStatement` snapshot readers are
untouched); GSTR-2B ingestion is a new *stateful* sub-router beside the existing
stateless reconcile; inventory valuation is a new costed `valuation` sub-router
beside the existing quantity-only intake/issue. All money math lives in the pure,
dependency-free `@coheronconnect/payroll-math` package.

Combined Sprint 2 test surface: **6 new test files, 56 tests, all green** —
**29 API-integration tests** (4 files, real Postgres) + **27 pure-math tests**
(2 files, `packages/payroll-math`). Three additive DB migrations (`0021`–`0023`)
were generated, applied, and their snapshots + journal entries committed. No
existing suites regressed.

| # | Item | Type | Commit | Tests |
|---|------|------|--------|-------|
| 2.1 | Fixed-asset depreciation engine (SLM/WDV) + register | feat | `5f51053` | 12 + 13 |
| 2.2 | Date-ranged P&L + balance sheet (posted-line rollup) | feat | `6479986` | 5 |
| 2.3 | Stateful GSTR-2B ingestion + ITC reconciliation | feat | `471dd9d` | 5 |
| 2.4 | Inventory valuation (FIFO/WAC) + costed COGS | feat | `53e4a3d` | 7 + 14 |
| | **Total** | | **4 commits** | **56** |

> Test-count notation `A + B` = API-integration tests + pure-math tests for the
> same item.

---

## 2. Item-by-item detail

### 2.1 — Fixed-asset depreciation engine — `feat(assets)` `5f51053` (migration 0021)
- **Gap:** the platform tracked assets (cost, purchase date) but never depreciated
  them — no book value, no accumulated depreciation, no period ledger, so the
  balance sheet could not carry net fixed assets.
- **Change (pure-math):** `packages/payroll-math/src/depreciation.ts` —
  `computePeriodDepreciation`, `generateDepreciationSchedule`, `deriveWdvRate`,
  `bookValueAfter`, type `DepreciationMethod`. **SLM** = (cost − salvage)/life;
  **WDV** = declining balance at rate `1 − (salvage/cost)^(1/life)` (notional 5%
  residual when salvage = 0 to keep the rate finite); the **final period is
  trued-up to salvage** so book value lands exactly on the residual.
- **Change (persistence):** `depreciationRouter`
  (`apps/api/src/routers/depreciation.ts`) under the **`cmdb`** RBAC module —
  `setup` (idempotent enrol; re-config allowed only before any charge), `schedule`
  (pure-math preview, no writes), `run` (charge the next period, idempotent per
  `(asset, period)` via `onConflictDoNothing`, row-locked), `runAll` (batch the
  next due period across enrolled non-fully-depreciated assets), `register` (book
  values + totals), `entries` (per-asset ledger). Tables `asset_depreciation`
  (register) / `asset_depreciation_entries` (ledger) in `schema/cmdb.ts`. Reads
  gate `cmdb:read`, mutations `cmdb:write`. Book value + accumulated depreciation
  are maintained on the register row so the 2.2 balance-sheet rollup reads them.
- **Invariant preserved:** the final-period true-up and the ≤salvage floor are
  enforced in the router around the pure-math charge, so accumulated depreciation
  can never exceed the depreciable base and book value never dips below salvage.
- **Tests:** `depreciation.test.ts` (API, 12) — cost defaulting from the asset,
  explicit-cost requirement, salvage<cost guard, re-config-then-block-after-charge,
  schedule-no-writes, SLM equal-periods + final true-up, refuse-past-fully-
  depreciated, WDV declining charges, `runAll` batch, register totals, tenant
  isolation, RBAC denial; `payroll-math/src/depreciation.test.ts` (pure, 13) —
  SLM schedule + tie-out, WDV declining balance + salvage floor, rate derivation,
  book value after N periods.

### 2.2 — Date-ranged P&L + balance sheet — `feat(accounting)` `6479986` (no migration)
- **Gap:** `trialBalance` and `incomeStatement` read the `currentBalance` snapshot
  **date-blind** — they cannot answer "P&L for April" and there was **no balance
  sheet** at all, so the accounting identity (Assets = Liabilities + Equity) was
  never asserted.
- **Change:** two new procedures on `accountingRouter` (`financial:read`), added
  beside the snapshot readers (which are left untouched):
  - **`profitAndLoss({startDate, endDate})`** — sums **posted** `journal_entry_lines`
    (`debit − credit`) grouped by account for entries whose date falls in the
    window (inner join on posted `journal_entries`); income is surfaced as `−net`,
    expense as `+net`, zero-movement lines filtered. Returns income/expenses arrays
    + `totalIncome`, `totalExpenses`, `netProfit`. Every surfaced figure is a
    positive presentation amount.
  - **`balanceSheet({asOfDate?})`** — groups the `currentBalance` snapshot by
    section: assets (incl. contra-assets netted down), liabilities, equity.
    **Net income to date is folded into equity as `currentPeriodEarnings`**
    (`totalIncome − totalExpenses`) so the identity closes **without** a
    period-close entry. Returns `assets/liabilities/equity` blocks (each with
    `rows` + `total`), `totalAssets`, `totalLiabilitiesAndEquity`, and
    `isBalanced` (|Δ| < 0.01).
- **Invariant preserved (the accounting identity):** because equity absorbs
  current-period earnings, `totalAssets === liabilities.total + equity.total`
  holds continuously; contra-assets (e.g. accumulated depreciation) net the asset
  side down so both sides move together.
- **Design note:** P&L is **movement-derived** (posted lines in a window) while the
  balance sheet is **position-derived** (the running snapshot). Draft/unposted
  entries never appear in either — the P&L inner-joins on `posted` and the snapshot
  only advances on `journal.post`.
- **Tests:** `balance-sheet-pnl.test.ts` (5) — date-window P&L netting (May revenue
  excluded from an April window), draft-exclusion, the balance-sheet identity
  (bank 500k + AR 200k = 700k assets; AP 80k liability; equity 500k capital + 120k
  current earnings = 620k; balanced), contra-asset (accumulated depreciation)
  netting the asset total down, tenant isolation.

### 2.3 — Stateful GSTR-2B ingestion + ITC reconciliation — `feat(financial)` `471dd9d` (migration 0022)
- **Gap:** `financial.gstr2bReconcile` reconciled a portal statement against book
  invoices **statelessly** (compute-and-discard) — nothing was persisted, so
  eligible ITC was not auditable and could not feed a GSTR-3B claim.
- **Change:** a new **stateful `gstr2b` sub-router** on `financialRouter`, added
  beside the existing stateless reconcile (which is left in place):
  - **`ingest({gstinId?, month, year, lines[]})`** (`financial:write`) — validates
    the GSTIN belongs to the org, fetches the org's payable invoices for the
    period, and calls the pure-math `reconcileGSTR2B(bookLines, portalLines)`
    (`packages/payroll-math/src/gst-engine.ts`) which buckets each line as
    **matched / mismatch / missing_in_2b / missing_in_books** within a tolerance.
    **Eligible ITC = tax on matched lines only**; portal ITC = tax across all 2B
    lines. In a transaction it **deletes the prior run for the period then inserts**
    the new import header + per-line rows (idempotent re-ingest replaces).
  - **`list`** / **`get({importId})`** (`financial:read`) — retrieve the stored
    import(s) and their reconciled lines.
  - Tables `gstr2b_imports` (header: per-bucket counts + `portalItc` + `eligibleItc`,
    unique per `(org, gstin, month, year)`) / `gstr2b_recon_lines` (book vs portal
    taxable/IGST/CGST/SGST + status) + enum `gstr2b_recon_status` in
    `schema/accounting.ts`.
- **Invariant preserved (ITC eligibility):** eligible ITC is derived **only** from
  matched-line tax in the pure-math layer — a tax mismatch or a book-only /
  portal-only line never contributes claimable ITC. Re-ingest is idempotent
  (one import row survives per period).
- **Tests:** `gstr2b-reconciliation.test.ts` (5) — the four reconciliation buckets +
  eligible (₹1,800) vs portal ITC, persistence + retrieval, idempotent re-ingest
  replacing the prior run, tenant isolation (a portal line matches only against the
  caller-org's own book invoice), RBAC denial.

### 2.4 — Inventory valuation (FIFO/WAC) + costed COGS — `feat(inventory)` `53e4a3d` (migration 0023)
- **Gap:** inventory was **quantity-only** — intakes and issues carried no cost, so
  there was no cost of goods sold on issue and no stock book value for the balance
  sheet.
- **Change (pure-math):** `packages/payroll-math/src/inventory-valuation.ts` — a
  stateless FIFO + WAC engine. **FIFO:** `issueFifo` (consume oldest cost layers
  first → COGS + remaining layers + shortfall), `intakeFifo`, `fifoOnHandValue`,
  `fifoOnHandQty`; layers treated as immutable. **WAC:** `intakeWac`
  (`newAvg = (oldQty·oldAvg + inQty·inCost)/(oldQty+inQty)`), `issueWac` (expense at
  the average; **the average is unchanged by an issue**; a fully-depleted item
  resets it to 0). 2-dp money rounding at the boundary.
- **Change (persistence):** a new costed **`valuation` sub-router** on
  `inventoryRouter` (`inventory` module), beside the existing quantity-only
  procedures (which are left untouched):
  - **`setMethod`** (FIFO/WAC, only while the item carries no stock),
  - **`intake`** (add qty at a purchase unit cost; FIFO appends a cost layer, WAC
    re-weights the running average; both keep `avgUnitCost`/`stockValue` in step),
  - **`issue`** (consume qty and expense COGS — FIFO walks/depletes layers oldest-
    first, WAC expenses at the average; guarded against over-issue),
  - **`layers`** (the FIFO cost-layer stack) and **`report`** (per-item book value +
    org total stock value).
  - Schema: `inventory_valuation_method` enum + `valuation_method` / `avg_unit_cost`
    / `stock_value` on `inventory_items`; `unit_cost` / `cogs` on
    `inventory_transactions`; new `inventory_cost_layers` table (FIFO lots, oldest
    first, `sequence`-ordered) in `schema/inventory.ts`.
- **Invariant preserved (COGS ≤ book value / stock non-negative):** the router
  guards issue against on-hand qty and derives COGS from the pure-math engine, so
  FIFO COGS is exactly the oldest-cost-first consumption and WAC COGS is exactly
  `qty × average`; `stock_value` rolls forward as `prev − COGS` (FIFO) or
  `qty × avg` (WAC) and can't go negative.
- **Design note:** intakes/issues run in a **row-locked transaction** (`SELECT … FOR
  UPDATE` on the item, and on the FIFO layers) so concurrent movements can't double-
  spend a cost layer or race the average.
- **Tests:** `inventory-valuation.test.ts` (API, 7) — FIFO oldest-cost-first COGS
  across layers (issue 15 of 10@100+10@120 → COGS 1,600, 5@120 remain), WAC running
  average (avg 110, issue 5 → COGS 550, avg unchanged), book-value roll-forward in
  `report`, insufficient-stock guard, method-change block once stocked, tenant
  isolation, RBAC denial; `payroll-math/src/inventory-valuation.test.ts` (pure, 14)
  — FIFO layer spanning/depletion/immutability/shortfall + on-hand rollups, WAC
  re-weight/issue/depletion-reset/shortfall, negative-issue guards.

---

## 3. Database migrations

| Migration | Adds | Applied to 5433 | Journal + snapshot |
|-----------|------|-----------------|--------------------|
| `0021_worried_luminals.sql` | `asset_depreciation` / `asset_depreciation_entries` | ✅ | ✅ |
| `0022_strong_sleepwalker.sql` | `gstr2b_imports` / `gstr2b_recon_lines` (+ enum) | ✅ | ✅ |
| `0023_amusing_quasimodo.sql` | `inventory_cost_layers` + item/tx cost cols (+ enum) | ✅ | ✅ |

All three are **additive** (new tables / enums / columns / indexes) — no data
backfill, no destructive DDL; new columns are nullable or carry safe defaults
(`valuation_method` default `WAC`, `avg_unit_cost`/`stock_value` default `0`).
`pnpm check:migrations` reports the journal in sync. FK `onDelete` choices follow
`docs/DATA_MODEL.md`: `org_id → organizations` CASCADE, child → parent CASCADE
(import → lines, item → cost-layers), nullable actor (`created_by_id → users`)
SET NULL, lookup reference (`gstin`) RESTRICT. Sprint 2.2 (P&L/balance-sheet)
added only router procedures — **no migration**.

---

## 4. Verification performed

- **Typecheck:** `tsc --noEmit` (apps/api) clean after every item.
- **API tests:** the 4 Sprint 2 API suites re-run together —
  **4 files, 29 tests, all passing** (~53s):
  depreciation (12), balance-sheet-pnl (5), gstr2b-reconciliation (5),
  inventory-valuation (7).
- **Pure-math tests:** `packages/payroll-math` — depreciation (13) +
  inventory-valuation (14) = **27 passing**.
- **Migration journal:** `pnpm check:migrations` — in sync.
- **Rebuilds:** `packages/db` rebuilt after each schema change (`0021`–`0023`);
  `packages/payroll-math` rebuilt after the depreciation + inventory-valuation
  exports so `apps/api` saw the new functions before typecheck.

Reproduce the API suite from `apps/api`:
```
DATABASE_URL="postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test" \
  npx vitest run depreciation balance-sheet-pnl gstr2b-reconciliation inventory-valuation
```
Reproduce the pure-math suite from `packages/payroll-math`:
```
npx vitest run depreciation inventory-valuation
```

---

## 5. Scope notes, carry-overs & follow-ups

- **P&L vs snapshot readers coexist.** `profitAndLoss`/`balanceSheet` are
  movement/position-accurate additions; the older `trialBalance`/`incomeStatement`
  snapshot readers were intentionally left in place. Deciding whether to retire the
  snapshot readers (or re-point the web UI at the new statements) is a UI/product
  call, not done here.
- **Depreciation ↔ GL posting.** The depreciation register maintains book value +
  accumulated depreciation and the balance sheet reads them, but **charging a
  period does not yet auto-post a journal entry** (expense debit / accumulated-
  depreciation credit). Auto-posting the GL side is a natural next step (Phase 5
  money-math wiring).
- **Inventory ↔ GL posting.** Likewise, costed issue computes COGS but does not yet
  post a COGS/inventory journal entry — the value is on the transaction row and the
  item's `stock_value`, ready to be wired to the ledger.
- **GRC tiers excluded.** Per the standing instruction, the GRC Add-on (₹25k) and
  GRC Advanced (₹50k) product tiers remain out of scope for this build.
- **Carried from Sprint 0/1 (still open):** CMDB cycle detection
  (`assets.cmdb.getTopology` has no cycle guard) and GST-on-invoice-entry
  (`financial.createInvoice` should run `computeGST()`). Neither was in the Sprint 2
  plan; both are still parked.

## 6. Git / deploy state

- **12 commits ahead of `origin/main`** — 8 from Sprint 1 (incl. its audit,
  `…35bdb30`, `19d6908`) + the 4 Sprint 2 commits (`5f51053`, `6479986`,
  `471dd9d`, `53e4a3d`); **nothing pushed**. Push (→ Vultr auto-deploy) awaits
  explicit user approval, and a snapshot/backup should be taken first per CLAUDE.md.
- Pre-existing unrelated working-tree changes (`apps/docs/*`, `docs-word/`,
  `apps/web/next-env.d.ts`, `scripts/gen-gap-docx.py`, `vendor-esign-detail.png`)
  were left untouched throughout Sprint 2.
