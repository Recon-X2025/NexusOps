# Auth — gap remediation (Seq 11)

**Hero scope (v1):** Identity and session lifecycle are **correct**, **org-scoped**, and **RBAC-aligned** for user administration; known stubs (email delivery for reset/invite) documented.

## Objectives

1. **Session consistency:** Logout clears **PostgreSQL + L1 + L2** before response (no stale Redis session).
2. **RBAC:** Keep `permissionProcedure("users", …)` aligned with `packages/types` matrix; no silent widening for `requester`.
3. **Product hardening:** Replace `console.info` invite/reset URLs with notification pipeline in staging.

## Exit criteria (Class L v1)

- [x] C1 `QA_AUTH_ITSM_E2E_TEST_PACK.md` (≥10 cases).
- [x] C5 `layer8-module-smoke` **§8.44**.
- [x] C6 `auth-rbac.test.ts`.
- [x] C4 `e2e/auth.spec.ts` (login + shell routes).
- [x] C3 `AUTH_STAGING_RUNBOOK.md`.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 11 C2 |
