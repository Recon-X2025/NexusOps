# Finance stack Seq 21–23 — gap remediation & sign-off

**Scope:** Close **C1–C7** for **`financial` (Seq 21)**, **`inventory` (Seq 22)**, and **`accounting` (Seq 23)** as one approved sprint slice.  
**Bar:** `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §1 + §5.

---

## 1. Hero scope

| Seq | Router | Hero | Out of scope (v1) |
|-----|----------|------|-------------------|
| 21 | `financial` | Same as FP wave (invoices, budget, chargebacks, GST helpers) | Full bank rec, multi-currency |
| 22 | `inventory` | Items, intake/issue/reorder, transaction history via **`work_orders`** RBAC | Full warehouse WMS |
| 23 | `accounting` | India COA seed, JE draft/post, trial balance, GSTIN registry, GSTR-3B read | Government portal filing automation |

---

## 2. Exit criteria

- [x] **C1:** `docs/QA_FINANCE_SEQUENCE_21_23_E2E_TEST_PACK.md` (Parts I–IV).
- [x] **C2:** This document.
- [x] **C3:** `docs/FINANCE_SEQUENCE_21_23_STAGING_RUNBOOK.md`.
- [x] **C4:** `e2e/finance-sequence-21-23.spec.ts` + existing `e2e/finance-procurement.spec.ts` for Seq 21 UI.
- [x] **C5:** Layer 8 **§8.39** (Seq 21) + **§8.53** (Seq 22) + **§8.54** (Seq 23).
- [x] **C6:** `finance-procurement-rbac.test.ts` + **`finance-sequence-21-23-rbac.test.ts`**.
- [x] **C7:** QA pack Part IV (module key vs RBAC matrix).

---

## 3. Risks

- **Inventory** is not a dedicated `Module` in `rbac-matrix.ts`; permissions ride on **`work_orders`** — testers must not expect `inventory:*` in the matrix.  
- **Accounting** permissions are **`financial`:** — naming mismatch is intentional until a future `accounting` module split.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Sprint C2 |
