# Module gap remediation — execution status

**Source plan:** `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` · **ITSM-grade (C1–C7) serial program:** `docs/ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md`  
**Last updated:** 2026-04-07 (serial register **v2.4**: **`pnpm test:class-p`** for **Class P** L8 + RBAC + `module-routes` + GRC/CSM/HR/CRM; **v2.3** **`test:class-l`**; **v2.1** CI **`test`** + **`e2e`**; **v2.0** Class **P** evidence **13–16** + **25·26·34**)

**Full backlog (Seq 0–44) — v1 closure:** `docs/ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md` (**Class R/L/P** per module: **L** = LG/FP/stack waves; **P** = program-grade via long-tail + L8 + `module-routes`; **R** = tickets reference).

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
| tickets, contracts, grc, procurement, crm, projects | Partial → **retained** | Existing §8.01, §8.03–8.21, §8.23–8.28 |
| **`security`** | **Done** | **§8.10** Seq 12 depth (lifecycle + containment + `false_positive` + vulns + counts + list filter) |
| **`reports`** | **Done** | **§8.31** Seq 8 depth (exec SLA workload trend ITSM pack + `slaWhatIf`) |
| **`dashboard`** | **Done** | **§8.39** + **§8.40** Seq 9 (`getTimeSeries`, `getTopCategories`) |
| **`admin`** | **Done** | **§8.32** Seq 10 depth (users, audit, properties, stubs, **business rules** lifecycle, jobs) |
| **`auth`** | **Done** | **§8.44** Seq 11: `me`, login deny, profile, `listMySessions`, logout, **invite → accept → deleteUser** |
| **`notifications`** | **Done** | **§8.29** Seq 6: `send` → agent unread → `markRead` + `getPreferences`; ticket + `markAllRead` |
| **`search`** | **Done** | **§8.30** Seq 7: `global` array + `entityTypes` filter |
| **`knowledge`** | **Done** | **§8.22** Seq 3: list → publish → get → `recordFeedback` |
| **`changes`** | **Done** | **§8.02** Seq 1 depth: lifecycle, reject, `statusCounts`, `addComment`, blackout + overlap (`layer8-module-smoke`) |
| Procurement PR reject | **Done** | `8.12` second test: large PR → `reject` |
| GRC audit + vendor risk | **Done** | `8.11` third test (`questionnaire_status`: `completed`) |
| CRM list + closed_lost | **Done** | `8.15` second test |
| Contracts wizard + obligation | **Done** | `8.14` second test (`obligation_frequency`: `annually`) |
| HR | **Done** | `8.33` employee → case → resolve → leave → approve |
| CSM | **Done** | `8.34` + `csm_cases` in `0014_layer8_schema_alignment`; list handler normalizes `db.execute` row shape |
| Catalog | **Done** | **§8.35** Seq 4: `listItems` → `getItem` → submit → `listRequests` → `stats` |
| Approvals | **Done** | **§8.36** Seq 5: list / myPending / mySubmitted + **viewer `decide` deny** |
| Work orders | **Done** | **§8.37** Seq 2: full WO + task + note + metrics (`layer8-module-smoke`) |
| Legal investigations | **Done** | `8.38` create → list → close |
| Financial + dashboard | **Done** | `8.39` + invoice columns in `0014_layer8_schema_alignment` |
| Top-level `vendors` | **Done** | `8.24` second test: `get` + `update` |
| RBAC 403 (viewer GRC write denial) | **Done** | `8.42` asserts `grc.createRisk` forbidden for viewer |
| mac, assets, workflows, payroll, workforce, recruitment, performance, devops, surveys, apm, oncall, events, facilities, walkup, ai, indiaCompliance, assignmentRules, integrations, customFields | **Done** | `8.50` + `0014_layer8_schema_alignment` (performance, custom fields, `csm_cases`) |
| **inventory** | **Done** | **`8.53`** (Seq 22 depth) |
| **accounting** | **Done** | **`8.54`** (Seq 23 depth; replaces thin COA-only `8.50` row) |
| **secretarial** | **Done** | **`8.51`** (LG-3) |

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
| **`QA_CHANGES_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 1 `changes` (≥10 cases + Part IV C7) |
| **`QA_WORK_ORDERS_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 2 `workOrders` |
| **`QA_NOTIFICATIONS_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 6 |
| **`QA_SEARCH_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 7 |
| **`QA_REPORTS_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 8 |
| **`QA_DASHBOARD_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 9 |
| **`QA_ADMIN_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 10 |
| **`QA_AUTH_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 11 |
| **`QA_SECURITY_ITSM_E2E_TEST_PACK.md`** | **Done** | Seq 12 |

