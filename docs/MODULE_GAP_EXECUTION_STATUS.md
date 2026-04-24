# Module gap remediation — execution status

**Source plan:** `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md`  
**Last updated:** 2026-04-07 (long-tail C1/C4 completion pass)

This file is the **living ledger** for C1–C7-style work. Update rows when artefacts merge.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| Done | Delivered in repo this pass |
| Partial | Started / scaffold / one layer only |
| Open | Not started |

---

## C5 — Layer 8 (API multi-step smoke)

| Router / area | Status | Notes |
|---------------|--------|-------|
| tickets, changes, security, contracts, grc, procurement, crm, projects, knowledge, notifications, search, reports, admin | Partial → **retained** | Existing §8.01–8.32 |
| Procurement PR reject | **Done** | `8.12` second test: large PR → `reject` |
| GRC audit + vendor risk | **Done** | `8.11` third test (`questionnaire_status`: `completed`) |
| CRM list + closed_lost | **Done** | `8.15` second test |
| Contracts wizard + obligation | **Done** | `8.14` second test (`obligation_frequency`: `annually`) |
| HR | **Done** | `8.33` employee → case → resolve → leave → approve |
| CSM | **Done** | `8.34` + `csm_cases` in `0014_layer8_schema_alignment`; list handler normalizes `db.execute` row shape |
| Catalog | **Done** | `8.35` item → submit → list requests |
| Approvals | **Done** | `8.36` list / myPending / mySubmitted |
| Work orders | **Done** | `8.37` create → list → get |
| Legal investigations | **Done** | `8.38` create → list → close |
| Financial + dashboard | **Done** | `8.39` + invoice columns in `0014_layer8_schema_alignment` |
| Top-level `vendors` | **Done** | `8.24` second test: `get` + `update` |
| RBAC 403 (viewer GRC write denial) | **Done** | `8.42` asserts `grc.createRisk` forbidden for viewer |
| mac, assets, workflows, payroll, workforce, recruitment, performance, devops, surveys, apm, oncall, events, facilities, walkup, ai, indiaCompliance, assignmentRules, secretarial, integrations, accounting, customFields | **Done** | `8.50` + `0014_layer8_schema_alignment` (performance, custom fields, `csm_cases`) |

---

## C1 — Formal QA packs (`docs/QA_*`)

| Doc | Status |
|-----|--------|
| `QA_ITSM_E2E_TEST_PACK.md` | Done (reference) |
| `QA_HR_E2E_TEST_PACK.md` | **Done** |
| `QA_CSM_E2E_TEST_PACK.md` | **Done** |
| `QA_CRM_E2E_TEST_PACK.md` | **Done** |
| `QA_COMPLIANCE_E2E_TEST_PACK.md` | **Done** |
| `QA_LEGAL_E2E_TEST_PACK.md` | **Done** |
| `QA_PROCUREMENT_FINANCE_E2E_TEST_PACK.md` | **Done** |
| `QA_PLATFORM_SHELL_E2E_TEST_PACK.md` | **Done** |
| `QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md` | **Done** |
| `QA_APPROVALS_E2E_TEST_PACK.md` | **Done** |
| Per-router QA traceability for all `appRouter` keys | **Done** | `docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` (index §0 + §1–§25); excludes **full ITSM-grade C1–C7** per router |

---

## C2 — Gap / remediation plans

| Doc | Status |
|-----|--------|
| `ITSM_GAP_REMEDIATION_BUILD_PLAN.md` | Done (ITSM) |
| `NEXUSOPS_MODULE_GAP_REMEDIATION_PROGRAM.md` | **Done** (program-level exit criteria) |
| `CRM_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** (CRM-specific C2) |

---

## C3 — Staging runbooks

| Doc | Status |
|-----|--------|
| `ITSM_STAGING_RUNBOOK.md` | Done |
| `STAGING_RUNBOOK_MODULES_ADDENDA.md` | **Done** (cross-module ENV + N/A) |

---

## C4 — Playwright

| Spec | Status |
|------|--------|
| `e2e/tickets.spec.ts`, `auth.spec.ts`, `approvals.spec.ts`, `rbac.spec.ts`, `layer10-journeys.spec.ts` | Done (existing hero paths) |
| `e2e/module-routes.spec.ts` | **Done** | P1 admin serial sweep of **40+** `/app/*` routes + P2 HR/CSM/catalog (`QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` §0 Playwright column) |

---

## Honest conclusion

**Full ITSM-grade parity for all 45 routers (C1–C7 density per router)** remains a **multi-quarter** program — **out of scope** for the “long-tail 100%” pledge unless product resets the bar.

**Long-tail program (everything except that bar):** **C1** traceability for all namespaces is **Done** via pillar packs + `QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md`. **C3** addenda **Done**. **C5** Layer 8 batch **Done** (see table). **C4** Playwright **Done** for first-class `/app/*` load smoke (`module-routes.spec.ts`). **C2** program **Done** where listed.

See **`docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §6.4** for document sync vs §6.2 router table.
