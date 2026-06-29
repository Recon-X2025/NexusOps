# CoheronConnect — Testing Guide

> How to run the test suites, what each layer covers, and how the coverage gate
> works. Written as part of Phase 3 ("automated tests / hire inspectors").

## 1. Test types

| Type | Where | Runner | Backing services |
|---|---|---|---|
| Unit / integration (API) | `apps/api/src/__tests__/*.test.ts` | vitest | **real Postgres** (Docker, port 5433) |
| Pure-function engine tests | same dir (e.g. `india-payroll-engine.test.ts`) | vitest | none (in-memory) |
| End-to-end (browser) | `e2e/*.spec.ts` | Playwright | full dev stack (web :3000 + api :3001) |

The bulk of business logic lives in `apps/api`, so that suite carries the most
weight. Tests run against a **real Postgres database, not mocks** — this is a
deliberate choice so FK rules, constraints, and money-path SQL behave exactly as
they do in production.

## 2. Running the API suite

The test DB is `coheronconnect_test` on **port 5433** (separate from dev).

```bash
# 1. Start the test database (idempotent)
pnpm docker:test:up

# 2. Run the whole API suite
cd apps/api
DATABASE_URL="postgresql://coheronconnect_test:coheronconnect_test@localhost:5433/coheronconnect_test" \
  npx vitest run

# Run a single file
DATABASE_URL="...same..." npx vitest run src/__tests__/money-invariants.test.ts
```

Migrations are applied automatically at suite start (drizzle-kit migrate).

### Isolation rules (important)

`vitest.config.ts` runs **one file at a time** (`fileParallelism: false`,
`pool: 'forks'`, `singleFork: true`) because all tests share one DB connection.
Each test/suite therefore must:

- seed its **own** fresh org (use `seedTestOrg()` / `seedFullOrg()` from
  `src/__tests__/helpers.ts`), and
- clean up after itself (`cleanupOrg(orgId)` or a best-effort drop in `afterAll`).

Use unique tokens (`Date.now()` + random suffix) for any "must be unique" fields
so repeated runs never collide.

## 3. Notable test files (Phase 3)

| File | Covers |
|---|---|
| `src/__tests__/deletion-cascade.test.ts` | FK `onDelete` behavior at the SQL level — CASCADE (org→children), SET NULL (nullable actor refs), RESTRICT (NOT NULL actor + lookup refs). Locks in the Phase 2 FK policy. |
| `src/__tests__/money-invariants.test.ts` | Financial-correctness invariants: journal debits==credits (imbalance rejected), GST intra (CGST+SGST 50/50) vs inter (IGST) equivalence, ITC credit conservation, payroll `net = max(0, gross − totalDeductions)` across salary levels. |
| `src/__tests__/india-payroll-engine.test.ts` | Tax slabs, rebate, PF/ESI/PT, full payslip (pre-existing). |
| `src/__tests__/accounting_fix.test.ts` | Journal happy-path create/post/ledger (pre-existing). |

The money-invariant tests **complement** (do not duplicate) the existing engine
tests — they assert cross-cutting invariants rather than re-testing happy paths.

## 4. Coverage gate

Coverage uses `@vitest/coverage-v8`. Its version must match the installed
`vitest` minor **exactly** (currently `2.1.9`). The `coverage/` directory is
gitignored.

```bash
# Generate coverage (writes apps/api/coverage/coverage-summary.json)
pnpm coverage          # = vitest run --coverage in apps/api

# Enforce the floor
pnpm check:coverage    # = node scripts/coverage-floor.mjs
```

`scripts/coverage-floor.mjs` reads `apps/api/coverage/coverage-summary.json` and
fails (exit 1) if any of statements / branches / functions / lines drops below
the documented floor.

**The floor is a ratchet.** Measured at Phase 3 Stage E under the shipping
coverage config (`pnpm coverage`):

| Metric | Measured | Floor |
|---|---:|---:|
| Statements | 46.14% | 45.9% |
| Branches | 54.75% | 54.4% |
| Functions | 37.59% | 37.4% |
| Lines | 46.14% | 45.9% |

Floors sit just under the measured values to absorb v8 run-to-run jitter while
still catching real regressions. **Raise** them as coverage climbs; only lower
them via an explicit, reviewed edit to `scripts/coverage-floor.mjs`.

> **Why functions reads 37.59% (not the Stage-A 38.75%):** the new test files
> import more modules, so v8 instruments 415 functions instead of 400. Covered
> functions actually *rose* (155→156) and statements/branches/lines all climbed;
> the function *percentage* only dipped because the denominator grew. The floor
> is pinned to the real, reproducible current measurement.

## 5. End-to-end (Playwright)

```bash
pnpm test:e2e          # all specs
pnpm test:e2e:headed   # watch in a browser
```

Config (`playwright.config.ts`): `testDir: ./e2e`, chromium only, `workers: 1`,
`fullyParallel: false`, `retries: 2` in CI / `0` locally. The `webServer` block
auto-starts both the API (:3001) and the web app (:3000); `baseURL` is
`http://localhost:3000`.

### Cold-start caveat

Locally, the **first** spec can fail if Next.js is still cold-compiling `/login`
when the 15s `waitForURL` fires; because workers run serially this can cascade.
This is an environment warm-up artifact, **not** a spec defect. CI absorbs it via
`retries: 2`. To avoid it locally, pre-warm the stack (load `/login` once) before
running, or simply re-run.

### Flake-resistance conventions (applied in Phase 3 Stage D)

- **No hard waits.** Replace `waitForTimeout(...)` with event-based waits
  (`waitForLoadState`, `expect(locator).toHaveCount(...)`, `waitFor({ state })`).
- **No swallowed waits.** Don't write `waitForLoadState("networkidle").catch(() => {})`;
  prefer a deterministic `domcontentloaded` + an explicit element wait.
- **Unique tokens.** `` `${Date.now()}-${Math.floor(Math.random()*1e6)}` `` for
  any unique-constrained field, not a truncated timestamp.
- **Meaningful assertions.** Assert on visible confirmation text/state, not just
  `expect(body).toBeDefined()`.
- **Zero console-error tolerance** on route-smoke checks (benign noise such as
  favicon 404 / `ResizeObserver` / `net::ERR` is filtered, everything else fails).

## 6. CI

`ci.yml` build job depends on `[lint, test, e2e]`. On `main`, GHCR images
(web + api) are published tagged `latest` / `main` / 7-char SHA. The migration
journal gate (`pnpm check:migrations`) and coverage gate (`pnpm check:coverage`)
guard schema and coverage regressions respectively.
