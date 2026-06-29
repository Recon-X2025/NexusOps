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

## Roadmap reference

The authoritative hardening roadmap is `docs/PRODUCTION_READINESS_PLAN_2026-04-26.md` (Phases 0–6).
Phases 0–2 are complete. **Phase 3 (automated tests / "hire inspectors") is in progress**:
- Stage A — coverage baseline + tooling ✅
- Stage B — deletion-cascade FK behavior tests ✅ (`apps/api/src/__tests__/deletion-cascade.test.ts`)
- Stage C — money-path invariant tests (in progress)
- Stage D — critical-path E2E hardening + flake audit
- Stage E — coverage-floor gate + `docs/TESTING.md`
