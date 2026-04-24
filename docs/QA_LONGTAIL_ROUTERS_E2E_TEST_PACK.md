# Long-tail router coverage — formal E2E / QA pack (all `appRouter` keys)

| Field | Value |
|--------|-------|
| **Purpose** | **100% traceability** for every top-level tRPC namespace: primary QA doc, API smoke (Layer 8), and UI smoke (Playwright) — **without** claiming full ITSM-grade (C1–C7) parity per router. |
| **References** | `apps/api/src/routers/index.ts` · `apps/api/src/__tests__/layer8-module-smoke.test.ts` · `e2e/module-routes.spec.ts` · `docs/MODULE_GAP_EXECUTION_STATUS.md` |
| **Staging URL** | `{BASE_URL}` |

---

## 0. Master index — every router (45 keys)

Personas **P1–P5** = `QA_ITSM_E2E_TEST_PACK.md` §2 unless a subsection overrides.

| # | Router | Primary QA doc (C1 hero) | Layer 8 | Playwright route smoke |
|---|--------|--------------------------|---------|-------------------------|
| 1 | `mac` | **This pack §1** | N/A (public-style stats) | N/A |
| 2 | `auth` | `QA_PLATFORM_SHELL_E2E_TEST_PACK.md` + `e2e/auth.spec.ts` | Via test helpers | `auth.spec` |
| 3 | `admin` | `QA_PLATFORM_SHELL_E2E_TEST_PACK.md` | §8.32 | `/app/admin` |
| 4 | `tickets` | `QA_ITSM_E2E_TEST_PACK.md` | §8.01 | `tickets.spec` / L10 |
| 5 | `assets` | **This pack §2** | §8.50 (assets) | `/app/ham` |
| 6 | `workflows` | **This pack §3** | §8.50 | `/app/workflows` |
| 7 | `hr` | `QA_HR_E2E_TEST_PACK.md` | §8.33 | `/app/hr` |
| 8 | `procurement` | `QA_PROCUREMENT_FINANCE_E2E_TEST_PACK.md` | §8.12 | `/app/procurement` |
| 9 | `dashboard` | `QA_PLATFORM_SHELL_E2E_TEST_PACK.md` | §8.39 (metrics) | `/app/dashboard` |
| 10 | `workOrders` | **This pack §4** + ITSM overlap | §8.37 | `/app/work-orders` |
| 11 | `changes` | `QA_ITSM_E2E_TEST_PACK.md` (CHG journeys) | §8.02 | `/app/changes` |
| 12 | `security` | `QA_COMPLIANCE_E2E_TEST_PACK.md` | §8.10 | `/app/security` |
| 13 | `grc` | `QA_COMPLIANCE_E2E_TEST_PACK.md` | §8.11 + §8.42 | `/app/grc` |
| 14 | `financial` | `QA_PROCUREMENT_FINANCE_E2E_TEST_PACK.md` | §8.39 | `/app/financial` |
| 15 | `contracts` | `QA_LEGAL_E2E_TEST_PACK.md` | §8.14 | `/app/contracts` |
| 16 | `projects` | **This pack §5** | §8.18 | `/app/projects` |
| 17 | `crm` | `QA_CRM_E2E_TEST_PACK.md` | §8.15 | `/app/crm` |
| 18 | `legal` | `QA_LEGAL_E2E_TEST_PACK.md` | §8.38 | `/app/legal` |
| 19 | `devops` | **This pack §6** | §8.50 | `/app/devops` |
| 20 | `surveys` | **This pack §7** | §8.50 | `/app/surveys` |
| 21 | `knowledge` | `QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md` | §8.22 | `/app/knowledge` |
| 22 | `notifications` | `QA_PLATFORM_SHELL_E2E_TEST_PACK.md` | §8.29 | `/app/notifications` |
| 23 | `catalog` | `QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md` | §8.35 | `/app/catalog` |
| 24 | `csm` | `QA_CSM_E2E_TEST_PACK.md` | §8.34 | `/app/csm` |
| 25 | `apm` | **This pack §8** | §8.50 | `/app/apm` |
| 26 | `oncall` | **This pack §9** | §8.50 | `/app/on-call` |
| 27 | `events` | **This pack §10** | §8.50 | `/app/events` |
| 28 | `facilities` | **This pack §11** | §8.50 | `/app/facilities` |
| 29 | `walkup` | **This pack §12** | §8.50 | `/app/walk-up` |
| 30 | `vendors` | `QA_PROCUREMENT_FINANCE_E2E_TEST_PACK.md` | §8.24 | `/app/vendors` |
| 31 | `approvals` | `QA_APPROVALS_E2E_TEST_PACK.md` | §8.36 | `/app/approvals` |
| 32 | `reports` | **This pack §13** | §8.31 | `/app/reports` |
| 33 | `search` | **This pack §14** | §8.30 | Covered via global search in ITSM / shell |
| 34 | `ai` | **This pack §15** | Via tickets + `ai.summarizeTicket` §8.50 | `/app/tickets` (AI entry if present) |
| 35 | `indiaCompliance` | **This pack §16** | §8.50 | Embedded HR/CSM tabs + statutory; spot-check `/app/hr` |
| 36 | `assignmentRules` | **This pack §17** | §8.50 | `/app/admin` (rules UI) |
| 37 | `inventory` | `QA_PROCUREMENT_FINANCE_E2E_TEST_PACK.md` | §8.50 | `/app/procurement` (inventory tab) |
| 38 | `recruitment` | **This pack §18** | §8.50 | `/app/recruitment` |
| 39 | `secretarial` | **This pack §19** | §8.50 | `/app/secretarial` |
| 40 | `workforce` | **This pack §20** | §8.50 | `/app/people-analytics` |
| 41 | `integrations` | **This pack §21** | §8.50 | `/app/settings/integrations` |
| 42 | `performance` | **This pack §22** | §8.50 | `/app/performance` |
| 43 | `accounting` | **This pack §23** | §8.50 | `/app/accounting` |
| 44 | `customFields` | **This pack §24** | §8.50 | `/app/admin` (definitions) |
| 45 | `payroll` | **This pack §25** | §8.50 | `/app/payroll` |

