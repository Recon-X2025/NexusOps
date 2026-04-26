# NexusOps — Product reference (what is built end-to-end)

**Audience:** Product, engineering, solutions, and anyone who needs a single map of shipped capabilities — not a marketing pitch.

**Scope:** This document reflects the **NexusOps monorepo** as of the repo layout: web app, API, workers, packages, and documented surfaces. Feature depth varies by module; items listed here have **code + routing** (UI and/or tRPC) unless noted as infra-only.

---

## 1. What NexusOps is

**NexusOps** is an enterprise operations platform from **Coheron**: ITSM (service desk, change, problems, events), assets and CMDB, HR service delivery, procurement and finance touchpoints, security and GRC, legal and secretarial (incl. India compliance patterns), CRM/CSM, projects and application portfolio management, knowledge, DevOps telemetry, workflows with an optional **Temporal** backend, AI-assisted features, and self-hostable deployment (Docker / Helm).

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
| `packages/db` | Drizzle schemas, SQL migrations, seeds |
| `packages/types` | Shared types — **RBAC matrix** (`Module`, `SystemRole`, permissions) |
| `packages/metrics` | Command Center **metric registry** (`MetricDefinition`, contributions, role views) |
| `packages/ui` | Shared UI primitives / error boundary |
| `packages/config` | Shared ESLint / TS / Prettier |
| `packages/cli` | NexusOps CLI |
| `infra/`, `charts/nexusops/` | Terraform, Temporal config, Helm |
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
| 12 | PMO | `/app/workbench/pmo` | PMO Lead | Portfolio matrix (impact × confidence) | blue (light) |

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
| Walk-up | `/app/walk-up` |

**Backend:** `hr`, `recruitment`, `workforce`, `payroll`, `performance`, `facilities`, `walkup`, etc.

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
| Expenses | `/app/expenses` |

**Backend:** `procurement`, `financial`, `accounting`, `contracts`, `vendors`, `expenseReports` (finance reports; distinct from `hr.expenses` claims — see root `README.md`).

### 4.7 Legal & Governance

| Area | Routes |
|------|--------|
| Hub | `/app/legal-governance` |
| Legal | `/app/legal` |
| Secretarial & CS | `/app/secretarial` (board, filings, share capital, registers, calendar) |

**Backend:** `legal`, `secretarial`, `grc` (where shared), India compliance via `indiaCompliance` router.

### 4.8 Strategy & Projects

| Area | Routes |
|------|--------|
| Hub | `/app/strategy-projects` |
| Projects | `/app/projects` |
| Application portfolio | `/app/apm` |
| Reports & analytics | `/app/reports` |

**Backend:** `projects`, `apm`, `reports`, `dashboard`.

### 4.9 Developer & Ops

| Area | Routes |
|------|--------|
| Hub | `/app/developer-ops` |
| DevOps | `/app/devops` |
| Knowledge | `/app/knowledge` |

**Backend:** `devops`, `knowledge`.

### 4.10 Settings & setup

- Integrations, omnichannel, webhooks, API keys under `/app/settings/*`
- Setup wizard `/app/onboarding-wizard`

**Backend:** `integrations`, `admin`, `auth`, etc.

---

## 5. tRPC API routers (backend capability index)

Routers are composed in `apps/api/src/routers/index.ts`. This is the authoritative list of **named API namespaces** exposed to the web (and other clients):

`auth`, `admin`, `tickets`, `assets`, `workflows`, `hr`, `procurement`, `dashboard`, `workOrders`, `changes`, `security`, `grc`, `financial`, `contracts`, `projects`, `crm`, `legal`, `devops`, `surveys`, `knowledge`, `notifications`, `catalog`, `csm`, `apm`, `oncall`, `events`, `facilities`, `walkup`, `vendors`, `approvals`, `reports`, `search`, `ai`, `indiaCompliance`, `assignmentRules`, `inventory`, `recruitment`, `secretarial`, `workforce`, `integrations`, `mac`, `performance`, `accounting`, `customFields`, `payroll`, `expenseReports`, `commandCenter`, `workbench`.

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

## 9. Documentation & specs in-repo

| Asset | Purpose |
|--------|---------|
| Root `README.md` | Runbooks, ports, env, API notes (expenses vs expense reports, payroll PDF, etc.) |
| `apps/docs` | Nextra docs site; build/static export scripts where configured |
| `NexusOps_API_Specification.md` | API/procedure documentation (if maintained alongside code) |
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
