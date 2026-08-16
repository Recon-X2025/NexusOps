# CoheronConnect by Coheron

> A multi-tenant **Enterprise Operations Platform** for the India market — payroll & statutory
> tax, HR service delivery, ITSM, finance & procurement, CRM, IT-asset, and governance/privacy,
> in one product, each customer isolated as its own tenant.

**Production:** [connect.coheron.tech](https://connect.coheron.tech) · **Repo:** [github.com/Recon-X2025/NexusOps](https://github.com/Recon-X2025/NexusOps)

## What it is

CoheronConnect brings the operational back office of a company onto one tenanted platform. The
**standout is India payroll & statutory tax** — PF, ESI, professional tax (data-driven across 36
states), TDS across both regimes, gratuity, and leave encashment are production-grade,
test-backed money-math wired into a 14-step payroll run with server-enforced segregation of
duties. Around that sit HR service delivery, an ITSM ticket/change/problem engine, double-entry
accounting with GST, procurement, CRM, IT-asset management, secretarial/legal, and a DPDP
privacy layer.

The platform is **near its first production milestone**: a pilot cohort of paying customers
onboarding for their first real payroll and GST cycle (see **[Roadmap](#roadmap--where-it-is-headed)**).
The engineering reality across the breadth is uneven — some clusters are production-grade and
reachable end-to-end, others carry an excellent engine behind a partial or missing UI. The honest,
`file:line`-cited, per-module breakdown (with reachability-weighted completion percentages) lives
in **[`docs/audits/module-completion-reachability_2026-08-15.md`](docs/audits/module-completion-reachability_2026-08-15.md)** —
read it before making a capability claim.

## Architecture

```
coheronconnect/
├── apps/
│   ├── web/              # Next.js 16 App Router (React 19, TypeScript, Tailwind) — primary product UI
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
| Frontend | Next.js 16 (web) / 15 (mac console) + React 19 + TypeScript |
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

Status reflects **reachability**, not code existence: **REAL** (core workflows work end-to-end
through the product), **PARTIAL** (usable, with a named gap a customer will hit), **STUB** (inert,
fabricated, or an engine with no UI path to it). The recurring pattern across the platform is
*correct data model, and often a correct engine, behind a partial or missing UI* — the schema
stores the right thing and the money-math is frequently production-grade, but the last mile (a
button, a screen, a config editor, a downloadable file) is where reachability breaks. Verdicts
below are from the 2026-08-15 reachability audit; the per-feature `file:line` detail and completion
percentages are in **[`docs/audits/module-completion-reachability_2026-08-15.md`](docs/audits/module-completion-reachability_2026-08-15.md)**.

| Module / cluster | Status | Notes |
|---|---|---|
| Payroll & Statutory (India) | REAL | The strongest cluster. PF/ESI/PT (36-state, data-driven)/TDS (both regimes)/gratuity/leave-encashment are production-grade and test-backed, wired into a 14-step run with segregation of duties. The approval chain is configurable to **two or three steps** (never one) so a company with no CFO can complete a run; segregation is unchanged at either length, and the length is fixed per run at creation. **Gaps:** statutory filings (ECR/ESI/PT/24Q) exist only as records — no downloadable file; the chain length is API-only (no Admin Console screen yet). |
| People Ops (HR) | REAL | Cases, onboarding/offboarding/lifecycle, leave (per-type balances, maternity non-debiting), attendance, OKR with a real rollup engine, F&F settlement. Offboarding now revokes the platform login automatically, one handover day after the last working day. Leave policies are created and edited in-product. **Gaps:** document attachments are filename-only (no object storage in the deployed stack); a login with no employee record still gets an unhelpful 404 when requesting leave. |
| Governance (audit / approvals) | REAL | Record identifiers (case, expense-report, finding, SLA and five more) are unique per tenant and allocated atomically — previously several were minted randomly or by row count and could collide.  Approvals with optimistic concurrency; tamper-evident audit **hash-chain** over all mutations, with anchor-based tail-truncation detection (`audit-hash.ts`). Covers mutations, not reads; not an external WORM store. |
| Recruitment / Performance / Workforce Analytics | REAL | Requisitions→offers, review cycles, and headcount/tenure/attrition analytics all reachable end-to-end. |
| Platform (workflow / integrations) | PARTIAL | Visual workflow engine (Temporal) + a real HMAC-signed outbound **webhook dispatcher** that fires. Integration Hub: **11 of 13 connectors real** (Teams + SMTP are store-only). **Gaps:** most advertised webhook events are never emitted; API keys are created with a prefix the auth layer rejects (unusable). |
| ITSM — Tickets / Changes / Problems / CMDB | PARTIAL | Ticket lifecycle, CAB change approval, problem/KEDB, and CMDB (impact + cycle detection) are real. **Gaps:** SLA-pause reasons not reachable from the ticket UI; on-call is largely a shell (no member/chain entry, "Page Now" pages nobody); major-incident war room can't be written to; releases render a thin table. |
| Finance — Accounting / GST | PARTIAL | Invoices (AP/AR) post a balanced GL journal atomically; GST + GSTR-1 rate grouping are real (no 18% hardcode). **Gaps:** the sidebar Journal creates drafts with **no Post control** (entries never reach balances); GL debit/credit columns are blank; **balance sheet has no screen**; bank reconciliation has no tie-out. |
| Procurement | PARTIAL | PR→PO with a creation-time value gate, server GST, and a balanced accrual journal. **Gaps:** goods-receipt is a status stamp (no GRN UI); the **3-way match engine is real but unreachable** through the product. |
| IT Asset (ITAM / SAM) | PARTIAL | Hardware/software registers + license seat management real. **Gaps:** **asset depreciation engine is orphaned** (no UI/nav/scheduler); SAM installed-vs-entitled reconciliation is built but unreachable. |
| CRM | PARTIAL | Accounts/contacts/deals/leads with **deterministic lead scoring (now computed + persisted)** and **lossless lead→deal conversion**. Leads capture BANT qualification at creation. **CPQ quotes are now reachable end-to-end**: a real line-item editor (qty/price/per-line discount/HSN/GST rate) with totals and the CGST-SGST-vs-IGST split computed **on the server**, the resolved place of supply shown before sending, and zero-value quotes refused at the API. **Gaps:** an account's state is free text, so a customer row that predates the state picker still needs correcting before its quotes split correctly (the editor warns when one is missing); quotes have no PDF (CSV export only) and no customer-facing send. |
| GRC / Compliance / DPDP | PARTIAL | Security incidents + CVSS→SLA escalation loop real; DPDP **DSR / consent / breach / RoPA** registers with a firing sweep. **Scope limits:** DSR erasure ships dry-run (`DPDP_ERASURE_ENABLED` off); breach notices go to the tenant's own DPO only — **never the regulator or data principals**; GRC scoring is likelihood×impact only. |
| Legal / Secretarial | PARTIAL | Matters/requests/investigations, board & directors (resolutions with vote records, DIN+KYC), share capital (PAN encrypted). **Gaps:** related-party/RoPA/real MCA21 filing are backend-only; MCA/ROC tab is a manual tracker; ESOP is a grants register with no vesting computation; "Statutory Registers" is an empty shell. |
| Self-Service Portal (consumer) | PARTIAL | Genuine self-scoped receive-only surfaces (payslips, Form 16, own leave/reviews). **Gap:** no role grants *exactly* the consumer experience — the base `requester` role over-grants HR/facilities/procurement write. |
| Command Center / Dashboards | PARTIAL | Metric payloads resolve against the real DB (empty orgs return `null`, never fabricated). Role/persona switching is disabled; failed resolvers are silently omitted. |
| ESG Reporting | STUB | 100% hardcoded, fabricated numbers, no backend — do not represent as functional. |
| AI Layer | PARTIAL | Classification, NL search, RAG copilot + deterministic dashboard narratives (Anthropic Claude API) — alpha, not production-hardened. |
| Self-Hosted Deploy / Coheron-Managed | REAL | Docker Compose + Helm + CLI; Terraform IaC for AWS/GCP/Azure. |

> **Living gap tracker:** [`docs/GAP_ANALYSIS.md`](docs/GAP_ANALYSIS.md) (module-by-module, `file:line`-cited,
> shipped-vs-open). **Per-module completion % + Real/Needs-improvement/Stub drill-down:**
> [`docs/audits/module-completion-reachability_2026-08-15.md`](docs/audits/module-completion-reachability_2026-08-15.md).
> The older dated audits (2026-07-03 platform gap set, 2026-06-30 competitive analysis) are retained
> for decision-history only in `docs/archive/`.

## Roadmap — where it is headed

Direction is set by three verified, market-split roadmap docs, each grounded in a `file:line` code
audit: **[`docs/INDIA_ROADMAP.md`](docs/INDIA_ROADMAP.md)**, **[`docs/US_ROADMAP.md`](docs/US_ROADMAP.md)**,
and **[`docs/AI_ROADMAP.md`](docs/AI_ROADMAP.md)**.

### Near term — India go-live (the current gate)
A pilot cohort of paying customers is onboarding for their first real cycle:

- **~25 August** — seven pilot customers onboard (30–80 employees each).
- **End August / early September** — the first real payroll run.
- **11 October** — first live GSTR-1 filing target.

The go-live work is reachability, not new engines: **downloadable statutory-filing artifacts**
(ECR / ESI / PT / Form 24Q — today they are records, not files), a **leave-policy configuration
UI** (today API-only), a **Post control on the sidebar journal** so entries reach the ledger, and
the five security items (DPDP, vulnerability-SLA, MFA, KMS, Postgres RLS — already largely shipped).
For the first cycle, the [`docs/MANUAL_SET.md`](docs/MANUAL_SET.md) items (statutory filing, a handful
of professional-tax states, LTA/bonus) are handled outside the system by design.

### Mid term — close the "engine exists, no UI" gaps
The platform's dominant gap class is a correct engine behind a missing screen. The mid-term push
makes them reachable: **balance sheet + P&L screens**, an **asset-depreciation UI + month-end
scheduler**, a **three-way-match / goods-receipt flow**, **SAM installed-vs-entitled reconciliation**,
**bank-reconciliation tie-out**, and **on-call chain authoring**. (The **CPQ line-item editor** was on
this list and has shipped — the GST engine is now reachable from the product.) In
parallel: DPDP automation depth (erasure beyond dry-run, once counsel-gated), **object storage for
document attachments**, and the remaining webhook event emitters.

### Market expansion — United States
A country/regime model, a US chart of accounts, QuickBooks integration, and CCPA privacy — so the
India-first tenancy generalises to a second market without forking the product. See
[`docs/US_ROADMAP.md`](docs/US_ROADMAP.md).

### AI maturity — earn the intelligence, don't fake it
A five-stage model where **AI is only allowed in once the deterministic math beneath it is provable**:
**(1) System of Records** → **(2) System of Understanding** (deterministic computation *on* the records)
→ **(3) System of Recommendation** (AI enters here, narrating Stage-2 truth) → **(4) System of Execution**
(human-in-the-loop) → **(5) Autonomous**. The principle: a recommendation is only as trustworthy as the
understanding beneath it, and that understanding must be math, not a model. See
[`docs/AI_ROADMAP.md`](docs/AI_ROADMAP.md).

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
| **Workflow publish + Temporal** | By default, **`workflows.publish`** tolerates a missing Temporal worker (degraded run metadata). Set **`NEXUSOPS_WORKFLOW_ENGINE_REQUIRED=true`** (or **`WORKFLOW_ENGINE_REQUIRED`**) in `.env` to **fail publish** with **`PRECONDITION_FAILED`** and roll back activation if Temporal cannot start the run. See `.env.example` near **`TEMPORAL_*`**. |
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
| Workflow publish returns **412 / PRECONDITION_FAILED** | You set **`NEXUSOPS_WORKFLOW_ENGINE_REQUIRED=true`** but Temporal is not reachable; fix Temporal or unset the flag for degraded publish. |
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
