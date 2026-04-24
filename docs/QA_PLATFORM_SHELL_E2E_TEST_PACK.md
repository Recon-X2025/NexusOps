# Platform shell (auth, dashboard, notifications, admin) — E2E QA pack

| Field | Value |
|--------|--------|
| **Product** | Login, dashboard KPIs, notifications, admin users / audit |
| **References** | `dashboard.ts`, `admin.ts`, `notifications.ts`, `auth`, `e2e/auth.spec.ts`, `layer10-journeys.spec.ts` |

---

## 1. Environment

| ID | Requirement |
|----|-------------|
| ENV-PL-01 | Same as ITSM ENV-01–03. |
| ENV-PL-02 | `mergeTrpcQueryOpts` / RBAC on gated dashboard queries — regression when changing layout. |

---

## 2. Personas

Use ITSM pack personas P1–P5 (`QA_ITSM_E2E_TEST_PACK.md` §2).

---

## 3. Test cases

| ID | Persona | Steps | Expected |
|----|---------|-------|----------|
| PL-TC-01 | P1 | Login | Session established |
| PL-TC-02 | P2 | `/app/dashboard` loads | No runtime error |
| PL-TC-03 | P4 | `/app/dashboard` loads | Requester-safe widgets only |
| PL-TC-04 | P5 | `/app/dashboard` loads | Read-only; no write controls |
| PL-TC-05 | P2 | Notifications bell | List opens |
| PL-TC-06 | P1 | Admin → users list | Seeded users visible |
| PL-TC-07 | P1 | Admin → audit log | Recent entries |
| PL-TC-08 | P1 | Logout | Redirect login |
| PL-TC-09 | — | Forgot password flow | Generic success message |
| PL-TC-10 | P2 | Deep-link from notification to entity | Correct route |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | From gap §3.9 |
