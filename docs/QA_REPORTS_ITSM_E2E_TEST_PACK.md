# Reports — ITSM-grade QA pack (Seq 8)

**Scope:** **`reports`** router — executive KPIs, SLA views, workload, trends, **ITSM service desk pack**, **SLA what-if** (calendar-aware).  
**Router:** `apps/api/src/routers/reports.ts`.  
**Permission:** `reports:read` on all procedures in this router.

---

## Part I — API cases

| ID | Persona | Procedure | Expected |
|----|---------|-----------|----------|
| RPT-TC-01 | Exec / admin | `reports.executiveOverview` `{ days }` | `openTickets`, trends, `byCategory` |
| RPT-TC-02 | Ops | `reports.slaDashboard` | `byPriority`, `slaTrend` |
| RPT-TC-03 | Ops | `reports.workloadAnalysis` | `byAssignee[]` |
| RPT-TC-04 | Ops | `reports.trendAnalysis` | `backlogTrend[]` |
| RPT-TC-05 | ITSM lead | `reports.itsmServiceDeskPack` | `slaCompliancePct`, `backlogAgeing`, `volumeByCategory` |
| RPT-TC-06 | ITSM lead | `reports.slaWhatIf` | ISO `responseDueAt` (+ optional `resolveDueAt`) |
| RPT-TC-07 | Web P1 | `/app/reports` | No runtime crash (`e2e/reports.spec.ts`) |
| RPT-TC-08 | Ops | `days` bounds 1–730 | Zod rejects out of range |
| RPT-TC-09 | Security | Org isolation | All queries scoped to `org.id` |
| RPT-TC-10 | PM | Cross-link | `ITSM_PRODUCT_UPGRADE_PLAN_SNOW_SFDC.md` Phase A pack |

---

## Part II — C6 / C7

| Item | Detail |
|------|--------|
| **C6** | Base **`requester`** matrix has **no** `reports:read` — Vitest `reports-dashboard-rbac.test.ts` denies `executiveOverview`. |
| **C7** | `slaWhatIf` uses org **settings** calendar parser — align ENV/docs with `parseOrgSlaCalendarSettings`. |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 8 C1 |
