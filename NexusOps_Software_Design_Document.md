# NexusOps — Software Design Document (SDD)

**Version:** 2.0  
**Date:** April 4, 2026  
**Status:** Active  
**Author:** Platform Engineering Team  

---

## Changelog

| Version | Date | Summary |
|---------|------|---------|
| **2.0** | 2026-04-04 | **Phase 3 module design.** Nested routers under `recruitment`, `secretarial`, `workforce` follow existing tRPC patterns (`protectedProcedure`, org-scoped `ctx.orgId`). **API–DB naming:** client field `chairpersonId` on board meeting create maps to Drizzle column `chairperson` (UUID FK). **Requisition workflow:** `publishImmediately` vs draft; status transitions enforced in router. **Applications:** duplicate candidate+job → tRPC `CONFLICT` code. **Hire path:** `filled` incremented with cap at `openings`. **Migration strategy:** ship SQL + shell wrapper for operators who cannot run `drizzle-kit` against prod; journal keeps lineage. |

| **1.9** | 2026-04-04 | **QA-driven design fixes documented.** Two raw-SQL template literal bugs patched: `walkup.analytics` and `dashboard.getTimeSeries` used `new Date()` directly inside Drizzle `sql` tagged templates — bypasses Drizzle's type serializer. Design rule added: **never pass a `Date` object into a raw `sql` template; always call `.toISOString()` and append `::timestamptz`**. Existing operators (`eq`, `gte`, `lte`, `and`) correctly serialize Date — only raw `sql` templates are affected. CSM module schema gap: `csm_cases` table created via DDL (no Drizzle schema file); pending `packages/db/src/schema/csm.ts`. Three schema-to-production reconciliations completed: assignment.ts, hr.ts payroll tables. |

