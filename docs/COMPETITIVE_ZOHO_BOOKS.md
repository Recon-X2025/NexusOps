# COMPETITIVE_ZOHO_BOOKS.md — Zoho Books (India) vs CoheronConnect Finance

**Purpose.** Zoho Books is the incumbent an Indian SMB finance team compares us against, and its
Report Center is effectively a published requirements spec for Indian statutory accounting. This
document records what Zoho Books actually ships, what CoheronConnect actually ships, and the
delta — with `file:line` evidence on our side for every claim.

- **Date:** 2026-08-17
- **Method (Zoho side):** live authenticated session, read-only. Route map extracted from the SPA
  DOM (`a[href*="#/"]`); report catalogue read from the Report Center list view. No transactional
  data was read, retained, or reproduced — the tenant's figures are deliberately absent from this
  document and are **not** part of the analysis.
- **Method (our side):** direct source read at branch `main`, working tree including the in-flight
  depreciation unit. Every gap claim below is grounded in a citation. Where something was **not**
  verified it is marked so, per the operating rules in `CLAUDE.md`.
- **Legend:** ✅ REAL · 🟡 PARTIAL · 🔴 STUB (schema/enum only) · ⛔ MISSING

> **Scope caution.** This is a *capability* comparison, not a licence to build 89 reports.

---

## 0. Standing decision (2026-08-17) — scope is held to the existing surface

**Decided by the owner on reading this analysis:**

1. **Stick to what the product already has.** The Zoho delta in §3 is **reference material, not a
   backlog.** Recurring invoices, vendor credits, GSTR-9, IFF/PMT-06, TDS/TCS reports, cash flow,
   Schedule III, currency adjustments and the report catalogue are **not** scheduled work. They are
   recorded here so the gap is known and so nobody re-derives it from scratch later.
2. **Assets and depreciation are retained.** The fixed-asset register and the depreciation engine
   stay in the product and the in-flight unit is carried to completion. This is the one place we
   are ahead of the incumbent rather than behind it (§5), and it is already wired to the balance
   sheet through the GL.

**What this leaves as actionable:** only defects in code that already exists — F1, F2, F3 in §4.
Those are not feature work; they are wrong numbers on screens we already ship. Everything else in
§6 is explicitly parked.

---

## 1. What Zoho Books ships (the reference surface)

### 1.1 Module map (from the SPA route table)

| Module | Routes |
|---|---|
| Items | `inventory/product/index` |
| Sales | `contacts` (Customers), `quotes`, `salesorders`, `invoices`, `recurringinvoices`, `paymentsreceived`, `creditnotes`, `ewaybills` |
| Purchases | `vendors`, `expenses`, `recurringexpenses`, `purchaseorders`, `bills`, `recurringbills`, `paymentsmade`, `vendorcredits` |
| Time Tracking | `timesheet/projects`, `timesheet/alltimeentries` |
| Banking | `banking` |
| Filing & Compliance | `gstfiling-dashboard` |
| Accountant | `accountant/journals`, `accountant/bulkupdateaccounts`, `accountant/bcyadjustment/list` (currency adjustments), `accountant/chartofaccounts`, `accountant/transactionlock` |
| Reports | `reports` (+ 14 category groups, custom/shared/scheduled) |
| Documents | `documents/inbox` |
| Payments | `payments` |

### 1.2 Report catalogue — 89 reports across 14 categories

The categories are the signal: **Business Overview, Sales, Receivables, Payments Received,
Recurring Invoices, Payables, Purchases and Expenses, Taxes, Banking, Projects and Timesheet,
Accountant, Currency, Activity, Automation.**

The ones that matter for our roadmap:

- **Business Overview (9):** Profit and Loss · **Profit and Loss (Schedule III)** · Horizontal P&L ·
  **Cash Flow Statement** · Balance Sheet · Horizontal Balance Sheet · **Balance Sheet (Schedule III)** ·
  Business Performance Ratios · Movement of Equity
- **Accountant (8):** Account Transactions · Account Type Summary · Account Type Transactions ·
  **Day Book** · General Ledger · Detailed General Ledger · Journal Report · Trial Balance
- **Taxes (11):** Tax Summary · **Annual Summary (GSTR-9)** · TDS Summary · TDS Receivable Summary ·
  **TCS Payable (Form 27EQ)** · **Invoice Furnishing Facility (IFF)** · **PMT-06** · GSTR-3B Summary ·
  Summary of Outward Supplies · Summary of Inward Supplies · **Self Invoice Summary** (RCM)
