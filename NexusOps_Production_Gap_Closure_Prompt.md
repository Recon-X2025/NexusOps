# NexusOps — Production Gap Closure Prompt (v2.5 → v3.0)

**Issued:** 2026-03-25  
**Status:** In Execution

---

## Objective

Close the 5 final production gaps in NexusOps v2.5 without breaking existing functionality.

| Gap | Step | Status |
|-----|------|--------|
| E2E Test Execution (Playwright Layer 10) | Step 1 | ✅ Complete |
| Durable Workflow Engine (BullMQ) | Step 2 | ✅ Complete |
| AI Backend (Ticket Summarization + Resolution) | Step 3 | ✅ Complete |
| SSO / OIDC | Step 4 | ✅ Complete |
| Helm + OpenTelemetry Observability | Step 5 | ✅ Complete |

---

## Rules

- DO NOT modify existing working APIs unless absolutely required
- DO NOT break RBAC, multi-tenancy, or audit logging
- DO NOT introduce mock logic
- ALL changes must be production-grade, typed, and consistent with existing architecture
- Reuse existing patterns (tRPC routers, middleware, services, RBAC helpers)

---

## Step 1 — E2E Test Execution

- Verify `playwright.config.ts` webServer + globalSetup
- Implement: `auth.spec.ts`, `tickets.spec.ts`, `approvals.spec.ts`, `rbac.spec.ts`
- Add `data-testid` selectors to critical UI elements
- Add `"test:e2e:ci": "playwright test --reporter=line"` to root `package.json`

## Step 2 — Workflow Engine

- Install Temporal Node SDK
- Create `apps/api/src/workflows/approvalWorkflow.ts`
- Create `apps/api/src/workflows/ticketLifecycleWorkflow.ts`
- Create `apps/api/src/workflows/activities.ts`
- Create `apps/api/src/services/workflow.ts`
- Wire `approvals.decide` and `tickets.create` routers

## Step 3 — AI Backend

- Create `apps/api/src/services/ai.ts`
- Implement `summarizeTicket()` and `suggestResolution()`
- Add `ai.summarizeTicket` and `ai.suggestResolution` tRPC procedures
- Wire into ticket detail UI

## Step 4 — SSO / OIDC

- Install `openid-client`
- Create OIDC callback route in API
- Extend `users` table: `external_id`, `provider`
- Create session from OIDC token (reuse existing session middleware)
- ENV vars: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER`

## Step 5 — Infrastructure + Observability

- Create `infra/helm/` Deployment + Service YAMLs (api, web, postgres, redis)
- Create `apps/api/src/services/observability.ts` (OpenTelemetry SDK)
- Trace tRPC requests + DB queries → OTLP export
- Verify `GET /health` and `GET /ready` return DB + Redis + Search status
