# Coheron (CoheronConnect) — Exhaustive Technical Reference, Architecture & Bug Fixing Guide

**Document Version:** 2.0  
**Target Codebase:** CoheronConnect / NexusOps Monorepo (`c:\Users\jbbas\OneDrive\Desktop\CoheronConnect`)  
**Purpose:** Comprehensive inch-by-inch developer guide for understanding system architecture, codebase navigation, component data flows, module APIs, and open bug resolution.

---

## 1. Project Overview

**Coheron (CoheronConnect / NexusOps)** is an enterprise-grade workflow orchestration, IT Service Management (ITSM), asset management, HR service delivery, statutory payroll, and procurement platform designed as a self-hostable alternative to ServiceNow. It delivers multi-tenant enterprise operations with automated business processes, statutory compliance engines (including DPDP privacy and India statutory tax/payroll math), visual workflow automation via Temporal.io, and unified cross-functional operations.

---

## 2. Exhaustive Tech Stack & Monorepo Dependencies

| Category | Technology / Library | Version / Details | Purpose in CoheronConnect |
| :--- | :--- | :--- | :--- |
| **Languages & Runtimes** | TypeScript | `^5.5.0` (Node.js ≥ 20.0) | Strict end-to-end type safety across apps and packages. |
| | PostgreSQL | 16 | Primary relational database engine. |
| | Node.js | `>=20.0.0` | Server runtime environment. |
| | Package Manager | `pnpm@10.33.0` | Monorepo workspace dependency management. |
| **Frontend (`apps/web`)** | Next.js | `^16.2.2` (React 19) | App Router, Server/Client components, SSR/SSG. |
| | Tailwind CSS | `^3.4.0` | Utility-first styling framework with custom design system. |
| | Radix UI | `^1.1.0` - `^2.1.0` | Headless accessible UI primitives (shadcn/ui pattern). |
| | React Flow / Xyflow | `^11.11.0` | Visual node-based workflow builder UI. |
| | TanStack React Query | `^5.0.0` | Asynchronous state management and client-side caching. |
| | tRPC React / Client | `^11.0.0` | Type-safe RPC query and mutation hooks. |
| | Recharts | `^2.12.0` | SVG charting library for dashboard metrics and reporting. |
| | Tiptap | `^2.10.0` | Rich text WYSIWYG editor for KB articles and tickets. |
| **Mobile (`apps/mobile`)** | Expo / React Native | Expo `~51.0.0`, RN `0.74.3` | Mobile app client for iOS and Android. |
| | Expo Router | `~3.5.0` | File-system based routing for Expo mobile app. |
| | Zustand | `^5.0.14` | Lightweight client state management for mobile UI. |
| **Backend API (`apps/api`)**| Fastify | `^5.0.0` | High-performance HTTP server framework. |
| | tRPC Server | `^11.0.0` | Type-safe backend procedure routers. |
| | Better Auth & SAML | `@node-saml/node-saml ^5.1` | Authentication, OAuth2, SAML 2.0, and OIDC connectors. |
| | ioredis & BullMQ | `ioredis ^5.4`, `bullmq ^5.0` | L2 Redis caching, rate limiting, and queue management. |
| | Zod | `^3.23.0` | Input validation and schema inference across backend/frontend. |
| | Pino & OpenTelemetry | `@opentelemetry/sdk-node` | Structured logging and OTLP distributed tracing. |
| **Workers (`apps/worker`)**| Temporal.io SDK | `^1.11.0` | Long-running durable workflow execution runtime. |
| **Database (`packages/db`)**| Drizzle ORM | `^0.36.4` | TypeScript ORM for schema definitions and SQL queries. |
| | Drizzle Kit | `^0.28.0` | SQL migration generator and Drizzle Studio GUI. |
| **Payroll Engine** | `@coheronconnect/payroll-math` | Workspace package | Pure mathematical calculations for statutory tax/payroll. |
| **Search & Files** | Meilisearch | `^0.44.0` | Full-text search engine for tickets, KB, and assets. |
| | AWS S3 / MinIO | `@aws-sdk/client-s3 ^3.1037` | S3-compatible document and attachment storage. |
| **AI Layer** | Anthropic SDK | `^0.37.0` | Anthropic Claude API for Copilot agent & classification. |
| **Deployment** | Docker & Kubernetes | Helm `charts/coheronconnect` | Containerized deployment with Traefik SSL termination. |

---

## 3. Exhaustive Project Structure & Directory Map

