# Change management — gap remediation build plan (Seq 1)

**Purpose:** Close ITSM-grade **C2** for the **`changes`** router hero scope (change requests + blackouts + read-only overlap); pointer problems/releases/known-errors depth.  
**QA pack:** `docs/QA_CHANGES_ITSM_E2E_TEST_PACK.md`.  
**Staging:** `docs/CHANGES_STAGING_RUNBOOK.md`.

---

## 1. Hero scope (in scope for “Seq 1 done”)

- **Change request lifecycle:** draft → CAB (`submitForApproval`) → approve/reject → schedule → implement → complete/fail/cancel, with optimistic concurrency (`version`).
- **CAB support:** approvals ledger, `statusCounts`, `list` / `get`.
- **Risk visibility:** blackout CRUD, `checkBlackoutOverlap` against org blackouts and in-flight scheduled changes (`approved`, `scheduled`, `implementing`).
- **RBAC:** `changes:read` vs `write` vs `approve` mapped to procedures; viewer/report_viewer cannot mutate or approve.

**Deferred (program backlog):** full comment persistence (current `addComment` is minimal), CMDB / CI linkage on `affectedCis`, email/Slack CAB integrations, calendar exports.

---

## 2. Objectives → epics

| Epic | Outcome |
|------|---------|
| **E1 Lifecycle integrity** | `CHANGE_LIFECYCLE` ↔ DB enum; reject path sets `cancelled` with auditable `rejected` decision on approval row. |
| **E2 Test & evidence** | Layer 8 §8.02 multi-case; `changes-rbac.test.ts`; `e2e/changes.spec.ts`; QA pack ≥10 cases. |
| **E3 Staging clarity** | Redis note for dashboard list cache; ENV for QA org / seeds. |

---

## 3. Exit criteria (PM sign-off)

- [x] `QA_CHANGES_ITSM_E2E_TEST_PACK.md` Part I cases **CHG-TC-01–09** covered by Layer 8 §8.02 + **CHG-TC-10** by `e2e/changes.spec.ts`; RBAC cases in `changes-rbac.test.ts`.
- [x] Hero lifecycle paths asserted in API smoke (draft → completed; reject → cancelled).
- [x] Part IV **C7** risk on `changes.update` + `status` documented in QA pack (mitigation optional follow-up).
- [x] `MODULE_GAP_EXECUTION_STATUS.md` Seq 1 wave row updated to **Done** when this wave merges.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 1 C2 gap plan |
