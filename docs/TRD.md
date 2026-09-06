# Technical Requirements Document — CoheronConnect

**Repo:** NexusOps · **Product:** CoheronConnect · **Production:** `connect.coheron.tech`
**Last refreshed:** 2026-08-27

> **Reporting discipline.** Counts and behaviors here were read from the codebase on
> the date above; they drift. Where this document states a number (tables, migrations,
> routers) treat it as a snapshot, not a guarantee — the authority is the code and the
> newest [`docs/PLAN-*.md`](.). Known technical gaps are called out in §17 and tracked
> in [`docs/PILOT-READINESS.md`](PILOT-READINESS.md). Product context:
> [`docs/PRD.md`](PRD.md).

---

## 1. Overview

CoheronConnect is a **pnpm + Turborepo monorepo** implementing a multi-tenant SaaS
platform. A Next.js web app talks to a Fastify + tRPC API backed by PostgreSQL (via
Drizzle ORM), with a Temporal/BullMQ worker for durable background work, Redis for
caching/queues, Meilisearch for search, and S3-compatible object storage for documents.
Tenant isolation is enforced at the database row level (PostgreSQL RLS) in addition to
application-layer permission checks.

## 2. Architecture

### 2.1 Monorepo layout

**Apps** (`apps/`):
| App | Stack | Port | Role |
|---|---|---|---|
| `web` | Next.js 16 (App Router) | 3000 | End-user UI (~124 `/app` routes) |
| `api` | Fastify + tRPC + Drizzle (tsup → `dist/`) | 3001 | Business logic, most tests |
| `worker` | Temporal | — | Durable workflows & scheduled jobs |
| `mac` | Managed-account console | 3004 | Operator/support surface |
| `docs` | Docs site | 3003 | Documentation |
| `mobile` | (parked) | — | Not currently shipped |

**Packages** (`packages/`): `db` (Drizzle schema + SQL migrations, consumed via
compiled `dist/`), `metrics` (command-center metric registry, consumed via `dist/`),
`payroll-math` (statutory computations), `types`, `validators`, `config`, `ui`, `cli`.

### 2.2 Request flow

```
Browser (Next 16, App Router)
   │  session cookie + Bearer (set client-side)
   ▼
apps/web  ──proxy /api/trpc──►  apps/api (Fastify + tRPC)
                                   │  permissionProcedure(module, action)  ← RBAC
                                   │  SET LOCAL ROLE app_runtime            ← drops to RLS
                                   ▼
                                PostgreSQL (row-level security by org_id)
   apps/api ──► Redis (cache/queues) · Meilisearch (search) · S3 (documents)
   apps/api ──enqueue──► apps/worker (Temporal) for durable/scheduled work
```

- The web app proxies tRPC to the API via `API_INTERNAL_URL` (server-side). There is
  **no tRPC data transformer**; auth is session-based (cookie + localStorage Bearer).
- The API also exposes **plain Fastify HTTP routes** (e.g. PDF downloads). These
  **bypass the RLS tenant helper** and must apply the org filter in application code.

## 3. Tech stack

- **Language/runtime:** TypeScript, Node ≥ 20, `pnpm@10.33`.
- **Web:** Next.js 16 (App Router), React.
- **API:** Fastify, tRPC, Zod input validation.
- **ORM/DB:** Drizzle ORM, PostgreSQL. `packages/db` compiled to `dist/` and consumed
  as a built artifact — rebuild after schema edits.
- **Background:** Temporal (durable workflows) + BullMQ (lighter queues) on Redis.
- **Search:** Meilisearch.
- **Storage:** S3-compatible (client hardened for Vultr/Ceph — see §11).
- **PDF:** PDFKit (server-side, standard-14 WinAnsi fonts, ASCII-only).
- **Crypto:** KMS envelope encryption for PII.

## 4. Data model & persistence

- **~239 tables** across `packages/db/src/schema/*`, **~105 migrations** in
  `packages/db/drizzle`. The migration head is the last entry in
  `drizzle/meta/_journal.json` — never trust a head quoted in prose.
- **Every tenant table carries `org_id`.** Tables without `org_id` are the class where
  isolation leaks live and must be reasoned about explicitly (§5).
- **Migrations discipline (from `CLAUDE.md`):**
  - Drizzle diffs against **its own snapshot**, not the live DB; a silently failed
    migration cannot self-heal — hand-write a corrective migration + journal entry +
    snapshot.
  - RLS is **not modeled by Drizzle** — `CREATE POLICY` / `ENABLE|FORCE ROW LEVEL
    SECURITY` are hand-appended to generated SQL. A new tenant table ships `org_id`
    **and** its RLS policy in the same migration.
  - Per-row column values need a hand-written backfill; a backfill's twin is the
    **seed** (every fresh DB must get the same shape).
  - Unique-index migrations must **detect duplicates and RAISE**, never delete/merge.