---

## 1. `mac`

| ID | Requirement |
|----|-------------|
| ENV-MAC-01 | No org session required for `mac.stats` smoke. |

| Case ID | Steps | Expected |
|---------|-------|----------|
| MAC-TC-01 | Call `mac.stats` (or open any consumer that uses it) | Numeric aggregates; no 500 |
| MAC-TC-02 | Rate-limit / abuse N/A for v1 | Document N/A |

---

## 2. `assets`

| ID | Requirement |
|----|-------------|
| ENV-AS-01 | Same as ITSM ENV-01–03. |

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| AS-TC-01 | P1 | `/app/ham` | List or empty state; no runtime error |
| AS-TC-02 | P1 | Create asset (if UI) | Row visible or API §8.50 |
| AS-TC-03 | P5 | Open `/app/ham` | Read-only; no destructive controls |

---

## 3. `workflows`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| WF-TC-01 | P1 | `/app/workflows` | List loads |
| WF-TC-02 | P1 | Create manual workflow | L8 create → list → get |
| WF-TC-03 | P1 | `/app/flows` (designer) | Loads or gated 403 documented |

---

## 4. `workOrders`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| WO-TC-01 | P2 | `/app/work-orders` | List loads |
| WO-TC-02 | P2 | Create WO → open detail | L8 §8.37 |
| WO-TC-03 | P2 | `/app/work-orders/parts` | Loads or empty |

---

## 5. `projects`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| PJ-TC-01 | P1 | `/app/projects` | Portfolio loads |
| PJ-TC-02 | P1 | Open first project | Detail 200 |
| PJ-TC-03 | P2 | Create project (if exposed) | L8 §8.18 |

---

## 6. `devops`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| DO-TC-01 | P2 | `/app/devops` | Pipelines / DORA widgets |
| DO-TC-02 | — | `devops.listPipelines({})` | Array (L8) |
| DO-TC-03 | P2 | `doraMetrics` | Object shape |

---

## 7. `surveys`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| SV-TC-01 | P1 | `/app/surveys` | List loads |
| SV-TC-02 | P1 | Create draft survey | L8 create → list |
| SV-TC-03 | P5 | Open surveys | Read-only |

---

## 8. `apm`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| APM-TC-01 | P1 | `/app/apm` | Portfolio summary visible |
| APM-TC-02 | P1 | Register application | L8 create + list |
| APM-TC-03 | P5 | Open APM | No admin mutations |

---

## 9. `oncall`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| OC-TC-01 | P1 | `/app/on-call` | Schedules or empty |
| OC-TC-02 | P1 | Create schedule | L8 §8.50 |
| OC-TC-03 | P2 | `activeRotation` | Array |

---

## 10. `events`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| EV-TC-01 | P2 | `/app/events` | Event list / dashboard |
| EV-TC-02 | — | `events.list` + `healthNodes` | L8 |
| EV-TC-03 | P2 | CMDB link from IT ops | `/app/cmdb` loads |

