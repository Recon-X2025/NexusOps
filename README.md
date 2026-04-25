# NexusOps by Coheron

> Enterprise-grade workflow orchestration, ITSM, asset management, HR service delivery, and procurement — without the $100–$200/user/month ServiceNow price tag.

## Architecture

```
nexusops/
├── apps/
│   ├── web/              # Next.js 15 App Router (React 19, TypeScript, Tailwind) — primary product UI
│   ├── api/              # Fastify + tRPC API (TypeScript, Drizzle ORM)
│   ├── mobile/           # Expo / React Native client (tRPC consumer)
│   ├── worker/           # Background jobs (BullMQ / workers)
│   ├── mac/              # Coheron “managed account” console (Next.js)
│   └── docs/             # Documentation site (Next.js)
├── packages/
│   ├── db/               # Drizzle ORM schemas + versioned SQL migrations + seed
│   ├── types/            # Shared Zod schemas + TypeScript types
│   ├── ui/               # Shared component library (shadcn/ui style)
│   ├── config/           # ESLint, Prettier, TSConfig shared configs
│   └── cli/              # NexusOps CLI
├── charts/nexusops/      # Helm chart for Kubernetes deployment
├── infra/
│   ├── terraform/        # IaC for AWS/GCP/Azure (Coheron-managed)
│   └── temporal/         # Temporal.io dynamic config
├── docker-compose.dev.yml   # Local development services
├── docker-compose.test.yml  # Isolated Postgres/Redis/Meilisearch for CI & Vitest
├── docker-compose.prod.yml  # Production Docker Compose + Traefik
└── Makefile              # Common commands
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 + TypeScript |
| UI | Tailwind CSS + Radix UI (shadcn/ui pattern) |
| Workflow Editor | React Flow / Xyflow |
| Backend API | Fastify + tRPC (type-safe end-to-end) |
| Workflow Engine | Temporal.io |
| Database | PostgreSQL 16 + Drizzle ORM |
| Search | Meilisearch |
| Cache/Queue | Redis + BullMQ |
| Auth | Better Auth + SAML/OIDC |
| File Storage | S3-compatible (MinIO for self-hosted) |
| AI | Anthropic Claude API |
| Observability | OpenTelemetry + Grafana |
| Deployment | Docker + Kubernetes (Helm) |

## Modules

| Module | Status | Description |
|---|---|---|
| ITSM — Ticket Engine | ✅ | Incidents, requests, problems, changes with SLA tracking |
| Visual Workflow Engine | ✅ | No-code automation with Temporal.io backend |
| Asset Management + CMDB | ✅ | ITAM, topology graph, license management |
| Self-Service Portal | ✅ | Employee-facing portal with KB and request templates |
| Dashboards + Reports | ✅ | Real-time metrics, time-series charts, CSV/PDF export |
| People Ops (HR) | ✅ | Onboarding, leave management, org chart |
| Procurement | ✅ | PR → PO → invoice 3-way match, vendor management |
| AI Layer | ✅ | Smart classification, NL search, resolution suggestions |
| Integrations | ✅ | Slack, Teams, Email, Jira, SAP, webhooks |
| Self-Hosted Deploy | ✅ | Docker Compose + Helm + CLI |
| Coheron-Managed | ✅ | Terraform IaC for AWS/GCP/Azure |

## API surfaces (for developers)

| Topic | Detail |
|--------|--------|
| **Employee expense claims vs finance reports** | Web **Expenses** uses **`hr.expenses.*`** (`expense_claims`). Finance-style **reports + line items** live under **`expenseReports.*`** (`expense_reports` / `expense_items`), mounted on `appRouter` as **`expenseReports`** to avoid colliding with `hr.expenses`. Migrations create these tables (e.g. `0015_expense_reports.sql`). |
| **India compliance + CSM** | Portal users and TDS/ECR live under **`indiaCompliance.*`**. Use the typed `trpc` client; CI includes parity checks and a test that forbids `(trpc as any)` in `apps/web`. |
| **`mac` router** | Mounted for **managed endpoint / automation** flows (separate **mac** Next.js app, not the main product sidebar). |
| **Custom fields** | **`customFields.*`** definitions + values API. **Web:** Admin overview links to **`/app/admin/custom-fields`**. |
| **Payslip PDF** | Browser: `/api/payroll/payslip-pdf/<payslipId>` (Next proxy) → API `GET /payroll/payslip-pdf/<id>`. Only the payslip’s employee may download. |
| **Payroll run pipeline** | `payroll.runs.lockPeriod` (draft → period locked + run totals), `advanceComputationStep` (gross → TDS), `computePayslips` (persist `payslips` rows), then HR / Finance / CFO approvals. |
| **AP / AR invoices** | `invoices.invoice_flow` is **`payable`** or **`receivable`**. **`financial.listInvoices`** supports optional **`direction`**, joins vendor for display names, and returns **`totalAmount`** / **`direction`** for each row. **`financial.createReceivableInvoice`** creates AR rows (customer as a `vendors` row). Web **Financial** area includes AP + AR flows; **`financial.apAging`** is **payable** outstanding only. |
| **Dashboard metrics** | **`dashboard.getMetrics`** includes org KPIs such as open incidents, AP/AR outstanding, and asset counts (consumers: web dashboard, mobile). |
| **Workflow publish + Temporal** | By default, **`workflows.publish`** tolerates a missing Temporal worker (degraded run metadata). Set **`NEXUSOPS_WORKFLOW_ENGINE_REQUIRED=true`** (or **`WORKFLOW_ENGINE_REQUIRED`**) in `.env` to **fail publish** with **`PRECONDITION_FAILED`** and roll back activation if Temporal cannot start the run. See `.env.example` near **`TEMPORAL_*`**. |
| **Audit logs** | Successful mutations write **`audit_logs`** with **redacted** sensitive keys (passwords, tokens, API keys, etc.) via shared sanitization in the API. **`admin.auditLog.list`** paginates entries for admins. |

## Run everything locally

Use this as a **checklist**. You need **two** Docker Compose files: **`docker-compose.dev.yml`** (everyday coding, Postgres **5434**) and **`docker-compose.test.yml`** (tests, Postgres **5433**). They do not share data.

### Prerequisites
- **Node.js** ≥ 20 · **pnpm** ≥ 9 · **Docker Desktop** (daemon running)

### A. One-time / after `git pull`

```bash
git clone https://github.com/coheron/nexusops   # first time only
cd nexusops
pnpm install