### Root Level
- [package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/package.json) — Monorepo root configuration file defining pnpm workspace, turbo commands, and dev dependencies.
- [pnpm-workspace.yaml](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/pnpm-workspace.yaml) — Workspace declaration linking all `apps/*` and `packages/*`.
- [turbo.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/turbo.json) — Turborepo pipeline definition for task caching and parallel executions.
- [Makefile](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/Makefile) — Convenient shortcuts for docker controls, database migrations, seeding, and local dev execution.
- [docker-compose.dev.yml](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/docker-compose.dev.yml) — Development infrastructure stack (Postgres:5434, Redis:6379, Meilisearch:7700, MinIO:9000/9001, Temporal:7233, MailHog:8025).
- [docker-compose.test.yml](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/docker-compose.test.yml) — Isolated test stack (Postgres:5433, Redis:6380, Meilisearch:7701) for CI & Vitest runs.
- [docker-compose.prod.yml](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/docker-compose.prod.yml) — Production docker compose configuration with Traefik auto-SSL reverse proxy.
- [BUILD.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/BUILD.md) — Architectural status, gap index summary, and build instructions.
- [CLAUDE.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/CLAUDE.md) — Monorepo guidelines, developer commands, and code rules.
- [README.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/README.md) — High-level product overview, setup instructions, and deployment guide.
- [design.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/design.md) — Comprehensive technical architecture, router reference, and debugging manual.
- [details.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/details.md) — Inch-by-inch project details and bug fixing reference guide.

### Applications (`apps/`)
- [apps/api/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api) — Fastify + tRPC backend API server:
  - `src/index.ts` — Server bootstrapper, middleware registration, rate limiters, L1/L2 session cache, DB pool guard.
  - `src/routers/` — 55+ domain tRPC routers mounted on `appRouter` (e.g. `tickets.ts`, `payroll.ts`, `accounting.ts`, `hr.ts`).
  - `src/lib/` — Backend helper utilities (`rbac-db.ts`, `auto-number.ts`, `pii-hash.ts`, `aadhaar.ts`, `pan.ts`, `retention.ts`, `india-tax-engine.ts`, `payroll-cycle.ts`).
  - `src/services/` — Business services (`notifications.ts`, `storage.ts`, `csat.ts`, `business-rules-engine.ts`, `form16-pdf.ts`, `workflow-events.ts`).
  - `src/http/` — REST & Webhook HTTP endpoints (`webhooks.ts`, `payroll-payslip-pdf.ts`, `public-surveys.ts`).
- [apps/web/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web) — Next.js 16 Web Application UI:
  - `src/app/app/` — Application pages (`/app/tickets`, `/app/hr`, `/app/payroll`, `/app/admin`, `/app/financial`, `/app/cmdb`, `/app/grc`, `/app/workflows`).
  - `src/components/` — Shared web UI components, modals, and tables.
  - `src/lib/trpc.ts` — Type-safe tRPC client hooks wrapper.
- [apps/mobile/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile) — React Native / Expo mobile app client.
- [apps/worker/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker) — Background worker executing Temporal workflows (`src/workflows/`) and BullMQ queue tasks.
- [apps/mac/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac) — Coheron Managed Account Console (Next.js web app).
- [apps/docs/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/docs) — Nextra documentation site.

### Packages (`packages/`)
- [packages/db/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/db) — Shared Drizzle ORM database package:
  - `src/schema/` — Table definitions (`auth.ts`, `tickets.ts`, `hr.ts`, `payroll.ts`, `financial.ts`, `assets.ts`, `grc.ts`, `compliance.ts`).
  - `src/seed.ts` — Seeds base organization, default RBAC roles, and admin user (`admin@coheron.com`).
  - `drizzle/` — Versioned SQL migration files (`0000` to `0059`).
- [packages/payroll-math/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/payroll-math) — Mathematical kernel for gross-to-net salary math, EPF, ESI, PT, LWF, and income tax (TDS) calculations.
- [packages/types/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/types) — Shared TypeScript type interfaces and Zod schemas.
- [packages/ui/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/ui) — Shared Tailwind CSS + Radix UI component library.
- [packages/cli/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/cli) — Operational command-line utility (`coheronconnect`).
- [packages/config/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/config) — Monorepo configs for ESLint, Prettier, TSConfig.
- [packages/metrics/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/metrics) — Metric collection and scorecard compute utilities.
- [packages/validators/](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/validators) — Input payload validation helpers.

---

