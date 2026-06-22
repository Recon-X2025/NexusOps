# CoheronConnect — Product reference (what is built end-to-end)

**Audience:** Product, engineering, solutions, and anyone who needs a single map of shipped capabilities — not a marketing pitch.

**Scope:** This document reflects the **CoheronConnect monorepo** as of the repo layout: web app, API, workers, packages, and documented surfaces. Feature depth varies by module; items listed here have **code + routing** (UI and/or tRPC) unless noted as infra-only.

---

## 1. What CoheronConnect is

**CoheronConnect** is an enterprise operations platform from **Coheron**: ITSM (service desk, change, problems, events), assets and CMDB, HR service delivery, procurement and finance touchpoints, security and GRC, legal and secretarial (incl. India compliance patterns), CRM/CSM, the **Strategy Center** (initiatives, portfolio shape, application landscape), knowledge, DevOps telemetry, workflows with an optional **Temporal** backend, AI-assisted features, and self-hostable deployment (Docker / Helm).

Primary interaction is the **web app** (`apps/web`). A **mobile** client (`apps/mobile`) and **managed-account console** (`apps/mac`) also exist.

---

## 2. Repository map

| Path | Role |
|------|------|
| `apps/web` | Main product UI — Next.js App Router, React 19, Tailwind, tRPC client, RBAC-aware navigation |
| `apps/api` | Backend — Fastify + **tRPC** routers, Drizzle/Postgres, permission procedures |
| `apps/worker` | Background jobs — BullMQ / Redis consumers |
| `apps/docs` | Documentation site (Nextra) — operator/developer docs |
| `apps/mobile` | Expo / React Native — tRPC consumer |
| `apps/mac` | Coheron managed-account console (Next.js) — uses `mac` router |
| `packages/db` | Drizzle schemas, SQL migrations, dynamic seeds (Faker.js) |
| `packages/types` | Shared types — **RBAC matrix** (`Module`, `SystemRole`, permissions) |
| `packages/metrics` | Command Center **metric registry** (`MetricDefinition`, contributions, role views) |
| `packages/ui` | Shared UI primitives / error boundary |
| `packages/config` | Shared ESLint / TS / Prettier |
| `packages/cli` | CoheronConnect CLI |
| `infra/`, `charts/coheronconnect/` | Terraform, Temporal config, Helm |
| `docker-compose.*.yml` | Dev, test, prod compose stacks |

**Local dev (typical):** Web `http://localhost:3000`, API `http://localhost:3001`, docs dev server often `3003`. Full bootstrap: `pnpm dev:stack` / `make dev-stack` (see root `README.md`).

---

## 3. Technology stack (summary)

| Layer | Technology |
|--------|------------|
| Web | Next.js, React 19, TypeScript, Tailwind, Radix |
| API | Fastify, tRPC v11, Zod |
| ORM / DB | Drizzle, PostgreSQL |
| Auth | Better Auth–family patterns; SAML/OIDC supported in product direction |
| Workflow engine | Temporal.io (optional strict mode via env) |
| Cache / queue | Redis, BullMQ |
| Search | Meilisearch |
| Object storage | S3-compatible (e.g. MinIO locally) |
| AI | Anthropic Claude (via API) |
| Workflow UI | React Flow |

---

## 4. Product surface — navigation hubs (web)

The sidebar groups in `apps/web/src/lib/sidebar-config.ts` define the **primary product map**. Each group has an **overview** route plus module links.

### 4.1 Platform

- **Command Center** — Default executive overview (`/app/command`), gated by `command_center.read`: health score, AI-grounded narrative (with deterministic fallback), functional heatmap, bullets, trends, throughput flow, and risk/attention queues fed by the shared metrics registry (`packages/metrics`) and `commandCenter` tRPC router. This surface replaces the old flat “platform dashboard” as the front door; **`/app/dashboard` redirects to `/app/command`** (308) for bookmarks.
- **Workbenches** — 12 persona-driven daily-work surfaces under `/app/workbench/<key>` (see §4.2). Each workbench aggregates several existing routers via the `workbench` tRPC router (`workbench.<key>` procedure) with per-source timeouts and graceful `no_data` fallback, gated by the new `workbench` RBAC module. Old hub URLs (`/app/it-services`, `/app/security-compliance`, …) **308-redirect** to the user's default workbench (mapping in `packages/types/src/workbench-defaults.ts`).
- **Administration** — `/app/admin` (admin role), custom fields `/app/admin/custom-fields`, onboarding wizard, settings integrations.

