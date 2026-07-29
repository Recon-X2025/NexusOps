# Coheron Connect Platform Specification & Details

> [!NOTE]
> This document supersedes all prior per-feature integration specifications. All assertions contained herein are derived directly from the active repository source files.

---

## 1. Platform Overview

Coheron Connect is an enterprise-grade workflow orchestration platform providing ITSM, asset management, HR service delivery, procurement, and accounting modules. The platform is designed as a modular monorepo orchestrated via `pnpm` workspaces (configured in [pnpm-workspace.yaml](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/pnpm-workspace.yaml#L1-L4)) and `turbo` (configured in [turbo.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/turbo.json)).

---

## 2. Repo Inventory & Package Mapping

### Applications (`apps/`)

| Application | Technology Stack | Purpose / Domain | Location |
| :--- | :--- | :--- | :--- |
| **Fastify API Server** | Fastify v5, tRPC v11, TypeScript | Primary backend API, REST webhooks, PDF engines, and tRPC procedure routers. | [apps/api](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api) |
| **Next.js Web Portal** | Next.js v16.2.2, React v19.0.0, TailwindCSS, Radix UI | Primary customer enterprise dashboard. | [apps/web](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web) |
| **Next.js MAC** | Next.js v15.2.0, React v19.0.0 | Managed Account Console for system operators and super-admins. | [apps/mac](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac) |
| **Mobile Client** | React Native, Expo v51.0.0, Zustand | Mobile companion app for tickets, leave, and expenses. | [apps/mobile](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile) |
| **Background Worker** | Temporal SDK v1.11.0, BullMQ v5, `pg` | Durable workflow execution, queue workers, and DPDP automated compliance sweeps. | [apps/worker](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker) |
| **Documentation Site** | Nextra v3, Next.js v15.3.4 | Public-facing documentation portal. | [apps/docs](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/docs) |

### Shared Packages (`packages/`)

| Package | Purpose / Domain | Location |
| :--- | :--- | :--- |
| **Drizzle DB** | PostgreSQL client configuration, MongoDB connection pools, Drizzle schemas, and SQL migrations. | [packages/db](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/db) |
| **Operational CLI** | System CLI operations (`coheronconnect`), seeding, and database utilities. | [packages/cli](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/cli) |
| **Shared UI** | Core design system component library built with TailwindCSS and Radix UI. | [packages/ui](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/ui) |
| **Payroll Math** | Statutory deductions (EPF, ESI, PT), India tax brackets, leave accrual models, and depreciation engines. | [packages/payroll-math](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/payroll-math) |
| **Metrics** | OpenTelemetry observability client and custom API performance buffers. | [packages/metrics](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/metrics) |
| **Types** | Shared type definitions and interfaces. | [packages/types](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/types) |
| **Validators** | Centrally enforced Zod validator schemas. | [packages/validators](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/validators) |
| **Config** | Shared ESLint, TSConfig, and build configurations. | [packages/config](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/config) |

### Not Found in Repo
The following platforms or packages were expected/planned but **do not exist** in the repository filesystem:
- **Vite SPA**: No standalone Vite-built single-page applications are present (excluding `vitest` unit test files).
- **Clerk Auth**: No Clerk auth dependencies or integrations exist in code. All references to "clerk" are accounts payable roles in [docs/FINANCE_SOD_MATRIX.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/docs/FINANCE_SOD_MATRIX.md#L7).
- **Resend Email**: No Resend email client or API references exist. Outbound email is handled directly via native SMTP/Nodemailer.
- **APITXT**: No dependencies or config files relate to this service.
- **`packages/auth`**: Though referenced in the monorepo-root test scripts ([package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/package.json#L13)), the directory does not exist in the codebase.

---

## 3. Application Specifications & Architectures

### Fastify API Server (`apps/api`)
- **Purpose**: Exposes REST and tRPC endpoints, processes webhooks, generates PDF documents, and manages long-running jobs.
- **Deployment / Service Mode**: Serves on port `3001` ([index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/index.ts#L30)). Built using `tsup` ([package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/package.json#L16)).
- **Auth Model**:
  - Checks for a `Bearer` token in the `Authorization` header or a session token in the `coheronconnect_session` cookie ([auth.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/middleware/auth.ts#L303-L324)).
  - Resolves active sessions via a 3-tier system: L1 in-process Map cache (5 min TTL), L1.5 request coalescing to resolve thundering herds, and L2 Redis + L3 PostgreSQL lookups ([auth.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/middleware/auth.ts#L392-L427)).
  - API Keys are resolved by hashing the raw key with SHA-256 and querying the `apiKeys` table ([auth.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/middleware/auth.ts#L351-L362)).
  - Managed Account Console (MAC) endpoints are restricted via the `enforceMacOperator` middleware, verifying a JWT carrying `{ role: "mac_operator" }` signed with `MAC_JWT_SECRET` ([trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/lib/trpc.ts#L307-L373)).
- **Entry Points**: 
  - Main Boot: [index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/index.ts)
  - Main Router: [routers/index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/routers/index.ts)
- **Database Architecture**: Connects to Postgres via the `postgres` driver (configured in `@coheronconnect/db`). In `hybrid` or `mongo` provider modes, it also connects to a MongoDB database pool ([index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/index.ts#L172-L195)).

### Next.js Web Frontend (`apps/web`)
- **Purpose**: Primary browser interface for tenant admins and employees.
- **Deployment / Service Mode**: Served on port `3000` ([package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/package.json#L6)).
- **Auth Model**: Retrieves credentials from `localStorage` under `"coheronconnect_session"` and sends them as `Authorization: Bearer <session>` header tokens or passes cookies ([trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/src/lib/trpc.ts#L88-L89)).
- **Entry Points**:
  - App Layout: [app/layout.tsx](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/src/app/layout.tsx)
  - tRPC Setup: [lib/trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/src/lib/trpc.ts)
- **API Communication**: The browser sends all queries to `/api/trpc/*` (same-origin proxy). The proxy router at [route.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/src/app/api/trpc/[...path]/route.ts#L19-L66) intercepts calls, appends authorization/cookie headers, forwards them to the internal Fastify API (`API_INTERNAL_URL`, default: `http://127.0.0.1:3001`), and pipes the response back.

### Next.js MAC (Managed Account Console) (`apps/mac`)
- **Purpose**: A private UI for platform operators to provision organizations, toggle features, view system metrics, and impersonate users.
- **Deployment / Service Mode**: Served on port `3004` ([package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac/package.json#L6)).
- **Auth Model**: Authenticates operators with the short-lived JWT issued during `mac.login` and stored in local storage as `"mac_token"` ([mac-api.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac/src/lib/mac-api.ts#L7-L10)).
- **Entry Points**:
  - Custom API client: [lib/mac-api.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac/src/lib/mac-api.ts)
  - Login Page: [app/(auth)/login/page.tsx](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac/src/app/(auth)/login/page.tsx)
- **API Communication**: Uses a hand-coded, minimal tRPC execution harness (`trpcQuery`/`trpcMutate`) to call Fastify directly at `API_URL` (port 3001) instead of using standard `@trpc/client` links ([mac-api.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac/src/lib/mac-api.ts#L36-L70)).

### React Native / Expo Mobile App (`apps/mobile`)
- **Purpose**: Native mobile interface for ticketing, leave tracking, and expenses.
- **Deployment / Service Mode**: Native compilation via Expo CLI / EAS Build ([package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/package.json#L6-L12)).
- **Auth Model**: Stores the session token in the device's secure enclave via `expo-secure-store` under the key `"coheronconnect_token"` and user info under `"coheronconnect_user"` ([auth-store.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/src/lib/auth-store.ts#L30-L31)). Sends the bearer token on every request ([trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/src/lib/trpc.ts#L23-L26)).
- **Entry Points**:
  - Root Layout: [app/_layout.tsx](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/app/_layout.tsx)
  - API Client: [src/lib/trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/src/lib/trpc.ts)
- **API Communication**: Directly calls the tRPC URL defined in `EXPO_PUBLIC_API_URL` (default fallback: `http://localhost:4000/trpc`, which represents a local configuration mismatch) using `httpBatchLink` ([trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/src/lib/trpc.ts#L20-L28)).

### Background Worker (`apps/worker`)
- **Purpose**: Executes scheduled triggers, SLA timers, and automated compliance tasks.
- **Deployment / Service Mode**: Started via `tsx src/index.ts` (dev) or built standalone and run on node.js (`node dist/index.js`) ([package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker/package.json#L5-L8)).
- **Auth Model**: Relies on `INTERNAL_API_TOKEN` to authenticate requests made to the Fastify API `/internal/*` routes ([dpdp-sweep-activities.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker/src/activities/dpdp-sweep-activities.ts#L30-L33)).
- **Entry Points**:
  - Boot script: [index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker/src/index.ts)
  - SLA/Ticket activities: [activities/workflow-activities.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker/src/activities/workflow-activities.ts)
  - Compliance activities: [activities/dpdp-sweep-activities.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker/src/activities/dpdp-sweep-activities.ts)
- **API & DB Communication**: Connects directly to the PostgreSQL database using a Postgres client connection pool (`new Pool()`) ([index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker/src/index.ts#L10)). Interacts with the API by executing HTTP POST requests against `${INTERNAL_API_URL}/internal/dpdp/sweep` ([dpdp-sweep-activities.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/worker/src/activities/dpdp-sweep-activities.ts#L35-L39)).

### Nextra Docs Site (`apps/docs`)
- **Purpose**: Serves public-facing product documentation.
- **Deployment / Service Mode**: Nextra client bundle served on port `3003` ([package.json](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/docs/package.json#L6)).
- **Auth Model**: None (public routing).
- **Entry Points**:
  - Nextra routing configs.
- **API Communication**: None.

---

## 4. Integration Seams & Architectural Risks

### 1. API Key Prefix Mismatch (`nxk_` vs `nxo_`)
- **Location**: [auth.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/middleware/auth.ts#L351) vs [integrations.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/routers/integrations.ts#L633).
- **The Seam**: The API Key creation handler generates keys prefixed with `nxk_` (e.g. `nxk_<random>`) and displays this to users in the UI ([page.tsx](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/src/app/app/settings/api-keys/page.tsx#L279)). However, the Fastify authentication middleware explicitly filters for API keys starting with `nxo_` (`if (token.startsWith("nxo_"))`).
- **Impact**: Any API key generated by an organization will fail authentication at the middleware layer.

### 2. Unregistered Integrations Catalog Providers
- **Location**: [integrations.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/routers/integrations.ts#L61-L253) vs [registry.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/integrations/registry.ts#L25-L38).
- **The Seam**: The admin UI settings page renders integration cards using the `PROVIDER_CATALOG` defined in the integrations router. This catalog contains `teams` (Microsoft Teams), `email` (SMTP), `jira` (Jira Cloud), and `sap`. However, none of these 4 providers are registered in the active adapter registry (`apps/api/src/services/integrations/registry.ts`).
- **Impact**: Attempting to run `testIntegration` or trigger adapter functions for these providers throws a runtime exception ("No adapter registered").
  - *Note*: `jira` and `sap` bypass the registry for specific sync operations using standalone services ([jira.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/jira.ts) & [sap.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/sap.ts)), but connection testing still fails in the router.

### 3. SMTP Database Configuration is Ignored
- **Location**: [notifications.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/notifications.ts#L36-L45) vs [integrations.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/routers/integrations.ts#L84-L96).
- **The Seam**: Users are prompted to configure and save SMTP details (Host, Port, User, Password) as a database-backed integration named `email`. However, the outbound mailing utility (`getTransporter`) completely ignores this database configuration, reading SMTP settings exclusively from system-level environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
- **Impact**: Database-saved SMTP settings are completely ignored, relying on whatever environment variables were specified at API container startup.

### 4. Unexposed Active Adapters
- **Location**: [registry.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/integrations/registry.ts#L25-L38) vs [integrations.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/routers/integrations.ts#L61-L253).
- **The Seam**: Active, fully implemented adapters for `epfo_ecr` (EPFO return), `esic_return` (ESIC return), `pt_challan` (Professional Tax), `nic_ewaybill` (e-Way Bill), and `mca21` (MCA filings) are registered in `registry.ts`. However, these are missing from the `PROVIDER_CATALOG` in `integrations.ts`.
- **Impact**: These integrations are unconfigurable via the Admin settings UI panel since they are absent from the catalog payload.

### 5. Client Routing & CSP Port Boundaries
- **Location**: [next.config.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/next.config.ts#L22-L33) vs [mac-api.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mac/src/lib/mac-api.ts#L1-L5).
- **The Seam**: The browser frontend for the main Web app (`apps/web`) communicates via the `/api/trpc` proxy, mapping directly to `API_INTERNAL_URL` (port 3001). This allows standard same-origin requests that pass Content Security Policy (`connect-src 'self'`). The MAC app (`apps/mac`), however, communicates directly to the API on port 3001 (`http://localhost:3001` or raw IP).
- **Impact**: In a production environment, if `CORS_ORIGIN` does not explicitly contain the MAC origin or if the MAC CSP does not allow connections to the API's port, browser security controls will drop the requests.

### 6. Mobile Port & Namespace Drift
- **Location**: [trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/src/lib/trpc.ts#L21) vs [auth-store.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/mobile/src/lib/auth-store.ts#L30) vs [trpc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/web/src/lib/trpc.ts#L88).
- **The Seam**:
  - The fallback local endpoint for `apps/mobile` is set to `http://localhost:4000/trpc`, which doesn't match the Fastify API's port (`3001`).
  - The mobile app saves auth session tokens under `"coheronconnect_token"`, while the web app uses `"coheronconnect_session"`.
  - The mobile app directly imports types from the raw source folder (`import type { AppRouter } from "@coheronconnect/api/src/routers"`) instead of consuming the build exports (`@coheronconnect/api`).

### 7. Database Migration Dependencies & Index Conflicts
- **Location**: [00-smoke-crud.spec.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/tests/full-qa/00-smoke-crud.spec.ts#L295-L300) vs [accounting.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/packages/db/src/schema/accounting.ts#L214-L220) vs [SETUP_WIZARD_INTEGRATION.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/SETUP_WIZARD_INTEGRATION.md#L445).
- **The Seam**:
  - Creating a work order (`workOrders.create`) throws an internal server error (500) in production environments because the database is missing the `assignment_rules` table (due to an unrun or omitted migration).
  - There is a known migration conflict between the global unique index `gstin_registry_gstin_idx` on `gstin` and the tenant-scoped unique index `gstin_registry_org_gstin_idx`. The index unique constraint on `gstin` was dropped in the schema code to fix tenant isolation, but remains an active conflict across older migration states.

---

## 5. External Services & Configuration

The platform integrates the following third-party dependencies:

| Service | Category / Purpose | Configuration Location | Required Environment Variables |
| :--- | :--- | :--- | :--- |
| **Temporal.io** | Workflow Engine (SLA timers, escalations) | [index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/index.ts#L48-L51) | `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `NEXUSOPS_WORKFLOW_ENGINE_REQUIRED` |
| **Meilisearch** | Document & Ticket Full-Text Search | [index.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/index.ts#L602-L607) | `MEILISEARCH_HOST`, `MEILISEARCH_KEY` |
| **AWS S3 / MinIO**| File Uploads, PDFs, and attachments | [storage.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/storage.ts) | `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` |
| **Anthropic** | AI copilot, receipt OCR | [ai.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/ai.ts) | `ANTHROPIC_API_KEY` |
| **Razorpay** | Payment links, invoices, GSTR-1 reconciliation | [razorpay.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/integrations/razorpay.ts) | `razorpay` integration fields (`keyId`, `keySecret`, `webhookSecret`) |
| **WhatsApp (AiSensy)** | Ticket status notifications & reminders | [whatsapp-aisensy.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/integrations/whatsapp-aisensy.ts) | `whatsapp_aisensy` integration fields (`apiKey`, `wabaId`, `phoneNumberId`, `webhookSecret`) |
| **SMS (MSG91)** | Transactional alert messages | [sms-msg91.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/integrations/sms-msg91.ts) | `sms_msg91` integration fields (`authKey`, `senderId`, `templateId`) |
| **eMudhra Aadhaar** | India legally binding document e-sign | [emudhra.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/esign/emudhra.ts) | `emudhra` integration fields (`apiKey`, `apiSecret`, `webhookSecret`, `signerId`, `environment`) |
| **DocuSign** | Cross-border document electronic signature | [docusign.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/esign/docusign.ts) | `docusign` integration fields (`accessToken`, `accountId`, `basePath`, `hmacKey`, `environment`) |
| **ClearTax GST** | India GST portal integrations (IRN/e-Invoice) | [cleartax-gst.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/integrations/cleartax-gst.ts) | `cleartax_gst` integration fields (`apiKey`, `apiSecret`, `gstin`, `environment`) |
| **Google OAuth** | Customer SSO login | [oidc.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/services/oidc.ts) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

---

## 6. Known Discrepancies & Unverified Behaviors

- **Unverified Production API URLs**: The production URL/endpoints for the Fastify API remain unverified and are not formally documented in any active environment setups ([SETUP_WIZARD_INTEGRATION.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/SETUP_WIZARD_INTEGRATION.md#L444)).
- **Unverified Onboarding Completeness**: The onboarding wizard at `/app/onboarding-wizard` has no gate or lock. It can be re-run by any administrator at any time, which risks overwriting existing settings without warning ([SETUP_WIZARD_INTEGRATION.md](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/SETUP_WIZARD_INTEGRATION.md#L442)).
- **Super-Admin REST API Test Coverage**: There is no automated test coverage checking the REST routes mounted under `/super-admin/*` in [super-admin.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/http/super-admin.ts), unlike the tRPC tests ([mac-auth.test.ts](file:///c:/Users/jbbas/OneDrive/Desktop/CoheronConnect/apps/api/src/__tests__/mac-auth.test.ts)).
- **Jira & SAP Direct Procedures vs Adapter Pattern**: While registered in the catalogue, Jira and SAP bypass the `IntegrationAdapter` interface in `registry.ts` and use direct script execution methods, making their "Test Connection" button non-functional in the integrations router.
