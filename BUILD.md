# BUILD.md — CoheronConnect (NexusOps) current-state map

End-to-end view of what the platform actually **is** and **covers**, as of `main`
(migrations at `0038_chief_ultimates`). This is a *current-state* document — it describes
what is wired and running, not the roadmap. For the gap analysis (shipped vs. market
leaders) and the roadmap, see `CLAUDE.md` and `docs/`.

**CoheronConnect** is a multi-tenant Enterprise Operations Platform (ERP/ITSM/GRC/India-compliance
suite). Production: `connect.coheron.tech`. Repo: `github.com/Recon-X2025/NexusOps.git`.

Monorepo: **pnpm@10.33.0 + Turborepo** (`turbo ^2.0.0`), Node `>=20`.

---

## 1. Apps (`apps/*`)

| App | Stack | Port | Build | Role |
|-----|-------|------|-------|------|
| **web** | Next.js **16.2.2** (webpack) + React 19 | 3000 | `next build` | Primary tenant-facing frontend. tRPC client, Radix UI, TipTap editor, ReactFlow (workflow builder), Recharts. |
| **api** | Fastify 5 + tRPC 11 | 3001 | tsup → `dist/` | Backend: the bulk of business logic, all tRPC routers, HTTP webhooks, BullMQ queues, PDF generation. |
| **worker** | Temporal 1.11 | — | tsup (CJS, node18) | Durable background workflows on task queue `coheronconnect-workflow` (DAG engine + DPDP sweep schedule). |
| **mac** | Next.js **15.2** + React 19 | 3004 | `next build` | **Super-admin / platform-monitoring console** (cross-tenant). Talks to `/api/super-admin/*`. |
| **mobile** | React Native 0.74 + Expo 51 | — | Expo | Secondary mobile surface. |
| **docs** | Next.js 15 + Nextra 3 | 3003 | `next build` | Documentation site. |

## 2. Packages (`packages/*`) — 8 total

| Package | Build | Consumed via | Purpose |
|---------|-------|--------------|---------|
| **db** | tsup → `dist/` | compiled `dist/` | Drizzle ORM schema (46 schema modules) + migrations (PostgreSQL). Also carries a `mongodb` dep. **Must be built before `apps/api` typechecks see schema changes.** |
| **payroll-math** | tsup → `dist/` | compiled `dist/` | Pure India payroll/tax/GST money-math (zero runtime deps). Consumed by `db` **and** `api`. |
| **types** | — | source | Shared TypeScript types. |
| **validators** | none (ships TS source) | `./src/*` | Shared Zod schemas (crm / accounting / hr) — single source of truth for validation across API + web. |
| **ui** | — | source | Radix + React 19 component library. |
| **metrics** | — | source | Metrics/telemetry helpers. |
| **config** | — | source | Shared eslint / prettier / tsconfig. |
| **cli** | — | bin `coheronconnect` | Commander-based CLI. |

> Note: `packages/auth` referenced historically has been folded — auth lives in `packages/db/src/schema/auth.ts`
> (schema) + `apps/api` (logic). The active package list is the 8 above.

---

## 3. API surface (`apps/api`)

### 3.1 tRPC routers
Root router `apps/api/src/routers/index.ts` composes **40+ feature routers**, spanning:

- **Auth / tenancy**: `auth` (login, session, MFA enroll/verify, `updateProfile`), `rbac`, `org`, `invites`.
- **People**: `hr`, `employees`, `payroll`, `recruitment`, `performance`, `onboarding`, `leave`, `expenses`.
- **Finance**: `accounting` (journal debit=credit enforced), `financial`, `procurement`, `invoices`, `catalog`.
- **ITSM**: `tickets`, `changes`, `problems`, `releases`, `assets`, `cmdb`, `oncall`, `events` (ITOM), `devops`.
- **CRM/CSM**: `crm`, `csm`, `portal`, `surveys`.
- **GRC / compliance**: `grc`, `risks`, `controls`, `audit`, `contracts`, `documents`, `esign`,
  `compliance` (DPDP DSR + consent), `india-compliance` (MCA/TDS/ECR), `secretarial`, `issuer-programme`.
- **Security**: `security` (incidents, vulnerabilities, vuln-SLA summary).
- **Platform**: `workflows`, `businessRules`, `customFields`, `notifications`, `integrations`, `knowledge`,
  `adminSettings`, `facilities`, `projects`, `workOrders`, `assignment`, `apm`, `agent`.

