# CONTEXT — session hand-off

_Written 2026-08-05. A quick-start map so a new session picks up cleanly.
**Read `reports/fix-plan.md` first — it is the source of truth** for what is
done, pending, and blocked. This file only points you at it and summarises._

---

## What CoheronConnect is

A multi-tenant **Enterprise Operations Platform** for the India market — payroll,
tax (TDS/GST), HR, accounting, CRM, ITSM, IT-asset, and governance/privacy, all in
one product, each customer isolated as its own tenant. Repo name is **NexusOps**;
the product is **CoheronConnect**; production is `connect.coheron.tech`.

Monorepo: pnpm + Turborepo, Node ≥20. `apps/api` (Fastify + tRPC) holds the bulk of
the business logic and tests; `apps/web` is the Next.js front end; `apps/worker` runs
background workflows; `packages/db` is the Drizzle schema; `packages/payroll-math`
is the pure money-math. Full map is in `BUILD.md`; conventions are in `CLAUDE.md`.

## Current stage

**Pre-production.** Seven pilot customers go live **end of August**. India
payroll/tax is the most mature area and is the go-live gate; the remaining
payroll-blocking items are listed under "Next in queue" below.

## Deployed commit & migration head

- **Deployed commit:** `be88a02` — _"fix(payroll): delete second India payroll engine,
  unify on one path (DUP-1)."_ Local `main` and `origin/main` are in sync at this SHA
  (verified `git rev-parse HEAD origin/main` identical). Pushing to `main` auto-deploys
  to Vultr via the `deploy` job in `ci.yml` (runs after build on `main`, gated only on
  the Vultr secrets); CI run 31013084550 confirmed `live=be88a02…` healthy on the box.
- **Migration head:** `0068_easy_mongu` (the HRA `rent_paid_annual` column; `0067_flaky_sinister_six`
  was the PT4 prior-employer columns). DUP-1 added no migration. Always re-confirm the live head
  from the last entry in `packages/db/drizzle/meta/_journal.json` — do not trust a number in prose.

## The audit & sweep system (`.claude/skills/`)

Two skills drive quality review:

- **`qa-map`** — run **once**, before any auditing. Inventories every subsystem,
  drafts the quality bar (`docs/quality-bar.md`), and produces the audit checklist.
- **`qa-audit`** — deep audit of one subsystem against `docs/quality-bar.md`. It
  audits the **standing code, not a diff**, and writes findings in plain English
  (the owner is not a developer).

Both assume the reader cannot evaluate a finding by reading code, so every finding
must be explained in business terms.

## Where the reports live (`reports/`)

- **`reports/fix-plan.md`** — **THE source of truth.** The three-phase plan
  (Ratchets → Correctness → Completeness), a "Status at a glance" table, per-item
  detail, and the CA (chartered-accountant) rulings. Read this first, every session.
- `reports/audit-summary.md` — the five root causes that generated most defects.
- `reports/audit-*.md` — one deep audit per subsystem (payroll, GST, DPDP, auth,
  tenant-isolation, money/accounting, ITSM, CRM, etc.).
- `reports/sweep-*.md` — cross-cutting sweeps (fabricated constants, false comments,
  phantom fields, unreachable features, ownership checks, stale debt, …).
- `reports/triage.md` — findings sorted into Bucket A / Bucket B.

## The five ratchets — and their state

Ratchets are guardrails (mostly tests) built **first**, so a whole class of bug
becomes impossible to reintroduce. **All five are Done and green** (Phase 1 complete):

| # | What it guards | Turned green by |
|---|----------------|-----------------|
| R-1 | All tenant tables sit behind the RLS wall | A11 (migration 0061) |
| R-2 | Custom-role permissions stay in the five-verb vocabulary | A6 |
| R-3 | DPDP notices are only recorded as sent if truly sent | A3 / A4 |
| R-4 | Money read-then-write can't double-count (concurrency lock) | A2 |
| R-5 | Audit-log hash chain can't be tail-truncated silently | B5 head-anchor |

## What landed in the last few days