### 4.1a Workbench layer — persona daily surfaces

Workbenches sit between the executive Command Center (`/app/command`) and the contributor module routes (`/app/tickets`, `/app/changes`, …). They are not dashboards: every panel surfaces an action the operator can take, not a chart of the past. Each workbench has a **distinct primary visual** (no shared template) and a **distinct "next action" right rail**.

| # | Workbench | Route | Persona | Primary visual | Accent |
|---|---|---|---|---|---|
| 1 | Service Desk | `/app/workbench/service-desk` | IT Service Desk Manager | Live queue table with SLA countdown | blue |
| 2 | Change & Release | `/app/workbench/change-release` | Change Manager | 14-day change calendar with collisions | violet |
| 3 | Field Service | `/app/workbench/field-service` | Dispatcher | Dispatch board (state lanes) | cyan |
| 4 | SecOps | `/app/workbench/secops` | Security Analyst (lead) | Alert triage stream + MITRE chips | rose |
| 5 | GRC | `/app/workbench/grc` | GRC Analyst | Control coverage matrix | indigo |
| 6 | HR Ops | `/app/workbench/hr-ops` | HR Operations Manager | Employee journey strip | emerald |
| 7 | Recruiter | `/app/workbench/recruiter` | Recruiter | Pipeline funnel + interview load | teal |
| 8 | CSM | `/app/workbench/csm` | Customer Success Manager | Account portfolio (ARR × health) | amber |
| 9 | AP / AR | `/app/workbench/finance-ops` | AP/AR Manager | Dual-pane aging buckets (AP vs AR) | slate |
| 10 | Procurement | `/app/workbench/procurement` | Buyer / Procurement Manager | Open POs Kanban | orange |
| 11 | Company Secretary | `/app/workbench/company-secretary` | Company Secretary | Compliance calendar (filings + meetings) | violet (light) |
| 12 | PMO | `/app/workbench/pmo` | PMO Lead | Portfolio matrix · milestones at risk · cross-project dependencies | blue (light) |

**Backend:** `workbench.serviceDesk`, `workbench.changeRelease`, `workbench.fieldService`, `workbench.secops`, `workbench.grc`, `workbench.hrOps`, `workbench.recruiter`, `workbench.csm`, `workbench.financeOps`, `workbench.procurement`, `workbench.companySecretary`, `workbench.pmo`. Each procedure delegates to a payload builder under `apps/api/src/services/workbench-payloads/*` that runs source queries in parallel through `runPanel` (3s default timeout) and returns a `WorkbenchEnvelope` with the right-rail action queue plus per-panel `Panel<T>` results.

**Sidebar:** workbenches appear above the divider in each hub group; module routes remain below the divider for direct navigation. Default workbench per role is in `packages/types/src/workbench-defaults.ts`.

### 4.2 IT Services

| Area | Representative routes |
|------|------------------------|
| Hub | `/app/it-services` |
| Service desk | `/app/tickets`, major incidents, war-room links |
| Change & problem | `/app/changes`, `/app/problems`, `/app/releases` |
| Field service | `/app/work-orders`, parts, on-call |
| IT operations | `/app/events`, `/app/cmdb` |
| Assets | `/app/ham`, `/app/sam` |

**Backend:** `tickets`, `changes`, `workOrders`, `events`, `assets` (and related), `oncall`, etc.

### 4.3 Security & Compliance

| Area | Routes |
|------|--------|
| Hub | `/app/security-compliance` |
| SecOps | `/app/security` |
| GRC | `/app/grc`, `/app/esg` |
| Approvals & workflows | `/app/approvals`, **Flow Designer** `/app/flows` |

**Backend:** `security`, `grc`, `approvals`, `workflows` (Temporal integration on publish).

### 4.4 People & Workplace

| Area | Routes |
|------|--------|
| Hub | `/app/people-workplace` |
| HR | `/app/hr`, employee portal/center, leave, attendance, expenses, holidays, OKRs |
| Recruitment | `/app/recruitment` (tabs: requisitions, pipeline, candidates, interviews, offers) |
| Workforce analytics | `/app/people-analytics` |
| Performance | `/app/performance` |
| Facilities | `/app/facilities` |

**Backend:** `hr`, `recruitment`, `workforce`, `payroll`, `performance`, `facilities`, etc.

> **Walk-Up Experience** was retired in 2026-04 (see Architecture Design changelog 1.10). In-person visits are now captured as a `walk_in` channel value on a regular `tickets` row — the dispatcher uses the same Service Desk workbench as every other channel. The `walkup_*` tables, router, schema, and `/app/walk-up` page were dropped (migration `0028_optimal_sinister_six.sql`).