- **Banking (1):** Reconciliation Status
- **Currency (2):** Realized Gain or Loss · Unrealized Gain or Loss
- **Activity (7):** System Mails · **Activity Logs & Audit Trail** · **Exception Report** ·
  Portal Activities · Customer Reviews · API Usage · Pending Inventory Valuations
- **Automation (3):** Scheduled Date Based Workflow Rules · Scheduled Time Based Workflow Actions ·
  Workflow Execution Logs

Report Center is itself a first-class module: categories, favourites, **shared reports**, **custom
report builder**, and **scheduled delivery**.

---

## 2. What CoheronConnect Finance ships today (verified inventory)

`accountingRouter` (`apps/api/src/routers/accounting.ts:155`):

| Area | Procedures | Evidence |
|---|---|---|
| Chart of accounts | `coa.list / create / update / seed` | `accounting.ts:159` |
| Journals | `journal.list / create / post / reverse` | `accounting.ts:259` |
| Statements | `ledger` · `trialBalance` · `incomeStatement` · `profitAndLoss` · `balanceSheet` | `accounting.ts:483, 517, 573, 602, 684` |
| GST | `gstin.*`, `gstr.generateGSTR1`, `gstr.generateGSTR3B` | `accounting.ts:773, 825, 1094` |
| Bank reconciliation | `bankRec.listStatements / createStatement / getStatement / importTransactions / suggestMatches / match / unmatch / ignore / reconcile` | `accounting.ts:1178, 1272` |

Adjacent: `financial.periodClose` (`routers/financial.ts:1707`), budgets + variance, AP aging,
credit/debit notes (`createCreditDebitNote`), e-way bills (`workflows/ewayBillWorkflow.ts`,
`services/integrations/nic-ewaybill.ts`), and the in-flight depreciation unit
(`lib/depreciation-sweep.ts`, `lib/depreciation-journal.ts`, `routers/depreciation.ts`).

Finance web surfaces (`apps/web/src/app/app/`):
`finance/accounting/{balance-sheet,coa,journal,ledger,pnl,reconciliation}`, `finance/depreciation`,
`finance/expenses` — **plus a second, older `accounting/page.tsx`** (see F1).

---

## 3. Gap table — **reference only, not a backlog** (see §0)