---

## C2 — Gap / remediation plans

| Doc | Status |
|-----|--------|
| `ITSM_GAP_REMEDIATION_BUILD_PLAN.md` | Done (ITSM) |
| **`CHANGES_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 1 `changes` hero scope + exit criteria |
| **`WORK_ORDERS_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 2 |
| **`KNOWLEDGE_CATALOG_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 3–4 |
| **`APPROVALS_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 5 |
| **`ITSM_GRADE_BASELINE_TRACEABILITY_INDEX.md`** | **Done** | Class **P** rows Seq **13–44** |
| **`NOTIFICATIONS_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 6 |
| **`SEARCH_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 7 |
| **`REPORTS_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 8 |
| **`DASHBOARD_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 9 |
| **`ADMIN_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 10 |
| **`AUTH_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 11 |
| **`SECURITY_GAP_REMEDIATION_BUILD_PLAN.md`** | **Done** | Seq 12 |
| `NEXUSOPS_MODULE_GAP_REMEDIATION_PROGRAM.md` | **Done** (program-level exit criteria) |
| `CRM_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** (CRM-specific C2) |

---

## C3 — Staging runbooks

| Doc | Status |
|-----|--------|
| `ITSM_STAGING_RUNBOOK.md` | Done |
| **`CHANGES_STAGING_RUNBOOK.md`** | **Done** | Seq 1 Redis note + smoke checklist |
| **`WORK_ORDERS_STAGING_RUNBOOK.md`** | **Done** | Seq 2 |
| **`KNOWLEDGE_CATALOG_STAGING_RUNBOOK.md`** | **Done** | Seq 3–4 |
| **`APPROVALS_STAGING_RUNBOOK.md`** | **Done** | Seq 5 |
| **`NOTIFICATIONS_STAGING_RUNBOOK.md`** | **Done** | Seq 6 |
| **`SEARCH_STAGING_RUNBOOK.md`** | **Done** | Seq 7 |
| **`REPORTS_STAGING_RUNBOOK.md`** | **Done** | Seq 8 |
| **`DASHBOARD_STAGING_RUNBOOK.md`** | **Done** | Seq 9 |
| **`ADMIN_STAGING_RUNBOOK.md`** | **Done** | Seq 10 |
| **`AUTH_STAGING_RUNBOOK.md`** | **Done** | Seq 11 |
| **`SECURITY_STAGING_RUNBOOK.md`** | **Done** | Seq 12 |
| `STAGING_RUNBOOK_MODULES_ADDENDA.md` | **Done** (cross-module ENV + N/A) |

---

## C4 — Playwright

| Spec | Status |
|------|--------|
| `e2e/tickets.spec.ts`, `approvals.spec.ts`, `rbac.spec.ts`, `layer10-journeys.spec.ts` | Done (existing hero paths) |
| **`e2e/auth.spec.ts`** | **Done** | Seq 11 `/login` + `/signup` + `data-testid` login flow |
| **`e2e/security.spec.ts`** | **Done** | Seq 12 `/app/security` |
| `e2e/module-routes.spec.ts` | **Done** | P1 admin serial sweep of **40+** `/app/*` routes + P2 HR/CSM/catalog (`QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` §0 Playwright column) |
| **`e2e/changes.spec.ts`** | **Done** | Seq 1 `/app/changes` hero load |
| **`e2e/work-orders.spec.ts`** | **Done** | Seq 2 `/app/work-orders` + `/app/work-orders/parts` |
| **`e2e/knowledge.spec.ts`** | **Done** | Seq 3 `/app/knowledge` |
| **`e2e/catalog.spec.ts`** | **Done** | Seq 4 `/app/catalog` |
| **`e2e/approvals.spec.ts`** | **Done** | Seq 5 (extended `/app/flows`) |
| **`e2e/notifications.spec.ts`** | **Done** | Seq 6 `/app/notifications` |
| **`e2e/search.spec.ts`** | **Done** | Seq 7 dashboard / search surface |
| **`e2e/reports.spec.ts`** | **Done** | Seq 8 `/app/reports` |
| **`e2e/dashboard.spec.ts`** | **Done** | Seq 9 `/app/dashboard` |
| **`e2e/admin.spec.ts`** | **Done** | Seq 10 `/app/admin` |
| **`e2e/grc.spec.ts`** · **`e2e/csm.spec.ts`** · **`e2e/hr.spec.ts`** · **`e2e/crm.spec.ts`** | **Done** | Seq **13–16** admin load smoke (`ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md` v2.0) |

---

## ITSM-grade — Legal & Governance wave (LG-1 → LG-3)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_LEGAL_GOVERNANCE_E2E_TEST_PACK.md` | **Done** (Parts I–IV) |
| C2 | `docs/LEGAL_GOVERNANCE_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** (checklists for PM sign-off) |
| C3 | `docs/LEGAL_GOVERNANCE_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/legal-governance.spec.ts` | **Done** |
| C5 | `layer8-module-smoke` §8.38 + §8.14 + **§8.51** | **Done** |
| C6 | `apps/api/src/__tests__/legal-governance-rbac.test.ts` | **Done** |
| C7 | Part IV enum ↔ UI (`legal/page.tsx`) | **Done** (aligned to Postgres enums + API field names) |

**Also:** `secretarial` added to `apps/api/src/server/rbac.ts` permission matrix (was implicitly open).

---

## ITSM-grade — Finance & Procurement wave (FP-1 → FP-3)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_FINANCE_PROCUREMENT_E2E_TEST_PACK.md` | **Done** (Parts I–IV) |
| C2 | `docs/FINANCE_PROCUREMENT_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/FINANCE_PROCUREMENT_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/finance-procurement.spec.ts` | **Done** |
| C5 | `layer8-module-smoke` §8.39 extended + §8.12 + §8.24 | **Done** |
| C6 | `apps/api/src/__tests__/finance-procurement-rbac.test.ts` | **Done** |
| C7 | QA pack Part IV (RBAC nuances + thresholds) | **Done** |

---

## ITSM-grade — Finance stack **Seq 21 · 22 · 23** (sprint)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_FINANCE_SEQUENCE_21_23_E2E_TEST_PACK.md` | **Done** (§21 traces FP pack + §8.39; §§22–23 ≥10 cases each) |
| C2 | `docs/FINANCE_SEQUENCE_21_23_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/FINANCE_SEQUENCE_21_23_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/finance-sequence-21-23.spec.ts` (+ `e2e/finance-procurement.spec.ts` for Seq 21) | **Done** |
| C5 | L8 **§8.39** + **§8.53** + **§8.54** | **Done** |
| C6 | `finance-procurement-rbac.test.ts` + `finance-sequence-21-23-rbac.test.ts` | **Done** |
| C7 | QA pack Part IV (`work_orders` vs `financial` module keys) | **Done** |

---

## ITSM-grade — **Changes** (Seq 1)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_CHANGES_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `docs/CHANGES_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/CHANGES_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/changes.spec.ts` | **Done** |
| C5 | `layer8-module-smoke` **§8.02** (two ITSM-grade cases) | **Done** |
| C6 | `apps/api/src/__tests__/changes-rbac.test.ts` | **Done** |
| C7 | QA pack Part IV (`update` + `status` risk; enum ↔ router) | **Done** |

---

## ITSM-grade — **Work orders** (Seq 2)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_WORK_ORDERS_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `docs/WORK_ORDERS_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/WORK_ORDERS_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/work-orders.spec.ts` | **Done** |
| C5 | `layer8-module-smoke` **§8.37** (Seq 2 depth) | **Done** |
| C6 | `apps/api/src/__tests__/work-orders-rbac.test.ts` | **Done** |
| C7 | QA pack Part III (`updateTask` scope note) | **Done** |

---

## ITSM-grade — **Knowledge + catalog** (Seq 3–4)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md` (v1.1 KNG/KCT + §6) | **Done** |
| C2 | `docs/KNOWLEDGE_CATALOG_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/KNOWLEDGE_CATALOG_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/knowledge.spec.ts` + `e2e/catalog.spec.ts` | **Done** |
| C5 | L8 **§8.22** + **§8.35** (Seq depth) | **Done** |
| C6 | `apps/api/src/__tests__/knowledge-catalog-rbac.test.ts` | **Done** |
| C7 | KCP pack §6 RBAC matrix notes | **Done** |

---

## ITSM-grade — **Approvals** (Seq 5)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_APPROVALS_E2E_TEST_PACK.md` | **Done** (existing) |
| C2 | `docs/APPROVALS_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/APPROVALS_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/approvals.spec.ts` (incl. `/app/flows`) | **Done** |
| C5 | L8 **§8.36** (+ viewer deny in L8) | **Done** |
| C6 | `apps/api/src/__tests__/approvals-rbac.test.ts` | **Done** |
| C7 | Matrix: `approvals:approve` vs `read` | **Done** (pack + Vitest) |

---

## ITSM-grade — **Notifications** (Seq 6)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_NOTIFICATIONS_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `docs/NOTIFICATIONS_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/NOTIFICATIONS_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/notifications.spec.ts` | **Done** |
| C5 | L8 **§8.29** (Seq 6 depth) | **Done** |
| C6 | `apps/api/src/__tests__/notifications-rbac.test.ts` | **Done** |
| C7 | Pack Part II–III (prefs upsert / `users:write` gate) | **Done** |

---

## ITSM-grade — **Search** (Seq 7)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_SEARCH_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `docs/SEARCH_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/SEARCH_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/search.spec.ts` | **Done** |
| C5 | L8 **§8.30** (Seq 7 depth) | **Done** |
| C6 | Pack Part II (protectedProcedure — no matrix deny) | **Done** |
| C7 | Meili `INDEXES` ↔ ops | **Done** (pack) |

---

## ITSM-grade — **Reports + dashboard** (Seq 8–9)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_REPORTS_ITSM_E2E_TEST_PACK.md` + `docs/QA_DASHBOARD_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `REPORTS_GAP_REMEDIATION_BUILD_PLAN.md` + `DASHBOARD_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `REPORTS_STAGING_RUNBOOK.md` + `DASHBOARD_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/reports.spec.ts` + `e2e/dashboard.spec.ts` | **Done** |
| C5 | L8 **§8.31** + **§8.39** / **§8.40** | **Done** |
| C6 | `reports-dashboard-rbac.test.ts` (`reports:read` on `requester`) | **Done** |
| C7 | Reports pack (`slaWhatIf` calendar); dashboard pack | **Done** |

---

## ITSM-grade — **Admin** (Seq 10)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_ADMIN_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `docs/ADMIN_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/ADMIN_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/admin.spec.ts` | **Done** |
| C5 | L8 **§8.32** (Seq 10 depth) | **Done** |
| C6 | `apps/api/src/__tests__/admin-rbac.test.ts` | **Done** |
| C7 | Pack Part II (`audit_logs.user_id` on job trigger) | **Done** |

---

## ITSM-grade — **Auth** (Seq 11)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_AUTH_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `docs/AUTH_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/AUTH_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/auth.spec.ts` | **Done** |
| C5 | L8 **§8.44** (Seq 11 depth) | **Done** |
| C6 | `apps/api/src/__tests__/auth-rbac.test.ts` | **Done** |
| C7 | Pack Part II (logout + Redis; `deactivateUser` enum); Part III frozen-`ctx` harness | **Done** |

---

## ITSM-grade — **Security** (Seq 12)

| Gate | Artefact | Status |
|------|----------|--------|
| C1 | `docs/QA_SECURITY_ITSM_E2E_TEST_PACK.md` | **Done** |
| C2 | `docs/SECURITY_GAP_REMEDIATION_BUILD_PLAN.md` | **Done** |
| C3 | `docs/SECURITY_STAGING_RUNBOOK.md` | **Done** |
| C4 | `e2e/security.spec.ts` | **Done** |
| C5 | L8 **§8.10** (Seq 12 depth — two cases) | **Done** |
| C6 | `apps/api/src/__tests__/security-rbac.test.ts` | **Done** |
| C7 | Pack Part II (state machine ↔ enums) | **Done** |

---

## Automated execution gate (**100%** of shipped automation)

| Gate | What “100%” means here | Status |
|------|-------------------------|--------|
| **Unit + integration** | **`pnpm test`** (Turbo): `@nexusops/api` Vitest (layers + RBAC + L8 smoke), `@nexusops/web` / `@nexusops/types` tests, `@nexusops/db` **`--passWithNoTests`**. Turbo **`test` depends on `build`** per package (no `tsup` races mid-Vitest). | **Done** |
| **E2E** | **`pnpm exec playwright test`** — full **`e2e/`** tree (80 tests): module route sweep, tickets, RBAC, Seq C4 specs, Layer 10 journeys. **`e2e/global-setup.ts`**: **`db:migrate`** + **`db:seed`**. | **Done** |
| **CI** | **`.github/workflows/ci.yml`**: job **`test`** (migrate + env) + job **`e2e`** (Postgres, Redis, Meilisearch, `playwright install chromium --with-deps`, same Playwright command). Job **`build`** (Docker) **`needs: [lint, test, e2e]`** on `main`. | **Done** |

Local mirror (Docker test stack + **`.env.test`**): `pnpm exec dotenv -e .env.test -- pnpm test` then `pnpm exec dotenv -e .env.test -- pnpm exec playwright test` (or `pnpm test:full-qa`).

**Targeted re-runs (closure register):** **`pnpm test:class-l`** (Seq **1–12 · 17–23 · 38**) · **`pnpm test:class-p`** (Seq **13–16 · 24–37 · 39–44** — L8 smoke + P RBAC + `module-routes` + GRC/CSM/HR/CRM).

---

## Honest conclusion

**Full ITSM-grade parity for all 45 routers (C1–C7 density per router)** remains a **multi-quarter** program — **out of scope** for the “long-tail 100%” pledge unless product resets the bar.

**Long-tail program (everything except that bar):** **C1** traceability for all namespaces is **Done** via pillar packs + `QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md`. **C3** addenda **Done**. **C5** Layer 8 batch **Done** (see table). **C4** Playwright **Done** for first-class `/app/*` load smoke (`module-routes.spec.ts`) plus **Seq 13–16** dedicated specs (`grc` / `csm` / `hr` / `crm`) and **CI `e2e`** runs the **entire** Playwright suite. **C6** adds **`grc-rbac.test.ts`**, **`csm-rbac.test.ts`**, **`hr-crm-rbac.test.ts`**, **`serial-longtail-rbac.test.ts`** (projects / devops / workflows denies). **C2** program **Done** where listed. **Serial Seq 2–12** (`workOrders` … `security`) match **Class L** in `ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md`; **Seq 13–44 Class P** rows use **`ITSM_GRADE_BASELINE_TRACEABILITY_INDEX.md`** (register **v2.0** evidence column, **v2.1** automation gate).

See **`docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §6.4** for document sync vs §6.2 router table.

**Per-router Class L (multi-quarter) program plan:** `docs/ITSM_CLASS_L_PER_ROUTER_ROLLOUT_PLAN.md`.