### 4.5 Customer & Sales

| Area | Routes |
|------|--------|
| Hub | `/app/customer-sales` |
| CSM | `/app/csm` |
| CRM | `/app/crm` |
| Catalog | `/app/catalog` |
| Surveys | `/app/surveys` |

**Backend:** `csm`, `crm`, `catalog`, `surveys`.

### 4.6 Finance & Procurement

| Area | Routes |
|------|--------|
| Hub | `/app/finance-procurement` |
| Procurement & finance | `/app/procurement`, `/app/financial` |
| Accounting | `/app/accounting` |
| Vendors | `/app/vendors` |
| Contracts | `/app/contracts` |
| Employee expense self-serve | `/app/hr/expenses` (employee files own claims via `hr.expenses.createMine` / `listMine`) |
| Finance expense queue | `/app/finance/expenses` (review / approve / reject / reimburse — gated by `financial.write`) |

**Backend:** `procurement`, `financial`, `accounting`, `contracts`, `vendors`, `expenseReports` (finance reports; distinct from `hr.expenses` claims — see root `README.md`).

> **Expense routes are intentionally split.** The employee surface (`/app/hr/expenses`) only allows the authenticated user to create / read **their own** claims — `employeeId` is resolved server-side from `users.id → employees.userId`, so an IC without `hr.write` can still file. The finance queue (`/app/finance/expenses`) is a separate page gated by `financial.write` and exposes the cross-org review/approve/reimburse workflow, including a mandatory rejection-reason capture (min 4 chars) shown to the employee. The same `expense_claims` table backs both surfaces; the split exists at the **route + permission** level, not the data level.

### 4.7 Legal & Governance

| Area | Routes |
|------|--------|
| Hub | `/app/legal-governance` |
| Legal | `/app/legal` |
| Secretarial & CS | `/app/secretarial` (board, filings, share capital, registers, calendar) |

**Backend:** `legal`, `secretarial`, `grc` (where shared), India compliance via `indiaCompliance` router.

### 4.8 Strategy Center

The **Strategy Center** is the executive surface for portfolio shape and initiative health. It is positioned as a leadership / PMO instrument — not a contributor task tool — and pairs with the **PMO workbench** (`/app/workbench/pmo`) for daily portfolio governance.

| Area | Routes |
|------|--------|
| Hub | `/app/strategy` |
| PMO workbench | `/app/workbench/pmo` |
| Initiatives | `/app/projects` (Portfolio View · All Initiatives) |
| Reports & analytics | `/app/reports` |

**Surface focus:** initiatives (status, phase, health, owner), milestones, dependencies, benefits/outcomes, portfolio rollups (`portfolioHealth`).

**Backend:** `projects`, `reports`, `dashboard`.

> Legacy bookmarks to `/app/strategy-projects` 308-redirect to `/app/strategy`.

### 4.9 Knowledge

| Area | Routes |
|------|--------|
| Knowledge Base | `/app/knowledge` |

**Backend:** `knowledge`.

### 4.10 Settings & setup

| Area | Routes |
|------|--------|
| Integrations | `/app/settings/integrations` |
| Omnichannel | `/app/settings/omnichannel` |
| Webhooks | `/app/settings/webhooks` |
| API Keys | `/app/settings/api-keys` |
| **App Inventory** | `/app/apm` — register of business applications (name, owner, vendor, annual cost, renewal) |
| Setup wizard | `/app/onboarding-wizard` |

**Backend:** `integrations`, `admin`, `auth`, `apm` (App Inventory).

---

## 5. tRPC API routers (backend capability index)

Routers are composed in `apps/api/src/routers/index.ts`. This is the authoritative list of **named API namespaces** exposed to the web (and other clients):

`auth`, `admin`, `tickets`, `assets`, `workflows`, `hr`, `procurement`, `dashboard`, `workOrders`, `changes`, `security`, `grc`, `financial`, `contracts`, `projects`, `crm`, `legal`, `devops`, `surveys`, `knowledge`, `notifications`, `catalog`, `csm`, `apm`, `oncall`, `events`, `facilities`, `vendors`, `approvals`, `reports`, `search`, `ai`, `indiaCompliance`, `assignmentRules`, `inventory`, `recruitment`, `secretarial`, `workforce`, `integrations`, `mac`, `performance`, `accounting`, `customFields`, `payroll`, `expenseReports`, `esign`, `documents`, `commandCenter`, `workbench`.

