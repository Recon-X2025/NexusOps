# CONTEXT — session hand-off

_Updated 2026-08-08. This file is a fresh session's ENTIRE starting picture, so
it is written to be read cold. **`reports/fix-plan.md` is the source of truth**
for per-item detail and CA rulings; this file is the map and the priorities.
Do not trust a SHA, migration head, or "done" claim here without checking it
against `git` / `gh` / `packages/db/drizzle/meta/_journal.json` and the code —
several claims in these docs have gone stale before and were only caught by
reading the code._

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

## Current stage & the calendar

**Pre-production.** India payroll/tax is the most mature area and is the go-live gate.

- **~25 August** — seven pilot customers onboard (30–80 employees each).
- **End August / early September** — the first real payroll run.
- **11 October** — first live GSTR-1 filing target.

**⚠️ First-cycle reality:** two of the three levying pilot states (**Kerala, Tamil
Nadu**) will **not** have professional tax computed by the system in the first cycle —
half-yearly PT flags rather than computes (see the wage-floor and C2-STRUCT notes).
**PT for those two states must be handled manually for the first cycle.** Karnataka
(monthly) computes normally; Delhi levies no PT.

## What is LIVE (verify, don't trust prose)

- **LIVE on `connect.coheron.tech` = `origin/main` = `3bf2bf7`** — migration head
  **`0074_ambiguous_rick_jones`** — verified through the terminal **`Deploy to Vultr`
  job of CI run `31317164831`** (all five jobs green: Lint · Unit & Integration · E2E ·
  Build Docker Images · Deploy to Vultr). `3bf2bf7` is the **payroll approval-chain
  deadlock fix** (see the "2026-08-09 (later)" section below); the docs-only `111fc16`
  rode up with it.
  _**This bullet duplicates the "Last validated deployment (exit point)" line at the very
  bottom of this file — that line is the source of truth; if the two ever disagree, trust
  the bottom and fix this one.** The top of this file drifted to a stale `3b7b83f` before
  (corrected 2026-08-09) because the SHA was copied here instead of pointed at._
- **⚠️ ORIGIN IS DELIBERATELY ONE COMMIT BEHIND LOCAL — this is NOT drift, do not
  "fix" it.** Local `main` carries one extra commit, a **docs-only exit-point refresh**
  kept local per standing rule 6 (no docs-only deploy). It rides origin with the next
  code change. So `git rev-list --left-right --count origin/main...HEAD` reads `0  1` —
  origin records `3bf2bf7`, local reads the docs-only refresh — both describe the same
  live code. A previous session nearly looped "correcting" this; it is intentional.
- **The payroll-approval fix is now LIVE (`3bf2bf7`).** The working tree may still carry
  UNCOMMITTED runtime-audit files (e.g. a Stage-Six run) plus this docs refresh — see the
  "2026-08-09 (later)" section immediately below for status.
- **Deploy mechanism:** the Vultr deploy is the **terminal job of the `ci.yml`
  pipeline on every push to `main`** (Lint → Test → E2E → Build → **Deploy to Vultr**).
  It is **not** the standalone `Deploy Vultr` workflow_dispatch (idle since 2026-07-15;
  a manual fallback only). "What is live" = the `Deploy to Vultr` JOB inside the latest
  `main` CI run: `gh run view <ci-run-id> --json jobs`. Migrations auto-apply in prod
  via the `migrator` service before `api` starts.
- **Confirm the head** from the last entry in `packages/db/drizzle/meta/_journal.json`;
  count = head-number + 1 files (`0000`…`0074`).

## 2026-08-09 (later) — payroll-approval fix SHIPPED; audit series recorded

_Per-item detail and status live in `reports/fix-plan.md`; the runtime evidence is in the
locked files under `docs/audits/` — pointed at by filename below, not copied, so this stays
a map, not a stale duplicate._

- **✅ Payroll-approval-chain deadlock — SHIPPED (`3bf2bf7`, CI `31317164831`, deployed
  2026-08-09; launch-gate).** Before the fix, **no combination of non-owner roles could
  complete the HR→Finance→CFO chain**, so step 13 and every statutory output (PF ECR, ESI
  challan, PT challan, TDS) was unreachable. `hr_manager` holds `payroll.read` not
  `financial.write`; `finance_manager` the reverse; only the owner holds both and SoD
  (correctly) forbids one identity doing two steps. **Five gate layers reconciled** — server
  `runs.list`/`get`, the route guard, the page's inline `AccessDenied`, the per-step Execute
  button (was gated on `hr.write` for *every* step incl. Finance/CFO), and the generated
  `TRPC_PROCEDURE_RBAC` map (which disabled the query client-side so it never fired). The
  approve action's own permissions and the SoD check were **not** touched. Proven live
  (finance@ completed the Finance approval through the UI) and by an integration test driving
  the full chain to `CFO_APPROVED` with three identities; full suite 1,535 tests, lint 9/9.
  Detail: `reports/fix-plan.md` (2026-08-09 PAYROLL-APPROVAL-DEADLOCK); evidence:
  `docs/audits/web-runtime-pass_stage4-chain_*`, `..._stage4-chain-corrigendum_*`, `..._stage5_*`.
