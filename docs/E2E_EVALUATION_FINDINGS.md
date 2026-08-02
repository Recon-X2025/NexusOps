# CoheronConnect (NexusOps) — Deep End-to-End Evaluation — Findings Log

**Evaluator:** Automated deep-drill (per-module, pushed to the last node)
**Date started:** 2026-07-21
**Method:** Per-module vertical trace (router → lib → schema → DB → reflex) + module test run + negative/edge probing + live browser positive/negative with screenshots.
**Baseline commit:** `2657431` (post G1–G17, migration head `0055_lean_centennial`)
**Test DB:** `coheronconnect_test` @ localhost:5433 (real Postgres, single-fork)

> This is a working log. Severity key: **BLOCKER** (data loss / statutory / money wrong) ·
> **HIGH** (feature broken end-to-end) · **MEDIUM** (edge/negative path broken) ·
> **LOW** (cosmetic / stale doc) · **INFO** (design note, not a defect).

> **2026-07-30 update (post-baseline, at head `0059_volatile_midnight`):** since this log's
> baseline (`2657431` / `0055`), a deterministic MFA-enrolment failure was found and fixed in
> `f365314` + `2baaa25`. The `appendAuditEntry` hash-chain head-read (`ORDER BY seq DESC`) returned
> NULL-seq rows (Postgres sorts NULLs first), so `prevSeq=0 → seq=1` collided permanently with the
> real chain head; the 23505 bubbled through `retryMutation`, re-ran the non-idempotent
> `confirmEnroll`, and its 2nd attempt returned 400 "No pending MFA enrollment". Fix: filter the
> head-read with `isNotNull(seq)` (+ per-org advisory lock + regression test). `e2e/mfa.spec.ts` is
> now green and the full API suite (130 files / 1290 tests) passes. **Note:** this fixed the
> *collision*; it does **not** close **F-S1** below — MFA audit rows are still written *unchained*
> (`seq IS NULL`) via plain `db.insert`, so they remain outside the tamper-evident chain. If
> anything the fix formalises that NULL-seq rows are excluded from the chain head. F-S1 and F-S2
> remain **OPEN**.

---

## Cross-cutting findings (from source trace, pre-module)

### F-001 — OAuth callback is dead code (Google Workspace + Microsoft-365 connectors)
- **Severity:** HIGH
- **Evidence:** `apps/api/src/services/integrations/google-workspace.ts:134,149` and
  `microsoft-365.ts:136,152` define `beginOAuth`/`completeOAuth`. A repo-wide search for
  `.beginOAuth(` / `.completeOAuth(` across `apps/` returns **no callers** — no HTTP route,
  no tRPC procedure invokes them.
- **Impact:** A user cannot complete an OAuth connection for Google Workspace or MS-365.
  The connect button (if present) has no server endpoint to land the callback. Confirmed
  as a genuine gap by `docs/US_ROADMAP.md`.
- **Route:** integrations → connect Google Workspace / Microsoft 365.

### F-002 — DPDP notification delivery is a log-only stub
- **Severity:** HIGH (regulatory)
- **Evidence:** `apps/api/src/lib/notification-dispatcher.ts:47-64,72` — the only wired
  dispatcher is `LogOnlyDispatcher`, which inserts a `dpdpNotificationArtifacts` row with
  `status:"logged"` and returns; it never delivers via email/SMS.
- **Impact:** DPDP breach notices, DSR-due alerts, and consent-expiry notifications are
  recorded but no data principal or regulator is actually notified. Statutory notification
  windows are tracked but not fulfilled by delivery. Matches `docs/INDIA_ROADMAP.md §2`.
- **Route:** compliance → DSR / breach / consent sweeps.

### F-003 — MFA step-up re-verifies password, not TOTP
- **Severity:** MEDIUM
- **Evidence:** `apps/api/src/routers/auth.ts:522-540` — `verifyStepUp` input is `{ password }`
  and calls `verifyPassword`. Even for a TOTP-enrolled user, sensitive/finance step-up asks
  for the password again, not a fresh TOTP code.
- **Impact:** Step-up assurance for sensitive mutations is weaker than the enrolled factor.
  Matches `docs/INDIA_ROADMAP.md §4`.
- **Route:** any sensitive/finance mutation requiring step-up.

### F-004 — [RESOLVED / STALE DOC] Profile phone/location/jobTitle/bio no longer dropped
- **Severity:** LOW (documentation)
- **Evidence:** BUILD.md lists a known defect that `auth.updateProfile` accepts
  `phone/location/jobTitle/bio` but `users` has no such columns, silently dropping them.
  **This is fixed:** `packages/db/src/schema/auth.ts:96-100` now has `phone`, `department`,
  `jobTitle`, `location`, `bio` columns; added by migration `0035_light_hobgoblin.sql`.
  `auth.updateProfile` (`auth.ts:574-578`) persists them.
- **Impact:** None — the defect is resolved. BUILD.md's "known defect" note is stale and
  should be removed.

### F-005 — [INFO] Login email lookup is org-agnostic with `.limit(1)`
- **Severity:** INFO (latent)
- **Evidence:** `auth.ts:185-189` (`login`) selects the user by `eq(users.email, email)`
  with `.limit(1)` and no orgId; the `users` unique index is `(orgId, email)`
  (`schema/auth.ts:114`), so the same email can exist in multiple orgs at the DB level.
  `signup` (`auth.ts:110-118`) blocks this by checking global email uniqueness — so today
  the ambiguity cannot arise via signup. But invite/seed paths that insert a user with an
  email already used in another org would create a login that non-deterministically resolves
  to one org.
- **Impact:** No current exploit (signup is the guard), but the login resolver is not
  multi-org safe if a duplicate email is ever created by another path.

---

## Per-module drill (sequenced from the beginning)

### MODULE 1 — India Payroll (`packages/payroll-math` + `apps/api/src/lib/payroll-cycle.ts`)

Source trace complete for `payroll-cycle.ts`, `tax-engine.ts`, `statutory-deductions.ts`.
Overall this is the platform's strongest module — the money invariant, tax slabs,
marginal relief, and statutory ceilings are production-grade. Findings below are edge/
itemization defects, not core-math errors.

#### F-P1 — LOP proration is inconsistent between Basic/HRA and specialAllowance/LTA (LOW after reachability trace)
- **Severity:** LOW (latent — not reachable via the production attendance path)
- **Evidence:** `packages/payroll-math/src/payroll-cycle.ts:198-199`
  `const lopFactor = emp.lopDays > 0 ? (emp.daysWorked / emp.daysInMonth) : 1;`
  Basic/HRA are prorated by `lopFactor` (guarded on `lopDays>0`), but `specialAllowance`
  and `lta` are prorated **unconditionally** by `emp.daysWorked / emp.daysInMonth` in two
  places: the payslip output (`payroll-cycle.ts:335-336`) and `excludedAllowances`
  (`payroll-cycle.ts:253-254`). The two paths only agree when `daysWorked == daysInMonth`
  OR `lopDays > 0`.
- **Reachability (traced to the only production caller):** the sole producer of the
  `attendance` object is `computeAttendanceLopForPeriod` (`apps/api/src/lib/india/
  attendance-lop.ts:70-79`), which **always** sets `daysWorked = daysInMonth - lopDays`.
  So it can never emit `lopDays===0 && daysWorked<daysInMonth` (the divergence case), and
  `daysInMonth` comes from `new Date(year,month,0).getDate()` (always ≥ 28), so the
  `daysInMonth===0` NaN path is also unreachable. The inconsistency is therefore latent —
  it would only surface if a future caller hand-builds an `EmployeePayrollInput` with an
  inconsistent `{lopDays:0, daysWorked<daysInMonth}` tuple.
- **Impact:** None today. Recorded as a robustness gap in the money kernel — the guard on
  `lopFactor` should match the unconditional divisions (or the function should assert the
  `daysWorked + lopDays == daysInMonth` invariant) to stay correct under new callers.
- **Route:** payroll → run cycle (would require a non-attendance caller with a malformed
  day tuple).

#### F-P2 — [INFO / latent] ITNS-281 surcharge proration divides by `monthlyTDS`
- **Severity:** INFO (mitigated — not a live bug)
- **Evidence:** `payroll-cycle.ts:466-480` (`generateITNS281`) prorates surcharge/cess
  as `surcharge / monthlyTDS * ps.tds`. When `monthlyTDS === 0` this is `Infinity`, but
  `ps.tds` is coupled to `monthlyTDS` (both derive from the same `computeTax` output in
  `tax-engine.ts:306-311`), so `Infinity * 0 = NaN` and the `|| 0` fallback catches it.
- **Impact:** None today. Documented so the coupling is not accidentally broken later
  (if `ps.tds` and `monthlyTDS` are ever decoupled, this becomes a `NaN`/`Infinity`
  challan amount).

#### F-P3 — Form 16 Chapter-VI-A itemization hardcodes §80D/§80CCD1B/§80TTA to 0
- **Severity:** MEDIUM (statutory certificate correctness)
- **Evidence:** `payroll-cycle.ts:622-628` (`generateForm16Data`):
  `section80D: 0, section80CCD1B: 0, section80TTA: 0` while `total:
  taxComp.chapter6ADeductions` is correct.
- **Impact:** The Form 16 Part-B breakup understates 80D/80CCD1B/80TTA line items and
  overstates 80C (the whole Chapter-VI-A total is attributed to 80C via
  `Math.min(chapter6ADeductions, 150000)`), even though the aggregate deduction and the
  final tax are correct. An employee reconciling Form 16 against their declarations, or
  an auditor, sees wrong per-section figures. The tax math is unaffected (it uses the
  correct total), so this is a certificate-presentation defect, not a money defect.
- **Route:** payroll → generate Form 16 for an employee who declared 80D/80CCD1B/80TTA.