## 4. Main Features, Modules & End-to-End Component Connectivity

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       COHERONCONNECT MODULE MAP                                   │
├───────────────────┬───────────────────┬───────────────────┬───────────────────┬───────────────────┤
│ ITSM & CMDB       │ HR & Payroll      │ Finance & AP/AR   │ Asset Management  │ GRC & DPDP        │
│ • Tickets         │ • Employees       │ • General Ledger  │ • Hardware Assets │ • DPDP Compliance │
│ • Service Catalog │ • Attendance/Leave│ • PR → PO Match   │ • Software (SAM)  │ • Risk Register   │
│ • Work Orders     │ • Statutory TDS   │ • Invoices (AP/AR)│ • CMDB Graph      │ • Audit Ledger    │
│ • Knowledge Base  │ • Gratuity/Accrual│ • GST Tax Engines │ • Facilities      │ • eMudhra Signing │
└─────────┬─────────┴─────────┬─────────┴─────────┬─────────┴─────────┬─────────┴─────────┬─────────┘
          │                   │                   │                   │                   │
          └───────────────────┴─────────┬─────────┴───────────────────┴───────────────────┘
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              Platform Automation & Workflow Core                                  │
│   • Visual Workflow Engine (Temporal.io + React Flow)                                             │
│   • Generalised Business Rule Engine & Event Correlation                                          │
│   • Fine-Grained RBAC Matrix (35+ Modules) & Audit Hash-Chain                                     │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### End-to-End Data Flow Execution Pipeline

1. **Client Action**: User submits a mutation via Web UI (`apps/web`) or Mobile (`apps/mobile`).
2. **tRPC Request**: Request is transmitted via `@trpc/client` over HTTP POST to Fastify API (`apps/api`).
3. **Security & Rate Limiting**: `apps/api/src/index.ts` validates request headers, enforces rate limits, checks in-flight DB connection limits, and strips prototype pollution payloads.
4. **Authentication & Session Cache**: Resolves session token against L1 in-memory cache / L2 Redis cache.
5. **RBAC Permission Gate**: `checkDbUserPermission(db, userId, orgId, module, action)` verifies that the user's role grants permission for the procedure.
6. **Input Validation**: Zod schema parses and validates the payload input.
7. **Business & Domain Execution**: The router procedure invokes domain services (e.g. `payroll-cycle.ts`, `threeWayMatch`, `auto-number.ts`).
8. **Database Transaction**: Drizzle ORM executes type-safe SQL queries against PostgreSQL (`packages/db`).
9. **Tamper-Evident Audit Logging**: State changes trigger `appendAuditEntry`, updating a cryptographic hash chain (`hash = sha256(seq + prevHash + payload)`).
10. **Asynchronous Side Effects**: Background tasks are enqueued to **BullMQ / Redis** or dispatched to **Temporal.io** (`apps/worker`) for long-running workflows (e.g., SLA timers, retention sweeps, webhook dispatchers).

---

## 5. How to Set Up and Run the Project Locally

### Prerequisites
- **Node.js**: `≥20.0.0`
- **pnpm**: `^10.33.0`
- **Docker Desktop**: Daemon running

### Step-by-Step Execution Guide

#### 1. Clone & Install
```bash
git clone https://github.com/Recon-X2025/NexusOps
cd NexusOps
pnpm install
```

#### 2. Environment Configuration
```bash
cp .env.example .env
```
Generate required secrets and paste into `.env`:
```bash
AUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
PII_HASH_PEPPER=$(openssl rand -hex 32)
```

#### 3. Start Local Development Infrastructure
```bash
make docker-up
```
*Starts Postgres (`localhost:5434`), Redis (`6379`), Meilisearch (`7700`), MinIO (`9000/9001`), Temporal (`7233`), and MailHog (`8025`).*

#### 4. Migrate and Seed Database
```bash
pnpm db:migrate
pnpm db:seed
```
*Seeds default tenant, RBAC matrix, and primary admin account:*
- **URL**: `http://localhost:3000`
- **User**: `admin@coheron.com`
- **Password**: `demo1234!`

#### 5. Launch Local Dev Stack
```bash
make dev
```
*Launches Turborepo dev servers: Web (`:3000`), API (`:3001`), and background workers.*

#### 6. Running Automated Unit, Integration & E2E Test Stack
The test stack uses an isolated Docker environment (`docker-compose.test.yml`, Postgres **5433**) to avoid polluting dev data on 5434:

