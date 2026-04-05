# NexusOps — Technical Requirements Document (TRD)

**Version:** 2.1  
**Date:** April 4, 2026  
**Status:** Active  
**Author:** Platform Engineering Team  

---

## Changelog

| Version | Date | Summary |
|---------|------|---------|
| **2.1** | 2026-04-04 | **FR-RECRUITMENT (clarified):** The product delivers **in-platform recruitment** (job requisitions, candidates, applications, interviews, offers, pipeline metrics)—**not** a third-party Applicant Tracking System (ATS) integration or full commercial ATS feature set. UI and docs MUST NOT label the module “ATS”. **NFR-QA:** Outcome-based E2E tests MUST assert create→read chains and UI-visible results (`tests/full-qa/08-e2e-build-plan.spec.ts`), not only HTTP 200 on procedure lists. |
| **2.0** | 2026-04-04 | **Phase 3 functional requirements delivered and verified on Vultr.** **FR-RECRUITMENT:** recruitment schema + API + UI; draft/publish; duplicate application handling; interview and offer entities. **FR-SECRETARIAL:** board governance and statutory filing entities with CRUD procedures. **FR-WORKFORCE-ANALYTICS:** aggregated HR metrics endpoints + People Analytics UI. **NFR-DEPLOY:** idempotent migration `0004` + documented apply script. **Procedure surface:** ~299 tRPC procedures. |
| **1.9** | 2026-04-04 | **All critical requirements now verified.** FR-CSM: csm_cases table created — CSM procedures functional. FR-WORKORDERS: assignment_rules + user_assignment_stats tables created — work order create/update fully functional. FR-HR-PAYROLL: salary_structures, payroll_runs, payslips tables created — payroll module fully functional. NFR-ANALYTICS: walkup.analytics and dashboard.getTimeSeries Date serialization bugs fixed. NFR-AUTH-STABILITY: rate-limit Redis keys cleared; correct password hash deployed for all accounts. **Exhaustive test coverage:** 53 pages (Suite 05), 253 API procedures (Suite 06), all UI interactions (Suite 07) — 261/261 pass. Platform readiness score: **95/100** (up from 85/100). |