- **Consumption:** production self-migrates on API container boot
  (`migrate.mjs && index.mjs`); the `&&` stops the server if a migration fails. The
  **dev DB is not auto-migrated** — confirm it is at head at session start.

## 5. Multi-tenancy & isolation

Isolation is defense-in-depth across three layers:

1. **Application permission layer** — `permissionProcedure(module, action)` gates every
   procedure server-side (client-side RBAC map is advisory only).
2. **Row-level security** — the request path drops to the `app_runtime` role via
   `SET LOCAL ROLE`; RLS policies filter by `app.org_id`. The app DB user would
   otherwise bypass RLS. **RLS fails *open* if `app.org_id` is unset** — so the set
   must be reliable.
3. **Secondary-reference validation** — a handler that validates its parent record but
   then stores a caller-supplied secondary reference (owner, assignee, manager,
   approver) must validate that reference to the caller's org via the single helper
   `assertSameOrg` / `assertSameOrgIfPresent`. NOT_FOUND semantics (no cross-tenant
   existence oracle).

**Isolation verification (built, committed, CI-gated):**
- `scripts/check-cross-tenant-fks.mjs` (`pnpm check:cross-tenant`) is a **read-only**
  (`BEGIN TRANSACTION READ ONLY`) scanner that introspects the FK **catalog**
  (`pg_constraint`, not schema text) and finds rows where a foreign key crosses a tenant
  boundary — the class RLS *accepts* (a child stamped with the caller's own `org_id`
  pointing at another tenant's parent). It checks the **direct** shape (both sides carry
  `org_id`), a **bridge/two-hop** shape (a no-`org_id` child with ≥2 org-resolved
  parents), and an explicit **refless** list for org-scoped references that carry no FK
  constraint (e.g. `employees.manager_id`). It bakes in an **inverse control** (rows
  where org_ids *agree*, which must be non-zero) and exits **2** if the control matches
  nothing — a broken scan reports itself rather than a false clean. Exit **0** clean,
  **1** cross-tenant rows found. Wired into CI (`ci.yml`).

## 6. Security

- **Auth:** session-based (cookie `coheronconnect_session` + Bearer). Login is
  client-side wired.
- **RBAC:** `permissionProcedure(module, action)`; a missing entry in the generated
  RBAC map falls back to *permissive but client-side only* — the server still enforces
  `permissionProcedure`. `canAccess(module)` ≠ `can(module, action)` for custom
  permissions. `hr:read` is held by every employee (`requester` role grants it) — the
  real HR test is `hr:write`.
- **Ownership:** one helper, `assertSelfOrPermitted(ctx, employeeId, grants[])`; where a
  user may *see* but not *act on* their own figures, the acting procedure simply does
  not call it.
- **PII / DPDP:** PAN, bank account, Aadhaar stored **encrypted** via KMS envelope
  (`services/kms.ts`, `kek()` reads `APP_SECRET` per call) with masked display +
  peppered match-hash for de-dup. Column ordering matters — the bank-account encryption
  spread must stay **last** or plaintext is stored while tests still pass.
- **Audit:** append-only audit logs (`org_id`, monotonically sequenced); managed-account
  operations audited via middleware; impersonation is a **real, short-lived, marked**
  session (refuses non-active targets), not a role swap.
- **MFA / KMS / RLS** are part of the security posture; a green `/api/health` proves
  **nothing** about encryption readiness (the local KMS provider only stores a key id).

## 7. India domain engines

Statutory correctness is code, with documented invariants (`CLAUDE.md`) and
money-invariant tests:

- **Payroll cycle** (`lib/payroll-cycle.ts`): `netPay = max(0, gross − deductions)`;
  period dates default to **period start**.
- **PF/ESI/PT/gratuity** (`packages/payroll-math`): PF/ESI/gratuity/leave-encashment
  read Basic+DA; VPF employee-side only (12%+VPF ≤ 100% of wage base); Para 26(6)
  uncaps only with an EPFO approval reference; ₹15,000 ceiling on the wage base +
  EPS/EDLI.
- **EPFO ECR** (`buildEcrLine()`): the **only** member-line builder; the reported wage
  is the wage the contribution was computed on (reads persisted `payslips.pf_wage_base`).
- **GST** (`lib/india/gst-engine.ts`): intra-state = CGST+SGST (50/50), inter-state =
  IGST; party states derived from GSTIN and normalized to codes before compare.
