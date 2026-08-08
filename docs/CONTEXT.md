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

- **LIVE on `connect.coheron.tech` = `origin/main` = `db529c0`** — migration head
  **`0074_ambiguous_rick_jones`** — verified through the terminal **`Deploy to Vultr`
  job of CI run `31258191554`** (all five jobs green: Lint · Unit & Integration · E2E ·
  Build Docker Images · Deploy to Vultr). `db529c0` is A12-D (LOP split-logic tax
  projection); the employee bulk importer (`0c77dbd`) rode up in the same push.
- **⚠️ ORIGIN IS DELIBERATELY ONE COMMIT BEHIND LOCAL — this is NOT drift, do not
  "fix" it.** Local `main` carries one extra commit, a **docs-only exit-point refresh**
  kept local per standing rule 6 (no docs-only deploy). It rides origin with the next
  code change. So `git rev-list --left-right --count origin/main...HEAD` reads `0  1`,
  and origin records `db529c0` while local reads the exit-point commit — both describe
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

## ⚠️ THE 50% WAGE FLOOR — the largest unresolved correctness risk in payroll

**Read this first if you touch payroll.** It was raised **verbally in an earlier session
and never written into either document** — it appeared only as roadmap priority #10
("Regulatory refresh (Labour Codes Nov-2025…)") and as a migration name. Recording it now.

- **The rule.** Under the Labour Codes (Code on Wages, 2019, in force from 2025-11-21),
  "wages" must be **at least 50% of total remuneration**. If basic (the PF base) is set
  below that floor, the floor is meant to lift the PF/ESI/gratuity wage base up to it.
- **What the code does.** `salaryStructures.basicPercent` is a **free field**:
  `decimal(5,2)` default `40`, validated only `min(0).max(100)` — **no floor**
  (`packages/db/src/schema/hr.ts:106`; `payroll.ts:776/844`). PF computes on **whatever
  basic that yields** (`payroll.ts:161` → `computePF(basicPlusDA, …)`).
- **The consequence.** If the 50% floor binds, **every structure set below 50% basic
  produces an understated PF wage base for every employee on it — employee AND employer
  side — filed on every ECR/challan.** That is a wrong statutory amount, not a display
  gap, replicated across a whole structure's population.
- **Status: UNRESOLVED, pending the accountant.** There is a partial Code-on-Wages
  s.2(y) 50%-inclusion proviso in `payroll-math` (`calculateLabourCodeWageBase`, gated on
  a bonus-eligibility ceiling), but it is **not** wired to a `basicPercent` floor and it
  is unclear it fully implements the rule. Do not assume it is handled.
- **The customer input it needs** (see open questions): what is basic as a % of total for
  each pilot's salary structures? If any are below 50%, this is a correctness build before
  their first run.

**Beside it — the DA finding.** There is **no DA (dearness allowance) component** on the
salary structure at all, so PF's `basicPlusDA` basis receives **basic alone**. If any
pilot pays DA, PF is understated the same way. Also a customer question.

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
7. **ECR delimiter format** — the retired engine used `#~#`, the live `generateECR` uses
   `|`; one is wrong against the EPFO spec.
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

**The customers** (pilots):

- **Basic as a percentage of total, per salary structure** — the input the 50%
  wage-floor question turns on. If any structure is below 50%, PF is understated.
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

**CI run `31258191554` — commit `db529c0` (A12-D LOP split-logic tax projection + the
session docs; the employee bulk importer `0c77dbd` rode up in the same push) — terminal
`Deploy to Vultr` job `success` — 2026-08-08 — migration head `0074_ambiguous_rick_jones`
(no new migration).** Verified via `gh run view 31258191554 --json jobs` (all five jobs
green: Lint · Unit & Integration · E2E · Build Docker Images · Deploy to Vultr). This is
what is LIVE on `connect.coheron.tech`.

_This exit-point refresh is a docs-only commit kept LOCAL and unpushed (rule 6); it rides
origin with the next code change, so local `main` reads one commit ahead of origin —
deliberate, not drift._

_Prior validated deploys (all superseded): `9cec822` (PAN audit workflow fix) CI `31253488299`;
`2bb3bac` (PAN edit-dialog fix) CI `31237849026`; `5710dc2` (PAN at rest + null-structure)
CI `31188691203`; `d979038` (C6) CI `31162786896`; `e886a9c` (C2-STRUCT) CI `31147028089`;
`209e537` (seed reconciler) CI `31141327969`; `9960fc9` (C3 ESI) CI `31137358633`._
