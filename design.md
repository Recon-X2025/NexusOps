*Note: This project is large. I sampled the directory structure via `git ls-files` and completely read the top-level `package.json`, `apps/api/package.json`, `apps/web/package.json`, `README.md`, `apps/api/src/index.ts`, `apps/api/src/routers/index.ts`, `apps/web/src/app/layout.tsx`, and `packages/db/src/index.ts`. Other files were not read.*

# System Design

**Last Updated:** 2026-07-15

## Architecture & Data Flow
CoheronConnect follows a monorepo structure with a clear separation between the presentation layer, API layer, and database schema. 

```text
[ Web Client (Next.js) ] <--> [ tRPC + HTTP (Fastify) ] <--> [ Drizzle ORM ] <--> [ PostgreSQL / MongoDB ]
           |                              |                                             |
     [ Radix UI ]                 [ Redis / BullMQ ] <--> [ Background Workers (Temporal / BullMQ) ]
           |                              |
[ Mobile Client (Expo) ]         [ External Services (SAML, OIDC, S3, Meilisearch) ]
```
Data generally flows from the Next.js React UI through tRPC client queries to the Fastify tRPC backend (`apps/api/src/index.ts`). The API interacts with the database via Drizzle ORM (`@coheronconnect/db`).

## Core Abstractions & Design Patterns
- **Monorepo / Workspace**: Uses Turbo and pnpm workspaces to separate concerns (API, web, types, db, ui).
- **Type-Safe RPC**: Extensive use of tRPC (`apps/api/src/routers/index.ts`) ensures that the frontend and backend share exact TypeScript interfaces without manual OpenAPI syncing.
- **Middleware-Based Fastify Pipeline**: The API uses Fastify hooks for cross-cutting concerns like rate limiting (`@fastify/rate-limit`), prototype-pollution sanitization (`preHandler`), concurrent request throttling (`onRequest`), and structured logging (`onResponse`) (found in `apps/api/src/index.ts`).
- **Modular Domains**: The system is split into distinct business domains (e.g., `hrRouter`, `ticketsRouter`, `grcRouter`, `financialRouter`). The `appRouter` aggregates these domains, reflecting a micro-service-like isolation within a monolithic API.

## Component Interaction
- **Web to API**: Handled predominantly by `@trpc/react-query` in `apps/web`.
- **API to DB**: `packages/db` exposes `getDb()`, `sql`, and ORM models, imported dynamically in `apps/api/src/index.ts` and routes.
- **Background Jobs**: BullMQ and Temporal manage durable workflows. The API initializes `initWorkflowService(getDb())` on startup (`apps/api/src/index.ts`).

## State Management, Data Models & Invariants
- **Database Connections**: The API tightly controls database pool exhaustion using an active in-flight request guard (`inFlight > MAX_IN_FLIGHT`). 
- **Session Cache**: L1 in-memory cache and L2 Redis cache (`SESSION_CACHE_TTL_MS`, `REDIS_TTL_SECS`) are used for authentication checks to avoid database hits on every request (`apps/api/src/index.ts`).
- **Data Models**: Represented as Drizzle SQL tables in `packages/db/src/schema/`. E.g., `expense_reports` are completely separate from `expense_claims` (as noted in `README.md`).
- **Auto-number Invariants**: During API startup, `syncOrgCounters(db)` actively syncs `org_counters` to the actual database state to guarantee auto-number sequence integrity and prevent duplicate key violations.

## Notable Design Decisions & Trade-offs
- **Hybrid DB Provider (Inferred)**: The platform gracefully checks if the configured `DATABASE_PROVIDER` requires MongoDB, indicating a potential dual-database architecture or legacy migration state for specific tenants.
- **Aggressive Throttling & Protection**: The Fastify API is heavily defensive. It drops prototype pollution keys at the HTTP level before Zod validation, returns immediate 503s on connection saturation instead of queuing, and implements a dual-layer rate limiter (burst vs. per-minute). Trade-off: Complex API startup logic, but high resiliency under load.
- **Best-Effort Webhooks**: Webhooks and ITSM loops (e.g., SLA timers, event correlation) are explicitly "best-effort" and do not roll back triggering writes if the downstream action fails. Trade-off: Eventual consistency over strict transactional guarantees.
- **Custom Metrics**: Instead of relying solely on external APM agents, the API maintains in-memory synchronous counters (`recordRequest`, `getMetricsSnapshot`) for performance. Trade-off: Lower overhead, but resets if the process crashes.

