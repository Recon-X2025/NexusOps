# Work orders — staging runbook (Seq 2)

**Companion:** `docs/ITSM_STAGING_RUNBOOK.md`.

---

## 1. Prerequisites

- Postgres migrated; org with **admin** + **ITIL** users for RBAC spot-checks.
- Optional: **assignment rules** seeded so unassigned `create` auto-routes to a queue.

---

## 2. Smoke checklist

1. **`/app/work-orders`** — list loads (`e2e/work-orders.spec.ts`).
2. **`/app/work-orders/parts`** — parts/inventory spine loads (Seq 22 traceability).
3. Create WO → add task → progress state → complete; verify **activity** tab in UI when present.

---

## 3. ENV

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Required. |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 2 C3 |