- **Runtime-audit series (locked) now in `docs/audits/`:** the `/app/**` page inventory
  (`web-page-inventory_2026-08-09_run-131837.md`) and runtime passes stages 1–5
  (`web-runtime-pass_stage1..stage5_2026-08-09_*.md`). Each is immutable; read them by
  filename. Findings that change THIS document's picture are folded into `reports/fix-plan.md`
  (2026-08-09) and summarised there — notably: **duplicate PAN is accepted** (OPEN, statutory);
  **an employee whose salary structure is not yet effective is dropped from a run silently**
  (headcount 12→11, no error naming who — OPEN); **step-13 statutory outputs have never been
  reached at runtime**; the **static page-map was wrong about the employee form** (it *does*
  collect state/regime/PAN — corrected); the **wage-base clamp and PF ceiling compute correctly
  on product data** (add-back to exactly half; cap at ₹15,000) but the **above-50% case has
  still never run** (no employee on such a structure has been in a payroll run).

## What shipped THIS session, in order (each is deployed)

Full per-item detail is in `reports/fix-plan.md` under the dated sections named below.

1. **C3 — ESI six-month contribution-period rule** (`9960fc9`, mig `0073`). CA-ruled,
   **ASYMMETRIC**: ENTRY assessed every month (a non-member joins the month wages fall
   to/under ₹21,000); EXIT only at a boundary (1 Apr / 1 Oct, member retained on actual
   uncapped gross). The first build wrongly assumed symmetry — corrected. Membership
   state persisted on `employees`. ("C3 correction (2026-08-06)".)
2. **Startup seed reconciler** (`209e537`, no migration). Closes the 4130/4140 COA
   drift: COA is copied per-org from a growing array, so old orgs missed later accounts.
   A boot-time, insert-only, never-throws reconciler brings every org to the current
   COA. COA was the ONLY seed with this shape. ("SEED-DRIFT (2026-08-07)".)
3. **C2-STRUCT half-yearly PT** (`e886a9c`, no migration). Kerala added, Tamil Nadu
   converted to half-yearly; **full-period-or-flag guard** — assess the WHOLE six-month
   income or FLAG (never a partial-period amount). Two flag causes: DATA (missing
   migration history) and TIMING (unelapsed period tail). Also corrected seven stale doc
   claims. ("C2-STRUCT half-yearly PT (2026-08-07)".)
4. **C6 — payslip mandatory statutory fields** (`d979038`, mig `0074`). A shared
   payslip-view builder feeds both the PDF and the on-screen breakdown. **Headline
   defect fixed: both renderers hardcoded ESI to ₹0 while the printed TOTAL included it**,
   so every ≤₹21,000 employee's itemised deductions didn't sum to their own total. Tenant
   identity (TAN/EPF/CIN + new ESI establishment number, mig `0074`), paid/LOP days, and
   ESI IP number now render from stored values. ("C6 … (2026-08-08)".)
5. **Employee PAN encrypted at rest + null-structure warning** (`5710dc2`, no migration).
   `hr.employees.create`/`update` stored PAN in plaintext (census: 9/9 on dev); now a
   shared `panColumnsTolerant` encrypts on create/update/importVendors. Separately, an
   employee with **no salary structure was silently dropped from payroll** (inner join +
   `continue`) — now flagged per-employee. ("PAN-at-rest… (2026-08-08)".)
6. **PAN ciphertext / format fixes + read-only prod audit** (`2bb3bac`, then workflow fix
   `9cec822`, no migration). A **DESTRUCTIVE** bug: `hr.employees.list` returned the raw
   `v2:` ciphertext, which pre-filled the edit dialog; Save re-encrypted it →
   **double-encryption → original PAN unrecoverable**. Fixed in four layers (envelope
   guard inside `panColumnsTolerant`; list/get return `pan: null` + masked display;
   write-only masked dialog; server+client PAN format validation). Ships a **read-only
   production audit** (`workflow_dispatch`: "PAN Encryption Check (prod, read-only)").
   ("PAN ciphertext… (2026-08-08)".)
