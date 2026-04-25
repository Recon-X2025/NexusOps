# NexusOps by Coheron

> Enterprise-grade workflow orchestration, ITSM, asset management, HR service delivery, and procurement — without the $100–$200/user/month ServiceNow price tag.

## Architecture

```
nexusops/
├── apps/
│   ├── web/              # Next.js 15 App Router (React 19, TypeScript, Tailwind)
│   └── api/              # Fastify + tRPC API server (TypeScript, Drizzle ORM)
├── packages/
│   ├── db/               # Drizzle ORM schemas + migrations + seed
│   ├── types/            # Shared Zod schemas + TypeScript types
│   ├── ui/               # Shared component library (shadcn/ui style)
│   ├── config/           # ESLint, Prettier, TSConfig shared configs
│   └── auth/             # Better Auth configuration
├── charts/nexusops/      # Helm chart for Kubernetes deployment
├── infra/
│   ├── terraform/        # IaC for AWS/GCP/Azure (Coheron-managed)
│   └── temporal/         # Temporal.io dynamic config
├── docker-compose.dev.yml   # Local development services
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
| **Employee expense claims** | The web **Expenses** app uses **`hr.expenses.*`** (`expense_claims`). A separate **`expensesRouter`** in `apps/api/src/routers/expenses.ts` targets **`expense_reports`** / line items for finance-style reporting; it is **not** mounted on `appRouter` until a consumer is wired — avoids two top-level `expenses` trees. |
| **India compliance + CSM** | Portal users and TDS/ECR live under **`indiaCompliance.*`**. Use the typed `trpc` client; CI includes parity checks and a test that forbids `(trpc as any)` in `apps/web`. |
| **`mac` router** | Mounted for **managed endpoint / automation** flows (not the main Next.js sidebar). |
| **`customFields` router** | Phase 7 **definitions + values** API; CMDB/tickets send `customFields` payloads without a dedicated admin UI path yet. |
| **Payslip PDF** | Browser: `/api/payroll/payslip-pdf/<payslipId>` (Next proxy) → API `GET /payroll/payslip-pdf/<id>`. Only the payslip’s employee may download. |
| **Payroll run pipeline** | `payroll.runs.lockPeriod` (draft → period locked + run totals), `advanceComputationStep` (gross → TDS), `computePayslips` (persist `payslips` rows), then HR / Finance / CFO approvals. |
| **AP / AR invoices** | `invoices.invoice_flow` is `payable` or `receivable`. `financial.listInvoices` filters by optional `direction`. AP UI uses `direction: "payable"`; receivable rows appear when created (customer AR UIs TBD). |

## Quick Start (Development)

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9
- Docker Desktop

```bash
# Clone and install
git clone https://github.com/coheron/nexusops
cd nexusops
pnpm install

# Start infrastructure (Postgres on host port 5434, Redis, Meilisearch, MinIO, Temporal, MailHog)
make docker-up
# Wait until Postgres is healthy (first run may take a minute)

# Environment
cp .env.example .env
# Set strong secrets (required for auth sessions and field encryption):
#   AUTH_SECRET=$(openssl rand -hex 32)
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
# Defaults in .env.example already point at localhost:5434 and local services.

# Database — apply versioned SQL migrations (recommended after clone or pull)
pnpm db:migrate
# Optional: load demo orgs, users, tickets, etc.
pnpm db:seed
# For rapid schema experiments only (can diverge from migrations): make db-push

# Optional: confirm every tRPC path used by the web app exists on the API
pnpm check:trpc-parity

# Start API + web (+ other dev tasks via Turbo)
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
| **CI-equivalent (Turbo + all Playwright)** | With test stack up and **`.env.test`**: `pnpm exec dotenv -e .env.test -- pnpm test` then `pnpm exec dotenv -e .env.test -- pnpm exec playwright test` (same split as **`.github/workflows/ci.yml`** jobs **`test`** + **`e2e`**) |

**Vitest** applies **`pnpm db:migrate`** once before workers (`apps/api/src/__tests__/global-setup.ts`) whenever **`.env.test`** defines `DATABASE_URL`, so schema-based tests see migrated tables. **`pnpm check:trpc-parity`** skips that migrate step (no DB required).

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
