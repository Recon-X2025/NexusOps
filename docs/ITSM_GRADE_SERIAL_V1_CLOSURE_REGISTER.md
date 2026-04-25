# ITSM-grade serial program — **closure register** (Seq 0–44) — v1 register + **v2.0 program evidence**

**Purpose:** Single traceability artefact for **`docs/ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` §3** after the **v1 execution pass** (2026-04-07). **v2.0** hardens **Class P** rows **13–16** and **25–26 · 34** with dedicated Playwright + Vitest pointers (below); **v2.1** locks **100%** of the **automated** bar: **`.github/workflows/ci.yml`** runs **`test`** (Turbo `pnpm test`) + **`e2e`** (full **`e2e/`** Playwright). **v2.3** adds **`pnpm test:class-l`** (`scripts/run-class-l-tests.sh`) to re-run **Class L** Vitest + hero Playwright without the full suite. **Class P** is unchanged — full **Class L** per-router waves remain optional upgrades.  
**Important:** **“v1 closure”** here means **every row has a mapped evidence chain** (C1 pack or approved index, C5 Layer 8, C4 Playwright where a route exists, C6 where Vitest exists, C2/C3/C7 pointers). It does **not** mean every router received a **dedicated LG-style** 10-case pack + unique gap PDF — that remains **per-module upgrade** work where Class = **P** (program).

**Class legend**

