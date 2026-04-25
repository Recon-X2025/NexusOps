# Finance & Procurement — ITSM-grade gap remediation (FP-1 → FP-3)

**Scope:** Bring **`financial`**, **`procurement`**, and vendor surfaces used by FP (**`vendors`**, **`budget`**, **`chargebacks`** modules in RBAC matrix) to C1–C7 for defined **hero scopes**.  
**Bar:** `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §1 + §5.

---

## 1. Hero scope (exit intent)

| Router / module | Hero scope | Out of scope (v1) |
|-----------------|------------|-------------------|
| **financial** | Budget lines + variance; AP invoice create/list/approve; AP aging; chargeback list/create; GST read helpers | Full ERP subledger, bank reconciliation automation |
| **procurement** | PR create (thresholds), list, reject, approve path; vendor register via nested router | Full inventory + three-way match parity |
| **vendors** | `procurement.vendors` + top-level `vendors` get/update smoke | Vendor portal, onboarding workflows |

---

## 2. Exit criteria (per wave)

- [x] **C1:** `docs/QA_FINANCE_PROCUREMENT_E2E_TEST_PACK.md` Parts I–IV (≥10 numbered cases per Part I & II).
- [x] **C2:** This document + objectives met for FP-1 → FP-3.
- [x] **C3:** `docs/FINANCE_PROCUREMENT_STAGING_RUNBOOK.md`.
- [x] **C4:** `e2e/finance-procurement.spec.ts` hero paths.
- [x] **C5:** Layer 8 `8.39` extended depth + existing `8.12` procurement + `8.24` vendors retained.
- [x] **C6:** `apps/api/src/__tests__/finance-procurement-rbac.test.ts` — viewer/report_viewer denies on **financial**, **budget**, **chargebacks**, **vendors write**, **PR approve**; documents **PR create** allowed via `requester` composite.
- [x] **C7:** Part IV RBAC / threshold documentation; invoice enums as maintenance note.

---

## 3. Epics → engineering

1. **FP-1** — Extend L8 financial; QA Part I; Playwright `/app/financial`.  
2. **FP-2** — Confirm L8 procurement + QA Part II + Playwright `/app/procurement`.  
3. **FP-3** — Vendors L8 + QA Part III + hub `/app/finance-procurement` + top-level `vendors` smoke.

---

## 4. Risks

- **Turbo `pnpm dev`** may race `@nexusops/api#build` before `@nexusops/db` dist exists — use **`pnpm --filter @nexusops/db build`** first, or run **web** and **api** dev in separate terminals (see runbook).  
- **Requester procurement write** is product-intended for employee requisitions — RBAC tests must not contradict that for `viewer` + `report_viewer`.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | FP wave C2 |