#### F-P4 — [INFO / latent] Professional-tax slab tables have 1-rupee boundary gaps
- **Severity:** INFO (not reachable via the payslip path)
- **Evidence:** `statutory-deductions.ts:161-219` — every state slab uses integer
  boundaries with a 1-rupee gap (e.g. Maharashtra `{to:7500}` then `{from:7501}`), and
  `computePT` matches with `gross >= from && gross <= to` (`:237`). A fractional gross in
  `(7500, 7501)` matches no slab → PT silently returns 0.
- **Impact:** None via `computeEmployeePayslip`, because `grossEarnings` is always an
  integer (sum of `Math.round(...)` terms + integer inputs, `payroll-cycle.ts:206-214`).
  Only a concern if `computePT` is ever called directly with a non-integer gross.
- **Note (design):** Delhi has empty slabs / `annualCap:0` and correctly returns PT 0.

#### F-P5 — Run-header totals frozen at `lockPeriod` can diverge from payslip rows
- **Severity:** MEDIUM
- **Evidence:** `apps/api/src/routers/payroll.ts` — `lockPeriod` stores `totalGross/
  totalDeductions/totalNet/totalPt/totalTds` from `computePayrollRunTotals` (`:303,320-326`)
  at the DRAFT→PERIOD_LOCKED transition. Payslip rows are computed **separately, later**
  by `computePayslips` at TDS_COMPUTED→PAYSLIPS_GENERATED (`:402-435`). Both call the same
  `buildEmployeePayrollInput`+`computeEmployeePayslip`+`resolveStatutoryCeilings`+
  `computeAttendanceLopForPeriod` (`payroll-run-aggregates.ts:118-125` vs `payroll.ts:394-406`),
  so they agree **only if the inputs are unchanged between the two calls**.
- **Impact:** The run header total is frozen at lock time and is **never recomputed**
  after `computePayslips`. If attendance is edited, an employee's salary structure is
  changed, a new active employee is added, or effective-dated ceilings change between
  `lockPeriod` and `computePayslips`, the run-header totals (shown in `runs.list`/`runs.get`)
  and `SUM(payslips.*)` silently disagree — a reconciliation gap on a money surface. No
  re-lock or drift check guards this.
- **Route:** payroll → lock period → (edit attendance/structure) → compute payslips → run
  summary vs payslip export disagree.

#### F-P6 — `exportBankFile` has no pipeline-state guard (can disburse a rejected run)
- **Severity:** MEDIUM (money movement)
- **Evidence:** `apps/api/src/routers/payroll.ts:764-839` (`exportBankFile`). It loads the
  run (`:786`) and payslips (`:793-797`) and only rejects when `slipRows.length === 0`
  (`:798`). There is **no check on `run.pipelineStatus`** — unlike `generateStatutory`
  (requires `CFO_APPROVED`, `:528`) and `complete` (requires `STATUTORY_GENERATED`, `:549`).
- **Impact:** A NEFT/NACH-Credit bank disbursement file (real money instruction) can be
  generated for a run that is only `PAYSLIPS_GENERATED` (before HR/Finance/CFO approval)
  or that was CFO-**rejected** into `FAILED`. The approval chain is bypassable for the
  actual disbursement artifact. `exportBankFile` requires only `hr:write`.
- **Route:** payroll → generate payslips → (skip approvals / after rejection) → export bank
  file.
- **Reachability (live-confirmed):** `exportBankFile` has **no frontend trigger** — a
  repo-wide search finds it only in `apps/web/src/lib/trpc-procedure-rbac.generated.ts`
  (the generated RBAC map), never called from any page/component. So today the missing
  guard is only reachable via a direct tRPC/API call or a future UI button; it is not
  yet exploitable from the shipped UI. The unguarded procedure nonetheless remains a
  latent money-movement gap (and the export feature is itself orphaned — see note). Live
  state used to confirm: run #1 sat at `PAYSLIPS_GENERATED` with valid payslips and no
  approvals, exactly the state the guard should block.

#### F-P7 — [INFO] Tax declarations hardcoded to 0 in the run input builder
- **Severity:** INFO (known limitation, consistent with `taxPreview`)
- **Evidence:** `apps/api/src/services/payroll-run-aggregates.ts:64-70` sets
  `section80C/80D/80CCD1B/80TTA/section24b/hraExemption/otherExemptions = 0` for every
  employee in the actual run computation; the same zeros appear in `payroll.ts`
  `taxComputationFromPayslip` (`:125-131`) and `buildTaxProfileFromEmployee` (`:201-207`).
- **Impact:** TDS in the payslip run does not reflect employee investment declarations
  (there is no per-employee declaration capture feeding the run), so OLD-regime employees
  are over-deducted vs their true liability. This is a **feature gap** (no declaration
  intake), not a math bug — the engine handles the fields correctly when populated.
- **Route:** payroll → run cycle for an OLD-regime employee with 80C/80D investments.

#### F-P8 — Partial PT/LWF override silently zeroes non-overridden states
- **Severity:** MEDIUM
- **Evidence:** `apps/api/src/lib/india/statutory-ceilings.ts:95-111` builds
  `overrides.ptSlabs` / `overrides.lwfRates` containing **only** the states that had an
  override row. That partial table is then passed as the **entire** `slabTable` to
  `computePT` / `computeLWF` (`statutory-deductions.ts:226,272`), which look up
  `slabTable[stateKey]` and return `{ ptAmount: 0 }` / `{ ..LWF: 0 }` when the state is
  absent (`statutory-deductions.ts:231-233,277-279`). The built-in `PT_SLABS` / `LWF_RATES`
  defaults are **bypassed entirely** once any override for any state exists.