```bash
# 1. Start test stack
pnpm docker:test:up

# 2. Run migrations on test database
pnpm exec dotenv -e .env.test -- pnpm --filter @coheronconnect/db db:migrate

# 3. Run all Vitest package test suites
pnpm exec dotenv -e .env.test -- pnpm test

# 4. Run layer-by-layer API tests
pnpm test:layer1   # Auth & Identity
pnpm test:layer2   # Admin & User Lifecycle
pnpm test:layer3   # ITSM Tickets & Work Orders
pnpm test:layer4   # HR & Employee Operations
pnpm test:layer5   # Payroll & Tax Engine
pnpm test:layer6   # Finance & Accounting
pnpm test:layer7   # Procurement & 3-Way Match
pnpm test:layer8   # Assets, CMDB & Facilities
pnpm test:layer9   # GRC & DPDP Compliance

# 5. Run Playwright End-to-End Tests
pnpm test:e2e
```

---

## 6. Exhaustive Known Bugs, Gaps & Open Issues (Bug-Fixing Manual)

This section provides an **inch-by-inch reference log of known open bugs, architectural gaps, and pending fixes**, complete with source code locations, root cause analysis, impacts, and code guidance for fixing them.

---

### Bug F-001 — OAuth Callback Handler is Dead Code
- **Severity**: **HIGH** (Integrations Broken)
- **Source Locations**:
  - `apps/api/src/services/integrations/google-workspace.ts:134,149`
  - `apps/api/src/services/integrations/microsoft-365.ts:136,152`
- **Root Cause**: `google-workspace.ts` and `microsoft-365.ts` define `beginOAuth` and `completeOAuth` functions, but a repo-wide search reveals **no callers** across `apps/api/src/routers/` or HTTP endpoints.
- **Impact**: Users attempting to connect Google Workspace or Microsoft 365 integrations cannot complete the OAuth authorization flow because no API endpoint handles the callback.
- **Fix Guidance**: Create an `integrations.completeOAuth` tRPC procedure or HTTP callback route in `apps/api/src/routers/integrations.ts` that invokes `completeOAuth` and persists access/refresh tokens.

---

### Bug F-002 — DPDP Notification Delivery is a Log-Only Stub
- **Severity**: **HIGH** (Regulatory Non-Compliance)
- **Source Location**: `apps/api/src/lib/notification-dispatcher.ts:47-64,72`
- **Root Cause**: The active notification dispatcher is `LogOnlyDispatcher`, which inserts a record into `dpdpNotificationArtifacts` with `status: "logged"` and immediately returns without delivering external communications.
- **Impact**: DPDP breach notices, DSR completion alerts, and consent expiration notifications are recorded in DB tables but **never actually delivered** to data principals via Email or SMS.
- **Fix Guidance**: Implement `EmailSmsNotificationDispatcher` in `notification-dispatcher.ts` using `Nodemailer` / SMS provider integrations to transmit statutory notifications upon event trigger.

---

### Bug F-003 — MFA Step-Up Re-Verifies Password Instead of TOTP Code
- **Severity**: **MEDIUM** (Security Control Weakness)
- **Source Location**: `apps/api/src/routers/auth.ts:522-540`
- **Root Cause**: The `verifyStepUp` tRPC procedure takes `{ password }` input and invokes `verifyPassword`. It does not accept or verify a 6-digit TOTP code (`otplib`), even when the user has MFA enabled.
- **Impact**: Step-up re-authentication for high-risk operations (e.g. payout approval, key rotation) asks for the user's password again rather than validating their enrolled 2FA token.
- **Fix Guidance**: Modify `verifyStepUp` in `auth.ts` to check if `user.mfaEnabled === true`; if so, require `{ totpCode }` input and validate it using `otplib.authenticator.verify({ token: totpCode, secret })`.

---

### Bug F-P5 — Payroll Run-Header Totals Frozen at Lock Can Diverge from Payslips
- **Severity**: **MEDIUM** (Financial Reconciliation Defect)
- **Source Locations**:
  - `apps/api/src/routers/payroll.ts:303,320-326` (`lockPeriod`)
  - `apps/api/src/routers/payroll.ts:402-435` (`computePayslips`)
