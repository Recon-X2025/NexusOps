# Admin console — ITSM-grade QA pack (Seq 10)

**Scope:** **`admin`** router — org user directory, audit log, read-only system property catalogue (+ stub update), SLA definition stubs, notification rule stubs, scheduled job catalogue (+ manual trigger audit), org **business rules** CRUD.  
**Router:** `apps/api/src/routers/admin.ts`.  
**Gate:** `adminProcedure` — DB role must be **`owner`** or **`admin`** (matrix role does not widen access).

---

## Part I — API cases

| ID | Persona | Procedure | Expected |
|----|---------|-----------|----------|
| ADM-TC-01 | Org admin | `admin.users.list` | Array of org users with `id`, `email`, `role` |
| ADM-TC-02 | Org admin | `admin.auditLog.list` `{ page, limit }` | `items[]`, `total`, org-scoped |
| ADM-TC-03 | Org admin | `admin.systemProperties.list` | Known keys (`platform.name`, session timeout, …) |
| ADM-TC-04 | Org admin | `admin.systemProperties.update` | Returns echoed `{ key, value }` (stub persistence) |
| ADM-TC-05 | Org admin | `admin.slaDefinitions.list` / `upsert` | List (may be empty); upsert echoes input |
| ADM-TC-06 | Org admin | `admin.notificationRules.create` + `list` | Stub id + payload |
| ADM-TC-07 | Org admin | `admin.scheduledJobs.list` + `trigger` | Jobs array; trigger returns `success` |
| ADM-TC-08 | Org admin | `admin.businessRules` create → update → toggle → delete | Full lifecycle; org isolation |
| ADM-TC-09 | Web P1 | `/app/admin` | No runtime crash (`e2e/admin.spec.ts`) |
| ADM-TC-10 | Security | Requester / viewer | `403` / “Admin access required” on any `admin.*` call |

---

## Part II — C6 / C7

| Item | Detail |
|------|--------|
| **C6** | Vitest `admin-rbac.test.ts`: **`requester`** and **`viewer`** denied; **`admin`** allowed. |
| **C7** | `scheduledJobs.trigger` writes **`audit_logs.user_id`** (not legacy `actor_id`); business rule DSL enums aligned with `BusinessRuleCreateSchema`. |

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 10 C1 |