## Extension Points
- **tRPC Routers**: `apps/api/src/routers/index.ts` is highly extensible for adding new domains (e.g. `agentRouter` for Copilot AI was added here).
- **Webhooks & External Integrations**: External webhook receivers (`apps/api/src/http/webhooks.js`) allow third-party providers (eMudhra, Razorpay) to hook into workflows.
- **Workflow Engine**: Integrations and business rules are designed to extend outward via Temporal and BullMQ dispatchers.

## Gaps
- Internal implementations of the tRPC procedures (e.g. inside `apps/api/src/routers/*.ts`) were not read.
- The precise React state management library (Zustand, Redux, or purely React Query) inside `apps/web/` is unverified, though `@tanstack/react-query` is in the `package.json`.
- Specific mechanisms for how Temporal workflows (`apps/worker/`) communicate back to the API are unverified.

## UI/UX Design Guidelines & System

### 1. Typography & Fonts
- **Primary Font**: Inter (Sans-serif) - Used for all body text, UI elements, and standard typography.
- **Heading Font**: Outfit or Roboto (Sans-serif) - Used for all `h1` to `h6` headers to provide a modern, premium feel.
- **Monospace Font**: JetBrains Mono or Fira Code - Used for code blocks, technical data, and IDs.

### 2. Color Palette
The color system is designed for a premium, clean, and accessible interface, supporting both Light and Dark modes.

#### Primary Colors
- **Primary Blue**: `#2563EB` (Tailwind `blue-600`) - Used for primary actions, active states, and focus rings.
- **Secondary Gray**: `#64748B` (Tailwind `slate-500`) - Used for secondary text, disabled states, and subtle borders.

#### Accent & Semantic Colors
- **Success/Emerald**: `#10B981` (Tailwind `emerald-500`) - Used for success messages, completed states, and positive trends.
- **Warning/Amber**: `#F59E0B` (Tailwind `amber-500`) - Used for warnings and pending states.
- **Danger/Rose**: `#E11D48` (Tailwind `rose-600`) - Used for destructive actions and errors.

#### Backgrounds & Surfaces
- **Light Mode Background**: `#F8FAFC` (Tailwind `slate-50`) - Main app background.
- **Light Mode Surface**: `#FFFFFF` - Cards, modals, and dropdowns.
- **Dark Mode Background**: `#0F172A` (Tailwind `slate-900`) - Main app background in dark mode.
- **Dark Mode Surface**: `#1E293B` (Tailwind `slate-800`) - Cards, modals, and dropdowns in dark mode.

### 3. Text & Sizing
We follow a standard modular scale for text sizes (Tailwind defaults):
- **xs** (0.75rem): Small utility text, badges.
- **sm** (0.875rem): Secondary text, timestamps.
- **base** (1rem): Standard body text.
- **lg** (1.125rem): Important body text, subtitles.
- **xl** (1.25rem): Card headers, small page titles.
- **2xl to 4xl**: Hero headings, major section titles.

### 4. Aesthetics & Micro-interactions
- **Borders & Shadows**: Use subtle borders (`border-slate-200` in light, `border-slate-700` in dark) and soft shadows (`shadow-sm` and `shadow-md`) to create depth without clutter.
- **Glassmorphism**: Use backdrop blurs (`backdrop-blur-md bg-white/70`) for sticky headers and floating navigation to give a modern, dynamic feel.
- **Animations**: Implement subtle micro-animations for interactive elements (e.g., hover states on buttons: `transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`).
- **Radii**: Use rounded corners extensively (`rounded-xl` for cards, `rounded-lg` for inputs/buttons) for a friendly, contemporary aesthetic.