### 3.2 RBAC procedure stack (`apps/api/src/lib/trpc.ts`)
- `publicProcedure` — unauthenticated.
- `macProcedure` — `MAC_JWT_SECRET`, role `mac_operator`, gated by `MAC_ENABLED` (super-admin console).
- `protectedProcedure` — auth + tamper-evident audit + retry.
- `permissionProcedure(module, action)` — RBAC permission check.
- `adminProcedure` — org admin.
- `mfaGate` / `stepUpGate` — MFA + step-up enforcement.

### 3.3 HTTP routes (non-tRPC, `apps/api/src/index.ts` + `src/http/*`)
- `GET /health` — liveness.
- `ALL /trpc/*` — tRPC handler.
- `POST /internal/dpdp/sweep` — internal DPDP consent-expiry / breach / DSR sweep (called by the Temporal worker).
- `/api/super-admin/*` — cross-tenant super-admin CRUD (`src/http/super-admin.ts`, JWT-gated: `mac_operator`).
- Inbound webhooks — eMudhra (e-sign), AiSensy/WhatsApp, Razorpay (payments).
- PDF surfaces — payslip, Form-16.
- Public survey submission surface.

### 3.4 DPDP data-protection layer (government-ID minimisation + retention)
Live across the write paths that capture government identifiers and statutory financial records:

- **Peppered-HMAC minimisation** — Aadhaar/PAN are stored as `HMAC-SHA256(value, PII_HASH_PEPPER)` plus a
  masked display (`XXXX-XXXX-1234` / `XXXXXX1234`), never raw. Raw **Aadhaar is dropped** entirely; raw
  **PAN is retained only where filing needs it**, alongside the hash + masked display. Helpers:
  `lib/pii-hash.ts` (`peppatedHash`, `assertPiiHashConfigured`), `lib/aadhaar.ts`, `lib/pan.ts`
  (`panColumns()` / `aadhaarColumns()`). Wired into: `secretarial` (director KYC + share-capital PAN),
  `procurement` (vendor PAN), `http/super-admin` (org India PAN), `india-compliance`, `onboarding`, `hr`,
  `ingest` (vendor import, malformed-PAN fallback keeps raw only).
- **Boot guard (fail-fast)** — `apps/api/src/index.ts` calls `assertPiiHashConfigured()` at startup and
  `process.exit(1)` if **`PII_HASH_PEPPER`** is unset. Treated as a mini-KMS secret: a missing pepper stops
  the deploy rather than letting the first PII write throw at runtime. **The pepper is permanent — rotating
  it after PII is written breaks hash matching.**
- **Retention floor** — an 8-year statutory `retainUntilDate` is stamped at create on invoices
  (`financial.ts`), journal entries (`accounting.ts`, `lib/invoice-journal.ts`), and payslips
  (`payroll.ts`, anchored to `paidAt`). Constant + helper in `lib/retention.ts` (`computeRetainUntil`).
- **DSR erasure executor** — `lib/dpdp-erasure.ts`: a conservative, retention-aware `ERASURE_MAP`
  executor, **flag-gated off** (`DPDP_ERASURE_ENABLED !== "true"`). Ships dry-run only; no destructive
  erasure runs until deliberately enabled after legal sign-off.

---

## 4. Automation infrastructure

Two independent engines run the "close the loop" work:

### 4.1 BullMQ (`apps/api/src/services/workflow.ts`) — 12 queues
Booted once via `initWorkflowService(db)`; each connects to Redis (`REDIS_URL`). All closed on shutdown.

| Queue | Cadence | Does |
|-------|---------|------|
| `coheronconnect-approvals` | on-enqueue | Post-decision notifications + audit. |
| `coheronconnect-sla` | 60s sweep + per-ticket delayed jobs | Ticket SLA breach detection. |
| `coheronconnect-doc-virusscan` | on-enqueue | ClamAV INSTREAM scan of uploads. |
| `coheronconnect-doc-retention` | daily 02:00 IST cron | Hard-delete soft-deleted docs past retention (respects legal hold). |
| `coheronconnect-irn-generation` | on-enqueue | E-invoice IRN via ClearTax GST. |
| `coheronconnect-ticket-embedding` | on-enqueue | 256-D hashing embeddings for ticket search. |
| `coheronconnect-notification-dispatch` | on-enqueue | External fan-out — **Slack wired**; SMS not. |
| `coheronconnect-workflow-trigger` | 60s sweep | Evaluate scheduled workflow triggers, run action nodes. |
| `coheronconnect-webhook-dispatch` | 30s sweep | Outbound webhooks, HMAC-SHA256 signed, 6 retries w/ backoff. |
| `coheronconnect-escalation` | 60s sweep | On-call escalation chain walking. |
| `coheronconnect-correlation` | 60s sweep | ITOM event suppression + correlation. |
| `coheronconnect-vuln-sla` | 60s sweep (2 jobs) | Vulnerability SLA breach flip + tiered escalation. |

