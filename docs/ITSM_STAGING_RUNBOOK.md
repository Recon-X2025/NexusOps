# ITSM staging & QA environment (DevOps)

Use this runbook so `docs/QA_ITSM_E2E_TEST_PACK.md` cases (especially **ITSM-E2E-016** SLA breach and **ENV-04**) are reproducible.

## 1. Core dependencies

| Service | Purpose | Typical URL |
|---------|---------|-------------|
| **PostgreSQL** | App + migrations | `DATABASE_URL` |
| **Redis** | Idempotency cache + BullMQ SLA queue | `REDIS_URL` |

## 2. Database

```bash
cd packages/db
pnpm db:migrate
pnpm db:seed   # Coheron Demo org + personas (see QA pack §2)
```

**Note:** Re-seeding an **existing** org may skip module data; use a fresh database volume for a full demo dataset.

## 3. API + SLA worker

The ticket SLA breach scheduler uses **BullMQ** (`apps/api/src/workflows/ticketLifecycleWorkflow.ts`).

1. Start the API with `REDIS_URL` and `DATABASE_URL` set.
2. Ensure the process that calls `startSlaWorker` / workflow bootstrap is running in that environment (follow your deployment’s `apps/api` entrypoint).

If Redis or the worker is **not** running, SLA jobs will not fire — mark **ITSM-E2E-016** as **N/A (infra)** and still validate SLA timestamps on create (**ITSM-E2E-015**).

## 4. Web app

```bash
cd apps/web
pnpm dev
```

Set the same API base URL / cookie domain as staging policy requires.

**Employee portal:** list calls use **`ticketScope: "mine"`** on `tickets.list` so requesters never receive other users’ rows over the wire (B5).

## 5. Playwright (G4)

```bash
# From repo root — requires dev server + seeded DB (see e2e/tickets.spec.ts header)
pnpm exec playwright test e2e/tickets.spec.ts
```

## 6. Optional: `sla_policies` verification

Active rows in `sla_policies` (per org) are evaluated on **ticket create** after priority resolution. Conditions (JSON) v1:

- `ticketTypes`: string array — ticket `type` must be listed (if present).
- `categoryIds`: UUID array — ticket `categoryId` must be listed (if present).
- `{}` or missing keys — matches any ticket for that policy row.

Policies are ordered **newest first**; the first match wins for minute overrides. Unmatched fields fall back to **priority** SLA minutes.

## 7. `pending` status category (shipped)

**Current behaviour:** migration **`0013_ticket_status_pending_enum_and_rows`** rebuilds the Postgres enum via a temporary type (adds `pending` safely inside Drizzle’s single-transaction migrate), then inserts one “Pending” `ticket_statuses` row per organisation.

**If a database is stuck mid-migrate** (rare) or predates this migration: restore from backup or repair `drizzle` journal + `__drizzle_migrations` with DBA guidance; do not partially re-run enum DDL.

The API **cancels / reschedules BullMQ SLA jobs** on status change, treats `pending` as “no SLA breach scheduling” (`syncTicketSlaJobs`), and records **`sla_paused_at` / `sla_pause_duration_mins`** on transitions.

**Activity log:** moving into **Pending** writes **`slaPausedAt`** (and on resume, **`slaPauseDurationMins`** plus clearing **`slaPausedAt`**) on the ticket update activity entry so auditors see pause/resume in-app.

**QA:** `e2e/tickets.spec.ts` includes **“pending status — SLA pause appears on activity log”** when a Pending status row exists.

## 8. Catalog fulfilment (A3 smoke)

If your environment uses **service catalog** approvals: submit a catalog request as a requester, approve as a catalog admin where applicable, and confirm a **fulfilment ticket** (or linked incident/request) is created per your `catalog` router behaviour. This is a one-line manual check after code deploy — no extra migration beyond your existing catalog migrations.

## 9. Smoke checklist

- [ ] `GET` health / login page loads  
- [ ] `pnpm db:migrate` clean on staging DB  
- [ ] Seeded users (QA pack §2) can sign in  
- [ ] Create ticket → SLA fields populated  
- [ ] (Optional) SLA breach fires with Redis + worker  

---

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | 2026-04-07 | Initial runbook for ITSM gap program |
| 1.1 | 2026-04-07 | SLA pause activity fields, Playwright pending case, catalog A3 smoke, portal mine-scope note |
