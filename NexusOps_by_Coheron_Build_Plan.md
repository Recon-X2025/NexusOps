# NexusOps by Coheron
## ServiceNow ERP-Adjacent Platform — Complete Build Plan

---

## Executive Summary

**NexusOps** is a modular, ServiceNow-adjacent ERP platform built by **Coheron** that delivers workflow automation, procurement, HR service delivery, IT asset management, financial operations, and project portfolio management — without the $100–$200/user/month ServiceNow price tag.

It targets the gap between full-blown ERPs (SAP, Oracle, ServiceNow) and lightweight tools (Notion, Monday.com), offering enterprise-grade workflow orchestration with startup-friendly pricing.

**Deployment Models:**
- **Self-Hosted** — Client deploys on their own infrastructure (Docker/Kubernetes on any cloud or on-prem). Coheron provides the image, Helm charts, and documentation.
- **Coheron-Managed** — Coheron hosts and operates the platform for the client on AWS/GCP/Azure. Coheron handles infrastructure, scaling, backups, updates, and SLA guarantees.

---

## Part 1: What It Takes to Build This

### 1.1 Core Capabilities (Mapped to ServiceNow Modules)

| ServiceNow Module | NexusOps Equivalent | Priority |
|---|---|---|
| ITSM (Incident/Problem/Change) | Ticket Engine + Workflow Orchestrator | P0 — MVP |
| ITAM (Asset Management) | Asset Lifecycle Manager | P0 — MVP |
| HRSD (HR Service Delivery) | People Ops Hub | P1 |
| CSM (Customer Service Mgmt) | Service Desk Portal | P1 |
| SPM (Strategic Portfolio Mgmt) | Project & Portfolio Engine | P1 |
| Procurement / AP Operations | Procurement Pipeline | P2 |
| ITBM (IT Business Mgmt) | Budget & Resource Planner | P2 |
| ITOM (IT Operations Mgmt) | Infra Monitor (Integration Layer) | P3 |
| GRC (Governance/Risk/Compliance) | Compliance Vault | P3 |

### 1.2 Architectural Requirements

