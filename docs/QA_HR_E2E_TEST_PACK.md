# HR module — formal E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | NexusOps — Employees, cases, leave |
| **References** | `apps/api/src/routers/hr.ts`, `apps/web/src/app/app/hr/`, `apps/api/src/__tests__/layer8-module-smoke.test.ts` §8.33 |
| **Staging URL** | `{BASE_URL}` |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-HR-01 | Same as ITSM ENV-01–03; demo password `demo1234!` where seeded users match `e2e/*.spec.ts`. |
| ENV-HR-02 | Redis **N/A** for core HR CRUD unless testing async jobs. |

---

## 2. Personas

| ID | Email (seed) | Role | Use |
|----|----------------|------|-----|
| P-HR-1 | `admin@coheron.com` | owner | Full HR write + approve leave |
| P-HR-2 | `agent1@coheron.com` | member + itil | HR fulfiller |
| P-HR-3 | `employee@coheron.com` | member | Self-service leave submit |
| P-HR-4 | `viewer@coheron.com` | viewer | Read-only / deny write |

---

## 3. Server RBAC (summary)

Source: `apps/api/src/server/rbac.ts` — `hr` module: read/write for `member`; **approve** for `owner`/`admin` only. Viewers must not mutate.

---

## 4. Test cases (web + API)

| ID | Persona | Steps | Expected |
|----|---------|-------|----------|
| HR-TC-01 | P-HR-1 | Open `/app/hr`; list loads | No 500; table or empty state |
| HR-TC-02 | P-HR-1 | Create/link employee for a user without record | Success toast or row |
| HR-TC-03 | P-HR-1 | Create HR case (onboarding/policy); open detail | Case visible |
| HR-TC-04 | P-HR-1 | Resolve case with resolution text | Case shows resolved notes |
| HR-TC-05 | P-HR-3 | Submit leave request (2+ days) | Pending state |
| HR-TC-06 | P-HR-1 | Approve same leave | Approved; balances updated if shown |
| HR-TC-07 | P-HR-4 | Attempt create employee (if UI exposes) | Blocked or 403 |
| HR-TC-08 | P-HR-1 | Directory search / filter | Results consistent with API `hr.employees.list` |
| HR-TC-09 | P-HR-2 | Open case assigned to role | Can add note / task per UX |
| HR-TC-10 | P-HR-1 | Reject leave (alternate path) | Status rejected; pending days not double-counted |

**API parity:** Layer 8 §8.33 must pass in CI for create/resolve/leave/approve.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Initial pack from gap analysis §3.3 |