- **Impact:** If an org (or the platform) publishes a PT override for even one state
  (e.g. updates Maharashtra's slab), every employee in a **non-overridden** state
  (Karnataka, Tamil Nadu, …) silently gets **PT = 0** and **LWF = 0** for that period —
  under-deducting statutory professional tax / labour-welfare-fund. The override is meant
  to be additive per-state but is applied as a full-table replacement.
- **Route:** admin sets a `pt_slab` statutory-ceiling override for one state → payroll run
  → employees in other states lose their PT/LWF deduction.

#### F-P9 — "TDS declarations" tab does not capture declarations (mislabeled Form-16 issuance)
- **Severity:** MEDIUM (feature gap + misleading UI)
- **Evidence (live):** payroll → **TDS declarations** tab. The panel is titled
  "TDS declarations" but its body reads *"Issue Form 16 (TDS certificate) to an employee
  for e-signature"* — i.e. the tab is a **Form-16 issuance** surface, not a declaration
  intake. There is no field anywhere for an employee to enter 80C/80D/80CCD1B/HRA-rent
  investment declarations.
- **Impact:** Confirms F-P7 at the UI layer — the product exposes no way to capture the
  investment declarations that OLD-regime TDS depends on, and the one tab that names them
  actually does something else. Users looking to enter declarations find a Form-16 dialog.
- **Route:** `/app/payroll` → "TDS declarations" tab.
- **Screenshot:** `m1-payroll-02-tds-declarations-mislabeled.png`

#### F-P10 — Payroll header says "12-step" but the cycle panel renders 14 steps
- **Severity:** LOW (cosmetic / inconsistency)
- **Evidence (live):** `/app/payroll` header subtitle reads *"12-step payroll cycle with
  statutory compliance"*, while the run-detail "Payroll cycle progress" panel enumerates
  **14** steps (Step 1 Draft … Step 14 Completed). Off-by-two label.
- **Impact:** Cosmetic only; no functional effect. Suggests the copy pre-dates the LWF/PT
  step additions.
- **Route:** `/app/payroll` header vs run-detail cycle panel.
- **Screenshot:** `m1-payroll-03-run-draft-cycle.png`

#### F-P11 — Salary structures can NEVER be assigned to an employee → every payroll run computes ₹0
- **Severity:** BLOCKER
- **Evidence (source):** The entire payroll run pipeline keys off
  `employees.salaryStructureId`:
  - `apps/api/src/routers/payroll.ts:390` inner-joins `employees → salaryStructures ON
    employees.salaryStructureId = salaryStructures.id` (this is the row set `computePayslips`
    and `computePayrollRunTotals` iterate).
  - `apps/api/src/services/payroll-run-aggregates.ts:105` — same inner-join for run totals.
  - `payroll.ts:653` / salary-structure `delete` even guards on
    `employees.salaryStructureId` being in use.
  But **no router mutation ever writes `employees.salaryStructureId`.** A repo-wide search
  shows the only writers of that column are **test fixtures** (`__tests__/*.ts`). Both
  `hr.employees.create` (input `hr.ts:242-254`) and `hr.employees.update` (input
  `hr.ts:335-343`) omit `salaryStructureId` entirely — Drizzle drops it. There is no
  `assignStructure`/`setSalaryStructure` procedure anywhere.
- **Evidence (live):** `/app/hr?tab=people` → **Add employee** modal exposes only
  User / Name / Email / Department / Title / Location / Employment type / Manager / Start
  date — **no salary-structure picker.** `employees.update` has none either. So a real user
  cannot link any employee to a salary structure.
- **Impact:** In production, `employees.salaryStructureId` is always NULL, so the payroll
  run's inner-join returns **zero rows** for every org. Every payroll run therefore computes
  **₹0 gross / ₹0 net / 0 employees** regardless of how many active employees or salary
  structures exist. The India payroll module — the platform's flagship, "production-grade
  ~80%" feature per CLAUDE.md — **cannot process a single real payslip end-to-end through
  the UI.** Confirmed live: run #1 shows "July 2026 · 0 employees, ₹0" with a salary
  structure present and the org's admin user available. The green test suite masks this
  because tests seed `salaryStructureId` directly via `db.insert(employees)`.
- **Route:** `/app/payroll` "New payroll run" (positive path) blocked by
  `/app/hr?tab=people` → "Add employee" having no salary-structure assignment.
- **Screenshots:** `m1-payroll-03-run-draft-cycle.png` (run, 0 employees, ₹0),
  `m1-payroll-04-add-employee-no-salary-structure.png` (create form, no structure field).

#### F-P12 — Run summary "PF" stat conflates employee + employer PF
- **Severity:** LOW (misleading figure)
- **Evidence:** `apps/api/src/routers/payroll.ts:85` builds the run-list summary as
  `totalPF: tpe + tpr` (employee PF **plus** employer PF). The UI stat card labeled
  simply "PF" (`apps/web/src/app/app/payroll/page.tsx:356` reads `run.totalPF`) therefore
  shows the **combined** figure.
- **Evidence (live + DB):** For the single test employee the UI "PF" card shows **₹3,751**,
  while the DB stores `total_pf_employee = 1800` and `total_pf_employer = 1951`
  (1800 + 1951 = 3751). The payslip row confirms `pf_employee 1800 / pf_employer 1951`.
- **Impact:** A payroll admin reading the run summary sees a "PF" number that is neither the
  employee deduction (what's withheld) nor a clearly-labeled total; it silently blends the
  two statutory sides. Cosmetic/labeling, not a math error — the payslip and challan values
  are correct.
- **Route:** `/app/payroll` → run summary "PF" card.
- **Screenshot:** `m1-payroll-05-period-locked-real-totals.png`

#### F-P13 — Run summary ESI is hardcoded to ₹0 (ESI never persisted/aggregated)
- **Severity:** MEDIUM
- **Evidence:** `apps/api/src/routers/payroll.ts:86` sets `totalESI: 0` **literally** in the
  run summary. The `payslips` table has **no ESI column** (columns: `pf_employee,
  pf_employer, professional_tax, lwf, tds`) and `payroll_runs` has no `total_esi`, so the
  ESI that `computeMonthlyStatutory` calculates is never stored on the payslip nor
  aggregated onto the run.
- **Impact:** For any org with employees at/under the ₹21,000 ESI gross ceiling (the ESI
  0.75% employee / 3.25% employer contribution applies), the run summary and the stored
  payslip **omit ESI entirely** — the "ESI" card always reads ₹0 and no ESI liability is
  persisted for the ESIC return. In this test the employee's gross (₹2,02,500) is above the
  ceiling so ESI is genuinely 0, which masks the defect; it bites a low-wage workforce.
- **Route:** `/app/payroll` → run summary "ESI" card; payslip ESI line.

#### F-P14 — No segregation of duties on the payroll approval chain (one user approves HR + Finance + CFO)
- **Severity:** HIGH (financial control)
- **Evidence (source):** `apps/api/src/routers/payroll.ts:452-517` (`approve`). Every stage
  (`HR` / `FINANCE` / `CFO`) is gated by the **same** `permissionProcedure("hr", "write")`
  — there is no separate finance/CFO permission. The mutation records
  `approvedByHrId` / `approvedByFinanceId` / `approvedByCfoId = ctx.user!.id` (`:510-512`)
  but **never checks that the current user differs** from the prior approver(s). A single
  `hr:write` holder can walk a run through all three sign-offs.
- **Evidence (live + DB):** driving the cycle as the single admin, run #1 reached
  `COMPLETED` with the Approvals panel showing HR / FINANCE / CFO all "Approved". DB:
  `approved_by_hr_id = approved_by_finance_id = approved_by_cfo_id =
  bc19756f-…-2696cd2` (one user for all three).
- **Impact:** The three-tier maker-checker control over a payroll disbursement is not
  enforced — one person can self-approve HR, Finance and CFO stages and complete the run
  (which, combined with F-P6, would also let them export the bank file). Defeats the
  purpose of the approval hierarchy for a money-movement workflow.
- **Route:** `/app/payroll` → run → Execute HR-approve, Finance-approve, CFO-approve as the
  same user.
- **Screenshot:** `m1-payroll-06-completed-with-approvals.png`

---

### Module 1 (India Payroll) — summary

Positive path **works once the salary link is forced in the DB**: the 14-step cycle runs
Draft → … → Completed and the math is correct (gross ₹2,02,500 / net ₹1,83,282 / PF-emp
₹1,800 / PT ₹200 / TDS ₹17,218; payslip row == frozen run header). But it is gated by a
**BLOCKER**: no UI/API path assigns a salary structure to an employee, so in production
every run computes ₹0 / 0 employees.

Module-1 findings: **F-P11 BLOCKER** (salary structure unassignable → ₹0 runs) ·
**F-P14 HIGH** (no segregation of duties on approvals) · **F-P6 MEDIUM** (bank-file export
has no pipeline guard; currently orphaned UI) · **F-P8 MEDIUM** (partial PT/LWF override
zeroes other states) · **F-P5 MEDIUM→N/A** (header/payslip agree in practice) · **F-P3
MEDIUM** (Form-16 itemisation hardcoded 0) · **F-P9 MEDIUM** (mislabeled "TDS declarations"
tab) · **F-P13 MEDIUM** (ESI hardcoded 0 / never persisted) · **F-P12 LOW** (PF card =
emp+employer) · **F-P10 LOW** (12- vs 14-step label) · **F-P1 LOW**, **F-P2/F-P4/F-P7 INFO**.

Screenshots: `m1-payroll-01`…`m1-payroll-06`.
_Module 1 complete. Proceeding to Module 2 (GST / Invoicing)._

---

## MODULE 2 — GST / Invoicing

**Trace:** `packages/payroll-math/src/gst-engine.ts` (`computeGST`, `computeITCUtilisation`,
`reconcileGSTR2B`, `isBlockedITC`, RCM, e-invoice/e-way thresholds) → re-exported via
`apps/api/src/lib/india/gst-engine.ts` → consumed by `apps/api/src/routers/financial.ts`
(`createInvoice`, `createReceivableInvoice`, `backfillInvoiceGst`, `computeGST`,
`gstr2bReconcile`, `gstr2b.*`) and `apps/api/src/routers/accounting.ts`
(`gstr.generateGSTR1`, `gstr.generateGSTR3B`).

**Positive (source):** the previously-flagged **GSTR-1 18% hardcode is fixed** —
`buildItms` (`accounting.ts:731-767`) groups `itm_det` by the *actual* per-line
`gstRate`, with a header-derived effective-rate fallback (`rt = round(totalTax/txval*100)`)
for invoices with no line items. Invoice creation wires the GST engine correctly
(`gstInvoiceColumns` → `computeGST`), resolves place-of-supply from the org's primary
GSTIN (`resolveOrgState`), and posts a balanced GL journal entry atomically with the
invoice insert.

#### F-G1 — GSTR-1 / GSTR-3B are not scoped to the requested GSTIN (multi-GSTIN orgs over-report)
- **Severity:** HIGH (statutory filing correctness)
- **Evidence (source):** `apps/api/src/routers/accounting.ts:710-711` — `generateGSTR1`
  selects invoices by `orgId` + invoiceDate **only**; the input `gstinId` is used solely
  for the payload header + `pos` fallback (`:789, :808`), never as a filter. `generateGSTR3B`
  is identical (`:841`). The `invoices` table (`packages/db/src/schema/procurement.ts:288-307`)
  has **no `gstin_id` column** — an invoice cannot be attributed to a specific GSTIN
  registration, so per-GSTIN scoping is impossible even in principle.
- **Impact:** An org with more than one GSTIN (multi-state registrations) gets **every**
  invoice in **every** GSTIN's GSTR-1/3B — each return over-states outward supplies and
  output tax by the sum of all other registrations. Filing any one return as generated
  would be materially wrong.
- **Evidence (live — CONFIRMED):** With two org GSTINs seeded — MH primary
  `27AAACE1234A1Z1` (`a6f928eb`) and a Karnataka branch `29AAACE1234A1Z8`
  (`3911d9bb`, `is_primary=false`) — and a single Maharashtra-place-of-supply invoice
  `INV-2026-INT-001`, I opened `/app/accounting` → **GSTR Generation** tab, selected the
  **Karnataka-branch** GSTIN + GSTR-1 + Jul 2026 and clicked Generate. The UI returned
  **"1 invoices compiled into GSTR-1 payload"** under heading *"GSTR-1 — Jul 2026 · GSTIN:
  29AAACE1234A1Z8"* — i.e. the Karnataka return wrongly includes the Maharashtra invoice.
  Screenshot `m2-gst-04-gstr1-wrong-gstin-scope.png`.
- **Reachability:** REACHABLE via UI — `apps/web/src/app/app/accounting/page.tsx` `GSTRTab`
  (`:361-424`) calls `generateGSTR1`/`generateGSTR3B` with the selected `gstinId`.
- **Route:** `/app/accounting` → GSTR Generation → `accounting.gstr.generateGSTR1` /
  `generateGSTR3B`.

#### F-G2 — GSTR-3B ITC section is a stub ("approximate from COA balance for now")
- **Severity:** MEDIUM
- **Evidence (source):** `apps/api/src/routers/accounting.ts:843` comment + the 3B payload
  builds output tax from invoices but the ITC (input tax credit) side is not computed from
  purchase bills / the ingested GSTR-2B `matched` lines.
- **Impact:** GSTR-3B net-payable is output-tax-only; ITC is not netted, so the return
  overstates cash GST payable. (The stateful `gstr2b.*` ingestion exists and computes
  eligible ITC on matched lines — it is simply not joined into 3B.)
- **Route:** `accounting.gstr.generateGSTR3B`.

#### F-G3 — Vendor create/update cannot set GSTIN, state, PAN or TDS fields (interstate GST + B2B always wrong)
- **Severity:** HIGH (GST correctness + orphaned-column anti-pattern)
- **Evidence (source):** `apps/api/src/routers/vendors.ts:52-68` (`create`) and `:70-91`
  (`update`) accept only `name / contactEmail / contactPhone / address / paymentTerms /
  notes` (+`status/rating` on update). The `vendors` table
  (`packages/db/src/schema/procurement.ts:94-102, gstinIdx:113`) has `gstin`, `state`,
  `pan`, `panMaskedHash/Display`, `tdsSection`, `tdsRate`, `isMsme`, `msmeUdyamNumber` —
  **none are writable via the router.**
- **Evidence (live):** the "Add Vendor" modal (`/app/vendors`) exposes only Name, Contact
  Email, Contact Phone, Address, Payment Terms, Notes — no GSTIN / State / PAN field.
- **Impact:** Because `vendors.state` is always null, `createInvoice`'s interstate check
  (`financial.ts:218-226` → `resolveOrgState` vs `vendorRow.state`) always resolves to
  **intra-state → CGST+SGST**, even for a genuine inter-state supply that should be IGST.
  Because `vendors.gstin` is always null, the invoice's `supplierGstin`/`buyerGstin` is null,
  so **every** invoice lands in GSTR-1 **B2CS** (`accounting.ts:794` keys B2B on
  `inv.buyerGstin`) — B2B invoices are never reported as B2B. TDS-on-vendor
  (`tdsSection`/`tdsRate`) is likewise unusable. Same orphaned-column pattern as the
  payroll BLOCKER (F-P11).
- **Route:** `/app/vendors` → Add Vendor; `vendors.create` / `vendors.update`.

#### F-G4 — React "unique key prop" console error on the Taxation (India) reference tab
- **Severity:** LOW (UI hygiene, no data impact)
- **Evidence (live):** navigating to `/app/financial?tab=taxation` renders the static
  CIT/GST/TDS rate-card reference tables and emits a React console warning: *"Each child in
  a list should have a unique key prop"* (origin `FinancialPageInner` render). Screenshot
  `m2-gst-03-taxation-india-reference.png`.
- **Impact:** cosmetic — a `.map()` over rate rows renders without stable `key`. No incorrect
  data, but it's the class of warning that hides real reconciliation bugs in longer lists.
- **Route:** `/app/financial?tab=taxation`.

### MODULE 2 (GST / Invoicing) — summary

**Positive path works end-to-end.** Live-created vendor "Acme Cloud Services Pvt Ltd"
(state Karnataka, GSTIN `29AABCA1234A1Z5`), org primary GSTIN Maharashtra
`27AAACE1234A1Z1`, then created invoice `INV-2026-INT-001` (₹100,000 taxable, 18% GST) via
the `/app/financial` New-Invoice UI. Verified in DB: correctly resolved **inter-state →
IGST ₹18,000** (CGST/SGST 0), total ₹118,000, `supplier_gstin` captured; and a **balanced
atomic journal entry** `JE-2026-00001` posted (Dr Expenses ₹100,000 + Dr IGST-ITC ₹18,000
= Cr Accounts Payable ₹118,000; COA 1141 IGST-ITC ledger = ₹18,000). The previously-flagged
GSTR-1 18% hardcode is **fixed** and the New-Invoice modal surfaces the 0/5/12/18/28 rate
selector. **20/20 GST tests pass** (invoice-gst, gstr1-rate-grouping, gstr2b-reconciliation,
invoice-journal-posting — incl. the explicit "no hardcoded 18" case).
Screenshots: `m2-gst-01-create-invoice-rate-selector.png`,
`m2-gst-02-invoice-filled-interstate.png`.

**But the product path is gated by two HIGH defects that make the happy path unreachable
without direct DB writes:**
- **F-G3 (HIGH):** vendor GSTIN/state are unwritable via the product → *every* invoice
  created purely through the UI defaults to **intra-state (CGST+SGST)** and **B2CS**. The
  interstate IGST result above was only achievable because I set `vendors.state`/`gstin`
  directly in the DB. Real users cannot produce a correct inter-state or B2B invoice.
- **F-G1 (HIGH, live-confirmed):** GSTR-1/3B ignore the selected GSTIN and sweep *all* org
  invoices → multi-GSTIN orgs over-report every return.
- **F-G2 (MEDIUM):** GSTR-3B nets no ITC (output-tax-only). **F-G4 (LOW):** React key warning.

**Verdict:** the money-math and journal posting are production-grade; the **data-entry
surface (vendor tax attributes) and the filing scope (per-GSTIN)** are the breakpoints.
F-G3 + F-G1 together mean no multi-GSTIN, inter-state, or B2B invoice can be filed correctly
through the product as shipped.

---

## MODULE 3 — Accounting / Journal

**Trace:** `apps/api/src/routers/accounting.ts` — `journal.create` (balanced-entry
validation + atomic header/lines insert), `journal.post` (atomic balance-flip +
status→posted), `journal.reverse` (swapped-line reversal, atomic), and the reporting
surface `ledger`, `trialBalance`, `incomeStatement`, `profitAndLoss`, `balanceSheet`.
Account picker fed by `accounting.coa.list`. UI: `apps/web/src/app/app/accounting/page.tsx`.

**Positive (source + live):**
- `journal.create` (`:262-325`) validates `|ΣdebitAmount − ΣcreditAmount| ≤ 0.001`
  and throws `BAD_REQUEST` otherwise; header + lines inserted in one transaction.
- `journal.post` (`:327-356`) moves `chartOfAccounts.currentBalance` by `debit − credit`
  per line and flips status atomically. `journal.reverse` (`:358-426`) inserts a swapped-
  line reversal (posted) and marks the original `reversed`, all atomic — proven by
  `journal-reversal-balance.test.ts` ("post then reverse returns every affected account
  to its pre-post balance").
- **Balance sheet is now real** (`:591-`): folds current-period earnings (income − expense)
  into equity so Assets = Liabilities + Equity closes without a period-close entry; nets
  contra-assets. Previously-flagged "no balance sheet" gap is **closed**.
- **Live:** the invoice from Module 2 (`JE-2026-00001`, posted) surfaces correctly across
  reports — Trial Balance shows *"✓ Trial balance is balanced"* Dr ₹1,18,000 = Cr ₹1,18,000
  (IGST-ITC 18,000 + Expenses 1,00,000 debit vs Accounts Payable 1,18,000 credit); P&L shows
  Total Expenses ₹1,00,000 → Net Loss −₹1,00,000. Screenshots
  `m3-acct-01-trial-balance-balanced.png`, `m3-acct-03-pnl-statement.png`.
- **21/21 accounting tests pass** (journal-reversal-balance, balance-sheet-pnl,
  money-invariants incl. "rejects an unbalanced entry", accounting_fix).

#### F-A1 — BLOCKER: New-Journal-Entry account picker 400s → manual JEs cannot be created via the UI
- **Severity:** BLOCKER (core accounting entry path is unreachable through the product)
- **Evidence (live):** opening `/app/accounting` → **New Journal Entry** fires
  `GET /api/trpc/accounting.coa.list?input={"activeOnly":true,"limit":500}` → **400 Bad
  Request** (twice). Both account `<select>`s render only the placeholder "Select account…"
  (0 selectable options), so "Create Entry" stays permanently disabled. Screenshot
  `m3-acct-02-je-modal-empty-account-picker-400.png`.
- **Evidence (source — root cause):** `accounting.coa.list` input caps
  `limit: z.coerce.number().int().min(1).max(200).default(50)` (`accounting.ts:148`), but
  the JE modal's `AccountSelect` requests `limit: 500`
  (`apps/web/src/app/app/accounting/page.tsx:129`) — 500 > 200 → Zod rejects the input →
  400. (The COA-tab query at `:50` correctly uses `limit: 200` and works.)
- **Impact:** No manual/adjusting/closing/opening journal entry can be booked through the
  UI at all. Only system-generated JEs (invoice/payroll postings that bypass this modal)
  reach the ledger. The server-side balance invariant is fine and well-tested — the break
  is entirely the client input exceeding the server's `max(200)`.
- **Route:** `/app/accounting` → New Journal Entry → `accounting.coa.list`.

#### F-A2 — Trial balance classifies debit/credit by balance *sign*, not account normal-side
- **Severity:** LOW (correct for a well-signed ledger; latent misstatement risk)
- **Evidence (source):** `trialBalance` (`accounting.ts:476-487`) puts an account in the
  Debit column iff `currentBalance > 0` and Credit iff `< 0`, regardless of account `type`.
  This diverges from `balanceSheet`/`profitAndLoss`, which correctly use account
  normal-side. For a correctly-posted ledger the sign always matches the normal side, so
  the presentation is right today — but a legitimately debit-side liability (e.g. an
  overpaid payable / debit-balance creditor) would be shown in the Debit column against a
  `liability` type, and `isBalanced` is a ΣDr==ΣCr identity that can never detect a
  normal-side misclassification.
- **Impact:** cosmetic today; masks a class of ledger anomaly (contra / debit-balance
  liability, credit-balance asset) that a normal-side trial balance would surface.
- **Route:** `/app/accounting` → Trial Balance → `accounting.trialBalance`.

### MODULE 3 (Accounting / Journal) — summary
The journal money-math and its automation are **production-grade**: balanced-entry
enforcement, atomic post/reverse with exact balance restoration, and a real balance sheet
that closes the accounting identity — all backed by 21 green tests and confirmed live via
the Module-2 invoice flowing correctly into Trial Balance and P&L. **But F-A1 is a
BLOCKER: the New-Journal-Entry account picker 400s (`limit:500` > server `max(200)`), so
manual journal entries cannot be created through the product at all** — only
system-generated postings reach the ledger. F-A2 (trial-balance sign-vs-normal-side) is a
latent presentation risk. Net: the engine is sound, the primary human entry path is broken.

---

## MODULE 4 — CRM (lead scoring · lossless convert · CPQ GST)

**Trace:** `apps/api/src/lib/crm/lead-score.ts` + `lead-scoring-rules.ts` + `lead-write.ts`
(G5 scoring), `lead-convert.ts` (G6 lossless convert), `quote-tax.ts` (G7 CPQ GST) →
routers `apps/api/src/routers/crm/{leads,deals,lead-scoring}.ts` (+ legacy `index.ts`).
UI: `apps/web/src/app/app/crm/page.tsx`.

**Positive (source + live) — all three previously-flagged CRM gaps are genuinely closed:**
- **Lead scoring (G5) is real and wired.** `computeLeadScore` (pure, deterministic, clamped
  0..maxScore) is invoked on create/update/status-change/re-score via `lead-write.ts`
  (`createScoredLead`/`updateScoredLead`), which `crm.leads.create`/`update` call directly.
  **Live:** created lead "Ravi Menon / Zenith Analytics / Chief Technology Officer" (source
  website) → persisted **score = 45** (website 10 + "chief" title 20 + email 5 + phone 5 +
  company 5), shown in the Leads table Score column. Screenshot
  `m4-crm-02-lead-score-45-persisted.png`.
- **Lossless lead→deal conversion (G6) confirmed live.** `crm.leads.convert` runs
  `convertLeadToDeal` in a transaction: upserts a `crm_account` from the lead's company and
  a `crm_contact` from the lead's person, carries both onto the new `crm_deal`, re-points
  open activities, and back-links the lead (idempotent). **Live:** the qualified lead's
  Convert button produced lead `status=converted` + `converted_deal_id` set, with a new
  account "Zenith Analytics Pvt Ltd", contact "Ravi Menon", and deal (stage `prospect`,
  `has_acct=t`, `has_contact=t`) — **nothing dropped**. Screenshot
  `m4-crm-03-converted-deal-pipeline.png`.
- **CPQ quote GST (G7) implemented.** `buildQuoteTaxColumns`/`computeQuoteTax` apply
  discount-before-tax, per-line GST via the canonical `computeGST`, interstate CGST/SGST vs
  IGST split, wired into `deals.quotes` create/update.
- **22/22 CRM tests pass** (crm-lead-convert, crm-lead-scoring, crm-quote-gst, crm_fix).

#### F-C1 — Add-Lead "Lead Source" dropdown offers values the backend enum rejects (400 on create)
- **Severity:** HIGH (lead creation fails for 4 of 8 offered sources)
- **Evidence (live):** the `/app/crm` → **Add Lead** modal's Lead Source `<select>` renders
  options `website, linkedin, partner_referral, event, cold_outreach, webinar, trial, other`.
  Selecting **partner referral** and submitting → `POST crm.createLead` **400 Bad Request**
  with Zod `invalid_enum_value`: *"received 'partner_referral'; expected 'website' |
  'referral' | 'event' | 'cold_outreach' | 'partner' | 'advertising' | 'other'"*. Screenshot
  `m4-crm-01-add-lead-source-enum-drift-400.png`.
- **Evidence (source):** backend `crm.leads.create` input is
  `z.enum(leadSourceEnum.enumValues)` (`routers/crm/leads.ts:38`); the DB enum is
  `website|referral|event|cold_outreach|partner|advertising|other`. The web option list has
  drifted — `linkedin`, `partner_referral`, `webinar`, `trial` are **not** valid enum
  members; only `website|event|cold_outreach|other` overlap.
- **Impact:** choosing any of the 4 non-overlapping sources silently 400s (toast "Failed");
  a user picking the intuitive "partner referral" or "linkedin" cannot create the lead at all.
- **Route:** `/app/crm` → Leads → Add Lead → `crm.createLead`.

#### F-C2 — Lead Edit modal renders a Status select but never submits `status` (status unchangeable via UI)
- **Severity:** MEDIUM (blocks the qualify step that gates Convert)
- **Evidence (live):** the Edit-lead modal shows a Status `<select>`
  (`new|contacted|qualified|disqualified`), but saving fires `crm.updateLead` with a body
  that **omits `status`** entirely (observed request body:
  `{id, firstName, lastName, email, phone, company, title}` — no `status`). The DB status
  stayed `new` after "Save Changes" returned 200.
- **Impact:** a lead cannot be moved to `qualified` through the Edit modal, and since the
  Convert button only renders for `status === "qualified"` (`crm/page.tsx:1303`), the
  lossless-convert path is effectively unreachable via the product for a freshly-created
  lead. (I had to set `qualified` directly in the DB to surface the Convert button.)
- **Route:** `/app/crm` → Leads → Edit → `crm.updateLead`.

### MODULE 4 (CRM) — summary
The CRM intelligence layer is **genuinely built and wired** — deterministic lead scoring
(live score 45), lossless lead→deal conversion (live: account + contact + deal all carried,
nothing dropped), and CPQ quote GST — backed by 22 green tests. The engine work that the
gap analysis flagged as missing is done. **The breaks are at the data-entry surface:**
F-C1 (Lead-Source dropdown offers 4 values the backend enum rejects → 400) and F-C2 (Edit
modal never submits `status`, so a lead can't be qualified → Convert never surfaces
naturally). Both are frontend/contract drifts, not engine defects — but together they mean
the happy path (create → qualify → convert) cannot be completed end-to-end through the UI
without a valid-source pick and a DB-side status nudge.

---

## MODULE 5 — DPDP privacy (DSR · consent · breach · erasure)

**Scope traced:** `apps/api/src/routers/compliance.ts` (dsr / consent / breach sub-routers,
mounted at `trpc.compliance.*`, `routers/index.ts:130`), `lib/dpdp-erasure.ts`,
`lib/dpdp-sweeps.ts`, `lib/notification-dispatcher.ts`, `lib/pii-hash.ts`.
**Tests:** `dpdp-dsr`, `dpdp-consent`, `dpdp-breach`, `dpdp-sweeps` → **40 passed**.

**Verdict:** the old audits called DPDP "near-blank." That is **stale** — the *engine* is
production-grade. What is missing is the **entire operator UI** and the **outbound delivery
last mile**. Every backend obligation below was driven **live** end-to-end against the running
stack (positive + negative) via the authenticated tRPC client.

**What is genuinely built + wired (verified live):**
- **DSR lifecycle** — state machine (`received→verifying/in_progress/on_hold→fulfilled→closed`,
  `rejected` requires `rejectionReason`), statutory `dueAt` clock (received + `responseWindowDays`,
  default 30d), full event trail, and an **erasure reflex**: an erasure-type DSR reaching
  `fulfilled` fires `executeErasureForDsr` in the same transaction.
  - Live: created `DSR-2026-0001` (erasure, dueAt = received+30d); negative illegal jump
    `received→fulfilled` correctly **rejected** (`Invalid DSR transition`); positive
    `received→in_progress→fulfilled` succeeded; event trail recorded the reflex note
    `"[erasure] DRY-RUN (DPDP_ERASURE_ENABLED not set): would erase across 2 table(s)"`.
- **Consent ledger (§6)** — grant (version 1), re-grant renews in place (version bump, no dup
  row), §6(4) withdraw, idempotent expiry sweep.
  - Live: granted (v1) → withdrew (withdrawn) → negative **double-withdraw rejected**
    (`Consent already withdrawn`).
- **Breach register (§8(6))** — notify clock derived from jurisdiction profile
  (override → profile → 72h default), state machine
  (`detected→assessing/notifying/contained→notified→contained→closed`), clock-column stamping.
  - Live: created `BR-2026-0001` (notifyDueAt = detected+72h); negative illegal jump
    `detected→notified` **rejected**; positive `detected→notifying→notified` stamped
    `principalsNotifiedAt`.
- **Automation loop** — `runDpdpSweepsForOrg` (DSR-overdue, breach-notify, consent-expiry)
  is idempotent (24h dedupe on `dpdp_notification_artifacts`), driven by a Temporal schedule
  in `apps/worker`.

#### F-D1 — DPDP has **zero operator UI**: DSR / consent / breach are entirely headless
- **Severity:** HIGH (a shipped, statutorily-required capability the org cannot operate)
- **Evidence (live):** the full `trpc.compliance.dsr/consent/breach` surface has **no frontend
  consumer** — a repo-wide search of `apps/web` for `trpc.compliance.*`, `dpdp`, `consent`,
  `breach`, `Data Subject`, `DSR` returns **no matches**. `/app/compliance` renders a different,
  unrelated **"Configuration Compliance"** page (CIS/STIG policy baselines, risk register, audit
  plans) — not the DPDP data-principal surface. No nav item in the entire left rail
  (Security & Compliance section included) exposes DSR / consent / breach.
- **Impact:** a Data Protection Officer cannot log a DSR, advance its statutory clock, grant or
  withdraw consent, or register/notify a breach through the product. The backend is fully
  functional (proven above) but only reachable by hand-crafting tRPC calls — i.e. not operable
  by a business user. For an India-first product this is the single largest go-live UI gap.
- **Route:** none exists. Backend at `trpc.compliance.{dsr,consent,breach}.*` (unmounted on web).
- **Screenshot:** `m5-dpdp-01-no-ui.png` (the `/app/compliance` page is config-compliance, not DPDP).

#### F-D2 — Outbound DPDP notices never leave the system (LogOnlyDispatcher stub)
- **Severity:** MEDIUM (obligation is *recognised + audited* but *not discharged*)
- **Evidence (source + live):** all three sweeps route every notice through
  `getNotificationDispatcher()`, whose only implementation is `LogOnlyDispatcher`
  (`lib/notification-dispatcher.ts:47`). It inserts a `dpdp_notification_artifacts` row with
  `status: "logged"` and performs **no external send** (its own header: "performs NO external
  send"). After the full live breach was driven to `notified`, the artifacts table held
  **0 rows**, and any row it ever writes is `logged` — never `sent`/`failed`.
- **Impact:** the §8(6) breach notice to the Data Protection Board / affected principals and the
  DSR-overdue alert are recorded as an internal audit artifact but are **never delivered** to
  the actual recipient. The clock is watched and the obligation is logged (defensible), but the
  statutory *communication* does not happen. This is a last-mile stub, cleanly seam'd
  (`setNotificationDispatcher`) for a real adapter — but until wired, notification is dry-run.
- **Route:** `lib/dpdp-sweeps.ts` → `notification-dispatcher.ts` (LogOnly).

#### F-D3 — Erasure ships flag-off (dry-run) by default
- **Severity:** LOW (intentional + safe, but worth stating for go-live)
- **Evidence (live):** the erasure reflex on `DSR-2026-0001` fulfilment ran but left
  `erasure_executed_at` / `erasure_summary` **null** and logged
  `"DRY-RUN (DPDP_ERASURE_ENABLED not set): would erase across 2 table(s)"`. `executeErasureForDsr`
  only mutates Principal data when `DPDP_ERASURE_ENABLED === "true"` (or `opts.force`), and even
  then AND-s a statutory retention-floor predicate so rows inside their retention window are
  deferred, not erased. `ERASURE_MAP` is deliberately conservative (2 tables, anonymise).
- **Impact:** correct-by-default (no accidental data destruction), but an operator must
  explicitly enable + broaden the map before "right to erasure" actually purges Principal data
  across the product. Right now fulfilling an erasure DSR erases nothing.
- **Route:** `lib/dpdp-erasure.ts` (`isErasureEnabled` / `ERASURE_MAP` / retention floor).

### MODULE 5 (DPDP) — summary
DPDP is **not the near-blank hole the old audits describe** — the DSR, consent, and breach
engines are real, statutorily-shaped (state machines + dueAt/notify clocks + event trails +
erasure reflex), idempotent-swept, and covered by 40 green tests; I drove every path live,
positive and negative. **But the module is un-operable and un-delivering:** it has **no UI at
all** (F-D1, HIGH — `/app/compliance` is unrelated config-compliance), its outbound notices are
a **log-only stub** that never sends (F-D2), and **erasure is dry-run by default** (F-D3). The
intelligence and the clocks are present; the human surface and the last-mile delivery are not.

---

## MODULE 6 — ITSM (events → correlation → incident, SLA/escalation/webhook loops)

**Scope traced:** routers `events`, `tickets`, `changes`, `oncall`, `work-orders`, `assets/cmdb`;
services `itom-correlation.ts`, `itom-condition.ts`, `ticket-lifecycle.ts`, `sla-business-calendar.ts`;
BullMQ sweeps `coheronconnect-sla` (60s), `coheronconnect-escalation` (60s),
`coheronconnect-correlation` (60s), webhook-dispatch (30s, HMAC-SHA256), workflow-trigger (60s).
**Tests:** 5 suites (`itom-correlation`, `escalation-sweep`, `ticket-lifecycle`, `cmdb-cycle`,
`deploy-mttr`) → **30 passed**.

**What is genuinely built + wired (verified live):**
- **Event ingest + dedup** — `events.ingest` (`routers/events.ts:26`) dedups an incoming event
  against an existing row of the same `node`/`metric`/`fingerprint` in `state="open"`
  (`events.ts:51`), bumping its count instead of inserting a duplicate.
- **Condition DSL is real, not a stub** — `itom-condition.ts` is a genuine recursive-descent
  boolean parser (fields `count|severity|node|metric|state|value|threshold`, ops `= != > >= < <=`,
  `AND`/`OR`, severity ordinal `critical=5..clear=0`, numeric coercion, fault-tolerant —
  `matchesCondition` returns `false` on a parse error, never throws). This closes the
  "stored-but-never-evaluated config" anti-pattern for correlation.
- **Correlation → auto-incident** — `applyCorrelation` (`itom-correlation.ts:232`) with a
  `create_incident` action calls `createIncidentFromSystem`, marking the event
  `state="in_progress"` + `linkedIncidentId`, and flags it Major when `severity==="critical"`.
  - Live: created correlation policy `83d651a1` (`severity >= critical → create_incident`);
    ingesting a `critical` event `db-prod-01/disk_usage` **auto-created major incident E2EE-0001**
    (`5930a441`). Negative: an `info` event `web-01/cpu_load` produced **no incident** (stayed
    `state="open"`, `linked_incident_id` null).
- **Suppression short-circuit** — `applySuppression` (`itom-correlation.ts:180`) sets
  `state="suppressed"` and stops evaluation before correlation.
  - Live: suppression rule `90f05c60` (`node=noisy-01`); a `critical` `noisy-01/disk_usage` event
    returned `suppressed:true`, `incidentId:null` — never reached correlation, no incident.
- **CMDB cycle detection, SLA business-calendar, deploy→MTTR** — all covered by green suites.

#### F-I1 — Duplicate incidents on a repeating / flapping alert (dedup state mismatch)
- **Severity:** HIGH (an alert storm from one flapping resource fans out into many major
  incidents, defeating dedup + correlation and paging on-call repeatedly for the same fault)
- **Root cause (source):** correlation's `create_incident` action flips the matched event to
  `state="in_progress"` (`itom-correlation.ts:274`), but the ingest dedup query only matches
  events in `state="open"` (`events.ts:51`). So the **second** arrival of the *identical* alert
  finds no `open` row to dedup against, inserts a **new** event, and correlation fires **again**,
  creating a **second** incident.
- **Evidence (live + DB):** ingested the identical critical alert `db-prod-01/disk_usage` twice,
  11 seconds apart. Result — **two** `in_progress` events, each with its own
  `linked_incident_id`, and **two** major incidents:
  - `itom_events`: `db-prod-01|disk_usage|critical|in_progress|5930a441…` **and**
    `db-prod-01|disk_usage|critical|in_progress|fb4e4fc0…` (two rows, same fault).
  - `tickets`: `E2EE-0001` and `E2EE-0002`, both `CRITICAL: disk_usage on db-prod-01`,
    both `is_major_incident=t`, created `13:21:14` and `13:21:25`.
  - `/app/it-services/major-incidents` lists **both** duplicate incidents ("just now", Major).
- **Impact:** a real alert never resolves in one poll cycle — it re-fires until fixed. Every
  re-fire of a critical event spawns a brand-new major incident (and, once wired, a fresh on-call
  page), because the correlated event is no longer `open`. Dedup silently only protects the window
  between first ingest and correlation. This is a "capture without the intended consequence"
  loop defect: the dedup and the correlation state machines disagree on which states are "live."
- **Route:** `routers/events.ts:51` (dedup filter `state="open"`) vs
  `services/itom-correlation.ts:274` (correlation sets `state="in_progress"`).
- **Screenshot:** `m6-itsm-01-duplicate-incidents.png` (two identical major incidents listed).

### MODULE 6 (ITSM) — summary
The ITSM core is **real and wired** — event ingest, a genuine (non-stub) condition DSL,
correlation → auto-incident, suppression short-circuit, SLA/escalation/webhook/workflow-trigger
BullMQ sweeps, CMDB cycle detection, deploy→MTTR — all backed by 30 green tests and proven live
(positive + negative). The one material defect is **F-I1 (HIGH): a flapping / repeating alert
produces duplicate major incidents**, because ingest-dedup only matches `state="open"` while
correlation moves a matched event to `state="in_progress"` — so the same fault, re-fired,
bypasses dedup and re-triggers correlation. The intelligence loop closes on the *first* event but
re-opens on every subsequent identical one.

---

## MODULE 7 — HR (leave accrual, gratuity, attendance/LOP, statutory filing)

**Scope traced:** routers `hr` (employees/cases/leave/attendance/offboarding), `leave-accrual`
(policy/accrual/close/encash), `gratuity` (accrual/settlement), `workforce` (analytics),
`india-compliance` (EPFO ECR / ESI / PT / TDS filing + statutory ceilings); pure math in
`@coheronconnect/payroll-math` (`gratuity.ts`, `leave-accrual.ts`); India libs
`leave-attendance.ts`, `attendance-lop.ts`, `shift-schedule.ts`; workflows
`statutoryFilingWorkflow.ts`, `esiReturnWorkflow.ts`, `ptChallanWorkflow.ts`.
**Tests:** `gratuity` (9), `leave-accrual`, `attendance-lop` (4), `leave-attendance-expand` (7)
→ **32 passed** (plus `esi-return`, `pt-challan`, `india-payroll-engine` suites present).

**What is genuinely built + wired (verified live, positive + negative):**
- **Gratuity engine (Payment of Gratuity Act §4)** — `computeGratuity`: `15/26 × lastDrawn(Basic+DA)
  × countedYears`, ≥6-month trailing rounds up (on *actual* years, not rounded), ≥5-yr minimum
  (waived on death/disablement), capped ₹20L. Monthly accrual = `(15/26 × Basic+DA)/12`.
  - Live (new EMP-0002, start 2016-01-10): preview 18y × ₹500k → gross ₹5,192,308 → **capped
    ₹2,000,000**; negative 3y no-waiver → `eligible:false, reason "min-service"`, ₹0; monthly
    provision ₹1,250 (26k Basic+DA), **idempotent re-run** keeps cumulative ₹1,250, month-2
    cumulative ₹2,500; `settle` 10y × ₹200k → ₹1,153,846 persisted with `settledById`; negative
    duplicate settle → **CONFLICT 409**.
- **Leave-accrual engine** — pro-rata monthly credit, carry-forward cap + lapse split, encashment
  at `(Basic+DA)/26`, all posted to an immutable `leave_accrual_events` ledger + projected onto
  `leave_balances`.
  - Live: policy upsert (vacation 18/yr cap 30 encashable; sick 12/yr cap 0 non-encashable); 12
    monthly accruals → 18 days (1.5/mo), **idempotent re-run** (12 ledger rows, month-12 stays
    1.5); close preview vacation → carry 18 / lapse 0, **sick → carry 0 / lapse 12** (cap 0);
    close run seeds 2026, negative **double-close → CONFLICT**; encash 5 days → ₹5,000
    (5 × 26000/26); negative **encash non-encashable `sick` → PRECONDITION_FAILED**; negative
    **accrue with no policy (`parental`) → PRECONDITION_FAILED**.
- **Attendance → LOP → payroll** (G8) — `expandLeaveToAttendance` (unpaid→absent 1.0 LOP,
  others→on_leave 0), `computeAttendanceLopForPeriod` (absent=1.0, half_day=0.5), gross scaled by
  daysWorked/daysInMonth; idempotent on `(orgId, employeeId, date)`. Covered by green suites.
- **Statutory filing (EPFO ECR) is a real transport, not a stub** — `filing.submit` rebuilds the
  canonical `#~#`-delimited ECR body from the payslips behind the run, then the BullMQ
  `statutoryFilingWorkflow` calls `epfoEcrAdapter.send()` which **POSTs to a GSP endpoint**
  (`/v1/ecr/upload`, `x-api-key`), parses the TRRN, throws on non-2xx / missing TRRN, and writes
  `epfoAckNumber`/`submissionStatus` back with retry. ESI + PT have parallel real workflows
  (`esiReturnWorkflow`, `ptChallanWorkflow`) + adapters + tests. This is **materially stronger
  than the CLAUDE.md gap note** ("ESI/PT/TDS only placeholder challan records").

#### F-H1 — Leave-accrual, carry-forward, encashment and gratuity are entirely headless (no UI)
- **Severity:** HIGH (shipped, statutorily-shaped payroll liabilities the org cannot operate)
- **Evidence (live):** `/app/hr` → **Leave Management** tab exposes only leave-*request* approval;
  a page search for `accrual|gratuity|encash|carry-forward|policy|balance|entitlement` returns
  **no controls**. A repo-wide `apps/web` search for `leaveAccrual.*` / `gratuity.(accrual|
  settlement)` finds **only the generated RBAC map** (`trpc-procedure-rbac.generated.ts`) — **no
  page component consumes either router**. Every path I exercised above was reachable only by
  hand-crafted tRPC.
- **Impact:** an HR manager cannot configure a leave policy, run monthly accrual, close the year
  (carry-forward/lapse), encash leave, or provision/settle gratuity through the product. The
  engines are correct and idempotent (proven) but un-operable by a business user — the same
  headless-backend pattern as DPDP (F-D1). For an India payroll product these are core monthly +
  exit liabilities.
- **Route:** backend `trpc.leaveAccrual.*`, `trpc.gratuity.*` (both unmounted on web);
  `/app/hr?tab=leave` is request-approval only.
- **Screenshot:** `m7-hr-01-leave-mgmt-no-accrual-ui.png`.

#### F-H2 — Monthly accrual / gratuity provision / year-end close have no automation trigger
- **Severity:** MEDIUM (correct when called, but nothing calls them on schedule)
- **Evidence (source):** a repo-wide search of `apps/worker` for `accrue|provisionAll|leaveAccrual|
  gratuity|yearEnd` returns **no matches**; the only references to `accrue`/`provisionAll` in
  `apps/api` are the routers + their tests. Unlike DPDP (Temporal sweep), ITSM (BullMQ sweeps) and
  EPFO ECR (BullMQ worker), there is **no scheduled job** that runs monthly leave accrual, monthly
  gratuity provisioning, or the year-end carry-forward close.
- **Impact:** these are inherently periodic obligations (accrue every month, close every year). An
  operator must remember to invoke `accrual.accrue`/`accrueAll`, `gratuity.accrual.provisionAll`,
  and `close.run` by hand each period — and, per F-H1, there is not even a UI button to do so.
  This is an open-loop: the computation exists but is never *fired* on its natural cadence.
- **Route:** `routers/leave-accrual.ts` (`accrual.accrueAll`, `close.run`),
  `routers/gratuity.ts` (`accrual.provisionAll`) — no worker/schedule references them.

### MODULE 7 (HR) — summary
The HR computation layer is **genuinely production-grade**: gratuity (Act §4 formula + cap +
death/disablement waiver + ≥6-mo rounding), leave accrual (pro-rata + carry-forward/lapse +
encashment on an immutable ledger), attendance→LOP→gross, and — better than documented — a **real
EPFO ECR / ESI / PT filing transport** (GSP HTTP push with TRRN write-back, soft-failing
`not_configured` until creds land). 32 tests green; I drove every path live, positive and
negative, with exact math confirmed. The two gaps are operational, not computational:
**F-H1 (HIGH)** — the accrual/gratuity/encashment/close engines have **no UI** (headless, like
DPDP); **F-H2 (MEDIUM)** — no scheduled job fires the monthly accrual / gratuity provision /
year-end close, so the periodic loop must be triggered by hand. Intelligence present; human
surface and the periodic trigger absent.

---

## MODULE 8 — Security / Auth (MFA · step-up · vuln-SLA · RLS · session/token · audit chain)

**Scope traced:** MFA/TOTP enrolment + login gate (`routers/auth.ts:227-516`, `lib/totp.ts`),
KMS envelope encryption (`services/encryption.ts`), Postgres RLS wall (migration `0052`,
`lib/trpc.ts` `rlsTenant` middleware :519-533), vulnerability-SLA breach/escalation loop
(`workflows/vulnerabilitySlaWorkflow.ts`, wired in `services/workflow.ts`), tamper-evident audit
hash chain (`lib/audit-hash.ts`), RBAC (`permissionProcedure` :542-585), step-up re-auth, and
session/reset/verification-token storage (`routers/auth.ts:77-102,683,711`).

**Tests (baseline, green):** `mfa` (9) · `rls-tenant-isolation` (8) · `audit-hash-chain` (4) ·
`kms-encryption` (18) · `vulnerability-sla` + `vuln-sla-policy` (8) · `auth` (7) · `auth-rbac` (3)
· `rbac-unit` (39) = **140 passed, 0 failed** across the two runs.

**Extended live probe (added after "only 3 gaps?"):** beyond unit tests, drove the authorization
controls *live over HTTP* against the running API with real seeded users — a bare `member` for
RBAC-denial, and an `admin`+`finance_manager` user with org policy configured for the MFA/step-up
gates. This live drilling is what surfaced **F-S4** (payroll RBAC over-grant) and **F-S5**
(rate-limit/lockout disabled under `NODE_ENV=test`), neither of which the passing unit suite
catches. All seeded probe data was cleaned up afterward.

**What is genuinely production-grade (verified live, not just green tests):**
- **MFA is real end-to-end.** Drove enrolment in the browser (`/app/profile` → Password &
  Security → Enable 2FA): a real QR + base32 secret rendered, I generated a valid TOTP with the
  same `otplib`, confirmed, and got 10 one-time backup codes + status → **Enabled**. DB check:
  `mfa_enrollments.totp_secret` stored as `v2:…` (**KMS envelope, AES-256-GCM**, not plaintext);
  `backup_codes` stored as `$2b$12$…` (**bcrypt cost 12**). Negative: `auth.mfa.disable` with
  `000000` → **401 UNAUTHORIZED "Invalid MFA code"** (possession enforced); valid TOTP → disabled.
  Login for an enrolled user returns a challenge (no session) and only `verifyMfa` mints one.
- **RLS is really enforced at the DB.** `app_runtime` role is `NOSUPERUSER` + `NOBYPASSRLS`;
  191 `tenant_isolation` policies; core tenant tables `FORCE ROW LEVEL SECURITY`. Live proof:
  inside a tx with `SET LOCAL ROLE app_runtime` + `set_config('app.org_id', <orgA>, true)`, org A
  saw its 10 users, an explicit read of org B's users returned **0** (blocked), and
  `journal_entries` were org-scoped. The `rlsTenant` middleware sets both GUC + role with
  `SET LOCAL` inside a per-request transaction.
- **KMS envelope encryption is genuine** — fresh 256-bit DEK per secret, AES-256-GCM with
  auth-tag verify, only the *wrapped* DEK stored, plaintext DEK scrubbed (`fill(0)`), legacy CBC
  kept read-only for back-compat; webhook HMAC verify is `timingSafeEqual`.
- **Session / reset / verification tokens are stored hashed** — `sessions.id` is the SHA-256 hex
  (length 64) of a `nanoid(32)` token; only the plaintext goes to the client, so the DB never
  holds a usable token. Password-reset + verification tokens are SHA-256 too (auth.ts:683,711).
- **Vulnerability-SLA loop is real *and wired*.** `sweepVulnSlaBreaches` bulk-flips `sla_breached`
  with `FOR UPDATE SKIP LOCKED`; `sweepVulnEscalations` walks the on-call chain advance-only with
  notify + audit. Unlike HR accrual (F-H2), this worker **is** created/scheduled in
  `services/workflow.ts:150-198` (60 s cadence).

#### F-S1 — Audit hash chain has partial coverage: security-sensitive events are written unchained
- **Status (2026-07-30):** **STILL OPEN.** The `f365314` MFA fix addressed a *different* symptom
  (the NULL-seq rows were making `appendAuditEntry` collide on `seq=1`); it did not move
  `mfa_enrolled`/`mfa_disabled`/`escalation.level_up` onto the chain. Closing this requires routing
  those writers through `appendAuditEntry()` (see Route below) — not yet done.
- **Severity:** HIGH (undermines the tamper-evidence guarantee for exactly the events that matter)
- **Evidence (DB, eval instance):** of all `audit_logs`, **337 rows have `seq IS NULL`** (never
  entered the hash chain) vs 5 977 chained. The unchained actions include **`mfa_enrolled` (146)**,
  **`mfa_disabled` (25)**, and **`escalation.level_up` (137)** — all security/authorization
  events. Root cause: the MFA procedures write via a plain `db.insert(auditLogs)…` (auth.ts:467,
  506) instead of `appendAuditEntry()`. `verifyAuditChain` explicitly **skips** `seq IS NULL` rows
  (`lib/audit-hash.ts:126`), so a tampered/deleted MFA-enrolment audit row is **not detectable**.
- **Impact:** the chain is real and correct, but it does not cover the security events an attacker
  would most want to forge or erase (who enabled/disabled MFA, escalation actions). The
  tamper-evidence property therefore does not hold for the security audit trail.
- **Route:** writers `routers/auth.ts:467` (`mfa_enrolled`), `:506` (`mfa_disabled`),
  `workflows/*` (`escalation.level_up`); verifier `lib/audit-hash.ts:116-168`.

#### F-S2 — The eval org's audit chain is already broken (genuine seq gap at 2)
- **Severity:** MEDIUM (integrity break present in practice; correctly *detected*, not silently
  ignored)
- **Evidence (DB):** for org `d03d1d9b…` the chained `seq` runs `1, 3, 4 … 80` — **seq 2 is
  missing** (0 rows at `seq=2`; `min=1, max=80, count=79`). Re-deriving the chain returns
  `ok:false, brokenAtSeq:3, reason:"seq gap: expected 2, found 3"`. So a chained audit row was
  lost after its seq was consumed. The detection logic works exactly as designed — but the live
  chain for the primary test tenant is in a broken state, which in production would mean the WORM
  guarantee is already void for that org and needs investigation/re-anchoring.
- **Impact:** any downstream "prove the audit log is intact" control fails for this org today.
  Combined with F-S1 it means the tamper-evidence story is weaker in practice than on paper.
- **Route:** `audit_logs` (org `d03d1d9b…`); verifier `lib/audit-hash.ts:116-168`.

#### F-S3 — RLS `tenant_isolation` policy fails *open* when `app.org_id` is unset
- **Severity:** MEDIUM (defence-in-depth gap, not an active leak on the current request path)
- **Evidence (DB):** the policy `qual` is
  `current_setting('app.org_id', true) IS NULL OR current_setting('app.org_id', true) = '' OR
  org_id = current_setting('app.org_id', true)::uuid`. Live proof: `SET LOCAL ROLE app_runtime`
  **without** setting the GUC returns **all 35 730 users** across every org — RLS does *not* fail
  closed. It only constrains once the GUC is set. Today the `rlsTenant` middleware returns early
  (unwrapped, on the pooled superuser) when `orgId` is falsy (trpc.ts:524) and always sets GUC +
  role together (:529-530), so the role is never dropped with an empty GUC on the live path — but
  the RLS wall provides **zero** protection if that invariant is ever broken (a new code path that
  drops role first, a refactor, a raw query outside the middleware).
- **Impact:** RLS is marketed as the second wall behind the app-layer `eq(orgId)` filters, but its
  fail-open default means it degrades to no protection under the exact failure it's meant to guard
  (middleware not setting the org). The app-layer filter remains the *only* real wall in that case.
- **Route:** migration `0052` (`tenant_isolation` policy), `lib/trpc.ts:519-533` (`rlsTenant`).

#### F-S4 — RBAC over-grant: the base `requester` role can create/compute/approve payroll + export bank files
- **Severity:** HIGH (privilege escalation — least-privilege user reaches the most sensitive money path)
- **How found (live, direct HTTP):** seeded a password on the existing `member` user
  (`grat-eval-…@e2e.test`, DB role `member` → system role `["requester"]`, *no* matrix role),
  logged in, and drove permissioned mutations:
  - `crm.leads.create` → **`FORBIDDEN: Permission denied: accounts.write`** ✅ (correctly denied)
  - `accounting.journal.create` → **`FORBIDDEN: Permission denied: financial.write`** ✅ (correctly denied)
  - **`payroll.runs.create` (month/year valid) → `200 OK`, real row created** (`status: DRAFT`,
    id returned) ❌
  - `payroll.runs.computePayslips` → passed the permission gate (failed only on run-state
    `BAD_REQUEST`, *not* FORBIDDEN) ❌
  - `payroll.exportBankFile` → passed the permission gate (failed only on Zod `format` required,
    *not* FORBIDDEN) ❌
- **Root cause:** `payroll.runs.create` / `computePayslips` / `approve` / `exportBankFile` are all
  declared `permissionProcedure("hr", "write")` (`routers/payroll.ts:33,254,367,452,764`), and the
  `requester` role is granted `hr: ["read","write"]` (`packages/types/src/rbac-matrix.ts:457`). The
  role comment intends "raise HR **cases**" (self-service help-desk), but the `hr` module namespace
  *also* gates the entire payroll lifecycle — so every base member inherits payroll create/compute/
  approve + bank-file export. There is **no `payroll` module in the RBAC matrix**; payroll rides on
  `hr.write`.
- **Impact:** any invited `member` (the least-privilege DB role, default for new users) can spin up
  payroll runs, drive computation, and reach the NEFT/bank-file export gate for the whole org. This
  is a direct segregation-of-duties failure on the platform's highest-value operation.
- **Route:** `routers/payroll.ts:254/367/452/764` (`permissionProcedure("hr","write")`),
  `packages/types/src/rbac-matrix.ts:457` (`requester.hr = ["read","write"]`),
  `lib/rbac-db.ts:34` (`member → ["requester"]`).
- **Note:** cleaned up — the 3 probe payroll runs (Jan/Feb/Mar 2026) were deleted, member password
  reverted to NULL. The *matrix* RBAC (finance/accounting) is correctly enforced; the defect is the
  coarse `requester → hr.write` grant leaking into payroll.

#### F-S5 — The running API instance has `NODE_ENV=test`, which globally disables login rate-limiting + account lockout
- **Severity:** HIGH (brute-force protection is off on the live instance)
- **How found (live):** submitted **12 consecutive** wrong-password logins for a real user
  (`auth.login`) — **all 12 returned `UNAUTHORIZED`, none returned `TOO_MANY_REQUESTS`**; no
  lockout ever engaged. Inspecting the running process env (`ps eww`) confirmed **`NODE_ENV=test`**
  on the serving pid.
- **Root cause:** both `checkLoginRateLimit` (pre-bcrypt burst gate) and `recordFailedLogin`
  (per-email >10 / per-IP >50 lockout) short-circuit with an early `return` when
  `process.env.NODE_ENV === "test"` (`lib/login-rate-limit.ts:35,66`). The limiter code itself is
  genuine (Redis-backed, correct thresholds: `MAX_FAILED_EMAIL=10`, `MAX_FAILED_IP=50`, 5-min
  window; dev default 1000/min), but it is a no-op whenever `NODE_ENV=test`.
- **Impact:** on this deployment the account-lockout and login rate-limit controls are entirely
  inert — unlimited password guessing is possible. Additionally there is **no automated test** for
  the lockout path (and since the suite itself runs under `NODE_ENV=test`, one could not exercise
  it), so a regression here is invisible.
- **Route:** `lib/login-rate-limit.ts:34-36,65-67`; login call-site `routers/auth.ts:183,194-216`.

#### Positive controls verified live (no finding — recorded for completeness)
Driven end-to-end during the extended Module-8 probe and behaving correctly:
- **RBAC denial (matrix layer):** `member` correctly `FORBIDDEN` on `accounts.write` and
  `financial.write` (only the `hr.write`→payroll leak in F-S4 is broken).
- **MFA org-policy gate (`requireMfaForMatrixRoles`):** with the policy set for a `finance_manager`
  matrix role and `mfa_enrolled=false`, `financial.markPaid` → **`FORBIDDEN: MFA_ENROLLMENT_REQUIRED`**
  (`lib/mfa-policy.ts`).
- **Step-up gate (`requireStepUpForMatrixRoles`):** after MFA-enrolling the same user,
  `financial.markPaid` → **`FORBIDDEN: STEP_UP_REQUIRED`**; calling `auth.verifyStepUp` with the
  password then set `stepUpVerifiedUntil` and the *subsequent* `markPaid` passed both gates
  (reaching the `NOT_FOUND` business path). Both gates fire and clear correctly (`lib/step-up.ts`).
- **Session invalidation on logout:** after `auth.logout`, reusing the same session token on a
  protected procedure → **`UNAUTHORIZED: Not authenticated`** (session row deleted + Redis cache
  invalidated; `auth.ts:288-298`).
- **Password-reset token lifecycle:** valid token → success; **reuse → `Reset link already used`**
  (single-use `usedAt` guard); **expired token → `Reset link has expired`**; garbage token →
  `Invalid or expired reset link`. Tokens are SHA-256-hashed at rest, 1h TTL, prior tokens purged
  on new request, all sessions killed on reset (`auth.ts:706-751`).

### MODULE 8 (Security/Auth) — summary
Security has the **strongest primitives** evaluated — MFA (real TOTP + KMS-envelope secret + bcrypt
backup codes, driven live enrol→confirm→reject→disable), DB-enforced RLS (cross-org read returns 0),
genuine KMS envelope encryption, hashed session/reset/verification tokens, a vuln-SLA loop that is
both real **and** wired to a running scheduler, and — verified live in the extended probe — working
MFA-policy + step-up gates, correct logout session invalidation, and a fully correct password-reset
token lifecycle (single-use + expiry + garbage rejection). 140 tests green.

But the deeper probe (prompted by "only 3 gaps?") surfaced **two HIGH findings that the initial pass
missed**, both in the *primary* controls rather than defence-in-depth:
- **F-S4 (HIGH)** — RBAC over-grant: the base `requester` role (every default `member`) can
  create/compute/approve payroll **and** reach bank-file export, because payroll rides on
  `permissionProcedure("hr","write")` and `requester` holds `hr:["read","write"]`. Proven live —
  a bare member created real payroll runs. Segregation-of-duties failure on the top money path.
- **F-S5 (HIGH)** — the *running* instance is `NODE_ENV=test`, which makes both the login
  rate-limiter and the account-lockout a no-op (proven: 12 wrong-password logins, zero lockout).
  Brute-force protection is inert on the live deployment.

Plus the three defence-in-depth gaps from the first pass: **F-S1 (HIGH)** — 337 security events
(`mfa_enrolled`/`mfa_disabled`/`escalation.level_up`) written *outside* the tamper-evident chain;
**F-S2 (MEDIUM)** — the eval org's chain already has a real seq gap at 2; **F-S3 (MEDIUM)** — RLS
fails *open* when the org GUC is unset.

Net: the crypto/session/token primitives are excellent, but **authorization breadth (F-S4) and the
live security posture (F-S5) are the real holes** — exactly the kind the "push to the last node"
mandate was meant to expose. Five findings total (3 HIGH, 2 MEDIUM).