- **P-15 (uncommitted, Aug 5) — screen tax-preview now includes a mid-year joiner's prior-employer 12B:**
  - **The defect (live money, shipped feature):** the on-screen regime-comparison projection
    (`taxPreview` → `buildTaxProfileFromEmployee`, `apps/api/src/routers/payroll.ts`) hardcoded
    `previousEmployerIncome: 0`, `previousEmployerTDS: 0`, **and** `joiningMonth: 1`. So a mid-year
    joiner with declared Form 12B figures was projected as a full-year employee and their prior salary
    was **silently dropped** from the annual base — while the **run path** (`payroll-run-aggregates.ts:118-119`)
    already threaded both and derived a real join month. Screen and run disagreed for exactly the joiner
    population where s.192(2) matters.
  - **Root cause of the inertness:** the engine folds `previousEmployerIncome` into gross **only** on the
    mid-year branch (`joiningMonth !== 1`, `tax-engine.ts:275-285`). Threading the field alone did nothing
    while `joiningMonth` stayed 1 — the fix had to derive a real FY `joiningMonth` too.
  - **The fix:** `buildTaxProfileFromEmployee` takes a `fyStart` arg; derives `joiningMonth` from the
    employee's `startDate` (start after 1 April ⇒ `calendarToFyMonth`, else 1 — byte-identical for
    existing full-year employees), sets `monthsInFY` accordingly, and reads `previousEmployerIncome`/`Tds`
    from the same row the run reads. Both `taxPreview` call sites pass `fyStart`.
  - **Fairness test** (`PT4-SCREEN` block in `payroll-actual-components-and-prior-employer.test.ts`, now
    **10/10 green**): two mid-year joiners, one with 800000/40000 12B and one without — the WITH case
    projects a higher old-regime taxable income (delta > ₹500k). Red-before proven (reverting the join-month
    derivation collapsed both to an identical 1147600); `pnpm lint` green across all 9 workspaces.
  - **Premise corrections recorded (no code):** **P-14** was already fixed (screen HRA computes from
    `rentPaidAnnual`, `payroll.ts:185-193`) — closed. **P-13** re-scoped: there is **no** Chapter VI-A
    column/form/declarations table anywhere (only `previousEmployerIncome` + `rentPaidAnnual` exist), so
    it is folded into **C1's investment-declaration intake**, not a one-line thread. See
    `reports/fix-plan.md` → "Roadmap + correction records (2026-08-05)".
- **`be88a02` — DUP-1 (Aug 5) — the second India payroll engine retired, six call sites rerouted:**
  - **The defect (live money):** `apps/api/src/lib/india/payroll-engine.ts` was a 416-line **second**
    India payroll engine, reached through six **dynamic `await import(`** call sites, and
    `hr.payroll.runMonthlyPayroll` used it to **write payslips + run totals** — a duplicate
    money-writing path. It carried the pre-fix version of every correction made this week: stale PT
    slabs (pre-C2-FIX), 37% new-regime surcharge (pre-PT3), flat s.87A with no marginal relief (pre-PT5),
    tax slabs hardcoded not effective-dated (pre-C5), HRA against a rent field that was always 0, and
    YTD written as 0. Four of the five files in that folder were already re-export shims to
    `packages/payroll-math`; only this one was a live duplicate.
  - **Why it survived every prior sweep:** the call sites are **dynamic imports**, invisible to a
    static-import scan — so every sweep that walked the static graph never saw the engine. This is the
    root lesson: a sweep claiming money/statutory coverage must enumerate `await import(` / `.then(import(`
    sites and follow them (recorded in `reports/sweep-dynamic-imports.md`).
  - **The confirmed earlier miss:** the phantom-fields sweep missed **`rentPaidMonthly`** — the field the
    second engine read for HRA, which nothing populated (always 0), so its HRA exemption was always nil.
  - **A second, distinct failure (filename ≠ coverage):** the payroll-tax audit treated
    `apps/api/src/__tests__/india-payroll-engine.test.ts` as coverage of the second engine on the strength
    of the name. That test never imports `../lib/india/payroll-engine`; it exercises the LIVE engine through
    the shims. The 416-line second engine had **zero** test coverage.
  - **The fix (owner decisions applied):** deleted the second engine; **retired
    `hr.payroll.runMonthlyPayroll`** (owner: "use the pipeline" — `payroll.runs` is now the only
    payslip-writing path); rerouted the 4 surviving previews onto the live engine
    (`computeCurrentSlip`/`computeMonthlySlip` via `buildEmployeePayrollInput → computeEmployeePayslip`,
    the same bridge `computePayslips` uses; `computeTax` via payroll-math `computeTax`). Extracted
    `formatECRFile`/`ECRLine` into `india/ecr-format.ts` **preserving the `#~#` EPFO byte-format**
    (owner: "keep it for now") and rerouted `hr.generateECR` + `india-compliance filing.submit` to it.
    Regenerated the tRPC RBAC map (drops `runMonthlyPayroll`, keeps the 4 previews).
  - **Fairness test:** `apps/api/src/__tests__/payroll-engine-equivalence.test.ts` (2/2 green) — the
    preview path and the run path produce identical core figures for the same employee/period, and the
    second-engine module is gone (guards reintroduction). `pnpm lint` green across all 9 workspaces.
  - **Sweeps to re-run** now the file is in scope: **phantom-fields**, **payroll-tax**, and
    **unreachable-features** — the three that were blind to a dynamically-imported, money-writing engine.
