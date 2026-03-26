# NexusOps — Software Design Document (SDD)

**Version:** 1.0  
**Date:** March 26, 2026  
**Status:** Active  
**Author:** Platform Engineering Team  

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

**Frontend error consumption:**

```typescript
// Accessing Zod field errors from a tRPC mutation error
const zodErrors = error?.data?.zodError?.fieldErrors;
if (zodErrors?.email) {
  setError("email", { message: zodErrors.email[0] });
}
```

### 5.7 Logging Design

The API uses **pino** for structured JSON logging. All log entries include:

| Field | Source |
|-------|--------|
| `level` | `info` (prod) / `debug` (dev) |
| `time` | ISO timestamp |
| `requestId` | Fastify request ID |
| `path` | tRPC procedure path (e.g. `tickets.create`) |
| `duration` | Request duration in ms |
| `userId` | From context |
| `orgId` | From context |

**Specialised log functions:**

| Function | Trigger | Level |
|----------|---------|-------|
| `logAuthFail` | Missing/invalid session token | `warn` |
| `logRbacDenied` | Permission check failure | `warn` |
| `logDbError` | PostgreSQL error in procedure | `error` |
| `logServerError` | Unhandled error in procedure | `error` |
| `[SLOW REQUEST]` | Duration > 500ms | `warn` |
| Latency report | Every 200 requests | `info` |

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
| Structured logs | pino JSON | stdout → Docker log driver |
| Slow requests | `[SLOW REQUEST]` log > 500ms | Same as above |
| Latency percentiles | p50/p95/p99 every 200 requests | Same as above |
| DB pool pressure | Warn at ≥85% every 5s | Same as above |
| Audit trail | `audit_logs` table | PostgreSQL |
| Auth failures | `logAuthFail` | Structured log |
| RBAC violations | `logRbacDenied` | Structured log |

---

## 17. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-26 | Platform Engineering | Initial document created from full codebase analysis |

---

*This document was generated from a comprehensive analysis of the NexusOps monorepo source code, component architecture, middleware patterns, and infrastructure configuration as of March 26, 2026. It should be updated whenever significant architectural or design decisions are made.*