---

## 11. `facilities`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| FC-TC-01 | P1 | `/app/facilities` | Buildings / space |
| FC-TC-02 | P1 | Create building | L8 |
| FC-TC-03 | P5 | View facilities | Read-only |

---

## 12. `walkup`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| WU-TC-01 | P4 | `/app/walk-up` | Queue join (kiosk persona) |
| WU-TC-02 | — | `joinQueue` + `list` | L8 |
| WU-TC-03 | P2 | Agent view of walk-up | If separate route |

---

## 13. `reports`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| RP-TC-01 | P2 | `/app/reports` | Analytics shell loads |
| RP-TC-02 | P1 | Run canned report (if any) | 200 + export N/A documented |
| RP-TC-03 | P5 | Open reports | Viewer-safe |

---

## 14. `search`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| SR-TC-01 | P2 | Global search from shell | Results or empty |
| SR-TC-02 | — | `search.global` (L8 §8.30) | No 500 |
| SR-TC-03 | P5 | Search tickets | No privileged fields |

---

## 15. `ai`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| AI-TC-01 | P2 | Summarize ticket (if UI button) | Null or string without key |
| AI-TC-02 | — | L8 `ai.summarizeTicket` | Passes |
| AI-TC-03 | — | ENV optional OpenAI | N/A in CI documented |

---

## 16. `indiaCompliance`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| IN-TC-01 | P1 | HR → statutory panels | TDS / ECR lists or empty |
| IN-TC-02 | — | `indiaCompliance.calendar.list` | L8 |
| IN-TC-03 | P1 | CSM portal users tab | If present; suspend N/A in demo |

---

## 17. `assignmentRules`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| AR-TC-01 | P1 | `/app/admin` → assignment rules | List |
| AR-TC-02 | P1 | Create rule | L8 list |
| AR-TC-03 | P4 | Attempt mutate | Hidden or 403 |

---

## 18. `recruitment`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| RC-TC-01 | P1 | `/app/recruitment` | Dashboard |
| RC-TC-02 | P1 | Create requisition | L8 |
| RC-TC-03 | P2 | Pipeline tab | Loads |

---

## 19. `secretarial`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| SC-TC-01 | P1 | `/app/secretarial` | Tabs load |
| SC-TC-02 | P1 | Create board meeting | L8 |
| SC-TC-03 | P5 | View secretarial | Read-only |

---

## 20. `workforce`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| WFA-TC-01 | P1 | `/app/people-analytics` | Headcount / tenure widgets |
| WFA-TC-02 | — | `workforce.headcount` + `tenure` | L8 |
| WFA-TC-03 | P5 | Open analytics | Aggregates only |

---

## 21. `integrations`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| IG-TC-01 | P1 | `/app/settings/integrations` | Hub catalog |
| IG-TC-02 | — | `integrations.hubCatalog` + `listIntegrations` | L8 |
| IG-TC-03 | P1 | Webhooks / API keys pages | `/app/settings/webhooks` etc. |

---

## 22. `performance`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| PM-TC-01 | P1 | `/app/performance` | Cycles tab |
| PM-TC-02 | P1 | Create review cycle | L8 |
| PM-TC-03 | P3 | My reviews tab | Self-service |

---

## 23. `accounting`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| AC-TC-01 | P1 | `/app/accounting` | COA / journals shell |
| AC-TC-02 | — | `accounting.coa.seed` + `list` | L8 |
| AC-TC-03 | P5 | View accounting | Read or hidden |

---

## 24. `customFields`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| CF-TC-01 | P1 | Admin → field definitions | List for entity ticket |
| CF-TC-02 | — | `customFields.listDefinitions` | L8 |
| CF-TC-03 | P4 | Attempt definition create | 403 |

---

## 25. `payroll`

| Case ID | Persona | Steps | Expected |
|---------|---------|-------|----------|
| PR-TC-01 | P1 | `/app/payroll` | Runs / payslips shell |
| PR-TC-02 | — | `payroll.runs.list({})` | L8 |
| PR-TC-03 | P1 | Tax preview (if UI) | Matches API contract |

---

## 26. Completion rule (long-tail)

For each router in §0: **at least one** of: dedicated pillar pack **or** §1–§25 here **or** merged ITSM/platform/procurement pack — plus **Layer 8** where applicable — plus **Playwright** row in `e2e/module-routes.spec.ts` where a first-class `/app/*` route exists.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Closes C1 “remaining namespaces” at 100% for long-tail program (excludes full ITSM-grade C1–C7 everywhere). |