- **Multi-tenant SaaS + Single-tenant self-hosted** dual architecture
- **Workflow engine** — visual, drag-and-drop, condition-based routing (ServiceNow's core value)
- **CMDB-equivalent** — Configuration Management Database for assets, services, dependencies
- **Role-based access control (RBAC)** with org-hierarchy awareness
- **Plugin/module system** — customers buy only what they need
- **REST + GraphQL API layer** — for ERP/CRM integrations (SAP, Salesforce, NetSuite)
- **AI layer** — auto-classification, smart routing, resolution suggestions, NL search
- **Self-service portal** — employee/customer facing, mobile-ready
- **Audit trail + compliance logging** on every mutation
- **Real-time dashboards and reporting engine**
- **Deployment flexibility** — Docker Compose for dev, Helm/K8s for production, Coheron-managed deploy

### 1.3 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 15 + React 19 + TypeScript | SSR, RSC, fast iteration |
| UI Library | shadcn/ui + Tailwind CSS | Enterprise-grade, themeable |
| Workflow Editor | React Flow / Xyflow | Visual workflow builder |
| Backend API | Node.js (Fastify) + tRPC | Type-safe, fast, monorepo-friendly |
| Workflow Engine | Temporal.io (self-hosted) | Durable, resumable, production-proven |
| Database | PostgreSQL 16 + Drizzle ORM | Reliable, scalable, JSON support |
| Search | Meilisearch (self-hosted) | Fast, typo-tolerant, easy deploy |
| Cache/Queue | Redis + BullMQ | Job queues, caching, real-time |
| Auth | Better Auth + SAML/OIDC | Enterprise SSO support |
| File Storage | S3-compatible (MinIO for self-hosted) | Universal |
| AI Layer | LangChain + Anthropic Claude API | Smart routing, NL queries |
| Monitoring | OpenTelemetry + Grafana | Observability |
| Containerization | Docker + Kubernetes | Self-hosted & managed deploy |
| IaC | Terraform + Helm charts | Reproducible infra for both models |

### 1.4 Team & Timeline Estimate

| Phase | Duration | Team Size | Estimated Burn |
|---|---|---|---|
| Foundation (Auth, DB, Core API) | 2 weeks | 3 engineers | ~$22K |
| Ticket Engine + Workflows | 4 weeks | 4 engineers | ~$60K |
| Asset Mgmt + CMDB | 3 weeks | 3 engineers | ~$34K |
| Portal + Dashboards | 3 weeks | 3 engineers (1 FE) | ~$38K |
| HR + Procurement Modules | 4 weeks | 4 engineers | ~$60K |
| AI Layer + Integrations | 3 weeks | 3 engineers | ~$38K |
| Deployment (Self-Hosted + Coheron-Managed) | 2 weeks | 2 eng + 1 DevOps | ~$28K |
| Testing, Hardening, Docs | 2 weeks | Full team | ~$30K |
| **Total** | **~23 weeks** | **3–4 avg** | **~$310K** |

Solo developer with Cursor AI: **14–20 weeks** for MVP (P0 + P1 modules).

---

## Part 2: Build Plan — Cursor AI Prompts & Tests

Each stage: exact Cursor prompts → expected output → test suite that must pass before proceeding.

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 1: Project Scaffolding & Authentication
### Timeline: Week 1–2
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 1.1 — Monorepo Setup

```
Create a production-ready monorepo for "NexusOps" (by Coheron) using Turborepo:

1. apps/web — Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui
2. apps/api — Fastify + tRPC router, TypeScript
3. packages/db — Drizzle ORM + PostgreSQL, shared schema
4. packages/ui — Shared UI components extending shadcn/ui
5. packages/types — Shared TypeScript types + Zod schemas
6. packages/config — ESLint, Prettier, TSConfig

Requirements:
- pnpm workspaces
- Docker Compose: PostgreSQL 16, Redis 7, Meilisearch
- @t3-oss/env-nextjs for env management
- Proper tsconfig paths + exports across all packages
- Makefile: dev, build, db:push, db:migrate, db:seed, docker:up, docker:down
- .env.example with all variables documented
- Drizzle Kit for migrations
```

#### Cursor Prompt 1.2 — Foundation Database Schema

```
In packages/db, create Drizzle ORM schema:

TENANT & AUTH:
- organizations (id uuid, name, slug unique, plan enum[free/starter/professional/enterprise], 
  settings jsonb, logo_url, primary_color, created_at, updated_at)
- users (id uuid, org_id FK, email, name, avatar_url, role enum[owner/admin/member/viewer], 
  status enum[active/invited/disabled], last_login_at, created_at)
- sessions, accounts, verification_tokens (standard auth)
- api_keys (id, org_id, name, key_hash, permissions jsonb, last_used_at, expires_at)

RBAC:
- roles (id, org_id, name, description, is_system boolean)
- permissions (id, resource, action enum[create/read/update/delete/manage])
- role_permissions, user_roles (junction tables)

AUDIT:
- audit_logs (id, org_id, user_id, action, resource_type, resource_id, changes jsonb, 
  ip_address, user_agent, created_at)

Rules: UUIDs, org_id on everything, proper indexes, pgEnum for enums,
seed with "Coheron Demo" org + admin + default roles (Admin/Agent/Employee/Viewer),
Zod schemas in packages/types mirroring Drizzle.
```

#### Cursor Prompt 1.3 — Authentication System

```
Implement authentication for NexusOps:

1. packages/auth: Better Auth — email/password, magic link, Google OAuth, SAML SSO,
   Redis sessions, org-scoped, invite flow (admin email → sign up → auto-join),
   API key auth (Bearer, hash stored)

2. apps/web pages:
   - /login — email+password, magic link, Google OAuth, SSO detection
   - /signup — name, email, password, org name
   - /invite/[token] — accept invite
   - /settings/security — password, sessions, 2FA
   shadcn/ui + react-hook-form + zod, loading states, sonner toasts

3. Middleware: Next.js protecting /app/*, tRPC session+org validation,
   rate limiting (10/min login, 3/min signup)

4. RBAC: tRPC requirePermission('tickets', 'create'), 403 on unauthorized
```

#### STAGE 1 TESTS

```
Vitest + Playwright tests:

UNIT: Drizzle schemas compile, seed runs, Zod validates/rejects correctly
INTEGRATION: signup creates org+user+roles; login valid→session, invalid→401; 
  rate limit after 10 failures; session returns user+org; invite admin-only;
  expired session→401; RBAC blocks unauthorized
E2E: signup→dashboard; login valid→dashboard; login invalid→toast; 
  invite incognito flow; /app/* redirects unauthenticated
SECURITY: SQL injection sanitized, XSS escaped, HttpOnly+Secure+SameSite cookie,
  API key hashed in DB

Gate: ALL pass → proceed to Stage 2
```

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 2: Ticket Engine & Workflow Orchestrator
### Timeline: Week 3–6
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 2.1 — Ticket System

```
Build ITSM ticket management for NexusOps:

SCHEMA: ticket_categories (name, color, icon, parent self-ref), 
ticket_priorities (name, color, sla_response_minutes, sla_resolve_minutes),
ticket_statuses (name, color, category enum[open/in_progress/resolved/closed]),
tickets (org_id, number serial per org, title, description, category_id, priority_id, 
  status_id, type enum[incident/request/problem/change], requester_id, assignee_id, 
  team_id, due_date, sla_breached, tags[], custom_fields jsonb, timestamps),
ticket_comments (ticket_id, author_id, body, is_internal, attachments jsonb),
ticket_watchers, ticket_relations (blocks/blocked_by/duplicate/related),
sla_policies (conditions jsonb, response_time, resolve_time, escalation_rules)

tRPC: tickets.list (paginated, filterable, cursor-based, status counts),
.get (full+comments+watchers+relations), .create (auto-number ORG-0001, SLA clock, audit),
.update (partial, audit with diff), .addComment (internal/public), .assign, .bulkUpdate

PostgreSQL tsvector search, SLA timer on status changes, webhook emission.
```

#### Cursor Prompt 2.2 — Ticket UI

```
Ticket frontend:

/app/tickets — Left sidebar status filters with badges, sortable table 
(Number, Title, Priority dot, Status badge, Assignee avatar, Category, Created, SLA),
search, bulk actions, "New Ticket", infinite scroll, keyboard shortcuts (c/'/j/k)

/app/tickets/[id] — Left 70%: editable title, Tiptap description, chronological 
activity feed, comment composer with internal/public toggle. 
Right 30%: status/priority/assignee/category/due date/tags/SLA countdown/relations/watchers

/app/tickets/new — title, Tiptap description, category, priority, assignee, attachments,
AI category mock, submit→detail view

shadcn/ui, tRPC+React Query, optimistic updates, mobile responsive.
```

#### Cursor Prompt 2.3 — Visual Workflow Engine

```
Build visual workflow engine (NexusOps differentiator):

SCHEMA: workflows (trigger_type enum[ticket_created/updated/status_changed/scheduled/
manual/webhook], trigger_config, is_active, version), 
workflow_versions (nodes jsonb, edges jsonb),
workflow_runs (status enum[running/completed/failed/cancelled], trigger_data),
workflow_step_runs (node_id, status, input/output jsonb, timing)

TEMPORAL.IO ENGINE — Node types:
TRIGGER, CONDITION (if/else on fields), ACTION_ASSIGN (user/team/round-robin),
ACTION_UPDATE (fields), ACTION_NOTIFY (email/Slack/in-app), ACTION_WEBHOOK (HTTP POST),
ACTION_WAIT (duration/condition), ACTION_APPROVAL (pause until resolved),
ACTION_CREATE (new entity), PARALLEL_GATEWAY (fork/join), AI_CLASSIFY (Claude API)
Each = Temporal activity, 3x retry exponential backoff.

tRPC: workflows CRUD, .publish (new version, activate), .test (dry-run),
workflowRuns.list, .get (per-step detail)

UI: /app/workflows list with toggle; /app/workflows/[id]/edit — React Flow canvas,
left node palette, center canvas, right config panel, Save/Publish/Test buttons,
color-coded nodes; /app/workflows/[id]/runs history; /runs/[id] step viewer.

CRITICAL: Entity-agnostic — works with tickets, assets, HR cases, procurement.
```

#### STAGE 2 TESTS

```
TICKETS: auto-number sequential, SLA on critical, resolved_at on resolve,
internal comments hidden from requester, bulk update+audit, text search,
org-scoped numbers, SLA recalc on reopen, 50 concurrent creates no conflicts

WORKFLOWS: critical ticket→assign+notify (low ticket does NOT trigger),
parallel branches both execute, approval pause+resume, webhook mock receives POST,
dry-run no side effects, failed step 3x retry→fail→run fails,
versioning (old version for in-flight), disable→no trigger

UI: drag node→renders, connect nodes→edges, configure→save→reload persists,
test run→step viewer, publish→Active badge

PERF: 10K tickets list <500ms, 10-node workflow <5s, 100 concurrent creates

Gate: pnpm test:stage2
```

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 3: Asset Management & CMDB
### Timeline: Week 7–9
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 3.1 — ITAM + CMDB

```
Build ITAM and CMDB module:

SCHEMA: asset_types (fields_schema jsonb for custom fields per type),
assets (asset_tag unique/org, name, type_id, status enum[in_stock/deployed/
maintenance/retired/disposed], owner_id, location, purchase_date/cost, warranty, 
vendor, custom_fields jsonb, parent_asset_id self-ref),
asset_history (action enum, actor, details jsonb),
ci_items (ci_type enum[server/app/database/network/service/cloud], 
status enum[operational/degraded/down/planned], environment, attributes jsonb),
ci_relationships (depends_on/runs_on/connected_to/member_of/hosts),
software_licenses (type enum[per_seat/device/site/enterprise], total_seats, cost),
license_assignments (license_id, asset_id/user_id)

API: assets CRUD+list+assign+retire+bulkImport(CSV), 
cmdb list+getTopology(D3 graph)+impactAnalysis(upstream/downstream),
licenses list(utilization%)+assign+revoke+expiringWithin(days)

UI: /app/assets table+filters+CSV export, /app/assets/[id] detail+history+CIs+licenses,
/app/assets/new dynamic form from fields_schema, /app/cmdb D3 force graph click-to-expand,
/app/cmdb/impact/[id] blast radius tree, /app/licenses utilization dashboard,
/app/assets/import CSV upload+column mapping+preview
```

#### STAGE 3 TESTS

```
ASSETS: auto-tag AST-0001, assign→history+owner, retire blocks reassign,
CSV 100 rows all created, custom fields validated against schema
CMDB: App→depends→DB→runs_on→Server chain, impact on Server returns DB+App,
topology valid D3 JSON, circular dependency rejected
LICENSES: 10 seats full→11th blocked, revoke→freed, expiringWithin correct
UI: filter "Deployed"→updates, dynamic create form, CMDB graph+click→panel, CSV flow

Gate: pnpm test:stage3
```

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 4: Self-Service Portal & Dashboards
### Timeline: Week 10–12
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 4.1 — Portal

```
Build self-service portal (separate layout, org-branded, mobile-first):

/portal — welcome, quick actions (Report Issue, Request, My Assets, KB), 
recent requests, announcements
/portal/request/new — category cards → subcategory → dynamic form from 
request_templates table → submit creates ticket → confirmation with number+ETA
/portal/requests — user's tickets, status, SLA, click→detail+comments+reply+cancel
/portal/knowledge — kb_articles (title, content, category, tags, view_count, 
helpful_count, status enum[draft/published/archived]), searchable, "Was this helpful?",
AI search suggests articles before ticket creation
/portal/assets — assigned assets, request new (→procurement ticket), 
report issue (→incident linked to asset)

request_templates (name, category_id, fields jsonb, default_priority, default_assignee, 
workflow_id) — admin configures at /app/settings/templates, portal renders dynamically.
```

#### Cursor Prompt 4.2 — Dashboards

```
Build dashboards:

/app/dashboard — metric cards (Open, Avg Resolution, SLA %, Created Today, Unassigned),
Recharts: tickets by status donut, created vs resolved area 30d, SLA trend line 12w,
top categories bar, resolution by priority grouped bar, team workload stacked bar.
Filters: date range+team+category, all reactive. Auto-refresh 60s.

/app/reports — pre-built (SLA, Team Perf, Asset Utilization, License Compliance),
date range+grouping, CSV/PDF export, scheduled weekly/monthly email.

Backend: dashboard.getMetrics/getTimeSeries/getTopN, materialized views, 
Redis cache 5-min TTL. Real-time via SSE: live metric updates, notification bell.
```

#### STAGE 4 TESTS

```
PORTAL: submit→ticket with correct requester, My Requests own-only, KB search works,
template dynamic form, cancel→Cancelled, mobile viewport accessible
DASHBOARD: metrics match DB, create 5→Open=5, resolve 3→SLA correct,
date filter→charts update, Redis cache hit
REPORTS: SLA 30d valid, CSV correct headers/rows, scheduled cron+email mock
REAL-TIME: dashboard open→API ticket create→card updates <5s, notification on assign

Gate: pnpm test:stage4
```

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 5: HR & Procurement Modules
### Timeline: Week 13–16
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 5.1 — HR Service Delivery

```
Build People Ops module:

SCHEMA: employees (employee_id unique/org, department, title, manager_id self-ref,
employment_type, location, status enum[active/on_leave/offboarded]),
hr_cases (case_type enum[onboarding/offboarding/leave/policy/benefits/workplace/equipment],
status_id, assignee, priority, tasks),
hr_case_tasks (title, assignee, status, due_date, sort_order),
onboarding_templates (tasks jsonb [{title, assignee_role, due_offset_days}]),
leave_requests (type, start/end date, days, status enum[pending/approved/rejected/cancelled]),
leave_balances (type, year, total/used/pending days)

FEATURES: HR case CRUD (reuse ticket patterns), onboarding automation (template→case+tasks),
leave management (submit→manager approval via workflow→balance tracking),
employee directory (search, department/location filter, org chart tree),
HR dashboard (onboardings, pending leaves, cases by type, headcount, attrition)
```

#### Cursor Prompt 5.2 — Procurement

```
Build Procurement module:

SCHEMA: vendors (name, contact, terms, status, rating),
purchase_requests (number, requester, title, justification, total_amount, 
status enum[draft/pending/approved/rejected/ordered/received/closed], 
priority, department, budget_code),
purchase_request_items (description, quantity, unit_price, vendor_id, asset_type_id),
purchase_orders (po_number, vendor, amount, status enum[draft/sent/acknowledged/
partially_received/received/invoiced/paid/cancelled], expected_delivery),
po_line_items (description, quantity, unit_price, received_quantity),
invoices (number, vendor, po_id, amount, tax, status enum[pending/approved/paid/disputed]),
approval_chains (entity_type, rules jsonb [{condition, approvers, threshold}])

FEATURES: PR flow with approval thresholds (<$1K auto, $1-10K dept head, >$10K VP+finance),
PO management (approve→PO, partial receiving, receive→auto-create assets),
invoice 3-way match (PO+receipt+invoice) + discrepancy flagging,
vendor management (database, performance, preferred), 
procurement dashboard (spend analysis, approvals, PO kanban, budget utilization)
```

#### STAGE 5 TESTS

```
HR: onboarding template→tasks with dates, all tasks done→auto-resolve,
leave→manager queue, approve→balance decremented, reject→unchanged,
directory search correct, org chart hierarchy
PROCUREMENT: PR $500 auto-approved, $5K dept head, $50K VP+finance sequential,
approve→PO with items, receive→assets created, 3-way match OK,
mismatch $1K/$1.2K flagged, vendor perf from PO history
INTEGRATION: workflow triggers correct, HR case→notification, leave→calendar mock
UI: onboarding wizard, PR 3 items+total, approval queue flow, dashboard charts

Gate: pnpm test:stage5
```

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 6: AI Layer & External Integrations
### Timeline: Week 17–19
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 6.1 — AI Features

```
Add AI layer using Anthropic Claude API:

1. Smart Classification: on ticket create, analyze title+description, auto-suggest 
category/priority/assignee. Confidence >0.8 auto-apply, 0.5-0.8 suggest. 
Claude claude-sonnet-4-20250514 JSON output. Admin-editable prompts. Graceful fallback.

2. NL Search (Cmd+K /app/search): "critical tickets assigned to John last week"
→ parse → structured query → tRPC. Searches tickets/assets/CIs/KB/employees.

3. Resolution Suggestions: agent views ticket → similar resolved tickets + KB articles.
pgvector embeddings for similarity. Generate on create/resolve.

4. Conversational KB: portal question → AI searches KB → synthesized answer + citations.
No match → suggest ticket. Rate limited 10/user/hour.

5. AI Workflow Node: AI_CLASSIFY in engine, input entity data, config prompt+mapping.

packages/ai: AnthropicClient (retry, timeout, circuit breaker),
Classification/Search/Suggestion/Embedding services.
ai_usage_log (org, feature, model, tokens, latency). Feature flags per org.
/app/settings/ai — enable/disable, API key, usage stats.
```

#### Cursor Prompt 6.2 — Integrations

```
Build integration layer:

FRAMEWORK: IntegrationProvider abstract (connect/disconnect/sync/webhook),
OAuth2 handler, AES-256 encrypted credentials, dynamic registry.

BUILT-IN: 
Slack — OAuth2, channel notifications, /nexusops slash command, interactive approve/reject
Teams — webhook notifications, adaptive cards
Email (SMTP+IMAP) — inbound→ticket, outbound notifications
Jira — bidirectional sync, field/status mapping
SAP — REST adapter B1/S4HANA, sync vendors+POs+invoices

WEBHOOKS: outgoing per event, delivery log 3x retry exponential, HMAC-SHA256 signatures,
test tool in admin. 

API TOOLS: /app/settings/api keys, /app/settings/webhooks config,
/app/settings/integrations connect/disconnect, auto-generated API docs,
rate limit 1000 req/min per key.

SCHEMA: integrations (provider, status, config_encrypted, last_sync),
integration_sync_log (direction, entity_type, records, errors),
webhooks (name, url, events[], secret, is_active),
webhook_deliveries (event, payload, status_code, response, attempts, next_retry)
```

#### STAGE 6 TESTS

```
AI: "email server down"→IT/Critical (mock Claude), confidence 0.9 auto-applied / 0.6 suggested,
NL search→correct query, 5 similar resolved→suggestions appear, 
AI unavailable→ticket still created, usage log captures tokens+latency
INTEGRATIONS: Slack OAuth mock→connected→ticket→message sent, 
email inbound→ticket with subject title, Jira sync mock→issue created,
SAP vendor sync mock→vendors populated
WEBHOOKS: ticket.created→POST received, 500 response→3x retry→failed,
HMAC validates, disable→no delivery
SECURITY: credentials encrypted at rest, API key 1001st request→429

Gate: pnpm test:stage6
```

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 7: Deployment — Self-Hosted & Coheron-Managed
### Timeline: Week 20–21
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 7.1 — Self-Hosted Package

```
Create self-hosted deployment for NexusOps:

DOCKER IMAGES: nexusops/web (Next.js prod), nexusops/api (Fastify),
nexusops/worker (Temporal worker), nexusops/migrator (runs migrations then exits).
Multi-stage, non-root, health checks, <200MB each.

DOCKER COMPOSE (docker-compose.prod.yml): web, api, worker, postgres, redis,
meilisearch, temporal, minio. Traefik reverse proxy with Let's Encrypt auto-SSL.
Volumes for persistence. .env.production template.
Single command: docker compose -f docker-compose.prod.yml up -d

HELM CHART (charts/nexusops/): Deployments web/api/worker, 
StatefulSet or external DB config, ConfigMap+Secret, HPA for api+web,
Ingress with TLS, PVCs, values.yaml defaults, values-production.yaml example.

CONFIG: All via env vars (12-factor). DATABASE_URL, REDIS_URL, MEILISEARCH_URL,
TEMPORAL_ADDRESS, S3_*, AUTH_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY (optional),
SMTP_*, LICENSE_KEY (Coheron license — phone-home monthly or offline key).

CLI (nexusops-cli): migrate, seed, create-admin, backup, restore, license activate, health

DOCS: docs/self-hosted/ — quickstart.md, kubernetes.md, configuration.md, 
upgrading.md, backup-restore.md
```

#### Cursor Prompt 7.2 — Coheron-Managed Infrastructure

```
Create Coheron-managed hosting infrastructure:

TERRAFORM (infra/terraform/):
modules/aws/ — ECS Fargate or EKS, RDS PostgreSQL, ElastiCache, S3, CloudFront, ALB, ACM
modules/gcp/ — Cloud Run or GKE, Cloud SQL, Memorystore, Cloud Storage, Cloud CDN
modules/azure/ — AKS, Azure DB PostgreSQL, Azure Cache, Blob, Azure CDN
Parameterized: region, instance sizes, scaling limits.

TENANT PROVISIONING: new customer signup →
a) Create namespace in shared K8s (starter/pro) OR dedicated cluster (enterprise)
b) Provision DB (shared schema or dedicated based on plan)
c) Configure DNS: {slug}.nexusops.coheron.com
d) Run migrations + seed
e) Welcome email with admin creds
API: coheron.provisionTenant({ name, plan, region })

ISOLATION LEVELS:
Starter — shared cluster, shared DB (row-level org_id), shared Redis namespace
Professional — shared cluster, dedicated DB schema, dedicated Redis prefix
Enterprise — dedicated cluster, dedicated DB, dedicated everything, custom domain, VPC peering

OPS: daily DB snapshots 30-day retention, HPA auto-scaling, zero-downtime rolling deploys,
Grafana per-tenant dashboards, PagerDuty alerting.
Internal admin: /admin/tenants — list, provision, suspend, usage, billing.

CI/CD: GitHub Actions → lint → test → build images → push → staging → smoke → production.
Separate pipelines for infra (Terraform) and app (Docker). Feature flags for rollout.
```

#### STAGE 7 TESTS

```
SELF-HOSTED: Docker Compose clean→healthy <2min, migrate OK, create-admin→login works,
backup→valid dump, restore→data intact, /api/health {db:ok,redis:ok,search:ok,temporal:ok},
Helm on minikube→pods running+ingress, upgrade v1→v1.1 migration no data loss

COHERON-MANAGED: Terraform plan clean, tenant provision→namespace+DB+DNS→accessible <5min,
tenant isolation (A cannot access B's data via DB or API), auto-scale under load,
backup→destroy→restore→data intact, rolling deploy 0 5xx errors, SSL auto-provisioned

SECURITY: all inter-service TLS, DB creds not in logs, expired license→warning+14-day grace,
rate limiting on public endpoints

Gate: pnpm test:stage7 + manual smoke on fresh VM
```

---

### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
### STAGE 8: Hardening, Documentation & Launch
### Timeline: Week 22–23
### ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#### Cursor Prompt 8.1 — Production Hardening

```
Harden NexusOps for production:

SECURITY: OWASP ZAP scan pass, CSP/HSTS/X-Frame/X-Content-Type headers,
DOMPurify for rich text, parameterized queries verified, file upload whitelist+size limit,
CORS per environment, secrets only via env vars, npm audit + Snyk scan

PERFORMANCE: EXPLAIN ANALYZE on all list queries, missing indexes from slow log,
PgBouncer connection pool, gzip/brotli compression, CDN headers on static assets,
JS chunks <250KB, Lighthouse >90 on portal

RELIABILITY: error boundaries on all pages, structured API errors (no stack in prod),
graceful SIGTERM shutdown, DB connection retry, circuit breakers on external calls,
health endpoints /health + /health/detailed

OBSERVABILITY: OpenTelemetry traces on all tRPC, structured JSON logging + correlation IDs,
request duration histograms, error rate dashboards, tenant-scoped metrics

ACCESSIBILITY: WCAG 2.1 AA on portal, keyboard nav throughout, axe-core audit,
color contrast verified
```

#### Cursor Prompt 8.2 — Documentation

```
Create NexusOps docs (Nextra or Mintlify at apps/docs):

Structure: /getting-started (quickstart, first-ticket, invite-team),
/admin-guide (orgs, users-roles, workflows, templates, integrations, ai, settings),
/modules (tickets, assets, cmdb, hr, procurement, portal, dashboards),
/api-reference (auto from tRPC), /self-hosted (quickstart, k8s, config, upgrade, backup),
/coheron-managed (onboarding, sla, security, compliance)

In-app: contextual tooltips, empty state guidance, admin onboarding checklist
(invite team, configure categories, SLA policies, first workflow, customize portal, integrations)

API docs: OpenAPI from tRPC, interactive playground, examples in cURL/Python/JS/Go
```

#### STAGE 8 TESTS (Final Gate)

```
SECURITY: OWASP ZAP 0 high/critical, npm audit 0 high/critical, CSP on all responses,
no stack traces in prod errors, rate limiting active, .exe rejected / .pdf accepted / >10MB rejected

PERFORMANCE: homepage <2s on 3G, 50K ticket list API <300ms page <1s,
10-node workflow <3s, Lighthouse >90 perf/accessibility/best-practices

LOAD (k6): 500 concurrent browsing p99 <2s 0% errors, 
100 concurrent creates all succeed, 50 concurrent workflows execute

ACCESSIBILITY: axe-core 0 critical/serious, full portal tab-through, screen reader OK

DOCS: all links resolve (no 404), API playground works, 
Docker quickstart on fresh Ubuntu→working <10min

FINAL GATE: pnpm test:all && pnpm test:e2e:all && pnpm test:load
ALL PASS → LAUNCH READY
```

---

## Part 3: Pricing Model

### Philosophy

**Modular + feature-driven** — customers pay for what they use. Startups aren't priced out. Enterprises get depth.

Two pricing axes: (1) **Module access** — which features unlocked. (2) **Scale** — users, records, storage, AI.

---

### 3.1 Tier Structure

#### FREE (Community) — Self-hosted only

| Dimension | Limit |
|---|---|
| Users | 5 |
| Modules | Tickets + Basic Dashboard |
| Tickets | 500/month |
| Assets | 100 |
| Workflows | 3 active |
| Storage | 1 GB |
| AI | None |
| Support | Community (GitHub Issues) |
| **Price** | **$0** |

---

#### STARTER

| Dimension | Limit |
|---|---|
| Users | 25 |
| Modules | Tickets, Assets, Portal, KB, Dashboard, Basic Workflows |
| Tickets | 5,000/month |
| Assets | 1,000 |
| Workflows | 10 active (no AI/Approval/Parallel nodes) |
| Storage | 10 GB |
| AI | Smart classification (100 calls/day) |
| Integrations | Email + 1 (Slack or Teams) |
| Support | Email (48h SLA) |
| **Self-hosted** | **$299/mo** |
| **Coheron-managed** | **$499/mo** |

---

#### PROFESSIONAL

| Dimension | Limit |
|---|---|
| Users | 100 |
| Modules | ALL (Tickets, Assets, CMDB, HR, Procurement, Portal, KB, Dashboard, Reports) |
| Tickets | 25,000/month |
| Assets | 10,000 |
| Workflows | 50 active, all node types |
| Storage | 50 GB |
| AI | Full suite — 1,000 calls/day |
| Integrations | Unlimited (Slack, Teams, Email, Jira, SAP, webhooks) |
| Support | Priority email (24h), onboarding session |
| SSO | SAML + OIDC |
| SLA | 99.9% (Coheron-managed) |
| **Self-hosted** | **$799/mo** |
| **Coheron-managed** | **$1,299/mo** |

---

#### ENTERPRISE

| Dimension | Limit |
|---|---|
| Users | Unlimited |
| Modules | All + early access to new modules |
| Everything | Unlimited tickets, assets, workflows, storage (500 GB base) |
| AI | Unlimited + custom model support |
| Integrations | Unlimited + custom development |
| Support | Dedicated AM, Slack channel, 4h SLA, phone |
| SSO | SAML + OIDC + custom IdP |
| SLA | 99.99% (Coheron-managed) |
| Compliance | SOC2, HIPAA-ready, audit logs, data residency |
| Deployment | Self-hosted, Coheron-managed, or Coheron-dedicated (isolated infra) |
| Custom | White-label, custom branding, on-prem support |
| **Self-hosted** | **$2,499/mo** |
| **Coheron-managed** | **$4,999/mo** |
| **Coheron-dedicated** | **From $8,999/mo** |

---

### 3.2 Add-On Pricing

| Add-On | Price |
|---|---|
| +10 users (Starter) | $49/mo |
| +10 users (Professional) | $39/mo |
| +50 GB storage | $29/mo |
| AI usage pack (+5,000 calls/mo) | $99/mo |
| Extra integration slot (Starter) | $19/mo |
| Custom integration development | From $5,000 one-time |
| Onboarding + training (up to 20 users) | $2,500 one-time |
| Priority support upgrade (Starter→24h) | $149/mo |
| White-label branding (Professional+) | $499/mo |
| Data migration (ServiceNow/Jira/Zendesk) | From $3,000 one-time |
| Compliance package (SOC2 support, BAA) | $999/mo |

### 3.3 Coheron-Managed Cloud Costs (Included in Subscription)

| Tier | Est. Monthly Infra (included) |
|---|---|
| Starter | ~$150–250 |
| Professional | ~$400–700 |
| Enterprise | ~$800–2,000 |
| Dedicated | ~$2,000–5,000 |

### 3.4 Startup-Friendly Provisions

- **90-day free trial** on Professional Coheron-managed — no credit card
- **Startup program**: YC / Techstars / accelerator-backed → 50% off year 1
- **Annual billing**: 20% discount all tiers
- **Non-profit / education**: 40% discount Professional and Enterprise
- **Pay-as-you-grow**: start Starter, add modules individually before jumping tiers

### 3.5 Enterprise-Friendly Provisions

- **Volume discounts**: 500+ users → custom negotiated pricing
- **Multi-year**: 2yr = 25% off, 3yr = 35% off
- **Custom SLAs** with financial penalties
- **Dedicated infra** in client's preferred region + cloud
- **Professional services**: workflow design, integration architecture, change management — $200–350/hr
- **Training**: admin ($5K), end-user ($3K), workflow workshop ($7K)

### 3.6 Savings vs ServiceNow

| Scenario | ServiceNow (est.) | NexusOps by Coheron | Savings |
|---|---|---|---|
| 25 users, ITSM+ITAM | $2,500–5,000/mo | $499/mo Starter managed | 80–90% |
| 100 users, full suite | $10,000–20,000/mo | $1,299/mo Pro managed | 87–93% |
| 500 users, enterprise | $50,000–100,000/mo | $8,999/mo Dedicated | 82–91% |
| 50 users, self-hosted | $5,000–10,000/mo | $799/mo Pro self-hosted | 84–92% |

---

## Part 4: Deployment Decision Matrix

| Client Need | Recommended | Why |
|---|---|---|
| Startup, ≤25 users, fast setup | Coheron-managed Starter | Zero ops, fast onboarding |
| Growing co, 25–100 users | Coheron-managed Professional | Coheron handles scaling+backups |
| Enterprise with IT team, data sovereignty | Self-hosted Enterprise | Full control, own infra |
| Regulated (HIPAA, finance) | Coheron-dedicated or Self-hosted Enterprise | Isolated, compliant |
| Cost-sensitive, technical team | Self-hosted Professional | Lower cost, full features |
| Global enterprise, multi-region | Coheron-dedicated multi-region | Per-region infra, low latency |

---

## Part 5: Execution Summary

| Stage | Weeks | Deliverables | Tests |
|---|---|---|---|
| 1. Foundation + Auth | 2 | Monorepo, DB, auth, RBAC | ~28 |
| 2. Tickets + Workflows | 4 | Ticket CRUD, visual workflow engine | ~35 |
| 3. Assets + CMDB | 3 | ITAM, topology, licenses | ~18 |
| 4. Portal + Dashboards | 3 | Self-service portal, analytics | ~20 |
| 5. HR + Procurement | 4 | People Ops, purchase orders | ~24 |
| 6. AI + Integrations | 3 | Claude AI, Slack/Email/Jira/SAP | ~22 |
| 7. Deployment | 2 | Docker, Helm, Terraform, provisioning | ~16 |
| 8. Hardening + Docs | 2 | Security, perf, a11y, documentation | Full regression |
| **Total** | **~23** | **Production-ready platform** | **163+** |

---

*Built by Coheron. Designed to replace what enterprises overpay for.*