> The `walkup` router was retired in 2026-04 along with the rest of the Walk-Up Experience module. Tenants migrating from earlier builds should drop any client integration against `walkup.*` and create regular `tickets.create` entries with `channel = "walk_in"`.

**Cross-cutting:** Many mutations write **audit logs** (sanitized). Admin can list audit entries via `admin` procedures.

---

## 6. Access control (RBAC)

- **Modules** and **roles** are defined in `packages/types` (`rbac-matrix.ts`).
- **Web:** `RBACProvider`, `useRBAC`, route gates, sidebar visibility by module.
- **API:** `permissionProcedure("module", "action")` on routers.
- Roles include `admin`, ITIL family, `security_analyst`, `grc_analyst`, HR/procurement/finance managers, `legal_counsel`, `company_secretary`, `requester`, `report_viewer`, field/operator roles, etc.

Use the matrix file when answering “who can do what?”

---

## 7. Data & persistence

- **PostgreSQL** is the system of record; schema lives in `packages/db` with versioned migrations.
- **Redis** for sessions/cache/queues (depending on deployment).
- **Meilisearch** for search experiences.
- **S3-compatible** storage for attachments and exports where implemented.

---

## 8. Async & integrations

- **Temporal** — workflow runs when publishing automation flows; can be required via `NEXUSOPS_WORKFLOW_ENGINE_REQUIRED` / `WORKFLOW_ENGINE_REQUIRED`.
- **Workers** — `apps/worker` for queued processing.
- **Integrations router** — external system hooks (see settings UI and `integrations` router).

---

## 8a. Production-readiness infrastructure (2026-04)

The following capabilities were added during the GA hardening pass for the Indian mid-market segment. They are infra-level — most have no direct user-visible surface, but they are required for any tenant that is signing legally-binding contracts, accepting walk-in tickets through real channels, or storing files containing PII.

### 8a.1 Integrations admin UI (tenant-managed credentials)

Route: `/app/settings/integrations`. Backend: `integrations.providerCatalog`, `integrations.upsertIntegration`, `integrations.testIntegration`, `integrations.disconnectIntegration` in `apps/api/src/routers/integrations.ts`.

The catalog of supported integrations is now declared **server-side** in the `integrations` router (`PROVIDER_CATALOG`), and the admin UI dynamically renders forms from that catalog — adding a new integration requires only an entry in the catalog plus an adapter in `apps/api/src/services/integrations/`. Currently catalogued: Slack, Microsoft Teams, Email (SMTP), Jira, SAP, **WhatsApp (AiSensy)**, **SMS (MSG91)**, **Razorpay**, **ClearTax GST (IRN)**, **Google Workspace**, **Microsoft 365**, **eMudhra Aadhaar e-Sign**.

All credentials are encrypted at rest with AES-256-CBC using a per-tenant DEK wrapped against `INTEGRATIONS_KMS_KEY_ID` (`apps/api/src/services/encryption.ts`).

### 8a.2 E-sign (Aadhaar e-Sign / DSC) — eMudhra adapter

`apps/api/src/services/esign/emudhra.ts` implements the eMudhra ASP contract (init, sign, fetchStatus, fetchSignedDocument, verifyCallback). Webhook callbacks land at `POST /webhooks/esign/emudhra` and are HMAC-verified against the per-tenant `webhookSecret`. The legally-binding signed PDF + audit trail are persisted to `signature_requests` / `signature_audit` (8-year retention per IT Act §3A and Companies Act 2013).

Production credentialing and the design-partner sandbox dry-run procedure are documented in **`docs/EMUDHRA_PRODUCTION_RUNBOOK.md`**.

### 8a.3 Document virus scanning

`apps/api/src/workflows/virusScanWorkflow.ts` runs a BullMQ consumer (`coheronconnect-doc-virusscan`) that streams every uploaded document to a ClamAV `clamd` sidecar via the INSTREAM TCP protocol. Outcomes (`clean | infected | skipped | failed`) are written to `documents.scanStatus` + `documents.scanResult` (JSONB). When ClamAV is not configured the worker emits `skipped` rather than blocking uploads — set `VIRUS_SCAN_DISABLED=true` to opt out entirely.

### 8a.4 Document retention sweeper