| # | Zoho capability | Ours | Evidence / note |
|---|---|---|---|
| 1 | Balance Sheet + P&L, **Schedule III format** | 🟡 statements exist, no Schedule III shaping | `accounting.ts:684` groups flat by account `type`; no current/non-current split, no Schedule III heads, no comparative prior-year column |
| 2 | **Cash Flow Statement** | ⛔ | zero hits for `cashFlow`/`cash_flow` in `apps/api/src`, `apps/web/src`, `packages/db/src` |
| 3 | Horizontal P&L / Balance Sheet | ⛔ | presentation variants only; low value until #1 |
| 4 | Movement of Equity | ⛔ | Schedule III companion statement |
| 5 | Business Performance Ratios | ⛔ | derivable from #1 once heads exist |
| 6 | **Day Book** | ⛔ | the report Indian accountants ask for by name |
| 7 | General Ledger / Detailed GL / Journal Report | 🟡 | `ledger` (`accounting.ts:483`) covers part; no detailed/journal variants |
| 8 | Trial Balance | ✅ | `accounting.ts:517` |
| 9 | Account Type Summary / Transactions | ⛔ | trivial once `subType` grouping exists (#1) |
| 10 | **GSTR-9 (Annual Summary)** | 🔴 | appears only as a comment in a `form_type` text column, `packages/db/src/schema/accounting.ts:241`; no generator |
| 11 | GSTR-1 / GSTR-3B | ✅ | `accounting.ts:825, 1094` |
| 12 | TDS Summary / TDS Receivable / TCS 27EQ | ⛔ | TDS is computed in payroll but not reported on the books side |
| 13 | IFF / PMT-06 (QRMP scheme) | ⛔ | matters for sub-₹5cr turnover tenants — i.e. most SMBs |
| 14 | Self Invoice Summary (RCM) | ⛔ | reverse-charge self-invoicing |
| 15 | Summary of Outward / Inward Supplies | ⛔ | |
| 16 | Bank reconciliation | ✅ | `accounting.ts:1178`, incl. `suggestMatches` at `:1272` — competitive |
| 17 | Reconciliation Status report | ⛔ | data exists; no report over it |
| 18 | **Recurring invoices / bills / expenses** | ⛔ | zero hits repo-wide for `recurringInvoice`/`recurring_invoice`/`recurringBill`/`recurring_bill` |
| 19 | Credit Notes | ✅ | `financial.createCreditDebitNote`; COA 4130/4140 exist with an audit-trail rationale |
| 20 | **Vendor Credits** | ⛔ | zero hits for `vendorCredit`/`vendor_credit` — AP side has no mirror of #19 |
| 21 | Transaction Locking / period close | ✅ | `financial.ts:1707` |
| 22 | Currency Adjustments + Realized/Unrealized Gain-Loss | ⛔ | multi-currency reporting absent |
| 23 | Bulk Update Accounts | ⛔ | operator convenience |
| 24 | Activity Logs & Audit Trail **as a user-facing report** | 🟡 | we have a stronger mechanism (hash chain, `packages/db/src/schema/auth.ts:394-402`) but no finance-facing report over it |
| 25 | Exception Report (data-integrity surfacing) | ⛔ | our analogues: unposted journals, unbalanced entries, assets without depreciation setup |
| 26 | **Scheduled / shared / custom reports** | ⛔ | zero hits for `scheduledReport`/`reportSchedule`; `routers/reports.ts` is ITSM-only (see F9) |
| 27 | e-Way Bills | ✅ | `workflows/ewayBillWorkflow.ts`, NIC integration |
| 28 | **Fixed assets + depreciation** | ✅ **ours only** | Zoho Books has **no** such module — see §5 |

---

## 4. Deep findings established while verifying (code-level, ours)

These were found during this pass and are **not** Zoho-comparison items — they are defects and
structural issues in our own finance code. Reachability was established before severity, per
`CLAUDE.md`.

### F1 — Two divergent P&L screens; the legacy one reports inception-to-date under a "Net Profit" label — **CONFIRMED, reachable, user-visible**

`apps/web/src/app/app/accounting/page.tsx:321` renders a tab labelled **P&L** that calls
`accounting.incomeStatement` with `{}` — no dates, no period selector, no label stating the period.
`incomeStatement` (`accounting.ts:573`) reads the `currentBalance` snapshot, so the figure is
**inception-to-date**. It is displayed in a coloured panel as "Net Profit" / "Net Loss".

The newer screen `apps/web/src/app/app/finance/accounting/pnl/page.tsx:157` correctly calls
`profitAndLoss` and its header comment explicitly warns the two "are not interchangeable".

So the trap is documented in one place and live in the other — the exact divergent-duplicate
pattern `CLAUDE.md` names as this codebase's recurring defect. A user on `/app/accounting` reads a
lifetime figure as the current year's profit.

**Fix:** retire the legacy tab, or point it at `profitAndLoss` with an explicit period selector.

### F2 — Two statement procedures declare date inputs and silently ignore them — **CONFIRMED (both)**

**`incomeStatement`** (`accounting.ts:573-577`):
```
incomeStatement: permissionProcedure(...).input(z.object({
  financialYear: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate:   z.coerce.date().optional(),
})).query(async ({ ctx }) => {        // ← input never destructured
```

**`trialBalance`** (`accounting.ts:517-531`) — same defect, found later while extracting the Trial
Balance screen. It declares `financialYear` and `asOfDate`, *does* destructure `input`, and then
never reads either: every line is computed from `chartOfAccounts.currentBalance`, i.e.
inception-to-date.

In both cases a caller passing a period gets inception-to-date numbers with **no error** — a silent
wrong answer, not a failure. Either honour the input or drop the fields from the schema.

**Consequence for UI:** the extracted Trial Balance screen deliberately ships **without** an
as-of-date control, because adding one would be a facade — the picker would change nothing. The
subtitle states the figures are inception-to-date instead. Add the control when the procedure
honours the input.

### F3 — The two statement procedures disagree on contra-revenue — **CONFIRMED, reachable**

COA 4130 *Sales Returns & Allowances* and 4140 *Supplementary Sales & Revenue Adjustments* are
typed `income` (not `contra_income`) by deliberate design — credit notes **debit** 4130 so
gross-to-net revenue stays auditable (`accounting.ts:90-95`).

- `profitAndLoss` (`:602`) computes revenue as `−net`, so a debit balance on 4130 correctly
  **reduces** income. ✅
- `incomeStatement` (`:573`) does `Math.abs(Number(a.currentBalance))` and **adds** it, so sales
  returns **inflate** reported income and net profit. ❌

Reachable via any credit note. Compounds F1: the legacy screen is wrong in two independent ways.

### F4 — Two chart-of-accounts seed lists that can drift — **LOW (self-healing), but structurally fragile**

`INDIA_COA_SEED` (`accounting.ts:51`, 47 accounts) vs `coaSeed` (`packages/db/src/seed.ts:173`,
21 accounts). The base seed omits **1290 Accumulated Depreciation** and **5500 Depreciation** —
precisely the two accounts `postDepreciationJournalEntry` requires (`lib/depreciation-journal.ts:43`),
which returns `null` (skips posting) when they are absent.

**Severity is low, not high:** `reconcileSeedsForAllOrgs` runs at API startup
(`apps/api/src/index.ts:851`) and back-fills every org from `INDIA_COA_SEED`, so the gap closes on
the next boot. The residual risk is that nothing pins the two lists together — the `coaSeed` type
union even still declares `"contra_asset"` while no row uses it, the fingerprint of a trimmed copy.
Per the standing rule *"when a migration backfills, grep the seeds for inserts into the same
table"*, this is the same class of issue. **Add a parity test** rather than a third list.

### F5 — No fiscal-year primitive shared across finance

`currentFY()` exists (`accounting.ts:40`) and is used by the depreciation path, but there is no
shared FY helper for statements: `profitAndLoss` takes raw `startDate`/`endDate`, `balanceSheet`
takes `asOfDate`, and `budgetLines.fiscalYear` is a bare integer with no Apr–Mar anchoring
(`routers/financial.ts:177-220`). Zoho anchors Apr–Mar everywhere. Every statement, GST period and
TDS quarter depends on this. Promote `currentFY`/an FY-range helper into a shared module **before**
the statement screens harden around calendar dates.

### F6 — Schedule III is reachable from what we already store

The COA already carries the `subType` vocabulary a Schedule III mapping needs — `fixed_asset`,
`other_current_asset`, `accumulated_depreciation`, `long_term_liability`,
`other_current_liability`, `share_capital`, `retained_earnings`, `accounts_receivable`,
`accounts_payable` (`accounting.ts:51-107`). The missing piece is a **presentation mapping** from
`subType` → Schedule III head, plus a comparative prior-period column. This is a reporting layer,
not a schema change.

### F7 — Cash flow statement: nothing exists

No implementation anywhere in `apps/api/src`, `apps/web/src`, `packages/db/src`. With posted
journal lines and account `subType`s we have the inputs for an indirect-method (AS-3 / Ind AS 7)
statement. Third of the three primary statements, and we are building the other two right now.

### F8 — `routers/reports.ts` has no finance reports at all

Its procedures are `executiveOverview`, `slaDashboard`, `workloadAnalysis`, `trendAnalysis`,
`slaOperationalHealth`, `itsmExecutiveScorecard`, `itsmServiceDeskPack`, `slaWhatIf` — entirely
ITSM. There is no finance report catalogue, no favourites, no sharing, **no scheduled delivery**.
Emailing a monthly P&L or AR aging is a low-effort retention feature and it has no home today.

### F9 — Positive finding: the depreciation unit already closes its own loop

Worth recording because it is the pattern the rest of finance should follow.
`postDepreciationJournalEntry` returns `null` rather than throwing when the COA codes are missing —
which would ordinarily be a textbook open loop (charge recorded, ledger untouched, nothing says
so). It is **not** one: `routers/depreciation.ts:572-578` explicitly counts and surfaces
`unposted`, with a comment naming the exact failure mode. It also draws its JE number from the
shared atomic `org_counters` allocator after a real duplicate-key incident, and guards the
debit=credit invariant before writing (`lib/depreciation-journal.ts:65-70`).

---

## 5. Where we are ahead — and what the wedge actually is

- **Zoho Books has no fixed-asset or depreciation module.** No such route exists in its map. Indian
  SMBs maintain depreciation schedules in spreadsheets and post manual journals. Our in-flight
  engine (WDV + SLM, `packages/db/src/schema/assets.ts:150`, schedule/register/preview/run/runAll,
  auto-run sweep, GL posting) is a genuine differentiator **and** it feeds the balance sheet we are
  building. It also, uniquely, links to the IT asset register.
- **Period close / transaction locking** — parity (`financial.ts:1707`).
- **Tamper-evident audit log** — ours is a hash chain with WORM anchors; Zoho ships an activity log.
  We are ahead on mechanism and behind on *surfacing* (F-24 above). Given MCA's audit-trail rule,
  the ability to *demonstrate* the trail is a sales artefact.
- **Bank reconciliation with match suggestions** — parity.
- **Span.** Zoho Books has no payroll (separate product), no HR, no ITSM, no CRM, no asset
  management in the same tenant. Our positioning is **not** "cheaper Zoho Books" — it is *one
  ledger underneath the whole operation*: payroll postings, depreciation from the IT asset
  register, procurement accruals and CRM-sourced invoices landing in the same COA without an
  integration layer. That is the claim Zoho structurally cannot make.

---

## 6. What is actually in scope

Per the §0 decision, scope is **correctness in what already ships**, plus finishing the asset and
depreciation unit. Nothing below adds a module.

### 6.0 Done — 2026-08-17 (step 1: promote the stranded screens)

`generateGSTR1`, `generateGSTR3B` and `trialBalance` had **exactly one caller in the whole web app**
— tabs on the orphaned `/app/accounting` page, which no sidebar entry points at. GST return
generation was reachable only by typing the URL. Extracted to real routes with nav entries:

- **`/app/finance/accounting/gstr`** — GSTR Generation. Fixes carried over from the tab:
  the **ITC tile now reads `summary.totalInputTax`** instead of a hardcoded `₹0` (it sat beside a
  `netPayable` that *was* net of ITC, so the two figures contradicted each other on screen — the
  downloaded payload always carried the real credit in table `4`, so this was a wrong number shown,
  not a wrong return filed); the **year list is derived** from the current year instead of a literal
  `[2024, 2025, 2026]` that would have stopped offering the current year in ~4 months; the period
  **defaults to the previous month** (with December rolling the year back), since a return is filed
  for a period that has ended. The page-header "Export All" button was a `toast.info` facade and was
  **not** carried across.
- **`/app/finance/accounting/trial-balance`** — Trial Balance, no as-of-date control (see F2).
- Both use the shared `formatInr` from `lib/utils.ts` rather than re-declaring a local `fmtInr`.
- `sidebar-config.ts` gains **Trial Balance** and **GSTR Generation** entries under Supply Chain &
  Finance. RBAC map and `/app/finance` route-permission prefix already covered both procedures.

Verified: `tsc --noEmit -p tsconfig.lint.json` clean · web unit suite 116/116 · route-integrity and
route-permissions guards green. **Not** verified in a browser.

### 6.1 In scope — defects in existing code

| # | Item | Why it qualifies |
|---|---|---|
| 1 | **F1 + F3** — retire or repoint the legacy `/app/accounting` P&L tab | A screen we already ship reports an inception-to-date figure labelled "Net Profit", and overstates income whenever a credit note exists. Wrong numbers, not a missing feature. |
| 2 | **F2** — honour or drop `incomeStatement`'s ignored date input | A declared input that is silently discarded returns a wrong answer with no error. |
| 3 | **F4** — parity test pinning `coaSeed` against `INDIA_COA_SEED` | Guards the depreciation posting path we are retaining. A test, not a build. |

### 6.2 In scope — finish the retained unit

4. Carry the in-flight depreciation work (sweep, journal posting, register screen, e2e) to
   completion and merge. It is the retained differentiator and it already feeds the balance sheet.

### 6.3 Considered and deliberately deferred

**F5 (shared fiscal-year helper)** is *not* scheduled, but note the trade: `currentFY()` already
exists at `accounting.ts:40` and the depreciation path uses it, while the statement procedures take
raw date ranges. If FY handling is ever unified later, the statement screens will have hardened
around calendar dates by then and the change gets more expensive. Recorded as a known,
accepted cost — not a request to reopen scope.

### 6.4 Parked — reference only

Schedule III (F6), cash flow statement (F7), the finance report catalogue and scheduled delivery
(F8), Day Book / Journal Report / Detailed GL, GSTR-9, IFF, PMT-06, TDS/TCS reports, recurring
invoices and bills, vendor credits, currency adjustments, and the Exception Report.

These stay documented in §3–§4 so the gap is legible if the market or a customer forces the
question. **Do not read this section as a to-do list.**

---

## 7. Not verified / open

- **Zoho's Chart of Accounts internal taxonomy and GST Filing dashboard states** were not read —
  the SPA did not respond to synthetic clicks and direct URL navigation was blocked by the session
  permission classifier. The route map is from the DOM and is reliable; the screens behind
  `accountant/chartofaccounts` and `gstfiling-dashboard` are unread.
- **Whether our dashboard surfaces a bank-reconciliation backlog count** (Zoho nags with an
  uncategorised-transaction count and a "Categorize now" action). `bankRec` exists; only
  `finance/accounting/reconciliation/page.tsx` references it. Not traced to the dashboard.
- **Zoho's pricing tiers** were not examined; some reports above may sit behind higher plans.
- Zoho Books' own **Fixed Assets** availability was inferred from the absence of a route in the
  authenticated navigation map, not from vendor documentation.