7. **Employee bulk importer** (`ingest.importEmployees`, commit `0c77dbd`, no migration).
   Tolerant CSV import (skip-and-report per row, dry-run DEFAULT), PAN encrypted, salary
   structure resolved by NAME (reject on not-found/ambiguous), automation hooks suppressed,
   EMP-NNNN hardened to an atomic delete-proof allocator shared across all three runtime
   sites. Found + fixed two defects: a fourth `count(*)+1` EMP allocator in
   `hr.onboarding.createOnboarding`, and a `panColumnsTolerant` encryption-failure that
   escaped the per-row handler and aborted the whole batch. ("Employee bulk importer +
   A12-D … (2026-08-08)".)
8. **A12-D — LOP split-logic tax projection** (`packages/payroll-math`, no migration).
   Replaces A12's `earned*12` (which projected one unpaid month across the whole year) with
   a blend: current month on actual earned pay, every other FY month on contracted pay.
   Non-LOP byte-identical. Known blind spot: past months estimated at contracted because
   PR5 zeroes real YTD. ("Employee bulk importer + A12-D … (2026-08-08)".)
9. **taxRegime required column on bulk import** (`3d416c7`, no migration). A file with no
   taxRegime column is refused outright; a blank cell in a present column is a named row skip —
   neither reaches the DB's `"new"` default, so a missing spreadsheet header can no longer
   silently elect the regime for a workforce. `hr.employees.create` unchanged. Closes
   TAX-REGIME-DEFAULT. ("TAX-REGIME-DEFAULT closed … (2026-08-08)".)
10. **Dead-link sweep + route-integrity guard** (frontend only, no migration). Fixed/removed a
   set of dead controls and links (path typos over real routes, 4 workflow-run links to a
   route with no bare page, never-built detail links made non-interactive, handler-less buttons
   removed). **Headline:** nothing verified internal links resolved — a new static guard
   (`apps/web/src/lib/__tests__/route-integrity.test.ts`) now walks the source and fails the
   build on any `/app/...` link with no matching `page.tsx`. ("Dead controls & links … (2026-08-08)".)

## ⚠️ THE 50% PF WAGE BASE — THE MANDATE (statutory requirement; engine clamp SHIPPED in this commit)

**This is a STATUTORY REQUIREMENT, not a product decision.** It has never appeared in any
project document — which is why the engine was built against a different reading. Record it as
the mandate against which the engine is measured.

_**Check the `file:line` references in this section — do not trust them.** They were first written
against a tree carrying uncommitted changes and have **already drifted once** (the
`payroll-run-aggregates.ts` numbers shifted when the leaver block landed above them). They were
re-verified and corrected against THIS commit's tree, but re-check each one rather than rely on it._

**THE MANDATE.** The statutory wage base for provident fund is **EXACTLY fifty per cent of total
remuneration — a fixed figure, not a floor.**
- The client chooses the **composition**: **basic alone, or basic plus dearness allowance.** If DA
  is elected at 10%, basic drops to 40% and the two sum to 50%. If no DA, basic is 50%. **If the
  elected components exceed 50% of total, they come DOWN to 50%.**
- **PF computes on fifty per cent regardless of composition.**

**WHAT THE ENGINE USED TO DO (wrong, in the UPWARD direction — CLAMP SHIPPED IN THIS COMMIT).** The
engine implemented a **one-directional FLOOR, not a fixed 50%.** `calculateLabourCodeWageBase` (the
function now begins at `statutory-deductions.ts:812`; the base line is `:825`) **USED TO** compute
`addBack = max(0, exclusions − totalRemuneration/2)`, `statutoryWageBase = core + addBack` — that
pre-clamp `core + addBack` expression is **no longer in the file** (it is quoted here as history). The
`max(0, …)` meant it **only ever added**. A structure whose core (basic) was **above** half of total
got `addBack = 0` and **passed through unclamped**, so PF over-contributed. There was **no downward
clamp** anywhere on the path (`payroll-cycle.ts:322-324` → `computeMonthlyStatutory` `:345` →
`computePF` `statutory-deductions.ts:723`); the only limit was the ceiling `min(basicPlusDA, 15000)`
(`:225-227`).
- **Verified case** — total ₹20,000, basic ₹12,000 (60%), HRA ₹4,000, special ₹4,000: the pre-clamp
  engine produced a base of **₹12,000 where the mandate requires ₹10,000** → **employee PF ₹1,440 vs
  ₹1,200**, **employer ₹1,560 vs ₹1,300** (EPF+EPS+EDLI+admin). Masked above the ₹15,000 ceiling, so it
  bit only **below ~₹30,000 total** (both readings clamp to the ceiling above it).
- **FIX SHIPPED AND LIVE** (commit `62b0349`, CI run `31298132260`, terminal `Deploy to Vultr` job
  `success`, 2026-08-09). The base line now reads
  `statutoryWageBase = Math.round(Math.min(core + addBack, halfOfTotal))` (`statutory-deductions.ts:825`):
  the add-back lifts a below-half core UP to the half, the `min` clamps an above-half core DOWN to it, so
  the base lands on **exactly half either way**. Covered by
  `apps/api/src/__tests__/labour-code-wage-base.test.ts` (the (12,000, 8,000) → 10,000 case + all five PF
  figures).

**THE EXCLUSION SET (corrected — it is wider than earlier notes said).** The bucket is a **hardcoded
seven-term sum** at `payroll-cycle.ts:314-321` — **HRA, special allowance, LTA, overtime, arrears,
bonus, other earnings** — and the **core is `basicEarned` alone**. It is an **arithmetic expression,
not configuration**: changing it is a **code change**. `calculateLabourCodeWageBase` receives two
scalars (`core`, `exclusions`) and **knows nothing** of which components went into either.
- The run **zero-feeds** four of the seven terms — overtime, arrears, bonus, other-earnings
  (`payroll-run-aggregates.ts:259-262`). The other three are **structure-fed**: HRA and special allowance
  always, and **LTA whenever the structure sets `ltaAnnual`** (`ltaEarned = round(ltaAnnual/12 ×
  lopFactor)`, `payroll-cycle.ts:267`, summed into the bucket at `:317`). So in a real run the bucket is
  **HRA + special allowance, plus LTA when `ltaAnnual` is set** — not "HRA + special allowance only."
  Special allowance is the **residual** `max(0, ctc/12 − basic − hra)` (`payroll-run-aggregates.ts:198`)
  and reaches the bucket as **ONE lumped figure** — a genuine expense reimbursement and the balancing
  residual are **indistinguishable** to the engine.
- **One base feeds FIVE contributions** — PF employee, PF employer (EPF), EPS, EDLI, and admin charges
  all derive from it (`statutory-deductions.ts:224-236`). A wrong base is **five wrong numbers**, not one.

**Still true and load-bearing (keep):**
- **Wired, and on for every org.** The base does reach the actual contribution (not a display field),
  gated by `labourCodesInForce` (`payroll-cycle.ts:296`), which resolves from the `bonus_eligibility_ceiling`
  seeded by migration `0054` as a **platform default (`org_id NULL`, ₹21,000, effective 2025-11-21)** —
  every org inherits it, no per-org seeding (dev: one `org_id NULL` row, 0 org-scoped). So the wrong
  reading **was live for every 2026 pay period below the ceiling** until this commit's clamp
  (`62b0349`, deployed 2026-08-09) — now corrected in production.
- **No floor/cap on the `basicPercent` field itself.** Default `40`, validation only `min(0).max(100)`,
  **no DB CHECK** (`hr.ts:106`; `payroll.ts:776/844`). A client can configure a non-compliant structure,
  see it on a payslip, and never be told (see WAGE-CFG in the Deferred register).
- **No DA component exists**, so the basic-plus-DA composition the mandate allows **cannot be expressed**
  today (see WAGE-DA). `basicPlusDA` receives basic alone.
- **Open for the CA:** confirm the exclusion-set membership against s.2(y) clauses (a)–(k) (special
  allowance and arrears are in the bucket today; the statute lists HRA but not special allowance, and
  treats arrears as deferred wages), and whether the ₹15,000 ceiling applies BEFORE or AFTER the base is
  resolved (engine applies it after). Full detail in `reports/fix-plan.md` → "50% PF wage base — the mandate".

## ✅ PAN — the production audit RAN and came back CLEAN (backfill unnecessary)

The production PAN audit **has run** — CI run `31253488299`'s workflow reported **1 row
with a PAN, 0 plaintext, 1 correctly encrypted, 0 double-encrypted, 0 undecryptable.**
Production is clean; **no PAN was destroyed** by the edit-dialog double-encryption bug.

- **The PAN backfill is UNNECESSARY, not deferred — do not build it.** Production holds
  **no plaintext PAN**, so there is nothing to convert. The backfill was scoped from a
  **dev-database census** (9/9 plaintext on dev) that did not reflect production history.
- The read-only audit workflow ("PAN Encryption Check (prod, read-only)") remains available
  for re-running if PAN writes are ever in doubt.

## The next items, in order (agreed)

_(The former #1 "run the PAN audit" and #2 "PAN backfill" are DONE / dropped — see above.
The employee bulk importer and A12-D shipped 2026-08-08.)_

1. **Professional-tax relief basis under s.16(iii)** — the deduction path for PT in the
   income-tax computation (distinct from computing PT itself).
2. **C1 — old-vs-new regime election + its Chapter VI-A declaration intake** — the next
   large payroll-blocking build. Its declaration-intake (with provenance: provisional /
   proven / lapsed + the Feb→Mar catch-up) is the larger half; shipping the election
   without it is actively harmful. **Note:** `hr.employees.create` and the bulk importer
   both currently omit the prior-employer / rent declaration figures precisely because they
   have no provenance status — C1 is where that intake belongs. See "Two records
   (2026-08-05)".

## Two read-only-sweep findings (2026-08-08) — #1 CLOSED (importer), #2 OPEN

Both surfaced by a read-only sweep and verified in code. Full detail + `file:line` in
`reports/fix-plan.md` under "Read-only sweep findings (2026-08-08)".

1. **TAX-REGIME-DEFAULT — CLOSED for the importer (`3d416c7`), residual on the add-employee path.**
   `taxRegime` column is `notNull().default("new")` (`hr.ts:186`). In the importer a **blank cell
   and an absent column were indistinguishable** (both → `undefined` → DB `"new"`), so a CSV with no
   regime column silently elected NEW for a whole workforce. **Fixed:** the importer now refuses a
   file with no taxRegime column and makes a blank cell a named row skip — neither reaches the
   default. **⚠️ RESIDUAL (open, by decision): `hr.employees.create` still lets `taxRegime` default
   silently to `"new"`** (a form choice is treated as a choice). `isMetroCity` (default `false`) and
   `gender` (NULL→male PT set) default the same way but **err toward over-deduction** (safe).
2. **INERT-ALLOWANCES — three configurable fields the compute ignores.** `bonusAnnual`,
   `medicalAllowanceAnnual`, `conveyanceAllowanceAnnual` are declared (`hr.ts:109-111`),
   written by the salary-structure router, and editable in the payroll UI — and **read nowhere
   in the compute path**; the payslip hardcodes medical/conveyance to `"0"`
   (`payroll.ts:489-490`). **Severity hinges on an ambiguity:** within a CTC framing the money
   is preserved in gross and merely **mislabelled** (special allowance is the residual
   `ctc/12 − basic − hra`, `payroll-run-aggregates.ts:173`). **But `ltaAnnual` — a field
   beside these three in the same UI — is ADDITIVE on top of CTC** (`payroll-cycle.ts:267`),
   so an admin reading the four fields consistently would **underpay** every employee by the
   monthly value of the other three. Which behaviour was intended is a product question. Also:
   the **Payment of Bonus Act path (`payroll-cycle.ts:302`) is unreachable** — `bonus` is
   always fed `0` (`payroll-run-aggregates.ts:236`), so the eligibility gate runs but is inert.

## ⚠️ The onboarding wizard — what a fresh session most needs to know

Nobody on the team could describe it; mapped read-only 2026-08-08. Full detail in `reports/fix-plan.md`
→ "Onboarding wizard — what it actually does".

- **"Onboarding" names THREE unconnected things:** the **tenant setup wizard** (`/app/onboarding-wizard`),
  **employee creation** in HR, and a **document-collection case** (`hr.onboarding.createOnboarding`).
- **The wizard sets up the COMPANY and creates NO employees.** A customer who finishes it has an
  **empty, unpayable workforce, and nothing tells them.** It isn't mandatory and never blocks the app;
  `completeWizard` validates nothing.
- **THE SEVEN-ITEM GAP between "wizard complete" and "can run a correct payroll":** add employees ·
  assign each a salary structure · set each state · set each tax regime · set each PAN · create the
  salary structures themselves · set the ESI establishment number. **None appears on the post-wizard
  checklist**, which instead suggests logging a ticket and raising an invoice.
- **⚠️ THE LABELLED TRAP:** the **"Onboarding process"** button creates an **ACTIVE employee with no
  state, no salary structure, no tax regime, no PAN** (`hr.ts:1112-1121`). It was built to collect
  documents; it sits beside "Add Employee". An admin adding a new hire **will press it**. The record it
  makes is either **dropped from payroll or throws and blocks the run**.
- **Three employee-creation paths, unequal:** importer (strongest — regime + structure required) ·
  `hr.employees.create` (middle — regime still defaults silently) · onboarding case (weakest — nothing
  required).
- **The `fresh-org-pilot.test.ts` proves signup seeds accounts + dashboards don't fabricate numbers.
  It runs no wizard, creates no employee, runs no payroll.** A pass says nothing about whether
  onboarding works.
- **Form 16 reads employer TAN/PAN from an `org.settings` JSON blob that nothing populates**, while the
  wizard writes them to `organizations.tan`/`.pan`. Correct entry, still prints a dash (HR-preview only).
- **Required wizard fields that reach no filing:** `primaryStateCode` (GST uses the registry copy) and
  the **EPF establishment code** (reaches only the payslip; its ECR consumer is dead code).
- **Step 6 advances to Done even when the finance seeding errors.**
- **Import preview truncation (recorded, not built):** the bulk-import preview shows only the **first
  10 of up to 200 rows**, so errors scattered through a large file can't all be seen before committing.
  A **downloadable rejection report** (every skipped row + reason) is what a customer would want.

## ⚠️ Document storage — the "no file upload" claim is FALSE (correction)

"No file upload anywhere in the product" has been in every QA kit since v1.0 and is **wrong** — the
**3rd documentation defect found today in the dangerous direction** (after the wage-floor and PAN-audit
claims). Full detail in `reports/fix-plan.md` → "Document & storage sweep (2026-08-08)".

- **~6 surfaces genuinely store bytes** (DMS `documents.upload`, Form 16, payslip PDF, avatar,
  procurement PO doc, e-sign key) via a real S3 service + `documents` schema (versions/ACLs) + virus-scan
  + retention workers. **BUT ALL SIX FAIL IN PRODUCTION:** the deployed stack composes
  `docker-compose.vultr-test.yml`, which ships **no object-storage backend**. `docker-compose.prod.yml`
  defines MinIO and is referenced by nothing — an orphan.
- **~14 more present a document capability that stores NOTHING even in a working env.** The two worst
  (same "reports doing something it didn't" class as the ESI payslip / PAN ciphertext): the **Employee
  Documents "Download" button is a toast with no file**, and the **HR onboarding upload keeps the
  filename and discards the bytes** — a success state, nothing stored.
- **FIVE statutory retention obligations have NO field at all:** rent receipts + landlord PAN (>₹1L),
  Form 12B, Chapter VI-A proofs, Form 10-IA + armed-forces PT evidence, EPFO Para 26(6). The engine
  grants the relief and holds no evidence.
- **Good news:** no local-disk fallback, so uploads **fail cleanly rather than being silently lost.**
- **A Vultr Object Storage bucket has been provisioned (Standard, Bangalore) and is deliberately NOT yet
  wired into prod** — the backend now exists; the remaining work is pointing prod `S3_*` at it and adding
  the storage service to the deployed compose.

## Roadmap: ONBOARD-DOC — pre-account joining-document portal (post-go-live)

Decisions already taken (detail in `reports/fix-plan.md` → "ONBOARD-DOC"):
- A portal where a **new recruit uploads joining documents BEFORE they have an account**, scoped across
  HR TA / HR BP / hiring manager / employee.
- **Stored:** mark sheets (10/12/grad), **prior two employers' offer letters + last 3 months' payslips**
  (these ARE Form 12B in substance — the prior-employer income the engine takes as bare numbers today),
  relieving/appraisal letters, resume, photo, internship certs.
- **Identity is VERIFIED, NOT STORED — DECIDED.** Aadhaar/PAN sighted in person by HR, who records that
  they verified and when. No scan, no provider, no OTP. **Do not build an identity-document upload slot.**
- A candidate info sheet collects what the importer makes HR type (name **as per Aadhaar** — must match
  PAN for TDS to reconcile — DOB, gender, PAN, permanent address, joining date, emergency contact).
- **Net-new plumbing:** no authenticated-external path for a non-user exists; the portal is read-only;
  the tokenised pattern exists for DATA (survey/invite links) but carries no bytes and no multipart parser
  is registered.

## Payroll run — employment-status widening + ECR verification (2026-08-09)

**Shipped this pass (no migration, no frontend):** the payroll run now selects
`PAYROLL_EMPLOYED_STATUSES = {active, probation, on_leave}` instead of `active` only, in all
three selects (`payroll-run-aggregates.ts` payment join + structure-less flag; `payroll.ts`
payslip-write). Previously a `probation`/`on_leave` employee got no payslip, no total and no
flag — silently unpaid. An `on_leave` employee is now PAID like active: the status is
employment; whether the leave is paid/unpaid is an attendance-driven LOP computation, separate
from status. The structure-less flag message now names **every** missing field (structure AND
state), not just the structure, so following it can't produce a payable row with no state and a
defaulted regime.

- **This is correct-forward, not a live fix.** `employees.status` has **no product-reachable
  path** to `probation`/`on_leave`: create/importer/createOnboarding all write `"active"`,
  offboarding writes `"offboarded"`, and the edit form has no status field. Only the SMB
  analytics seed (`seed-smb-analytics.ts:182`) writes those values. So no pilot employee is
  currently exposed; the widening makes the run robust for when a status-change feature lands.
- **Status is the wrong question long-term.** Employment across a period is a DATE question;
  `employees` has `startDate`/`confirmationDate`/`endDate` and the run consults NONE of them.
  The proper fix is date-range selection (which also settles the leaver gap below).

**⚠️ LEAVER GAP — OPEN, payroll-blocking.** There is **no full-and-final / settlement salary
path** anywhere (only gratuity settlement, which is separate). A `resigned`/`terminated`/
`offboarded` employee simply stops being selected — **no final payslip for days worked**. The
Code on Wages requires settlement within **two working days** of exit. Deferred here by
decision (the fix wants the date-range model + a pro-rata policy); must be closed before a
pilot has a mid-month leaver.

**ECR verification (2026-08-08) — the delimiter was never the defect; these are.** Deferred by
decision (the first EPFO PF return is due the **15th of the month after the first run**), but
recorded so they are not lost. In the LIVE `#~#` path (`formatECRFile`, fed by `hr.ts` +
`india-compliance.ts`):
  - **Member name** emits `emp.employeeId` (the EMP-NNNN code), not the person's name.
  - **Field 9 (EPF-EPS difference)** emits `slip.pfEmployer` (the FULL employer PF), not the
    3.67% employer-EPF-minus-EPS difference.
  - **NCP days** is hardcoded `0` while `lopDays` sits on the same payslip row.
  - The **header** carries a fabricated establishment id (`EPFO_${org.id...}`) while the real
    `organizations.epfCode` is ignored.
  - **No pre-generation validation** of the three EPFO reject invariants (EPF ≤ gross,
    EPS ≤ EPF, EDLI = EPF capped ₹15,000).
See open-question 7 above (delimiter is CORRECT `#~#`; the `|` generator is dead — do not
repoint at it) and the fix-plan dated section for the full trace.

## Every open question, split by who answers it

**The chartered accountant** (unreachable for a stretch; this list has grown — resolve
before the relevant live cycle):

1. **H2 professional-tax collection rule.** The CA's stated Oct–Mar collection window
   (Jan **or** Feb) precedes the March period end, so H2 cannot be assessed on the full
   six-month income at collection time. Worked example (Tamil Nadu, ₹12,000/mo): six
   months = ₹72,000 → ₹1,025 band, but five months = ₹60,000 → ₹690 band. The engine
   currently FLAGS H2 rather than under-collect. Reconcile (collect in March? assess on
   income-to-date?).
2. **H1 Aug-vs-Sep collection month** (default Sep = period end; Aug would flag).
3. **Current-year income-tax figures** — the confirmed slabs/rebate/surcharge are verified
   for FY 2025-26; confirm nothing changed for **FY 2026-27** (our run year).
4. **Kerala annual PT ceiling** (encoded as `0` = unverified sentinel).
5. **Karnataka annual PT ceiling** (₹2,400 vs ₹2,500 — do not derive from the rate).
6. **Mid-period PT joiner AND leaver treatment** (joiners currently flag alongside
   migration gaps — loud-over-wrong, refinement deferred).
7. **ECR delimiter format — CORRECTED 2026-08-08 (this earlier note was WRONG).** The old
   text said "the live `generateECR` uses `|`". Verified against the code: the LIVE path is
   `formatECRFile` (`apps/api/src/lib/india/ecr-format.ts`) and emits **`#~#`, which is
   correct** — it is what `hr.payroll.generateECR` and `india-compliance.filing.submit` send.
   The `|`-delimited `generateECR` in `packages/payroll-math/src/payroll-cycle.ts` is **DEAD**
   — reachable only from `india-payroll-engine.test.ts:617`. **Do NOT repoint the live path at
   the `|` generator: that would replace a working delimiter with a wrong one.** The delimiter
   was never the defect (see the ECR-verification findings below).
8. **PF arrears month-mapping in the ECR** — EPFO rejects arrears lumped into one basic-
   wage field; they must map to originating months.
9. **Revised Form 24Q with 1.5%/month interest** — periods already filed on a pre-PT1 /
   pre-HRA TDS basis need correcting, interest borne by the company.
10. **LWF cycles for Karnataka, Kerala, Tamil Nadu** — the engine assumes KA=annual,
    KL/TN=half-yearly; confirm against each state's actual calendar.
11. **DA for HRA salary** — see the wage-floor section; whether DA must be representable.
12. **Address granularity (B17)** — does a statutory payslip need the full registered
    address, or do city/state suffice? (No full-address column exists; city/state render.)
13. **Half-yearly PT payslip note** — should a Kerala/TN payslip carry a "levied
    half-yearly, collected in <month>" note on the ₹0 months?
14. **Which of the five statutory DOCUMENT-RETENTION obligations must the employer actually hold?**
    (from the document sweep — Layer 3): rent receipts + landlord PAN (>₹1L), Form 12B, Chapter VI-A
    proofs, Form 10-IA + armed-forces PT evidence, EPFO Para 26(6). The engine grants each relief with
    no evidence on file; the CA should say which are legally required to be retained (drives ONBOARD-DOC).

15. **The 50% PF wage base — see "THE 50% PF WAGE BASE — THE MANDATE" above (authoritative).** The
    mandate is **exactly 50% of total, a fixed figure** — the engine's one-directional floor
    **over-contributes** when basic exceeds half (verified case: base ₹12,000 vs ₹10,000). For the CA:
    confirm the **exclusion-set membership** against s.2(y) (a)–(k) — special allowance and arrears are
    in the bucket today; the statute lists HRA but not special allowance, and treats arrears as deferred
    wages — and whether the **₹15,000 ceiling applies before or after** the base is resolved (engine:
    after). Fix (downward clamp) is IN PROGRESS in the build tree.

**The customers** (pilots):

- **Basic as a percentage of total, per salary structure** — needed to spot a
  non-compliant structure (the `basicPercent` field itself has no floor) and to sanity-
  check the wage-floor add-back with the CA. **Note: the PF *base* is already lifted at
  compute time for sub-50% basics** (see "THE 50% WAGE FLOOR" above), so this is a
  compliance/CA check, **not** a "PF is understated" fix — the old framing was wrong.
- **Whether anyone receives DA** — if yes, a PF-basis correctness build.
- **Whether anyone holds a VPF election or a Para 26(6) joint declaration** — neither has
  an ingestion path today (C4).

## Two infrastructure items

1. **Vultr automatic backups are deliberately OFF during testing (a decision, not a gap).**
   The cost outweighs the value of test data; they will be **enabled per instance at
   deployment**. Two recovery paths exist meanwhile: the **manual snapshot** (taken by hand
   before each commit) and **redeploy from the last green build**. The residual gap is
   **granularity between snapshots**, not absence of backup. **Trigger to revisit: the first
   customer's data landing**, not a calendar date. (It remains a **settings checkbox**, not
   a build.)