`apps/api/src/workflows/documentRetentionWorkflow.ts` runs a daily BullMQ cron (`coheronconnect-doc-retention`) that hard-deletes soft-deleted documents past their per-policy retention window. Documents on `legalHold` are **never** swept. The S3 object is removed first, then the DB rows (`documents` + `document_versions`), then an `audit_logs` entry is appended. Admins can trigger an out-of-band sweep via `documents.runRetentionSweepNow` (admin-only).

### 8a.5 Webhook hardening

`apps/api/src/http/webhooks.ts` enforces (in this order, per request):

1. **CORS / browser origin block** — any request with an `Origin` header is rejected 403 (webhooks are server-to-server only).
2. **OPTIONS rejection** — preflight is rejected 405 so misconfigured providers fail loudly.
3. **Strict security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`, `Cache-Control: no-store`.
4. **Per-provider IP allowlist** — `WEBHOOK_ALLOWLIST_EMUDHRA`, `WEBHOOK_ALLOWLIST_AISENSY`, `WEBHOOK_ALLOWLIST_RAZORPAY` are CIDR-aware comma-separated env vars. Empty allowlist → accept-all (rely on HMAC); set the env var to lock down to provider-published ranges.
5. **HMAC verification** — provider-specific secret + signature header validated by `services/encryption.ts:verifyHmac` in constant time.

### 8a.6 E2E spec for the e-sign callback path

`e2e/esign-webhook.spec.ts` is the canonical happy-path + negative-path Playwright suite for the eMudhra webhook receiver: configure creds → seed signature envelope → POST simulated callback → assert row flips to `completed` and `signature_audit` is appended. Failure of this spec means contracts will never auto-close after eMudhra signs — treat as P0.

### 8a.7 Walk-Up Experience retired

The Walk-Up Experience module (`/app/walk-up`, `walkup` router, `walkup_*` schema) was retired in this pass. Walk-in visits are now a regular `tickets` row with `channel = "walk_in"`; the dispatcher works them in the Service Desk workbench. Migration `0028_optimal_sinister_six.sql` drops the `walkup_appointments` and `walkup_visits` tables and the associated enums.

---

## 8b. Feature flags (client surface)

Client-side feature flags are declared in `apps/web/src/lib/feature-flags.ts` and read from `NEXT_PUBLIC_*` environment variables. They control which surfaces render on the web app without removing routers, schemas, or tRPC procedures.

| Flag | Env var | Default | Effect when enabled |
|------|---------|---------|---------------------|
| `TASK_BOARD_ENABLED` | `NEXT_PUBLIC_ENABLE_TASK_BOARD` | off | Adds an additional contributor-level task board surface inside the Strategy Center for tenants that want it. The default Strategy Center experience is initiative- and portfolio-shaped only. |
| `DEVOPS_ENABLED` | `NEXT_PUBLIC_ENABLE_DEVOPS` | off | Restores the `/app/devops` and `/app/developer-ops` surfaces (CI/CD pipelines, deployments, DORA telemetry). Default product positions stop at change-management; pipeline telemetry lives in the customer's CI provider. |
| `APM_ENABLED` | `NEXT_PUBLIC_ENABLE_APM` | off | Expands `/app/apm` from the default lightweight **App Inventory** (name · owner · vendor · cost · renewal) into the full enterprise-architecture surface (Lifecycle, Tech Debt, Cloud Readiness, Capability Map). |

Flags are intentionally additive: turning a flag off restores the canonical default product surface; turning it on does not weaken any RBAC check.

---

## 9. Documentation & specs in-repo

| Asset | Purpose |
|--------|---------|
| Root `README.md` | Runbooks, ports, env, API notes (expenses vs expense reports, payroll PDF, etc.) |
| `apps/docs` | Nextra docs site; build/static export scripts where configured |
| `CoheronConnect_API_Specification.md` | API/procedure documentation (if maintained alongside code) |
| `docs/USER_STORIES_GAP_CLOSURE_BACKLOG.md` | Backlog / gap tracking |
| `docs/PRODUCT_REFERENCE.md` | **This file** — end-to-end product map |

---

## 10. How to keep this document useful

1. **When you add a new tRPC router** — append to §5 and mention the primary UI route in §4 if applicable.
2. **When you add a sidebar entry** — update §4 from `sidebar-config.ts`.
3. **When you change RBAC modules** — sync §6 with `packages/types/src/rbac-matrix.ts`.

---

## 11. Disclaimer

This reference describes **what exists in the codebase structure and routing**. It does not certify regulatory compliance, production readiness of every path, or completeness of every workflow for every tenant. For deployment and security hardening, use `README.md`, Helm charts, and your org’s runbooks.