Workflow implementations live in `apps/api/src/workflows/*.ts` (one file per loop) with shared
`activities.ts` (`notifyActivity`, `writeWorkflowAuditLog`). Sweeps claim rows with
`FOR UPDATE SKIP LOCKED` + `LIMIT` and are idempotent (advance-only).

### 4.2 Temporal (`apps/worker`) — task queue `coheronconnect-workflow`
- **`nexusWorkflow`** — DAG execution engine: WAIT / CONDITION / ASSIGN / NOTIFY / UPDATE_FIELD / WEBHOOK
  nodes, BFS from the TRIGGER node.
- **`dpdpSweepWorkflow`** — DPDP consent-expiry + breach + DSR dispatch. Runs on a Temporal Schedule
  (`dpdp-sweep-schedule`, default `1h`, overlap=SKIP) that POSTs to the API's `/internal/dpdp/sweep`.
  **Prod caveat:** `apps/worker` (and Temporal) are **not** deployed on Vultr — CI publishes only web+api
  images and the Vultr compose has no `worker`/`temporal` service — so this schedule never registers in
  prod. The endpoint is instead driven by a `dpdp-sweeper` sidecar (`curlimages/curl`) in
  `docker-compose.vultr-test.yml` / `docker-compose.prod.yml`, which POSTs `/internal/dpdp/sweep` every
  `DPDP_SWEEP_INTERVAL_SECONDS` (default 3600s) over the internal Docker network (no token needed — the
  `/internal` guard admits Docker-network callers). Restore the worker to retire the sidecar.

### 4.3 Notification delivery (verified state)
- **In-app**: synchronous write to `notifications` (`apps/api/src/lib/notifications.ts`).
- **Email**: best-effort SMTP (silent fallback to logs).
- **Slack**: async BullMQ → `slackAdapter.send()` (resolves + decrypts connected `integrations` config).
- **SMS (MSG91)**: adapter exists (`services/integrations/sms-msg91.ts`, full DLT-compliant `send()`)
  **but is not wired** — `notification-dispatch` only enumerates the `slack` channel. SMS delivery is a stub.

---

## 5. Data layer (`packages/db`)

- **ORM**: Drizzle `drizzle-orm ^0.36`, `drizzle-kit ^0.28`. PostgreSQL primary; a `mongodb ^6.12` dep
  is present (no schema module references it — carried for integration/worker use).
- **Schema**: 46 modules under `packages/db/src/schema/`, all exported from `schema/index.ts`. Domains:
  auth/tenancy, HR/people, finance/accounting, procurement, CRM/CSM, ITSM (tickets/changes/assets/CMDB/
  events/devops/oncall), GRC/compliance, India-compliance, security/vuln, contracts, documents/DMS,
  workflows/business-rules, integrations, and the cross-tenant `superAdminAuditLogs` (`schema/audit.ts`).
- **Tamper-evident audit** (`schema/auth.ts:285-318`): `auditLogs` with a **hash chain**
  (`seq` per-org monotonic, `prevHash`, `entryHash = SHA-256(payload + prevHash)`, unique on `(orgId, seq)`).
  Verified via `verifyAuditChain`. **This is implemented, not a to-do.**
- **Vulnerability SLA** (`schema/security.ts`): `vulnerabilities.slaBreached` + `escalationLevel` columns,
  and a `vulnerabilitySlaEvents` audit table (breach/escalation history). Driven by the vuln-SLA BullMQ loop.
- **FK `onDelete` policy** (repo-wide): `orgId → organizations` and child→parent = **CASCADE**; nullable
  actor = **SET NULL**; NOT NULL actor / lookup = **RESTRICT**.
- **Migrations**: `0000` … **`0038_chief_ultimates`** (journal `drizzle/meta/_journal.json`).
  `0032_damp_la_nuit` consolidated `mfa_enrollments`, `vulnerability_sla_events` (+ vuln SLA columns), and
  `dpdp_notification_artifacts` (+ DPDP regime/erasure columns). `0035_light_hobgoblin` (team) is followed by
  the DPDP data-protection set **`0036`–`0038`**: government-ID hash/masked-display columns + retention
  floor columns, then the **irreversible raw-Aadhaar column drop**. Drizzle diffs against its **own
  snapshot**, not the live DB.