2. **⚠️ The dev DB is ~14 migrations behind head** (~`0060` vs `0074`). This means a
   future migration touching anything **added or altered after 0060 cannot be honestly
   validated against a copy of the dev DB** — the copy would lack the objects the
   migration edits. **Bring the dev DB to head before the next migration.** (Migration
   `0074` was validatable only because it was a bare `ADD COLUMN` on a table that exists
   at 0060.) Dev DB is on port **5434**; test DB `coheronconnect_test` on port **5433**.

## Payroll-model scoping (recorded, NOT built — see fix-plan 2026-08-06)

A coherent redesign of how structures, CTC and location relate, none of it blocking:
- **CTC → employee; structures become percentage templates** (add `employees.ctcAnnual`;
  move `ltaAnnual`; `medical/conveyance/bonus` annual amounts are captured, read by nothing).
- **Preview path skips the version resolver** (`payroll-run-aggregates.ts` joins the origin
  version directly) — fix in the same pass.
- **Location cluster** (city dropdown → metro-from-city → HRA % by city) is **gated on
  capturing residential city**: `city` is empty for every employee; the populated work
  city lives in `location`. Metro (s.10(13A)) is by residence, so this can't be built
  correctly until residence is captured. Real cost is data collection, not derivation.
- **`hraPercentOfBasic` splits into metro + non-metro columns**; the backfill sets both to
  the existing value so nobody's pay changes on deploy — a pay decision, not a default.