- **`0000897` — employee statutory ingestion pass (Aug 5, C2-STRUCT/C1/C3 enabler):** the statutory
  determinants that previously had no path onto the employee record — state, gender, DOB, metro flag,
  PT-exemption flags — now reach the payroll engine, and the silent `state ?? "Maharashtra"` fallback
  in `buildEmployeePayrollInput` is gone (a missing state now throws; the row is excluded with a
  per-employee error and the run continues). Fairness checks in
  `employee-statutory-ingestion.test.ts` (Kerala resolves as Kerala not Maharashtra; MH PT gender-split;
  tier-1/age exemptions zero PT; metro 50% vs 40% HRA threshold).
- **`a7d31ee` — M-05 (Aug 5) — salary-structure family versioning** (also listed below): effective-dated
  versions share a `family_id`; employees link to the family; payroll resolves the version whose
  `[effective_from, effective_to)` window contains the pay period.
- **`7a4a408` — PT1 / PT2 / PT4 (Aug 5) — TDS on actual paid components + prior-employer 12B:**
  - **PT1 — tax the actual paid components, not a shaved contracted CTC.** Deleted the bare
    `- 2500` in `buildEmployeePayrollInput`'s special-allowance residual
    (`payroll-run-aggregates.ts`). It was the ₹2,500 **annual** Maharashtra PT cap subtracted
    **monthly** (12× too large, wrong place, never added back), silently shaving ₹30,000/yr off
    every employee's gross — and therefore off the TDS base. PT is a separate statutory
    deduction; it does not belong in the earnings residual. Also reconciled the on-screen path
    (`buildTaxProfileFromEmployee` in `payroll.ts`) to the run path: it now uses the sum of
    actual paid components (`fyGross`) as the TDS basis instead of shortcutting to raw contracted
    `ctcAnnual`, so screen, PDF, and the locked run all agree. **CA note:** already-filed periods
    must be corrected via a **revised Form 24Q with 1.5%/month interest borne by the company**
    (N/A on test env; applies before any live customer run).
  - **PT2 — payslip PDF reads engine figures, not re-derived shortcuts.** Extracted
    `computePayslipTaxFigures` (`lib/payslip-tax.ts`) as the single source of truth; both the
    on-screen payslip and the PDF (`http/payroll-payslip-pdf.ts`) now call it. The PDF previously
    re-derived annual tax as `monthlyTDS × 12` and taxable income as `gross × 12 − ₹75,000`
    (hardcoded standard deduction, professional tax omitted). Now taxable income and total tax
    liability come straight from the engine, matching the screen.
  - **PT4 — prior-employer (Form 12B) income + TDS.** Confirmed no field existed (only two
    hardcoded `0`s). Added `previous_employer_income` and `previous_employer_tds` columns on
    `employees` (migration **0067**), wired the API create/update boundary (`hr.ts`), the web add/
    edit forms (`hr/page.tsx`, "Prior employer (Form 12B)" group), and the engine input
    (`payroll-run-aggregates.ts`). The rolling s.192 calc already netted prior-employer TDS; it
    was just never fed. **CA note:** Form 12B is **optional for the employee, mandatory for the
    employer once submitted**; the zero baseline (no 12B on file) stays correct — now by design,
    not by accident.
  - Fairness tests in `payroll-actual-components-and-prior-employer.test.ts` (now 8/8 green — 2 new
    HRA-ingestion cases added, see HRA below); red-before proven for PT1 (re-added shave → fail) and
    PT4 (restored hardcoded 0 → fail).
