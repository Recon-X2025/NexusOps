# Approvals router — gap remediation (Seq 5)

**Primary C1:** `docs/QA_APPROVALS_E2E_TEST_PACK.md`.  
**C5:** Layer 8 §8.36 (list + myPending + mySubmitted + RBAC deny on `decide`).  
**C6:** `apps/api/src/__tests__/approvals-rbac.test.ts`.  
**C4:** `e2e/approvals.spec.ts` (includes **`/app/flows`** Seq 5 case).

---

## Hero scope

- Inbox surfaces: `list`, `myPending`, `mySubmitted`.
- **`decide`** guarded by `approvals:approve` — matrix-aligned denies for viewer/report_viewer composite.

**Deferred:** full workflow engine idempotency matrix; cross-router PR approval remains under `procurement` wave.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Seq 5 C2 |