## The five ratchets — all Done and green (Phase 1 complete)

| # | What it guards | Turned green by |
|---|----------------|-----------------|
| R-1 | All tenant tables sit behind the RLS wall | A11 (migration 0061) |
| R-2 | Custom-role permissions stay in the five-verb vocabulary | A6 |
| R-3 | DPDP notices are only recorded as sent if truly sent | A3 / A4 |
| R-4 | Money read-then-write can't double-count (concurrency lock) | A2 |
| R-5 | Audit-log hash chain can't be tail-truncated silently | B5 head-anchor |

## The audit & sweep system + where reports live

- **`.claude/skills/qa-map`** — run once before auditing (inventories subsystems, drafts
  `docs/quality-bar.md`, builds the checklist). **`qa-audit`** — deep audit of one
  subsystem against the quality bar, in plain English (the owner is not a developer).
- **`reports/fix-plan.md`** — THE source of truth (three-phase plan, status table,
  per-item dated sections, CA rulings). **The status table has drifted from its own
  detail sections twice** — it is edited separately, so when in doubt trust the detail
  section and re-check the code. `reports/audit-*.md` (per-subsystem), `sweep-*.md`,
  `triage.md`, `audit-summary.md` (the five root causes).

## Standing rules (do not break)

1. **No commit without a Vultr snapshot.** Snapshots need the owner's cloud credentials —
   **Claude cannot take them**; ask the owner to confirm one exists and WAIT.
