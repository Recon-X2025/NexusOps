# Work orders — gap remediation build plan (Seq 2)

**QA pack:** `docs/QA_WORK_ORDERS_ITSM_E2E_TEST_PACK.md`.  
**Staging:** `docs/WORK_ORDERS_STAGING_RUNBOOK.md`.

---

## 1. Hero scope

- CRUD path for **work orders** with **state** transitions and **activity** audit trail.
- **Tasks** and **notes** on a single WO.
- **Metrics** dashboard counts for dispatch consoles.
- **RBAC:** ITIL analyst read-only vs dispatcher write/close patterns.

**Deferred:** strict state machine enforcement on `updateState`, parts consumption (`inventory`), SLA breach automation.

---

## 2. Exit criteria

- [x] WO-TC-01–10 mapped to Layer 8 §8.37 + `e2e/work-orders.spec.ts` + `work-orders-rbac.test.ts` where applicable.
- [x] Integer `actualHours` / `estimatedHours` behaviour documented (no fractional hours in v1 schema).
- [x] Register Seq 2 → **Class L** with links.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 2 C2 |