| **1.8** | 2026-04-03 | **RBAC design finalized + DB performance hardening.** `surveys` added as explicit `Module` type in `packages/types/src/rbac-matrix.ts`; surveys router permission binding corrected from `analytics` → `surveys`; `hr_manager`, `itil`, `itil_admin`, `requester` roles updated with `surveys` permissions. Duplicate Drizzle operator export pattern removed from `packages/db/src/index.ts` — single authoritative source now `packages/db/src/schema/index.ts` (eliminates `Symbol(drizzle:Columns)` dual-module instantiation bug). `BCRYPT_CONCURRENCY` design note updated: raised to 32 in production; `LIBUV_THREADPOOL_SIZE` must match. |
| **1.7** | 2026-04-03 | **Frontend design patterns updated.** Prohibited patterns added: (1) IIFE-in-JSX `{(() => {...})()}` — rejected by SWC production compiler; extract to named variable before `return`. (2) Multi-root JSX in ternary branch or adjacent sibling without Fragment — must wrap with `<>...</>`. Security Config Compliance tab design: cross-module data read (GRC queries on a Security page) enabled via `trpc.grc.*` hooks with `enabled: can("grc", "read")` guard. Computed-before-return pattern: complex derived values (e.g. `selectedAudit`, leaderboard aggregation) computed as `const` outside JSX rather than inline IIFE. `reports` page Quality tab: SLA data rendered from `slaDashboard` query with priority name/color from joined data. |
| **1.6** | 2026-04-03 | **Frontend design complete**: all 50 pages wired — no dead button handlers remain. Same-origin proxy pattern (`/api/trpc/[...path]`) documented as standard for CSP/CORS elimination. Virtual Agent `BOT_FLOWS` no longer contains hardcoded ticket IDs — all fake IDs removed. `LEAVE_HISTORY`, `CSAT_RESULTS`, `PULSE_RESULTS`, `APPS_DEFAULT`, `CONTRACTS` fallbacks all replaced with `[]` / zero structs. RBAC context: `can()` must be called before early returns — Rules of Hooks compliance enforced across all 36 client components. Floating Virtual Agent FAB: `bottom-20 z-40` (prevents click interception). |
| 1.5 | 2026-04-02 | bcrypt semaphore design (counting semaphore + FIFO queue + fail-fast). Idempotency: Redis snapshot layer over DB unique index. Concurrency guard: `_inflight` flag pattern (prevents double-decrement). Error formatter: `traceId` in all envelopes. |
| 1.4 | 2026-03-27 | Observability components: logger, metrics, health evaluator, active monitor. Input sanitiser. |
| 1.3 | 2026-03-26 | Session management: `invalidateSessionCache` on logout + password change. Role assignment UI design. |
| 1.0–1.2 | 2026-03 | Initial SDD: App Router architecture, tRPC client/server design, Drizzle schema design, RBAC matrix, multi-tenancy. |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Monorepo & Package Design](#3-monorepo--package-design)
4. [Frontend Design](#4-frontend-design)
   - 4.1 Application Shell & Layout
   - 4.2 Routing & Page Structure
   - 4.3 Provider Hierarchy & Context Stack
   - 4.4 Authentication & Session State
   - 4.5 RBAC Context Design
   - 4.6 Sidebar Navigation Design
   - 4.7 tRPC Client Design
   - 4.8 Data Fetching & Caching Strategy
   - 4.9 UI Component Library
5. [Backend Design](#5-backend-design)
   - 5.1 API Server Architecture
   - 5.2 tRPC Initialisation & Context
   - 5.3 Middleware Stack
   - 5.4 Procedure Types & Access Levels
   - 5.5 Router Composition
   - 5.6 Error Handling Design
   - 5.7 Logging Design
6. [Authentication & Session Design](#6-authentication--session-design)
   - 6.1 Session Resolution Pipeline
   - 6.2 API Key Authentication
   - 6.3 Cache Hierarchy
7. [RBAC Design](#7-rbac-design)
   - 7.1 Role Hierarchy
   - 7.2 Permission Matrix
   - 7.3 Backend Enforcement
   - 7.4 Frontend Enforcement
8. [Data Layer Design](#8-data-layer-design)
   - 8.1 ORM & Client Design
   - 8.2 Schema Organisation
   - 8.3 Key Table Designs
   - 8.4 Migration Strategy
9. [Asynchronous Workflow Design](#9-asynchronous-workflow-design)
   - 9.1 BullMQ Queue Architecture
   - 9.2 Approval Workflow
   - 9.3 SLA Lifecycle Workflow
10. [Search Design](#10-search-design)
11. [Rate Limiting Design](#11-rate-limiting-design)
12. [Security Design](#12-security-design)
13. [Shared Package Design](#13-shared-package-design)
14. [Infrastructure & Deployment Design](#14-infrastructure--deployment-design)
15. [Design Patterns & Conventions](#15-design-patterns--conventions)
16. [Cross-Cutting Concerns](#16-cross-cutting-concerns)
17. [Revision History](#17-revision-history)

---

## 1. Introduction

### 1.1 Purpose

This Software Design Document (SDD) describes the detailed technical design of the NexusOps platform. It specifies the internal architecture, component structures, data flows, design patterns, and implementation conventions used across the system.

The SDD serves as a reference for engineers implementing new features or maintaining existing ones. It bridges the gap between the high-level architecture described in the Architecture Design Document (ADD) and the implementation specifics captured in the API Specification and Technical Requirements Document (TRD).

### 1.2 Scope

This document covers the design of all components within the NexusOps monorepo:

- The **Next.js 15 web application** (`apps/web`) — routing, layout, state management, and UI component design.
- The **Fastify 5 + tRPC 11 API** (`apps/api`) — middleware, request lifecycle, router composition, and error handling.
- The **shared packages** (`packages/`) — types, UI components, database client, and configuration.
- The **backing services** — PostgreSQL, Redis, Meilisearch, MinIO — and how the application interacts with them.
- The **asynchronous workflows** — BullMQ queues for approvals and SLA lifecycle management.

### 1.3 Design Principles

| Principle | Application |
|-----------|------------|
| **Type Safety End-to-End** | tRPC + Zod ensures the same TypeScript types describe API input, API output, and frontend usage with no manual serialisation |
| **Defence in Depth** | RBAC is enforced independently on both the frontend (UI gating) and backend (tRPC middleware) |
| **Rules of Hooks Compliance** | All React hooks are called unconditionally at component top-level; RBAC early-returns never precede hook calls |
| **Fail-Safe Defaults** | RBAC defaults to deny-all during loading; search degrades gracefully when Meilisearch is unavailable |
| **Organisation Isolation** | Every query at the ORM level is scoped by `org_id`; this is non-optional and not gated by role |
| **Minimal Client State** | No global state manager (Zustand, Redux) is used; all server-derived state is managed by React Query via tRPC |

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Next.js 15 App Router (SSR + Client Components)                 │  │
│  │                                                                  │  │
│  │  ThemeProvider → TRPCProvider (QueryClient) → RBACProvider       │  │
│  │                        │                                         │  │
│  │   AppShell ─── AppSidebar ──── Page Components                   │  │
│  │                        │                                         │  │
│  │           tRPC React hooks (httpBatchLink, 12s timeout)          │  │
│  └─────────────────────────────┬────────────────────────────────────┘  │
└────────────────────────────────│────────────────────────────────────────┘
                                 │ HTTPS / tRPC POST /trpc
                                 │ Authorization: Bearer <token>
                    ┌────────────▼─────────────────────┐
                    │  Traefik v3  (TLS termination)    │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────▼─────────────────────┐
                    │  Fastify 5 API                    │
                    │  ┌───────────────────────────┐   │
                    │  │  tRPC Adapter              │   │
                    │  │  ┌─────────────────────┐  │   │
                    │  │  │  loggingMiddleware   │  │   │
                    │  │  │  enforceAuth         │  │   │
                    │  │  │  auditMutation       │  │   │
                    │  │  │  retryMutation       │  │   │
                    │  │  │  permissionProcedure │  │   │
                    │  │  └──────────┬──────────┘  │   │
                    │  │  33 Domain Routers         │   │
                    │  └──────────┬────────────────┘   │
                    │             │                     │
                    │   ┌─────────┼──────────┐         │
                    │   ▼         ▼          ▼         │
                    │  Drizzle  ioredis  Meilisearch   │
                    │  ORM      Client    SDK           │
                    └───┬─────────┬──────────┬─────────┘
                        │         │          │
                   ┌────▼──┐  ┌───▼───┐  ┌──▼──────────┐
                   │  PG16 │  │ Redis │  │ Meilisearch  │
                   └───────┘  └───┬───┘  └─────────────┘
                                  │
                             ┌────▼────┐
                             │ BullMQ  │
                             │ Workers │
                             └─────────┘
```

### 2.1 Data Flow Summary

1. The **browser** renders the Next.js app; client components attach the session Bearer token from `localStorage` to every tRPC request header.
2. **Traefik** terminates TLS and routes requests to the appropriate upstream service.
3. The **Fastify API** receives requests at `/trpc`; the tRPC adapter parses the batch, resolves context (session, user, org), and dispatches to the relevant procedure through the middleware stack.
4. Procedures read/write via **Drizzle ORM** to **PostgreSQL**; session lookups go through the Redis cache first.
5. **BullMQ workers** process background jobs (approval decisions, SLA breach detection) from Redis-backed queues, independent of the HTTP request lifecycle.
6. **Meilisearch** is populated by write procedures and queried by the global search router.

---

## 3. Monorepo & Package Design

### 3.1 Workspace Structure

```
NexusOps/                         # pnpm workspace root
├── apps/
│   ├── api/                      # @nexusops/api — Fastify backend
│   └── web/                      # @nexusops/web — Next.js frontend
├── packages/
│   ├── db/                       # @nexusops/db — Drizzle ORM + schema
│   ├── types/                    # @nexusops/types — shared TypeScript types
│   ├── ui/                       # @nexusops/ui — Radix/Tailwind component library
│   └── config/                   # @nexusops/config — shared toolchain config
├── e2e/                          # Playwright tests
├── scripts/                      # CI and utility scripts
├── turbo.json                    # Turborepo pipeline
└── package.json                  # Root workspace (pnpm)
```

### 3.2 Build Dependency Graph

```
@nexusops/config
       │
       ├──► @nexusops/types ──────────────► @nexusops/api
       │                                           ▲
       └──► @nexusops/db ─────────────────────────┤
                                                   │
       @nexusops/ui ──────────────────► @nexusops/web
                                                   ▲
       @nexusops/types ──────────────────────────┘
```

Turborepo enforces this via `dependsOn: ["^build"]` in `turbo.json`, preventing any app from building before its package dependencies.

### 3.3 Package Responsibilities

| Package | Responsibility | Consumers |
|---------|---------------|----------|
| `@nexusops/types` | SystemRole, Module enums, RBAC matrix, shared domain types | `api`, `web`, `db` |
| `@nexusops/db` | Drizzle client, schema definitions, migration config | `api` |
| `@nexusops/ui` | Tailwind-styled Radix primitives: Button, Badge, Card, Dialog, Input, Select, Tabs, Tooltip, Skeleton, Spinner, Separator | `web` |
| `@nexusops/config` | ESLint config, Prettier config, TSConfig presets | All packages and apps |

---

## 4. Frontend Design

### 4.1 Application Shell & Layout

The Next.js App Router uses nested layouts. The layout tree is:

```
apps/web/src/app/
├── layout.tsx              ← Root layout: ThemeProvider → TRPCProvider → children + Toaster
└── app/
    └── layout.tsx          ← App shell: RBACProvider → flex shell
                              ├── <div> AppHeader
                              ├── <div> Suspense → AppSidebar
                              └── <main> {children}
                                  VirtualAgentWidget
```

**Root Layout** (`app/layout.tsx`) establishes:
- `ThemeProvider` — CSS variable-based theming (light/dark)
- `TRPCProvider` — React Query `QueryClient` + tRPC client instance
- `Toaster` (Sonner) — global toast notifications

**App Shell** (`app/app/layout.tsx`) establishes:
- `RBACProvider` — authenticated user identity and permission helpers
- `<Suspense fallback={null}>` wrapping `AppSidebar` — required because `AppSidebar` calls `useSearchParams()`, which must be inside a Suspense boundary in the Next.js App Router to avoid static rendering bailout

### 4.2 Routing & Page Structure

The application uses the Next.js **App Router** with file-system-based routing. All authenticated pages live under the `/app/` path prefix.

**Public routes:**

| Route | Purpose |
|-------|---------|
| `/` | Landing / marketing page |
| `/login` | Login form |
| `/signup` | Registration form |
| `/forgot-password` | Password reset request |
| `/reset-password/[token]` | Password reset with token |
| `/invite/[token]` | Invite acceptance |

**Authenticated routes (under `/app/`):**

| Category | Routes |
|----------|--------|
| Core | `dashboard`, `profile`, `notifications`, `admin` |
| ITSM | `tickets`, `tickets/new`, `tickets/[id]`, `changes`, `changes/[id]`, `problems`, `problems/[id]`, `releases`, `work-orders`, `work-orders/[id]`, `escalations`, `on-call` |
| Assets | `cmdb`, `ham`, `sam`, `apm` |
| HR & People | `hr`, `hr/[id]`, `employee-portal`, `employee-center`, `people-workplace` |
| Finance & Legal | `financial`, `finance-procurement`, `procurement`, `contracts`, `legal`, `secretarial`, `legal-governance` |
| GRC | `grc`, `grc/[id]`, `compliance`, `security`, `security/[id]`, `security-compliance` |
| CRM & CSM | `crm`, `csm`, `customer-sales` |
| Projects | `projects`, `projects/[id]`, `strategy-projects` |
| Operations | `vendors`, `facilities`, `devops`, `developer-ops` |
| Service | `catalog`, `walk-up`, `flows`, `workflows`, `workflows/[id]/edit` |
| Intelligence | `reports`, `virtual-agent`, `surveys`, `knowledge`, `approvals`, `events` |

**Dynamic segments** use `[id]` or `[token]` conventions. Nested routes inherit parent layouts.

### 4.3 Provider Hierarchy & Context Stack

```
<ThemeProvider>                    ← Dark/light mode CSS vars
  <TRPCProvider>                   ← QueryClient + trpc.Provider
    {children}                     ← Page tree
    <Toaster />                    ← Sonner toast stack
  </TRPCProvider>
</ThemeProvider>
```

Inside `/app/` routes:

```
<RBACProvider>                     ← Identity, permissions, org context
  <AppHeader />
  <Suspense fallback={null}>
    <AppSidebar />                 ← Navigation (uses useSearchParams)
  </Suspense>
  <main>{children}</main>
  <VirtualAgentWidget />
</RBACProvider>
```

### 4.4 Authentication & Session State

Session management is deliberately minimal — there is no dedicated session provider or Zustand store. The design is:

1. On login, the API returns a Bearer token which the client writes to `localStorage` key `nexusops_session`.
2. `getTRPCClient()` reads this token in the `headers()` callback of `httpBatchLink` on every request, attaching `Authorization: Bearer <token>`.
3. `RBACProvider` calls `trpc.auth.me.useQuery()` to fetch the current user from the API using that token. The `me` query is the source of truth for "is the user authenticated?"
4. On logout, the token is removed from `localStorage`; subsequent requests become unauthenticated.

This design means there is **no client-side session cache** — the token's validity is always verified server-side on each request through the session resolution pipeline.

### 4.5 RBAC Context Design

`RBACProvider` (`apps/web/src/lib/rbac-context.tsx`) implements the following state machine:

```
┌──────────────┐    me query fires    ┌──────────────────┐
│ LOADING_USER │ ─────────────────►  │ realUser mapped   │
│ (deny-all)   │                      │ from meData       │
└──────────────┘                      └────────┬─────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                         realUser set    realUser null    isLoadingAuth
                         → authenticated  + not loading   still true
                                          = isDemoMode     → LOADING_USER
```

**Key design decisions:**

- **Deny-all during loading:** `LOADING_USER` is used as the effective user while `trpc.auth.me` is in-flight. All `can()` calls return `false`. This prevents premature content rendering.
- **No mock fallback for real sessions:** If a real session exists (`realUser !== null`), the demo mode mock users are never activated. The `isDemoMode` flag is only true when there is no real user AND loading is complete.
- **`overrideUser` for demo:** A demo user override (`setOverrideUser`) allows testing different role views without impersonation, but only in demo mode.
- **`staleTime: 5 * 60 * 1000`:** The `me` query is cached for 5 minutes, reducing auth overhead on navigation.

**Provided helpers:**

| Helper | Signature | Purpose |
|--------|-----------|---------|
| `can(module, action)` | `(Module, Action) → boolean` | Check if current user has permission |
| `hasRole(role)` | `(SystemRole) → boolean` | Check if current user has a specific role |
| `canAccess(module)` | `(Module) → boolean` | Check if user has any access to a module |
| `currentUser` | `SystemUser` | The effective user (real or override) |
| `isAuthenticated` | `boolean` | True if a real session is established |
| `<PermissionGate>` | Component | Renders children only if `can()` passes |
| `<AccessDenied>` | Component | Rendered when a module is inaccessible |

### 4.6 Sidebar Navigation Design

`AppSidebar` (`apps/web/src/components/layout/app-sidebar.tsx`) uses a **data-driven, role-filtered** design:

**Data model** (`sidebar-config.ts`):

```typescript
type SidebarItem = {
  label: string;
  href: string;
  icon?: string;          // Lucide icon name as string key
  module?: Module;        // RBAC module guard
  requiresRole?: SystemRole;
  badge?: string;         // Maps to dynamic badge count
  children?: SidebarItem[];
};

type SidebarGroup = {
  label: string;
  modules?: Module[];     // If none of these are accessible, hide group
  items: SidebarItem[];
};
```

**Rendering pipeline:**

```
SIDEBAR_GROUPS (static config)
        │
        ▼
filterItemsByRole(groups, hasRole, canAccess)
        │  Removes groups/items the user cannot access
        ▼
useSidebarBadges()
        │  Fetches live counts from trpc.dashboard and trpc.security
        ▼
SidebarNavContent (renders with expand/collapse UX)
        │
        ├── Active path detection via usePathname() + currentSearch
        └── Persists expanded groups to localStorage["nexusops_sidebar_state"]
```

**Active link detection** uses two helpers:

```typescript
// For top-level items (pathname only)
function pathActive(pathname: string, href: string): boolean;

// For child items with query params (?tab=overview)
function childHrefActive(pathname: string, searchString: string, href: string): boolean {
  const q = href.indexOf("?");
  if (q < 0) return pathActive(pathname, href);
  const base = href.slice(0, q);
  const childSearch = href.slice(q);
  return pathname === base && searchString === childSearch;
}
```

`currentSearch` is computed in `AppSidebar` (the parent) from `useSearchParams()` and passed down as a prop to `SidebarNavContent`. This design keeps the `useSearchParams` call in one place and avoids violating the Suspense boundary requirement for child components.

**Mobile:** On smaller viewports, the sidebar uses a Radix `Dialog` overlay rather than a persistent drawer, enabling full-screen content area on mobile.

### 4.7 tRPC Client Design

The tRPC client is configured in `apps/web/src/lib/trpc.ts`:

```typescript
export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === "development" ||
          (opts.direction === "down" && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: `${apiBase}/trpc`,
        fetch: fetchWithTimeout,     // AbortController, 12s timeout
        headers() {
          // Attach Bearer token from localStorage on every request
          const session = localStorage.getItem("nexusops_session");
          return session ? { authorization: `Bearer ${session}` } : {};
        },
      }),
    ],
  });
}
```

**Key design decisions:**

- **`httpBatchLink`**: Multiple tRPC calls triggered during a single React render cycle are automatically batched into one HTTP `POST`, reducing round trips.
- **`loggerLink`**: Only active in development or when a downstream error occurs, avoiding console noise in production.
- **`fetchWithTimeout`**: Wraps `fetch` with an `AbortController` that cancels after 12,000 ms, protecting against hanging requests from the browser's perspective.
- **`getTRPCClient()`** is called inside `TRPCProvider` and memoised with `useState(() => getTRPCClient())` so a stable instance is used for the component lifetime.

### 4.8 Data Fetching & Caching Strategy

All server-derived state is managed by **TanStack React Query v5** via tRPC hooks. There is no separate global state manager.

**Default Query Client config** (`trpc-provider.tsx`):

| Setting | Value | Rationale |
|---------|-------|-----------|
| `staleTime` | 30,000 ms | Data is fresh for 30 s; no background refetch on mount if fresh |
| `refetchOnMount` | `"stale"` | Refetch only if data is stale (not on every mount) |
| `refetchOnWindowFocus` | `false` | Prevents unexpected refetches on tab switch |
| `retry` | Custom (max 1, skip auth errors) | Prevents retrying unauthorised/forbidden/not-found responses |

**Per-route overrides:**

| Use Case | `staleTime` | Rationale |
|----------|------------|-----------|
| Reports page queries | 300,000 ms (5 min) | Aggregate data changes slowly |
| RBAC `me` query | 300,000 ms (5 min) | Identity rarely changes within a session |
| Ticket detail queries | 300,000 ms (5 min) | Individual ticket data is not real-time |
| Ticket detail (some) | `retry: false` | Ticket not found should not be retried |

**Retry logic:**

```typescript
retry: (failureCount, error) => {
  const code = (error as TRPCClientError<AppRouter>)?.data?.code;
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "NOT_FOUND") {
    return false;
  }
  return failureCount < 1;  // Max 1 retry for other errors
}
```

### 4.9 UI Component Library

The `@nexusops/ui` package exports the following primitive components, each built on Radix UI primitives with Tailwind CSS styling:

| Component | Radix Primitive | Usage |
|-----------|----------------|-------|
| `Button` | — (custom) | Primary action element |
| `Badge` | — (custom) | Status labels, notification counts |
| `Input` | — (custom) | Form text inputs |
| `Card` | — (custom) | Content containers |
| `Dialog` | `@radix-ui/dialog` | Modal overlays |
| `Label` | `@radix-ui/label` | Form field labels |
| `Select` | `@radix-ui/select` | Dropdown selectors |
| `Separator` | `@radix-ui/separator` | Visual dividers |
| `Skeleton` | — (custom) | Loading placeholder |
| `Spinner` | — (custom) | Indeterminate loading indicator |
| `Tabs` | `@radix-ui/tabs` | Tab panel container |
| `Tooltip` | `@radix-ui/tooltip` | Hover hints |
| `utils` | — | `cn()` Tailwind class merger |

App-specific complex components (forms, data tables, page shells) live in `apps/web/src/components/` and are not part of the shared library.

---

## 5. Backend Design

### 5.1 API Server Architecture

The backend is a **Fastify 5** HTTP server hosting the tRPC adapter as a plugin.

```
Fastify instance
│
├── @fastify/helmet          ← Security headers (CSP disabled; handled by web)
├── @fastify/cors            ← CORS with credentials
├── @fastify/rate-limit      ← Global rate limiting via Redis
├── tRPC Fastify Plugin      ← Mounts at /trpc
│   └── appRouter            ← All 33 domain routers
└── GET /health              ← Health check endpoint (postgres, redis, meilisearch)
```

**Startup sequence:**

1. Load environment variables and validate required keys.
2. Initialise database pool (with banner logging of pool settings).
3. Run idle-in-transaction cleanup on existing PostgreSQL connections.
4. Flush Redis session cache if `FLUSH_REDIS_SESSION_ON_START=true`.
5. Bootstrap BullMQ queues and workers (approvals, SLA).
6. Register Fastify plugins (helmet, CORS, rate-limit).
7. Mount tRPC adapter with `createContext` factory.
8. Register health check route.
9. Start listening on `HOST:PORT`.

**Shutdown sequence** (SIGTERM / SIGINT):

1. Stop accepting new connections.
2. Drain in-flight requests.
3. Close BullMQ workers and queues.
4. Close Redis connection.
5. Close database pool.

### 5.2 tRPC Initialisation & Context

tRPC is initialised with a typed `Context` and a custom `errorFormatter`:

```typescript
export type Context = {
  db: DrizzleDB;
  user: DbUser | null;
  org: DbOrg | null;
  orgId: string | null;
  requestId: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Attach flattened Zod errors for client-side form field mapping
        zodError: error.cause instanceof ZodError
          ? error.cause.flatten()
          : null,
      },
    };
  },
});
```

The `Context` is populated by `createContext(req)` in `middleware/auth.ts` for every request. It provides:
- `db` — a Drizzle ORM database instance
- `user` / `org` — resolved from the Bearer token or API key
- `requestId` — from `req.id` (Fastify assigns a unique ID per request)
- `sessionId`, `ipAddress`, `userAgent` — for audit logging

### 5.3 Middleware Stack

The middleware stack is layered; each higher-level procedure re-uses lower-level middleware through composition:

```
publicProcedure
└── loggingMiddleware
    ├── Records start time, requestId, procedure path
    ├── Enforces 8s hard timeout for queries (Promise.race)
    ├── Logs [SLOW REQUEST] if duration > 500ms
    ├── Samples latency for p50/p95/p99 tracking
    └── On error: classifies DB vs server error, calls logDbError / logServerError

protectedProcedure
└── publicProcedure (loggingMiddleware)
    └── enforceAuth
        ├── Throws UNAUTHORIZED if ctx.user or ctx.org is null
        └── auditMutation
            ├── For mutations: writes to audit_logs on success
            │   Sanitizes keys: password, token, secret, key, hash, salt
            └── retryMutation
                ├── Wraps mutation execution
                └── Retries up to 3× for PG codes 23505, 40001, 40P01

permissionProcedure(module, action)
└── protectedProcedure
    └── permissionCheck
        ├── Calls checkDbUserPermission(user.role, module, action)
        └── Throws FORBIDDEN + logRbacDenied if denied

adminProcedure
└── protectedProcedure
    └── adminCheck
        └── Throws FORBIDDEN if user.role is not 'owner' or 'admin'
```

**Audit mutation design:**

All successful mutations on `protectedProcedure` are automatically audit-logged. The audit middleware:
1. Intercepts the `next()` call.
2. On success, writes `{ userId, orgId, action: procedure.path, input (sanitized) }` to the `audit_logs` table.
3. Sensitive input keys (`password`, `token`, `secret`, `key`, `hash`, `salt`) are redacted before storage.
4. Failures do not produce audit entries.

### 5.4 Procedure Types & Access Levels

| Procedure | Authentication | RBAC Check | Use Cases |
|-----------|---------------|-----------|----------|
| `publicProcedure` | None | None | Login, signup, password reset |
| `protectedProcedure` | Required | None (any authenticated user) | Dashboard, notifications, profile |
| `permissionProcedure(m, a)` | Required | Module + action check | All domain CRUD operations |
| `adminProcedure` | Required | `owner` or `admin` role | Platform admin, org management |

### 5.5 Router Composition

All domain routers are merged into a single `appRouter` in `apps/api/src/routers/index.ts`. The router is exported as both the runtime router and the `AppRouter` TypeScript type (used by the frontend for end-to-end type safety).

**Router organisation by release phase:**

| Phase | Routers |
|-------|---------|
| Phase 1 (Core) | `auth`, `admin`, `tickets`, `assets`, `workflows`, `hr`, `procurement`, `dashboard`, `workOrders` |
| Phase 2 (Enterprise) | `changes`, `security`, `grc`, `financial`, `contracts`, `projects`, `crm`, `legal`, `devops`, `surveys`, `knowledge`, `notifications`, `catalog` |
| Phase 3 (Extended) | `csm`, `apm`, `oncall`, `events`, `facilities`, `walkup`, `vendors`, `approvals`, `reports`, `search`, `ai` |

The frontend tRPC client imports `AppRouter` from `@nexusops/api` to infer all available procedures and their types at compile time.

### 5.6 Error Handling Design

**Error classification:**

```
tRPC procedure throws
        │
        ▼
Is it a TRPCError?
├── Yes → Return as-is (code, message, zodError if applicable)
└── No  → Is it a PG error (has .code property)?
           ├── Yes → logDbError(pgCode, path, requestId) → INTERNAL_SERVER_ERROR
           └── No  → logServerError(err, path, requestId) → INTERNAL_SERVER_ERROR
```

**Zod validation errors** are automatically caught by the tRPC input parser before middleware runs. The `errorFormatter` attaches `data.zodError` (flattened field errors) so the frontend can map server-side validation failures to form field errors.

**Error code discipline:** The following error codes are in active use across the API:

| Code | HTTP | When to use |
|------|------|-------------|
| `BAD_REQUEST` | 400 | Zod validation failure, or malformed request structure |
| `UNAUTHORIZED` | 401 | No or invalid session token |
| `FORBIDDEN` | 403 | Authenticated but lacks RBAC permission |
| `NOT_FOUND` | 404 | Resource does not exist in this org |
| `CONFLICT` | 409 | Optimistic concurrency version mismatch |
| `PRECONDITION_FAILED` | 412 | Required server-side configuration is absent (e.g. no open ticket status for org) |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `TIMEOUT` | 408 | Query exceeded 8s hard timeout |
| `INTERNAL_SERVER_ERROR` | 500 | Truly unhandled fault — should never reach production |

> **Design rule:** Never throw `INTERNAL_SERVER_ERROR` for a known application condition. If the handler can describe *why* it failed, use the appropriate code. As of v1.3, `tickets.create` was corrected to use `PRECONDITION_FAILED` instead of `INTERNAL_SERVER_ERROR` for the "no open status configured" case.

**Frontend error consumption:**

```typescript
// Accessing Zod field errors from a tRPC mutation error
const zodErrors = error?.data?.zodError?.fieldErrors;
if (zodErrors?.email) {
  setError("email", { message: zodErrors.email[0] });
}
```

### 5.7 Logging Design

The API uses **pino** for structured JSON logging, accessed through the Fastify server's built-in logger instance.

**Initialisation:** `initLogger(fastify.log)` is called once immediately after Fastify is created, storing the pino instance in a module-level variable inside `logger.ts`.  This avoids importing `pino` directly (which would require it as an explicit dependency) while preserving full access to Fastify's configured pino instance (including `pino-pretty` in development).

**Canonical emit functions (all code must use these — never `console.*` or direct `fastify.log`):**

| Function | Level | When to use |
|---|---|---|
| `logInfo(event, data)` | `info` | Normal operational events |
| `logWarn(event, data)` | `warn` | Recoverable anomalies (auth failures, slow requests, RBAC denials) |
| `logError(event, err, data)` | `error` | Unrecoverable errors; `err` provides stack trace in non-production |

**Request log fields (emitted via `onResponse` hook):**

| Field | Source |
|---|---|
| `event` | `"REQUEST"` |
| `request_id` | Fastify request ID (from `x-request-id` header or `randomUUID()`) |
| `method` | HTTP method |
| `url` | Request URL |
| `status` | HTTP status code |
| `duration_ms` | `Math.round(reply.elapsedTime)` |

**Specialised log functions (domain-specific wrappers around `emit()`):**

| Function | Trigger | Level |
|---|---|---|
| `logAuthFail` | Missing/invalid session token | `warn` |
| `logRbacDenied` | Permission check failure | `warn` |
| `logDbError` | PostgreSQL error in procedure | `error` |
| `logServerError` | Unhandled error in procedure | `error` |
| `logRateLimit` | Request rejected by rate limiter | `warn` |
| `[SLOW REQUEST]` | Duration > 500ms | `warn` |
| Latency report | Every 200 requests | `info` |

**Correlation ID:** Fastify's `genReqId` is overridden to use the incoming `x-request-id` header value if present, otherwise generate a `randomUUID()`.  The same ID appears in every log line for that request.

**Stack traces:** Included in error log entries only when `NODE_ENV !== "production"`.

### 5.8 In-Memory Metrics Design

`apps/api/src/lib/metrics.ts` maintains a single plain JS object (`state`) holding all counters.  There is no `Map`, no class, no async I/O.

**State shape:**

```typescript
interface MetricsState {
  since:          string;   // ISO timestamp of last reset
  total_requests: number;
  total_errors:   number;   // 5xx responses only
  rate_limited:   number;   // 429 responses
  endpoints:      Record<string, EndpointStats>;
}
```

**Per-endpoint stats (bounded by URL normalisation):**

```typescript
interface EndpointStats {
  count:          number;
  errors:         number;
  avg_latency_ms: number;   // Welford-style incremental mean
  min_latency_ms: number;
  max_latency_ms: number;
  last_seen:      string;
}
```

**URL normalisation:** Query strings are stripped (`/trpc/tickets.list?input=...` → `/trpc/tickets.list`).  This keeps the endpoint map bounded even under arbitrary query parameters.

**Incremental mean algorithm:** `new_avg = old_avg + (new_value − old_avg) / new_count`.  Exact, O(1) state, no floating-point drift.

**Public API:**

| Function | Called from | Effect |
|---|---|---|
| `recordRequest(url, duration, status)` | `onResponse` hook | Updates global + per-endpoint counters; increments `total_errors` when `status >= 500` |
| `recordError(url)` | tRPC `onError` (for pre-context errors) | Increments error counter without a latency sample |
| `recordRateLimit()` | `@fastify/rate-limit` `errorResponseBuilder` | Increments `rate_limited` |
| `getMetricsSnapshot()` | `/internal/metrics` route + health evaluator | Returns shallow copy with rounded averages |
| `resetMetrics()` | `POST /internal/metrics/reset` | Zeroes all counters; updates `since` |

### 5.9 Health Signal Design

Two components implement health signaling:

**`apps/api/src/lib/health.ts` — Pure evaluator:**

Takes a `MetricsSnapshot` and applies a fixed rule set.  No side effects, no async, no state.  Rules are applied in ascending severity order; the worst-seen status wins.

| Rule | Metric | DEGRADED threshold | UNHEALTHY threshold |
|---|---|---|---|
| Error rate | `error_rate` | > 1 % | > 5 % |
| Endpoint latency | any `avg_latency_ms` | > 1 000 ms | > 2 000 ms |
| Rate-limit pressure | `rate_limited` | > 100 | — |

Minimum traffic floor: error-rate rules not evaluated until `total_requests ≥ 20`.

Returns `HealthResult { status, reasons[], summary }`.

**`apps/api/src/lib/healthMonitor.ts` — Active emitter:**

Wraps the evaluator with state-change detection and log dispatch.  Module-level state:

```typescript
let lastStatus:    HealthStatus = "HEALTHY";
let lastChangedAt: string       = new Date().toISOString();
let callCount:     number       = 0;
```

`checkHealth()` is called from the `onResponse` hook after every request.

- **Non-evaluation tick** (the common path): `callCount++` + `callCount % EVAL_EVERY !== 0` → return immediately.  Two operations; no allocations.
- **Evaluation tick** (every `EVAL_EVERY` calls): `getMetricsSnapshot()` → `evaluateHealth()` → compare with `lastStatus` → if unchanged, return; if changed, call `emitTransition()`.

`emitTransition()` log routing:

| Target status | Log function | `event` value |
|---|---|---|
| `DEGRADED` | `logWarn` | `SYSTEM_DEGRADED` |
| `UNHEALTHY` | `logError` | `SYSTEM_UNHEALTHY` |
| `HEALTHY` | `logInfo` | `SYSTEM_RECOVERED` |

**Design invariant:** `emitTransition()` is only reached when `newStatus !== lastStatus`, guaranteeing exactly one log line per transition regardless of traffic volume.

`getMonitorState()` returns `{ status, since, eval_every }` for surfacing in `/internal/health`.

---

## 6. Authentication & Session Design

### 6.1 Session Resolution Pipeline

Every request goes through `createContext(req)` in `middleware/auth.ts`. The pipeline:

```
HTTP Request
    │
    ├─ Extract token from Authorization header ("Bearer <token>")
    │  OR from cookie "nexusops_session"
    │
    ├─ Token has "nxo_" prefix?
    │   ├── YES → API Key path (see §6.2)
    │   └── NO  → Session token path (continue below)
    │
    ├─ SHA-256 hash the token
    │
    ├─ L1 Cache lookup (in-process Map)
    │   ├── HIT (not expired) → return cached user/org
    │   └── MISS → continue
    │
    ├─ Inflight deduplication (coalescing)
    │   ├── Already resolving this hash? → await existing promise
    │   └── New resolution → register in inflight Map, continue
    │
    ├─ L2 Redis lookup ("session:{hash}")
    │   ├── HIT → parse JSON, backfill L1, return user/org
    │   └── MISS → continue
    │
    ├─ L3 PostgreSQL query
    │   JOIN sessions + users + organizations
    │   WHERE sessions.token_hash = $hash AND expires_at > NOW()
    │   ├── HIT → strip password hash, backfill Redis (TTL 300s), backfill L1
    │   └── MISS → cache null in L1 (TTL 30s), return null
    │
    └─ Populate ctx.user, ctx.org, ctx.orgId, ctx.sessionId
```

**Cache TTLs:**

| Cache Level | Valid session TTL | Invalid/null TTL |
|-------------|------------------|-----------------|
| L1 (in-process Map) | 300,000 ms (5 min) | 30,000 ms (30 s) |
| L2 (Redis) | 300 s (5 min) | Not stored |
| L1 sweep interval | Every 60 s | — |

**Cache invalidation:**

- `invalidateSessionCache(tokenHash)` — removes a specific entry from L1 and Redis (used on logout).
- `clearSessionCache()` — removes all L1 entries (used in tests).

### 6.2 API Key Authentication

Tokens prefixed with `nxo_` bypass the session pipeline:

```
"nxo_" prefix detected
    │
    ├─ SHA-256 hash the key
    ├─ Query api_keys table WHERE hash = $hash AND active = true
    ├─ Load associated user + organisation
    └─ Populate context (no sessionId)
```

API keys have no L1/L2 cache; each request hits the database. This is acceptable since API keys are expected to be used for server-to-server integrations with lower frequency than user sessions.

### 6.3 Cache Hierarchy Summary

```
Request
  │
  ▼
L1: Map<tokenHash, { user, org, expiresAt }>   ← In-process, sub-millisecond
  │ MISS
  ▼
L2: Redis GETEX "session:{hash}"               ← ~1ms, cross-process
  │ MISS
  ▼
L3: PostgreSQL SELECT + JOIN                   ← ~5-20ms, authoritative
```

This three-tier design allows horizontal scaling: multiple API instances share L2 (Redis) as a common cache, meaning a session validated by one instance is immediately available to others without re-querying PostgreSQL.

---

## 7. RBAC Design

### 7.1 Role Hierarchy

```
super_admin
    │  (platform-wide, all organisations)
    ▼
org_admin
    │  (all modules within org)
    ▼
manager
    │  (elevated access, cross-module within org)
    ▼
employee
    │  (standard module access)
    ▼
viewer
    │  (read-only)
    ▼
client
       (restricted external access)
```

### 7.2 Permission Matrix

Permissions are defined as `(Module, Action)` tuples in `packages/types/src/rbac-matrix.ts`. The matrix defines which roles have which actions on each module. A condensed view:

| Module | viewer | employee | manager | org_admin | super_admin |
|--------|--------|---------|---------|-----------|-------------|
| `tickets` | read | read, create | read, create, update, delete | all | all |
| `hr` | — | read (own) | read, update | all | all |
| `payroll` | — | read (own) | read | read, create | all |
| `grc` | read | read | read, create, update | all | all |
| `admin` | — | — | — | org scope | all |

The full matrix is the canonical reference; the above is illustrative.

### 7.3 Backend Enforcement

**`checkDbUserPermission(role, module, action)`** is called inside `permissionProcedure`:

1. Looks up the role's allowed `(module, action)` pairs in the RBAC matrix.
2. Returns `true` if the pair is permitted, `false` otherwise.
3. `super_admin` receives a wildcard match bypassing the matrix lookup.

Organisation scoping is NOT part of the RBAC check — it is enforced separately at the ORM query level (`WHERE org_id = ctx.orgId`).

**Protection levels by procedure:**

```typescript
// Any authenticated user can read their own profile
const meQuery = protectedProcedure.query(...)

// Only users with hr.read permission can list employees
const listEmployees = permissionProcedure("hr", "read").query(...)

// Only org_admin or super_admin can delete an organisation
const deleteOrg = adminProcedure.mutation(...)
```

### 7.4 Frontend Enforcement

The frontend uses `useRBAC()` in two ways:

**1. Conditional rendering with `PermissionGate`:**

```tsx
<PermissionGate module="hr" action="create">
  <Button>Add Employee</Button>
</PermissionGate>
```

**2. Imperative `can()` check with early return:**

```tsx
function SecretarialContent() {
  const { can } = useRBAC();

  // ALL hooks called unconditionally FIRST (Rules of Hooks)
  const { data: audits } = trpc.grc.listAudits.useQuery();
  const searchParams = useSearchParams();
  const router = useRouter();

  // RBAC early return AFTER all hooks
  if (!can("grc", "read")) return <AccessDenied module="Secretarial" />;

  // Render module content
}
```

**Sidebar filtering** uses `filterItemsByRole` which calls `canAccess(module)` on each sidebar item, hiding entire groups and items the user cannot access before any render occurs.

---

## 8. Data Layer Design

### 8.1 ORM & Client Design

The database client is a singleton in `packages/db/src/client.ts`:

```typescript
// Single instance per process
let _db: DrizzleDB | null = null;

export function getDb(): DrizzleDB {
  if (!_db) {
    const pool = new Pool({ connectionString: DATABASE_URL, ...poolConfig });
    _db = drizzle(pool, { schema, logger: isDev ? new DrizzleLogger() : false });
    monitorPoolPressure(pool);
  }
  return _db;
}
```

**Pool monitoring** — `monitorPoolPressure(pool)`:

```
Every query completion:
  if (pool.totalCount / DB_POOL_MAX >= 0.85)
    AND (now - lastWarnTime > 5000ms):
      log.warn("[DB POOL PRESSURE] ...")
      update lastWarnTime
```

### 8.2 Schema Organisation

The Drizzle schema is split across 29 domain files in `packages/db/src/schema/`:

```
packages/db/src/schema/
├── index.ts           ← Barrel re-export of all schemas + Drizzle helpers
├── auth.ts            ← organizations, users, sessions, api_keys, audit_logs
├── tickets.ts         ← tickets, ticket_comments, ticket_watchers, sla_policies
├── assets.ts          ← assets, ci_items, asset_assignments
├── workflows.ts       ← workflow_definitions, workflow_runs
├── hr.ts              ← employees, leave_requests, onboarding_tasks
├── procurement.ts     ← purchase_orders, expenses, budgets
├── changes.ts         ← change_requests, change_approvals
├── security.ts        ← incidents, vulnerabilities
├── grc.ts             ← compliance_items, audits, risk_register
├── financial.ts       ← invoices, payments, journal_entries
├── contracts.ts       ← contracts, contract_parties
├── projects.ts        ← projects, milestones, project_tasks
├── crm.ts             ← crm_accounts, crm_deals, crm_contacts
├── knowledge.ts       ← kb_articles, kb_categories
├── approvals.ts       ← approval_requests, approval_steps
├── notifications.ts   ← notifications
├── ... (14 more)
```

### 8.3 Key Table Designs

**`organizations`** (auth.ts):

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `name` | `text` | NOT NULL |
| `plan` | `org_plan enum` | NOT NULL |
| `settings` | `jsonb` | Org-level configuration |
| `created_at` | `timestamp` | NOT NULL, default `now()` |

**`users`** (auth.ts):

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK |
| `org_id` | `uuid` | FK → organizations, NOT NULL |
| `email` | `text` | UNIQUE per org `(org_id, email)` |
| `name` | `text` | NOT NULL |
| `role` | `user_role enum` | NOT NULL |
| `matrix_role` | `text` | Optional override for fine-grained RBAC |
| `status` | `user_status enum` | `active` \| `inactive` \| `pending` |
| `password_hash` | `text` | Stripped from context before storing in cache |

**`sessions`** (auth.ts):

| Column | Type | Constraints |
|--------|------|------------|
| `id` (token_hash) | `text` | PK (SHA-256 of bearer token) |
| `user_id` | `uuid` | FK → users |
| `expires_at` | `timestamp` | Session expiry |
| `created_at` | `timestamp` | |

> The session primary key IS the SHA-256 token hash — no separate hash column is needed.

**`tickets`** (tickets.ts):

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK |
| `org_id` | `uuid` | FK → organizations, NOT NULL |
| `number` | `serial` | Auto-incrementing ticket number per org |
| `title` | `text` | NOT NULL; included in search vector |
| `status` | `ticket_status enum` | `open`, `in_progress`, `resolved`, `closed` |
| `priority` | `priority enum` | |
| `type` | `ticket_type enum` | |
| `assignee_id` | `uuid` | FK → users, nullable |
| `sla_policy_id` | `uuid` | FK → sla_policies |
| `sla_response_due` | `timestamp` | Computed deadline |
| `sla_resolve_due` | `timestamp` | Computed deadline |
| `sla_breached` | `boolean` | Set by SLA worker |
| `idempotency_key` | `text` | Prevents duplicate ticket creation |
| `version` | `integer` | Optimistic concurrency |
| `search_vector` | `tsvector` | PostgreSQL full-text search (legacy) |

**`audit_logs`** (auth.ts):

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK |
| `org_id` | `uuid` | FK → organizations |
| `user_id` | `uuid` | FK → users |
| `action` | `text` | tRPC procedure path (e.g. `tickets.create`) |
| `entity_type` | `text` | Derived from procedure namespace |
| `entity_id` | `text` | ID of the affected record |
| `input` | `jsonb` | Sanitised input (secrets stripped) |
| `created_at` | `timestamp` | NOT NULL |

### 8.4 Migration Strategy

- Migrations are managed by **Drizzle Kit** (`drizzle-kit`).
- Schema is the source of truth in `packages/db/src/schema/`.
- Generated SQL migrations live in `packages/db/drizzle/` (should be committed to git).
- Production deployments run the `migrator` Docker service before the API starts.

**Migration commands:**

```bash
pnpm --filter @nexusops/db db:generate   # Generate SQL from schema changes
pnpm --filter @nexusops/db db:migrate    # Apply pending migrations
pnpm --filter @nexusops/db db:push       # Push schema directly (dev only)
```

---

## 9. Asynchronous Workflow Design

### 9.1 BullMQ Queue Architecture

BullMQ uses Redis as its message broker. Two queues are bootstrapped at API startup by `apps/api/src/services/workflow.ts`:

```
API startup
    │
    ├── new Queue("nexusops-approvals", { connection })
    │       └── new Worker("nexusops-approvals", approvalProcessor, { concurrency: 5 })
    │
    └── new Queue("nexusops-sla", { connection })
            └── new Worker("nexusops-sla", slaProcessor, { concurrency: 10 })

API shutdown
    ├── await approvalWorker.close()
    ├── await slaWorker.close()
    ├── await approvalQueue.close()
    └── await slaQueue.close()
```

**Queue configuration:**

| Property | `nexusops-approvals` | `nexusops-sla` |
|----------|---------------------|---------------|
| Concurrency | 5 | 10 |
| Max attempts | 3 | 3 |
| Backoff type | Exponential | Exponential |
| Backoff delay | 2,000 ms | 3,000 ms |
| Completed retention | 500 jobs | 300 jobs |
| Failed retention | 200 jobs | 100 jobs |

### 9.2 Approval Workflow

**Job lifecycle:**

```
Approval request created (mutation)
    │
    ├── approvalQueue.add("process", { requestId }, {
    │       jobId: "approval:{requestId}",   ← dedup key
    │       attempts: 3,
    │       backoff: { type: "exponential", delay: 2000 }
    │   })
    │
    └── Worker picks up job
            │
            ├── Load approval request from DB
            ├── Process decision (approve / reject)
            ├── notifyActivity(requester, decision)  ← in-platform notification
            └── writeWorkflowAuditLog(
                    action: "approval.approved" | "approval.rejected",
                    requestId, userId, orgId
                )
```

**Deduplication:** The `jobId: "approval:{requestId}"` ensures that even if the job is enqueued multiple times (e.g. due to retries at the mutation level), only one job per request ID is ever in the queue.

### 9.3 SLA Lifecycle Workflow

**Job scheduling:**

```
Ticket created/updated with SLA policy
    │
    └── scheduleSlaBreach(ticketId, responseDeadline, resolveDeadline)
            │
            ├── slaQueue.add("check", { ticketId, type: "response" }, {
            │       jobId: "sla:response:{ticketId}",
            │       delay: responseDeadline - Date.now()    ← fires at exact deadline
            │   })
            │
            └── slaQueue.add("check", { ticketId, type: "resolve" }, {
                    jobId: "sla:resolve:{ticketId}",
                    delay: resolveDeadline - Date.now()
                })

Ticket resolved before deadline
    └── cancelSlaJobs(ticketId)
            ├── slaQueue.remove("sla:response:{ticketId}")
            └── slaQueue.remove("sla:resolve:{ticketId}")
```

**SLA breach processing:**

```
Delayed job fires (deadline reached)
    │
    ├── Reload ticket from DB
    ├── Is ticket missing? → skip (was deleted)
    ├── Is ticket already slaBreached? → skip (already processed)
    ├── UPDATE tickets SET sla_breached = true WHERE id = ticketId
    ├── notifyAssignee(ticket, breachType)
    └── writeWorkflowAuditLog("sla.{type}_breach", ticketId, orgId)
```

This design uses BullMQ's **delayed job** feature: rather than polling for overdue tickets, a job is scheduled to fire exactly at the SLA deadline. This is highly efficient — no polling, no missed breaches.

**Priority-based SLA deadline computation:**

```
function computeSLADeadline(priority, type, createdAt):

  P1 response → createdAt + 15 min  (24x7 clock)
  P1 resolve  → createdAt + 4 hr    (24x7 clock)
  P2 response → createdAt + 30 min  (24x7 clock)
  P2 resolve  → createdAt + 8 hr    (24x7 clock)
  P3 response → nextBusinessMinute(createdAt) + 4 hr    (business hours 09:00–18:00 IST Mon–Sat)
  P3 resolve  → nextBusinessMinute(createdAt) + 24 hr   (business hours)
  P4 response → nextBusinessMinute(createdAt) + 1 day   (business hours)
  P4 resolve  → nextBusinessMinute(createdAt) + 3 days  (business hours)

  nextBusinessMinute(ts):
    if ts is within business hours → return ts
    else → return 09:00 IST on the next working day (Mon–Sat, excluding public holidays)
```

**SLA pause / resume on PENDING_USER transition:**

```
Status → PENDING_USER:
  ticket.sla_paused_at = NOW()

Status → IN_PROGRESS (from PENDING_USER):
  pause_duration = NOW() - ticket.sla_paused_at
  ticket.sla_pause_duration_mins += floor(pause_duration / 60000)
  ticket.sla_paused_at = NULL
  Remove old sla:resolve job from queue
  Re-schedule new sla:resolve job with delay:
    newDelay = (original_resolution_deadline + sla_pause_duration_mins * 60000) - Date.now()

Auto-resume after 24 hours of PENDING_USER (no user response):
  Scheduled by: slaQueue.add("auto-resume", { ticketId }, {
    jobId: "sla:pending-timeout:{ticketId}",
    delay: 86400000   ← 24 hours
  })
  On fire: transition ticket back to IN_PROGRESS, resume SLA as above
```

**Escalation job scheduling:**

```
On response SLA breach:
  level1EscalationQueue.add("escalate", { ticketId, level: 1 }, {
    jobId: "escalate:L1:{ticketId}",
    delay: 1800000   ← 30 additional minutes after response breach
  })

On resolution SLA breach:
  For P1/P2: level2Delay = 7200000 (2 hours), level3Delay = 14400000 (4 hours)
  For P3/P4: level2Delay = 14400000 (4 hours), level3Delay = 28800000 (8 hours)

  slaQueue.add("escalate-L2", { ticketId }, { delay: level2Delay })
  slaQueue.add("escalate-L3", { ticketId }, { delay: level3Delay })
```

---

### 9.4 India-Specific Computation Engines

The following computation modules are pure functions with no side effects, called synchronously during payroll runs and invoice creation:

#### 9.4.1 Tax Engine (`packages/api/src/lib/tax-engine.ts`)

```typescript
// Old Regime
function computeTaxOld(taxableIncome: number, deductions: OldRegimeDeductions): TaxResult
  // Deductions: standard_deduction(50000), 80C(max 150000), 80D, 24b(max 200000),
  //             80CCD_2(no cap), 80CCD_1B(max 50000), hra_exemption, professional_tax
  // Slabs: 0%(0-2.5L), 5%(2.5-5L), 20%(5-10L), 30%(>10L)
  // Surcharge: 10%(>50L), 15%(>1Cr), 25%(>2Cr), 37%(>5Cr)
  // Rebate 87A: rebate = min(tax, 12500) if taxable_income <= 500000
  // Cess: 4% on (tax_after_rebate + surcharge)

// New Regime
function computeTaxNew(taxableIncome: number, npsEmployer: number): TaxResult
  // Deductions: standard_deduction(50000), 80CCD_2(npsEmployer, no cap)
  // Slabs: 0%(0-3L), 5%(3-6L), 10%(6-9L), 15%(9-12L), 20%(12-15L), 30%(>15L)
  // Rebate 87A: rebate = min(tax, 25000) if taxable_income <= 700000
  // Cess: 4%

// HRA Exemption
function computeHRAExemption(hraReceived, rentPaid, basicAnnual, isMetro): number
  // Returns min(hraReceived, rentPaid - 0.10*basic, metro?0.50*basic:0.40*basic)

// Monthly TDS
function computeMonthlyTDS(employeeId, currentFYMonth, ytdIncome, ytdTDS,
                            regime, deductions): number
  // Projects remaining income, computes annual tax, returns (annualTax - ytdTDS) / monthsRemaining
```

#### 9.4.2 GST Engine (`packages/api/src/lib/gst-engine.ts`)

```typescript
function computeGST(taxableValue: number, gstRate: 0|5|12|18|28, isInterstate: boolean): GSTResult
  // Returns { igst, cgst, sgst, total }
  // isInterstate: igst = taxableValue * gstRate / 100; cgst = sgst = 0
  // intrastate:   cgst = sgst = taxableValue * (gstRate/2) / 100; igst = 0

function validateGSTIN(gstin: string): ValidationResult
  // Validates 15-char format, state code 01-38, PAN regex, position-14 = 'Z', checksum

function computeITCUtilization(igstBalance, cgstBalance, sgstBalance,
                                igstPayable, cgstPayable, sgstPayable): ITCUtilizationResult
  // Applies §FR-FIN-10 utilization sequence
  // Returns: setoffs applied per bucket, net_cash_payable per bucket

function applyRCM(taxableValue, gstRate, isInterstate, isEligibleForITC): RCMResult
  // Returns buyer-side RCM liability and ITC entries
```

#### 9.4.3 Payroll Engine (`packages/api/src/lib/payroll-engine.ts`)

```typescript
function computeMonthlySalarySlip(employeeId, month, year): SalarySlip
  // 1. Fetch salary structure (effective for this month)
  // 2. Compute paid_days from attendance
  // 3. Prorate gross: gross_payable = monthly_components * (paid_days / working_days)
  // 4. Compute PF: min(basic_monthly * 0.12, 1800)
  // 5. Compute PT: statePTSchedule[state][month]
  // 6. Compute LWF: stateLWFSchedule[state][month]
  // 7. Compute TDS: computeMonthlyTDS(...)
  // 8. net = gross_payable - pf - pt - lwf - tds
  // Returns full SalarySlip object

function computePFChallanData(orgId, month, year): EPFOECRRow[]
  // Returns per-employee ECR rows for EPFO portal upload
```

---

## 10. Search Design

### 10.1 Index Architecture

Eight Meilisearch indexes are maintained, one per major entity type:

| Index | Entity | Filterable | Searchable |
|-------|--------|-----------|-----------|
| `tickets` | Support tickets | `org_id`, `status`, `type` | `title`, `description`, `number` |
| `assets` | IT assets | `org_id`, `status`, `type` | `name`, `description` |
| `ci_items` | Config items | `org_id`, `status`, `type` | `name`, `description` |
| `kb_articles` | Knowledge base | `org_id`, `status` | `title`, `content` |
| `employees` | HR employees | `org_id` | `name`, `description` |
| `contracts` | Legal contracts | `org_id` | `title`, `name`, `description` |
| `crm_deals` | CRM deals | `org_id` | `title`, `name`, `description` |
| `crm_accounts` | CRM accounts | `org_id` | `title`, `name`, `description` |

### 10.2 Global Search Flow

```
GET trpc.search.global({ query, orgId, limit? })
    │
    ├── For each of 8 indexes (parallel):
    │       meilisearch.index(name).search(query, {
    │           filter: `org_id = "${orgId}"`,
    │           limit: Math.ceil(limit / 8)
    │       })
    │
    ├── Merge results from all indexes
    ├── Sort by relevance score
    └── Return merged array (max `limit` results, default 20)
```

**Graceful degradation:** If `MEILISEARCH_URL` is not set or Meilisearch is unreachable, the search endpoint returns an empty array. The calling component displays a "search unavailable" message rather than an error.

### 10.3 Document Indexing

`indexDocument(indexName, document)` in `services/search.ts` adds a document to a Meilisearch index:

```typescript
async function indexDocument(indexName: string, doc: Record<string, unknown>) {
  if (!process.env.MEILISEARCH_URL) return;  // No-op if not configured
  try {
    await client.index(indexName).addDocuments([doc], { primaryKey: "id" });
  } catch {
    // Swallow errors — search index failures must not block write operations
  }
}
```

Write procedures (ticket creation, employee creation, etc.) MUST call `indexDocument` after the PostgreSQL write succeeds. Search index failures are non-blocking and do not cause the parent mutation to fail.

---

## 11. Rate Limiting Design

Rate limiting is implemented globally at the Fastify level using `@fastify/rate-limit` backed by Redis.

### 11.1 Key Generation

```typescript
keyGenerator(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return `user:${auth.slice(7)}`;
  const cookie = req.cookies?.nexusops_session;
  if (cookie) return `user:${cookie}`;
  return `anon:${req.ip}`;
}
```

This means authenticated users share a rate limit budget per token (not per IP), while anonymous users are limited per IP.

### 11.2 Limit Tiers

| Key Prefix | Window | Production Limit | Development Limit |
|-----------|--------|-----------------|------------------|
| `user:*` | `RATE_LIMIT_WINDOW` (default 1 min) | 1,000 req | 10,000 req |
| `anon:*` | Same | 100 req | 1,000 req |

Rate limit counters are stored in Redis, enabling shared limits across multiple API instances. On limit exceeded, a `429 Too Many Requests` response is returned with a `retry-after` header.

`skipOnError: true` ensures that Redis availability issues do not block legitimate requests.

---

## 12. Security Design

### 12.1 Transport Layer Security

All traffic passes through Traefik, which:
- Terminates TLS using Let's Encrypt certificates (auto-renewed).
- Redirects all HTTP (port 80) requests to HTTPS (port 443).
- Proxies decrypted traffic to internal services over the Docker network.

Internal service-to-service traffic (API → PostgreSQL, API → Redis, etc.) runs on a Docker bridge network and does not traverse the public internet.

### 12.2 Web Security Headers

The Next.js config sets security headers on every response via `headers()` in `next.config.ts`. See the TRD (NFR-SEC-02) for the full header table.

### 12.3 Content Security Policy

The CSP restricts which resources the browser can load and execute. The current policy includes `'unsafe-inline'` and `'unsafe-eval'` in `script-src` as required by Next.js's current rendering model. These should be removed in a future hardening pass using nonce-based CSP.

```
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' ${NEXT_PUBLIC_API_URL} wss: ws:;
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https:;
  frame-ancestors 'none'
```

### 12.4 Password & Credential Storage

- User passwords are stored as hashes only (bcrypt or similar) — the raw password is never stored.
- Session tokens are stored as SHA-256 hashes in the `sessions` table — the raw token is only transmitted to the client and never persisted.
- API key secrets are stored as SHA-256 hashes in the `api_keys` table.
- Docker images run processes as non-root users (uid 1001).

### 12.5 Input Validation

All tRPC mutation inputs are validated by Zod schemas before any middleware or handler code runs. The tRPC layer automatically calls `input.parse(rawInput)` and throws `BAD_REQUEST` on failure, with the structured Zod error attached for client-side field mapping.

**Prototype Pollution Prevention:** A Fastify `preHandler` hook sanitizes every incoming JSON body *before* tRPC or Zod processes it. The `sanitizeInput()` function in `apps/api/src/lib/sanitize.ts` recursively walks the object tree and deletes any key matching `__proto__`, `constructor`, or `prototype`. This ensures that even if a client sends `{ "__proto__": { "admin": true } }`, the key is silently removed and the remaining (potentially empty) object proceeds through Zod, which returns `BAD_REQUEST` for any missing required fields.

```
Request body received
       │
       ▼
  preHandler: sanitizeInput(req.body)   ← strips __proto__ / constructor / prototype
       │
       ▼
  tRPC plugin: input.parse(body)        ← Zod validates types, enums, required fields
       │
       ▼
  Handler code
```

This layer was validated by the k6 `invalid_payload.js` adversarial suite: 26 attack cases, 0 server errors.

---

## 13. Shared Package Design

### 13.1 `@nexusops/types`

Exports grouped by domain:

```typescript
// packages/types/src/index.ts
export * from "./auth";         // UserRole, SystemRole, OrgPlan, SystemUser
export * from "./rbac-matrix";  // Module, Action, RBAC_MATRIX, checkPermission
export * from "./currencies";   // Currency codes
export * from "./tickets";      // TicketStatus, Priority, TicketType
export * from "./assets";       // AssetType, AssetStatus
export * from "./hr";           // EmploymentType, LeaveType
export * from "./procurement";  // POStatus
```

The `rbac-matrix.ts` module is the single source of truth for RBAC. It defines:
- `SystemRole` enum — all user roles
- `Module` enum — all permission modules
- `RBAC_MATRIX` — the role → permission mapping object
- `checkPermission(role, module, action)` — pure function (no DB dependency)

Both the backend (`checkDbUserPermission` wraps this) and the frontend (`rbac-context.tsx`) use this function, guaranteeing identical permission logic on both ends.

### 13.2 `@nexusops/db`

The database package exposes:
- `getDb()` — singleton Drizzle ORM client factory
- All schema table definitions and enums (re-exported from `schema/index.ts`)
- All Drizzle query helpers (`eq`, `and`, `or`, `sql`, `desc`, `asc`, etc.)
- Drizzle Kit migration configuration (`drizzle.config.ts`)

The API imports `getDb()` to obtain the database instance, which is passed into every tRPC context via `createContext`.

### 13.3 `@nexusops/ui`

A curated set of Tailwind + Radix primitive components. Design rules:
- Each component is a thin wrapper over a Radix primitive with consistent Tailwind styling.
- Components accept a `className` prop for customisation via `cn()` (class merger).
- No business logic — purely presentational.
- The `utils` export provides `cn()` (a `clsx` + `tailwind-merge` combination).

### 13.4 `@nexusops/config`

Provides shared toolchain configuration as re-exportable presets:

| Export | Content |
|--------|---------|
| `@nexusops/config/eslint` | ESLint flat config with TypeScript + React rules |
| `@nexusops/config/prettier` | Prettier config with Tailwind plugin |
| `@nexusops/config/tsconfig` | Base `tsconfig.json` for all packages |
| `@nexusops/config/tsconfig-nextjs` | Extended config for Next.js apps |

---

## 14. Infrastructure & Deployment Design

### 14.1 Container Design

**Web container (multi-stage):**

```dockerfile
# Stage 1: base
FROM node:20-alpine AS base
RUN corepack enable pnpm

# Stage 2: deps — frozen lockfile install
FROM base AS deps
COPY pnpm-lock.yaml .
RUN pnpm install --frozen-lockfile

# Stage 3: builder — monorepo build
FROM base AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
RUN pnpm turbo run build --filter=@nexusops/web...

# Stage 4: runner — minimal production image
FROM node:20-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nexusops && adduser -S nextjs -G nexusops -u 1001
COPY --from=builder /app/apps/web/.next/standalone ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health
CMD ["node", "server.js"]
```

**API container (multi-stage):**

```dockerfile
# Stage 1-3: similar base/deps/builder pattern
# tsup builds ESM output to dist/index.mjs

# Stage 4: runner
FROM node:20-alpine AS runner
RUN apk add --no-cache tini
RUN addgroup -S nexusops && adduser -S api -G nexusops -u 1001
COPY --from=builder /app/apps/api/dist ./dist
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.mjs"]
```

### 14.2 Service Dependency Graph

```
traefik ─────────────────────────┐
                                 │
         web ──(depends_on: api healthy)──┐
                                          │
         api ──(depends_on: postgres, redis healthy, migrator completed)──┐
                                                                          │
         migrator ──(depends_on: postgres healthy)──┐                    │
                                                    │                    │
                                               postgres              redis
                                               meilisearch           minio
```

### 14.3 Networking

All services are on a Docker bridge network (`nexusops-network` or default). Only Traefik exposes ports 80 and 443 to the host. All other services communicate internally on service-name DNS resolution.

---

## 15. Design Patterns & Conventions

### 15.1 Patterns Used

| Pattern | Where Used | Purpose |
|---------|-----------|---------|
| **Repository / Data Access via ORM** | All tRPC procedures | Abstracts SQL behind Drizzle table queries |
| **Middleware Chain (Onion)** | tRPC middleware stack | Composable request processing (logging → auth → RBAC → handler) |
| **Context Object** | tRPC `Context` | Carries all per-request dependencies (db, user, org) without global state |
| **Multi-Tier Cache (Cache-Aside)** | Session resolution | L1 Map → L2 Redis → L3 PostgreSQL |
| **Inflight Deduplication (Coalescing)** | Session lookup | Single DB query for concurrent identical token lookups |
| **Provider / Context (React)** | `TRPCProvider`, `RBACProvider` | Dependency injection for server state and auth identity |
| **Data-Driven Navigation** | `AppSidebar` | Nav items defined as data, rendered via filter/map pipeline |
| **Delayed Job Scheduling** | SLA workflow | BullMQ delayed jobs replace polling for SLA breach detection |
| **Job Deduplication** | Approval workflow | `jobId` prevents duplicate processing of the same approval |
| **Error Enrichment** | `errorFormatter` | Attaches `zodError` to all tRPC errors for structured client-side handling |
| **Graceful Degradation** | Search service | Returns empty results instead of errors on external service unavailability |
| **Audit Mutation Decorator** | `protectedProcedure` | Transparent audit log writing on all successful mutations |

### 15.2 Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| tRPC routers | camelCase singular | `tickets`, `hr`, `grc` |
| tRPC procedures | camelCase verb-noun | `listAudits`, `createTicket`, `updateEmployee` |
| Database tables | snake_case plural | `tickets`, `audit_logs`, `sla_policies` |
| Database columns | snake_case | `org_id`, `created_at`, `sla_breached` |
| React components | PascalCase | `AppSidebar`, `TRPCProvider`, `AccessDenied` |
| React hooks | camelCase `use` prefix | `useRBAC`, `useSidebarBadges` |
| TypeScript types/interfaces | PascalCase | `SystemUser`, `SidebarGroup`, `Context` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `RATE_LIMIT_PER_TOKEN` |
| Docker service names | kebab-case | `nexusops-approvals`, `nexusops-sla` |

### 15.3 File Organisation Conventions

```
apps/api/src/
├── index.ts          # Server setup and startup
├── lib/              # Shared infrastructure (trpc.ts, redis.ts, db-retry.ts)
├── middleware/       # Request-level middleware (auth.ts, rbac-db.ts)
├── routers/          # Domain tRPC routers (one file per domain)
├── services/         # Business logic services (search.ts, workflow.ts)
└── workflows/        # BullMQ job definitions and workers

apps/web/src/
├── app/              # Next.js App Router pages and layouts
├── components/
│   ├── layout/       # AppSidebar, AppHeader, shell components
│   ├── providers/    # Context providers
│   └── ui/           # App-specific UI components (NOT the shared lib)
└── lib/              # Client utilities (trpc.ts, rbac-context.tsx, sidebar-config.ts)
```

---

## 16. Cross-Cutting Concerns

### 16.1 Request Tracing

Every Fastify request receives a unique `request.id` from Fastify's built-in ID generator. This `requestId` is:
- Passed into the tRPC `Context`.
- Included in every log entry via `loggingMiddleware`.
- Written to `audit_logs` for all mutations.

This allows end-to-end correlation of logs for a single user request across the logging middleware, auth middleware, RBAC check, and database operations.

### 16.2 Retry Strategy

Two distinct retry layers exist:

| Layer | Trigger | Max Retries | Delay | Scope |
|-------|---------|------------|-------|-------|
| tRPC mutation retry (`retryMutation`) | PG error codes 23505, 40001, 40P01 | 3 total | Random [10-50ms] | All `protectedProcedure` mutations |
| React Query client retry | Any non-auth/non-forbidden error | 1 | Default TanStack backoff | All tRPC queries on frontend |
| ioredis connection retry | Redis connection loss | 10 | `min(n×100ms, 3000ms)` | All Redis operations |
| BullMQ job retry | Any job processor error | 3 | Exponential from 2s/3s | Background jobs |

### 16.3 Graceful Degradation Points

| Feature | Failure Mode | Degradation Behaviour |
|---------|-------------|----------------------|
| Meilisearch down | Search queries fail | Returns empty results; no error propagated to user |
| Redis unavailable | Session cache miss | Falls back to PostgreSQL for session lookups |
| Rate limiter Redis fail | Counter unavailable | `skipOnError: true` — requests are allowed through |
| Background job fails | BullMQ worker error | Job retried up to 3× with exponential backoff |
| `indexDocument` fails | Meilisearch write error | Error swallowed; search results lag until re-indexing |

### 16.4 Observability Hooks

| Signal | Mechanism | Storage |
|--------|-----------|---------|
| Structured request log | `onResponse` hook → `logInfo("REQUEST", ...)` | stdout → Docker log driver |
| Slow requests | `[SLOW REQUEST]` log > 500ms | Same as above |
| Latency percentiles | p50/p95/p99 every 200 requests | Same as above |
| DB pool pressure | Warn at ≥85% every 5s | Same as above |
| Audit trail | `audit_logs` table | PostgreSQL |
| Auth failures | `logAuthFail` | Structured log |
| RBAC violations | `logRbacDenied` | Structured log |
| Rate-limit rejections | `logRateLimit` + `recordRateLimit()` | Structured log + in-memory counter |
| Per-endpoint metrics | `recordRequest()` on every `onResponse` | In-memory (`metrics.ts`) |
| Health status change | `checkHealth()` → `emitTransition()` | Structured log (`SYSTEM_DEGRADED` / `SYSTEM_UNHEALTHY` / `SYSTEM_RECOVERED`) |
| Live metrics snapshot | `GET /internal/metrics` | In-memory read |
| Live health status | `GET /internal/health` | In-memory read |

---

## 17. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-26 | Platform Engineering | Initial document created from full codebase analysis |
| 1.1 | 2026-03-27 | Platform Engineering | Updated router count (33→35). Added `inventory` and `indiaCompliance` routers to AppRouter composition. Added design note: pages using `useSearchParams` must wrap the consuming component in `<Suspense>` to satisfy Next.js 15 App Router prerendering — `contracts/page.tsx` wrapped, `secretarial/page.tsx` given `dynamic = "force-dynamic"`. Documented new procedures: `changes.addComment`, `changes.addProblemNote`, `changes.publishProblemToKB`, `hr.employees.update`, `hr.cases.get/completeTask/addNote`, `assets.licenses.create`, `admin.scheduledJobs.trigger`, `crm.updateQuote`. All static data stubs on frontend pages replaced with live tRPC queries. Virtual agent now creates real tickets via `tickets.create`. |
| 1.2 | 2026-03-28 | Platform Engineering | Added §11.4 (Load Testing Design) documenting k6 test architecture, token-per-VU pattern, and `seed_users.js` seeding workflow. Confirmed rate limiting design (§11) operates correctly under load — per-user/per-endpoint bucket isolation verified. All frontend mutations audited: `onError` handlers standardised to `toast.error(err?.message ?? "Something went wrong")`, `toast.success` messages made action-specific. Optional chaining (`?.`) and nullish coalescing (`??`) applied to all risky property access paths. See `NexusOps_Load_Test_Report_2026.md`. |
| 1.3 | 2026-03-28 | Platform Engineering | **Security design hardening.** Expanded §5.6 (Error Handling Design): full error code table added; design rule documented — `INTERNAL_SERVER_ERROR` must not be used for known application conditions. Corrected `tickets.create` to use `PRECONDITION_FAILED (412)` for missing org workflow. Expanded §12.5 (Input Validation): prototype pollution prevention design documented — `sanitizeInput()` Fastify `preHandler` recursively strips `__proto__`/`constructor`/`prototype` before Zod. Updated §11.4 with k6 security suite baseline: 6 test scripts, 23,798 requests, 0 unhandled 500s, 100% bad-input rejection, p95 271ms. See `NexusOps_K6_Security_and_Load_Test_Report_2026.md`. |

---

*This document was generated from a comprehensive analysis of the NexusOps monorepo source code, component architecture, middleware patterns, and infrastructure configuration as of March 26, 2026. It should be updated whenever significant architectural or design decisions are made.*
| 1.4 | 2026-03-29 | Platform Engineering | **Observability stack design.** Expanded §5.7 (Logging Design): documented `initLogger()` setter pattern, canonical `logInfo`/`logWarn`/`logError` functions, request log field schema, correlation ID strategy, and stack trace policy. Added §5.8 (In-Memory Metrics Design): `MetricsState` shape, URL normalisation, incremental mean algorithm, and full public API (`recordRequest`, `recordError`, `recordRateLimit`, `getMetricsSnapshot`, `resetMetrics`). Added §5.9 (Health Signal Design): pure `evaluateHealth()` rule table, `healthMonitor.ts` module-level state, non-evaluation vs evaluation tick cost analysis, log routing table, and anti-spam invariant. Updated §16.4 (Observability Hooks) table with rate-limit counter, per-endpoint metrics, health status change signal, and internal endpoint reads. |
| 1.5 | 2026-04-02 | Platform Engineering | **Stress & chaos test design validation.** 10,000-session stress test (March 27): unique-token-per-session design validated — 100% login success, 0 auth failures across 10,000 independent sessions. RBAC design gap identified: `surveys.create` (hr_manager), `events.list` (security_analyst), `oncall` and `walkup` reads (non-admin) returning FORBIDDEN — `permissionProcedure` resource/action bindings for these modules need expanding. Drizzle schema-import design flaw: `Symbol(drizzle:Columns)` error on `tickets.create`/`workOrders.create` for non-admin paths indicates a Drizzle ORM import reference not correctly exported from `@nexusops/db` in some code paths. Destructive chaos test Round 2 (April 2): auth.login bottleneck confirms §5.10 (bcrypt semaphore) design works correctly but `BCRYPT_CONCURRENCY=8` is undersized for >50 concurrent login attempts/s — ceiling should be raised or a Redis pre-check added. Bearer token design: §8 (Authentication) `createContext` middleware confirmed inconsistently applying Bearer extraction for query-type tRPC procedures. See `NexusOps_Stress_Test_Report.md` and `NexusOps_Destructive_Chaos_Test_Report_2026.md`. |