# Dev app env (API + web + worker against dev DB)
cp .env.example .env
# Required secrets — generate and paste into .env:
#   AUTH_SECRET=$(openssl rand -hex 32)
#   ENCRYPTION_KEY=$(openssl rand -hex 32)

# Test env — use committed .env.test (DATABASE_URL must point at test Postgres, e.g. localhost:5433/nexusops_test)
```

### B. Run the product (development stack)

```bash
# Infra: Postgres :5434, Redis, Meilisearch, MinIO, Temporal, MailHog, …
make docker-up
# wait until Postgres is healthy

pnpm db:migrate
pnpm db:seed    # optional demo data (admin@coheron.com / demo1234!)

pnpm check:trpc-parity   # optional: web ↔ API procedure names (no DB)

make dev        # Turbo: API, web, and other dev tasks (see turbo.json)
```

Open **http://localhost:3000** (web), **http://localhost:3001/health** (API). Other URLs are in the table below.

**Optional apps** (not started by default in all setups):

| App | Typical command | Notes |
|-----|-----------------|--------|
| **Mobile** | `cd apps/mobile && pnpm start` | Expo; point API URL at your machine. |
| **Docs** | `pnpm --filter @nexusops/docs dev` | Local docs site. |
| **MAC console** | `pnpm --filter @nexusops/mac dev` | Managed-account UI. |
| **Worker** | Often included in **`make dev`** / Turbo | Needs Redis + same `.env` as API. |

### C. Run all automated tests (isolated test DB)

Uses **`.env.test`** + **`docker-compose.test.yml`** (Postgres **5433**, Redis **6380**, Meilisearch **7701**).

```bash
pnpm docker:test:up
pnpm exec dotenv -e .env.test -- pnpm --filter @nexusops/db db:migrate
pnpm exec dotenv -e .env.test -- pnpm test    # Turbo: all package tests (API Vitest is the bulk)
```

**Faster smoke** (compose + migrate + three API files): `pnpm test:local-ready` or `make local-test-ready`.

**Layer-by-layer API tests:** `pnpm test:layer1` … `pnpm test:layer9` (each loads `.env.test` via script).

**Full scripted QA** (includes Playwright): `pnpm test:full-qa`.

### D. CI-style verification (build + tests + optional E2E)

```bash
pnpm docker:test:up
pnpm exec dotenv -e .env.test -- pnpm --filter @nexusops/db db:migrate
pnpm build
pnpm exec dotenv -e .env.test -- pnpm test
pnpm check:trpc-parity
# Optional, same as CI e2e job (requires env + sometimes dev servers — see playwright.config):
pnpm exec dotenv -e .env.test -- pnpm exec playwright test
```

**`pnpm lint`** — run when tightening style; the monorepo may still report **known gaps** (e.g. **`apps/mobile`** has no local **eslint** binary in path; **`packages/db`** `seed*.ts` may fail strict **`tsc --noEmit`**).

### E. Stop / reset

```bash
pnpm docker:test:down      # test stack
make docker-down           # dev stack (or: docker compose -f docker-compose.dev.yml down)
pnpm docker:test:reset     # test stack + delete volumes (clean DB)
```

---

## Quick Start (Development)

Short path if you already know the repo — same as **§B** above:

```bash
pnpm install
cp .env.example .env   # set AUTH_SECRET, ENCRYPTION_KEY
make docker-up
pnpm db:migrate
pnpm db:seed           # optional
pnpm check:trpc-parity # optional
make dev
```

### Local QA / automated tests (Docker)

Isolated stack: **`docker-compose.test.yml`** (Postgres **5433**, Redis **6380**, Meilisearch **7701**) plus **`.env.test`** — does not touch dev data on **5434**.

| Goal | Command |
|------|---------|
| **One-shot readiness** (compose `--wait` + migrations + smoke tests) | `pnpm test:local-ready` or `make local-test-ready` |
| **Start / stop test stack** | `pnpm docker:test:up` · `pnpm docker:test:down` · clean volumes: `pnpm docker:test:reset` |
| **API layer tests** | `pnpm test:layer1` … `pnpm test:layer9` |
| **Full 10-layer QA** (API + Playwright) | `pnpm test:full-qa` |
| **Class L rows** (closure register Seq **1–12 · 17–23 · 38** — Layer 8 + L `*-rbac` Vitest + hero Playwright only) | With test stack up and **`.env.test`**: `pnpm test:class-l` (`scripts/run-class-l-tests.sh`) |
| **Class P rows** (Seq **13–16 · 24–37 · 39–44** — L8 smoke + P RBAC + `module-routes` + GRC/CSM/HR/CRM specs) | With test stack up and **`.env.test`**: `pnpm test:class-p` (`scripts/run-class-p-tests.sh`) |
| **CI-equivalent (Turbo + all Playwright)** | With test stack up and **`.env.test`**: `pnpm exec dotenv -e .env.test -- pnpm test` then `pnpm exec dotenv -e .env.test -- pnpm exec playwright test` (same split as **`.github/workflows/ci.yml`** jobs **`test`** + **`e2e`**) |
| **Full monorepo build + API tests** | With test stack up: `pnpm docker:test:up` → `pnpm exec dotenv -e .env.test -- pnpm --filter @nexusops/db db:migrate` → **`pnpm build`** → **`pnpm exec dotenv -e .env.test -- pnpm test`**. This matches a typical local “green” run; **`pnpm lint`** may still report known gaps (e.g. mobile ESLint not wired, `packages/db` seed scripts under strict `tsc`). |

**Vitest** applies **`pnpm db:migrate`** once before workers (`apps/api/src/__tests__/global-setup.ts`) whenever **`.env.test`** defines `DATABASE_URL`, so schema-based tests see migrated tables. **`pnpm check:trpc-parity`** skips that migrate step (no DB required).

**Regenerating web RBAC hints** after router changes (from `apps/api`):  
`pnpm exec tsx ../../scripts/generate-trpc-rbac-map.ts`

Open:
- **Web app**: http://localhost:3000
- **API**: http://localhost:3001
- **API health**: http://localhost:3001/health
- **Drizzle Studio**: http://localhost:4983 (after `make db-studio`)
- **MailHog**: http://localhost:8025
- **MinIO Console**: http://localhost:9001

Default credentials (after `pnpm db:seed`): **`admin@coheron.com`** / **`demo1234!`**

### Troubleshooting (local)

| Symptom | What to check |
|--------|----------------|
| `ECONNREFUSED` on Postgres | `docker compose -f docker-compose.dev.yml ps` — Postgres should be **healthy** on `localhost:5434`. |
| API exits on startup | `DATABASE_URL` must match Docker (`postgresql://nexusops:nexusops@localhost:5434/nexusops`). |
| Login fails after fresh `.env` | Regenerate `AUTH_SECRET` and restart API; existing cookies were signed with the old secret. |
| `No procedure found on path …` | Run `pnpm check:trpc-parity` and align web calls with `apps/api/src/routers`. |
| Layer tests fail on missing tables | Run `pnpm docker:test:up` then `pnpm test:local-ready` or `pnpm exec dotenv -e .env.test -- pnpm --filter @nexusops/db db:migrate`. |
| Temporal / BullMQ warnings | Optional for basic UI; ensure `TEMPORAL_ADDRESS` and `REDIS_URL` match compose if you use workflows. See **`docs/TEMPORAL_LOCAL_RUNBOOK.md`**. |
| Workflow publish returns **412 / PRECONDITION_FAILED** | You set **`NEXUSOPS_WORKFLOW_ENGINE_REQUIRED=true`** but Temporal is not reachable; fix Temporal or unset the flag for degraded publish. |
| Security / SoD reviews | **`docs/SECURITY_SENSITIVE_MUTATIONS.md`** — API write procedure inventory. |

