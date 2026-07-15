*Note: This project is large. I sampled the directory structure via `git ls-files` and completely read the top-level `package.json`, `apps/api/package.json`, `apps/web/package.json`, `README.md`, `apps/api/src/index.ts`, `apps/api/src/routers/index.ts`, `apps/web/src/app/layout.tsx`, and `packages/db/src/index.ts`. Other files were not read.*

# Project Details

## Purpose
CoheronConnect by Coheron is an enterprise-grade workflow orchestration platform that provides ITSM, asset management, HR service delivery, and procurement modules. It serves as a more affordable, startup-friendly alternative to ServiceNow.

## Tech Stack
From `package.json` and module manifests:
- **Frontend**: Next.js 16.2.2, React 19.0.0, TailwindCSS 3.4.0, Radix UI (`apps/web/package.json`)
- **Backend API**: Fastify 5.0.0, tRPC 11.0.0 (`apps/api/package.json`, `apps/web/package.json`)
- **Database / ORM**: PostgreSQL (via `postgres` 3.4.8), Drizzle ORM 0.45.2 (`package.json`, `apps/api/package.json`)
- **Workflow Engine**: Temporal (`@temporalio/client` 1.11.0) and BullMQ 5.0.0 (`apps/api/package.json`)
- **Auth**: SAML (`@node-saml/node-saml`), OIDC (`openid-client`), JWT (`jsonwebtoken` 9.0.0), and bcrypt (`apps/api/package.json`)
- **Other**: Meilisearch 0.44.0, Redis (ioredis 5.4.0), Playwright 1.58.2 (E2E testing), Vitest 2.0.0

## Directory Structure
- `apps/api/` - Fastify + tRPC backend API server.
- `apps/web/` - Next.js frontend application.
- `apps/mobile/` - Expo / React Native client.
- `apps/worker/` - Background workers and BullMQ processing.
- `apps/mac/` - Managed account console (Next.js).
- `apps/docs/` - Documentation site (Next.js).
- `packages/auth/` - Authentication utilities.
- `packages/config/` - Shared configuration for ESLint, TSConfig, etc.
- `packages/db/` - Drizzle ORM schemas, database client, and migrations.
- `packages/metrics/` - Shared metrics collection and formatting.
- `packages/payroll-math/` - Computations for payroll, tax, gratuity, and statutory deductions.
- `packages/types/` - Shared TypeScript definitions and Zod schemas.
- `packages/ui/` - Shared Radix/Tailwind component library.
- `packages/validators/` - Shared Zod validation schemas.
- `scripts/` - Shell and Node scripts for deployment, testing, codemods, and load generation.
- `tests/` - QA, Playwright (E2E), chaos, k6, and load testing suites.

## Key Modules / Services
- **API Server** (`apps/api/src/index.ts`): Initializes Fastify, tRPC, BullMQ workflow service, Redis rate limiting, and structured logging. Exposes REST endpoints (`/health`, webhooks, PDF generation) and tRPC procedures (`/trpc`).
- **tRPC App Router** (`apps/api/src/routers/index.ts`): Aggregates all domain routers, including `hr`, `tickets`, `assets`, `workflows`, `grc`, `crm`, `payroll`, `financial`, `procurement`, `mac`, `compliance`, and `agent` (AI multi-turn Copilot).
- **Web Frontend** (`apps/web/src/app/layout.tsx`): Main entry point for the React/Next.js UI, wrapping the app in Next-Themes, Radix Tooltips, and `TRPCProvider`.
- **Database Package** (`packages/db/src/index.ts`): Exports the Drizzle schema, MongoDB client, and database connection provider.

## External Dependencies
- **Postgres**: Primary OLTP datastore (`postgres` driver).
- **Redis**: Used for rate limiting (`apps/api/src/index.ts`), session caching, and BullMQ (`apps/api/package.json`).
- **Meilisearch**: For full-text search capabilities (health check at `/health/detailed` in `apps/api/src/index.ts`).
- **MinIO / AWS S3**: File storage (`@aws-sdk/client-s3`).
- **Temporal.io**: Durable workflow execution engine (`@temporalio/client`).
- **Anthropic Claude API**: LLM integration for AI layer (`@anthropic-ai/sdk`).
- **eMudhra / AiSensy / Razorpay**: Third-party webhook integrations (`apps/api/src/http/webhooks.js`).

## Environment Variables
Defined in `apps/api/src/index.ts` and `README.md`:
- `PORT` / `HOST`: API listener binding.
- `NODE_ENV`: Dev/prod mode toggle.
- `DATABASE_URL` / `DATABASE_PROVIDER` / `DATABASE_OLTP_PROVIDER`: Connection string and DB engine selection.
- `REDIS_URL`: Redis connection string.
- `MEILISEARCH_HOST`: Search engine URL.
- `AUTH_SECRET` / `ENCRYPTION_KEY`: Core cryptographic secrets.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_ANON_MAX` / `RATE_LIMIT_DISABLED`: Rate limiter configs.
- `MAX_IN_FLIGHT` / `MAX_BODY_BYTES`: API concurrency and payload protections.
- `INTERNAL_API_TOKEN`: Secures `/internal/*` endpoints.
- `CORS_ORIGIN` / `NEXT_PUBLIC_APP_URL`: Allowed CORS domains.

## Build, Run, and Test
Scripts defined in `package.json`:
- **Build**: `pnpm build` (runs `turbo run build`).
- **Run Dev**: `pnpm dev` (runs `turbo run dev`) or `make dev`.
- **Docker**: `make docker-up` starts the Postgres, Redis, Meilisearch infrastructure (`docker-compose.dev.yml`).
- **Test**: `pnpm test` (Vitest), `pnpm test:e2e` (Playwright), and `pnpm test:full-qa` for the complete 10-layer test suite. Test infra relies on `docker-compose.test.yml`.
- **Database**: `pnpm db:migrate` and `pnpm db:seed`.

## Entry Points and Data Stores
- **Entry Points**: 
  - `apps/api/src/index.ts` (API backend)
  - `apps/web/src/app/layout.tsx` (Web frontend)
- **Data Stores**: 
  - PostgreSQL (Drizzle schema in `packages/db/src/schema/`)
  - MongoDB (referenced as `providerRequiresMongo` in API startup)
  - Redis (caching and queues)
  - Meilisearch (document search)

## Gaps
- Detailed component-level structure inside `apps/web/` was not fully explored.
- The precise structure of the schemas inside `packages/db/src/schema/` (e.g., `hr.ts`, `tickets.ts`) was not individually analyzed.
- Implementation details of `apps/mobile/` and `apps/worker/` were inferred entirely from `README.md` and directory names as those files were not opened.