- **Income tax / TDS** (`lib/india-tax-engine.ts`): `computeTax()`.
- **Accounting** (`routers/accounting.ts`): journal debits = credits (tolerance 0.001).
- **3-way match** (`lib/invoice-po-match.ts`): invoice ≈ PO ≈ GRN within tolerance.
- **Form 16** (`lib/india/form16-aggregator.ts`): Part B computation incl. HRA
  s.10(13A) exemption via the canonical `computeHRAExemption` (basic-annual basis,
  matching the payslip). Part A (TRACES) is a GAP (§17).

## 8. Background processing

- **Temporal** hosts durable workflows and scheduled jobs (e.g. SLA breach detection,
  offboarding-on-date access revocation). `apps/worker` runs the worker; `apps/api`
  enqueues.
- **BullMQ** (on Redis) handles lighter queues within the API.
- Jobs must be **idempotent on the durable fact**, never on a mutable status.

## 9. Search

- **Meilisearch** provides search. The API reads `MEILISEARCH_URL`; a misconfigured env
  key can flip health from ready to degraded (fixed 2026-08-26).
- **Header module search** matches navigable modules (built).
- **GAP:** the **record index is never populated** — the index-write path
  (`indexDocument` in `services/search.ts`) is defined but not called anywhere, so
  entity/record search returns nothing. Pre-pilot P0 (§17).

## 10. Document generation

- **One mechanism:** PDFKit, server-side, returning a `Buffer`, served by a Fastify
  route + same-origin Next proxy. Do not introduce a second.
- **ASCII-only** ("Rs.", never "₹"; standard-14 fonts are WinAnsi). A source scan test
  (`pdf-rupee-glyph.test.ts`) enforces this, comments included.
- **Printed totals are stored totals** — a document renders what the engine wrote; it
  never re-computes tax. Presentation breakups are reconciled against the stored
  aggregate and dropped if off by a paisa.
- **Refuse rather than mislead:** unknown buyer state, missing supplier GSTIN / place of
  supply, no line items, or a payable → **409 naming the field to fix**. A tax invoice
  is issued only for `invoice_flow = "receivable"`.
- Documents: payslip, tax invoice, quotation, Form 16 (`services/*-pdf.ts`).

## 11. Integrations & storage

- **Integration providers** (`services/integrations/`, ~13, India-focused):
  ClearTax GST, EPFO ECR, ESIC return, NIC e-way bill, PT challan, MCA21,
  Razorpay, Google Workspace, Microsoft 365, Slack, MSG91 SMS, WhatsApp (AiSensy),
  via a provider `registry`.
- **Object storage** (`services/storage.ts`): S3-compatible. The client is hardened for
  **Vultr/Ceph** — checksum calculation/validation set to `WHEN_REQUIRED` and SSE-S3 /
  `ChecksumSHA256` conditionally omitted, gated on a custom `S3_ENDPOINT`. **Graceful
  degradation** ships: `isStorageConfigured()` guards uploads so the app runs without
  storage. **GAP:** storage not yet enabled in production (bucket + creds + encryption
  decision pending — pre-pilot P0 "go").

## 12. APIs

- **tRPC** is the primary API surface (per-router procedures, Zod inputs,
  permission-gated). ~57 routers.
- **Fastify HTTP routes** serve non-tRPC needs (PDF downloads, health, webhooks). These
  **do not** get the RLS tenant helper automatically — apply the org filter explicitly.
- **Deprecated twins:** some procedures have a canonical and a flat deprecated form; a
  guard must be applied to **both** (or extracted into a shared helper) — a guard on one
  leaves the defect reachable via the other, and frozen zod inputs silently strip newer
  fields. Guarded by `crm-deprecated-mutation-sweep.test.ts`.

## 13. Frontend

- **Next.js 16 App Router**, ~124 `/app` page routes. Command-palette module search;
  command-center dashboards with period-windowed metrics, sample-size floors, honest
  empty/error states, and verified drill-through targets (reworked 2026-08-25).
- Deleting a route leaves `.next/types/validator.ts` importing it — rebuild to clear
  (gitignored, so CI never sees the stale artifact).

## 14. Build, CI/CD & deployment

- **Build:** `pnpm build` (Turborepo). The pre-merge gate is `pnpm lint:cold`
  (`turbo run lint --force`) — a warm cache runs no typecheck. `packages/db` and
  `apps/api` must be rebuilt before `apps/web` typechecks against new procedure types.
- **CI (`.github/workflows/ci.yml`):** Lint → Test → E2E → Build → **Deploy to Vultr**.
  Extra gates run in the test job: metric drill-through links, notification links, and
  the **cross-tenant FK scan**. "What is live" = the terminal `Deploy to Vultr` job of
  the latest `main` run, not CI success alone.