- **`d7dff03` — HRA (Aug 5) — s.10(13A) exemption wired into the payslip engine (Tier-1 over-deduction):**
  - **The defect (live money):** `computeEmployeePayslip` (the ACTIVE engine, `packages/payroll-math/
    src/payroll-cycle.ts`) read `hraExemption` off the caller-supplied `EmployeePayrollInput`, and
    **nothing populated it — always 0.** The metro-aware `computeHRAExemption` existed and was tested,
    but the payslip path never called it, and `isMetroCity` (ingested earlier) reached nothing. So every
    OLD-regime renter had their taxable income and TDS **overstated** — a real over-deduction, not a
    missing feature.
  - **The fix:** `computeEmployeePayslip` now COMPUTES the exemption (least-of-three: HRA received,
    rent − 10% of basic, 50%/40% of basic for metro/non-metro) on the same LOP-earned annualised basic/
    HRA basis as `annualCTC`, and feeds it into the tax profile. A non-zero caller-supplied
    `emp.hraExemption` still wins as an explicit override. `computeTax` applies HRA exemption **only
    under the OLD regime**, so a value here never touches new-regime tax — regime gating was already in
    the engine, not re-added.
  - **New input:** `rentPaidAnnual` on `employees` (migration **0068_easy_mongu**, one nullable-safe
    `ADD COLUMN … DEFAULT '0' NOT NULL`). Wired the API create/update boundary (`hr.ts`), the web add/
    edit forms (`hr/page.tsx`, "House rent (HRA declaration)" group), and threaded into the engine input
    as `rentPaid` (`payroll-run-aggregates.ts`, alongside the already-present `isMetro`). The on-screen
    projection (`buildTaxProfileFromEmployee` in `payroll.ts`) computes the same exemption so screen and
    run agree. **CA note:** HRA exemption is claimed through the investment-declaration process
    (provisional in April, proofs by January); metro = Delhi/Mumbai/Kolkata/Chennai **by the employee's
    residential address**, captured via `isMetroCity`.
  - Fairness tests: `packages/payroll-math/src/hra-exemption.test.ts` (4/4) drive the REAL engine end-to-
    end — OLD renter gets exemption; metro (50%) vs non-metro (40%) differ; NEW renter unaffected; no-rent
    unaffected. Red-before proven (reverted `hraExemption` to the bare `emp.hraExemption` → the two OLD
    scenarios fail `X == X`). Plus 2 DB-backed ingestion cases in the PT4 file proving `rentPaidAnnual`/
    `isMetroCity` reach the built input.
  - **Audit answer the owner asked for — the caller-supplied-but-never-populated shape:** `hraExemption`
    **and** `rentPaid` were both dead in the run path (now fixed). Still dead at **both** construction
    sites (`payroll-run-aggregates.ts` + `payroll.ts:buildTaxProfileFromEmployee`), hardcoded to 0:
    **section80C, 80D, 80CCD1B, 80TTA, 24b, otherExemptions** — there is **no employee tax-declaration
    intake table**. So the **old regime is effectively unusable in practice**: only the standard deduction
    + professional tax + (now) HRA reduce taxable income; all Chapter VI-A investment relief is silently 0,
    over-deducting every old-regime employee. Closing this is larger than the C1 election item — it needs a
    declarations intake table + UI + effective-dating (provisional vs proofs). **Recommend a new Tier-1/2
    item.**
  - **Smaller follow-up (display only):** the on-SCREEN/PDF payslip figures come from
    `computePayslipTaxFigures` (`lib/payslip-tax.ts`), which hardcodes `hraExemption: 0` because the
    `payslips` table stores no rent/exemption columns. The MONEY (stored `tds`) is now correct via the run;
    only the payslip's *displayed* taxable-income/HRA line is not yet exemption-aware. Wiring it needs the
    payslip table to persist the exemption.
