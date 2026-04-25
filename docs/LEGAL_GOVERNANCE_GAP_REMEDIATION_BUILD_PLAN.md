# Legal & Governance — ITSM-grade gap remediation (LG-1 → LG-3)

**Scope:** Bring **`legal`**, **`contracts`**, and **`secretarial`** to C1–C7 for defined **hero scopes** (see `docs/ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` LG wave).  
**Bar:** `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §1 + §5.

---

## 1. Hero scope (exit intent)

| Router | Hero scope | Out of scope (v1) |
|--------|------------|---------------------|
| **legal** | Matters (MAT), legal requests, investigations (incl. confidential list policy) | Full e-discovery, external counsel portal |
| **contracts** | Register CRUD, lifecycle transitions, wizard + obligations, expiring report | Full CLM parity, redlining |
| **secretarial** | Board meetings CRUD + status, resolutions list by meeting, filings list read | MCA filing submission automation |

---

## 2. Exit criteria (per router)

- [x] **C1:** Formal QA pack section with **≥10** numbered cases (`docs/QA_LEGAL_GOVERNANCE_E2E_TEST_PACK.md` Parts I–III).
- [x] **C2:** This document + objectives met for LG-1, LG-2, LG-3.
- [x] **C3:** `docs/LEGAL_GOVERNANCE_STAGING_RUNBOOK.md` (ENV, N/A).
- [x] **C4:** `e2e/legal-governance.spec.ts` hero paths (web).
- [x] **C5:** Layer 8 `8.38` legal depth + `8.14` contracts retained + `8.51` secretarial depth (`layer8-module-smoke.test.ts`).
- [x] **C6:** `apps/api/src/__tests__/legal-governance-rbac.test.ts` — viewer **403** on `grc` write (legal) and `secretarial` write.
- [x] **C7:** Enum tables in QA pack Part IV; UI types and badges aligned to `legal_matter_status`, `legal_request_status`, and `investigation_status` (`apps/web/src/app/app/legal/page.tsx`).

---

## 3. Epics → engineering

1. **LG-1** — Extend L8 legal; RBAC legal writes; QA Part I; Playwright `/app/legal` tabs smoke.  
2. **LG-2** — Confirm contracts L8 + QA Part II + Playwright `/app/contracts`.  
3. **LG-3** — Secretarial L8 `8.51`; `secretarial` entry in `apps/api/src/server/rbac.ts`; RBAC tests; QA Part III; Playwright `/app/secretarial`.

---

## 4. Risks

- **Legal** uses **`grc`** in `permissionProcedure` — QA/RBAC must say “legal API gated by `grc` module”.  
- **UI vs DB enums** on legal requests — C7 documents mismatch until UI aligned.  
- **Contracts** ↔ vendors: note N/A or thin link in runbook.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-24 | LG wave execution — C2 for ITSM-grade |
| 1.1 | 2026-04-07 | PM sign-off: §2 checklists closed; C7 legal UI aligned to Postgres enums |