- **Seeds**: `db:seed`, `db:seed:modules`, `db:seed:smb`. The 100-employee/24-month `coheron-demo`
  generator has been **removed** (`seed-demo.ts` does not exist).

---

## 6. Super-admin console (recently merged)

Cross-tenant platform-monitoring role, delivered by the `merge/team-super-admin` branch:
- **UI**: `apps/mac` (Next.js 15, port 3004).
- **API**: `apps/api/src/http/super-admin.ts` — Fastify plugin at `/api/super-admin`, JWT-gated on
  `MAC_JWT_SECRET` + `role === "mac_operator"`; joins org + GSTIN + CIN.
- **Audit**: `superAdminAuditLogs` (`schema/audit.ts`) — actorEmail, orgId (CASCADE), action, before/after JSON.
- **Org profile expansion** (`schema/auth.ts`, their `0031`): industry, company size, PAN, TAN, EPF code,
  primary state code, SLA P1–P4 hours, support email, website.

---

## 7. Build / test / run

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev (all) | `pnpm dev` (turbo, concurrency 16) |
| Build all | `pnpm build` |
| Build db only (before api typecheck) | `pnpm --filter @coheronconnect/db build` |
| Lint | `pnpm lint` |
| Full test suite | `pnpm test` (turbo) |
| E2E (Playwright) | `pnpm test:e2e` |
| Test DB up / down / reset | `pnpm docker:test:up` / `:down` / `:reset` |
| Migration journal check | `pnpm check:migrations` |
| DB generate / migrate / studio | (in `packages/db`) `pnpm db:generate` / `db:migrate` / `db:studio` |

**Test environment (verified):** tests run against a **real Postgres in Docker**, DB
`coheronconnect_test` on **port 5433** (the local dev DB is on **5434**). vitest config
(`apps/api/vitest.config.ts`) uses `fileParallelism: false`, `pool: 'forks'`, `singleFork: true`,
shared DB — tests must self-isolate (fresh org per test). `@vitest/coverage-v8` is pinned to the
installed `vitest` minor (`2.1.9`).

The API test suite includes architectural guardrail layers (`apps/api/src/__tests__/layer1*…layer9*`),
deletion-cascade FK tests, and money-invariant tests (journal, payroll, GST, TDS, 3-way match).

---

## 8. Deploy

- **Deploy Vultr**: auto-deploy on push to `main` (`ci.yml` `deploy` job) + manual `deploy-vultr.yml`
  `workflow_dispatch`; both rsync + `scripts/push-to-vultr.sh` → `scripts/vultr-remote-deploy.sh` on the host.
- **Prod topology** (`docker-compose.vultr-test.yml` + `docker-compose.vultr.images.yml`, Caddy TLS): the
  api container runs **`node dist/migrate.mjs && node dist/index.mjs`** — migrations apply first (standalone,
  no boot guard), then the api boots. There is **no separate `migrator` container** in the Vultr compose
  (that exists only in `docker-compose.prod.yml`). Consequence: a failed api start still leaves migrations applied.
- **Required prod secret**: **`PII_HASH_PEPPER`** must be present or the api fail-fasts and the deploy aborts
  (`container ...-api-1 is unhealthy`). It is threaded from the `PII_HASH_PEPPER` **GitHub secret** →
  deploy step → SSH → `vultr-remote-deploy.sh` → the api service env (`docker-compose.vultr-test.yml`),
  mirroring the GHCR-token passthrough. Also keep it in the host `/opt/coheronconnect/.env.production` for
  manual (non-CI) `docker compose up`. The value is **permanent**.
- **CI** (`ci.yml`): build gated on `[lint, test, e2e]`; on `main`, publishes GHCR images (web + api) then
  deploys the immutable short-SHA tag. The remote script asserts `/health.version` matches the deployed SHA.
- Pushing `main` auto-deploys to Vultr — requires the user's cloud credentials and explicit approval; take a
  snapshot first.

---

## 9. Known real defects (verified, current)

- **SMS delivery is a stub** — MSG91 adapter is complete but not enumerated in the notification-dispatch
  channels; and no `users.phone` exists to address SMS to (only nullable `onboarding_details.phone`).