- **`a7d31ee` (Aug 5) — M-05:** salary-structure **family versioning**. Effective-dated
  versions share a `family_id`; employees link to the family; payroll resolves the
  version whose `[effective_from, effective_to)` window contains the pay period.
  Migration 0065 (nullable-add → backfill-to-own-id → NOT NULL + BEFORE INSERT
  trigger). Red-before/green-after proven; full API suite green.
- **`7b2f0e6` (Aug 4) — PT3/PT5:** cap new-regime surcharge at 25%; s.87A rebate
  marginal relief.
- **`2cfed5b` / `dcc3571` (Aug 4) — C2-FIX:** Karnataka/Gujarat/Maharashtra
  professional-tax slab corrections; Gujarat PT cap reverted to statutory ₹2,500.
- **`c59cb6f` (Aug 3) — F6/F7:** decode, surface, and gate the bank-file export.
- **`67026dc` — C5:** India income-tax rates moved into effective-dated
  `statutory_ceilings` config (PF/ESI%/gratuity are an explicit follow-up).

## Next in queue

The **payroll-blocking** items that gate the end-of-August go-live (see fix-plan for
detail and scope):

- **C1** — Old vs New tax-regime (s.115BAC) election.
- **C2-STRUCT** — professional-tax structure: half-yearly levy period (Kerala/TN/
  Puducherry), gender ingestion, month-specific rates, full-population + explicit-nil,
  tier-1 exemptions.
- **C3** — ESI six-month contribution-period rule (verify first).
- **C4** — PF ₹1,800 ceiling / VPF / joint-declaration override (verify first).
- **C6** — payslip mandatory statutory fields.
- **A12-D** — LOP split-logic defect (CA correction, against shipped A12).
- **C7** — GSTR-1 structural gaps (GST-blocking); needs **A7-SCREEN** (invoice
  line-item entry) first.

Deferrable: C8 (tolerant filing-schema parsing), C9/A18 (Form 24Q → TRACES import).

## Open CA (chartered-accountant) questions — resolve before any live cycle

Two rulings are still outstanding and both block a real customer run:

1. **ECR delimiter format.** DUP-1 preserved the second engine's `#~#`-delimited ECR
   body (`india/ecr-format.ts`) verbatim, per owner decision, because the live
   engine's `generateECR` uses `|`. The two are not interchangeable, and one of them
   is wrong against the EPFO spec. Confirm the correct ECR field delimiter/format with
   the CA and reconcile the two producers onto it before filing.
2. **Revised Form 24Q with 1.5%/month interest.** Any period already filed on the
   pre-PT1 (shaved-CTC) or pre-HRA (no-exemption) TDS basis must be corrected via a
   **revised Form 24Q, with 1.5%/month interest borne by the company**. N/A on the
   test environment; it applies before the first live customer cycle.

## Standing rules (do not break)

1. **No commit without a Vultr snapshot.** A snapshot/backup must be taken before any
   commit that will be pushed. Snapshots need the owner's cloud credentials —
   **Claude cannot take them**; ask the owner to confirm one exists.
2. **Never stage `.claude/settings.local.json`** (local permission config). It is the
   one file expected to show as dirty; leave it unstaged.
3. **Run `pnpm lint` from the repo root before any merge.** It typechecks all nine
   workspaces in one pass — the same gate CI enforces. A green `apps/api` alone is
   not enough (CI also typechecks `apps/web`).
4. **Fairness check on every fix: red before, green after.** Prove the test fails
   against the old behaviour, then passes with the fix. A fix that leaves its
   bug-blessing test in place is not finished.
5. **Don't commit unless explicitly asked;** the owner is not a developer, so explain
   in plain English; never propose changes to unread code.

_After `packages/db` edits, rebuild its `dist/` before `apps/api` typechecks see them.
Test DB is `coheronconnect_test` on port 5433 (`pnpm docker:test:up`)._
