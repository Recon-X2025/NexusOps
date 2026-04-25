# Dashboard — ITSM-grade QA pack (Seq 9)

**Scope:** **`dashboard`** router — cached **metrics**, **time series**, **top categories**.  
**Router:** `apps/api/src/routers/dashboard.ts`.  
**Permission:** procedures use **`reports:read`** (same gate as analytics).

---

## Part I — API cases

| ID | Persona | Procedure | Expected |
|----|---------|-----------|----------|
| DSH-TC-01 | Admin | `dashboard.getMetrics` | Counts + `slaCompliancePct` (also covered in L8 §8.39 FP touch) |
| DSH-TC-02 | Admin | `dashboard.getTimeSeries` `{ days }` | `{ created, resolved }` arrays |
| DSH-TC-03 | Admin | `dashboard.getTopCategories` | Array of category rows |
| DSH-TC-04 | Ops | Redis optional | Cache miss still returns fresh DB; see runbook |
| DSH-TC-05 | Web P1 | `/app/dashboard` | No runtime crash (`e2e/dashboard.spec.ts`) |
| DSH-TC-06 | SRE | Rate limit | `dashboard.getMetrics` uses `rateLimit` — document burst in staging |
| DSH-TC-07 | PM | Cross-link | Platform shell pack for nav |
| DSH-TC-08 | Regression | Layer 8 **§8.40** | `getTimeSeries` + `getTopCategories` |
| DSH-TC-09 | Security | Org scope | SQL filters `org_id` |
| DSH-TC-10 | Doc | C7 | Redis key patterns `dashboard:metrics:*`, `dashboard:timeseries:*` |

---

## Part II — C6 / C7

| Item | Detail |
|------|--------|
| **C6** | Same as reports — **`requester`** denied **`dashboard.getTimeSeries`** in `reports-dashboard-rbac.test.ts`. |
| **C7** | Redis TTL **300s** in router — invalidate expectations in UAT when debugging stale metrics. |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 9 C1 |