| Class | Meaning |
|-------|---------|
| **R** | **Reference** — `tickets`; maintenance only. |
| **L** | **LG / FP / stack-grade** — dedicated C1–C7 wave artefacts in repo for this slice. |
| **P** | **Program-grade** — satisfied by **`docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` §0** row + **`apps/api/src/__tests__/layer8-module-smoke.test.ts`** + **`e2e/module-routes.spec.ts`** (and, for Seq **13–16**, dedicated **`e2e/grc|csm|hr|crm.spec.ts`**) + **CI `e2e` job** (full Playwright) (+ umbrella C2/C3 in `docs/ITSM_GAP_REMEDIATION_BUILD_PLAN.md` / `docs/ITSM_STAGING_RUNBOOK.md` / `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §6). |

**Evidence columns:** **C1** primary doc · **C5** Layer 8 section · **C4** Playwright · **C6** Vitest (if any) · **C2/C3/C7** umbrella.

---

## Register (ordered backlog)

| Seq | `appRouter` key | Class | C1 (pack / index) | C5 (L8) | C4 (UI smoke) | C6 (RBAC / Vitest) | C2 / C3 / C7 |
|-----|-----------------|-------|-------------------|---------|---------------|---------------------|--------------|
| 0 | `tickets` | R | `docs/QA_ITSM_E2E_TEST_PACK.md` | §8.01 | `e2e/tickets.spec.ts`, `layer10-journeys` | `e2e/rbac.spec.ts` patterns | `ITSM_GAP_REMEDIATION_BUILD_PLAN.md`; `ITSM_STAGING_RUNBOOK.md`; enums in ITSM pack |
| 1 | `changes` | **L** | `docs/QA_CHANGES_ITSM_E2E_TEST_PACK.md` | §8.02 (Seq 1 depth) | `e2e/changes.spec.ts` | `changes-rbac.test.ts` | `CHANGES_GAP_REMEDIATION_BUILD_PLAN.md`; `CHANGES_STAGING_RUNBOOK.md`; QA pack Part IV |
| 2 | `workOrders` | **L** | `docs/QA_WORK_ORDERS_ITSM_E2E_TEST_PACK.md` + long-tail §4 | §8.37 (Seq 2 depth) | `e2e/work-orders.spec.ts` | `work-orders-rbac.test.ts` | `WORK_ORDERS_GAP_REMEDIATION_BUILD_PLAN.md`; `WORK_ORDERS_STAGING_RUNBOOK.md`; Part III |
| 3 | `knowledge` | **L** | `docs/QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md` §4 (KNG) | §8.22 (Seq 3 depth) | `e2e/knowledge.spec.ts` | `knowledge-catalog-rbac.test.ts` | `KNOWLEDGE_CATALOG_GAP_REMEDIATION_BUILD_PLAN.md`; `KNOWLEDGE_CATALOG_STAGING_RUNBOOK.md`; pack §6 |
| 4 | `catalog` | **L** | Same pack §5 (KCT) | §8.35 (Seq 4 depth) | `e2e/catalog.spec.ts` | same Vitest (catalog cases) | same C2/C3 as row 3 |
| 5 | `approvals` | **L** | `docs/QA_APPROVALS_E2E_TEST_PACK.md` | §8.36 (Seq 5 depth + RBAC in L8) | `e2e/approvals.spec.ts` (`/app/flows`) | `approvals-rbac.test.ts` | `APPROVALS_GAP_REMEDIATION_BUILD_PLAN.md`; `APPROVALS_STAGING_RUNBOOK.md` |
| 6 | `notifications` | **L** | `docs/QA_NOTIFICATIONS_ITSM_E2E_TEST_PACK.md` | §8.29 (Seq 6 depth) | `e2e/notifications.spec.ts` | `notifications-rbac.test.ts` | `NOTIFICATIONS_GAP_REMEDIATION_BUILD_PLAN.md`; `NOTIFICATIONS_STAGING_RUNBOOK.md`; pack Part II–III |
| 7 | `search` | **L** | `docs/QA_SEARCH_ITSM_E2E_TEST_PACK.md` + long-tail §14 | §8.30 (Seq 7 depth) | `e2e/search.spec.ts` | L8 §8.30 + pack Part II (C6 N/A) | `SEARCH_GAP_REMEDIATION_BUILD_PLAN.md`; `SEARCH_STAGING_RUNBOOK.md` |
| 8 | `reports` | **L** | `docs/QA_REPORTS_ITSM_E2E_TEST_PACK.md` | §8.31 (Seq 8 depth) | `e2e/reports.spec.ts` | `reports-dashboard-rbac.test.ts` | `REPORTS_GAP_REMEDIATION_BUILD_PLAN.md`; `REPORTS_STAGING_RUNBOOK.md` |
| 9 | `dashboard` | **L** | `docs/QA_DASHBOARD_ITSM_E2E_TEST_PACK.md` + shell pack | §8.39 + **§8.40** (Seq 9) | `e2e/dashboard.spec.ts` | same Vitest (`reports:read` gate) | `DASHBOARD_GAP_REMEDIATION_BUILD_PLAN.md`; `DASHBOARD_STAGING_RUNBOOK.md` |
| 10 | `admin` | **L** | `docs/QA_ADMIN_ITSM_E2E_TEST_PACK.md` + shell pack | §8.32 (Seq 10 depth) | `e2e/admin.spec.ts` | `admin-rbac.test.ts` | `ADMIN_GAP_REMEDIATION_BUILD_PLAN.md`; `ADMIN_STAGING_RUNBOOK.md` |
| 11 | `auth` | **L** | `docs/QA_AUTH_ITSM_E2E_TEST_PACK.md` + shell pack | **§8.44** (Seq 11 depth) | `e2e/auth.spec.ts` | `auth-rbac.test.ts` | `AUTH_GAP_REMEDIATION_BUILD_PLAN.md`; `AUTH_STAGING_RUNBOOK.md` |
| 12 | `security` | **L** | `docs/QA_SECURITY_ITSM_E2E_TEST_PACK.md` + compliance index pointer | §8.10 (Seq 12 depth) | `e2e/security.spec.ts` | `security-rbac.test.ts` | `SECURITY_GAP_REMEDIATION_BUILD_PLAN.md`; `SECURITY_STAGING_RUNBOOK.md` |
| 13 | `grc` | P | `QA_COMPLIANCE_E2E_TEST_PACK.md` | §8.11 (Seq 13 depth), §8.42 | `e2e/grc.spec.ts` | `grc-rbac.test.ts` + §8.42 | **Baseline index** + umbrella |
| 14 | `csm` | P | `docs/QA_CSM_E2E_TEST_PACK.md` | §8.34 (Seq 14 depth) | `e2e/csm.spec.ts` | `csm-rbac.test.ts` + §8.42 | **Baseline index** + umbrella |
| 15 | `hr` | P | `docs/QA_HR_E2E_TEST_PACK.md` | §8.33 (Seq 15 depth) | `e2e/hr.spec.ts` | `hr-crm-rbac.test.ts` (HR list sanity) + §8.42 | **Baseline index** + umbrella |
| 16 | `crm` | P | `docs/QA_CRM_E2E_TEST_PACK.md` | §8.15 | `e2e/crm.spec.ts` | `hr-crm-rbac.test.ts` (CRM deny/create) + §8.42 | **Baseline index** + umbrella |
| 17 | `legal` | L | `docs/QA_LEGAL_GOVERNANCE_E2E_TEST_PACK.md` (LG-1) | §8.38 | `e2e/legal-governance.spec.ts` (`/app/legal`) | `legal-governance-rbac.test.ts` | `LEGAL_GOVERNANCE_GAP_*`; Part IV enums |
| 18 | `contracts` | L | Same LG pack (LG-2) | §8.14 | `e2e/legal-governance.spec.ts` (`/app/contracts`) | `legal-governance-rbac.test.ts` | LG gap plan |
| 19 | `procurement` | L | `docs/QA_FINANCE_PROCUREMENT_E2E_TEST_PACK.md` | §8.12 | `e2e/finance-procurement.spec.ts` | `finance-procurement-rbac.test.ts` | FP gap + runbook |
| 20 | `vendors` | L | FP pack Part III + `QA_PROCUREMENT_FINANCE_E2E_TEST_PACK.md` | §8.24 | `e2e/finance-procurement.spec.ts` (`/app/vendors`) | `finance-procurement-rbac.test.ts` | FP runbook |
| 21 | `financial` | L | FP pack + `QA_FINANCE_SEQUENCE_21_23_E2E_TEST_PACK.md` §I | §8.39 | `e2e/finance-sequence-21-23.spec.ts` (`/app/financial`) | `finance-procurement-rbac.test.ts` | FP + Seq runbooks |
| 22 | `inventory` | L | `QA_FINANCE_SEQUENCE_21_23` Part II | **§8.53** | `e2e/finance-sequence-21-23.spec.ts` (`/app/work-orders/parts`) | `finance-sequence-21-23-rbac.test.ts` | Seq gap + C7 `work_orders` key |
| 23 | `accounting` | L | `QA_FINANCE_SEQUENCE_21_23` Part III | **§8.54** | `e2e/finance-sequence-21-23.spec.ts` (`/app/accounting`) | `finance-sequence-21-23-rbac.test.ts` | Seq gap + C7 |
| 24 | `payroll` | P | Long-tail §25 | §8.50 | `/app/payroll` | §8.42 | **Baseline index** + umbrella |
| 25 | `projects` | P | Long-tail §5 | §8.18 | `e2e/module-routes.spec.ts` (`/app/projects`) | **`serial-longtail-rbac.test.ts`** (`projects.create` deny) + §8.42 | **Baseline index** + umbrella |
| 26 | `devops` | P | Long-tail §6 | §8.50 | `e2e/module-routes.spec.ts` (`/app/devops`) | **`serial-longtail-rbac.test.ts`** (`devops.createPipelineRun` deny) + §8.42 | **Baseline index** + umbrella |
| 27 | `surveys` | P | Long-tail §7 | §8.50 | `/app/surveys` | §8.42 | **Baseline index** + umbrella |
| 28 | `apm` | P | Long-tail §8 | §8.50 | `/app/apm` | §8.42 | **Baseline index** + umbrella |
| 29 | `oncall` | P | Long-tail §9 | §8.50 | `/app/on-call` | §8.42 | **Baseline index** + umbrella |
| 30 | `events` | P | Long-tail §10 | §8.50 | `/app/events` | §8.42 | **Baseline index** + umbrella |
| 31 | `facilities` | P | Long-tail §11 | §8.50 | `/app/facilities` | §8.42 | **Baseline index** + umbrella |
| 32 | `walkup` | P | Long-tail §12 | §8.50 | `/app/walk-up` | §8.42 | **Baseline index** + umbrella |
| 33 | `assets` | P | Long-tail §2 | §8.50 | `/app/ham` | §8.42 | **Baseline index** + umbrella |
| 34 | `workflows` | P | Long-tail §3 | §8.50 | `e2e/module-routes.spec.ts` (`/app/workflows`) | **`serial-longtail-rbac.test.ts`** (`workflows.create` deny) + §8.42 | **Baseline index** + umbrella |
| 35 | `recruitment` | P | Long-tail §18 | §8.50 | `/app/recruitment` | §8.42 | **Baseline index** + umbrella |
| 36 | `workforce` | P | Long-tail §20 | §8.50 | `/app/people-analytics` | §8.42 | **Baseline index** + umbrella |
| 37 | `performance` | P | Long-tail §22 | §8.50 | `/app/performance` | §8.42 | **Baseline index** + umbrella |
| 38 | `secretarial` | L | LG pack Part III | **§8.51** | `e2e/legal-governance.spec.ts` (`/app/secretarial`) | `legal-governance-rbac.test.ts` | LG gap plan |
| 39 | `indiaCompliance` | P | Long-tail §16 | §8.50 | HR/CSM statutory spot-checks | §8.42 | **Baseline index** + umbrella |
| 40 | `assignmentRules` | P | Long-tail §17 | §8.50 | `/app/admin` | §8.42 | **Baseline index** + umbrella |
| 41 | `integrations` | P | Long-tail §21 | §8.50 | `/app/settings/integrations` | §8.42 | **Baseline index** + umbrella |
| 42 | `customFields` | P | Long-tail §24 | §8.50 | `/app/admin` | §8.42 | **Baseline index** + umbrella |
| 43 | `ai` | P | Long-tail §15 | §8.50 (`ai.summarizeTicket`) | `/app/tickets` | §8.42 | **Baseline index** + umbrella |
| 44 | `mac` | P | Long-tail §1 | Public / `mac.stats` | N/A (documented) | N/A | **Baseline index** + umbrella |

**Umbrella (Class P) for C2 / C3 / C7:**  
- **C2:** `docs/ITSM_GAP_REMEDIATION_BUILD_PLAN.md` + hero one-liners in `ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` §3.  
- **C3:** `docs/ITSM_STAGING_RUNBOOK.md` + `docs/STAGING_RUNBOOK_MODULES_ADDENDA.md` (if present) + module-specific runbooks where **L** class landed.  
- **C7:** `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §6 + per-wave Part IV tables (LG, FP, Seq 21–23).  
- **Class P row pointer (Seq 13–44):** `docs/ITSM_GRADE_BASELINE_TRACEABILITY_INDEX.md` — single-table evidence for baseline program closure.

---

## Upgrade path (true per-router ITSM density)

Any **Class P** row may be promoted to **Class L** by running the **§2 epic template** in `ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` (dedicated `QA_<MODULE>_E2E_TEST_PACK.md` with **≥10** cases, gap plan, runbook, deep L8, RBAC Vitest, Playwright hero paths beyond load-only).

**Multi-quarter sequencing, phases, P→L rules, KPIs:** `docs/ITSM_CLASS_L_PER_ROUTER_ROLLOUT_PLAN.md`.

---

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | v1 serial closure register — post sprint Seq 21–23 |
| 1.1 | 2026-04-07 | Seq 1 **`changes`** promoted to **Class L** (dedicated C1–C7 artefacts) |
| 1.2 | 2026-04-07 | Seq **2–5** (`workOrders`, `knowledge`, `catalog`, `approvals`) → **Class L**; Seq **6–44** baseline index for **Class P** |
| 1.3 | 2026-04-07 | Seq **6–7** (`notifications`, `search`) → **Class L**; baseline index now **Seq 8–44** |
| 1.4 | 2026-04-07 | Seq **8–9** (`reports`, `dashboard`) → **Class L**; baseline index now **Seq 10–44** |
| 1.5 | 2026-04-07 | Seq **10** (`admin`) → **Class L**; baseline index now **Seq 11–44** |
| 1.6 | 2026-04-07 | Seq **11** (`auth`) → **Class L**; baseline index now **Seq 12–44** |
| 1.7 | 2026-04-07 | Seq **12** (`security`) → **Class L**; baseline index now **Seq 13–44** |
| **2.0** | 2026-04-07 | **Class P evidence closure:** Seq **13–16** — L8 **Seq depth** in `layer8-module-smoke` (§8.11 / §8.34 / §8.33), Vitest **`grc-rbac`**, **`csm-rbac`**, **`hr-crm-rbac`**, C4 **`e2e/grc|csm|hr|crm.spec.ts`**. Seq **25–26 · 34** — **`serial-longtail-rbac.test.ts`** write denies (`projects` / `devops` / `workflows`). |
| **2.1** | 2026-04-07 | **100% automated gate:** CI **`test`** + **`e2e`** (Postgres, Redis, Meilisearch; `playwright install chromium --with-deps`; `e2e/global-setup` **`db:migrate`** + seed). Turbo **`test` → `build`**; Vitest **`fileParallelism: false`**; Layers **5/6/9** use **`createSession`**; **`module-routes`** uses **`load`** (not `networkidle`); tickets/RBAC E2E aligned to UI + seeded personas. |
| **2.2** | 2026-04-07 | **Class L register hygiene:** Seq **17–18 · 38** C4 → explicit **`e2e/legal-governance.spec.ts`** paths; Seq **19–21** → **`e2e/finance-procurement.spec.ts`**; Seq **22–23** → **`e2e/finance-sequence-21-23.spec.ts`**; C6 → explicit `*.test.ts` filenames. **Execution:** Vitest sweep Layer 8 + all **Class L** `*-rbac` suites (excludes Class P-only `grc` / `csm` / `hr-crm` / `serial-longtail`). |
| **2.3** | 2026-04-07 | **Repeatable Class L execution:** root **`pnpm test:class-l`** runs **`scripts/run-class-l-tests.sh`** (same Vitest set as v2.2 + dedicated **Class L** Playwright specs: `changes` … `finance-sequence-21-23`). |
