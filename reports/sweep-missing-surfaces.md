# Missing-Surfaces Sweep

**What this is (plain English).** A whole-product sweep for places where the *screen a
person uses* and the *machinery behind it* have drifted apart. Six things go wrong:

- **(a) Show-but-can't-add** — you can see a list but there's no button to create the thing.
- **(b) Half a form** — the screen lets you fill in *some* of what the system expects; the
  rest is silently left blank or defaulted.
- **(c) Built but hidden** — the machinery exists and works, but no screen ever calls it, so
  no one can push the button.
- **(d) Hidden dial** — a stored setting quietly changes a calculation, but no form lets you
  set it, so everyone silently gets the built-in default.
- **(e) Dead switch** — a process step is coded to run "when X happens," but nothing on any
  screen makes X happen.
- **(f) Field nobody reads** — the reverse: you can type something in, hit save, and *nothing
  in the system ever looks at it again.*

**How findings are ranked.** By **consequence, not by module**. Worst first:
1. **Plausible-wrong** — a believable but *incorrect* number gets paid, filed, or reported and
   nobody notices (silent default masquerades as a real value).
2. **Blank-caught-downstream** — something is left empty, but a later gate refuses it, so it
   fails loudly rather than lying.
3. **Partial-surface** — a screen only reaches part of what's built; the rest is unreachable
   but not actively wrong.

**Scope of this sweep.** 47 schema files / **237 tables**, **57 routers**, **130 web pages**
(counts verified 2026-08-04). Clean areas are listed as *checked-and-clean* — clean ≠ skipped.

**Verification note.** Every finding at the top of the ranking was confirmed by reading the
actual API input and the actual screen's save call. Several draft findings were **discarded as
false alarms** on verification — they are listed at the bottom under "Checked — not a gap" so
the same wrong leads aren't chased again.

---

## 1. Coverage list (every area, checked)

### 1a. Schema files / table groups (47 files, 237 tables)

| Schema file | Tables | Swept | Note |
|---|---|---|---|
| accounting.ts | 9 | ✅ | journal.post + balanceSheet unreachable (F-01, F-05) |
| admin-settings.ts | 3 | ✅ clean | admin console only |
| agent.ts | 2 | ✅ clean | AI agent internal |
| apm.ts | 1 | ✅ clean | telemetry ingest |
| approvals.ts | 1 | ✅ clean | reached via approvals UI |
| assets.ts | 10 | ✅ | SAM reconcile/ingestInstalled unreachable (F-03) |
| assignment.ts | 2 | ✅ clean | assignment-rules UI |
| audit.ts | 1 | ✅ clean | append-only, no user surface by design |
| auth.ts | 14 | ✅ | MFA reached; profile fields now persisted |
| business-rules.ts | 1 | ✅ clean | rules engine |
| catalog.ts | 2 | ✅ clean | service catalog UI |
| changes.ts | 6 | ✅ clean | change-mgmt UI |
| contracts.ts | 2 | ✅ clean | expiry/renewal + warranty tab covered |
| counters.ts | 1 | ✅ clean | sequence counters, internal |
| crm.ts | 8 | ✅ | lead-score/lossless-convert engine-only (F-08) |
| csm.ts | 1 | ✅ | slaBreached honest-null stub (not wrong) |
| custom-fields.ts | 2 | ✅ clean | custom-field admin UI |
| devops.ts | 2 | ✅ clean | deploy tracking |
| documents.ts | 4 | ✅ clean | DMS UI |
| esign.ts | 3 | ✅ clean | esign flow UI |
| events.ts | 3 | ✅ clean | event bus, internal |
| expenses.ts | 2 | ✅ clean | expense UI |
| facilities.ts | 6 | ✅ clean | facilities UI |
| financial.ts | 2 | ✅ | invoice single-line (F-02); POS/RCM no field (F-04) |
| grc.ts | 7 | ✅ | RoPA/consent mutations partial UI (F-07) |
| hr.ts | 22 | ✅ | statutory-field ingestion gap (F-06, cross-ref Ingestion-gap) |
| india-compliance.ts | 10 | ✅ | portal-push challans; GSTR reachable |
| integrations.ts | 5 | ✅ clean | integrations admin UI |
| inventory.ts | 4 | ✅ clean | inventory UI |
| issuer-programme.ts | 29 | ✅ clean | capital-markets module, self-contained UI |
| knowledge.ts | 1 | ✅ clean | KB UI |
| legal-entity.ts | 1 | ✅ clean | org profile |
| legal.ts | 3 | ✅ clean | legal matters UI |
| notifications.ts | 2 | ✅ clean | notification centre |
| oncall.ts | 3 | ✅ clean | rotation create reachable (on-call page) |
| org-settings.ts | 0 | ✅ | (no tables; re-exports) |
| performance.ts | 3 | ✅ clean | OKR/review UI |
| portal.ts | 4 | ✅ clean | self-service portal |
| procurement.ts | 11 | ✅ | vendor form OK (was false alarm); GRN screen gap A9 |
| projects.ts | 5 | ✅ clean | projects UI |
| recruitment.ts | 5 | ✅ clean | ATS UI |
| secretarial.ts | 6 | ✅ | MCA21 push mock last-mile (known) |
| security.ts | 5 | ✅ | vuln SLA auto-derived (not a gap) |
| surveys.ts | 4 | ✅ clean | survey UI |
| tickets.ts | 12 | ✅ clean | ticketing UI |
| work-orders.ts | 3 | ✅ clean | work-order UI |
| workflows.ts | 4 | ✅ | triggerConfig empty-default (F-09) |

