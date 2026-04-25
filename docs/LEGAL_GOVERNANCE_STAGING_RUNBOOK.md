# Legal & Governance — staging runbook

**Audience:** QA + DevOps validating LG-1 → LG-3 before release.  
**Related:** `docs/LEGAL_GOVERNANCE_GAP_REMEDIATION_BUILD_PLAN.md`, `docs/QA_LEGAL_GOVERNANCE_E2E_TEST_PACK.md`.

---

## 1. Environment

| ID | Variable / dependency | Notes |
|----|------------------------|--------|
| ENV-LG-01 | `DATABASE_URL` | Migrations through `0014`+; legal / investigations / board tables present. |
| ENV-LG-02 | Seeded org | Demo users: admin, agent, viewer (see `QA_ITSM` personas or seed script). |
| ENV-LG-03 | Redis | **N/A** for core legal/contracts/secretarial CRUD unless testing async jobs. |
| ENV-LG-04 | External counsel / DMS | **N/A** unless integrated. |

---

## 2. Preconditions

1. `pnpm --filter @nexusops/db exec drizzle-kit migrate` against target DB.  
2. API `grc` + `contracts` + `secretarial` permissions load (`apps/api/src/server/rbac.ts`).  
3. Web `/app/legal`, `/app/contracts`, `/app/secretarial` reachable for P1 admin.

---

## 3. Smoke (manual)

| Step | Action | Pass |
|------|--------|------|
| 1 | P1: create matter, list, close | MAT visible |
| 2 | P1: legal request create → status update | Row updates |
| 3 | P1: investigation → close | Status closed |
| 4 | P5: cannot create investigation / meeting | 403 or UI hidden |
| 5 | P1: contract transition to `active` | Matches §8.14 |
| 6 | P1: secretarial meeting create → status `completed` | Row persisted |

---

## 4. Rollback

- Revert migration only if forward migration not yet applied to prod.  
- Feature flags: none required for LG wave.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-24 | Initial LG staging |