| **1.8** | 2026-04-03 | **P0/P1 requirements closed.** FR-SURVEYS: `surveys` module added to RBAC type system; `surveys.create` now correctly gates on `surveys.write` (not `analytics.write`) — FORBIDDEN for `hr_manager` resolved ✅. FR-WORKORDERS/FR-TICKETS: Drizzle `Symbol(drizzle:Columns)` 5xx eliminated — duplicate operator exports removed ✅. NFR-AUTH-PERF: `BCRYPT_CONCURRENCY` raised 8 → 32; `LIBUV_THREADPOOL_SIZE=32` — login throughput cap lifted ✅. NFR-REPORTS-PERF: 4 covering indexes on `tickets` table — `executiveOverview` timeout resolved ✅. NFR-INFRA: nginx reverse proxy active (HTTP, HTTPS-ready via certbot); pg_dump cron daily 02:00 UTC; disk 85% → 24%. Platform readiness score updated: **85/100** (up from 70/100). |
| **1.7** | 2026-04-03 | **Requirements status updated post feature-completion sprint.** FR-TICKETS: `assigneeName`/`assigneeEmail` surfaced via user join — ticket assignee display now ✅ complete. FR-REPORTS: `avgResolutionTime` and `csatScore` computed from live DB — hardcoded fallbacks eliminated ✅. FR-FINANCIAL: AP and AR tabs wired to live invoice data with Approve/Mark Paid actions ✅. FR-GRC: Security Config Compliance tab cross-queries GRC data ✅; Compliance page live metrics ✅. FR-SURVEYS: CSAT/Pulse dashboard wired to `getResults` ✅. FR-CRM: Add Account, Add Contact flows complete ✅; Sales Leaderboard live ✅. FR-EVENTS: Service health node map from live events ✅; KPIs wired ✅. FR-HR: `hr.cases.resolve` mutation implemented ✅. New FR verified: `tickets.listPriorities` supports dynamic priority display without hardcoding. JSX Fragment requirement added: all pages with modal siblings or multi-child ternary branches must use `<>...</>` Fragment (SWC build constraint). |
| **1.6** | 2026-04-03 | **Requirements status updated post-clean-slate**: all transactional data wiped; platform ready for production use with real data. QA score: 70/100. Verified requirements: FR-AUTH (all), FR-RBAC (partial — TG-14 RBAC gaps in surveys/events/oncall/walkup), FR-TICKETS (90%), FR-CHANGES (90%), FR-HR (93%), FR-FINANCIAL (100%), FR-NOTIFICATIONS (100%). Unverified/failing: FR-WORKORDERS (60% — Drizzle schema error), FR-SURVEYS (71% — RBAC), FR-EVENTS (75% — RBAC), FR-ONCALL (67% — RBAC). **New NFRs verified**: idempotency (5s window, Redis + DB), concurrency (MAX_IN_FLIGHT=500, 0 overload under 200 workers), input sanitisation (100% rejection of malformed inputs). **Open NFRs**: p95 login latency under 200 VUs (4,098ms, target <800ms); reports timeout (8,010ms for hr_manager). |
| 1.5 | 2026-04-02 | NFRs: bcrypt concurrency limit, burst rate limit, in-flight guard, active health monitoring. |
| 1.4 | 2026-03-27 | Load requirements validated: 397 req/s sustained, p50 1,284ms, 0 network errors at 800 VUs. |
| 1.3 | 2026-03-26 | Security requirements: session invalidation, internal endpoint auth, stack trace suppression. |
| 1.0–1.2 | 2026-03 | Initial TRD: functional and non-functional requirements for all 9 business modules. |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Functional Requirements](#3-functional-requirements)
   - 3.1 Authentication & Session Management
   - 3.2 Role-Based Access Control (RBAC)
   - 3.3 Multi-Tenancy
   - 3.4 Module: Ticketing & ITSM
   - 3.5 Module: Asset & CMDB
   - 3.6 Module: Approvals & Workflows
   - 3.7 Module: HR & People Ops
   - 3.8 Module: Finance & Accounts
   - 3.9 Module: GRC / Secretarial & CS
   - 3.10 Module: CRM
   - 3.11 Module: Knowledge Base
   - 3.12 Module: Payroll
   - 3.13 Module: Vendor Management
   - 3.14 Module: Projects
   - 3.15 Module: Reporting & Analytics
   - 3.16 Module: Notifications
   - 3.17 Module: Global Search
   - 3.18 Module: File / Document Storage
   - 3.19 Platform Administration
4. [Non-Functional Requirements](#4-non-functional-requirements)
   - 4.1 Performance
   - 4.2 Availability & Reliability
   - 4.3 Scalability
   - 4.4 Security
   - 4.5 Observability & Logging
   - 4.6 Data Integrity
5. [Technical Constraints](#5-technical-constraints)
6. [Integration Requirements](#6-integration-requirements)
7. [Data Requirements](#7-data-requirements)
8. [API Requirements](#8-api-requirements)
9. [Infrastructure Requirements](#9-infrastructure-requirements)
10. [Testing Requirements](#10-testing-requirements)
11. [Deployment Requirements](#11-deployment-requirements)
12. [Environment Configuration](#12-environment-configuration)
13. [Known Technical Gaps & Risks](#13-known-technical-gaps--risks)
14. [Assumptions & Dependencies](#14-assumptions--dependencies)
15. [Revision History](#15-revision-history)

---

## 1. Introduction

### 1.1 Purpose

This Technical Requirements Document (TRD) defines the complete technical requirements for the NexusOps platform. It serves as the single authoritative reference for all functional and non-functional requirements, technical constraints, integration specifications, and quality criteria that the system must satisfy.

The intended audience is:
- Software engineers building, extending, or maintaining the platform
- QA engineers designing test strategies and acceptance criteria
- DevOps / SRE engineers managing infrastructure and deployments
- Technical architects evaluating system design decisions
- Product owners verifying technical feasibility of requirements

### 1.2 Scope

NexusOps is a unified enterprise operations platform delivering a tightly integrated suite of business modules — ITSM, HR, Finance, GRC, CRM, Procurement, and others — within a single multi-tenant SaaS application. The scope of this document covers:

- The full-stack monorepo, including the Next.js web frontend (`apps/web`), the Fastify API backend (`apps/api`), and shared packages (`packages/`).
- All backing services: PostgreSQL, Redis, Meilisearch, and MinIO (object storage).
- All infrastructure, containerisation, and CI/CD concerns.

### 1.3 Definitions

| Term | Definition |
|------|-----------|
| **tRPC** | End-to-end type-safe Remote Procedure Call layer used for all frontend-backend communication |
| **RBAC** | Role-Based Access Control — the permission system governing which users may access which capabilities |
| **Org** | A tenant organisation within the multi-tenant system |
| **Session Token** | A Bearer token identifying an authenticated user session |
| **BullMQ** | Redis-backed job queue used for background processing |
| **CMDB** | Configuration Management Database — inventory of IT assets |
| **GRC** | Governance, Risk, and Compliance |
| **CS** | Company Secretary |
| **SLA** | Service Level Agreement — time-bound response / resolution targets for tickets |
| **ADR** | Architecture Decision Record |

---

## 2. System Overview

### 2.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js (App Router) | 15.x |
| Frontend runtime | React | 19.x |
| Backend framework | Fastify | 5.x |
| API layer | tRPC | 11.x |
| Data fetching | TanStack React Query | v5 |
| ORM | Drizzle ORM | latest |
| Database | PostgreSQL | 16 |
| Cache / queue broker | Redis (ioredis) | 7 |
| Job queue | BullMQ | latest |
| Full-text search | Meilisearch | v1.10 |
| Object storage | MinIO | latest |
| Reverse proxy / TLS | Traefik | v3 |
| Container runtime | Docker / Docker Compose | latest |
| Monorepo toolchain | Turborepo + pnpm workspaces | Turbo latest / pnpm 10.x |
| Type language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| UI primitives | Radix UI | latest |
| Schema validation | Zod | 3.x |
| Node.js runtime | Node.js | ≥ 20.0.0 |
| Package manager | pnpm | ≥ 9.0.0 (locked pnpm@10.33.0) |

### 2.2 Repository Structure

```
NexusOps/
├── apps/
│   ├── api/                  # Fastify + tRPC backend
│   └── web/                  # Next.js 15 frontend
├── packages/
│   ├── db/                   # Drizzle ORM schema + client
│   ├── types/                # Shared TypeScript types
│   ├── ui/                   # Shared Radix/Tailwind component library
│   └── config/               # Shared configuration utilities
├── e2e/                      # Playwright end-to-end tests
├── scripts/                  # CI and utility scripts
├── docker-compose.yml        # Development services
├── docker-compose.prod.yml   # Production services
├── turbo.json                # Turborepo pipeline config
└── package.json              # Root workspace config
```

---

## 3. Functional Requirements

### 3.1 Authentication & Session Management

#### FR-AUTH-01 — Token-Based Session Authentication
The system MUST authenticate users via a Bearer token issued at login. Tokens MUST be transmitted in the `Authorization: Bearer <token>` HTTP header on all protected API requests.

#### FR-AUTH-02 — Session Persistence
Sessions MUST be stored server-side in PostgreSQL (`sessions` table). Session lookups MUST follow a multi-tier resolution strategy:

1. **L1:** In-process `Map` cache — TTL 300,000 ms (5 minutes), null-cache TTL 30,000 ms (30 seconds).
2. **L2:** Redis key `session:{SHA-256 hash}` — TTL 300 seconds.
3. **L3:** PostgreSQL read on cache miss.

Coalescing MUST prevent concurrent identical token lookups from issuing multiple PostgreSQL reads (inflight deduplication).

#### FR-AUTH-03 — Session Token Hashing
Tokens MUST be stored and compared using a SHA-256 hash. The raw token MUST NOT be stored in Redis or as a plain-text index in PostgreSQL.

#### FR-AUTH-04 — L1 Cache Eviction
The in-process session cache MUST be swept every 60 seconds via an unref'd `setInterval` to remove expired entries without blocking the event loop.

#### FR-AUTH-05 — Session Flush on Start
When the environment variable `FLUSH_REDIS_SESSION_ON_START=true`, the API MUST scan and delete all Redis keys matching the pattern `session:*` on startup, using a `SCAN COUNT 500` strategy.

#### FR-AUTH-06 — Client-Side Token Storage
The web frontend MUST store the session token in `localStorage` under the key `nexusops_session`.

---

### 3.2 Role-Based Access Control (RBAC)

#### FR-RBAC-01 — Role Hierarchy
The system MUST support the following roles, listed from highest to lowest privilege:

| Role | Scope |
|------|-------|
| `super_admin` | Platform-wide; all organisations |
| `org_admin` | Full access within a single organisation |
| `manager` | Elevated cross-module access within an organisation |
| `employee` | Standard module access within an organisation |
| `viewer` | Read-only access within an organisation |
| `client` | Restricted external access |

#### FR-RBAC-02 — Permission Matrix
Permissions MUST be defined as `(module, action)` pairs. The canonical permission matrix is maintained in `packages/types/src/rbac-matrix.ts`. Enforcement MUST occur on both:
- **Backend:** tRPC procedure middleware before any database operation.
- **Frontend:** UI components using the `useRBAC()` hook before rendering restricted content.

#### FR-RBAC-03 — Unconditional Hook Calls
Frontend components utilising React hooks (including tRPC query hooks) MUST call all hooks unconditionally at the top of the component function body, prior to any RBAC-based early return. This is mandatory to satisfy React Rules of Hooks and prevent runtime errors during the RBAC loading phase.

#### FR-RBAC-04 — RBAC Loading State
The `useRBAC()` hook MUST expose a loading state. During loading, the `can()` function MUST return `false` for all permission checks, preventing premature access.

#### FR-RBAC-05 — Organisation Isolation
RBAC enforcement MUST include organisation scoping. A user with `org_admin` privileges in Organisation A MUST NOT be able to access or modify data belonging to Organisation B.

---

### 3.3 Multi-Tenancy

#### FR-MT-01 — Organisation Isolation at the Data Layer
All data records MUST include an `org_id` foreign key. All API queries MUST filter by the authenticated user's `org_id`. Cross-organisation data leakage MUST be architecturally impossible via the ORM layer.

#### FR-MT-02 — Super Admin Cross-Org Access
`super_admin` users MUST be able to view and manage all organisations and their data through a dedicated admin interface.

#### FR-MT-03 — Organisation Provisioning
Platform administrators MUST be able to create new organisations, assign initial `org_admin` users, and configure organisation-level settings.

---

### 3.4 Module: Ticketing & ITSM

#### FR-TICK-01 — Ticket Lifecycle
The system MUST support tickets with the following statuses: `open`, `in_progress`, `resolved`, `closed`.

#### FR-TICK-02 — SLA Management
The system MUST apply configurable SLA policies (response time, resolution time) by ticket priority. SLA breach detection and escalation MUST be processed asynchronously via the `nexusops-sla` BullMQ queue with:
- Max attempts: 3
- Backoff: exponential, initial delay 3,000 ms
- Worker concurrency: 10
- Completed job retention: 300 entries
- Failed job retention: 100 entries

#### FR-TICK-03 — Ticket Assignment
Tickets MUST be assignable to individual users. Reassignment MUST be supported.

#### FR-TICK-04 — Comments & Activity Log
Every ticket MUST support threaded comments and an immutable activity log capturing all state changes.

#### FR-TICK-05 — Search Indexing
Tickets MUST be indexed in Meilisearch under the `tickets` index with filterable fields `org_id`, `status`, `type` and searchable fields `title`, `description`, `number`.

#### FR-TICK-06 — Ticket Types
The system MUST support exactly four ticket types: `INCIDENT` (unplanned service disruption), `SERVICE_REQUEST` (user-initiated provision request), `PROBLEM` (root-cause record linked to one or more incidents), and `CHANGE` (addition, modification, or removal of anything affecting IT services). Change tickets carry three sub-types: `STANDARD` (pre-approved), `NORMAL` (requires CAB approval), and `EMERGENCY` (expedited path).

#### FR-TICK-07 — Priority Matrix
Priority MUST be computed automatically from the combination of Impact and Urgency:

| Urgency \ Impact | HIGH | MEDIUM | LOW |
|-----------------|------|--------|-----|
| HIGH | P1 | P2 | P3 |
| MEDIUM | P2 | P3 | P4 |
| LOW | P3 | P4 | P4 |

The computed priority MAY be overridden by a user with at minimum `manager` role, and the override MUST be logged.

#### FR-TICK-08 — Exact SLA Timings
SLA deadlines MUST be computed per the following matrix:

| Priority | First Response | Resolution | Clock Type |
|----------|---------------|------------|------------|
| P1 | 15 minutes | 4 hours | 24×7 calendar time |
| P2 | 30 minutes | 8 hours | 24×7 calendar time |
| P3 | 4 hours | 24 hours | Business hours 09:00–18:00 IST Mon–Sat |
| P4 | 1 business day | 3 business days | Business hours 09:00–18:00 IST Mon–Sat |

For P3 and P4: if a ticket is created after 18:00, the SLA clock MUST start at 09:00 on the next working day.

#### FR-TICK-09 — SLA Warning Thresholds
The system MUST emit three SLA states before breach: `ON_TRACK` (< 75% elapsed), `WARNING` (75–90% elapsed), `CRITICAL` (90–100% elapsed), and `BREACHED` (> 100% elapsed). The SLA warning and critical states MUST trigger in-platform notifications.

#### FR-TICK-10 — SLA Pause on Pending User Response
When a ticket status is set to `PENDING_USER`, the SLA resolution clock MUST pause. The pause start timestamp (`sla_paused_at`) and the accumulated pause duration in minutes (`sla_pause_duration_mins`) MUST be stored on the ticket. The clock MUST resume on the next user response or automatically after 24 hours of inactivity.

#### FR-TICK-11 — Three-Level Escalation
The system MUST support three escalation levels:
- **Level 1**: Response SLA breached → notify group lead; if still unresponded after 30 additional minutes → escalate to IT Manager (`escalation_level = 1`)
- **Level 2**: Resolution SLA breached + 2 hours (P1/P2) or + 4 hours (P3/P4) → escalate to IT Manager + requester's manager (`escalation_level = 2`)
- **Level 3**: Resolution SLA breached + 4 hours (P1/P2) or + 8 hours (P3/P4) → escalate to CTO/VP IT (`escalation_level = 3`)

Each escalation level MUST be stored on the ticket and MUST create an audit log entry.

#### FR-TICK-12 — Complete Status State Machine
The system MUST enforce the following ticket status transitions and MUST reject any transition not listed:

| From | To | Permitted By |
|------|----|-------------|
| NEW | ASSIGNED | System (auto) / Manager |
| ASSIGNED | IN_PROGRESS | Assigned agent |
| IN_PROGRESS | PENDING_USER | Assigned agent |
| PENDING_USER | IN_PROGRESS | System (user reply) / System (24-hr auto-resume) |
| IN_PROGRESS | RESOLVED | Assigned agent (resolution_notes mandatory) |
| RESOLVED | CLOSED | User confirm or system auto after 48 hours |
| RESOLVED | REOPENED | User (within 48 hours of resolution) |
| CLOSED | REOPENED | User (within 7 calendar days of closure) |
| REOPENED | IN_PROGRESS | Assigned agent / System |

Tickets MUST NOT be closeable without `resolution_notes` containing at least 20 characters.

#### FR-TICK-13 — Load-Based Agent Assignment
The default auto-assignment algorithm MUST be load-based: assign to the active agent in the matched group with the fewest open tickets. On tie, use oldest `last_assigned_at`. If no agent is available (all at capacity ≥ 20 open tickets), the ticket MUST remain in `NEW` status and the group lead MUST be alerted every 15 minutes.

#### FR-TICK-14 — Category–Group Mapping
The system MUST maintain a configuration table mapping each ticket category to a support group: `HARDWARE → hardware-support-team`, `SOFTWARE → software-support-team`, `NETWORK → network-ops-team`, `SECURITY → security-ops-team`, `ACCESS → iam-team`, `OTHER → general-it-team`.

#### FR-TICK-15 — Reopen and Duplicate Rules
Reopening a closed ticket MUST increment `reopen_count` and reset the SLA clock from the moment of reopening. Tickets older than 7 calendar days from `closed_at` MUST NOT be reopened; the user MUST create a new ticket. On new ticket creation, the system MUST perform a fuzzy-match check (≥ 80% title similarity) against open tickets by the same requester in the same category within the last 24 hours and MUST display a warning if a potential duplicate is detected.

---

### 3.5 Module: Asset & CMDB

#### FR-ASSET-01 — Asset Lifecycle
Assets MUST support lifecycle states from procurement through active use to retirement/disposal.

#### FR-ASSET-02 — CI Linking
Assets MUST be linkable to Configuration Items (CIs) in the CMDB. The `ci_items` Meilisearch index MUST be maintained with fields `org_id`, `status`, `type`, `name`, `description`.

#### FR-ASSET-03 — Depreciation Tracking
The system MUST support financial depreciation tracking on assets including purchase value, current book value, and depreciation schedule.

---

### 3.6 Module: Approvals & Workflows

#### FR-APPR-01 — Approval Queue
Approval requests MUST be processed via the `nexusops-approvals` BullMQ queue with:
- Max attempts: 3
- Backoff: exponential, initial delay 2,000 ms
- Worker concurrency: 5
- Completed job retention: 500 entries
- Failed job retention: 200 entries

#### FR-APPR-02 — Multi-Level Approvals
The system MUST support multi-step approval chains where each step may require approval from one or more designated approvers.

#### FR-APPR-03 — Approval States
Each approval request MUST transition through defined states: `pending` → `approved` / `rejected` / `escalated`.

#### FR-APPR-04 — Notifications on State Change
Approvers MUST be notified (in-platform notification, and optionally email) when an approval request is created or requires action.

---

### 3.7 Module: HR & People Ops

#### FR-HR-01 — Employee Records
The system MUST maintain employee profiles including personal details, employment history, department and reporting hierarchy, and document attachments.

#### FR-HR-02 — Leave Management
The system MUST support leave request submission, approval, balance tracking, and leave type configuration per organisation.

#### FR-HR-03 — Onboarding & Offboarding
The system MUST provide structured onboarding and offboarding checklists with task assignment and completion tracking.

#### FR-HR-04 — Search Indexing
Employee records MUST be indexed in the `employees` Meilisearch index with filterable field `org_id` and searchable fields `name`, `description`.

#### FR-HR-05 — Mandatory Indian Identity Fields
Every employee record MUST store: `PAN` (10-character alphanumeric, format `AAAAA9999A`, validated), `Aadhaar` (12-digit numeric, validated using the Verhoeff algorithm), and `UAN` (12-digit Universal Account Number for EPFO, optional at onboarding, mandatory before first payroll run). The `bank_ifsc` field MUST conform to the pattern `AAAA0NNNNNN`.

#### FR-HR-06 — Tax Regime Declaration
Each employee MUST declare one of two tax regimes: `OLD` or `NEW`. The declaration MUST be captured at the start of each financial year and MAY be changed once during the year. The regime value MUST drive all TDS computations.

#### FR-HR-07 — Salary Structure Components
A salary structure MUST decompose CTC into the following components: Basic (% of CTC, 40–50%), HRA (% of Basic — 50% for metro cities, 40% for non-metro), Special Allowance (residual), PF Employee (12% of Basic capped at ₹1,800/month), PF Employer (12% of Basic capped at ₹1,800/month, split as 8.33% EPS + 3.67% EPF), Professional Tax (state-specific), and optionally LTA, Medical Allowance, Conveyance Allowance, and Bonus.

#### FR-HR-08 — Professional Tax
Professional Tax MUST be deducted per state-specific monthly schedule. The system MUST maintain a state-wise PT schedule covering at minimum: Maharashtra (₹200/month Apr–Feb, ₹300 in March), Karnataka (₹200/month), Tamil Nadu (₹200/month), West Bengal (slab-based), Andhra Pradesh (slab-based), Telangana (slab-based), Gujarat (₹200/month). States without PT (Delhi, Rajasthan, Uttar Pradesh, Haryana) MUST have a zero entry.

#### FR-HR-09 — Old Regime Tax Computation
Under the Old Regime, the system MUST compute taxable income after deducting: HRA exemption (minimum of HRA received, rent paid minus 10% of Basic, and 50%/40% of Basic for metro/non-metro), standard deduction of ₹50,000, Section 80C (aggregate cap ₹1,50,000), Section 80D (₹25,000 self + ₹25,000 parents; ₹50,000 each if senior citizens), Section 24(b) home loan interest (cap ₹2,00,000), Section 80CCD(2) NPS employer (10% of Basic, no cap), Section 80CCD(1B) NPS additional (cap ₹50,000), and professional tax paid. Tax slabs: 0% up to ₹2,50,000; 5% on ₹2.5L–₹5L; 20% on ₹5L–₹10L; 30% above ₹10L. Section 87A rebate: tax payable up to ₹12,500 if taxable income ≤ ₹5,00,000. Health and Education Cess: 4% on tax plus surcharge.

#### FR-HR-10 — New Regime Tax Computation
Under the New Regime, the system MUST apply only two deductions: standard deduction of ₹50,000 and Section 80CCD(2) NPS employer contribution. All other deductions (80C, 80D, HRA, 24(b)) are inapplicable. New Regime slabs: 0% up to ₹3,00,000; 5% on ₹3L–₹6L; 10% on ₹6L–₹9L; 15% on ₹9L–₹12L; 20% on ₹12L–₹15L; 30% above ₹15L. Section 87A rebate: tax payable up to ₹25,000 if taxable income ≤ ₹7,00,000. Cess: 4%.

#### FR-HR-11 — Monthly TDS Projection
Monthly TDS MUST be computed via the income-projection method:
1. Sum actual gross salary paid April through previous month
2. Project remaining months at current salary
3. Compute total projected annual income
4. Apply tax under declared regime with declared deductions
5. Subtract TDS already deducted this financial year
6. Divide remaining tax by remaining months (minimum ₹0)

This computation MUST be recalculated every month and whenever a salary revision is approved.

#### FR-HR-12 — Mid-Year Join and Salary Revision
For employees joining mid-year, the system MUST prorate the joining month's salary based on the ratio of days worked to total working days in that month, and project the remaining months at full monthly salary for TDS purposes. For salary revisions, the system MUST recompute TDS from the revision month using actual year-to-date income and projected future income at the revised salary.

#### FR-HR-13 — Payroll Approval and Payment Flow
The monthly payroll cycle MUST enforce: HR Manager review, Finance Manager approval, CFO approval if total payroll exceeds ₹50 lakhs. Bank file generation MUST occur 2 working days before month end. Payslips MUST be password-protected PDFs (password = first 5 characters of PAN in uppercase + date of birth in DDMMYYYY format).

#### FR-HR-14 — Statutory Filing Outputs
The system MUST generate: ECR (Electronic Challan cum Return) file for EPFO submission by the 15th of the following month; state-wise PT challan data per state deadlines; TDS challan data (Form ITNS 281, Section 192) for payment by the 7th of the following month; Form 24Q quarterly TDS return data; Form 16 (Part A from TRACES, Part B system-generated) by June 15th each year.

---

### 3.8 Module: Finance & Accounts

#### FR-FIN-01 — Budget Management
The system MUST allow creation and management of budgets per department, with expense tracking against budget lines.

#### FR-FIN-02 — Invoice & Expense Management
The system MUST support invoice capture, approval routing, and payment status tracking.

#### FR-FIN-03 — Contract Tracking
Contracts MUST be indexed in Meilisearch under the `contracts` index with filterable field `org_id` and searchable fields `title`, `name`, `description`.

#### FR-FIN-04 — GST Tax Type Determination
The system MUST determine the applicable GST type for every transaction by comparing the supplier's state (derived from the first two digits of the supplier GSTIN) against the place of supply. If states are equal: apply CGST + SGST (each at half the applicable GST rate). If states differ: apply IGST (at the full GST rate).

#### FR-FIN-05 — GST Rate Support
The system MUST support all five statutory GST rates: 0%, 5%, 12%, 18%, and 28%. Rate selection MUST be driven by the HSN code (goods) or SAC code (services) on each invoice line item.

#### FR-FIN-06 — GSTIN Validation
Every GSTIN stored in the system MUST be validated against the 15-character format: 2-digit state code (01–38) + 10-character PAN + 1-digit entity number + fixed character 'Z' + 1 check digit computed via the GST checksum algorithm.

#### FR-FIN-07 — Invoice Fields for GST Compliance
Every tax invoice MUST store: `invoice_number` (unique per GSTIN per FY), `invoice_date`, `supplier_GSTIN`, `buyer_GSTIN`, `place_of_supply`, `is_interstate` (system-computed), HSN/SAC per line item, `taxable_value`, `cgst_amount`, `sgst_amount`, `igst_amount`, `total_tax_amount`, `total_invoice_amount`, and `is_reverse_charge`.

#### FR-FIN-08 — E-Invoice (IRN) Generation
For organisations with annual turnover exceeding ₹5 crore, the system MUST call the Invoice Registration Portal (IRP) API to obtain an IRN (Invoice Reference Number) for every tax invoice at the time of creation. The IRN, acknowledgement number, acknowledgement date, and QR code data MUST be stored on the invoice record.

#### FR-FIN-09 — E-Way Bill
For goods invoices with taxable value exceeding ₹50,000, the system MUST generate an e-way bill via the NIC API and store the e-way bill number on the invoice.

#### FR-FIN-10 — ITC Utilisation Sequence
Input Tax Credit utilisation MUST follow the statutory sequence:
1. Pay IGST liability: use IGST ITC first, then CGST ITC, then SGST ITC, then cash
2. Pay CGST liability: use CGST ITC first, then IGST ITC (remaining), then cash — SGST ITC MUST NOT be used for CGST
3. Pay SGST liability: use SGST ITC first, then IGST ITC (remaining), then cash — CGST ITC MUST NOT be used for SGST

#### FR-FIN-11 — ITC Blocked Credits
The system MUST flag and exclude from ITC claims all purchases classified under Section 17(5) blocked credits, including: motor vehicles for personal transport (capacity ≤ 13 persons), food and beverages (unless in supply of same), club memberships, works contract for immovable property construction, and CSR activity goods/services.

#### FR-FIN-12 — GSTR-2B Reconciliation
The system MUST support monthly ITC reconciliation against GSTR-2B data. Reconciliation MUST categorise each purchase invoice as: MATCHED (in both system and GSTR-2B), IN_SYSTEM_NOT_IN_GSTR2B (provisional ITC), IN_GSTR2B_NOT_IN_SYSTEM (investigate), or MISMATCH (values differ). Only MATCHED invoices MUST be included in GSTR-3B ITC claims.

#### FR-FIN-13 — Double-Entry Enforcement
Every financial transaction MUST be recorded via a double-entry journal entry. The system MUST reject any journal entry where the sum of debits does not exactly equal the sum of credits (`ImbalancedEntryError`). The chart of accounts MUST include separate ledger accounts for Output IGST Payable, Output CGST Payable, Output SGST Payable, Input IGST Receivable, Input CGST Receivable, Input SGST Receivable, RCM CGST Payable, and RCM SGST Payable.

#### FR-FIN-14 — GST Returns Filing Calendar
The system MUST maintain a compliance calendar for GST returns: GSTR-1 by the 11th of the following month (monthly filers with turnover > ₹5 crore) or 13th of the month after quarter end (QRMP scheme); GSTR-3B by the 20th of the following month; GSTR-9 and GSTR-9C by December 31st of the following FY.

#### FR-FIN-15 — Reverse Charge Mechanism
For transactions where `is_reverse_charge = TRUE`, the system MUST generate the buyer-side RCM tax entries: debit RCM liability accounts (2115 RCM CGST Payable / 2125 RCM SGST Payable) and simultaneously debit ITC receivable accounts for the eligible portion.

---

### 3.9 Module: GRC / Secretarial & CS

#### FR-GRC-01 — Compliance Calendar
The system MUST maintain a compliance calendar with configurable recurring deadlines and ownership assignments.

#### FR-GRC-02 — Audit Management
The system MUST support audit records including findings, risk ratings, and remediation tracking. Audit data MUST be accessible via `trpc.grc.listAudits` and MUST be fetched unconditionally in the `SecretarialContent` component before any RBAC early-return.

#### FR-GRC-03 — Tab Navigation via URL
The Secretarial & CS page MUST use URL query parameters (`?tab=<key>`) to control visible tab state. Tab keys are: `overview`, `board`, `filings`, `share`, `registers`, `calendar`. All sidebar child links MUST point to these unique URLs for correct deep-linking.

#### FR-GRC-04 — ROC / MCA Filings
The system MUST track MCA (Ministry of Corporate Affairs) and ROC (Registrar of Companies) filings, including due dates, submission status, and document attachments.

#### FR-GRC-05 — Board & Meetings
The system MUST support board meeting scheduling, agenda management, minute recording, and resolution tracking.

#### FR-GRC-06 — Risk Scoring Matrix
Risks MUST be scored using a 5×5 matrix: `risk_score = likelihood × impact`. Likelihood and impact are each rated 1–5 (1=Rare/Negligible, 5=Almost Certain/Catastrophic). Risk ratings MUST be: LOW (1–4), MEDIUM (5–9), HIGH (10–14), CRITICAL (15–25). CRITICAL and HIGH risks MUST trigger escalation notifications.

#### FR-GRC-07 — Inherent vs Residual Risk
Each risk MUST store both an inherent risk score (before controls) and a residual risk score (after controls). Mapped control IDs MUST be stored as an array on the risk record.

#### FR-GRC-08 — Control Types
The system MUST support four control types: PREVENTIVE (prevents risk event), DETECTIVE (identifies risk event), CORRECTIVE (reduces impact after event), DIRECTIVE (guides behaviour through policy). Each control MUST record its testing frequency, last tested date, next test date, effectiveness rating (EFFECTIVE / PARTIALLY_EFFECTIVE / INEFFECTIVE / NOT_TESTED), and required evidence description.

#### FR-GRC-09 — Audit Finding Structure
Audit findings MUST be recorded using the full COSO structure: `criteria` (benchmark), `condition` (what was found), `cause` (root cause), `effect` (business impact), `recommendation` (auditor's recommendation). Severity MUST be one of: CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL. Remediation SLA: CRITICAL = 7 calendar days, HIGH = 30 days, MEDIUM = 60 days, LOW = 90 days, INFORMATIONAL = 180 days.

#### FR-GRC-10 — ROC Annual Filing Calendar
The system MUST track the following annual ROC/MCA compliance events with exact due dates and per-day penalties:
- AOC-4 (Financial Statements): 30 days from AGM, penalty ₹100/day
- MGT-7 / MGT-7A (Annual Return): 60 days from AGM, penalty ₹100/day
- ADT-1 (Auditor Appointment): 15 days from AGM, penalty ₹300/day
- DIR-3 KYC (Director KYC): September 30 annually, penalty ₹5,000 one-time
- MSME-1: April 30 (for Oct–Mar period), October 31 (for Apr–Sep period), penalty ₹100/day

#### FR-GRC-11 — Event-Based ROC Compliance
The system MUST track event-triggered MCA filings with their deadlines. At minimum: DIR-12 (Director appointment/resignation, 30 days), SH-7 (Authorised capital change, 30 days), PAS-3 (Share allotment, 30 days), CHG-1 (Charge creation, 30 days extendable to 60), INC-22 (Registered office change, 30 days), BEN-2 (Significant Beneficial Owner change, 30 days).

#### FR-GRC-12 — Director KYC Reminder Workflow
The system MUST send automated reminders to all directors with ACTIVE DIN status whose annual KYC has not been completed: first reminder on September 1, second reminder on September 15, final warning on September 25 with escalation to the Company Secretary. If KYC is not completed by September 30, the director's DIN status MUST be updated to DEACTIVATED and the Board MUST be notified.

#### FR-GRC-13 — Risk-Based Audit Scheduling
The annual audit calendar MUST be automatically generated based on risk ratings: CRITICAL risks audited quarterly (4 per year), HIGH risks audited semi-annually (2 per year), MEDIUM risks audited annually, LOW risks audited every 2 years. Mandatory regulatory audits (Statutory by June 30, Tax Audit by September 30 if applicable, GST Audit by December 31 if applicable) MUST be included regardless of risk rating.

---

### 3.10 Module: CRM

#### FR-CRM-01 — Deal Pipeline
CRM deals MUST be indexed in Meilisearch under `crm_deals` with filterable field `org_id` and searchable fields `title`, `name`, `description`.

#### FR-CRM-02 — Account Management
CRM accounts MUST be indexed under `crm_accounts` with the same index configuration as deals.

#### FR-CRM-03 — Contact Management
The system MUST support CRM contacts linked to accounts and deals, with full activity history.

---

### 3.11 Module: Knowledge Base

#### FR-KB-01 — Article Management
Knowledge base articles MUST be indexed in Meilisearch under `kb_articles` with filterable field `org_id` and searchable fields `title`, `content`.

#### FR-KB-02 — Article Visibility
Articles MUST support draft, published, and archived states. Only published articles are searchable by standard users.

---

### 3.12 Module: Payroll

#### FR-PAY-01 — Payroll Run Management
The system MUST support payroll run creation, computation, approval, and payment status tracking on a monthly cycle.

#### FR-PAY-02 — Payslip Access
Employees MUST be able to view and download their own payslips. Managers and HR admins MUST be able to access payslips for direct reports and their entire organisation, respectively.

#### FR-PAY-03 — Dual Tax Regime Support
The payroll engine MUST compute TDS under both the Old Regime and New Regime based on each employee's declared `tax_regime`. Switching between regimes MUST trigger a full TDS recomputation for all remaining months of the financial year.

#### FR-PAY-04 — TDS Monthly Computation
Monthly TDS MUST be computed via the income-projection method (§FR-HR-11). The computation MUST use the employee's declared deductions (80C investments, 80D premiums, home loan interest, HRA exemption, NPS contributions) entered through the employee's investment declaration workflow.

#### FR-PAY-05 — PF Challan and ECR
The system MUST generate an EPFO-format ECR file by the 15th of each following month. The ECR MUST include per employee: UAN, employee PF contribution, employer PF contribution (split into EPF 3.67% and EPS 8.33%), and total wages.

#### FR-PAY-06 — TDS Return Data (Form 24Q)
The system MUST produce Form 24Q (quarterly TDS return for salary) data for each quarter: Q1 (Apr–Jun, due July 31), Q2 (Jul–Sep, due October 31), Q3 (Oct–Dec, due January 31), Q4 (Jan–Mar, due May 31). Each return MUST include BSR code, challan serial number, and per-employee PAN and TDS amount.

#### FR-PAY-07 — Form 16
Form 16 Part B MUST be system-generated by June 15th of each year for all employees who were employed during the financial year. Part B MUST include: gross salary breakup, HRA exemption computation, all deductions claimed, tax computation under the applicable regime, and net tax payable. Part A (TDS deposited data from TRACES) MUST be importable via the TRACES reconciliation flow.

---

### 3.13 Module: Vendor Management

#### FR-VEN-01 — Vendor Registry
The system MUST maintain a registry of vendors with contact details, category classifications, and performance ratings.

#### FR-VEN-02 — Purchase Orders
The system MUST support PO creation, approval, and fulfilment tracking.

#### FR-VEN-03 — Vendor Master India Compliance Fields
Every vendor record MUST store: `GSTIN` (15-character, validated), `PAN` (10-character, validated), `tds_section` (194C / 194J / 194I / NIL), `tds_rate` (1% for 194C individuals, 2% for 194C companies, 10% for 194J, 10%/2% for 194I, 0 for NIL), `is_msme` (boolean), and `msme_udyam_number` (mandatory if `is_msme = TRUE`).

#### FR-VEN-04 — Three-Way Invoice Matching
Before any vendor invoice is approved for payment, the system MUST perform three-way matching against the corresponding PO and GRN. Matching MUST verify: item codes present in PO, invoice quantity ≤ GRN accepted quantity AND ≤ PO quantity, unit price variance ≤ 2% of PO price (configurable tolerance), GST rate matches HSN/SAC expected rate, and vendor GSTIN on invoice matches vendor master. Any flag MUST route the invoice to a Finance Manager exception queue; only fully-matched invoices may proceed directly to payment scheduling.

#### FR-VEN-05 — TDS on Vendor Payments
The system MUST deduct TDS at the point of payment (or earlier credit, whichever occurs first) per the vendor's `tds_section` and `tds_rate`. TDS MUST NOT be deducted on the GST component of the invoice. Per-transaction and per-financial-year aggregate thresholds MUST be enforced (194C: ₹30,000 per transaction or ₹1,00,000 per year; 194J: ₹30,000 per transaction; 194I: ₹2,40,000 per year).

#### FR-VEN-06 — MSME Payment Compliance
For vendors flagged `is_msme = TRUE`, the system MUST enforce payment within 45 days of delivery (per MSMED Act 2006). Invoices approaching the 45-day limit MUST generate a warning notification. Overdue MSME payments MUST be included in the MSME-1 half-yearly filing report.

#### FR-VEN-07 — PR Approval Thresholds
Purchase Requisition approval chains MUST be enforced by total estimated value: ₹0–₹10,000 (Direct Manager only), ₹10,001–₹50,000 (Direct Manager + Department Head), ₹50,001–₹2,00,000 (+ Finance Manager), ₹2,00,001–₹10,00,000 (+ CFO), above ₹10,00,000 (+ CEO/MD). Each approver has 2 business days; auto-escalation triggers at day 4.

---

### 3.14 Module: Projects

#### FR-PROJ-01 — Project & Task Hierarchy
The system MUST support projects containing milestones and tasks, with assignment to team members and status tracking.

#### FR-PROJ-02 — Timeline Visualisation
Projects MUST expose start and end dates sufficient to render Gantt or timeline views on the frontend.

#### FR-PROJ-03 — Task Dependency Types
The system MUST support four task dependency types: `FS` (Finish-to-Start: successor cannot start until predecessor is COMPLETED), `SS` (Start-to-Start: successor cannot start until predecessor is IN_PROGRESS), `FF` (Finish-to-Finish: successor cannot complete until predecessor is COMPLETED), `SF` (Start-to-Finish: successor cannot complete until predecessor has started). Each dependency MUST support a configurable `lag_days` offset (default 0).

#### FR-PROJ-04 — Dependency Enforcement
The system MUST block status transitions for tasks that would violate their dependency conditions. A task blocked by an unmet dependency MUST display status `BLOCKED` and identify the blocking task(s) by name. When a predecessor task changes status and all dependencies of a blocked task are now satisfied, the system MUST automatically transition the blocked task to `NOT_STARTED` and notify all assignees.

#### FR-PROJ-05 — Critical Path Method
The system MUST compute the critical path for each project using the CPM algorithm: forward pass (earliest start/finish), backward pass (latest start/finish), and float calculation. Tasks with zero float MUST be flagged as critical path tasks and highlighted in the Gantt view. The total project duration MUST equal the earliest finish of the last critical path task.

#### FR-PROJ-06 — Budget Tracking
Project budget tracking MUST include three components: salary cost (employee CTC per hour × hours logged), procurement cost (POs tagged to the project), and approved expense reimbursements. Budget alerts MUST fire at 75%, 90%, and 100% consumption. At 100%, new PO creation and expense submissions tagged to the project MUST be blocked until a budget extension is approved (Sponsor for ≤ 10% overrun, CFO for 10–25%, CEO/MD for > 25%).

#### FR-PROJ-07 — Time Tracking Validation
Employees MUST log time only against IN_PROGRESS tasks. Future dates MUST be rejected. Maximum 16 total hours logged by any one employee across all tasks for a single calendar date. Time logging on COMPLETED tasks MUST be permitted for up to 2 calendar days after the task's actual end date.

---

### 3.15 Module: Reporting & Analytics

#### FR-REP-01 — Cross-Module Reports
The reports page MUST surface aggregated data from multiple modules. All reporting queries MUST use a `staleTime` of at least 300,000 ms (5 minutes) on the frontend to avoid unnecessary refetching.

#### FR-REP-02 — Export
The system MUST support report data export in at least CSV format.

---

### 3.16 Module: Notifications

#### FR-NOT-01 — In-Platform Notifications
The system MUST deliver in-platform notifications for events including: ticket assignments, SLA warnings, approval requests, and compliance calendar reminders.

#### FR-NOT-02 — Notification Read State
Users MUST be able to mark notifications as read individually or in bulk. Unread count MUST be displayed in the UI.

---

### 3.17 Module: Global Search

#### FR-SRCH-01 — Multi-Index Search
The global search endpoint MUST query all eight Meilisearch indexes (`tickets`, `assets`, `ci_items`, `kb_articles`, `employees`, `contracts`, `crm_deals`, `crm_accounts`) in parallel and merge results.

#### FR-SRCH-02 — Organisation Scoping
All search queries MUST include the filter `org_id = "{orgId}"` to ensure results are scoped to the user's organisation. Super admin searches MUST be similarly controlled.

#### FR-SRCH-03 — Result Limit
The default result limit for global search is **20 results** distributed across all indexes. The split is configurable.

#### FR-SRCH-04 — Graceful Degradation
If Meilisearch is unavailable, the search endpoint MUST return an empty result set rather than an error, and MUST NOT affect core application functionality.

#### FR-SRCH-05 — Index Initialisation
On startup, the system MUST call `initSearchIndexes()` to ensure all eight Meilisearch indexes exist with the correct filterable and searchable attribute configurations.

---

### 3.18 Module: File / Document Storage

#### FR-FILE-01 — Object Storage Backend
File uploads MUST be stored in MinIO. The system MUST support the MinIO console on port `9001`.

#### FR-FILE-02 — Document Attachments
All major entities (tickets, employees, contracts, assets, etc.) MUST support file attachments.

---

### 3.19 Platform Administration

#### FR-ADMIN-01 — User Management
Super admins and org admins MUST be able to create, update, deactivate, and delete users within their scope.

#### FR-ADMIN-02 — Org Configuration
Org admins MUST be able to configure organisation name, modules enabled, and default settings.

#### FR-ADMIN-03 — Audit Trails
All destructive and sensitive operations (user deletion, permission changes, payroll submissions) MUST write to an audit trail accessible to platform administrators.

---

### 3.20 India Statutory Compliance Requirements

#### FR-IND-01 — Financial Year
The system MUST operate on the Indian financial year (April 1 to March 31). All payroll, tax, GST return, and compliance calendar logic MUST use this FY boundary.

#### FR-IND-02 — IST Timezone
All timestamps displayed to India-based users and all SLA deadline computations MUST use Indian Standard Time (IST, UTC+5:30). All internal storage MUST use UTC; conversion to IST MUST happen at the presentation layer.

#### FR-IND-03 — PAN Validation
Every PAN stored in the system (employee or vendor) MUST pass format validation: 5 alphabetic characters + 4 digits + 1 alphabetic check character (regex `^[A-Z]{5}[0-9]{4}[A-Z]{1}$`).

#### FR-IND-04 — Aadhaar Validation
Employee Aadhaar numbers MUST be validated as 12-digit numeric strings passing the Verhoeff check-digit algorithm. Raw Aadhaar numbers MUST be masked in all UI displays (show only last 4 digits) and MUST NOT be returned via any portal-facing API.

#### FR-IND-05 — EPFO Compliance
Employee Provident Fund deductions MUST apply to all employees regardless of salary level. The PF wage ceiling is ₹15,000/month (employees may opt for higher contributions on full basic, which MUST be configurable). Employer contribution MUST be split: 3.67% to EPF account, 8.33% to EPS (Employee Pension Scheme, capped at ₹1,250/month). ECR file MUST be generated by the 15th of the following month.

#### FR-IND-06 — Data Retention for Compliance
Financial records (invoices, journal entries, GST returns) MUST be retained for a minimum of 8 years per the Companies Act 2013. Employee records MUST be retained for 8 years from date of exit. Customer data MUST be retained per the Digital Personal Data Protection Act 2023 (DPDP Act); deletion requests MUST be fulfilled within 30 calendar days.

#### FR-IND-07 — Customer Portal Security (DPDP Act 2023)
The customer-facing portal MUST comply with the Digital Personal Data Protection Act 2023: no cross-customer data access, explicit data minimisation (portal APIs MUST NOT return PAN, Aadhaar, bank details, or any other customer's data), user right-to-erasure workflow within 30 days, and audit logs of all data access events.

#### FR-IND-08 — Multi-GSTIN Support
Organisations with operations in multiple Indian states MUST be able to register multiple GSTINs. Each GSTIN MUST have its own: ITC ledger (IGST/CGST/SGST balances), output tax liability tracking, and GST return filing schedule. Inter-GSTIN stock transfers MUST be treated as taxable supplies.

---

## 4. Non-Functional Requirements

### 4.1 Performance

#### NFR-PERF-01 — API Response Time Target
95% of tRPC query responses MUST complete within **500 ms** under normal load. Requests exceeding this threshold MUST be logged as `[SLOW REQUEST]`.

#### NFR-PERF-02 — API Hard Timeout
All tRPC **query** procedures MUST be subject to a **hard timeout of 8,000 ms**. Queries exceeding this limit MUST return a `TIMEOUT` error to the client. Mutations are excluded from the hard timeout and are expected to complete within reasonable operational bounds.

#### NFR-PERF-03 — Frontend Fetch Timeout
The tRPC HTTP client on the frontend MUST abort requests after **12,000 ms** using an `AbortController` signal.

#### NFR-PERF-04 — Latency Percentile Tracking
The API MUST track and periodically log p50, p95, and p99 latency percentiles across all tRPC procedures. A rolling sample window of **2,000 requests** MUST be maintained. A latency summary MUST be logged every **200 completed requests**, including the top 5 slow procedures by average duration.

#### NFR-PERF-05 — Meilisearch Health Timeout
The health check probe to Meilisearch MUST time out after **3,000 ms** using an `AbortSignal.timeout`.

#### NFR-PERF-06 — Stale-While-Revalidate Cache Policy
The frontend MUST use the following default React Query caching policy:
- `staleTime`: 30,000 ms (30 seconds)
- `refetchOnWindowFocus`: `false`
- `refetchOnMount`: `"stale"` (refetch only if data is stale)

Pages with slower-changing data (reports, RBAC context) MUST override `staleTime` to 300,000 ms (5 minutes).

#### NFR-PERF-07 — Database Pool Sizing
The PostgreSQL connection pool MUST be configured as follows:

| Environment | Max Connections | Idle Timeout | Connect Timeout | Max Lifetime |
|-------------|----------------|-------------|----------------|-------------|
| Production  | 20             | 30 s        | 15 s           | 1,800 s     |
| Development | 30             | 30 s        | 15 s           | 1,800 s     |

#### NFR-PERF-08 — Pool Pressure Monitoring
The database client MUST log a warning when the active connection count reaches ≥ **85%** of the pool maximum. Warning logs MUST be debounced to at most once every **5,000 ms** to prevent log flooding.

#### NFR-PERF-09 — Idle Transaction Cleanup
On API startup, all PostgreSQL connections idle-in-transaction for more than **30 seconds** MUST be terminated via the `pg_terminate_backend` mechanism.

---

### 4.2 Availability & Reliability

#### NFR-AVAIL-01 — Service Health Checks
All containerised services MUST expose health check endpoints compatible with Docker's `HEALTHCHECK` directive:

| Service | Endpoint | Interval | Timeout | Retries |
|---------|----------|----------|---------|---------|
| `web` | `GET /api/health` (port 3000) | 30 s | 10 s | 3 |
| `api` | `GET /health` (port 3001) | 30 s | 10 s | 3 |
| `postgres` | `pg_isready` | 10 s | 5 s | 5 |
| `redis` | `redis-cli ping` | 10 s | 5 s | 5 |
| `meilisearch` | `GET /health` (port 7700) | 15 s | 5 s | 5 |
| `minio` | `mc ready local` | 15 s | 5 s | 5 |

#### NFR-AVAIL-02 — Dependency Start Ordering
The `api` container MUST only start after `postgres`, `redis`, and the `migrator` service have reached a healthy/completed state. The `web` container MUST only start after `api` is healthy.

#### NFR-AVAIL-03 — Redis Retry Strategy
The ioredis client MUST retry connections up to **10 times** using a linear back-off of `min(attempts × 100ms, 3000ms)`. After 10 failures, the client MUST stop retrying and surface the error.

#### NFR-AVAIL-04 — Database Mutation Retry
Database mutations encountering retryable PostgreSQL errors (codes `23505` unique violation, `40001` serialisation failure, `40P01` deadlock) MUST be retried up to **3 total attempts** with a random delay in the range **[10, 50] ms** between retries.

#### NFR-AVAIL-05 — Process Supervision
The API container MUST use `tini` (pid 1 process supervisor) as its entrypoint to ensure correct signal handling and zombie process reaping.

---

### 4.3 Scalability

#### NFR-SCALE-01 — Horizontal Scaling Readiness
The API and web applications MUST be stateless with respect to user session data (all session state stored in Redis / PostgreSQL). This enables multiple API container replicas without session affinity requirements.

#### NFR-SCALE-02 — BullMQ Queue Concurrency
The approval workflow worker MUST process up to **5 jobs concurrently**. The SLA lifecycle worker MUST process up to **10 jobs concurrently**. These values MUST be tunable via environment variables.

#### NFR-SCALE-03 — Job Retention Limits
BullMQ queues MUST enforce retention limits to prevent unbounded Redis memory growth:

| Queue | Completed jobs retained | Failed jobs retained |
|-------|------------------------|---------------------|
| `nexusops-approvals` | 500 | 200 |
| `nexusops-sla` | 300 | 100 |

#### NFR-SCALE-04 — Meilisearch Index Design
Meilisearch indexes MUST have `org_id` set as a filterable attribute on all eight indexes to enable efficient tenant-scoped queries at scale.

---

### 4.4 Security

#### NFR-SEC-01 — Transport Security (HTTPS)
All production traffic MUST be served over HTTPS. Traefik MUST handle TLS termination with Let's Encrypt certificates (HTTP-01 challenge). HTTP requests to port 80 MUST be redirected to HTTPS.

#### NFR-SEC-02 — HTTP Security Headers (Web)
The Next.js frontend MUST set the following HTTP response headers on all routes:

| Header | Value |
|--------|-------|
| `X-DNS-Prefetch-Control` | `on` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | See NFR-SEC-03 |

#### NFR-SEC-03 — Content Security Policy
The CSP header MUST be set as follows (parameterised by `NEXT_PUBLIC_API_URL`):

```
default-src 'self';
connect-src 'self' <API_URL> wss: ws:;
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https:;
frame-ancestors 'none'
```

> **Note:** `'unsafe-inline'` and `'unsafe-eval'` in `script-src` are required by Next.js's current server-rendered architecture and MUST be reviewed and tightened in a future security hardening sprint.

#### NFR-SEC-04 — API Rate Limiting
All API endpoints MUST be subject to global rate limiting with the following defaults:

| User Type | Window | Max Requests | Production Default | Development Default |
|-----------|--------|-------------|-------------------|---------------------|
| Authenticated (`user:*`) | `RATE_LIMIT_WINDOW` (default 1 minute) | `RATE_LIMIT_PER_TOKEN` | 1,000 | 10,000 |
| Anonymous (`anon:*`) | Same | `RATE_LIMIT_ANON` | 100 | 1,000 |

Rate limit keys MUST be computed from: Bearer token → session cookie → `anon:{IP}` (in priority order). Rate limit state MUST be stored in Redis. Rate limit errors MUST return HTTP 429 with a `retry-after` value. `skipOnError: true` MUST be set so rate limiting errors do not block legitimate requests.

#### NFR-SEC-05 — CORS Policy
The API MUST restrict cross-origin requests. The `CORS_ORIGIN` environment variable (comma-separated) defines allowed origins. `credentials: true` MUST be set. In development, if no origins are configured, `origin: true` MAY be used as a fallback.

#### NFR-SEC-06 — Helmet
The Fastify API MUST register `@fastify/helmet` with `contentSecurityPolicy: false` (CSP is handled by the frontend reverse-proxy layer).

#### NFR-SEC-07 — Non-Root Container Users
All Docker images MUST run application processes as a non-root, unprivileged user (uid `1001`). The web container uses `nextjs` (uid 1001); the API container uses `api` (uid 1001).

#### NFR-SEC-08 — Remote Image Domains
The Next.js `images.remotePatterns` MUST only allow the following domains for remote image optimisation:
- `https://**.githubusercontent.com`
- `https://lh3.googleusercontent.com`

#### NFR-SEC-09 — Prototype Pollution Prevention
The Fastify API MUST register a `preHandler` hook that recursively sanitizes all incoming JSON request bodies before they reach tRPC or Zod. The keys `__proto__`, `constructor`, and `prototype` MUST be removed from all nested objects. This prevents prototype pollution attacks from crashing the handler or modifying `Object.prototype`.

Validation criteria: A POST to any mutation endpoint with body `{ "__proto__": { "admin": true } }` MUST return `400 BAD_REQUEST` and MUST NOT return `500 INTERNAL_SERVER_ERROR`.

#### NFR-SEC-10 — Error Code Correctness
The API MUST NOT return `INTERNAL_SERVER_ERROR (500)` for any condition that the application can classify at design time. Specifically:

- Missing org ticket workflow configuration MUST return `PRECONDITION_FAILED (412)`
- Invalid enum inputs failing Zod validation MUST return `BAD_REQUEST (400)`
- Optimistic lock version mismatches MUST return `CONFLICT (409)`
- Unauthenticated access MUST return `UNAUTHORIZED (401)`

Validation criteria: k6 `invalid_payload.js` adversarial suite (26 cases) MUST complete with `invalid_unexpected_500 count == 0`.

---

### 4.5 Observability & Logging

#### NFR-OBS-01 — Structured Logging
The API MUST use `pino` for structured JSON logging. In production, log level MUST be `info`. In development, log level MUST be `debug` with `pino-pretty` colourised output.

#### NFR-OBS-02 — Slow Request Logging
Any tRPC procedure taking longer than **500 ms** MUST produce a `[SLOW REQUEST]` log entry at `warn` level containing the procedure name and elapsed time.

#### NFR-OBS-03 — Latency Report Logging
The API MUST emit a latency percentile report (p50, p95, p99) and a top-5 slow procedures table every **200 completed requests** at `info` level.

#### NFR-OBS-04 — Pool Pressure Logging
Database connection pool pressure warnings (≥ 85% utilisation) MUST be logged at `warn` level, debounced to a maximum frequency of once per 5,000 ms.

#### NFR-OBS-05 — Drizzle Query Logging
In development (`NODE_ENV !== "production"`), all ORM-generated SQL queries MUST be logged by the Drizzle logger for debugging purposes.

#### NFR-OBS-06 — In-Memory Metrics Collection
The API MUST maintain in-memory counters for `total_requests`, `total_errors`, per-endpoint request counts, per-endpoint error counts, and per-endpoint running-average latency using O(1) incremental arithmetic.  URL normalisation (query string stripping) MUST bound the endpoint map.  Counters MUST be updated synchronously in the `onResponse` hook with no blocking I/O.

Validation criteria:
- `GET /internal/metrics` MUST return a valid `MetricsSnapshot` with correct `total_requests`, `total_errors`, and `error_rate` after a known traffic pattern.
- Resetting via `POST /internal/metrics/reset` MUST set all counters to zero.

#### NFR-OBS-07 — Health Status Evaluation
The API MUST expose `GET /internal/health` which evaluates live in-memory metrics against the following thresholds and returns `HEALTHY`, `DEGRADED`, or `UNHEALTHY`:

| Rule | DEGRADED | UNHEALTHY |
|---|---|---|
| Global error rate | > 1 % (≥ 20 requests) | > 5 % |
| Any endpoint avg latency | > 1 000 ms | > 2 000 ms |
| Rate-limited requests | > 100 | — |

The response MUST include a `reasons[]` array (empty when healthy), a `summary` object with supporting numbers, and a `monitor` object containing `last_changed_at` and `eval_every`.  The HTTP status MUST always be 200 — callers inspect the `status` field.

#### NFR-OBS-08 — Active Health Signaling
The API MUST emit structured log lines when health status changes.  Requirements:

- Health MUST be evaluated every `HEALTH_EVAL_EVERY` completed requests (default 50; configurable via env var without a redeploy).
- A log line MUST be emitted **only** on status transitions — repeated evaluation of the same status MUST NOT produce additional log lines.
- Log level MUST match severity: `SYSTEM_DEGRADED` → `warn`, `SYSTEM_UNHEALTHY` → `error`, `SYSTEM_RECOVERED` → `info`.
- Each signal log line MUST include `event`, `from`, `to`, `reasons`, `summary`, and `changed_at` fields.
- The evaluation and comparison MUST complete synchronously in the `onResponse` hook without I/O on non-evaluation ticks.

Validation criteria: see `NexusOps_Active_Health_Signal_Report_2026.md` §3 (Verification Results).

---

### 4.6 Data Integrity

#### NFR-DATA-01 — Schema Validation
All tRPC mutation inputs MUST be validated using Zod schemas. Invalid inputs MUST return a `BAD_REQUEST` / `UNPROCESSABLE_CONTENT` error before any database operation.

#### NFR-DATA-02 — Organisation Key on All Records
Every table MUST include an `org_id` column that is a non-nullable foreign key to the `organisations` table, except for tables that are platform-wide (e.g. `organisations`, `super_admin_users`).

#### NFR-DATA-03 — Database Migration Management
All schema changes MUST be managed as Drizzle ORM migrations in `packages/db/drizzle/`. The production compose stack MUST run the `migrator` service to completion before the `api` service starts. Migration commands: `db:push` (push schema), `db:migrate` (apply migrations), `db:generate` (generate migration files).

#### NFR-DATA-04 — Drizzle Config
The Drizzle config (`drizzle.config.ts`) MUST be set with `verbose: true` and `strict: true` to detect destructive schema changes during development.

---

## 5. Technical Constraints

### 5.1 Runtime Constraints

| Constraint | Specification |
|------------|--------------|
| Minimum Node.js version | 20.0.0 |
| Minimum pnpm version | 9.0.0 (locked at 10.33.0) |
| Build target for API | Node 20 (`tsup target: "node20"`) |
| Next.js output mode | `standalone` (required for Docker deployment) |
| API build format | ESM (`format: "esm"`, output `dist/index.mjs`) |

### 5.2 Build Constraints

- The Turborepo build pipeline MUST process dependency-ordered builds: packages compile before apps (`dependsOn: ["^build"]`).
- The API build MUST bundle the internal packages `@nexusops/db`, `@nexusops/types`, and `@nexusops/config` (`noExternal`) to produce a self-contained distribution.
- The web Docker build stage MUST pass `NEXT_PUBLIC_API_URL` as a build argument (default `http://localhost:3001`).
- TypeScript type errors and ESLint errors MUST NOT block production builds (`ignoreBuildErrors: true`, `ignoreDuringBuilds: true`) but MUST fail CI lint/type-check steps.

### 5.3 Transpile Constraints
The Next.js frontend MUST transpile `@nexusops/ui` and `@nexusops/types` to ensure compatibility with the App Router's server component boundaries.

### 5.4 React Constraints
- All React hooks MUST be called unconditionally at the top level of component functions, with no conditional calls based on RBAC state or loading state.
- Components using `useSearchParams()` MUST be wrapped with a `<Suspense>` boundary to prevent static rendering bail-out in the Next.js App Router.
- `typedRoutes` is set to `false`; typed route checking is not required.

---

## 6. Integration Requirements

### 6.1 Internal Service Integrations

| Service | Integration Method | Purpose |
|---------|------------------|---------|
| PostgreSQL 16 | Drizzle ORM over `postgres` driver | Primary data store |
| Redis 7 | ioredis | Session caching, rate limiting, BullMQ broker |
| Meilisearch v1.10 | Meilisearch JS SDK | Full-text search across 8 entity indexes |
| MinIO | S3-compatible API | Object/document storage |
| BullMQ | Redis-backed queue | Background job processing (approvals, SLA) |

### 6.2 Frontend ↔ Backend Integration

All communication between the Next.js frontend and the Fastify API MUST use tRPC over HTTP batching (`httpBatchLink`) at the path `/trpc`. REST endpoints are not exposed to the frontend except for health and file upload.

### 6.3 External Integrations (Planned / Optional)

| Integration | Purpose | Status |
|-------------|---------|--------|
| Email provider (SMTP / SES) | Notification emails | Configurable |
| OAuth / SSO providers | Federated authentication | Optional (Google OAuth image domain whitelisted) |
| S3-compatible storage | Alternative to MinIO in cloud deployments | MinIO default |

---

## 7. Data Requirements

### 7.1 Data Model Summary

The following core entities MUST be present in the database schema:

| Entity | Key Fields |
|--------|-----------|
| `organisations` | id, name, settings |
| `users` | id, org_id, email, role, profile |
| `sessions` | id, user_id, token_hash, expires_at |
| `tickets` | id, org_id, number, title, status, priority, assignee_id, sla_policy_id |
| `assets` | id, org_id, name, type, status, purchase_value |
| `ci_items` | id, org_id, asset_id, name, type, status |
| `approvals` | id, org_id, entity_type, entity_id, status, steps |
| `employees` | id, org_id, user_id, department, position, manager_id |
| `leave_requests` | id, org_id, employee_id, type, status, dates |
| `payroll_runs` | id, org_id, period, status, total_amount |
| `payslips` | id, org_id, payroll_run_id, employee_id, amount |
| `contracts` | id, org_id, title, counterparty, value, status |
| `crm_deals` | id, org_id, title, stage, value, contact_id |
| `crm_accounts` | id, org_id, name, industry, status |
| `kb_articles` | id, org_id, title, content, status |
| `notifications` | id, org_id, user_id, message, read_at |
| `audit_logs` | id, org_id, user_id, action, entity_type, entity_id, diff |
| `compliance_items` | id, org_id, title, due_date, owner_id, status |
| `vendors` | id, org_id, name, category, rating |
| `projects` | id, org_id, name, status, start_date, end_date |
| `tasks` | id, org_id, project_id, title, assignee_id, status |

### 7.2 Data Retention

- Audit logs MUST NOT be hard-deleted. Soft deletion MUST be used where deletion is legally required.
- BullMQ completed jobs are retained for: approvals 500, SLA 300 entries (rolling).
- BullMQ failed jobs are retained for: approvals 200, SLA 100 entries (rolling).

### 7.3 Data Residency

The production deployment MUST store all data on infrastructure controlled by the operating organisation. No data MUST be transmitted to third-party analytics or telemetry services. `NEXT_TELEMETRY_DISABLED=1` MUST be set in all Next.js containers.

---

## 8. API Requirements

### 8.1 Transport

| Property | Value |
|----------|-------|
| Protocol | HTTP/1.1 + HTTPS |
| Base path | `/trpc` |
| Method | `POST` (all tRPC procedures, batched by default) |
| Content type | `application/json` |
| Authentication | `Authorization: Bearer <token>` header |
| Batching | `httpBatchLink` enabled — multiple procedures may be batched in a single HTTP request |

### 8.2 Procedure Types

| Type | Characteristics |
|------|----------------|
| `query` | Read-only; subject to 8,000 ms hard timeout; cacheable by React Query |
| `mutation` | Write operations; no hard timeout; retried up to 3 times on retryable DB errors |
| `subscription` | Not currently used |

### 8.3 Standard Error Codes

| tRPC Code | HTTP Equivalent | Meaning |
|-----------|----------------|---------|
| `BAD_REQUEST` | 400 | Invalid or malformed input; Zod validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid session token |
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions (RBAC) |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `CONFLICT` | 409 | Unique constraint violation |
| `TIMEOUT` | 408 | Query hard limit (8,000 ms) exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled server error |

### 8.4 Frontend Retry Policy

| Error Code | Retry Behaviour |
|------------|----------------|
| `UNAUTHORIZED` | No retry |
| `FORBIDDEN` | No retry |
| `NOT_FOUND` | No retry |
| Other errors | Maximum 1 retry |

### 8.5 Router Summary

The API exposes 33 tRPC routers. Key routers and their access characteristics:

| Router | Representative Procedures | Access Level |
|--------|--------------------------|-------------|
| `auth` | `login`, `logout`, `me` | Public / Protected |
| `tickets` | `list`, `create`, `update`, `close`, `addComment` | Protected + Permission |
| `assets` | `list`, `create`, `update`, `retire` | Protected + Permission |
| `approvals` | `list`, `create`, `approve`, `reject` | Protected + Permission |
| `hr` | `listEmployees`, `createEmployee`, `updateLeave` | Protected + Permission |
| `payroll` | `listRuns`, `createRun`, `submitRun` | Admin only |
| `finance` | `listBudgets`, `createInvoice`, `approveExpense` | Protected + Permission |
| `grc` | `listAudits`, `createAudit`, `updateCompliance` | Protected + Permission |
| `crm` | `listDeals`, `createDeal`, `updateAccount` | Protected + Permission |
| `kb` | `listArticles`, `createArticle`, `publishArticle` | Protected + Permission |
| `search` | `global` | Protected |
| `notifications` | `list`, `markRead`, `markAllRead` | Protected |
| `admin` | `listOrgs`, `createOrg`, `listUsers` | Super Admin |
| `reports` | `getMetrics`, `getSummary` | Manager + |

---

## 9. Infrastructure Requirements

### 9.1 Container Services

All production services MUST be orchestrated with Docker Compose using the `docker-compose.prod.yml` configuration. The following services are required:

| Service | Image | Port(s) |
|---------|-------|---------|
| `web` | `nexusops/web:latest` | 3000 (internal) |
| `api` | `nexusops/api:latest` | 3001 (internal) |
| `postgres` | `postgres:16-alpine` | 5432 (internal) |
| `redis` | `redis:7-alpine` | 6379 (internal) |
| `meilisearch` | `getmeili/meilisearch:v1.10` | 7700 (internal) |
| `minio` | `minio/minio:latest` | 9000, 9001 (internal) |
| `traefik` | `traefik:v3` | 80, 443 (public) |
| `migrator` | `nexusops/api:latest` | — (one-shot) |

### 9.2 Persistent Volumes

The following named Docker volumes MUST be declared and persisted:

| Volume | Service | Purpose |
|--------|---------|---------|
| `postgres-data` | postgres | Database files |
| `redis-data` | redis | Redis persistence |
| `meilisearch-data` | meilisearch | Search index data |
| `minio-data` | minio | Object storage data |
| `letsencrypt-data` | traefik | TLS certificate storage |

### 9.3 Reverse Proxy

Traefik v3 MUST be configured as the edge reverse proxy with:
- Docker provider enabled (socket mount at `/var/run/docker.sock`)
- Automatic Let's Encrypt certificate issuance via HTTP-01 challenge
- HTTP to HTTPS redirect on all hosts
- Virtual host routing:
  - `nexusops.yourdomain.com` → `web:3000`
  - `api.nexusops.yourdomain.com` → `api:3001`

> The domain names MUST be updated from the placeholder `yourdomain.com` before production deployment.

### 9.4 Resource Requirements (Minimum)

| Service | CPU (min) | RAM (min) |
|---------|----------|----------|
| `web` | 0.5 vCPU | 512 MB |
| `api` | 1 vCPU | 1 GB |
| `postgres` | 1 vCPU | 2 GB |
| `redis` | 0.25 vCPU | 256 MB |
| `meilisearch` | 0.5 vCPU | 512 MB |
| `minio` | 0.25 vCPU | 256 MB |
| `traefik` | 0.1 vCPU | 64 MB |

> Explicit `deploy.resources` limits are not currently set in the Docker Compose file. Resource limits SHOULD be added in a production hardening pass.

---

## 10. Testing Requirements

### 10.1 Testing Pyramid

The platform MUST maintain the following layers of automated tests:

| Layer | Framework | Location |
|-------|-----------|---------|
| Unit / Integration | Vitest | `apps/api/src/__tests__/` |
| End-to-End (E2E) | Playwright | `e2e/` |

### 10.2 Unit / Integration Tests (Vitest)

The API Vitest configuration MUST comply with:

| Setting | Value |
|---------|-------|
| Environment | `node` |
| Test timeout | 30,000 ms |
| Hook timeout | 30,000 ms |
| Worker pool | `forks`, `singleFork: true` |
| Setup file | `apps/api/src/__tests__/setup.ts` |

Test layers (1–9) are named `layer1` through `layer9` and MUST be runnable individually via:
```bash
pnpm test:layerN
```

### 10.3 E2E Tests (Playwright)

The Playwright configuration MUST comply with:

| Setting | Value |
|---------|-------|
| Test directory | `./e2e` |
| Parallelism | Sequential (`fullyParallel: false`, `workers: 1`) |
| Retries in CI | 2 |
| Base URL | `http://localhost:3000` |
| Trace | `on-first-retry` |
| Screenshot | `only-on-failure` |
| Video | `retain-on-failure` |
| Browser | Chromium / Desktop Chrome |
| `forbidOnly` | `true` in CI |

**API web server** MUST be started before E2E tests with:
- API: timeout 30,000 ms, port 3001
- Web: timeout 60,000 ms, port 3000

E2E test files:
- `auth.spec.ts` — authentication flows
- `approvals.spec.ts` — approval workflow journeys
- `rbac.spec.ts` — permission boundary tests
- `tickets.spec.ts` — ticket ITSM journeys
- `layer10-journeys.spec.ts` — comprehensive cross-module journeys

**Production / staging full-QA (`tests/full-qa/`):** In addition to page-load and procedure-enumeration suites, the platform MUST run **outcome-based** specs that prove business operations end-to-end—for example creating a job requisition via API and confirming it appears in `recruitment.requisitions.list`, and validating HR/workforce responses are structured arrays or KPI objects, not only that HTTP status is 200. The canonical file for these checks is `08-e2e-build-plan.spec.ts` (included from `tests/run-full-qa.sh`).

### 10.4 Test Commands

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run all unit/integration tests via Turborepo |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm test:ci` | Run all tests (unit + E2E) for CI |
| `pnpm test:layer10` | Run Playwright tests (Layer 10) |
| `pnpm test:full-qa` | Run complete QA suite via shell script |

### 10.5 Test Coverage Requirements

- All tRPC procedure middleware (auth, RBAC) MUST have unit tests.
- All RBAC permission boundaries MUST have E2E tests via `rbac.spec.ts`.
- SLA and approval BullMQ workflow logic MUST have integration tests.

### 10.6 k6 Security & Reliability Tests

The platform MUST maintain a k6 security and reliability test suite under `tests/k6/`. All six scripts MUST be runnable against a local development stack. The following thresholds MUST pass on every run:

| Script | MUST-PASS threshold |
|--------|---------------------|
| `auth_stress.js` | Zero interrupted iterations; all sessions receive unique tokens |
| `rate_limit.js` | `rate_limit_server_errors count < 5`; `rate_limit_cross_user_throttle count == 0` |
| `chaos_flow.js` | `chaos_ticket_create_success_rate > 95%`; `http_req_failed rate < 2%` |
| `race_condition.js` | `race_update_error count < 5` (zero 500s); writes complete within `p(95) < 3,000ms` |
| `invalid_payload.js` | `invalid_unexpected_500 count == 0`; `invalid_correct_rejection_rate > 95%` |
| `run_all.js` | `all_errors count < 10` (zero 500s); `all_bad_input_rejection_rate > 95%`; `http_req_duration p(95) < 2,000ms` |

**Adversarial coverage:** The `invalid_payload.js` suite MUST exercise the following attack categories:
- Invalid enum values
- Missing required fields
- Incorrect field types
- Prototype pollution (`__proto__`, `constructor`, `prototype` keys)
- SQL injection patterns in string fields
- XSS payloads in string fields
- Oversized payloads (exceeding Zod `.max()`)
- No authentication token
- Fake/expired authentication token
- Malformed JSON body

**Test data prerequisite:** Load-test user organisations (`loadtest0@test.com` → `loadtest19@test.com`) MUST have at least one `ticket_statuses` row with `category = 'open'` per org before `chaos_flow.js` can run. This MUST be documented in the developer onboarding guide.

**Baseline results (March 28, 2026):** 23,798 requests; 0 unhandled 500 errors; 100% bad-input rejection; p(95) 271ms. See `NexusOps_K6_Security_and_Load_Test_Report_2026.md`.

---

## 11. Deployment Requirements

### 11.1 Build Pipeline

The Turborepo pipeline enforces the following build order:

```
packages/types  →  packages/db  →  packages/ui  →  apps/api  →  apps/web
```

Each stage MUST complete successfully before the next stage begins. The build pipeline is defined in `turbo.json` with `dependsOn: ["^build"]`.

### 11.2 Docker Images

Both application images use multi-stage Docker builds:

**Web (`apps/web/Dockerfile`):**
1. `base` — Node 20 Alpine, corepack pnpm
2. `deps` — Frozen lockfile install
3. `builder` — Full monorepo build; Next.js `standalone` output
4. `runner` — Minimal runtime; non-root user; exposes port 3000

**API (`apps/api/Dockerfile`):**
1. `base` — Node 20 Alpine, corepack pnpm
2. `deps` — Frozen lockfile install
3. `builder` — tsup build; ESM output to `dist/`
4. `runner` — Tini entrypoint; non-root user; exposes port 3001; CMD `node dist/index.mjs`

### 11.3 Database Migration

Migrations MUST be applied before the API starts by running the `migrator` service (CMD: `node dist/migrate.js`). The `api` service MUST `depends_on: migrator (service_completed_successfully)`.

> **Risk:** `dist/migrate.js` is referenced in the compose file but the corresponding `src/migrate.ts` entry point is not confirmed in the current source tree. This MUST be resolved before production deployment.

### 11.4 Environment Files

The production API MUST load `apps/api/.env.production`. The web container MUST have `NEXT_PUBLIC_API_URL` set at build time (Docker `ARG`).

### 11.5 Deployment to Existing Server

When deploying updated source files to a running server (emergency patch flow):
1. SCP files to `/tmp` on the target server (avoids permission issues).
2. SSH and `cp` files from `/tmp` to their correct paths.
3. SSH and trigger `docker compose -f docker-compose.prod.yml up -d --build <service>` to rebuild and restart only the affected service.

---

## 12. Environment Configuration

### 12.1 Required Environment Variables

#### API (`apps/api/.env.production`)

| Variable | Description | Default (dev) |
|----------|-------------|--------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://nexusops:nexusops@localhost:5432/nexusops` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `REDIS_PASSWORD` | Redis AUTH password | — |
| `MEILISEARCH_URL` | Meilisearch base URL (used by search service) | — |
| `MEILISEARCH_HOST` | Meilisearch base URL (used by health check) | `http://localhost:7700` |
| `MEILISEARCH_KEY` | Meilisearch API key | `""` |
| `SESSION_SECRET` | Secret for session signing | — |
| `CORS_ORIGIN` | Comma-separated allowed origins | — |
| `PORT` | API listen port | `3001` |
| `HOST` | API listen host | `0.0.0.0` |
| `NODE_ENV` | `production` \| `development` | `development` |
| `RATE_LIMIT_WINDOW` | Rate limit time window | `"1 minute"` |
| `RATE_LIMIT_PER_TOKEN` | Max req/window for auth users | `1000` (prod) |
| `RATE_LIMIT_ANON` | Max req/window for anon users | `100` (prod) |
| `DB_POOL_MAX` | Max DB pool connections | `20` (prod) / `30` (dev) |
| `DB_POOL_IDLE_TIMEOUT` | DB pool idle timeout (s) | `30` |
| `DB_POOL_CONNECT_TIMEOUT` | DB pool connect timeout (s) | `15` |
| `DB_POOL_MAX_LIFETIME` | DB pool max connection lifetime (s) | `1800` |
| `FLUSH_REDIS_SESSION_ON_START` | Flush sessions on startup | `false` |
| `MEILI_MASTER_KEY` | Meilisearch master key | — |

#### Web (`apps/web/.env.production`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Public-facing API URL (must include scheme) |
| `NEXT_TELEMETRY_DISABLED` | Set to `1` to disable Next.js telemetry |

#### Docker Compose (`.env` or `compose` inline)

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` | PostgreSQL user (default `nexusops`) |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | PostgreSQL database name (default `nexusops`) |
| `REDIS_PASSWORD` | Redis AUTH password |
| `MEILI_MASTER_KEY` | Meilisearch master key |
| `MINIO_ROOT_USER` | MinIO root credentials |
| `MINIO_ROOT_PASSWORD` | MinIO root credentials |

### 12.2 Inconsistency: Meilisearch URL Variable

> **Known Issue:** The API health check reads `process.env.MEILISEARCH_HOST` while the search service reads `process.env.MEILISEARCH_URL`. Both MUST be set consistently, or the codebase MUST be unified to a single variable name (recommendation: `MEILISEARCH_URL`).

---

## 13. Known Technical Gaps & Risks

| ID | Gap / Risk | Severity | Status |
|----|-----------|----------|--------|
| TG-01 | `dist/migrate.js` referenced in `docker-compose.prod.yml` but `src/migrate.ts` entry point not confirmed in source | **High** | Open — create `apps/api/src/migrate.ts` and verify compose migrator |
| TG-02 | `initSearchIndexes()` is defined but not called at API startup | **Medium** | Open — wire into `apps/api/src/index.ts` startup sequence |
| TG-03 | `indexDocument()` in `search.ts` has no call sites — search index is never populated from write operations | **Medium** | Open — wire into mutation procedures |
| TG-04 | `MEILISEARCH_HOST` (health) vs `MEILISEARCH_URL` (search service) variable name inconsistency | **Low** | Open — unify to `MEILISEARCH_URL` |
| TG-05 | `apps/api/package.json` `start` script references `dist/index.js`; Docker CMD uses `dist/index.mjs` | **Medium** | Open — align to `dist/index.mjs` (ESM tsup output) |
| TG-06 | No CPU/memory resource limits on Docker containers | **Medium** | Open — add `deploy.resources.limits` to `docker-compose.prod.yml` |
| TG-07 | CSP `script-src` includes `'unsafe-inline'` and `'unsafe-eval'` | **Medium** | Open — investigate nonce-based CSP |
| TG-08 | No `drizzle/` migration artifacts committed to the repository | **Medium** | Open — run `db:generate` and commit |
| TG-09 | Mutation hard timeout not enforced (only queries have 8 s limit) | **Low** | Open |
| TG-10 | API `typedRoutes` in Next.js is `false` | **Low** | Open |
| TG-11 | File attachment uploads show toast feedback but do not persist to S3/MinIO | **Low** | By design — requires MinIO/S3 configuration and a file upload API endpoint to be wired |
| TG-12 | Virtual Agent NLP is rule-based (BOT_FLOWS) — no LLM fallback for unrecognised freetext beyond ticket creation | **Low** | By design — enterprise ITSM bots are typically rule-based; full NLP requires `ANTHROPIC_API_KEY` and a `/trpc/ai.chat` procedure |
| TG-13 | Drizzle `Symbol(drizzle:Columns)` schema-import error on `tickets.create` and `workOrders.create` for non-admin roles — causes 5xx under stress | **High** | Open — investigate `@nexusops/db` export path for `ticketsTable` / `workOrdersTable` in non-admin code paths; confirmed in 10k stress test |
| TG-14 | RBAC permission gaps: `surveys.create` (hr_manager), `events.list` (security_analyst), `oncall` schedule reads, `walkup` queue reads return FORBIDDEN for expected roles | **High** | Open — expand `permissionProcedure` resource/action bindings for these four modules in the RBAC matrix |
| TG-15 | `auth.login` latency collapses under concentrated concurrent load: `BCRYPT_CONCURRENCY=8` caps throughput to ~8 logins/s; avg wait 4,098ms / p95 5,019ms under 200 concurrent workers | **Critical** | Open — add per-user Redis rate limit (5 attempts/min) upstream of bcrypt semaphore; consider raising `BCRYPT_CONCURRENCY` to 20–32 on production host |
| TG-16 | Bearer token auth inconsistency: some `protectedProcedure` / `permissionProcedure` query-type routes returning 401/403 for valid Bearer tokens in `createContext` middleware | **Medium** | Open — audit all protected procedures to confirm both cookie and Bearer extraction paths are applied consistently |

---

## 14. Assumptions & Dependencies

### 14.1 Assumptions

1. The production server has Docker Engine and Docker Compose v2+ installed.
2. DNS records for all domain names are configured before deploying Traefik / Let's Encrypt.
3. PostgreSQL 16 is the only supported database dialect; no MySQL or SQLite support is planned.
4. Users access the platform exclusively via modern evergreen browsers (Chrome, Firefox, Safari, Edge).
5. File attachments are served via MinIO presigned URLs and do not pass through the API server.
6. The monorepo always builds all packages in dependency order; partial builds are not supported.

### 14.2 External Dependencies

| Dependency | Version | Risk if Unavailable |
|-----------|---------|---------------------|
| Node.js | ≥ 20.0.0 | Build and runtime failure |
| pnpm | ≥ 9.0.0 | Install failure |
| PostgreSQL | 16 | Full application failure |
| Redis | 7 | Session auth, rate limiting, queue failure |
| Docker Engine | latest stable | Deployment failure |
| Let's Encrypt ACME | — | TLS certificate renewal failure |
| Meilisearch | v1.10 | Search degraded (graceful fallback) |
| MinIO | latest | File upload / download failure |
| Google Fonts (CDN) | — | Font fallback to system fonts (non-critical) |

---

## 15. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-26 | Platform Engineering | Initial document created from full codebase analysis |
| 1.1 | 2026-03-27 | Platform Engineering | Updated Known Technical Gaps: added TG-11 (file upload persistence) and TG-12 (virtual agent NLP) as acknowledged by-design items. All frontend action gaps (dead buttons, fake setTimeout stubs, hardcoded static data) resolved — no longer listed as gaps. Build compiles clean at 63 pages. Added `inventory` and `indiaCompliance` to system overview. |
| 1.2 | 2026-03-28 | Platform Engineering | Updated §10 (Testing Requirements) to document k6 load testing infrastructure: `seed_users.js`, `test.js`, `mixed_test.js`, `frontend_test.js`. Confirmed NFR performance targets met or exceeded under 200-VU sustained load (p95 23ms vs 500ms target; 0% error rate). See `NexusOps_Load_Test_Report_2026.md` for full results. Added recommended k6 thresholds to §10. |
| 1.3 | 2026-03-28 | Platform Engineering | **Security requirements added.** Added NFR-SEC-09 (Prototype Pollution Prevention): MUST apply `sanitizeInput()` Fastify `preHandler` stripping `__proto__`/`constructor`/`prototype` — validation criterion: `__proto__` payload MUST return 400, never 500. Added NFR-SEC-10 (Error Code Correctness): MUST NOT use 500 for classifiable conditions; `PRECONDITION_FAILED (412)` for missing org workflow, `BAD_REQUEST (400)` for enum validation failures. Added §10.6 (k6 Security & Reliability Tests): six scripts with MUST-PASS thresholds, required adversarial coverage categories, test data prerequisites, and March 28 baseline. See `NexusOps_K6_Security_and_Load_Test_Report_2026.md`. |

---

*This document was generated from a comprehensive analysis of the NexusOps monorepo source code, configuration files, Docker manifests, and test infrastructure as of March 26, 2026.*
| 1.4 | 2026-03-29 | Platform Engineering | **Observability requirements.** Added NFR-OBS-06 (In-Memory Metrics Collection): O(1) counters, URL normalisation, `onResponse` synchronous update, validation via `/internal/metrics` and reset. Added NFR-OBS-07 (Health Status Evaluation): threshold table, mandatory response fields including `monitor`, always-200 contract. Added NFR-OBS-08 (Active Health Signaling): evaluation frequency, zero-spam invariant, log-level routing, required signal fields, `HEALTH_EVAL_EVERY` configurability. Updated header version. See `NexusOps_Active_Health_Signal_Report_2026.md`. |
| 1.5 | 2026-04-02 | Platform Engineering | **Stress & chaos test findings incorporated.** Added TG-13 (Drizzle schema-import error on `tickets.create`/`workOrders.create` for non-admin roles — **High**, Open). Added TG-14 (RBAC permission gaps on `surveys`, `events`, `oncall`, `walkup` — **High**, Open). Added TG-15 (auth.login latency collapse under concurrent load — **Critical**, Open; `BCRYPT_CONCURRENCY=8` insufficient; recommended fix: Redis per-user rate limit + raise concurrency ceiling). Added TG-16 (Bearer token inconsistency on query-type protected procedures — **Medium**, Open). Observability requirements validated: NFR-OBS-07 (active health monitor correctly transitioned to UNHEALTHY at `auth.login` avg 4,098ms during chaos test) and NFR-OBS-08 (exactly one `SYSTEM_UNHEALTHY` log emitted, zero spam). See `NexusOps_Stress_Test_Report.md` and `NexusOps_Destructive_Chaos_Test_Report_2026.md`. |
