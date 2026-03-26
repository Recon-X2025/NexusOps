# NexusOps — Architecture Design Document

**Version:** 1.0  
**Date:** March 2026  
**Organisation:** Coheron  
**Status:** Living Document

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Architecture](#6-database-architecture)
7. [Shared Packages](#7-shared-packages)
8. [Authentication & Session Management](#8-authentication--session-management)
9. [RBAC & Permission System](#9-rbac--permission-system)
10. [API Design — tRPC Routers](#10-api-design--trpc-routers)
11. [Infrastructure & Deployment](#11-infrastructure--deployment)
12. [Data Flow & Request Lifecycle](#12-data-flow--request-lifecycle)
13. [Module Catalogue](#13-module-catalogue)
14. [Security Architecture](#14-security-architecture)
15. [Observability & Monitoring](#15-observability--monitoring)
16. [Environment Configuration](#16-environment-configuration)
17. [Key Architectural Decisions](#17-key-architectural-decisions)

---

## 1. Executive Summary

NexusOps is a full-stack, enterprise-grade IT Service Management (ITSM) and operations platform built by Coheron. It is a **multi-tenant SaaS application** that consolidates IT services, security & compliance, people & workplace, finance, legal, strategy, and developer operations into a single unified interface.

The platform is built as a **TypeScript monorepo** using pnpm workspaces and Turborepo, with a **Next.js 15 frontend**, a **Fastify 5 / tRPC 11 API**, and a **PostgreSQL** database managed via **Drizzle ORM**. All inter-service communication between the browser and the API uses **end-to-end typed tRPC** procedures, eliminating entire classes of type mismatch and API contract bugs.

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (Client)                               │
│                         Next.js 15 + React 19 SPA                          │
│              tRPC React Query  ·  Tailwind CSS  ·  Radix UI                 │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │  HTTPS  (Bearer token, /trpc batch link)
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Server (Node.js)                              │
│             Fastify 5  +  tRPC 11  ·  CORS / Helmet / Rate-limit           │
│                  34 tRPC routers  ·  RBAC middleware  ·  BullMQ             │
└───────┬──────────────────┬───────────────────────┬──────────────────────────┘
        │                  │                        │
        ▼                  ▼                        ▼
  ┌──────────┐      ┌─────────────┐        ┌──────────────┐
  │PostgreSQL│      │   Redis 7   │        │  Meilisearch │
  │(Drizzle) │      │Session Cache│        │ Full-text    │
  │          │      │Rate limiting│        │ Search index │
  │          │      │BullMQ queues│        └──────────────┘
  └──────────┘      └─────────────┘
        │
  ┌──────────┐      ┌─────────────┐        ┌──────────────┐
  │  MinIO   │      │  Temporal   │        │  Mailhog /   │
  │  (S3)    │      │  Workflows  │        │  SMTP        │
  │File store│      │(dev only)   │        │  (email)     │
  └──────────┘      └─────────────┘        └──────────────┘
```

### Technology Stack at a Glance

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js (App Router) | 15.2 |
| UI runtime | React | 19 |
| API framework | Fastify | 5 |
| API contract | tRPC | 11 |
| Database ORM | Drizzle ORM | latest |
| Database | PostgreSQL | 16 |
| Cache / queues | Redis | 7 |
| Full-text search | Meilisearch | latest |
| Object storage | MinIO (S3-compatible) | latest |
| Workflow engine | Temporal | (dev) |
| Auth | Session token (SHA-256 hash, Redis cache) | — |
| Styling | Tailwind CSS + Radix UI | — |
| Monorepo tooling | pnpm workspaces + Turborepo | — |
| Language | TypeScript (strict) | 5.9 |
| Container runtime | Docker + Docker Compose | — |
| Reverse proxy (prod) | Traefik (TLS / Let's Encrypt) | — |

---

## 3. Monorepo Structure

The repository uses **pnpm workspaces** (`pnpm-workspace.yaml`) and **Turborepo** (`turbo.json`) for orchestrated, cached builds across all packages and apps.

```
NexusOps/
├── apps/
│   ├── web/               # @nexusops/web   — Next.js 15 frontend
│   └── api/               # @nexusops/api   — Fastify 5 + tRPC 11 backend
│
├── packages/
│   ├── db/                # @nexusops/db    — Drizzle ORM schemas + client
│   ├── types/             # @nexusops/types — Shared types, Zod schemas, RBAC matrix
│   ├── ui/                # @nexusops/ui    — Shared Radix-based UI primitives
│   └── config/            # @nexusops/config — ESLint, Prettier, TSConfig presets
│
├── e2e/                   # Playwright end-to-end tests
├── scripts/               # Utility scripts (seed, populate, etc.)
├── infra/                 # Infrastructure config (Temporal dynamic config)
│
├── docker-compose.dev.yml
├── docker-compose.test.yml
├── docker-compose.prod.yml
├── docker-compose.vultr-test.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Dependency Graph

```
@nexusops/web
   ├── @nexusops/types
   ├── @nexusops/ui
   └── @nexusops/api (for AppRouter type only — dev dep)

@nexusops/api
   ├── @nexusops/db
   └── @nexusops/types

@nexusops/db
   └── (postgres-js, drizzle-orm)

@nexusops/types
   └── (zod)

@nexusops/ui
   └── (radix-ui, tailwind)

@nexusops/config
   └── (eslint, prettier, typescript)
```

---

## 4. Frontend Architecture

### 4.1 Framework & Routing

The frontend is built on **Next.js 15 App Router**, using the `src/app/` directory for filesystem-based routing. All authenticated pages are nested under `src/app/app/` and share a common shell layout.

```
src/
├── app/
│   ├── layout.tsx                  # Root layout: ThemeProvider, TRPCProvider, Toaster
│   ├── page.tsx                    # Marketing / root redirect
│   │
│   ├── login/page.tsx              # Auth: Sign in
│   ├── signup/page.tsx             # Auth: Register
│   ├── forgot-password/page.tsx    # Auth: Password reset request
│   ├── reset-password/[token]/     # Auth: Set new password
│   ├── invite/[token]/             # Auth: Accept org invite
│   │
│   └── app/
│       ├── layout.tsx              # Authenticated shell (sidebar, header, RBAC, agent)
│       ├── page.tsx                # Platform home
│       ├── dashboard/
│       ├── admin/
│       ├── profile/
│       ├── notifications/
│       ├── virtual-agent/
│       ├── [... all domain modules ...]
│       └── secretarial/
│
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx         # Collapsible sidebar with badge polling
│   │   ├── app-header.tsx          # Breadcrumbs, theme, notifications, user menu
│   │   └── virtual-agent-widget.tsx
│   └── providers/
│       └── trpc-provider.tsx       # React Query + tRPC providers
│
└── lib/
    ├── trpc.ts                     # tRPC client (httpBatchLink, Bearer auth)
    ├── rbac-context.tsx            # RBACProvider + can() / canAccess() hooks
    ├── rbac.ts                     # Role helpers, mock users (demo mode)
    └── sidebar-config.ts           # Sidebar structure + RBAC visibility rules
```

### 4.2 State Management

- **Server state:** All server data is fetched via **tRPC + React Query**. No Redux or Zustand is used for remote data.
- **UI state:** Local `useState` / `useReducer` in component. Sidebar open/collapsed state is persisted to `localStorage` (`nexusops_sidebar_state`).
- **Form state:** `react-hook-form` for all forms, validated with **Zod** schemas shared from `@nexusops/types`.
- **Auth state:** RBAC context (`RBACProvider`) hydrates from `trpc.auth.me` on mount; uses a deny-all `LOADING_USER` sentinel while in-flight.

### 4.3 tRPC Client

```typescript
// src/lib/trpc.ts (simplified)
export const trpc = createTRPCReact<AppRouter>();

const client = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${NEXT_PUBLIC_API_URL}/trpc`,
      timeout: 12000,
      headers: () => ({
        Authorization: `Bearer ${localStorage.getItem("nexusops_session")}`,
      }),
    }),
  ],
});
```

All API calls are **end-to-end typed** — the `AppRouter` type is imported directly from `@nexusops/api` as a dev dependency, meaning TypeScript validates every query and mutation call, input shape, and output shape at build time.

### 4.4 UI Component Library

- **Radix UI** primitives for accessible interactive components (dialogs, dropdowns, tooltips, etc.)
- **Tailwind CSS** for utility-based styling with a consistent design token system
- **`@nexusops/ui`** shared package for cross-app primitives (Button, Card, Badge, Input, Dialog, Tabs, etc.)
- **Lucide React** for iconography
- **Recharts** for charts and analytics visualisations
- **React Flow** for workflow builder canvas
- **TipTap** for rich text editing (knowledge articles, legal matters, etc.)
- **`sonner`** for toast notifications

### 4.5 Sidebar Architecture

The sidebar is defined declaratively in `sidebar-config.ts` as a list of `SidebarGroup[]`, where each group contains `SidebarItem[]` with optional `children`. Visibility is controlled by:

- `module: Module` — checked against the user's `visibleModules` set (from RBAC)
- `requiresRole: SystemRole` — checked with `hasRole()`
- `children[].href` — each child carries a unique URL (including `?tab=` query params where a page uses tab-based navigation)

The `AppSidebar` component polls tRPC badge endpoints (e.g. open incident count, pending approvals) to display live badge counts on nav items.

---

## 5. Backend Architecture

### 5.1 Framework

The API is a **Fastify 5** server exposing a **tRPC 11** adapter mounted at `/trpc`. The architecture is deliberately thin at the HTTP layer — Fastify handles transport, security headers, rate limiting, and health checks; tRPC handles all application logic.

```
apps/api/src/
├── index.ts               # Fastify server bootstrap, plugin registration, health routes
├── routers/
│   ├── index.ts           # AppRouter — merges all 33 domain routers
│   └── *.ts               # 33 domain routers (one per module)
├── middleware/
│   └── auth.ts            # createContext: session resolution, Redis cache, L1 in-memory cache
├── lib/
│   ├── trpc.ts            # tRPC instance: publicProcedure, protectedProcedure, permissionProcedure, adminProcedure
│   ├── rbac-db.ts         # DB-level RBAC: maps DB role + matrix_role → SystemRole[]
│   └── redis.ts           # Shared ioredis client
└── services/
    ├── workflow.ts         # BullMQ job queue service
    ├── search.ts           # Meilisearch integration
    ├── email.ts            # Nodemailer / SMTP
    └── oidc.js             # OIDC/OAuth Fastify routes (dynamic import)
```

### 5.2 Fastify Plugins & Middleware

| Plugin | Purpose |
|--------|---------|
| `@fastify/cors` | Cross-origin resource sharing (CORS_ORIGIN env) |
| `@fastify/helmet` | HTTP security headers (CSP disabled for SPA compatibility) |
| `@fastify/rate-limit` | Redis-backed rate limiting; per-token bucket for authenticated requests, per-IP for anonymous |
| `@fastify/multipart` | File upload support |
| tRPC adapter | Mounts all procedures at `/trpc` |
| OIDC plugin | OAuth2 / OIDC login flows (Google, etc.) |

### 5.3 tRPC Procedure Types

All procedures are defined in `src/lib/trpc.ts` and compose a chain of middlewares:

```
publicProcedure
  └─ loggingMiddleware (request log, latency, 8s query timeout)

protectedProcedure
  └─ loggingMiddleware
  └─ enforceAuth (ctx.user must exist)
  └─ auditMutation (writes audit log for mutations)
  └─ retryMutation (retries on transient DB errors)

permissionProcedure(module, action)
  └─ protectedProcedure chain
  └─ checkDbUserPermission(module, action) via rbac-db.ts

adminProcedure
  └─ protectedProcedure chain
  └─ requires DB role: "owner" or "admin"
```

### 5.4 Request Context

Every tRPC procedure receives a typed `ctx` object built in `createContext()`:

```typescript
interface Context {
  db: DrizzleClient;          // Drizzle DB instance
  user: User | null;          // Resolved authenticated user
  org: Organisation | null;   // User's organisation
  session: Session | null;    // Active session record
  requestId: string;          // nanoid request trace ID
  ip: string;                 // Client IP (for rate limiting / audit)
  userAgent: string;          // Client UA string
}
```

Session resolution follows a **three-tier cache**:
1. **L1 In-memory** — per-process Map, TTL ~60s
2. **L2 Redis** — distributed cache across instances
3. **L3 PostgreSQL** — authoritative source; writes back to Redis on miss

### 5.5 Background Jobs (BullMQ)

The API initialises a **BullMQ** service on startup backed by Redis. This powers:
- Async workflow step execution
- Email notifications queue
- Scheduled compliance/SLA deadline jobs

---

## 6. Database Architecture

### 6.1 ORM & Driver

| Concern | Choice |
|---------|--------|
| ORM | Drizzle ORM (type-safe, zero-overhead) |
| Driver | `postgres-js` |
| Database | PostgreSQL 16 |
| Migrations | `drizzle-kit` (`db:push` / `db:migrate`) |
| Connection pooling | `postgres-js` native pool; tuned via `DB_POOL_MAX` env |

### 6.2 Schema Domains

All schemas live in `packages/db/src/schema/` and are re-exported from a single barrel `schema/index.ts`.

| Domain | Schema File | Key Tables |
|--------|------------|-----------|
| **Auth & Identity** | `auth.ts` | `organizations`, `users`, `sessions`, `accounts`, `apiKeys`, `roles`, `permissions`, `rolePermissions`, `userRoles`, `auditLogs`, `invites`, `verificationTokens` |
| **Counters** | `counters.ts` | `orgCounters` (per-org sequential ticket/WO numbering) |
| **ITSM — Tickets** | `tickets.ts` | `tickets`, `ticketComments`, `ticketWatchers`, `ticketRelations`, `ticketActivityLogs`, `ticketCategories`, `ticketPriorities`, `ticketStatuses`, `teams`, `teamMembers`, `slaPolicies` |
| **Changes & Releases** | `changes.ts` | `changeRequests`, `changeApprovals`, `problems`, `knownErrors`, `releases` |
| **Work Orders** | `work-orders.ts` | `workOrders`, `workOrderTasks`, `workOrderActivityLogs` |
| **Assets & CMDB** | `assets.ts` | `assets`, `assetTypes`, `assetHistory`, `ciItems`, `ciRelationships`, `softwareLicenses`, `licenseAssignments` |
| **Workflows** | `workflows.ts` | `workflows`, `workflowVersions`, `workflowRuns`, `workflowStepRuns` |
| **HR** | `hr.ts` | `employees`, `hrCases`, `hrCaseTasks`, `onboardingTemplates`, `leaveRequests`, `leaveBalances` |
| **Procurement** | `procurement.ts` | `vendors`, `purchaseRequests`, `purchaseRequestItems`, `purchaseOrders`, `poLineItems`, `invoices`, `approvalChains`, `approvalRequests` |
| **Portal / Knowledge** | `portal.ts`, `knowledge.ts` | `kbArticles`, `requestTemplates`, `announcements`, `kbFeedback` |
| **Approvals** | `approvals.ts` | `approvalSteps` |
| **Financial** | `financial.ts` | `budgetLines`, `chargebacks` |
| **Catalog** | `catalog.ts` | `catalogItems`, `catalogRequests` |
| **Security** | `security.ts` | `securityIncidents`, `vulnerabilities` |
| **GRC** | `grc.ts` | `risks`, `policies`, `auditPlans`, `vendorRisks` |
| **Contracts** | `contracts.ts` | `contracts`, `contractObligations` |
| **Projects** | `projects.ts` | `projects`, `projectMilestones`, `projectTasks` |
| **CRM** | `crm.ts` | `crmAccounts`, `crmContacts`, `crmDeals`, `crmLeads`, `crmActivities`, `crmQuotes` |
| **Legal** | `legal.ts` | `legalMatters`, `legalRequests`, `investigations` |
| **Facilities** | `facilities.ts` | `buildings`, `rooms`, `roomBookings`, `moveRequests`, `facilityRequests` |
| **DevOps** | `devops.ts` | `pipelineRuns`, `deployments` |

### 6.3 Multi-tenancy

All domain tables include an **`orgId`** foreign key referencing `organizations.id`. Every query in every tRPC router is scoped by `ctx.org.id` — tenants are fully data-isolated at the query level. There is no row-level security (RLS) at the PostgreSQL layer; isolation is enforced entirely in application code via `permissionProcedure` and `where(eq(table.orgId, ctx.org.id))` clauses.

---

## 7. Shared Packages

### 7.1 `@nexusops/types`

The canonical shared type library. Both the frontend and the backend import from it, ensuring types are never duplicated.

**Exports:**
- **Zod schemas** — `SignupSchema`, `LoginSchema`, domain input schemas used for form validation (frontend) and tRPC input validation (backend)
- **`rbac-matrix.ts`** — The authoritative RBAC definition: `SystemRole`, `Module`, `RbacAction`, `ROLE_PERMISSIONS`, `hasPermission`, `canAccessModule`, `getVisibleModules`
- **Domain types** — `tickets`, `assets`, `hr`, `procurement`, `currencies`, and more

### 7.2 `@nexusops/ui`

Shared Radix-based UI primitive library, built with `tsup`.

**Exported components:** `Button`, `Badge`, `Card`, `Dialog`, `Input`, `Label`, `Select`, `Separator`, `Skeleton`, `Spinner`, `Tabs`, `Tooltip`, plus `cn()` styling utility.

Used by `apps/web` to maintain visual consistency and avoid duplication.

### 7.3 `@nexusops/db`

The shared database package consumed exclusively by `apps/api`.

**Exports:**
- `getDb()` — returns a connection-pooled Drizzle client (singleton per process)
- All Drizzle schema definitions (tables, relations, enums)
- All Drizzle operators re-exported for convenience (`eq`, `and`, `or`, `desc`, `asc`, `sql`, etc.)
- Migration scripts via `drizzle-kit`

### 7.4 `@nexusops/config`

Developer tooling configurations shared across all packages and apps:
- **ESLint** config (`./eslint`)
- **Prettier** config with Tailwind plugin (`./prettier`)
- **TypeScript** base config (`./tsconfig`)
- **TypeScript** Next.js config (`./tsconfig-nextjs`)

---

## 8. Authentication & Session Management

### 8.1 Flow

```
Browser                          API                          Database / Redis
  │                               │                               │
  │──POST /trpc/auth.login ──────►│                               │
  │   { email, password }         │──SELECT user WHERE email ────►│
  │                               │◄── user record ───────────────│
  │                               │  bcrypt.compare(password)     │
  │                               │──INSERT INTO sessions ────────►│
  │                               │  token = nanoid()             │
  │                               │  tokenHash = SHA-256(token)   │
  │                               │──SET redis:session:<hash> ───►│
  │◄── { token } ─────────────────│                               │
  │  localStorage("nexusops_session", token)                      │
  │                               │                               │
  │──GET /trpc/auth.me ──────────►│                               │
  │  Authorization: Bearer <token>│  hash = SHA-256(token)       │
  │                               │──GET redis:session:<hash> ───►│
  │                               │◄── user+org (cache hit) ──────│
  │◄── { user, org, roles } ──────│                               │
```

### 8.2 Session Storage

| Layer | Storage | TTL | Purpose |
|-------|---------|-----|---------|
| Client | `localStorage` key `nexusops_session` | Browser session | Holds plaintext token |
| L1 Cache | In-process `Map` | ~60s | Avoids Redis round-trip within single pod |
| L2 Cache | Redis key `session:<hash>` | Configurable | Distributed cache |
| Persistent | `sessions` table (PostgreSQL) | Until explicit logout | Source of truth |

The token stored in the database is **hashed (SHA-256)** — plaintext never touches the database. The hash is also used as the Redis key.

### 8.3 Social / OIDC Auth

A separate OIDC service (`src/services/oidc.js`) registers OAuth 2.0 routes on Fastify for third-party providers (Google). The flow results in the same session token being issued once the OIDC callback completes.

### 8.4 API Keys

The `apiKeys` table supports machine-to-machine authentication for programmatic access, following the same Bearer token pattern.

---

## 9. RBAC & Permission System

### 9.1 Design Philosophy

NexusOps uses a **role-based, module-scoped permission system** defined in `@nexusops/types/rbac-matrix.ts`. The matrix is the single source of truth used by both the frontend (to show/hide UI) and the backend (to enforce procedure access).

There are **no implicit permissions** — every role is explicitly granted the exact set of actions it may perform on each module. The `admin` role is the sole exception and bypasses all module checks.

### 9.2 Roles

| Category | Roles |
|----------|-------|
| Platform | `admin`, `requester`, `report_viewer`, `approver` |
| ITSM | `itil`, `itil_admin`, `itil_manager`, `change_manager`, `problem_manager`, `field_service`, `operator_field`, `manager_ops` |
| Security / GRC | `security_admin`, `security_analyst`, `grc_analyst` |
| People | `hr_manager`, `hr_analyst` |
| Finance | `finance_manager`, `procurement_admin`, `procurement_analyst` |
| Assets | `cmdb_admin`, `vendor_manager`, `catalog_admin` |
| Projects | `project_manager` |

### 9.3 Actions

`read` · `write` · `delete` · `admin` · `approve` · `assign` · `close`

### 9.4 Modules (~40+)

Covering all platform domains: `incidents`, `changes`, `problems`, `work_orders`, `cmdb`, `ham`, `sam`, `security`, `grc`, `secretarial`, `hr`, `onboarding`, `facilities`, `financial`, `procurement`, `contracts`, `legal`, `projects`, `analytics`, `reports`, `csm`, `accounts`, `catalog`, `knowledge`, `devops`, `admin`, `users`, `audit_log`, `approvals`, `workflows`, and more.

### 9.5 Role Assignment

```
Database user record
  ├── role: "owner" | "admin" | "member" | "viewer"   ← base DB role
  └── matrix_role: "itil" | "hr_manager" | ...        ← additive RBAC role

Effective SystemRole[] = base_roles_from_db_role + [matrix_role]

Examples:
  owner       → ["requester", "admin"]
  member      → ["requester"]
  member + itil → ["requester", "itil"]
  owner + hr_manager → ["requester", "admin", "hr_manager"]
```

### 9.6 Frontend Enforcement

```typescript
// rbac-context.tsx
const can = (module: Module, action: RbacAction): boolean =>
  hasPermission(currentUser.roles, module, action);

const canAccess = (module: Module): boolean =>
  canAccessModule(currentUser.roles, module);

// Usage in components:
if (!can("grc", "read")) return <AccessDenied />;

// In sidebar-config.ts:
{ label: "GRC", href: "/app/grc", module: "grc" }
// → hidden if !canAccess("grc")
```

### 9.7 Backend Enforcement

```typescript
// Any protected endpoint:
export const listRisks = permissionProcedure("grc", "read")
  .query(async ({ ctx }) => {
    return ctx.db.select().from(risks).where(eq(risks.orgId, ctx.org.id));
  });

// Admin-only:
export const deleteOrg = adminProcedure
  .mutation(async ({ ctx, input }) => { ... });
```

---

## 10. API Design — tRPC Routers

The `AppRouter` merges **33 domain routers** plus the `auth` router, all mounted at `/trpc`.

| Router | Module | Key Procedures |
|--------|--------|---------------|
| `auth` | — | `login`, `signup`, `logout`, `me`, `forgotPassword`, `resetPassword`, `updateProfile` |
| `admin` | `admin` | Org management, user management, invite, role assignment |
| `dashboard` | multiple | `getMetrics`, `getRecentActivity`, `getAlerts` |
| `tickets` | `incidents` | CRUD, assign, comment, SLA tracking, activity log |
| `changes` | `changes` | Change request lifecycle, approvals, CAB |
| `workOrders` | `work_orders` | Field service jobs, tasks, parts |
| `assets` | `cmdb`, `ham`, `sam` | CI items, relationships, software licenses |
| `workflows` | `workflows` | Builder CRUD, trigger, run history |
| `hr` | `hr`, `onboarding` | Employees, cases, leave, onboarding templates |
| `procurement` | `procurement` | Purchase requests, POs, invoices, approval chains |
| `financial` | `financial` | Budget lines, chargebacks |
| `contracts` | `contracts` | Contract lifecycle, obligations |
| `legal` | `legal` | Matters, requests, investigations |
| `projects` | `projects` | Projects, milestones, tasks |
| `crm` | `accounts` | Accounts, contacts, deals, leads, activities, quotes |
| `csm` | `csm` | Customer success management |
| `catalog` | `catalog` | Service catalog items, requests |
| `security` | `security` | Incidents, vulnerabilities |
| `grc` | `grc` | Risks, policies, audits, vendor risks |
| `approvals` | `approvals` | Multi-level approval workflows |
| `devops` | `devops` | Pipeline runs, deployments |
| `knowledge` | `knowledge` | KB articles, feedback |
| `surveys` | `analytics` | Survey creation, responses, analytics |
| `notifications` | — | User notification inbox |
| `events` | — | Platform event stream |
| `facilities` | `facilities` | Buildings, rooms, bookings, move/facility requests |
| `walkup` | `incidents` | Walk-up service desk |
| `oncall` | `incidents` | On-call schedules, escalations |
| `vendors` | `procurement` | Vendor registry |
| `reports` | `analytics`, `reports` | Cross-module reporting |
| `search` | — | Meilisearch federated search across modules |
| `apm` | `reports` | Application performance monitoring metrics |
| `ai` | — | Virtual agent / Anthropic AI integration |

---

## 11. Infrastructure & Deployment

### 11.1 Docker Compose Environments

#### Development (`docker-compose.dev.yml`)

```
Services:
  postgres    — PostgreSQL 16-alpine     (port 5432, named volume)
  redis       — Redis 7-alpine           (port 6379, named volume)
  meilisearch — Meilisearch latest       (port 7700)
  minio       — MinIO latest             (ports 9000/9001)
  temporal    — Temporal auto-setup      (port 7233, depends on postgres)
  mailhog     — MailHog SMTP/UI          (ports 1025/8025)
```

Developers run the **Next.js dev server** (`pnpm --filter @nexusops/web dev`) and the **Fastify API** (`pnpm --filter @nexusops/api dev`) locally, pointing to these Docker-managed backing services.

#### Test (`docker-compose.test.yml`)

```
Services:
  postgres-test    — port 5433, tmpfs-backed (fast teardown)
  redis-test       — port 6380
  meilisearch-test — port 7701
```

Used exclusively by CI/CD and the Playwright E2E suite.

#### Production (`docker-compose.prod.yml`)

```
Services:
  web        — @nexusops/web     (Next.js standalone, Traefik TLS)
  api        — @nexusops/api     (Fastify, Traefik TLS)
  migrator   — One-shot DB migration runner
  postgres   — PostgreSQL 16     (named volume, password auth)
  redis      — Redis 7           (named volume, requirepass)
  meilisearch
  minio
  traefik    — Reverse proxy, Let's Encrypt TLS for web + api
```

#### Vultr Staging (`docker-compose.vultr-test.yml`)

```
Services:
  web    — port 80:3000 (HTTP, no Traefik)
  api    — port 3001
  postgres, redis, (optional migrator)
```

Used for staging/QA deployments to the Vultr VPS at `139.84.154.78`.

### 11.2 Dockerfiles

| App | Dockerfile | Strategy |
|-----|-----------|----------|
| `apps/web` | `apps/web/Dockerfile` | Multi-stage: `deps` (pnpm install) → `builder` (Next.js build) → `runner` (standalone output) |
| `apps/api` | `apps/api/Dockerfile` | Multi-stage: `deps` → `builder` (tsup compile) → `runner` (Node minimal) |

The Next.js `output: 'standalone'` configuration is used to produce a minimal runtime image.

### 11.3 Build Pipeline (Turborepo)

```
turbo build
  └─ @nexusops/config    (no build step — configs only)
  └─ @nexusops/types     (tsup → dist/)
  └─ @nexusops/ui        (tsup → dist/)
  └─ @nexusops/db        (tsup → dist/)
  └─ @nexusops/api       (tsup → dist/)
  └─ @nexusops/web       (next build → .next/)
```

Turborepo caches build outputs, so unchanged packages are not rebuilt.

---

## 12. Data Flow & Request Lifecycle

### 12.1 Authenticated API Request

```
1. User action triggers tRPC query/mutation in React component
   └─ trpc.tickets.list.useQuery({ status: "open" })

2. React Query checks its cache
   └─ Cache miss → proceeds to network

3. tRPC httpBatchLink batches concurrent requests into single POST
   └─ POST /trpc/tickets.list?batch=1
   └─ Headers: { Authorization: "Bearer <token>" }

4. Fastify receives request
   └─ CORS / Helmet / Rate-limit checks
   └─ tRPC adapter invokes createContext()

5. createContext() resolves session
   └─ SHA-256(token) → L1 Map cache check
   └─ miss → Redis GET nexusops:session:<hash>
   └─ miss → SELECT from sessions + users + organizations
   └─ Writes back to Redis + L1 cache
   └─ ctx = { db, user, org, session, requestId, ip, ua }

6. tRPC router matches procedure: tickets.list
   └─ loggingMiddleware — logs request, starts timer
   └─ enforceAuth       — verifies ctx.user != null
   └─ auditMutation     — (mutation only) writes auditLogs
   └─ permissionProcedure("incidents", "read") — checks RBAC
   └─ procedure handler:
      └─ db.select().from(tickets)
         .where(and(eq(tickets.orgId, ctx.org.id), eq(tickets.status, "open")))

7. Drizzle executes parameterised SQL on PostgreSQL

8. Response serialised → JSON → browser

9. React Query stores response in cache (staleTime: 30s default)
   └─ Component re-renders with data
```

### 12.2 Session Invalidation

```
Logout → trpc.auth.logout.mutate()
  └─ DELETE FROM sessions WHERE tokenHash = hash
  └─ DEL redis:session:<hash>
  └─ L1 cache entry removed
  └─ Client: localStorage.removeItem("nexusops_session")
  └─ Router redirect to /login
```

---

## 13. Module Catalogue

The platform is organised into **8 top-level sections** in the sidebar, each grouping related modules:

### IT Services
| Module | Path | Description |
|--------|------|-------------|
| Overview | `/app/it-services` | IT operations hub |
| Service Desk | `/app/tickets` | Incident & service request management |
| Changes | `/app/changes` | Change request lifecycle (CAB, approvals) |
| Problems | `/app/problems` | Problem management (root cause, known errors) |
| Work Orders | `/app/work-orders` | Field service work orders & tasks |
| On-Call | `/app/on-call` | On-call scheduling & escalations |
| Events | `/app/events` | Platform event stream |
| CMDB | `/app/cmdb` | Configuration Management Database |
| Hardware Asset Mgmt | `/app/ham` | Hardware asset lifecycle |
| Software Asset Mgmt | `/app/sam` | Software license tracking |
| Releases | `/app/releases` | Release & deployment tracking |
| Workflows | `/app/workflows` | Visual workflow automation builder |
| Escalations | `/app/escalations` | Escalation management |

### Security & Compliance
| Module | Path | Description |
|--------|------|-------------|
| Overview | `/app/security-compliance` | Security operations hub |
| Security Ops | `/app/security` | Incidents, vulnerabilities |
| GRC | `/app/grc` | Governance, Risk & Compliance |
| Approvals | `/app/approvals` | Multi-level approval workflows |
| DevOps | `/app/devops` | Pipeline runs, deployments |

### People & Workplace
| Module | Path | Description |
|--------|------|-------------|
| Overview | `/app/people-workplace` | HR & workplace hub |
| HR | `/app/hr` | Employee records, cases, leave |
| Facilities | `/app/facilities` | Buildings, rooms, move requests |
| Walk-Up | `/app/walk-up` | Walk-up service desk |
| Employee Portal | `/app/employee-portal` | Self-service portal |
| Employee Center | `/app/employee-center` | Announcements, policies |

### Customer & Sales
| Module | Path | Description |
|--------|------|-------------|
| Overview | `/app/customer-sales` | Customer operations hub |
| CSM | `/app/csm` | Customer success management |
| CRM | `/app/crm` | Accounts, contacts, deals, leads |
| Catalog | `/app/catalog` | Service catalog & request fulfillment |
| Surveys | `/app/surveys` | Survey builder & analytics |

### Finance & Procurement
| Module | Path | Description |
|--------|------|-------------|
| Overview | `/app/finance-procurement` | Finance hub |
| Procurement | `/app/procurement` | PRs, POs, invoices |
| Financial | `/app/financial` | Budgets, chargebacks |
| Vendors | `/app/vendors` | Vendor registry & management |

### Legal & Governance
| Module | Path | Description |
|--------|------|-------------|
| Overview | `/app/legal-governance` | Legal hub |
| Legal | `/app/legal` | Matters, requests, investigations |
| Contracts | `/app/contracts` | Contract lifecycle, obligations |
| Secretarial & CS | `/app/secretarial` | Company secretary, MCA filings, board |

### Strategy & Projects
| Module | Path | Description |
|--------|------|-------------|
| Overview | `/app/strategy-projects` | Strategy hub |
| Projects | `/app/projects` | Project management, milestones, tasks |
| APM | `/app/apm` | Application performance monitoring |
| Reports | `/app/reports` | Cross-module reporting & analytics |

### Developer & Ops
| Module | Path | Description |
|--------|------|-------------|
| DevOps | `/app/developer-ops` | CI/CD, pipelines, deployments |
| Knowledge | `/app/knowledge` | Knowledge base articles |

---

## 14. Security Architecture

### 14.1 Transport Security

- All production traffic served over **HTTPS** via Traefik with **Let's Encrypt** TLS (auto-renew)
- `@fastify/helmet` sets security headers on all responses
- CORS is restricted to configured `CORS_ORIGIN`

### 14.2 Authentication Security

- Passwords hashed with **bcrypt** (bcrypt v6, cost factor default)
- Session tokens are `nanoid()` random strings — **never stored in plaintext** in the database
- Token stored in DB as `SHA-256(token)` hash
- Redis key is also `SHA-256(token)` — knowledge of the Redis key does not expose the token
- No JWT — all sessions are server-side revocable

### 14.3 Rate Limiting

Redis-backed rate limiting via `@fastify/rate-limit`:
- **Authenticated requests:** bucketed per session token (`RATE_LIMIT_MAX`, default 200,000/window)
- **Anonymous requests:** bucketed per IP (`RATE_LIMIT_ANON_MAX`)
- Configurable via environment variables for production tuning

### 14.4 Audit Logging

Every **mutation** through `protectedProcedure` writes an entry to the `auditLogs` table (via `auditMutation` middleware) containing: `userId`, `orgId`, `action`, `resource`, `resourceId`, `ip`, `userAgent`, `timestamp`, `before`/`after` snapshots.

### 14.5 Input Validation

All tRPC procedure inputs are validated with **Zod** schemas before reaching the handler. Shared schemas from `@nexusops/types` ensure front-end and back-end validation are identical.

### 14.6 SQL Injection Prevention

Drizzle ORM uses **parameterised queries** exclusively. No raw SQL string interpolation of user input is permitted.

### 14.7 Multi-Tenant Isolation

Every query is scoped with `where(eq(table.orgId, ctx.org.id))`. The `permissionProcedure` ensures `ctx.org` is always populated before execution. Cross-tenant data leakage requires both a compromised session and a bug in the `where` clause of a specific procedure.

---

## 15. Observability & Monitoring

### 15.1 Logging

- **tRPC loggingMiddleware** logs every request with: procedure path, `requestId`, `userId`, `orgId`, duration (ms), slow query warnings (threshold configurable)
- **8-second hard timeout** on query procedures — returns a timeout error before a runaway query can exhaust the connection pool
- Structured JSON logs output to stdout, collected by Docker log driver

### 15.2 Tracing

- **OpenTelemetry** packages are installed (`@opentelemetry/api`, `@opentelemetry/sdk-node`, etc.) for distributed tracing instrumentation. Exporters can be configured per environment.
- Each request carries a `requestId` (nanoid) that threads through context, logs, and audit records for correlation.

### 15.3 Health Checks

- `GET /health` — Fastify API health endpoint (checks DB + Redis connectivity)
- `GET /api/health` — Next.js web health endpoint
- Docker `HEALTHCHECK` directives in compose files poll these endpoints for container orchestration

### 15.4 Search Index

Meilisearch maintains a real-time full-text search index over key entity types (tickets, assets, knowledge articles, etc.), powered by the `search` tRPC router and the `src/services/search.ts` indexing service.

---

## 16. Environment Configuration

### 16.1 Required Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | api, db | PostgreSQL connection string |
| `REDIS_URL` | api | Redis connection string |
| `AUTH_SECRET` | api | Session token signing secret |
| `ENCRYPTION_KEY` | api | Field-level encryption key (sensitive data) |
| `MEILISEARCH_URL` | api | Meilisearch base URL |
| `MEILISEARCH_KEY` | api | Meilisearch master key |
| `NEXT_PUBLIC_API_URL` | web | API base URL (browser) |
| `NEXT_PUBLIC_APP_URL` | web | Frontend base URL |
| `NODE_ENV` | all | `development` / `production` |

### 16.2 Optional / Feature Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Virtual Agent AI (Claude) |
| `GOOGLE_CLIENT_ID/SECRET` | OIDC login via Google |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | MinIO / S3 file storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Transactional email |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_ANON_MAX` | Rate limiting tuning |
| `DB_POOL_MAX` | PostgreSQL connection pool size |
| `FLUSH_REDIS_SESSION_ON_START` | Clear session cache on startup |
| `LICENSE_KEY` | Platform license |

### 16.3 Build-Time Variables (Next.js)

Variables prefixed with `NEXT_PUBLIC_` are embedded at build time and exposed to the browser. Sensitive values must never use this prefix.

---

## 17. Key Architectural Decisions

### ADR-001: Monorepo with pnpm + Turborepo

**Decision:** All code lives in a single repository with pnpm workspaces.  
**Rationale:** Enables atomic cross-package changes, end-to-end type safety without publishing packages, and fast incremental builds via Turborepo's content-addressed cache.  
**Trade-off:** Requires discipline in package boundary design; larger clone size.

### ADR-002: tRPC for API Layer

**Decision:** Use tRPC 11 instead of REST or GraphQL.  
**Rationale:** End-to-end type safety with zero code generation; procedure inputs/outputs are validated with Zod; the browser and server share the same `AppRouter` type — no OpenAPI spec maintenance.  
**Trade-off:** Tightly couples web client to API; consuming from non-TypeScript clients requires manual effort.

### ADR-003: Session Tokens over JWT

**Decision:** Store session state server-side (PostgreSQL + Redis) rather than stateless JWTs.  
**Rationale:** Instant session revocation on logout/compromise; no clock-skew vulnerabilities; no risk of long-lived JWT tokens floating in the wild.  
**Trade-off:** Additional Redis/DB round-trips per request (mitigated by L1 + L2 caching).

### ADR-004: Drizzle ORM over Prisma

**Decision:** Use Drizzle ORM for database access.  
**Rationale:** Drizzle has near-zero overhead (queries compile to plain SQL at build time), no external Prisma engine binary, TypeScript-native schema definitions, and excellent PostgreSQL support.  
**Trade-off:** Slightly more verbose query builder vs. Prisma's intuitive API; relations must be manually expressed.

### ADR-005: RBAC Matrix as Shared Package

**Decision:** The RBAC permission matrix lives in `@nexusops/types`, shared between frontend and backend.  
**Rationale:** Ensures the UI never shows actions the API will reject, and the API never permits actions the UI wouldn't expose — the single matrix is the contract.  
**Trade-off:** Adding a new module requires updating the types package and rebuilding dependents.

### ADR-006: URL-Driven Tab Navigation

**Decision:** Pages with internal tab navigation use `?tab=<key>` query params (rather than local state) to control which tab is active.  
**Rationale:** Enables sidebar sub-items to link directly to specific tabs; browser back/forward navigation works correctly; deep-links are shareable.  
**Trade-off:** Slightly more complex page components; requires `useSearchParams` with `<Suspense>` wrapper.

### ADR-007: Multi-tenant by `orgId` Query Scoping

**Decision:** Tenant isolation is enforced at the application layer, not at the PostgreSQL row-level security layer.  
**Rationale:** Simpler to reason about, test, and evolve; Drizzle's type-safe `where` clauses make it easy to audit all queries. RLS would add complexity without significant additional security given the existing RBAC enforcement in `permissionProcedure`.  
**Trade-off:** A missing `where orgId = ?` in any new procedure is a tenant isolation bug — must be caught by code review and tests.

---

*End of Architecture Design Document*

*For questions about this document, contact the NexusOps platform team at Coheron.*
