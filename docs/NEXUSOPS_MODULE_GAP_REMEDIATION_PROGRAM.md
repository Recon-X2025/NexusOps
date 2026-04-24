# NexusOps — module gap remediation program (C2)

**Audience:** PM + Eng + QA.  
**Bar:** Aligns with `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §1 (C1–C7) and long-tail **G3** (`docs/NEXUSOPS_LONG_TAIL_MARKET_READY_PLAN.md`).

---

## Program objectives

1. **No silent regressions** on Tier A/B routers that claim “shipped” or “beta”.  
2. **Every shipped router** has at minimum: **Layer 8-style smoke** + **mini QA pack** + **runbook slice** + **one Playwright or explicit N/A (no UI)**.  
3. **Sensitive domains** (HR, payroll, legal, financial) gain **integration RBAC denials**, not matrix-only tests.

---

## Epics and exit criteria

| Epic | Exit criteria |
|------|----------------|
| **E1 — API smoke backlog** | Each Tier A/B router in `appRouter` has ≥1 multi-step test in `layer8-module-smoke.test.ts` or scoped `layer8-*.test.ts`; CI green. |
| **E2 — QA documentation** | `docs/QA_<DOMAIN>_E2E_TEST_PACK.md` exists with personas, ENV table, ≥10 numbered cases, RBAC § for that domain. |
| **E3 — Runbooks** | `STAGING_RUNBOOK_MODULES_ADDENDA.md` updated per release; router-specific addenda when ENV differs from ITSM. |
| **E4 — Playwright** | For each domain **with a first-class UI route** under `/app/*`, one happy-path spec; domains without UI documented as N/A in QA pack. |
| **E5 — RBAC proofs** | For HR / payroll / legal / financial / CSM: automated tests proving **viewer** (or least-privileged role) cannot mutate or export where policy says so. |
| **E6 — Schema–doc–UI** | Lifecycle enums documented in QA pack match `packages/db` + router validation; mismatches filed as defects before marking Done. |

---

## Sequencing (from gap analysis §4)

1. ~~HR + CSM~~ (C5 + C1 + C4 started this program pass).  
2. CRM + Legal/Contracts (extend Playwright + QA execution).  
3. Compliance pack execution (manual runs from `QA_COMPLIANCE_*`).  
4. Procurement/finance Tier B.  
5. Knowledge/catalog/portal split from ITSM pack when ITSM reference stays green on `main`.

---

## Definition of Done (per router)

Copy from `NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §5; program PM signs off when all checkboxes are true for that router’s declared scope.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Initial program doc from gap analysis |
