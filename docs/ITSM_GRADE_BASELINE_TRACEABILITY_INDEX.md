# ITSM-grade program — **baseline traceability** for Class **P** routers (Seq 13–44)

**Purpose:** When the serial register lists **Class P**, evidence is **program-grade** per `ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md` legend: long-tail index + Layer 8 + `e2e/module-routes.spec.ts` + umbrella C2/C3/C7.  
This index is the **single scan** for auditors — it does **not** claim dedicated per-router C1–C7 **L** waves for these rows.

| Seq | Router | C1 (index / pack) | C5 (Layer 8) | C4 (Playwright) | C6 |
|-----|--------|-------------------|-------------|-----------------|-----|
| 13 | `grc` | Compliance pack | §8.11 (depth), §8.42 | `e2e/grc.spec.ts` | `grc-rbac.test.ts` + §8.42 |
| 14 | `csm` | `QA_CSM_E2E_TEST_PACK.md` | §8.34 (depth) | `e2e/csm.spec.ts` | `csm-rbac.test.ts` + §8.42 |
| 15 | `hr` | `QA_HR_E2E_TEST_PACK.md` | §8.33 (depth) | `e2e/hr.spec.ts` | `hr-crm-rbac.test.ts` + §8.42 |
| 16 | `crm` | `QA_CRM_E2E_TEST_PACK.md` | §8.15 | `e2e/crm.spec.ts` | `hr-crm-rbac.test.ts` + §8.42 |
| 24 | `payroll` | Long-tail §25 | §8.50 | `/app/payroll` | §8.42 |
| 25 | `projects` | Long-tail §5 | §8.18 | `e2e/module-routes.spec.ts` | **`serial-longtail-rbac.test.ts`** + §8.42 |
| 26–37 | `devops` … `performance` (incl. **34** `workflows`) | Long-tail §§6–12, 18, 20, 22 | §8.50 (+ module-specific where noted) | `module-routes` matching `/app/*` | §8.42; **26 · 34:** `serial-longtail-rbac.test.ts` |
| 33 | `assets` | Long-tail §2 | §8.50 | `/app/ham` | §8.42 |
| 39 | `indiaCompliance` | Long-tail §16 | §8.50 | HR/CSM spot-checks | §8.42 |
| 40 | `assignmentRules` | Long-tail §17 | §8.50 | `/app/admin` | §8.42 |
| 41 | `integrations` | Long-tail §21 | §8.50 | `/app/settings/integrations` | §8.42 |
| 42 | `customFields` | Long-tail §24 | §8.50 | `/app/admin` | §8.42 |
| 43 | `ai` | Long-tail §15 | §8.50 | `/app/tickets` | §8.42 |
| 44 | `mac` | Long-tail §1 | Public / stats | N/A | N/A |

**Umbrella C2 / C3 / C7:** `ITSM_GAP_REMEDIATION_BUILD_PLAN.md`, `ITSM_STAGING_RUNBOOK.md`, `STAGING_RUNBOOK_MODULES_ADDENDA.md`, `NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §6.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Baseline index for Class **P** remainder |
| 1.1 | 2026-04-07 | Seq **6–7** promoted to **L** — table starts at **Seq 8** |
| 1.2 | 2026-04-07 | Seq **8–9** promoted to **L** — table starts at **Seq 10** |
| 1.3 | 2026-04-07 | Seq **10** (`admin`) promoted to **L** — table starts at **Seq 11** |
| 1.4 | 2026-04-07 | Seq **11** (`auth`) promoted to **L** — table starts at **Seq 12** |
| 1.5 | 2026-04-07 | Seq **12** (`security`) promoted to **L** — table starts at **Seq 13** |
| 1.6 | 2026-04-07 | **Register v2.0 alignment:** Seq **13–16** C4/C6 file paths; **25 · 26 · 34** → `serial-longtail-rbac.test.ts` pointer |
| 1.7 | 2026-04-07 | **Register v2.1:** Class **P** C4 column satisfied in CI by full **`e2e/`** Playwright job (see **`MODULE_GAP_EXECUTION_STATUS.md`** §Automated execution gate) |