- **Deploy:** a push to `main` deploys. Migrations auto-apply on the API container
  (`migrate.mjs && index.mjs`). Live compose files are
  `docker-compose.vultr-test.yml` + `.vultr.images.yml`. Always snapshot before
  deploying (owner-only — requires cloud credentials).

## 15. Testing strategy

- **Unit/integration:** vitest against **real Postgres** (test DB on 5433,
  `pnpm docker:test:up`). `fileParallelism: false`, `singleFork`; tests must
  self-isolate. Never run vitest concurrently with E2E (shared Postgres). Most business
  logic and tests live in `apps/api`.
- **E2E:** Playwright; `globalSetup` uses `db:migrate` + seed. Isolation traps
  (`reuseExistingServer`, `API_INTERNAL_URL`, `testIgnore`) are documented in
  `CLAUDE.md` — the web app must be pointed at the test API or isolation is fiction.
- **Custom gates (scripts run in CI):** `check:cross-tenant`, `check:migrations`,
  `check:metric-links`, `check:notification-links`, coverage floor.
- **Scale the gate to the change:** full E2E is 30–50 min, the api suite ~20; run once
  at the end after every known-breaking fix.

## 16. Non-functional requirements

- **Isolation:** a cross-tenant leak is a P0 correctness defect; verified by the CI scan
  and (before pilot) a production scan.
- **Correctness:** statutory-money invariants asserted in tests (§7).
- **Availability:** production self-migrates on boot; a failed migration stops the
  server rather than serving a half-migrated schema.
- **Observability:** health endpoints must reflect real readiness (encryption, search),
  not just process liveness.
- **Identifiers:** unique per org, atomically allocated from `org_counters` — never
  `Math.random()`, `count(*)+1`, or a UUID substring.

## 17. Known technical gaps

Tracked and prioritized in [`docs/PILOT-READINESS.md`](PILOT-READINESS.md):

| Gap | Area | Priority |
|---|---|---|
| Record search index never populated (`indexDocument` uncalled) | Search | Pre-pilot P0 |
| Object storage not enabled in prod (client ready, degradation ships) | Storage | Pre-pilot P0 "go" |
| Admin/config surfaces (SLA, categories, PT slabs, leave-exit) API-only | Config | Pre-pilot P0 |
| Critical-workflow edge cases (procure-to-pay, leave, payroll→statutory, lead-to-cash) | Workflows | Pre-pilot P0 |
| Compliance-matrix seeds `implemented` over unbuilt tables (false claim) | Compliance | Pre-pilot P1 (pulled forward) |
| Approval architecture: two parallel systems; generic `decide` transitions nothing; chains routing to nobody | Approvals | Pre-pilot P0 *if* in scope |
| Per-document ACL enforcement thin | Documents | Pre-pilot P0 *if* per-doc access |
| Billing/paywall not enforced (open signup; plan = flags only) | Commercial | Pre-pilot P0 *if* charging |
| Tier-3 secretarial/statutory registers are table shells (no write paths) | Compliance | P1 build (XL) |
| Contract lifecycle (clause templates, driven approvals) partial | Contracts | P1 |
| Form 16 Part A (TRACES challan download) | Payroll | P1 (external dep) |

**Latent-defect note:** a false compliance claim is a liability under the "never ship a
false claim" rule — the compliance-matrix truth-fix is done *before* the Tier-3 build,
even though the build itself is post-pilot.

## 18. Environments & configuration

- **Ports:** web 3000, api 3001, docs 3003, mac 3004. Postgres dev **5434**, test
  **5433**. Meilisearch dev 7700, test 7701.
- **Key env:** `DATABASE_URL`, `REDIS_URL`, `MEILISEARCH_URL`, `S3_ENDPOINT` +
  credentials, `APP_SECRET` (KMS KEK), `AUTH_SECRET`, `API_INTERNAL_URL`.
- `apps/api/src/index.ts` calls `loadEnv({ path: "../../.env" })` — so `env -u VAR` is
  undone by dotenv; suspect the harness, not the guard, when a boot guard "looks inert".
- **Database provider modes:** default `postgres`; `packages/db` also carries a MongoDB
  client wired into API startup/shutdown/request-context for `hybrid`/`mongo` modes —
  dormant under `postgres`, but removing it breaks the API build.

## 19. References

- [`CLAUDE.md`](../CLAUDE.md) — operating rules, invariants, and traps (authoritative).
- [`docs/PRD.md`](PRD.md) — product requirements.
- [`docs/PILOT-READINESS.md`](PILOT-READINESS.md) — prioritized gap backlog.
- Newest `docs/PLAN-*.md` — current tactical state & run log.
- [`README.md`](../README.md) — repo overview.
