# CLAUDE.md

Guidance for Claude (and other AI agents) working in this repository.

## Project

**CoheronConnect** (repo: NexusOps) — a multi-tenant Enterprise Operations Platform.
Production: `connect.coheron.tech`. Remote: `github.com/Recon-X2025/NexusOps.git`.

Monorepo managed with **pnpm@10 + Turborepo**.

- `apps/web` — Next.js 15 frontend
- `apps/api` — Fastify 5 + tRPC 11 backend (the bulk of business logic + tests)
- `apps/worker` — background jobs
- `apps/mobile`, `apps/mac`, `apps/docs` — secondary surfaces
- `packages/db` — Drizzle ORM schema + migrations (PostgreSQL); **built with tsup to `dist/`**
- `packages/types`, `packages/validators`, `packages/auth`, `packages/ui`, `packages/metrics`, `packages/config`, `packages/cli`

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

Two read-only, code-grounded audits map the gap between what's shipped and what the
market leaders offer. **No code was modified** producing them.

- **Platform gap set (2026-07-03)** — module-by-module, `file:line`-cited, scored
  REAL / PARTIAL / STUB. Master index: `docs/PLATFORM_GAP_INDEX_2026-07-03.md`
  (7 cluster docs `PLATFORM_GAP_*_2026-07-03.md` + GRC/Legal companions).
- **Competitive gap analysis (2026-06-30)** — benchmarked vs 2026 category leaders,
  scored per segment (Enterprise vs SMB ≤500). `docs/COMPETITIVE_GAP_ANALYSIS_2026-06-30.md`;
  non-technical DOCX in `docs-word/` (generated by `scripts/gen-gap-docx.py`).

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

The authoritative roadmap is `docs/PRODUCTION_READINESS_PLAN_2026-04-26.md`. That
document is organised by **Workstreams (WS-1…WS-6)**; this file tracks the same
work as **Phases 0–6**. The Phase↔WS reconciliation is recorded in §13 of the plan.

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

See **`docs/SESSION_HANDOVER_2026-06-30.md`** for the current handover (read it first
when resuming). Highlights:
- Branch `main` is **1 commit ahead of origin** (`3e1404f`, demo seed) — **not pushed**
  (pushing auto-deploys to Vultr; needs user approval).
- Local test DB (5433) is a **clean slate**: org + founder `admin@coheron.com` + RBAC only.
- A **read-only whole-monorepo architecture audit** was completed; findings + recommended
  sequencing are in the handover §4. Top items: money-math duplication (Phase 5),
  worker Temporal durability (Phase 5), per-router `orgId` scoping (Phase 6), repo-hygiene
  cleanup (quick win).
- Deferred: cross-tenant **super-admin / platform-monitoring role** (no such role exists yet).
- **Gap-identification audits completed** (read-only, no code changed): the 2026-07-03
  platform gap set (`docs/PLATFORM_GAP_INDEX_2026-07-03.md` + 7 cluster docs + GRC/Legal
  companions) and the 2026-06-30 competitive gap analysis (`docs/COMPETITIVE_GAP_ANALYSIS_2026-06-30.md`
  + DOCX). See the new **"Gap analysis"** section above for the synthesis: dominant
  pattern is *correct schema, missing computation/automation*; cross-cluster maturity
  ≈50/100; top fixes are DPDP triad, workflow trigger/webhook loop, balance sheet +
  GSTR-1 fix, gratuity/leave accrual, depreciation.
