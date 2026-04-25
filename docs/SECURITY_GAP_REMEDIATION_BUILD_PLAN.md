# Security — gap remediation (Seq 12)

**Hero scope (v1):** Incident lifecycle + vulnerability triage are **RBAC-enforced**, **org-scoped**, and covered by **Layer 8 §8.10** + Vitest deny paths.

## Objectives

1. **State machine:** Keep server-side `STATE_MACHINE` as single source of truth; document any UI-only labels in C7.
2. **Containment / timeline:** Extend JSON journals with actor IDs from `ctx.user` when product requires non-repudiation.
3. **Vuln workflow:** Add optional `assigneeId` / SLA fields when schema expands.

## Exit criteria (Class L v1)

- [x] C1 `QA_SECURITY_ITSM_E2E_TEST_PACK.md` (≥10 cases).
- [x] C5 `layer8-module-smoke` **§8.10** (two depth cases).
- [x] C6 `security-rbac.test.ts`.
- [x] C4 `e2e/security.spec.ts`.
- [x] C3 `SECURITY_STAGING_RUNBOOK.md`.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 12 C2 |
