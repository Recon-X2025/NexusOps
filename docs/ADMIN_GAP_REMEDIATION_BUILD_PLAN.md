# Admin console — gap remediation (Seq 10)

**Hero scope (v1):** Prove **tenant admin** surfaces are **authenticated**, **org-scoped**, and **role-gated**; document stubs (`slaDefinitions`, `notificationRules`, partial `systemProperties` persistence) vs production hardening.

## Objectives

1. **RBAC:** Keep `adminProcedure` aligned with product policy — only `owner` / `admin` DB roles; no matrix bypass.
2. **Persistence:** Replace stub mutations with Drizzle-backed tables where product commits (SLA policies, notification rules, system settings store).
3. **Audit:** Ensure every sensitive admin mutation emits **`audit_logs`** rows with valid `user_id` and `org_id`.

## Exit criteria (Class L v1)

- [x] C1 `QA_ADMIN_ITSM_E2E_TEST_PACK.md` (≥10 cases).
- [x] C5 `layer8-module-smoke` **§8.32** deep multi-step path.
- [x] C6 `admin-rbac.test.ts`.
- [x] C4 `e2e/admin.spec.ts` load smoke.
- [x] C3 `ADMIN_STAGING_RUNBOOK.md`.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 10 C2 |
