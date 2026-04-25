# Change management — staging runbook (Seq 1)

**Audience:** QA + SRE validating **`changes`** before promote.  
**Companion:** `docs/ITSM_STAGING_RUNBOOK.md`, `docs/STAGING_RUNBOOK_MODULES_ADDENDA.md`.

---

## 1. Prerequisites

- **API** and **web** deployed with same build tag as candidate release.
- **Postgres:** migrations applied (`packages/db`); org with ITIL/admin user for CAB actions.
- **Redis (recommended):** used for **`changes.list`** dashboard widget cache (`limit=3`, no filters) — key pattern `changes:dashboard:{orgId}`, TTL **90s**. If Redis is down, API still serves from DB; expect slightly higher load and no cross-pod cache coherence.

---

## 2. Smoke checklist (manual)

1. Open **`/app/changes`** as admin — list loads, no runtime error.
2. Create a change (UI or tRPC) — **draft**.
3. Submit for CAB — **cab_review**.
4. Approve — **approved**; verify approval row in DB if auditing.
5. Move to **scheduled** → **implementing** → **completed** (or exercise **reject** → **cancelled** in a second record).
6. Create a **blackout window** covering a test interval; run overlap check for a window inside it — expect **overlappingBlackouts** non-empty.

---

## 3. ENV / config

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Org-scoped data. |
| Redis URL (same as app default) | No | Enables dashboard list cache for `changes.list`. |

---

## 4. Rollback / data hygiene

- Org delete in tests orders **`change_approvals`** before **`change_requests`** to satisfy FK to `users` — production uses normal app deletes; bulk org teardown scripts should mirror that order.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 1 C3 runbook |
