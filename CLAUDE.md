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
- **Current migration head: `0052_odd_forgotten_wall`** (53 files, `0000`…`0052`). `0031_workable_spot`
  (team's super-admin / org-profile expansion) + `0032` (consolidated `mfa_enrollments`,
  `vulnerability_sla_events` + vuln SLA columns, `dpdp_notification_artifacts` + DPDP regime/erasure
  columns) landed on branch `merge/team-super-admin`. Migs `0041`–`0052` are the G1–G17 India-market
  gap-closure run (CRM lossless-convert/scoring/CPQ-tax, OKR rollup, SAM recon, expiry alerts, EPFO/
  NIC/MCA21 portal push, RoPA, KMS envelope encryption, and `0052` Postgres RLS). **`0052` is
  hand-written:** it provisions the non-privileged `app_runtime` role + `FORCE ROW LEVEL SECURITY` +
  `tenant_isolation` policies on all tenant tables (RLS only enforces because the request path drops
  to `app_runtime` via `SET LOCAL ROLE` — the app DB user is a superuser/BYPASSRLS and would otherwise
  bypass it). See `apps/api/src/lib/trpc.ts` (`rlsTenant` middleware) + `docs/GAP_ANALYSIS.md`.
- `packages/db` also carries a `mongodb ^6.12` dependency; no schema module references it (carried for
  integration/worker use).

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

- **Deploy Vultr** is a manual `workflow_dispatch` GitHub Action (`.github/workflows/deploy-vultr.yml`): rsync + `scripts/push-to-vultr.sh`.
- Migrations auto-apply in prod via the `migrator` service in `docker-compose.prod.yml` (`node -e require('./dist/migrate.js')`); `api` waits for `migrator: service_completed_successfully`.
- CI (`ci.yml`) build job needs `[lint, test, e2e]`; on `main` it publishes GHCR images (web+api) tagged `latest` / `main` / 7-char SHA.
- **Always take a backup/snapshot before deploying.** Snapshots and deploy triggers require the user's cloud credentials — Claude cannot perform them.

## Conventions & guardrails

- Make only the changes requested; avoid over-engineering, premature abstraction, and unrequested refactors.
- Read files before editing; never propose changes to unread code.
- Don't commit unless explicitly asked. Prefer staging specific files over `git add -A`.
- Never commit secrets (`.env*`, credentials). Coverage artifacts are gitignored.
- zsh quirks observed here: multi-line SQL piped through commands breaks; `cd` with unquoted paths can error "too many arguments"; `!` triggers history expansion in `node -e`. Workaround: write a temp `.cjs` file and quote paths.

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
> Still genuinely open per the audits: balance sheet, GSTR-1 18% hardcode, depreciation engine,
> gratuity/leave accrual, SAM reconciliation, lead scoring/lossless conversion, SMS delivery.

**The authoritative, living gap tracker is `docs/GAP_ANALYSIS.md`** — verified against actual
source at migration head `0032_damp_la_nuit` (2026-07-20). It lists what's shipped (REAL) vs the
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
in a `file:line` code audit at migration head `0032_damp_la_nuit`):
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

Current working branch: **`merge/team-super-admin`** (migration head `0032_damp_la_nuit`).
- The team's committed super-admin work (`origin/main` @ `4d2f0ec`) has been **merged locally** with
  prior uncommitted local work (MFA enrollments, vuln-SLA loop, DPDP notification artifacts). The merge
  is **validated** (33 migrations apply clean on a throwaway DB; typecheck clean; API test suite green)
  but **not committed to `main` and not pushed** (pushing auto-deploys to Vultr; needs user approval).
  A pre-merge checkpoint branch `wip/pre-merge-checkpoint` (`1fab82e`) preserves the raw local work.
- Migration collision resolved: local `0031/0032/0033` were consolidated into `0032_damp_la_nuit`,
  chained off the team's `0031_workable_spot`; snapshot chain regenerated via `pnpm db:generate`.
- Dev DB is on **port 5434**; test DB `coheronconnect_test` on **port 5433**.
- **Known real defect:** the Profile → Phone field silently discards its value — `auth.updateProfile`
  accepts `phone`/`location`/`jobTitle`/`bio` in Zod but `users` has no such columns, so Drizzle drops
  them (success toast still fires). See `BUILD.md §9`.
- **Gap tracking:** the live tracker is `docs/GAP_ANALYSIS.md` (verified 2026-07-20 at head
  `0032_damp_la_nuit`). The dated audits that fed it (2026-07-03 platform gap set, 2026-06-30
  competitive analysis, vendor benchmarks) and the older `SESSION_HANDOVER_2026-06-30.md` now live
  in `docs/archive/` for decision-history only.