- **Root Cause**: `lockPeriod` computes and freezes `totalGross`, `totalDeductions`, `totalNet`, `totalPt`, and `totalTds` on the `payroll_runs` header row. Payslips are computed later by `computePayslips`. If employee structures or attendance LOP days are modified between `lockPeriod` and `computePayslips`, the run header totals are **never re-calculated**.
- **Impact**: Summary header totals displayed in payroll reports differ from `SUM(payslips.*)`, creating financial reconciliation discrepancies.
- **Fix Guidance**: In `payroll.ts::computePayslips`, re-run `computePayrollRunTotals` at the end of payslip generation and update `payroll_runs` header totals with the actual sum of payslip rows inside a single SQL transaction.

---

### Bug F-P6 — `exportBankFile` Lacks Pipeline State Guard
- **Severity**: **MEDIUM** (Disbursement Control Risk)
- **Source Location**: `apps/api/src/routers/payroll.ts:764-839`
- **Root Cause**: `exportBankFile` checks only `slipRows.length > 0` before building the NEFT/NACH bank disbursement text file. Unlike `generateStatutory` (requires `CFO_APPROVED`), `exportBankFile` checks **no pipeline status**.
- **Impact**: A bank disbursement text file (real money movement instruction) can be exported for a payroll run that is still unapproved (`PAYSLIPS_GENERATED`) or CFO-rejected (`FAILED`).
- **Fix Guidance**: Add a pipeline guard at `payroll.ts:790`:
  ```typescript
  if (run.pipelineStatus !== "CFO_APPROVED" && run.pipelineStatus !== "STATUTORY_GENERATED" && run.pipelineStatus !== "COMPLETED") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bank file export requires approved payroll run." });
  }
  ```

---

### Bug F-P8 — Partial Statutory PT/LWF Overrides Silently Zero Non-Overridden States
- **Severity**: **MEDIUM** (Statutory Deduction Error)
- **Source Locations**:
  - `apps/api/src/lib/india/statutory-ceilings.ts:95-111`
  - `packages/payroll-math/src/statutory-deductions.ts:226,272`
- **Root Cause**: When an organization specifies a custom PT/LWF override for a single state (e.g. Maharashtra), `statutory-ceilings.ts` constructs an `overrides` table containing **only** that state. `computePT` looks up `slabTable[stateKey]`, finds `undefined` for non-overridden states (e.g. Karnataka), and defaults to returning `{ ptAmount: 0 }`, bypassing default state slabs entirely.
- **Impact**: Setting a custom PT override for one state causes employees in all other states to receive **₹0 Professional Tax / LWF deductions**.
- **Fix Guidance**: In `statutory-ceilings.ts`, perform a shallow merge of org overrides onto default `PT_SLABS` / `LWF_RATES` tables rather than constructing a sparse replacement object.

---

### Bug F-S1 — MFA Audit Log Entries Written Outside Tamper-Evident Hash Chain
- **Severity**: **HIGH** (Audit Trail Security Gap)
- **Source Location**: `apps/api/src/routers/auth.ts` (MFA enrollment audit calls)
- **Root Cause**: MFA enrollment audit events invoke plain `db.insert(auditLogs)` without populating the `seq` or `hash` columns, producing rows with `seq IS NULL`.
- **Impact**: MFA security events are logged outside the tamper-evident cryptographic hash-chain (`hash = sha256(seq + prevHash)`), preventing cryptographic verification of MFA audit history.
- **Fix Guidance**: Replace raw `db.insert(auditLogs)` calls in `auth.ts` with `appendAuditEntry(db, orgId, entry)` to ensure sequential `seq` allocation and hash-chain calculation.

---

### Platform Feature Stubs Summary

1. **SAM Entitlement Reconciliation (STUB)**: Hardware Asset Management (HAM) is fully functional, but Software Asset Management (SAM) installed-vs-entitled (ELP) license reconciliation logic is currently a schema scaffold.
2. **CRM Lead/Health Scoring (STUB)**: Lead and account health scores exist in schema columns, but background calculation jobs are un-triggered; CPQ lacks dynamic tax/GST calculation.
3. **Legal/Secretarial Stubs (PARTIAL)**: eMudhra PDF signing is functional, but DocuSign integration is stubbed and MCA21/XBRL regulatory filing is mocked.
4. **Self-Service Portal (STUB)**: Employee self-service request portal & KB template rendering remains in scaffold/stub state.
5. **Scheduled Reports (STUB)**: On-demand CSV/PDF report exports are functional, but recurring scheduled report execution is stubbed.
6. **AI RAG Copilot (ALPHA)**: Claude API integration for ticket classification and copilot search is functional in alpha, but lacks production rate-limit hardening and vector store indexing.

---
*End of Technical Reference & Bug Fixing Manual.*
