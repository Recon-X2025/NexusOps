# NexusOps — Developer & Operations Guide

**Version:** 1.4  
**Date:** March 29, 2026  
**Status:** Active  
**Author:** Platform Engineering Team  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Repository Setup](#3-repository-setup)
4. [Environment Configuration](#4-environment-configuration)
   - 4.1 Development Environment
   - 4.2 Test Environment
   - 4.3 Production Environment
   - 4.4 Environment Variable Reference
5. [Local Development](#5-local-development)
   - 5.1 Starting Infrastructure
   - 5.2 Starting the Application
   - 5.3 Local Service URLs
   - 5.4 Hot Reload & Watch Mode
6. [Database Operations](#6-database-operations)
   - 6.1 Schema Management
   - 6.2 Seeding
   - 6.3 Drizzle Studio
   - 6.4 Migration Workflow
7. [Building](#7-building)
   - 7.1 Full Monorepo Build
   - 7.2 Package-Level Builds
   - 7.3 Docker Image Builds
8. [Testing](#8-testing)
   - 8.1 Test Architecture
   - 8.2 Unit & Integration Tests (Vitest Layers 1–9)
   - 8.3 End-to-End Tests (Layer 10 / Playwright)
   - 8.4 Full QA Suite
   - 8.5 Stress & Load Tests
   - 8.6 Test Environment Setup
9. [Linting & Formatting](#9-linting--formatting)
10. [All Scripts Reference](#10-all-scripts-reference)
11. [Deployment](#11-deployment)
    - 11.1 Production Deployment (Self-Hosted)
    - 11.2 Secrets Generation
    - 11.3 Deploying to a Remote Server
    - 11.4 Hot-Patching Running Services
    - 11.5 Rolling Back
12. [Health Monitoring](#12-health-monitoring)
    - 12.1 Health Endpoints
    - 12.2 Service Health Checks
    - 12.3 Database Pool Stats
13. [Operational Procedures](#13-operational-procedures)
    - 13.1 Viewing Logs
    - 13.2 Session Cache Flush
    - 13.3 Restarting Individual Services
    - 13.4 Connecting to the Database
    - 13.5 Inspecting the Redis Cache
    - 13.6 Inspecting BullMQ Queues
14. [Port Reference](#14-port-reference)
15. [Troubleshooting](#15-troubleshooting)
16. [Utility Scripts Reference](#16-utility-scripts-reference)
17. [Revision History](#17-revision-history)
18. [India Compliance Operations](#18-india-compliance-operations)
    - 18.1 Monthly Payroll Run
    - 18.2 GST Invoice & E-Invoice Operations
    - 18.3 ROC Compliance Calendar Operations
    - 18.4 Customer Portal Operations
    - 18.5 India Compliance Environment Variables

---

## 1. Introduction

This guide is the day-to-day operational reference for engineers working on, deploying, and running the NexusOps platform. It covers the full lifecycle from first-time local setup through production deployment and incident response.

**Companion documents:**

| Document | Purpose |
|----------|---------|
| `NexusOps_Architecture_Design_Document.md` | System-level architecture and design decisions (§18: India Compliance Architecture) |
| `NexusOps_Software_Design_Document.md` | Detailed component and pattern design (§9.3 SLA lifecycle, §9.4 India computation engines) |
| `NexusOps_Technical_Requirements_Document.md` | Functional and non-functional requirements (§3.20 India Statutory Compliance) |
| `NexusOps_API_Specification.md` | All tRPC procedures, inputs, and outputs |
| `NexusOps_Complete_Business_Logic_v1.md` | **Authoritative India business logic** — all rules, calculations, workflows, and validations |
| `NexusOps_Entity_Relationship_Diagram.md` | Full database schema including India compliance tables (Domain 25) |

---

## 2. Prerequisites

Install the following tools before attempting to run the project.

### Required

| Tool | Minimum Version | Install |
|------|----------------|---------|
| **Node.js** | 20.0.0 | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| **pnpm** | 9.0.0 (pinned at 10.33.0) | `npm install -g pnpm@10.33.0` or `corepack enable pnpm` |
| **Docker Engine** | 24.x+ | [docs.docker.com/engine/install](https://docs.docker.com/engine/install) |
| **Docker Compose** | v2 (plugin) | Bundled with Docker Desktop; or `apt install docker-compose-plugin` |

### Recommended

| Tool | Purpose |
|------|---------|
| `make` | Convenience wrapper for common commands (README Makefile targets) |
| `dotenv-cli` | Load `.env.test` for test commands: `npm install -g dotenv-cli` |
| Playwright browsers | E2E tests: `pnpm exec playwright install chromium` |
| `sshpass` | Scripted SSH/SCP for Vultr deployments |

### Version Check

```bash
node -v           # Must be >= 20.0.0
pnpm -v           # Must be >= 9.0.0
docker -v
docker compose version
```

---

## 3. Repository Setup

### Clone & Install

```bash
git clone <repo-url> NexusOps
cd NexusOps

# Install all workspace dependencies (all packages and apps)
pnpm install
```

The `.npmrc` at the root sets `enable-pre-post-scripts=true` which allows `preinstall` / `postinstall` hooks in workspace packages.

### Monorepo Structure

```
NexusOps/
├── apps/
│   ├── api/         # @nexusops/api  — Fastify backend (port 3001)
│   └── web/         # @nexusops/web  — Next.js frontend (port 3000)
├── packages/
│   ├── db/          # @nexusops/db   — Drizzle ORM + schema
│   ├── types/       # @nexusops/types — shared TypeScript types + RBAC matrix
│   ├── ui/          # @nexusops/ui   — Radix/Tailwind component library
│   └── config/      # @nexusops/config — ESLint, Prettier, TSConfig presets
├── e2e/             # Playwright E2E test suite
├── scripts/         # Deployment, stress, and utility scripts
├── .env.example     # Template for development .env
├── .env.test        # Fixed test environment variables
├── turbo.json       # Turborepo pipeline config
└── package.json     # Root workspace scripts
```

---

## 4. Environment Configuration

### 4.1 Development Environment

Copy the example environment file and edit as needed:

```bash
cp .env.example .env
```

The default values in `.env.example` work with the local Docker stack (`docker-compose.dev.yml`) without any changes. The only values you MUST set for full functionality are:

```bash
AUTH_SECRET=<any-long-random-string>
ENCRYPTION_KEY=<exactly-32-chars-long-string!>
```

All other defaults connect to the local Docker services.

### 4.2 Test Environment

Tests use `.env.test` (already committed — do not edit for local runs). It points to separate test ports to avoid colliding with the dev stack:

```bash
# .env.test (committed — do not edit)
DATABASE_URL=postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test
REDIS_URL=redis://localhost:6380
MEILISEARCH_URL=http://localhost:7701
MEILISEARCH_KEY=test_master_key
AUTH_SECRET=test-secret-do-not-use-in-production-abcdef123456
ENCRYPTION_KEY=test-encryption-key-32-chars-long!
NEXT_PUBLIC_API_URL=http://localhost:3001
NODE_ENV=test
```

To run the test infrastructure stack separately:

```bash
pnpm docker:test:up    # Starts postgres:5433, redis:6380, meilisearch:7701
pnpm docker:test:down  # Tears down test stack
```

### 4.3 Production Environment

Use the provided secrets generator to create `.env.production`:

```bash
bash scripts/gen-secrets.sh [optional-server-ip]
```

This writes `.env.production` with securely generated values for all secrets. Review the file and set any integration keys (SMTP, S3, search) before deploying.

A documented template is available at `.env.production.example`.

### 4.4 Environment Variable Reference

#### Core Infrastructure

| Variable | Required | Description | Dev Default |
|----------|----------|-------------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://nexusops:nexusops@localhost:5432/nexusops` |
| `DATABASE_DIRECT_URL` | No | Direct (non-pooled) connection for migrations | Same as `DATABASE_URL` |
| `REDIS_URL` | Yes | Redis connection string | `redis://localhost:6379` |
| `MEILISEARCH_URL` | No | Meilisearch base URL (search service) | — (search disabled if unset) |
| `MEILISEARCH_KEY` | No | Meilisearch API key | `""` |
| `TEMPORAL_ADDRESS` | No | Temporal workflow service address | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | No | Temporal namespace | `default` |

#### Authentication & Security

| Variable | Required | Description | Notes |
|----------|----------|-------------|-------|
| `AUTH_SECRET` | Yes | Session signing secret | Min 32 chars; generate with `openssl rand -base64 32` |
| `SESSION_SECRET` | Yes (prod) | Session token secret | Used alongside `AUTH_SECRET` in production |
| `ENCRYPTION_KEY` | Yes | Data encryption key | Exactly 32 characters |
| `JWT_SECRET` | Yes (prod) | JWT signing secret | Generated by `gen-secrets.sh` |
| `SESSION_TTL_HOURS` | No | Session expiry in hours | Default: 24 |

#### Application URLs

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development` \| `test` \| `production` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public frontend URL (e.g. `https://nexusops.yourdomain.com`) |
| `NEXT_PUBLIC_API_URL` | Yes | Public API URL (e.g. `https://api.nexusops.yourdomain.com`) |
| `NEXT_TELEMETRY_DISABLED` | — | Set to `1` in all containers |

#### Object Storage (MinIO / S3)

| Variable | Description | Dev Default |
|----------|-------------|-------------|
| `S3_ENDPOINT` | S3-compatible endpoint | `http://localhost:9000` |
| `S3_ACCESS_KEY` | Access key ID | `minioadmin` |
| `S3_SECRET_KEY` | Secret access key | `minioadmin` |
| `S3_BUCKET` | Bucket name | `nexusops` |
| `S3_REGION` | Region (MinIO: any) | `us-east-1` |

#### Email (SMTP)

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname (`localhost` for MailHog in dev) |
| `SMTP_PORT` | SMTP port (`1025` for MailHog) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for sent emails |

#### Rate Limiting

| Variable | Description | Prod Default | Dev Default |
|----------|-------------|-------------|-------------|
| `RATE_LIMIT_WINDOW` | Time window | `"1 minute"` | `"1 minute"` |
| `RATE_LIMIT_PER_TOKEN` | Max requests for auth users | `1000` | `10000` |
| `RATE_LIMIT_ANON` | Max requests for anon users | `100` | `1000` |

#### Database Pool

| Variable | Description | Prod Default | Dev Default |
|----------|-------------|-------------|-------------|
| `DB_POOL_MAX` | Max connections | `20` | `30` |
| `DB_POOL_IDLE_TIMEOUT` | Idle timeout (seconds) | `30` | `30` |
| `DB_POOL_CONNECT_TIMEOUT` | Connect timeout (seconds) | `15` | `15` |
| `DB_POOL_MAX_LIFETIME` | Max connection lifetime (seconds) | `1800` | `1800` |

#### Integrations (Optional)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (AI virtual agent) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `LICENSE_KEY` | Platform licence key |

#### Operations

| Variable | Description | Default |
|----------|-------------|---------|
| `FLUSH_REDIS_SESSION_ON_START` | Flush all sessions on API startup | `false` |
| `PORT` | API listen port | `3001` |
| `HOST` | API listen host | `0.0.0.0` |

---

## 5. Local Development

### 5.1 Starting Infrastructure

Start all local backing services (PostgreSQL, Redis, Meilisearch, MinIO, MailHog, Temporal) with:

```bash
pnpm docker:up
# or
docker compose -f docker-compose.dev.yml up -d
```

Wait for all services to be healthy:

```bash
docker compose -f docker-compose.dev.yml ps
```

All services should show `(healthy)` status. On first run, initialise the database:

```bash
pnpm db:push    # Push schema to dev database
pnpm db:seed    # Seed with test organisations, users, and data
```

### 5.2 Starting the Application

Once infrastructure is up and the database is seeded, start all apps in development mode:

```bash
pnpm dev
```

This runs `turbo run dev`, which starts:
- `apps/api` — via `tsx watch src/index.ts` (hot reload on file changes)
- `apps/web` — via `next dev --port 3000` (HMR)

Both run concurrently. Turborepo's TUI (`"ui": "tui"` in `turbo.json`) displays interleaved output with service labels.

To start individual services:

```bash
# API only
pnpm --filter @nexusops/api dev

# Web only
pnpm --filter @nexusops/web dev

# DB package in watch mode (if changing schema)
pnpm --filter @nexusops/db dev
```

### 5.3 Local Service URLs

| Service | URL | Notes |
|---------|-----|-------|
| **Web App** | http://localhost:3000 | Next.js frontend |
| **API** | http://localhost:3001 | Fastify backend |
| **API Health** | http://localhost:3001/health | Simple `{ status: "ok" }` check |
| **API Health (detailed)** | http://localhost:3001/health/detailed | Checks DB, Redis, Meilisearch + pool stats |
| **API Ready** | http://localhost:3001/ready | Readiness probe |
| **Drizzle Studio** | http://localhost:4983 | Database GUI (run `pnpm db:studio`) |
| **MailHog UI** | http://localhost:8025 | View emails sent by the app |
| **MailHog SMTP** | localhost:1025 | SMTP endpoint for the app |
| **MinIO Console** | http://localhost:9001 | Object storage admin UI |
| **MinIO API** | http://localhost:9000 | S3-compatible API endpoint |
| **Meilisearch** | http://localhost:7700 | Search engine dashboard |
| **Temporal UI** | http://localhost:8233 | Workflow orchestration UI (if Temporal UI is running) |
| **PostgreSQL** | localhost:5432 | Direct DB connection |
| **Redis** | localhost:6379 | Redis CLI / GUI connection |

### 5.4 Hot Reload & Watch Mode

| App | Trigger | Mechanism |
|-----|---------|-----------|
| `apps/api` | Any `.ts` file change under `src/` | `tsx watch` restarts the process |
| `apps/web` | Any `.tsx` / `.ts` / `.css` change | Next.js HMR (no page reload for client components) |
| `packages/db` | Schema file change | `tsup --watch` rebuilds the package; API restarts |
| `packages/ui` | Component change | tsup watch + Next.js HMR |

> **Note:** When you change `packages/db/src/schema/`, you must run `pnpm db:push` to apply the schema change to the development database in addition to the package rebuilding.

---

## 6. Database Operations

### 6.1 Schema Management

The database schema is defined in `packages/db/src/schema/` using Drizzle ORM. All schema changes MUST go through the Drizzle workflow.

**Push schema directly to dev database (no migration files):**

```bash
pnpm db:push
# or
pnpm --filter @nexusops/db db:push
```

Use `db:push` during active development when you are iterating on schema changes and do not need an audit trail.

**Generate a migration file from schema changes:**

```bash
pnpm --filter @nexusops/db db:generate
```

This produces a SQL migration file in `packages/db/drizzle/`. Commit this file — it will be applied by the production `migrator` service.

**Apply pending migration files:**

```bash
pnpm db:migrate
# or
pnpm --filter @nexusops/db db:migrate
```

Use `db:migrate` for staging/production deployments and when you want a tracked migration history.

### 6.2 Seeding

**Standard seed (users, organisations, reference data):**

```bash
pnpm db:seed
# or
pnpm --filter @nexusops/db db:seed
# runs: tsx src/seed.ts
```

**Module-specific seed:**

```bash
pnpm --filter @nexusops/db db:seed:modules
# runs: tsx src/seed-modules.ts
```

Seeding is safe to re-run — the seed script is designed to be idempotent.

The test user accounts created by the seed script are documented in `NexusOps_Test_Accounts.md`.

### 6.3 Drizzle Studio

Launch the Drizzle Studio visual database browser:

```bash
pnpm db:studio
# Opens at http://localhost:4983
```

Drizzle Studio provides a GUI to browse tables, run queries, and inspect data without a separate database client.

### 6.4 Migration Workflow for Production

When preparing a release that includes schema changes:

1. Develop and test schema changes locally using `db:push`.
2. Generate the migration file: `pnpm --filter @nexusops/db db:generate`
3. Commit the generated file in `packages/db/drizzle/`.
4. In production, the `migrator` Docker service runs `node dist/migrate.js` before the API starts, applying any pending migrations automatically.

---

## 7. Building

### 7.1 Full Monorepo Build

```bash
pnpm build
# runs: turbo run build
```

Turborepo builds packages in dependency order:

```
@nexusops/config → @nexusops/types → @nexusops/db → @nexusops/ui → @nexusops/api → @nexusops/web
```

Build outputs:
- API: `apps/api/dist/index.mjs` (ESM, Node 20 target)
- Web: `apps/web/.next/` (standalone output)
- Packages: `packages/*/dist/`

Turborepo caches build outputs keyed by input file hashes. Subsequent builds skip unchanged packages. To force a full rebuild:

```bash
pnpm build --force
```

### 7.2 Package-Level Builds

```bash
# Rebuild only the API
pnpm --filter @nexusops/api build

# Rebuild only the web app
pnpm --filter @nexusops/web build

# Rebuild only the DB package
pnpm --filter @nexusops/db build
```

### 7.3 Docker Image Builds

Build production Docker images:

```bash
# Build web image
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.nexusops.yourdomain.com \
  -t nexusops/web:latest .

# Build API image
docker build -f apps/api/Dockerfile \
  -t nexusops/api:latest .
```

Or build both using the production compose:

```bash
docker compose -f docker-compose.prod.yml build
```

---

## 8. Testing

### 8.1 Test Architecture

The test suite is organised into 10 layers:

| Layer | Framework | Type | Command |
|-------|-----------|------|---------|
| 1 | Vitest | Unit — RBAC, auth, validation | `pnpm test:layer1` |
| 2 | Vitest | Unit — Database schema, migrations | `pnpm test:layer2` |
| 3 | Vitest | Integration — Auth flows | `pnpm test:layer3` |
| 4 | Vitest | Integration — Ticket procedures | `pnpm test:layer4` |
| 5 | Vitest | Integration — HR procedures | `pnpm test:layer5` |
| 6 | Vitest | Integration — Finance procedures | `pnpm test:layer6` |
| 7 | Vitest | Integration — GRC procedures | `pnpm test:layer7` |
| 8 | Vitest | Integration — Multi-tenant isolation | `pnpm test:layer8` |
| 9 | Vitest | Integration — Approval & SLA workflows | `pnpm test:layer9` |
| 10 | Playwright | E2E — Full browser journeys | `pnpm test:layer10` |

Layers 1–9 run with the test database stack. Layer 10 requires both the API and web servers to be running.

### 8.2 Unit & Integration Tests (Vitest Layers 1–9)

**Prerequisites:**

```bash
# Start the test Docker stack (separate ports from dev)
pnpm docker:test:up

# Push schema to test database
dotenv -e .env.test -- pnpm --filter @nexusops/db db:push

# Seed test data
dotenv -e .env.test -- pnpm --filter @nexusops/db db:seed
```

**Run all Vitest layers:**

```bash
pnpm test
# or
dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run
```

**Run a specific layer:**

```bash
pnpm test:layer1    # Layer 1 only
pnpm test:layer2    # Layer 2 only
# ...
pnpm test:layer9    # Layer 9 only
```

Each layer command injects `.env.test` and runs only matching test files:

```bash
# Example: what test:layer3 runs
dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer3*
```

**Watch mode for active development:**

```bash
pnpm --filter @nexusops/api test:watch
```

**Vitest configuration** (`apps/api/vitest.config.ts`):

```
environment:    node
testTimeout:    30,000 ms
hookTimeout:    30,000 ms
pool:           forks (singleFork: true)
setupFiles:     src/__tests__/setup.ts
```

> `singleFork: true` runs all tests in a single process to share the database connection pool and avoid port conflicts between test files.

### 8.3 End-to-End Tests (Layer 10 / Playwright)

**Prerequisites:**

```bash
# Install Playwright browsers (first time only)
pnpm exec playwright install chromium

# Test database must be seeded (see §8.2 prerequisites)
```

**Playwright automatically starts the API and web servers** before running tests using `webServer` config:
- API: `pnpm --filter @nexusops/api dev` on port 3001 (reuses if already running)
- Web: `pnpm --filter @nexusops/web dev` on port 3000 (reuses if already running)

**Run E2E tests:**

```bash
pnpm test:e2e
# or
pnpm test:layer10
# or
pnpm exec playwright test
```

**Run with browser visible:**

```bash
pnpm test:e2e:headed
```

**Run specific test file:**

```bash
pnpm exec playwright test e2e/auth.spec.ts
pnpm exec playwright test e2e/rbac.spec.ts
```

**View test report:**

```bash
pnpm exec playwright show-report
# Opens playwright-report/index.html
```

**CI mode (no server reuse, report as list):**

```bash
pnpm test:e2e:ci
```

**Playwright configuration:**

```
testDir:         ./e2e
fullyParallel:   false
workers:         1
retries:         2 (CI) / 0 (local)
browser:         Chromium (Desktop Chrome)
baseURL:         http://localhost:3000
trace:           on-first-retry
screenshot:      only-on-failure
video:           retain-on-failure
```

**E2E global setup** (`e2e/global-setup.ts`) automatically:
1. Pushes the schema to the test database.
2. Seeds the test database with initial data.

### 8.4 Full QA Suite

The full QA suite runs all 10 layers sequentially:

```bash
pnpm test:full-qa
# runs: bash scripts/run-full-qa.sh
```

What `run-full-qa.sh` does:
1. Starts the test Docker stack: `docker compose -f docker-compose.test.yml up -d --wait`
2. Loads `.env.test`
3. Pushes schema + seeds the test database
4. Runs Vitest layers 1–9 (API integration tests)
5. Runs Playwright (Layer 10 E2E)
6. Exits with code 1 if any layer fails

**Capture a QA report to file:**

```bash
pnpm test:qa-report
# Saves output to qa-report-YYYYMMDD-HHMMSS.txt
```

### 8.5 Stress & Load Tests

Stress tests simulate concurrent users and requests against a running API.

| Command | Sessions | Description |
|---------|---------|-------------|
| `pnpm stress:100` | 100 | Light load |
| `pnpm stress:500` | 500 | Standard load |
| `pnpm stress:500:ramp` | 500 | Ramped over 5s (`RAMP_MS=5000`) |
| `pnpm stress:5000` | 5,000 | High load |
| `pnpm stress:5000:fast` | 5,000 | Burst (`MAX_CONCURRENT=1000`) |

All stress tests require the API to be running locally. They authenticate real users and exercise a range of tRPC procedures.

Additional scripts for targeted load testing:

```bash
node scripts/load-test.js           # General load test
node scripts/stress-test-10000.js   # 10,000 session stress test
node scripts/failure-test.js        # Failure injection test
```

### 8.6 k6 Security & Reliability Test Suite

A purpose-built k6 test suite under `tests/k6/` covers authentication resilience, rate limit enforcement, concurrent workflow correctness, race condition safety, and adversarial input validation. **Requires k6 v1.7.x or later.**

#### Prerequisites

```bash
# macOS
brew install k6

# Verify
k6 version

# Ensure API is running
curl http://localhost:3001/trpc/auth.login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@coheron.com","password":"demo1234!"}'

# Get a TEST_TICKET_ID for race condition tests
psql -U nexusops -d nexusops -c "SELECT id FROM tickets ORDER BY created_at DESC LIMIT 1;"
```

#### Test Scripts

| Script | VUs | Duration | Purpose |
|--------|-----|----------|---------|
| `auth_stress.js` | 0→50 | 1m45s | Login storm — session isolation, no token reuse |
| `rate_limit.js` | 1–5 | 2m52s | Per-user rate bucket isolation, storm + recovery |
| `chaos_flow.js` | 30 | 3m | Full 6-step workflow under concurrent multi-tenant load |
| `race_condition.js` | 20 | 2m | Concurrent writes to a single row — optimistic locking |
| `invalid_payload.js` | 1 | 3m | 26 adversarial cases: prototype pollution, bad enums, XSS, SQL injection |
| `run_all.js` | up to 50 | ~7m | All scenarios orchestrated in one run |

#### Running Individual Tests

```bash
# Auth stress
k6 run tests/k6/auth_stress.js

# Rate limit
k6 run tests/k6/rate_limit.js

# Chaos flow (full multi-step workflow)
k6 run tests/k6/chaos_flow.js

# Race condition — requires a real ticket UUID
k6 run -e TEST_TICKET_ID=<uuid> tests/k6/race_condition.js

# Adversarial input validation
k6 run tests/k6/invalid_payload.js

# Full suite
k6 run -e TEST_TICKET_ID=<uuid> tests/k6/run_all.js
```

#### Important: Seeding Load-Test Organisation Workflows

The 20 load-test organisations (`loadtest0@test.com` → `loadtest19@test.com`) require `ticket_statuses` rows before `tickets.create` will succeed. Run this once after provisioning load-test users:

```sql
-- Repeat for each of the 20 load-test org UUIDs
INSERT INTO ticket_statuses (org_id, name, category, color, sort_order) VALUES
  ('<org_uuid>', 'Open',        'open',        '#6366f1', 0),
  ('<org_uuid>', 'In Progress', 'in_progress', '#f59e0b', 1),
  ('<org_uuid>', 'Resolved',    'resolved',    '#10b981', 2),
  ('<org_uuid>', 'Closed',      'closed',      '#6b7280', 3);
```

A convenience script can be found in the session notes; see `NexusOps_K6_Security_and_Load_Test_Report_2026.md` §11.

#### Baseline Results (March 28, 2026)

| Metric | Value |
|--------|-------|
| Total requests (full suite) | 23,798 |
| Unhandled 500 errors | **0** |
| Bad input rejection rate | **100%** |
| p(95) all endpoints | 271ms |
| End-to-end workflow p(95) | 4,334ms |
| Concurrent workflows (chaos) | 1,655 / 0 failures |
| Concurrent write conflicts (409) | 2,004 (optimistic locking — expected) |

### 8.6 Test Environment Setup

**Test stack services and ports:**

| Service | Test Port | Dev Port |
|---------|----------|---------|
| PostgreSQL | 5433 | 5432 |
| Redis | 6380 | 6379 |
| Meilisearch | 7701 | 7700 |

The test stack runs separately from the dev stack so both can be active simultaneously without conflicts.

---

## 9. Linting & Formatting

**Type-check all packages:**

```bash
pnpm lint
# runs: turbo run lint (which runs tsc --noEmit per package)
```

**Format all files:**

```bash
pnpm format
# runs: prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}"
```

**Lint web app only (Next.js ESLint):**

```bash
pnpm --filter @nexusops/web lint
```

> Type errors and ESLint warnings do NOT block production builds (`ignoreBuildErrors: true` in `next.config.ts`) but DO fail CI lint steps. Resolve lint errors before merging.

---

## 10. All Scripts Reference

### Root Workspace Scripts

#### Development

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `turbo run dev` | Start all apps in development mode (hot reload) |
| `build` | `turbo run build` | Build all packages and apps |
| `lint` | `turbo run lint` | Type-check all packages |
| `format` | `prettier --write ...` | Format all source files |

#### Database

| Script | Description |
|--------|-------------|
| `db:push` | Push Drizzle schema directly to dev database |
| `db:migrate` | Apply migration files to dev database |
| `db:seed` | Seed dev database with test data |
| `db:studio` | Open Drizzle Studio at http://localhost:4983 |

#### Docker

| Script | Description |
|--------|-------------|
| `docker:up` | Start dev infrastructure (`docker-compose.dev.yml`) |
| `docker:down` | Stop dev infrastructure |
| `docker:logs` | Follow logs from all dev services |
| `docker:test:up` | Start test infrastructure (`docker-compose.test.yml`) |
| `docker:test:down` | Stop test infrastructure |

#### Testing

| Script | Description |
|--------|-------------|
| `test` | Run all Vitest tests (layers 1–9) |
| `test:e2e` | Run Playwright E2E tests |
| `test:ci` | Run all tests (Vitest + Playwright) |
| `test:layer1` – `test:layer9` | Run a single Vitest layer |
| `test:layer10` | Run Playwright tests |
| `test:full-qa` | Run full QA suite (Docker + all 10 layers) |
| `test:qa-report` | Run full QA suite and save output to file |
| `test:e2e:ci` | E2E in CI mode (line reporter) |
| `test:e2e:headed` | E2E with browser visible |
| `test:stage1` | Run DB + auth package tests only |
| `test:stage2` | Run API tests only |

#### Stress Tests

| Script | Sessions | Notes |
|--------|---------|-------|
| `stress:100` | 100 | `SESSIONS=100 node scripts/stress-test-500.js` |
| `stress:500` | 500 | `node scripts/stress-test-500.js` |
| `stress:500:ramp` | 500 | `RAMP_MS=5000 node scripts/stress-test-500.js` |
| `stress:5000` | 5,000 | `node scripts/stress-test-5000.js` |
| `stress:5000:fast` | 5,000 | `MAX_CONCURRENT=1000 node scripts/stress-test-5000.js` |

### Package-Level Scripts

#### `apps/api`

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx watch src/index.ts` | Start API with hot reload |
| `build` | `tsup` | Compile to `dist/index.mjs` (ESM) |
| `start` | `node dist/index.js` | Run built API |
| `test` | `vitest run` | Run all API tests once |
| `test:watch` | `vitest` | Run API tests in watch mode |
| `lint` | `tsc --noEmit` | Type-check only |

#### `apps/web`

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev --port 3000` | Start frontend with HMR |
| `build` | `next build` | Build for production (standalone output) |
| `start` | `next start` | Serve the built app |
| `test` | `vitest run` | Run web unit tests |
| `lint` | `next lint` | Next.js ESLint |

#### `packages/db`

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsup` | Compile schema and client |
| `dev` | `tsup --watch` | Rebuild on schema changes |
| `db:push` | `drizzle-kit push` | Push schema to database |
| `db:migrate` | `drizzle-kit migrate` | Apply pending migrations |
| `db:generate` | `drizzle-kit generate` | Generate migration SQL from schema |
| `db:seed` | `tsx src/seed.ts` | Run standard seed |
| `db:seed:modules` | `tsx src/seed-modules.ts` | Run module-specific seed |
| `db:studio` | `drizzle-kit studio` | Open Drizzle Studio |
| `test` | `vitest run` | Run DB package tests |
| `lint` | `tsc --noEmit` | Type-check |

---

## 11. Deployment

### 11.1 Production Deployment (Self-Hosted)

#### Step 1: Generate secrets

```bash
bash scripts/gen-secrets.sh <your-server-ip>
# Creates .env.production with generated secrets
```

Review `.env.production` and add any integration keys:
- `SMTP_*` (email)
- `ANTHROPIC_API_KEY` (AI virtual agent)
- `S3_*` (if using external object storage instead of MinIO)

#### Step 2: Build and start production services

On the server (or push images first):

```bash
# Clone repo on the server
git clone <repo-url> /opt/nexusops
cd /opt/nexusops

# Copy .env.production to the server
scp .env.production user@your-server:/opt/nexusops/

# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build
```

The compose startup order is enforced automatically:
1. `postgres` and `redis` start first.
2. `migrator` runs (applies DB migrations) and must complete successfully.
3. `api` starts after migrator completes.
4. `web` starts after `api` is healthy.
5. `meilisearch`, `minio`, and `traefik` start in parallel.

#### Step 3: Verify

```bash
# Check all services are healthy
docker compose -f docker-compose.prod.yml ps

# Verify API is responding
curl https://api.nexusops.yourdomain.com/health

# Verify web is responding
curl https://nexusops.yourdomain.com/api/health
```

#### Step 4: Configure DNS

Point your domain names to the server IP before Traefik can issue Let's Encrypt certificates:

```
nexusops.yourdomain.com     → <server-ip>
api.nexusops.yourdomain.com → <server-ip>
```

> **Important:** Replace `yourdomain.com` placeholders in `docker-compose.prod.yml` with your actual domain before deploying.

### 11.2 Secrets Generation

```bash
bash scripts/gen-secrets.sh [server-ip]
```

This script generates cryptographically random values for:
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MEILI_MASTER_KEY`
- `JWT_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- MinIO root credentials
- S3 access key

The output is written to `.env.production`. Never commit this file to version control.

### 11.3 Deploying to a Remote Vultr Server

Use the provided deployment scripts for deploying to the configured Vultr server (`139.84.154.78`):

```bash
# Full initial deployment (Ubuntu bootstrap, Docker install, clone, build, start)
bash scripts/deploy-vultr.sh

# Push local changes and restart services on running server
bash scripts/push-to-vultr.sh
```

`push-to-vultr.sh` uses `rsync` to sync local source files to `/opt/nexusops` on the server, then triggers a Docker rebuild and restart.

### 11.4 Hot-Patching Running Services

When you need to update specific source files on a running server without a full redeploy (emergency patch):

```bash
# Copy files to a writable temp directory first (avoids permission issues with scp)
scp -r apps/api/src/ user@server:/tmp/api-src/

# SSH and copy to the correct destination
ssh user@server "cp -r /tmp/api-src/* /opt/nexusops/apps/api/src/"

# Rebuild and restart only the affected service
ssh user@server "cd /opt/nexusops && docker compose -f docker-compose.prod.yml up -d --build api"
```

Wait for the health check to pass before declaring the patch complete:

```bash
ssh user@server "docker compose -f docker-compose.prod.yml ps api"
curl https://api.nexusops.yourdomain.com/health
```

### 11.5 Rolling Back

```bash
# Stop the current containers
ssh user@server "cd /opt/nexusops && docker compose -f docker-compose.prod.yml stop api web"

# Pull the previous image tag
ssh user@server "docker pull nexusops/api:<previous-tag>"

# Update the image reference in compose or use --scale 0 then restart
ssh user@server "cd /opt/nexusops && docker compose -f docker-compose.prod.yml up -d api web"
```

---

## 12. Health Monitoring

### 12.1 Health Endpoints

The API exposes three health endpoints:

#### `GET /health` — Liveness Probe

```json
{
  "status": "ok",
  "timestamp": "2026-03-26T10:00:00.000Z"
}
```

Always returns 200 if the process is running. Used by Docker `HEALTHCHECK` and container orchestrators.

#### `GET /health/detailed` — Diagnostic Probe

Runs active checks against all backing services. Returns 200 if all checks pass, 503 if any check fails.

```json
{
  "status": "ok",
  "checks": {
    "db": "ok",
    "redis": "ok",
    "search": "ok"
  },
  "pool": {
    "total": 5,
    "idle": 3,
    "waiting": 0
  },
  "timestamp": "2026-03-26T10:00:00.000Z"
}
```

| Check | Method | Pass Condition |
|-------|--------|---------------|
| `db` | `SELECT 1` via Drizzle | Query succeeds |
| `redis` | `redis.ping()` | Returns `PONG` |
| `search` | `GET /health` to Meilisearch (3s timeout) | HTTP 200 |

#### `GET /ready` — Readiness Probe

Same checks as `/health/detailed`. Returns 200 (`"ready"`) or 503 (`"not_ready"`). Used by load balancers to gate traffic.

### 12.2 Service Health Checks (Docker)

All services in `docker-compose.prod.yml` have Docker health checks configured:

| Service | Health Command | Interval | Timeout | Retries |
|---------|---------------|---------|---------|---------|
| `web` | `wget localhost:3000/api/health` | 30s | 10s | 3 |
| `api` | `wget localhost:3001/health` | 30s | 10s | 3 |
| `postgres` | `pg_isready -U nexusops` | 10s | 5s | 5 |
| `redis` | `redis-cli ping` | 10s | 5s | 5 |
| `meilisearch` | `curl -f localhost:7700/health` | 15s | 5s | 5 |
| `minio` | `mc ready local` | 15s | 5s | 5 |

### 12.3 Database Pool Stats

The `/health/detailed` response includes real-time connection pool statistics from `getPoolStats()`:

```json
"pool": {
  "total": 20,      // Total connections allocated
  "idle": 15,       // Connections waiting for a query
  "waiting": 0      // Requests waiting for a free connection
}
```

A `waiting` value greater than 0 indicates pool exhaustion. Pool pressure warnings are also logged when utilisation exceeds 85%.

### 12.4 In-App Observability Stack

Three additional endpoints are served directly on the API process.  They are **not** exposed to the public internet — access via internal network or SSH tunnel only.

#### `GET /internal/metrics`

Live snapshot of all in-memory counters since the last reset (or process start).

```bash
curl http://localhost:3001/internal/metrics | jq .
```

Returns total requests, total 5xx errors, global error rate, rate-limited count, and a per-endpoint breakdown (count, errors, avg/min/max latency, last-seen timestamp).

#### `POST /internal/metrics/reset`

Resets all counters to zero.  Use before a load test or after a known incident to establish a clean baseline.

```bash
curl -s -X POST http://localhost:3001/internal/metrics/reset | jq .
```

#### `GET /internal/health`

Evaluates current metrics against hard-coded thresholds.  Always returns HTTP 200; interpret the `status` field.

```bash
curl http://localhost:3001/internal/health | jq .
```

Example response:

```json
{
  "status": "HEALTHY",
  "reasons": [],
  "summary": {
    "error_rate": 0.002,
    "total_requests": 1248,
    "total_errors": 4,
    "rate_limited": 12,
    "slow_endpoints": []
  },
  "monitor": {
    "last_changed_at": "2026-03-29T07:55:04.574Z",
    "eval_every": 50
  }
}
```

**Status values:** `HEALTHY` / `DEGRADED` / `UNHEALTHY`.  `reasons[]` is empty when healthy; otherwise lists the threshold(s) that fired.

**Health thresholds:**

| Rule | DEGRADED | UNHEALTHY |
|---|---|---|
| Global error rate | > 1 % | > 5 % |
| Any endpoint avg latency | > 1 000 ms | > 2 000 ms |
| Rate-limited requests | > 100 since last reset | — |

#### Active Health Signals

`healthMonitor.ts` watches metrics automatically.  Every `HEALTH_EVAL_EVERY` requests (default **50**) it evaluates health and, **only if the status has changed**, emits one structured log line:

| Transition | Log level | `event` field |
|---|---|---|
| `HEALTHY → DEGRADED` | `warn` | `SYSTEM_DEGRADED` |
| `DEGRADED → UNHEALTHY` | `error` | `SYSTEM_UNHEALTHY` |
| `ANY → HEALTHY` | `info` | `SYSTEM_RECOVERED` |

In a log aggregator (e.g. Loki, Datadog), alert on `event = "SYSTEM_DEGRADED"` or `event = "SYSTEM_UNHEALTHY"`.

**Tuning `HEALTH_EVAL_EVERY`:**

| Traffic volume | Recommended value |
|---|---|
| Development / low traffic | `10` (fast feedback) |
| Production ≤ 500 req/s | `50` (default) |
| Production > 500 req/s | `200` (reduce CPU impact of snapshot copy) |

Set via environment variable: `HEALTH_EVAL_EVERY=100`.

---

## 13. Operational Procedures

### 13.1 Viewing Logs

**Development (all services):**

```bash
pnpm docker:logs
# or
docker compose -f docker-compose.dev.yml logs -f
```

**Production (specific service):**

```bash
ssh user@server "docker compose -f /opt/nexusops/docker-compose.prod.yml logs -f api"
ssh user@server "docker compose -f /opt/nexusops/docker-compose.prod.yml logs -f web"
ssh user@server "docker compose -f /opt/nexusops/docker-compose.prod.yml logs -f postgres"
```

**Filter for slow requests:**

```bash
docker compose -f docker-compose.prod.yml logs api | grep "SLOW REQUEST"
```

**Filter for auth failures:**

```bash
docker compose -f docker-compose.prod.yml logs api | grep "AUTH_FAIL\|logAuthFail"
```

**Filter for RBAC denials:**

```bash
docker compose -f docker-compose.prod.yml logs api | grep "RBAC_DENIED\|logRbacDenied"
```

**Filter for database errors:**

```bash
docker compose -f docker-compose.prod.yml logs api | grep "DB_ERROR\|POOL PRESSURE"
```

**View latency percentile reports:**

```bash
docker compose -f docker-compose.prod.yml logs api | grep "p50\|p95\|p99"
```

### 13.2 Session Cache Flush

To force all active sessions to re-authenticate (e.g. after a security incident or role change):

**Option A — Environment flag (requires restart):**

Set `FLUSH_REDIS_SESSION_ON_START=true` in `.env.production`, then restart the API container. The API will scan and delete all `session:*` keys from Redis on startup.

```bash
# Edit .env.production to set FLUSH_REDIS_SESSION_ON_START=true
ssh user@server "cd /opt/nexusops && \
  docker compose -f docker-compose.prod.yml restart api"
```

**Option B — Direct Redis command (no restart required):**

```bash
ssh user@server "docker compose -f /opt/nexusops/docker-compose.prod.yml exec redis \
  redis-cli -a \$REDIS_PASSWORD SCAN 0 MATCH 'session:*' COUNT 500"
# Then delete the returned keys manually, or:
ssh user@server "docker compose -f /opt/nexusops/docker-compose.prod.yml exec redis \
  redis-cli -a \$REDIS_PASSWORD --scan --pattern 'session:*' | xargs redis-cli -a \$REDIS_PASSWORD DEL"
```

### 13.3 Restarting Individual Services

```bash
# Restart API only (production)
ssh user@server "cd /opt/nexusops && \
  docker compose -f docker-compose.prod.yml restart api"

# Restart web only
ssh user@server "cd /opt/nexusops && \
  docker compose -f docker-compose.prod.yml restart web"

# Restart and rebuild a single service
ssh user@server "cd /opt/nexusops && \
  docker compose -f docker-compose.prod.yml up -d --build api"
```

### 13.4 Connecting to the Database

**Development:**

```bash
# Via Docker exec
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U nexusops -d nexusops

# Via local psql (if installed)
psql postgresql://nexusops:nexusops@localhost:5432/nexusops
```

**Production (via SSH tunnel):**

```bash
# Open a tunnel: local port 5433 → server's DB port 5432
ssh -L 5433:localhost:5432 user@your-server

# In another terminal, connect locally
psql postgresql://nexusops:<password>@localhost:5433/nexusops
```

**Useful queries:**

```sql
-- Check active sessions
SELECT count(*) FROM sessions WHERE expires_at > now();

-- Check idle-in-transaction connections
SELECT pid, state, query_start, query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
AND query_start < now() - interval '30 seconds';

-- Terminate a specific connection
SELECT pg_terminate_backend(<pid>);

-- Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

### 13.5 Inspecting the Redis Cache

```bash
# Development
docker compose -f docker-compose.dev.yml exec redis redis-cli

# Production
ssh user@server "docker compose -f /opt/nexusops/docker-compose.prod.yml exec redis \
  redis-cli -a \$REDIS_PASSWORD"
```

**Useful Redis commands:**

```bash
# Count all session keys
SCAN 0 MATCH "session:*" COUNT 500

# Check rate limit counter for a specific IP
GET "anon:127.0.0.1"

# Check rate limit counter for a token
GET "user:<token>"

# List all BullMQ queue keys
KEYS "bull:*"

# Check queue depth
LLEN "bull:nexusops-approvals:wait"
LLEN "bull:nexusops-sla:wait"

# Get Redis memory usage
INFO memory
```

### 13.6 Inspecting BullMQ Queues

BullMQ queues can be inspected via Redis keys or programmatically. Key patterns:

| Pattern | Contents |
|---------|---------|
| `bull:nexusops-approvals:wait` | Pending approval jobs |
| `bull:nexusops-approvals:active` | Currently processing approval jobs |
| `bull:nexusops-approvals:failed` | Failed approval jobs (up to 200 retained) |
| `bull:nexusops-approvals:completed` | Completed approval jobs (up to 500 retained) |
| `bull:nexusops-sla:wait` | Pending SLA jobs (delayed) |
| `bull:nexusops-sla:delayed` | Scheduled SLA breach check jobs |
| `bull:nexusops-sla:failed` | Failed SLA jobs (up to 100 retained) |

To view a failed job:

```bash
# Get all failed approval jobs
redis-cli> LRANGE "bull:nexusops-approvals:failed" 0 -1
```

---

## 14. Port Reference

### Development Stack (`docker-compose.dev.yml`)

| Port | Service | Protocol |
|------|---------|---------|
| **3000** | Next.js web app | HTTP |
| **3001** | Fastify API | HTTP |
| **4983** | Drizzle Studio | HTTP (run `pnpm db:studio`) |
| **5432** | PostgreSQL | TCP |
| **6379** | Redis | TCP |
| **7233** | Temporal (gRPC) | gRPC |
| **7700** | Meilisearch | HTTP |
| **8025** | MailHog web UI | HTTP |
| **1025** | MailHog SMTP | SMTP |
| **9000** | MinIO API | HTTP (S3-compatible) |
| **9001** | MinIO console | HTTP |

### Test Stack (`docker-compose.test.yml`)

| Port | Service | Offset from Dev |
|------|---------|----------------|
| **5433** | PostgreSQL (test) | +1 |
| **6380** | Redis (test) | +1 |
| **7701** | Meilisearch (test) | +1 |

### Production Stack (`docker-compose.prod.yml`)

| Port | Service | Notes |
|------|---------|-------|
| **80** | Traefik (HTTP) | Redirects to 443 |
| **443** | Traefik (HTTPS) | TLS-terminated reverse proxy |
| All others | Internal only | Not exposed to host |

---

## 15. Troubleshooting

### App fails to start: "Cannot find module" or import errors

```bash
# Reinstall dependencies
pnpm install

# Rebuild all packages in dependency order
pnpm build
```

### API crashes on startup: database connection refused

```bash
# Check Docker services are running
docker compose -f docker-compose.dev.yml ps

# Restart the infrastructure
pnpm docker:down && pnpm docker:up

# Wait for healthy status, then try again
```

### "React error #310" / Minified React error in browser

This is a React Rules of Hooks violation: a hook is being called conditionally (after an early return). Ensure all hook calls (`useQuery`, `useSearchParams`, `useRouter`, etc.) appear at the top of the component function body, before any `if (!can(...)) return` statements.

### "Missing Suspense boundary" error for `useSearchParams`

Any component that calls `useSearchParams()` must be wrapped in `<Suspense>`. Check the component's parent layout and add:

```tsx
<Suspense fallback={null}>
  <ComponentThatUsesSearchParams />
</Suspense>
```

### Sidebar active link not highlighting correctly

The child link `href` in `sidebar-config.ts` must include the exact `?tab=<key>` query parameter. Verify:
1. The `href` in `sidebar-config.ts` matches the `?tab=` value used in the page.
2. `AppSidebar` is wrapped in `<Suspense>` in the layout (required for `useSearchParams`).
3. The page reads the tab from `useSearchParams().get("tab")` and updates the URL with `router.push(...)`.

### Meilisearch search returns no results

1. Check `MEILISEARCH_URL` is set (search is silently disabled if unset).
2. Verify `initSearchIndexes()` was called on startup and created the eight indexes.
3. Confirm `indexDocument()` is being called after write operations (known gap — may need to manually populate).
4. Check the detailed health endpoint: `GET /health/detailed` — `"search"` should be `"ok"`.

**Note:** Two environment variable names exist for Meilisearch:
- `MEILISEARCH_URL` — used by the search service (`services/search.ts`)
- `MEILISEARCH_HOST` — used by the health check (`index.ts`)

Set both to the same value until this inconsistency is resolved.

### Rate limit (429) errors during development

The default dev rate limit is 10,000 requests per minute for authenticated users, but stress tests or rapid UI interactions can hit this. To raise the limit:

```bash
# In .env
RATE_LIMIT_PER_TOKEN=100000
```

### Database pool exhaustion (waiting > 0 in health check)

```bash
# Check pool stats
curl http://localhost:3001/health/detailed | jq .pool

# Look for pool pressure warnings in logs
docker compose -f docker-compose.dev.yml logs api | grep "POOL PRESSURE"
```

If pool is exhausted: check for long-running transactions, increase `DB_POOL_MAX`, or check for connection leaks (queries not awaited).

### E2E tests fail immediately: "Test database not ready"

```bash
# Ensure test stack is running
pnpm docker:test:up

# Push schema to test DB
dotenv -e .env.test -- pnpm --filter @nexusops/db db:push

# Seed the test DB
dotenv -e .env.test -- pnpm --filter @nexusops/db db:seed
```

### Production container keeps restarting

```bash
# Check container exit code and last logs
docker inspect nexusops-api-1 | grep '"ExitCode"'
docker logs nexusops-api-1 --tail 50
```

Common causes:
- Missing required environment variables (check startup logs for "required" errors)
- Database not reachable (check `depends_on` health status)
- `dist/migrate.js` missing (migrator fails → API waits forever)

### TLS certificate not issuing (Traefik / Let's Encrypt)

1. Confirm DNS A records point to the server IP.
2. Ensure port 80 is open on the server firewall (Let's Encrypt HTTP-01 challenge).
3. Check Traefik logs: `docker logs nexusops-traefik-1`.
4. The `letsencrypt-data` volume must be persistent between container restarts.

---

## 16. Utility Scripts Reference

All scripts are in the `scripts/` directory.

| Script | Description | Usage |
|--------|-------------|-------|
| `gen-secrets.sh` | Generate `.env.production` with cryptographically random secrets | `bash scripts/gen-secrets.sh [server-ip]` |
| `deploy-vultr.sh` | Full initial deployment to Vultr server (bootstrap Ubuntu, install Docker, clone repo, start services) | `bash scripts/deploy-vultr.sh` |
| `push-to-vultr.sh` | Sync local changes to running Vultr server and rebuild services | `bash scripts/push-to-vultr.sh` |
| `run-full-qa.sh` | Run the complete 10-layer QA suite with Docker setup | `bash scripts/run-full-qa.sh` |
| `populate-live.js` | Populate a live environment with realistic seed data | `node scripts/populate-live.js` |
| `validate-rbac.mjs` | Validate RBAC matrix configuration for consistency | `node scripts/validate-rbac.mjs` |
| `validate-session-cache.mjs` | Test session cache resolution and cache invalidation | `node scripts/validate-session-cache.mjs` |
| `db-audit.js` | Audit recent database activity from `audit_logs` | `node scripts/db-audit.js` |
| `stress-test-500.js` | 500-user concurrent stress test | `node scripts/stress-test-500.js` |
| `stress-test-5000.js` | 5,000-user concurrent stress test | `node scripts/stress-test-5000.js` |
| `stress-test-10000.js` | 10,000-user concurrent stress test | `node scripts/stress-test-10000.js` |
| `load-test.js` | Sustained load test with configurable duration | `node scripts/load-test.js` |
| `failure-test.js` | Failure injection — simulates service unavailability | `node scripts/failure-test.js` |

---

## 17. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-26 | Platform Engineering | Initial document created from codebase and infrastructure analysis |
| 1.1 | 2026-03-26 | Platform Engineering | Added §18 India Compliance Operations covering Payroll, GST, ROC, and Portal compliance procedures |

---

## 18. India Compliance Operations

This section covers day-to-day operational procedures for running India-specific compliance engines: Payroll, GST, ROC, and the Customer Portal.

---

### 18.1 Monthly Payroll Run

**Prerequisite environment variables:**
```bash
IRP_API_URL=https://einvoice1.gst.gov.in/eicore/v1.03
IRP_GSP_GSTIN=<your GSP GSTIN>
IRP_API_KEY=<IRP API Key from GSP>
EPFO_PORTAL_URL=https://unifiedportal-mem.epfindia.gov.in
```

**Step-by-step procedure:**

1. **Lock payroll period** (1st–3rd of following month):
   ```bash
   curl -X POST http://localhost:3001/trpc/hr.payroll.lockPeriod \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"month": 3, "year": 2026}'
   ```

2. **Run payroll computation** (generates all payslips in DRAFT):
   ```bash
   curl -X POST http://localhost:3001/trpc/hr.payroll.runMonthlyPayroll \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"month": 3, "year": 2026, "orgId": "<ORG_UUID>"}'
   ```

3. **Review payslips** — HR Manager logs into `/app/hr → Payroll → Month Review`; checks for anomalies (negative net pay, unusually high TDS). Any corrections require unlocking affected employee rows, editing salary data, and re-running.

4. **Approve** — Three-tier approval flow in `/app/approvals`:
   - HR Manager → Approve
   - Finance Manager → Approve
   - CFO → Approve (if payroll > configured threshold)

5. **Generate ECR file** for EPFO:
   ```bash
   curl -X POST http://localhost:3001/trpc/hr.payroll.generateECR \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"month": 3, "year": 2026, "orgId": "<ORG_UUID>"}' \
     -o ./ecr_march_2026.txt
   ```
   Upload the generated `.txt` file to EPFO Unified Portal under ECR 2.0 submission.

6. **Generate PT challans** per state (system groups employees by `employees.state`):
   ```bash
   curl -X GET "http://localhost:3001/trpc/hr.payroll.getPTChallanData?month=3&year=2026"
   ```
   Download one challan per state and pay via respective State Government portal.

7. **Generate TDS challan (ITNS 281)**:
   ```bash
   curl -X GET "http://localhost:3001/trpc/hr.payroll.getTDSChallanData?month=3&year=2026"
   ```
   Pay via NSDL TIN 2.0 portal. Update `tds_challan_records` with BSR code + challan serial number.

8. **Update Form 24Q data** — TDS challan payment details are automatically linked in the Form 24Q quarterly return data. No separate action needed.

9. **Generate Form 16** (Annual — April after FY close):
   ```bash
   curl -X POST http://localhost:3001/trpc/hr.payroll.generateForm16 \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"fiscalYear": "2025-26", "orgId": "<ORG_UUID>"}'
   ```
   PDFs are generated and stored; employees can download from `/app/employee-portal → Tax & Declarations`.

---

### 18.2 GST Invoice & E-Invoice Operations

**Prerequisites:**
- `IRP_API_URL`, `IRP_GSP_GSTIN`, `IRP_API_KEY` set (see §4.4)
- Org's own GSTIN registered in organization settings
- All vendor GSTINs validated and stored in `vendors.gstin`

**Creating a GST-compliant invoice:**

```bash
curl -X POST http://localhost:3001/trpc/financial.createGSTInvoice \
  -H "Authorization: Bearer $FINANCE_TOKEN" \
  -d '{
    "vendorId": "<UUID>",
    "poId": "<UUID>",
    "invoiceDate": "2026-03-15",
    "lineItems": [
      {
        "description": "IT Consulting Services",
        "hsnSacCode": "998313",
        "quantity": 1,
        "unitPrice": 100000,
        "gstRate": 18
      }
    ]
  }'
```

The system automatically:
1. Determines `isInterstate` from `orgState` vs `vendorState`
2. Computes CGST+SGST (intrastate) or IGST (interstate)
3. Calls IRP API to generate `IRN` if org turnover > ₹5 Cr
4. Stores `e_invoice_irn`, `e_invoice_ack_number`, `e_invoice_ack_date`
5. Auto-generates E-Way Bill if `taxable_value > ₹50,000` and supply is goods

**E-Invoice failure handling:**
- If IRP API is unavailable, invoice is saved in DRAFT; BullMQ retries every 15 minutes up to 48 hours
- After 48 hours of failure, compliance alert is raised to Finance Admin
- Manual IRN upload endpoint: `financial.invoices.manualUploadIRN`

**GSTR-2B Reconciliation (Monthly):**

```bash
# Download GSTR-2B JSON from GST portal, then reconcile:
curl -X POST http://localhost:3001/trpc/financial.reconcileGSTR2B \
  -H "Authorization: Bearer $FINANCE_TOKEN" \
  -d '{"month": 3, "year": 2026, "gstr2bFilePath": "/uploads/gstr2b_march_2026.json"}'
```

Produces a reconciliation report with:
- Matched: ITC claim allowed
- Mismatch: supplier has filed, but values differ (system flags for review)
- Missing in GSTR-2B: supplier has not filed; ITC cannot be claimed yet

---

### 18.3 ROC Compliance Calendar Operations

**Checking upcoming filings:**

```bash
curl -X GET "http://localhost:3001/trpc/secretarial.complianceCalendar.upcoming?daysAhead=30" \
  -H "Authorization: Bearer $CS_TOKEN"
```

**Director KYC reminder job** — runs automatically at midnight IST daily via BullMQ queue `compliance-reminders`. To trigger manually:

```bash
curl -X POST http://localhost:3001/trpc/secretarial.directors.triggerKYCReminders \
  -H "Authorization: Bearer $CS_TOKEN"
```

**Filing a completed form:**

```bash
curl -X POST http://localhost:3001/trpc/secretarial.complianceCalendar.markFiled \
  -H "Authorization: Bearer $CS_TOKEN" \
  -d '{
    "itemId": "<compliance_calendar_item_uuid>",
    "filedDate": "2026-10-15",
    "srn": "B12345678",
    "ackDocumentUrl": "https://storage.../AOC4_ack.pdf"
  }'
```

**Penalty computation** — system auto-computes `penalty_per_day_inr × days_overdue`:
```bash
curl -X GET "http://localhost:3001/trpc/secretarial.complianceCalendar.penaltyReport?fiscalYear=2025-26"
```

---

### 18.4 Customer Portal Operations

**Portal user lifecycle:**

```bash
# Create portal user (tied to CRM account):
curl -X POST http://localhost:3001/trpc/portal.users.create \
  -H "Authorization: Bearer $CSM_TOKEN" \
  -d '{"customerId": "<UUID>", "fullName": "Ravi Kumar", "email": "ravi@acmecorp.in", "phone": "+919876543210"}'

# Portal user gets an OTP email/SMS to set password; account goes from PENDING_APPROVAL → ACTIVE

# Suspend a portal user:
curl -X POST http://localhost:3001/trpc/portal.users.suspend \
  -H "Authorization: Bearer $CSM_ADMIN_TOKEN" \
  -d '{"portalUserId": "<UUID>", "reason": "Security review"}'
```

**DPDP Act 2023 Data Access Request:**
```bash
# Process a data access request from a portal user:
curl -X POST http://localhost:3001/trpc/portal.dpdp.processDataRequest \
  -H "Authorization: Bearer $DPO_TOKEN" \
  -d '{"portalUserId": "<UUID>", "requestType": "ACCESS"}'
# requestType: ACCESS | CORRECTION | ERASURE | NOMINATION
```

**Reviewing portal audit logs:**
```bash
# Last 100 portal actions for a specific customer:
curl -X GET "http://localhost:3001/trpc/portal.auditLog.list?customerId=<UUID>&limit=100" \
  -H "Authorization: Bearer $CS_ADMIN_TOKEN"
```

**Session and security monitoring:**
- Portal sessions expire after 30 minutes of inactivity (non-configurable)
- Account locks after 5 consecutive failed logins; unlock via `portal.users.unlock`
- MFA (OTP/TOTP) enforcement configurable per org in Admin Console → Portal Settings
- API rate limit: 100 requests/minute/IP (enforced at Fastify middleware layer)

---

### 18.5 India Compliance Environment Variables

The following environment variables are required for all India compliance engines. Add these to `.env.production` (see §4.3):

| Variable | Required For | Example Value |
|----------|-------------|--------------|
| `IRP_API_URL` | E-Invoice generation | `https://einvoice1.gst.gov.in/eicore/v1.03` |
| `IRP_GSP_GSTIN` | E-Invoice IRP auth | `27AADCB2230M1ZP` |
| `IRP_API_KEY` | E-Invoice IRP auth | `<secret from GSP onboarding>` |
| `ORG_GSTIN` | GST computation (own org) | `29ABCDE1234F2Z5` |
| `ORG_STATE` | Inter/intra-state detection | `Karnataka` |
| `EPFO_PORTAL_URL` | ECR submission (informational) | `https://unifiedportal-mem.epfindia.gov.in` |
| `PT_STATES_ENABLED` | Comma-separated states for PT | `Maharashtra,Karnataka,West Bengal` |
| `INDIA_TIMEZONE` | All compliance timestamps | `Asia/Kolkata` (always IST) |
| `INDIA_FINANCIAL_YEAR_START_MONTH` | FY computation | `4` (April) |

---

## 17. Revision History

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | March 26, 2026 | Platform Engineering | Initial release |
| 1.1 | March 27, 2026 | Platform Engineering | Updated router count (33→35, added `inventory` and `indiaCompliance`). Noted `export const dynamic = "force-dynamic"` requirement for pages using `useSearchParams` in Next.js 15. Added inventory module operational notes. Noted production build is clean at 63 pages. |
| 1.2 | March 28, 2026 | Platform Engineering | Added §8.5 (Load Testing with k6): documents `seed_users.js`, `test.js`, `mixed_test.js`, `frontend_test.js` scripts, seed workflow, and run commands. Documents k6 v1.7.0 breaking change (`--experimental-browser` flag removed). Confirmed 200-VU sustained load at 340 req/s with 0% error rate. See `NexusOps_Load_Test_Report_2026.md` for full results and recommended thresholds. |
| 1.3 | March 28, 2026 | Platform Engineering | Expanded §8.5 into §8.5 + §8.6: new §8.6 (k6 Security & Reliability Test Suite) documents all 6 security/reliability test scripts, prerequisites, run commands, load-test org seeding procedure, and March 28 baseline results (0 unhandled 500s, 100% bad-input rejection, p95 271ms). Updated §10 scripts table with `k6 run` commands. See `NexusOps_K6_Security_and_Load_Test_Report_2026.md` for full results. |

---

*This guide should be kept up to date as scripts, environment variables, and operational procedures evolve. When adding a new environment variable, add it to §4.4 and §18.5. When adding a new script, add it to §16. When a new known failure mode is discovered and resolved, add it to §15.*
| 1.4 | 2026-03-29 | Platform Engineering | **Observability stack.** Added §12.4 (In-App Observability Stack) documenting `GET /internal/metrics`, `POST /internal/metrics/reset`, `GET /internal/health`, active health signals (`SYSTEM_DEGRADED`/`SYSTEM_UNHEALTHY`/`SYSTEM_RECOVERED`), and `HEALTH_EVAL_EVERY` tuning guide. Updated header version. See `NexusOps_Active_Health_Signal_Report_2026.md`. |
