# Approvals hub — E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | Cross-module approval queue (`approvals` router) |
| **References** | `apps/api/src/routers/approvals.ts`, `e2e/approvals.spec.ts`, Layer 8 §8.36 |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-APR-01 | At least one pending approval row **or** document seed step to create one via procurement/catalog. |
| ENV-APR-02 | Redis optional for post-decision workflow — mark N/A if worker off. |

---

## 2. Personas

| ID | Use |
|----|-----|
| P-APR-1 | Approver — `myPending` + `decide` |
| P-APR-2 | Requester — `mySubmitted` |

---

## 3. Test cases

| ID | Steps | Expected |
|----|-------|----------|
| APR-TC-01 | Open approvals UI | Page loads |
| APR-TC-02 | Approver lists pending | Rows or empty |
| APR-TC-03 | Approve with comment | Status approved |
| APR-TC-04 | Reject with reason | Status rejected |
| APR-TC-05 | Idempotent decide (same idempotency key) | No double mutation |
| APR-TC-06 | Requester sees submitted | Row in `mySubmitted` |
| APR-TC-07 | Org-wide `list` filter | Works |
| APR-TC-08 | Wrong approver tries `decide` | 404 / forbidden |
| APR-TC-09 | Conflict version retry | Handled per UX |
| APR-TC-10 | Notification on decision | Toast or bell (non-fatal if async down) |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3 + §6 approvals row |
