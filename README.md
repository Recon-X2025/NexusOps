# CoheronConnect by Coheron

> Enterprise-grade workflow orchestration, ITSM, asset management, HR service delivery, and procurement — a self-hostable alternative to ServiceNow.

**Production:** [connect.coheron.tech](https://connect.coheron.tech) · **Repo:** [github.com/Recon-X2025/NexusOps](https://github.com/Recon-X2025/NexusOps)

## Architecture

```
coheronconnect/
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
│   └── cli/              # CoheronConnect CLI
├── charts/coheronconnect/      # Helm chart for Kubernetes deployment
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

Status is scored against category leaders, not marked "done": **REAL** (production-grade),
**PARTIAL** (usable, known gaps), **STUB** (schema/scaffold only). The historical pattern
across the platform was *correct data model, missing computation/automation* — the schema
stored the right thing, but the intelligence (depreciation, balance sheet, health scores) and
the closing of automation loops (triggers, webhooks, escalation timers) lagged. Several of
those clusters have since closed those gaps and are now REAL; the remaining PARTIAL/STUB items
are called out per row below.

| Module / cluster | Status | Notes |
|---|---|---|
| People Ops (HR) | REAL | Onboarding/offboarding/lifecycle, leave, org chart; India payroll/tax is production-grade. Gratuity and leave accrual/carry-forward now computed (`gratuity.ts`, `leave-accrual.ts`). |
| Platform (workflow / integrations) | REAL | Visual workflow engine (Temporal); scheduled triggers + outbound webhook dispatcher + generalised business-rule engine close the automation loop (`workflow-events.ts`, `webhookDispatchWorkflow.ts`). Slack/Teams/Email/Jira/SAP connectors. |
| ITSM — Ticket Engine + CMDB | REAL | Incidents/requests/problems/changes + SLA; CMDB with cycle detection. ITOM event correlation, on-call escalation timers, and deploy→incident MTTR now fire (`correlationWorkflow.ts`, `escalationWorkflow.ts`). CSAT loop in flight on `feat/csat-loop`. |
| Governance | REAL | Approvals, audit log (redacted keys) with a tamper-evident hash-chain (`audit-hash.ts`). |
| GRC / Compliance | REAL | Risks, controls, security incidents, vulnerabilities; DPDP privacy triad (consent / DSR / breach) implemented (`compliance.ts`). DPDP data-protection layer live: government IDs (Aadhaar/PAN) stored as a peppered HMAC + masked display, never raw (`lib/pii-hash.ts`, `lib/aadhaar.ts`, `lib/pan.ts`); 8-year statutory retention floor stamped on invoices/journals/payslips (`lib/retention.ts`); DSR erasure executor ships flag-off (`DPDP_ERASURE_ENABLED`, `lib/dpdp-erasure.ts`). |
| Finance / Procurement | REAL | PR→PO→invoice 3-way match; GST/GL posting with dynamic GSTR-1 rates; balance sheet (`accounting.ts`), depreciation + COGS journals, and real accrual accounts (`procurement.ts`) now posted. |
| IT Asset (ITAM / SAM) | REAL | Asset register, license management, depreciation-driven book value. SAM installed-vs-entitled (ELP) reconciliation remains a STUB. |
| CRM | PARTIAL | Accounts/contacts/deals/leads with lossless lead→deal conversion. Lead/health scoring is stored but not computed; CPQ has no tax/GST. |
| Legal / Secretarial | PARTIAL | Matters, requests, contract obligations, investigations; eMudhra signing real. DocuSign is a stub; MCA21/XBRL filing is mocked. |
| Self-Service Portal | STUB | Employee-facing portal + KB/request templates — schema/scaffold only. |
| Dashboards + Reports | PARTIAL | Real-time metrics, time-series, CSV/PDF export (empty orgs report `null`, never fabricated). Saved/scheduled reports are stubbed. |
| AI Layer | PARTIAL | Smart classification, NL search, RAG resolution copilot (Anthropic Claude API) — alpha, not production-hardened. |
| Self-Hosted Deploy | REAL | Docker Compose + Helm + CLI. |
| Coheron-Managed | REAL | Terraform IaC for AWS/GCP/Azure. |

> **Full gap detail:** `docs/PLATFORM_GAP_INDEX_2026-07-03.md` (module-by-module, `file:line`-cited)
> and `docs/COMPETITIVE_GAP_ANALYSIS_2026-06-30.md` (benchmarked vs 2026 category leaders).
> Some clusters above have advanced past those audits — the row status reflects current code.

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
| **Dashboard metrics** | **`dashboard.getMetrics`** includes org KPIs such as open incidents, AP/AR outstanding, asset counts, and (for orgs with responses) org-scoped, type-filtered **`csatScore`** / **`csatResponses`** — `null` when there are no responses, never a fabricated score (consumers: web dashboard, mobile). |
| **Workflow publish + Temporal** | By default, **`workflows.publish`** tolerates a missing Temporal worker (degraded run metadata). Set **`COHERONCONNECT_WORKFLOW_ENGINE_REQUIRED=true`** (or **`WORKFLOW_ENGINE_REQUIRED`**) in `.env` to **fail publish** with **`PRECONDITION_FAILED`** and roll back activation if Temporal cannot start the run. See `.env.example` near **`TEMPORAL_*`**. |
| **Audit logs** | Successful mutations write **`audit_logs`** with **redacted** sensitive keys (passwords, tokens, API keys, etc.) via shared sanitization in the API. **`admin.auditLog.list`** paginates entries for admins. |
| **Workflow automation loop** | Scheduled triggers + an outbound webhook dispatcher close the automation loop (commit `6bfb7bf`); the business-rule engine is generalised beyond tickets (commit `4128906`). Dispatch is best-effort and never rolls back the source mutation. |
| **ITSM loops** | **ITOM event correlation** auto-populates `itom_events.linked_incident_id` and evaluates suppression/correlation policies; **on-call escalation timers** and **deploy→incident MTTR** (via a `tickets.deploymentId` link, surfaced in `devops.doraMetrics`) are wired (commits `4128906`, `7ca2ab2`). All loops are best-effort — they never roll back the triggering write. |
| **CSAT loop** (branch `feat/csat-loop`, not yet merged) | On ticket resolve, **`services/csat.ts::triggerCsatForResolvedTicket`** mints a one-time survey invite + notifies the requester (in-app / email per config). Per-org config lives in **`csat_settings`** (`enabled`, `channel`, `suppressionWindowHours`, `expiryDays`) via **`surveys.getCsatSettings`** / **`updateCsatSettings`**. Public capture at `GET/POST /public/surveys/:token`. Aggregation is org-scoped + `type='csat'` filtered across `dashboard`, `reports`, and `csm`. |

## Run everything locally

Use this as a **checklist**. You need **two** Docker Compose files: **`docker-compose.dev.yml`** (everyday coding, Postgres **5434**) and **`docker-compose.test.yml`** (tests, Postgres **5433**). They do not share data.

### Prerequisites
- **Node.js** ≥ 20 · **pnpm** 10 (repo pins `pnpm@10.33.0`) · **Docker Desktop** (daemon running)

### A. One-time / after `git pull`

```bash
git clone https://github.com/Recon-X2025/NexusOps   # first time only
cd NexusOps
pnpm install

# Dev app env (API + web + worker against dev DB)
cp .env.example .env
# Required secrets — generate and paste into .env:
#   AUTH_SECRET=$(openssl rand -hex 32)
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
#   PII_HASH_PEPPER=$(openssl rand -hex 32)   # DPDP: HMAC pepper for Aadhaar/PAN.
#     The API fail-fasts (process.exit(1)) at startup if unset. PERMANENT — never
#     rotate once PII is written, or existing government-ID hashes stop matching.

# Test env — use committed .env.test (DATABASE_URL must point at test Postgres, e.g. localhost:5433/coheronconnect_test)
```

### B. Run the product (development stack)

```bash
# Infra: Postgres :5434, Redis, Meilisearch, MinIO, Temporal, MailHog, …
make docker-up
# wait until Postgres is healthy

pnpm db:migrate
pnpm db:seed    # Base org + users + RBAC + config (admin@coheron.com / demo1234!)

pnpm check:trpc-parity   # optional: web ↔ API procedure names (no DB)

make dev        # Turbo: API, web, and other dev tasks (see turbo.json)
```

Open **http://localhost:3000** (web), **http://localhost:3001/health** (API). Other URLs are in the table below.

**Optional apps** (not started by default in all setups):

| App | Typical command | Notes |
|-----|-----------------|--------|
| **Mobile** | `cd apps/mobile && pnpm start` | Expo; point API URL at your machine. |
| **Docs** | `pnpm --filter @coheronconnect/docs dev` | Local docs site. |
| **MAC console** | `pnpm --filter @coheronconnect/mac dev` | Managed-account UI. |
| **Worker** | Often included in **`make dev`** / Turbo | Needs Redis + same `.env` as API. |

### C. Run all automated tests (isolated test DB)

Uses **`.env.test`** + **`docker-compose.test.yml`** (Postgres **5433**, Redis **6380**, Meilisearch **7701**).

```bash
pnpm docker:test:up
pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/db db:migrate
pnpm exec dotenv -e .env.test -- pnpm test    # Turbo: all package tests (API Vitest is the bulk)
```

**Faster smoke** (compose + migrate + three API files): `pnpm test:local-ready` or `make local-test-ready`.

**Layer-by-layer API tests:** `pnpm test:layer1` … `pnpm test:layer9` (each loads `.env.test` via script).

**Full scripted QA** (includes Playwright): `pnpm test:full-qa`.

### D. CI-style verification (build + tests + optional E2E)

```bash
pnpm docker:test:up
pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/db db:migrate
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
| **Full monorepo build + API tests** | With test stack up: `pnpm docker:test:up` → `pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/db db:migrate` → **`pnpm build`** → **`pnpm exec dotenv -e .env.test -- pnpm test`**. This matches a typical local “green” run; **`pnpm lint`** may still report known gaps (e.g. mobile ESLint not wired, `packages/db` seed scripts under strict `tsc`). |

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
| API exits on startup | `DATABASE_URL` must match Docker (`postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect`). |
| API fatal-exits with `PII_HASH_PEPPER is required` | The DPDP boot guard fail-fasts when the pepper is unset. Set **`PII_HASH_PEPPER`** in `.env` (dev/prod) — in production it must be in the host `.env.production` **and** the `PII_HASH_PEPPER` GitHub secret (injected into the Vultr api container by the deploy). Use a permanent value. |
| Login fails after fresh `.env` | Regenerate `AUTH_SECRET` and restart API; existing cookies were signed with the old secret. |
| `No procedure found on path …` | Run `pnpm check:trpc-parity` and align web calls with `apps/api/src/routers`. |
| Layer tests fail on missing tables | Run `pnpm docker:test:up` then `pnpm test:local-ready` or `pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/db db:migrate`. |
| Temporal / BullMQ warnings | Optional for basic UI; ensure `TEMPORAL_ADDRESS` and `REDIS_URL` match compose if you use workflows. See **`docs/TEMPORAL_LOCAL_RUNBOOK.md`**. |
| Workflow publish returns **412 / PRECONDITION_FAILED** | You set **`COHERONCONNECT_WORKFLOW_ENGINE_REQUIRED=true`** but Temporal is not reachable; fix Temporal or unset the flag for degraded publish. |
| Security / SoD reviews | **`docs/SECURITY_SENSITIVE_MUTATIONS.md`** — API write procedure inventory. |

## Self-Hosted Production Deployment

```bash
# Single command with Docker Compose + Traefik (auto-SSL)
docker compose -f docker-compose.prod.yml up -d

# Or with Kubernetes (Helm)
helm upgrade --install coheronconnect charts/coheronconnect \
  --namespace coheronconnect \
  --create-namespace \
  --values charts/coheronconnect/values.yaml \
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
make db-seed      # Seed base org + users + RBAC + config
make db-studio    # Open Drizzle Studio
```

---

*Built by [Coheron](https://coheron.com).*