## Self-Hosted Production Deployment

```bash
# Single command with Docker Compose + Traefik (auto-SSL)
docker compose -f docker-compose.prod.yml up -d

# Or with Kubernetes (Helm)
helm upgrade --install nexusops charts/nexusops \
  --namespace nexusops \
  --create-namespace \
  --values charts/nexusops/values.yaml \
  --set secret.authSecret=$(openssl rand -hex 32) \
  --set secret.encryptionKey=$(openssl rand -hex 32)
```

## Available Commands

```bash
make dev          # Start all services in development mode
make build        # Build all packages
make test         # Run all tests
make docker-up    # Start dev infrastructure (Postgres, Redis, Meilisearch)
make docker-down  # Stop dev infrastructure
make db-push      # Push schema changes to database
make db-migrate   # Run migrations
make db-seed      # Seed with demo data
make db-studio    # Open Drizzle Studio
```

## Pricing

| Tier | Self-Hosted | Coheron-Managed |
|---|---|---|
| Free (Community) | $0 | — |
| Starter (25 users) | $299/mo | $499/mo |
| Professional (100 users) | $799/mo | $1,299/mo |
| Enterprise | $2,499/mo | $4,999/mo |
| Dedicated | — | From $8,999/mo |

**Up to 93% savings vs ServiceNow at equivalent scale.**

---

*Built by [Coheron](https://coheron.com). Designed to replace what enterprises overpay for.*
