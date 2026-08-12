# CLAUDE.md

Guidance for Claude (and other AI agents) working in this repository.

## Project

**CoheronConnect** (repo: NexusOps) — a multi-tenant Enterprise Operations Platform.
Production: `connect.coheron.tech`. Remote: `github.com/Recon-X2025/NexusOps.git`.

Monorepo managed with **pnpm@10.33.0 + Turborepo** (`turbo ^2.0.0`), Node `>=20`.

- `apps/web` — Next.js **16** (webpack) + React 19 frontend (port 3000)
- `apps/api` — Fastify 5 + tRPC 11 backend (the bulk of business logic + tests); **tsup → `dist/`** (port 3001)
- `apps/worker` — Temporal 1.11 background workflows (task queue `coheronconnect-workflow`)
- `apps/mac` — Next.js 15 **super-admin / platform-monitoring console** (port 3004)
- `apps/mobile` (RN + Expo), `apps/docs` (Nextra, port 3003) — secondary surfaces
- `packages/db` — Drizzle ORM schema + migrations (PostgreSQL); **built with tsup to `dist/`**
- `packages/payroll-math` — pure India payroll/tax/GST money-math (tsup → `dist/`; used by `db` + `api`)
- `packages/types`, `packages/validators`, `packages/ui`, `packages/metrics`, `packages/config`, `packages/cli`

> For an end-to-end current-state map (apps, routers, HTTP surfaces, automation loops, DB, defects),
> see **`BUILD.md`**.

## Critical build/test facts

- **Before every merge, run `pnpm lint:cold` from the repo root** (= `turbo run lint --force`).
  This is the single pre-merge gate: it typechecks **every** workspace (api, web, mac, worker, and the
  packages) in one command, so it catches the same class of failure CI's "Lint & Type Check"
  job does. **Use `lint:cold`, NOT plain `pnpm lint`, for the gate:** `turbo run lint` is cache-aware, so
  a warm `.turbo` returns a full cache hit (~60ms) that runs no typecheck at all — "cold 9/9" only means
  something when the cache is bypassed. (`--force` also guards against a stale cache masking a real failure.) CI typechecks **both** `apps/api` **and** `apps/web` (`cd apps/web && npx tsc
  --noEmit`) — a green `apps/api` typecheck alone is **not** sufficient and will let a web
  type error through to CI, where it blocks Build+Deploy (both gated behind lint passing).
  The full CI pipeline is: Lint & Type Check → Unit & Integration Tests (`pnpm test`) →
  E2E Playwright → Build Docker Images (main only) → Deploy to Vultr (main only).
- **`packages/db` is consumed via its compiled `dist/`.** After editing schema/types in `packages/db`, run `pnpm --filter @coheronconnect/db build` before `apps/api` typechecks will see the changes.
- **Tests run against a real Postgres** (Docker), not mocks. The test DB is `coheronconnect_test` on **port 5433**.
  - Start it: `pnpm docker:test:up`
  - Run the API suite directly: from `apps/api`,
    `DATABASE_URL="postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test" npx vitest run`
  - `pnpm test` runs `turbo run test`; gate tests live in `apps/api/src/__tests__/`.
- **vitest config** (`apps/api/vitest.config.ts`): `fileParallelism: false`, `pool: 'forks'`, `singleFork: true`, shared DB. Tests must be self-isolating (seed a fresh org per test/suite, clean up after) to avoid cross-test pollution.
- **Coverage**: `@vitest/coverage-v8` version must match the installed `vitest` minor exactly (currently `2.1.9`). Coverage output (incl. `coverage/coverage-summary.json`) is gitignored.

## Database / migrations (Drizzle)

- FK `onDelete` rule policy (enforced repo-wide):
  - `orgId → organizations` = **CASCADE**
  - child → parent = **CASCADE**
  - nullable actor reference = **SET NULL**
  - NOT NULL actor reference = **RESTRICT**
  - lookup / reference table = **RESTRICT**