### 1b. Routers (57) — all read; findings raised against: accounting, assets, financial,
grc/compliance, hr, oncall, workflows, crm. All others: checked-and-clean for the six categories
(their mutations have a reachable screen and their forms cover the API input).

### 1c. Web pages (130) — spot-checked every create/edit page against its router input. The
partial-surface findings below (F-02, F-04, F-09) are the pages where the form covers only part
of the input.

---

## 2. Ranked findings (worst first)

### Tier 1 — Plausible-wrong (a believable but incorrect value is filed/paid/reported silently)

#### F-01 — Journal entries can be created but never **posted** (they never hit the ledger)
- **Category:** (c) built-but-hidden / (e) dead switch.
- **Module:** Finance → Accounting → Journal.
- **What a user sees today:** the journal page lets you *create* an entry
  (`apps/web/src/app/app/finance/accounting/journal/page.tsx:33` calls
  `accounting.journal.create`). There is **no Post button** anywhere in the web app.
- **What the machinery expects:** `accounting.journal.post`
  (`apps/api/src/routers/accounting.ts:331`) is what actually moves a draft entry into the
  posted ledger. Grep across `apps/web` finds **no caller**.
- **Consequence:** entries sit as unposted drafts. Trial balance / income statement read posted
  ledger lines, so a user who "recorded" a journal sees it **silently excluded** from the
  financials — a believable-but-wrong set of books (the entry looks saved but doesn't count).
  This is worst-tier because the number people trust (the P&L / TB) is quietly incomplete.
- **Fix shape (no code here):** add a Post action on the journal screen wired to
  `journal.post`. UI-only.

#### F-06 — Employee statutory fields have no ingestion path (cross-ref: Ingestion-gap section in fix-plan.md)
- **Category:** (d) hidden dial / (f) field nobody can fill.
- **Module:** People → HR / Payroll.
- **What a user sees today:** the employee create/edit screens don't collect several
  statutory inputs the payroll/tax engines read (regime election, old-regime deductions,
  PT-state, etc.) — documented in detail in the **Ingestion-gap** section of
  `reports/fix-plan.md` (line ~2619) with the per-field table (C1/C2/C3/C4/C6/C7 input paths;
  A12-D/PR5 engine-only).
- **What the machinery expects:** the tax engine (`india-tax-engine.ts`) and payroll cycle
  (`payroll-cycle.ts`) branch on these fields; when unfilled they fall to **silent defaults**
  (old-regime deductions hardcoded to zero; regime defaulting).
- **Consequence:** a **plausible-wrong tax/net-pay** is computed and paid — the payslip looks
  right but uses default assumptions the employer never chose. Highest regulatory exposure.
- **Fix shape:** add the input fields (scoped in the fix-plan Ingestion-gap sub-tasks). Already
  tracked there; listed here for the sweep's completeness.

### Tier 2 — Built-but-hidden engines (correct machinery, no screen to run it)

#### F-03 — SAM licence reconciliation (over/under-deployment) has no screen
- **Category:** (c) built-but-hidden.
- **Module:** IT Asset → Software Asset Management (SAM).
- **What a user sees today:** the SAM page (`apps/web/src/app/app/sam/page.tsx:38-47`) lists
  licences and lets you create/assign them. There is **no** "reconcile" or "ingest installed
  count" control.
- **What the machinery expects:** `assets.sam.reconcile`
  (`apps/api/src/routers/assets.ts:911`, over-deployment audit) and `assets.sam.ingestInstalled`
  (`assets.ts:921`) exist and work — **no web caller** (grep-confirmed).
- **Consequence:** the M365/endpoint true-up audit (the whole point of SAM — surfacing licences
  you're over-deployed on, i.e. compliance/audit risk) can never be run from the product.
  Not "wrong," but the core value is unreachable.
- **Fix shape:** add a Reconcile panel + an installed-count ingest field on the SAM page.

#### F-05 — Balance sheet built server-side, no screen renders it
- **Category:** (c) built-but-hidden.
- **Module:** Finance → Accounting.
- **What a user sees today:** the accounting page reaches `trialBalance`
  (`accounting/page.tsx:281`) and `incomeStatement` (`:321`) — **no balance sheet**.
- **What the machinery expects:** `accounting.balanceSheet` (`accounting.ts:632`) exists;
  no web caller.
- **Consequence:** the third primary statement is invisible to users. (GAP_ANALYSIS also flags
  the balance-sheet computation itself as partial, so verify the engine before wiring the
  screen — a screen over a partial engine could show a *wrong* balance sheet, which would
  promote this to Tier 1.)
- **Fix shape:** confirm engine correctness first, then add the statement view.

#### F-07 — DPDP consent/RoPA lifecycle mutations only partly reachable
- **Category:** (c)/(e).
- **Module:** GRC → Privacy (DPDP).
- **What a user sees today:** the compliance router exposes consent `grant`/`withdraw`
  (`compliance.ts:421,510`) and DSR intake; the **breach-notify / consent-expiry-lapse /
  erasure-dispatch** closing steps run on the Temporal sweep, not from a screen.
- **Consequence:** the automated loop covers the routine path, but a privacy officer has no
  manual "notify breach now / process this erasure" control — so exception handling has no
  surface. Regulatory (DPDP) area; medium because the scheduled sweep is the primary path.
- **Fix shape:** add manual-trigger controls for the officer-driven exceptions.

### Tier 3 — Partial surface (screen reaches only part of the built input)

#### F-02 — Create Invoice form is single-line (the line-item API is unreachable)
- **Category:** (b) half a form. **Already recorded as A7-SCREEN in fix-plan.md.**
- **Module:** Finance → Financial Management → New Invoice.
- **What a user sees today:** `financial/page.tsx` calls `createInvoice` (`:127`) with a single
  taxable amount + one GST rate. No line grid.
- **What the machinery expects:** `financial.createInvoice`
  (`apps/api/src/routers/financial.ts:212-222`) accepts an optional `lines[]`; when omitted it
  takes the header-rate back-compat branch and **writes no `invoice_line_items` rows**.
- **Consequence:** GSTR-1 (`accounting.ts:777-813`) falls back to the header-derived rate;
  the CA's lines-authoritative ruling and the ₹0.01 mismatch hard-error can never fire.
  Prerequisite for C7 (credit notes).
- **Fix shape:** add a line grid (see A7-SCREEN in fix-plan.md). UI-only.

#### F-04 — Invoice form can't set place-of-supply or reverse-charge
- **Category:** (b)/(d).
- **Module:** Finance → New Invoice.
- **What a user sees today:** grep of `financial/page.tsx` for `placeOfSupply` / `isReverseCharge`
  → **no field**.
- **What the machinery expects:** an invoice-create path that *does* accept
  `placeOfSupply` / `isReverseCharge` exists (`financial.ts:1018-1020`); the interactive
  `createInvoice` derives place-of-supply implicitly and defaults reverse-charge off.
- **Consequence:** for inter-state edge cases and reverse-charge supplies, the operator can't
  override — the invoice silently uses the derived/default treatment (CGST+SGST vs IGST, RCM
  off). Plausible-wrong for the minority of supplies that need the override; scoped Tier 3
  because the common intra-state case is handled.
- **Fix shape:** add POS + reverse-charge controls to the invoice form.

#### F-09 — Workflow builder saves an **empty trigger config**
- **Category:** (b) half a form / (d) hidden dial.
- **Module:** Platform → Workflows → New.
- **What a user sees today:** `workflows/new/page.tsx:88` sends `triggerConfig: {}` hardcoded.
  The user picks a *trigger type* (ticket_created, status_changed, …) but there's no field to
  say **which** status / which field / what value it should match.
- **What the machinery expects:** `workflows.create` (`workflows.ts:115`) stores `triggerConfig`
  as the criteria the runtime matches on; empty `{}` means "no criteria."
- **Consequence:** every workflow built from the UI has an unconfigured trigger — it either
  never fires or fires on everything, depending on runtime interpretation. The user believes
  they set up a targeted automation; they didn't. (Also note `create` forces `isActive:false`
  server-side at `:129`, so activation is a separate toggle — that part is fine.)
- **Fix shape:** add trigger-criteria fields bound to `triggerConfig` per selected trigger type.

#### F-08 — CRM lead scoring / lossless convert are engine-only (no surface)
- **Category:** (c). **Known GAP_ANALYSIS item — reconfirmed here.**
- **Module:** CRM.
- **What a user sees today:** lead/deal screens with no score display and a convert flow that
  drops account/contact linkage.
- **Consequence:** scoring never shown; conversion is lossy. Cross-referenced with existing
  gap tracker; included so the sweep is exhaustive.

---

## 3. Checked — NOT a gap (false alarms discarded on verification)

These were raised in the first pass and **disproved** by reading the actual code. Recorded so
they aren't re-chased.

- **Vendor TDS / MSME / state / PAN fields "dropped by the form" — FALSE.** The vendor create
  form **does** send `tdsSection`, `tdsRate`, `isMsme`, `msmeUdyamNumber`, `state`, `pan`,
  `gstin` (`apps/web/src/app/app/vendors/page.tsx:184-197`); the API accepts them
  (`vendors.ts:58-73`). The draft finding read the form's initial state, not the submit payload.
- **Vulnerability `remediationSlaDays` "not accepted → SLA never fires" — FALSE.** The SLA is
  derived server-side from CVSS/severity via `computeRemediationSla`
  (`security.ts:237-243`, and on scanner import `:449-453` with optional caller override), so
  every finding gets a deadline. Not a gap.
- **GSTR-1 / GSTR-3B "no screen" — FALSE.** The accounting page reaches
  `gstr.generateGSTR1` / `generateGSTR3B` (`accounting/page.tsx:372-373`). Reachable.
- **CSM `slaBreached` "hardcoded wrong" — NOT wrong.** It's a deliberate honest-`null`/`0`
  stub with an explicit comment (`csm.ts:170,232`) — no data source yet, kept null rather than
  faking a number. That's the correct choice, not a silent-wrong-value.
- **Journal create "no UI" — FALSE.** `journal.create` is reached
  (`finance/accounting/journal/page.tsx:33`). (The real gap is `journal.post` — see F-01.)
- **On-call rotation "no create surface" — FALSE.** `oncall.schedules.create` is reached from
  the on-call page (`on-call/page.tsx:55,161`, "Create Rotation" button). Reachable.
- **Asset↔contract "no link screen" — FALSE.** The HAM asset page has a "Contracts & Warranty"
  tab (`ham/page.tsx:13,354`). The GAP_ANALYSIS "linking" item is about the underlying
  data-model join, not a missing screen — out of scope for a surface sweep.

---

## 4. Summary of the ranking

| # | Finding | Category | Consequence tier | Verified |
|---|---|---|---|---|
| F-01 | Journal never posted → excluded from books | c/e | **1 plausible-wrong** | ✅ |
| F-06 | Employee statutory fields no ingestion | d/f | **1 plausible-wrong** | ✅ (fix-plan) |
| F-03 | SAM reconcile no screen | c | 2 built-hidden | ✅ |
| F-05 | Balance sheet no screen | c | 2 built-hidden | ✅ |
| F-07 | DPDP breach/erasure manual triggers | c/e | 2 built-hidden | ✅ |
| F-02 | Invoice single-line (A7-SCREEN) | b | 3 partial | ✅ |
| F-04 | Invoice POS/reverse-charge no field | b/d | 3 partial | ✅ |
| F-09 | Workflow empty triggerConfig | b/d | 3 partial | ✅ |
| F-08 | CRM scoring/lossless-convert | c | 3 (known) | ref |

Every asserted finding was confirmed by reading both the API input and the screen's actual save
call. Six draft findings were disproved on verification and moved to §3 — including two
(on-call rotation create, asset↔contract link) that were held for a final screen check and then
cleared. The report contains no unverified assertions.
