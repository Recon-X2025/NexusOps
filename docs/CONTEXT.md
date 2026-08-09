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

- **LIVE on `connect.coheron.tech` = `origin/main` = `3b7b83f`** — migration head
  **`0074_ambiguous_rick_jones`** — verified through the terminal **`Deploy to Vultr`
  job of CI run `31268782618`** (all five jobs green: Lint · Unit & Integration · E2E ·
  Build Docker Images · Deploy to Vultr). `3b7b83f` is the frontend dead-link repairs +
  the route-integrity guard (now enforced in CI's test job).
- **⚠️ ORIGIN IS DELIBERATELY ONE COMMIT BEHIND LOCAL — this is NOT drift, do not
  "fix" it.** Local `main` carries one extra commit, a **docs-only exit-point refresh**
  kept local per standing rule 6 (no docs-only deploy). It rides origin with the next
  code change. So `git rev-list --left-right --count origin/main...HEAD` reads `0  1`,
  and origin records `7a76624` while local reads the exit-point commit — both describe
  the same live code. A previous session nearly looped "correcting" this; it is intentional.
- **Deploy mechanism:** the Vultr deploy is the **terminal job of the `ci.yml`
  pipeline on every push to `main`** (Lint → Test → E2E → Build → **Deploy to Vultr**).
  It is **not** the standalone `Deploy Vultr` workflow_dispatch (idle since 2026-07-15;
  a manual fallback only). "What is live" = the `Deploy to Vultr` JOB inside the latest
  `main` CI run: `gh run view <ci-run-id> --json jobs`. Migrations auto-apply in prod
  via the `migrator` service before `api` starts.
- **Confirm the head** from the last entry in `packages/db/drizzle/meta/_journal.json`;
  count = head-number + 1 files (`0000`…`0074`).

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

## ✅ THE 50% WAGE FLOOR — IMPLEMENTED AND WIRED (correction, 2026-08-08)

**⚠️ CORRECTION — the previous warning here was WRONG and was corrected 2026-08-08.**
Through 2026-08-08 this section carried, as "the largest unresolved correctness risk,"
that the 50% wage floor was **NOT wired** and that PF was therefore understated for every
employee on a sub-50%-basic structure. **That was wrong, in the direction where acting on
it does harm** — a reader could rebuild or double-apply a floor that already exists. A
read-only verification against the code established the truth below. If you saw the old
text, this is why it changed.

- **The rule.** Code on Wages, 2019 s.2(y) (Labour Codes, in force from 2025-11-21): if the
  s.2(y)-excluded allowances (HRA, special, LTA, overtime, bonus, …) exceed **half of total
  remuneration**, the excess is deemed wages and **added back**, lifting an artificially low
  basic toward a 50%-of-total floor for the PF/ESI/bonus base.
- **It IS implemented and wired to the CONTRIBUTION — not a display field. Do not rebuild
  it.** `calculateLabourCodeWageBase(basicEarned, excludedAllowances)` is called in the live
  payslip path at `payroll-cycle.ts:322-324`; the lifted `wageBase` flows through
  `computeMonthlyStatutory` (`payroll-cycle.ts:345`) straight into `computePF(basicPlusDA,…)`
  at `statutory-deductions.ts:723`, where it drives `employeePF = round(pfWageBase × 0.12)`
  (`:229`) and the employer legs. Those numbers persist to `payslips.pf_*` and reach the ECR.
- **The arithmetic is the s.2(y) mechanic verbatim** (`statutory-deductions.ts:803-824`):
  `addBack = max(0, exclusions − totalRemuneration/2)`, `statutoryWageBase = core + addBack`.
  When basic sits below 50% of total this resolves to **exactly total/2**; when exclusions
  ≤ 50%, `addBack = 0` and a conventional salary is untouched.
- **It is on for every org, automatically.** The gate is `labourCodesInForce`
  (`payroll-cycle.ts:296` — true iff a `bonus_eligibility_ceiling` resolves). Migration
  `0054` seeds that ceiling as a **platform default (`org_id NULL`, ₹21,000, effective
  2025-11-21)**, which the resolver (`statutory-ceilings.ts:74-142`) applies to every tenant;
  a newly created org inherits it with **no per-org seeding**. Dev DB confirms: one row,
  `org_id NULL`, **0 orgs with their own row** — all covered. For any 2026 pay period the
  floor is live.
- **⚠️ THE NUANCE THE OLD WARNING MISSED — the affected population is narrow.** PF caps at
  `min(basicPlusDA, 15000)` (`statutory-deductions.ts:227`). So the add-back changes the
  contribution **only for employees whose basic falls below ₹15,000** — roughly **CTC under
  ~₹37,500/month**. Above that, raw and lifted basic both clamp to the ₹15,000 ceiling and PF
  is **identical either way**. The old "every employee on a sub-50% structure" claim was,
  even in principle, bounded by that ceiling.

**What genuinely remains open (narrower than the old claim, and different from it):**
- **No floor on the `basicPercent` field itself.** Default `40`, validation only
  `min(0).max(100)`, **no DB CHECK constraint** (`hr.ts:106`; `payroll.ts:776/844`; verified
  against `pg_constraint`). The compute-time add-back corrects the PF *base*; it does **not**
  stop a non-compliant structure being configured or shown on a payslip.
- **No DA component.** `basicPlusDA` receives **basic alone** — there is no dearness-allowance
  field on the salary structure. If a pilot pays DA it is representable nowhere.
- **CA sign-off + a NEW ordering question.** The accountant has **not** confirmed the mechanic
  fully implements the rule. A second question is now open: **should the ₹15,000 PF ceiling
  apply BEFORE or AFTER the add-back?** The engine currently applies it **after**
  (`min(core + addBack, 15000)`). Confirm with the CA.

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

_Sharpened by today (see the wage-floor section, which is authoritative for these two): does the
add-back implement s.2(y), and should the ₹15,000 PF ceiling apply BEFORE or AFTER the add-back?_

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

**CI run `31268782618` — commit `3b7b83f` (frontend dead-link repairs + a static
route-integrity guard that fails the build on any unresolvable internal `/app/...` link,
now enforced in CI's test job; the local-only exit-point commit `8af9250` rode up in the
same push) — terminal `Deploy to Vultr` job `success` — 2026-08-08 — migration head
`0074_ambiguous_rick_jones` (no new migration).** Verified via `gh run view 31268782618
--json jobs` (all five jobs green: Lint · Unit & Integration · E2E · Build Docker Images ·
Deploy to Vultr). This is what is LIVE on `connect.coheron.tech`.

_This exit-point refresh is a docs-only commit kept LOCAL and unpushed (rule 6); it rides
origin with the next code change, so local `main` reads one commit ahead of origin —
deliberate, not drift._

_Prior validated deploys (all superseded): `7a76624` (doc corrections + taxRegime column) CI
`31265258768`; `db529c0` (A12-D + importer) CI `31258191554`;
`9cec822` (PAN audit workflow fix) CI `31253488299`; `2bb3bac` (PAN edit-dialog fix) CI
`31237849026`; `5710dc2` (PAN at rest + null-structure) CI `31188691203`; `d979038` (C6)
CI `31162786896`; `e886a9c` (C2-STRUCT) CI `31147028089`; `209e537` (seed reconciler) CI
`31141327969`; `9960fc9` (C3 ESI) CI `31137358633`._