- Drizzle diffs against **its own snapshot**, not the live DB. If a prior migration silently failed, drizzle cannot self-heal — you must hand-write a corrective migration + add the journal entry + create the snapshot.
- Migration journal gate: `pnpm check:migrations` (`scripts/verify-migration-journal.mjs`) only checks each `.sql` has a matching tag in `_journal.json`; **no hash check**.
- Generate: `pnpm db:generate` (in `packages/db`). Apply: `pnpm db:migrate`.
- Always validate new migrations against a throwaway copy of a real DB, not just typechecking. See `docs/DATA_MODEL.md` for the data-model reference (tenancy classes + FK ownership).
- **Migration head — source of truth is the last entry in
  `packages/db/drizzle/meta/_journal.json`** (and the highest-numbered `.sql` in
  `packages/db/drizzle/`). Do not trust a head number hardcoded in prose here or in any
  doc; check the journal. The count is `head-number + 1` files (`0000`…`NNNN`).
  What the notable migrations do (stable regardless of the current head):
  `0031_workable_spot` (team's super-admin / org-profile expansion) + `0032` (consolidated
  `mfa_enrollments`, `vulnerability_sla_events` + vuln SLA columns, `dpdp_notification_artifacts`
  + DPDP regime/erasure columns) landed on branch `merge/team-super-admin`. Migs `0041`–`0052`
  are the G1–G17 India-market gap-closure run (CRM lossless-convert/scoring/CPQ-tax, OKR rollup,
  SAM recon, expiry alerts, EPFO/NIC/MCA21 portal push, RoPA, KMS envelope encryption, and `0052`
  Postgres RLS). Migs `0053`–`0055` add shift_schedules (`0053`), Labour-Codes-2025
  statutory-ceiling schema + platform-default seed (`0054`, self-contained schema+seed), and ESI
  challan records + `statutory_return_status` (`0055`). Migs `0056`–`0059` add ESI employee/employer
  amount columns on `payroll_runs`/`payslips` (`0056`), an `invoices.gstin_id` FK into
  `gstin_registry` (`0057`), `roles.is_archived` (`0058`), and `sla_definitions`
  display/category/metric/schedule fields (`0059`). `0060_pretty_junta` adds
  `organizations.dpdp_contact_email` (the tenant DPDP-notice target, fix A3/A4); `0061_walled_challans`
  extends the RLS wall (`FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy) to `shift_schedules`,
  `esi_challan_records`, `pt_challan_records` — the three tenant tables added after `0052` that the
  wall had missed (fix A11). Migs `0062`–`0074` (the current run): `0062` audit-chain WORM anchors
  (`audit_chain_anchors` table + `audit_chain_status` type, R-5 — the +1 that took base tables 236→237),
  `0063` payslip YTD columns (`ytd_net` etc.), `0064` `statutory_metric_key` type + `statutory_ceilings`
  income-tax config (C5), `0065` `salary_structures.family_id` (structure versioning), `0066` `gender`
  type + `employees.gender`/`esi_ip_number` (C2/C6), `0067` `employees.previous_employer_income/tds`
  (PT4/P-15), `0068` `employees.rent_paid_annual` (HRA), `0069` `organizations.annual_aggregate_turnover`
  (C7-1 AATO), `0070` `organizations.b2cl_threshold` (C7-2), `0071` `invoices.original_invoice_id`
  (C7-3 credit/debit-note FK), `0072` `invoices.is_financial_note` (C7-3 part 5), `0073`
  `employees.esi_member`/`esi_member_period_start` (C3 six-month rule), `0074`
  `organizations.esi_establishment_number` (C6 payslip identity). `0075_clever_sleepwalker` adds the
  `professional_tax_slabs` table (data-driven PT: 36 states seeded, provenance + levies fact, RLS-walled)
  — the +1 that took base tables 237→238. `0076_lean_puppet_master` persists the PF wage base +
  employer EPS/EPF split on `payslips`, adds `organizations.pt_registration_number`, and a unique index
  on `tds_challan_records(org,month,year)` — columns + index only, no new table. The current run
  `0077`–`0079` makes the India wage config expressible: `0077_mean_wong` (`employees.voluntary_pf_rate`,
  `payslips.da`, `salary_structures.da_percent`), `0078_slimy_nocturne` (`organizations.pf_contribution_rate`
  + the four `employees.para266_*` fields), `0079_peaceful_caretaker` (`pf_reduced_rate_reason` enum type +
  `organizations.pf_reduced_rate_reason`) — additive columns and one enum, no new table. **Live head is
  `0079`; base tables 238.**
  **`0052` is
  hand-written:** it provisions the non-privileged `app_runtime` role + `FORCE ROW LEVEL SECURITY` +
  `tenant_isolation` policies on all tenant tables (RLS only enforces because the request path drops
  to `app_runtime` via `SET LOCAL ROLE` — the app DB user is a superuser/BYPASSRLS and would otherwise
  bypass it). See `apps/api/src/lib/trpc.ts` (`rlsTenant` middleware) + `docs/GAP_ANALYSIS.md`.
- `packages/db` carries a `mongodb ^6.12` dependency for the **hybrid/mongo `DATABASE_PROVIDER` mode**
  (`postgres | hybrid | mongo`, resolved in `packages/db/src/database-provider.ts`). No schema module
  references it, but it is **not dead code** — `packages/db/src/mongo-client.ts` is wired into `apps/api`:
  startup connects when `providerRequiresMongo(dbProvider)` (`apps/api/src/index.ts:186-191`), shutdown
  calls `closeMongo()` (`index.ts:735-742`), and `middleware/auth.ts` threads `mongoDb` into the request
  context (`getMongoDb`/`isMongoReady`). Dormant under the default `postgres` provider (no `MONGODB_URI`),
  so the connect paths no-op — but removing it breaks the API build. Do **not** strip it.

## Demo data seed

The 100-employee / 24-month `coheron-demo` company seed has been **removed**. The
generator (`packages/db/src/seed-demo.ts`) and its `db:seed:company` / `db:seed:demo`
scripts no longer exist; the demo company must not be re-introduced. The base seeds
(`db:seed`, `db:seed:modules`, `db:seed:smb`) remain.

## Money paths (verify invariants when touching these)

- **Journal entries**: `accounting.journal.create` — debits must equal credits (tolerance 0.001), enforced in `apps/api/src/routers/accounting.ts`.
- **Payroll**: `computeEmployeePayslip()` in `apps/api/src/lib/payroll-cycle.ts` — `netPay = max(0, grossEarnings − totalDeductions)`.
- **GST**: `computeGST()` in `apps/api/src/lib/india/gst-engine.ts` — intra-state = CGST+SGST (50/50), inter-state = IGST.
- **TDS / income tax**: `computeTax()` in `apps/api/src/lib/india-tax-engine.ts`.
- **3-way match**: `apps/api/src/lib/invoice-po-match.ts` — invoice ≈ PO ≈ GRN within tolerance.

## Standing decisions — India payroll

- **PF composition, VPF, and Para 26(6) are CONFIGURATION, not customer questions** (decided
  2026-08-10). Do **not** treat any of them as a fact to gather from a customer before building —
  they are inputs the product must support. Specifically:
  - **Wage composition (Basic alone vs Basic+DA):** a **DA component must exist** so a customer
    electing Basic+DA can express it; PF/ESI/gratuity/leave-encashment bases then read Basic+DA.
    (SHIPPED 2026-08-11 as WAGE-DA / C4: the DA component exists and those bases read Basic+DA — see
    the Base Pay composition decision below.)
  - **Voluntary PF (VPF, above 12%):** a per-employee input added on top of the 12%, employee side
    only, capped so 12%+VPF ≤ 100% of the wage base; the employer never matches it.
  - **Para 26(6) (contribution on the uncapped base above ₹15,000):** computes on the uncapped base
    **only where an EPFO approval reference is recorded** — no reference, no uncapping.
  This retires the old "three customer questions" gating: C4 and WAGE-DA are **builds**, not
  gated-on-a-customer-letter items (see `reports/fix-plan.md` → C4-CONFIG-DECISION).

- **Base Pay composition + LTA (decided 2026-08-11; full reasoning in `docs/COMPONENT_BASE_MATRIX.md`).**
  The salary-structure `CTC` field holds **gross, not cost-to-company**, and is relabelled **Base Pay**
  (label only; the column/identifier stays `ctc`). Nine decisions, all built in the Base Pay unit:
  1. **Basic % + DA % = 50** — DA is the input, Basic is derived `50 − DA` (read-only), enforced in the
     **server validator**, not only the form.
  2. **Every named component (Basic, DA, HRA, LTA) sits INSIDE Base Pay** and is carved out of the
     special-allowance residual; **only bonus sits on top**. Special allowance is the balancing figure.
  3. **LTA is carved from the residual** (was additive, inflating gross); gross stays Base Pay/12.
  4. **Bonus is two objects** — a target tagged at offer time + a discretionary year-end payout — neither
     a recurring structure component; the Bonus field is off the structure form (column kept) and returns
     with the variable-pay / offer-letter build. Bonus enters **taxable income only** (a future code change).
  5. **Medical & Conveyance removed** from the form (columns kept) — inert (read nowhere; payslip hardcodes 0).
  6. **Gratuity and leave-encashment bases are Basic + DA** — both previously omitted DA (the DA-consumer
     class; `payroll-run-aggregates` already handles DA correctly).
  7. **LTA tax** — three separate premises, held apart (do not merge):
     - **Owner ruling (standing decision):** new regime — no exemption, no declaration shown; old regime —
       exclude on declaration until claimed, and if unclaimed **include and tax in March**.
     - **CA ruling (recorded, but about investment declarations — NOT LTA):** provisional declaration in
       April, physical proofs by January; if proofs are not submitted, zero the declared values and spread
       the resulting extra tax over **February and March**. The CA has said nothing about LTA; that LTA
       follows this same mechanism is our inference, not the CA's word.
     - **Open (CA letter B8(c), unsent):** whether LTA follows the declaration mechanism at all, and whether
       the exemption is capped at actual eligible travel cost and limited to two journeys in a four-year block.
     `computeTax` already taxes LTA fully, so no first-cycle under-deduction regardless.
  8. **True CTC / the offer letter is deferred** (post-go-live) — Base Pay stays gross for the pilot;
     retirals (employer PF, EDLI, admin, gratuity) are added only in the later offer-letter build.
  9. **No bulk import for salary structures** (STRUCTURE-BULK) — hand-created during onboarding week; a
     throughput risk, not a correctness one.

## Common commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev (all) | `pnpm dev` |
| Build all | `pnpm build` |
| Lint | `pnpm lint` |
| Full test suite | `pnpm test` |
| E2E (Playwright) | `pnpm test:e2e` |
| Test DB up / down / reset | `pnpm docker:test:up` / `:down` / `:reset` |
| Migration journal check | `pnpm check:migrations` |
| DB generate / migrate / studio | `pnpm db:generate` / `db:migrate` / `db:studio` |

## Deploy

- **The primary deploy is automatic and rides CI — a push to `main` deploys.** `ci.yml`
  on a `main` push runs Lint → Test → E2E → **Build** (`build` needs `[lint, test, e2e]`;
  publishes GHCR images web+api tagged `latest` / `main` / 7-char SHA) → **`Deploy to
  Vultr`** (the terminal `deploy` job, `needs: [build]`, runs `scripts/push-to-vultr.sh`;
  auto-skips if `VULTR_HOST` / `VULTR_SSH_PRIVATE_KEY` are absent). **"What is live" = the
  `Deploy to Vultr` JOB inside the latest `main` CI run** (`gh run view <ci-run-id> --json
  jobs`) — *not* CI "success" alone, and *not* the standalone workflow below.
- **`deploy-vultr.yml` is a separate MANUAL `workflow_dispatch` fallback** (also rsync +
  `scripts/push-to-vultr.sh`), idle since 2026-07-15. Do **not** read the live deploy
  state off it — the automatic CI `deploy` job is the real route. (Mistaking the two led
  a session to wrongly conclude "not deployed since Jul 15"; it was, via CI.)
- Migrations auto-apply on the deployed Vultr stack **via the api container itself** — its image `CMD` is
  `node dist/migrate.mjs && node dist/index.mjs` (`apps/api/Dockerfile:62`), so drizzle-orm's programmatic
  `migrate()` (`apps/api/src/migrate.ts`, folder `packages/db/drizzle`) applies pending migrations **before**
  the server starts, and the `&&` stops the server booting if a migration fails. **The Vultr deploy uses
  `docker-compose.vultr-test.yml` + `docker-compose.vultr.images.yml`, NOT `docker-compose.prod.yml`** —
  `prod.yml` defines a separate `migrator` service (`node -e require('./dist/migrate.js')` +
  `service_completed_successfully`), but that compose file is **not** the live path, so do not read it as a
  description of production (same trap as the orphaned MinIO definition).
- **Deploy reliability (cause established 2026-08-12).** The "Postgres unhealthy after `compose down`/`up`"
  deploy failures — three occurrences, plus a host-unreachable incident and a mid-layer `pull` failure that were
  recorded separately — were **one cause: the root filesystem filled** because Docker images from every past
  deploy were never pruned (the old `docker image prune -f` is dangling-only and never removes tagged images).
  A full disk means Postgres can't write → can't answer `pg_isready` → never goes healthy; login writes to disk
  too, which is why a valid root login and `ssh-keyscan` were also refused. The deploy now: (1) recreates only
  the app tier, leaving Postgres/Redis/Meilisearch running (`vultr-remote-deploy.sh` Change B); (2) **pre-flight
  prunes** old images when free space on the docker device drops below 10GB and **retention-prunes**
  (`-af --until=168h`, a week kept for rollback) after a confirmed-good deploy (Changes D/E); (3) **caps
  container logs** (`docker-compose.vultr-test.yml` per-service `logging:`, 250MB each, Postgres 500MB). Every
  deploy writes `df` to `/var/log/coheron/` so free space is never invisible again (the Vultr graphs have **no
  disk-space panel**). Full detail: `reports/fix-plan.md` → `OUTAGE-2026-08-10` (CLOSED) + `PRUNE-PREFLIGHT`.
- **Always take a backup/snapshot before deploying.** Snapshots and deploy triggers require the user's cloud credentials — Claude cannot perform them. Because a `main` push auto-deploys, **treat pushing `main` as a deploy trigger** (get the user's go + snapshot first).

## Conventions & guardrails

- Make only the changes requested; avoid over-engineering, premature abstraction, and unrequested refactors.
- Read files before editing; never propose changes to unread code.
- NEVER state that a file is committed, that a commit exists, or that a change is deployed without verifying it first. Run `git log`, `git status` or `git show` and quote the actual output. A commit hash you have not read is a fabrication. This applies to every claim about repository state. If you have not checked it in this session, say so rather than asserting it. This extends the "read before you claim" rule from comments and documents to the repository itself.
- Don't commit unless explicitly asked. Prefer staging specific files over `git add -A`.
- Never commit secrets (`.env*`, credentials). Coverage artifacts are gitignored.
- zsh quirks observed here: multi-line SQL piped through commands breaks; `cd` with unquoted paths can error "too many arguments"; `!` triggers history expansion in `node -e`. Workaround: write a temp `.cjs` file and quote paths.
- **Operational — the dev DB is not auto-migrated.** A fresh local session must confirm the dev
  database is at the journal head (`packages/db/drizzle/meta/_journal.json`) and run `pnpm db:migrate`
  if not. Nothing brings a local DB to head and nothing checks; it was found **14 migrations behind**
  on 2026-08-09 (login 500'd on a missing column). Prod is safe — the deployed api container self-migrates
  on boot (`node dist/migrate.mjs` before the server; see the Deploy section). (Closed item; see
  `reports/fix-plan.md` "DEV-DB-14-BEHIND".)

### Operating rules for investigation & recording (learned 2026-08-09)

These govern how findings are established and written down. They exist because a whole build pass was
spent on a defect **no product path can trigger** — its severity was *asserted* from reasoning about how
Indian employers hire (new hires sit on probation → would go unpaid) rather than *established* from the
code, where no path writes that status (see `reports/fix-plan.md` "CORRECTION OF RECORD — reachability
before severity").

- **Trace a finding to cause before recording it as a fault.** An artefact of a cause you have already
  identified is not a new finding — fold it into the one it belongs to. (Multiple such near-misses on
  2026-08-09 were caught only by tracing first.)
- **Establish reachability before severity, and severity before priority.** A defect no code path can
  produce is not the top of the board, however plausible the real-world story.
- **Nothing enters a prompt as a premise unless it was read in code, cited with `file:line`.** Otherwise
  it is a question, not framing.
- **A finding updates its own item; it does not restart the queue.**
- **Verify everything; do not triage by apparent importance** — importance is an output of verification,
  not an input to it.
- **Where a claim was not verified, say so** rather than filling the gap.

## Gap analysis (where the product actually stands)

> **Accuracy note (current branch `merge/team-super-admin`):** several items the audits below
> flagged as gaps have since **shipped and are wired/running** — verify against `BUILD.md` before
> treating any line here as an open to-do. Specifically:
> - **Tamper-evident audit log — DONE.** Hash chain (`seq`/`prevHash`/`entryHash`) is implemented in
>   `packages/db/src/schema/auth.ts:285-318`, verified via `verifyAuditChain`. (Was gap priority #9.)
> - **CVSS→SLA + vulnerability escalation — DONE.** `vulnerabilities.slaBreached`/`escalationLevel` +
>   `vulnerabilitySlaEvents` + the `coheronconnect-vuln-sla` BullMQ loop (`workflows/vulnerabilitySlaWorkflow.ts`).
> - **DPDP automation — PARTIAL, no longer "near-blank".** Temporal `dpdpSweepWorkflow` runs on a schedule
>   (default 1h) and POSTs to `/internal/dpdp/sweep` (consent expiry / breach / DSR dispatch).
> - **ITSM loops (on-call escalation, event correlation), workflow-trigger + outbound webhook dispatcher —
>   WIRED** as BullMQ sweeps (see `BUILD.md §4`).
> - **Super-admin / platform-monitoring role — SHIPPED** (`apps/mac` + `/api/super-admin/*` + `superAdminAuditLogs`);
>   the "Latest session state" note below saying it doesn't exist yet is superseded.
> Still genuinely open per the audits: balance sheet, depreciation engine, gratuity/leave accrual,
> SAM reconciliation, lead scoring/lossless conversion, SMS delivery. (Note: the old "GSTR-1 18%
> hardcode" is NOT a rate hardcode — `accounting.ts:744-797` groups by the real per-line rate with a
> header-derived fallback; the residual is that the per-line path reads `invoiceLineItems`, which has
> no production write path, so real invoices take the header fallback. See `docs/quality-bar.md` #10.)

**The authoritative, living gap tracker is `docs/GAP_ANALYSIS.md`** — its shipped/gap claims were
last verified at an earlier migration head and may need re-verification (for the live head read
`packages/db/drizzle/meta/_journal.json`). It lists what's shipped (REAL) vs the
open gaps (PARTIAL/STUB/MISSING) with `file:line` evidence, India go-live sequencing, and an
owner/target column to fill in. **Update it in place as items ship.**

The older dated audits that fed it are retained for decision-history only in `docs/archive/`:
the 2026-07-03 platform gap set (`PLATFORM_GAP_*_2026-07-03.md` + GRC/Legal companions), the
2026-06-30 competitive analysis (`COMPETITIVE_GAP_ANALYSIS_2026-06-30.md`), and the vendor
benchmarks (HubSpot/ServiceNow/Workday/Microsoft/Reliance/Amazon). Non-technical DOCX exports
live in `docs-word/` (generated by `scripts/gen-gap-docx.py`).

**The one thing to remember:** the data models are right; the **computation and the
automation loops** are what's missing. You can almost always *store* the right thing
but frequently can't *compute the intelligence* on it (depreciation, balance sheet,
lead/health score, SAM reconciliation) or *close the loop* (triggers never fire,
outbound webhooks never dispatch, escalation timers never run). Cross-cluster average
maturity **≈ 50/100**. India payroll/tax is the standout (production-grade, ~80%);
**DPDP privacy is the largest regulatory hole** (near-blank).

Cluster maturity (2026-07-03): People ~68 · Platform ~60 · ITSM ~55 · Governance ~55 ·
GRC ~55 · CRM ~45 · Finance ~42 · IT Asset ~42 · Legal ~40.

Recurring anti-patterns to hunt for: (1) correct schema, missing computation;
(2) stored-but-never-evaluated enums/config; (3) open loops (capture without
consequence); (4) mock/placeholder in the last mile (MCA21 filing, procurement accrual
to placeholder account UUIDs); (5) lossy transitions (lead→deal drops account/contact);
(6) records without reflexes (DSR clocks, breach notice, approval SLAs).

**Top cross-cluster priorities** (regulatory/financial risk × build leverage):
1. DPDP consent + DSR + breach automation (biggest India-first exposure).
2. Workflow trigger layer + outbound webhook dispatcher (closes the automation loop).
3. Balance sheet + fix the GSTR-1 18% rate hardcoding + real accrual accounts.
4. Gratuity + leave accrual/carry-forward (the two statutory payroll holes).
5. Depreciation engine (unblocks book value *and* the finance balance sheet).
6. SAM installed-vs-entitled reconciliation (M365 true-up audit risk).
7. Fire the ITSM loops (event correlation, on-call escalation, deploy→incident MTTR).
8. Lead scoring + lossless conversion + CPQ tax/GST.
9. Tamper-evident audit log (hash chain / WORM).
10. Regulatory refresh (Labour Codes Nov-2025, new Income Tax Act Apr-2026).

Cheap wins first: GSTR-1 rate fix, asset↔contract linking, CMDB cycle detection,
expiry alerting, remove DocuSign stub, tamper-evident audit, OKR cascade, CVSS→SLA.
Effort estimate: regulatory + financial floor (defensible ~65) ≈ 11–16 eng-weeks;
whole platform to category-competitive across all 9 audits ≈ 40–58 eng-weeks.

## Roadmap reference

The authoritative roadmaps are now **three verified, market-split docs** (each grounded
in a `file:line` code audit at an earlier migration head — see each doc's own
"Verification basis" line; for the live head read `packages/db/drizzle/meta/_journal.json`):
- **`docs/INDIA_ROADMAP.md`** — India go-live + the 5 security items (DPDP, Vuln-SLA,
  MFA, KMS, RLS). Consolidates the old India/security/GA plans.
- **`docs/US_ROADMAP.md`** — US market (country/regime model, US COA, QuickBooks, CCPA).
- **`docs/AI_ROADMAP.md`** — common AI maturity stages (Records→Understanding→
  Recommendation→Execution→Autonomous) + composite-scoring/weightage decisions.

The old plans (`PRODUCTION_READINESS_PLAN_2026-04-26.md`,
`SECURITY_COMPLIANCE_ROADMAP_2026-07-13.md`, `INDIA_GOLIVE_*_2026-07-13.md`,
`US_MARKET_BUILD_PLAN_2026-07-12.md`) are **superseded** and moved to `docs/archive/`
(retained for decision-history only). The April plan's WS-1…WS-6 / Phase 0–6 framing
below is historical; treat the three roadmaps above as current.

Phases 0–3 are complete:
- Phase 0–2 — foundations, data model, FK `onDelete` policy (`docs/DATA_MODEL.md`) ✅
- **Phase 3 (automated tests / "hire inspectors") — complete** ✅
  - Stage A — coverage baseline + tooling ✅
  - Stage B — deletion-cascade FK behavior tests ✅ (`apps/api/src/__tests__/deletion-cascade.test.ts`)
  - Stage C — money-path invariant tests ✅ (`apps/api/src/__tests__/money-invariants.test.ts`)
  - Stage D — critical-path E2E hardening + flake audit ✅
  - Stage E — coverage-floor gate + `docs/TESTING.md` ✅

**Phase 4 (feature completion) is next** — close the WS-1…WS-5 gaps identified in
the 2026-06-29 build-state audit (see plan §13). Phase 5 = durability/depth,
Phase 6 = GA hardening.

## Latest session state

_Snapshot — dated content below. For the live migration head always read
`packages/db/drizzle/meta/_journal.json`, and for the live branch/HEAD run `git status`;
do not trust a commit SHA or head number quoted here._

**The live deploy SHA / CI run / migration head are deliberately NOT recorded here** — this block
twice carried a stale SHA, which is exactly why per-commit state does not belong in CLAUDE.md. Read
each at its source, never from a value quoted in this file:
- **What is live** — the "Last validated deployment (exit point)" line in `docs/CONTEXT.md` (the
  terminal `Deploy to Vultr` job of the latest `main` CI run: `gh run view <id> --json jobs`).
- **Migration head** — the last entry in `packages/db/drizzle/meta/_journal.json`.
- **Branch / HEAD / ahead-behind** — `git status` / `git rev-list --left-right --count origin/main...HEAD`.
- **Per-item done/pending/blocked, dated shipped records, and incidents** — `reports/fix-plan.md`.
- **Recent work + its evidence** (payroll-readiness, data-driven PT, the statutory-filing loop, the Base Pay
  composition unit, and the deploy-reliability work — the **2026-08-10 outage is CLOSED**, cause established
  12 Aug as a full root filesystem from un-pruned Docker images, fixed by the DEPLOY-HARDENING + PRUNE-PREFLIGHT
  units; first unattended first-attempt deploy followed) — the dated sections of `docs/CONTEXT.md` and
  `reports/fix-plan.md`.

A deploy-state refresh is a docs-only LOCAL commit kept unpushed (rule 6); it rides the next code
change, so local `main` can read one commit ahead of origin (deliberate, not drift).

> **Structural note on this block (anti-drift).** The SHAs, migration head, and "238 base tables" above
> are a **snapshot to verify, not a source of truth** — this file drifted to a stale live SHA more than
> once (e.g. `docs/CONTEXT.md`'s top LIVE line held `3b7b83f` while origin was `62b0349`, 2026-08-09).
> **Per-commit state should not be copied into CLAUDE.md at all.** It belongs at the source: the live
> deploy in `docs/CONTEXT.md`'s "Last validated deployment (exit point)" line, the migration head in
> `packages/db/drizzle/meta/_journal.json`, branch/HEAD in `git`, and runtime findings in `docs/audits/`.
> Treat everything in "Latest session state" as needing re-verification; over time it should shrink to a
> pointer. Conventions and the operating rules above, by contrast, do not go stale and belong here.

Shipped 2026-08-09 (each deployed): **probation/on_leave** payroll run-selection fix + incomplete-row
flag correction (`cbed818`, CI `31295210801`); then **three independent statutory fixes** (`62b0349`,
CI `31298132260`) — the **50% PF wage-base downward clamp** (was a one-directional floor; a Basic-heavy
core above half now clamps down to exactly half), a **per-employee leaver flag** (unpaid leavers named,
not silently dropped), and **payslip-write resilience** (one structure-without-state employee no longer
aborts the whole transaction — it is skipped, named, and everyone else is written).

Shipped 2026-08-08 (each deployed; full per-item detail in `reports/fix-plan.md`): **C6** payslip
mandatory statutory fields (`d979038`, mig `0074`; fixed the ESI-hardcoded-₹0 reconciliation defect,
tenant identity now renders); **PAN** encrypted-at-rest (`5710dc2`) + a **destructive edit-dialog
double-encryption fix** (`2bb3bac`) + a read-only prod audit that **ran CLEAN** (0 plaintext, 0
double-encrypted — **PAN backfill is UNNECESSARY, do not build it**); **employee bulk importer**
(`0c77dbd`, `ingest.importEmployees`) with an atomic delete-proof EMP-NNNN allocator shared across all
three creation sites; **A12-D** LOP split-logic tax projection (`db529c0`); **taxRegime required column
on import** (`3d416c7`, closes TAX-REGIME-DEFAULT for the importer; `hr.employees.create` still defaults
silently, by decision); **dead-link sweep + route-integrity guard** (`3b7b83f`); and **doc corrections**
(`7a76624`) — the **50% wage floor IS wired** (the old "not wired" warning was wrong) and the PAN-audit
reconciliation. `apps/mobile` remains **parked**.

Read-only sweeps this run recorded (NOT built): **INERT-ALLOWANCES** (three salary-structure allowance
columns read nowhere; possible underpayment vs the additive `ltaAnnual`), the **onboarding-wizard map**
(the wizard creates no employees; a seven-item gap to a correct payroll; the "Onboarding process"
labelled trap), and the **document/storage sweep** — "no file upload anywhere" is **FALSE** (a real S3
service + `documents` schema + ~6 wired paths exist), but the deployed stack (`docker-compose.vultr-test.yml`)
ships **no object-storage backend**, so uploads fail in prod; a Vultr bucket is provisioned but not yet
wired. **Scope reclassified 2026-08-12: this gap is document-ATTACHMENT only, NOT payroll output.** The
payslip PDF is **render-on-the-fly** (`http/payroll-payslip-pdf.ts` builds it from the stored payslip row +
shared view and streams it — no storage), so **the first cycle can hand employees payslips regardless.** What
still needs storage is file *attachments* (employee documents, onboarding uploads) — whose fake controls are
now disabled honestly (SURFACES → DOC-FACADE). See `docs/CONTEXT.md` + `reports/fix-plan.md` for detail.

Older history (2026-08-02 and before, retained for decision-history):
Prior snapshot: `main` was in sync with `origin/main` @ **`2baaa25`** (migration head
`0059_volatile_midnight`). CI + Vultr deploy were **green** for that HEAD.
- **MFA confirmEnroll fixed and shipped (`f365314` + `2baaa25`).** Root cause was in
  `appendAuditEntry` (`apps/api/src/lib/audit-hash.ts`): the hash-chain head-read used
  `ORDER BY seq DESC LIMIT 1` with no NULL filter. Postgres sorts NULLs **first** in DESC order, and
  some paths (e.g. `command_center.view`) write audit rows directly with `seq = NULL`, so the
  head-read returned a NULL-seq row → `prevSeq = 0` → `seq = 1` → a permanent `23505` collision with
  the real chain head. That bubbled through `retryMutation`, which re-ran the non-idempotent
  `confirmEnroll` handler; its second attempt found no pending enrollment → 400 "No pending MFA
  enrollment", deterministically breaking `e2e/mfa.spec.ts:131`. **Fix:** restrict the head-read to
  chained rows via `isNotNull(auditLogs.seq)`; a per-org `pg_advisory_xact_lock` + bounded 23505 retry
  were also added as concurrency defense-in-depth, plus a 16-way race regression test in
  `audit-hash-chain.test.ts`. Follow-up `2baaa25` gave the `dms-workers.test.ts` in-memory mock DB a
  no-op `execute()` so it matches the real DB surface (the advisory lock calls `tx.execute`).
  Verified: `mfa.spec.ts` green, audit-hash-chain 5/5, **full API suite 130 files / 1290 tests pass**.
- The earlier cleanup increment (removed stray `0053_rls_fail_closed.sql` dup of `0052` RLS + its
  `gen_mig.js`, and six scratch files) landed in `f365314`. `pnpm check:migrations` is green (60/60).
- **Uncommitted working tree (not yet committed):** deletes four leftover scratch files
  (`scratch.ts`, `scratch_check_leave.ts`, `scratch_claims.ts`, `financial_diff.txt`) and removes the
  now-dangling `check-db` script from `packages/db/package.json` that pointed at deleted `scratch.ts`.
  These should stay deleted (do not recreate). Pushing auto-deploys to Vultr — needs user approval.
- Doc migration-head references reconciled to `0059`. **The DB had 236 tables _at head `0059`_**
  (verified then: 236 `pgTable` definitions). _Historical figure — the live count is **237** from mig
  `0062`'s `audit_chain_anchors` table onward; see the current snapshot above._
- Dev DB is on **port 5434**; test DB `coheronconnect_test` on **port 5433**.
- **Profile fields — FIXED (no longer a defect).** `users` now has `phone`/`jobTitle`/`location`/`bio`
  nullable text columns (`packages/db/src/schema/auth.ts:96-100`); `auth.updateProfile` persists them
  and the login response returns them. (The old "silently discarded" note is superseded.)
- **Gap tracking:** the live tracker is `docs/GAP_ANALYSIS.md` (its shipped/gap claims were last
  verified at an earlier head; for the live head read `packages/db/drizzle/meta/_journal.json`). The dated audits that fed it
  (2026-07-03 platform gap set, 2026-06-30
  competitive analysis, vendor benchmarks) and the older `SESSION_HANDOVER_2026-06-30.md` now live
  in `docs/archive/` for decision-history only.
