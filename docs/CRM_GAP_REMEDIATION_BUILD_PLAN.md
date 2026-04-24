# CRM — gap remediation build plan (C2)

**Objective:** CRM reaches **G3** (mini QA + API smoke + ≥1 Playwright) on the long-tail plan, then **ITSM-grade** if CRM is a launch pillar.

---

## Current state (2026-04-07)

- **C5:** Layer 8 covers account → contact → deal → pipeline + `closed_lost` + tier list.  
- **C1:** `docs/QA_CRM_E2E_TEST_PACK.md`.  
- **C4:** Extend `e2e/` with deal pipeline UI when prioritized.

---

## Epics

1. **E-CRM-1:** Align UI pipeline stages with `movePipeline` enum; add contract test or zod shared type.  
2. **E-CRM-2:** Duplicate account / merge behaviour — define product rule; add API test when implemented.  
3. **E-CRM-3:** Playwright: create deal → move stage → dashboard metric visible (`QA_CRM` PF-TC-09).

---

## Exit criteria

- [ ] No orphan deal stages in UI vs `crm.ts` enum.  
- [ ] `layer8-module-smoke` CRM section green.  
- [ ] QA pack executed once on staging with evidence log.

---

| Version | Date |
|---------|------|
| 1.0 | 2026-04-07 |