2. **Never stage `.claude/settings.local.json`** — the one file expected to show dirty.
3. **Run `pnpm lint` from the repo root before any merge** — typechecks all nine
   workspaces (the CI gate). A green `apps/api` alone is not enough (CI also typechecks
   `apps/web`, which reads the api's BUILT tRPC types — rebuild api dist if router types move).
4. **Fairness check on every fix: red before, green after.** A fix that leaves its
   bug-blessing test in place is not finished.
5. **Check the GitHub Actions tab is clear before pushing** (concurrent runs cancel each
   other), and **don't commit unless explicitly asked.** Explain in plain English; never
   propose changes to unread code.
6. **Update this doc WITH a code change, never on its own.** Fold the `CONTEXT.md` update
   into the shipping code commit — do NOT push a docs-only deploy. The **exit-point line
   at the very bottom records the last VALIDATED deployment** (the `main` CI run id +
   commit with its terminal `Deploy to Vultr` JOB confirmed `success`), refreshed as a
   local commit that rides the next code change (hence origin sits one behind — see "What
   is LIVE").

_After `packages/db` edits, rebuild its `dist/` before `apps/api` typechecks see them.
Test DB is `coheronconnect_test` on port 5433 (`pnpm docker:test:up`)._

---

## Last validated deployment (exit point)

**CI run `31317164831` — commit `3bf2bf7` (payroll approval-chain deadlock fix: the
HR→Finance→CFO chain — previously uncompletable by any non-owner role, so every statutory
output was unreachable — reconciled across five gate layers, with the approve action's own
permissions and the SoD check untouched; the docs-only `111fc16` rode up with it) — terminal
`Deploy to Vultr` job `success` — 2026-08-09 — migration head `0074_ambiguous_rick_jones`
(no new migration).** Verified via `gh run view 31317164831 --json jobs` (all five jobs green:
Lint & Type Check · Unit & Integration Tests · E2E (Playwright) · Build Docker Images ·
Deploy to Vultr). This is what is LIVE on `connect.coheron.tech`.

_This exit-point refresh is a docs-only commit kept LOCAL and unpushed (rule 6); it rides
origin with the next code change, so local `main` reads one commit ahead of origin —
deliberate, not drift._

_Prior validated deploys (all superseded): `62b0349` (three statutory fixes: 50% PF wage-base
clamp; leaver flag; resilient payslip write) CI `31298132260`; `cbed818` (pay probation &
on_leave; incomplete-row flag) CI `31295210801`; `3b7b83f` (dead-link repairs + route-integrity
guard) CI `31268782618`; `7a76624` (doc corrections + taxRegime column) CI `31265258768`;
`db529c0` (A12-D + importer) CI `31258191554`._

_Prior validated deploys (all superseded): `3b7b83f` (dead-link repairs + route-integrity
guard) CI `31268782618`; `7a76624` (doc corrections + taxRegime column) CI
`31265258768`; `db529c0` (A12-D + importer) CI `31258191554`;
`9cec822` (PAN audit workflow fix) CI `31253488299`; `2bb3bac` (PAN edit-dialog fix) CI
`31237849026`; `5710dc2` (PAN at rest + null-structure) CI `31188691203`; `d979038` (C6)
CI `31162786896`; `e886a9c` (C2-STRUCT) CI `31147028089`; `209e537` (seed reconciler) CI
`31141327969`; `9960fc9` (C3 ESI) CI `31137358633`._
