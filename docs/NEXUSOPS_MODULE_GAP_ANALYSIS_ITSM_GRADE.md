# Module-level gap analysis — ITSM-grade readiness

**Purpose:** Compare each major surface to the **ITSM reference bar** and list **concrete gaps** to close for long-tail market readiness.  

**Execution ledger (living):** `docs/MODULE_GAP_EXECUTION_STATUS.md` — what landed vs still open. **All-router long-tail QA index:** `docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` (excludes full ITSM-grade C1–C7 per router). **Full ITSM-grade (C1–C7) serial program:** `docs/ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md`. **Serial v1 closure register (all Seq rows):** `docs/ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md`. **Legal & Governance ITSM-grade pack:** `docs/QA_LEGAL_GOVERNANCE_E2E_TEST_PACK.md`. **Finance & Procurement ITSM-grade pack:** `docs/QA_FINANCE_PROCUREMENT_E2E_TEST_PACK.md`. **Finance stack Seq 21–23 pack:** `docs/QA_FINANCE_SEQUENCE_21_23_E2E_TEST_PACK.md`.  

**ITSM reference bundle (the bar):**  
`docs/QA_ITSM_E2E_TEST_PACK.md` · `docs/ITSM_GAP_REMEDIATION_BUILD_PLAN.md` · `docs/ITSM_STAGING_RUNBOOK.md` · `e2e/tickets.spec.ts` · `e2e/layer10-journeys.spec.ts` (ticket paths) · `apps/api/src/__tests__/layer8-module-smoke.test.ts` §8.01 (deep: create/list/get/comment/assign/resolve + **relations** + **statusCounts**) · RBAC matrix in QA pack §3 + `apps/api/src/server/rbac.ts` · SLA/BullMQ **ENV-04** documentation.

**Ship context:** Aligns with `docs/NEXUSOPS_LONG_TAIL_MARKET_READY_PLAN.md` (Tier A/B).

---

## 1. ITSM-grade criteria (checklist per module)

| # | Criterion | ITSM today |
|---|-----------|------------|
| C1 | **Formal QA pack** (personas, ENV IDs, numbered cases, ITIL/practice traceability where relevant) | Yes — `QA_ITSM_E2E_TEST_PACK.md` |
| C2 | **Gap / remediation plan** (objectives → epics → exit criteria) | Yes — `ITSM_GAP_REMEDIATION_BUILD_PLAN.md` |
| C3 | **Staging runbook** (deps, N/A rules, repro steps) | Yes — `ITSM_STAGING_RUNBOOK.md` |
| C4 | **Playwright** (browser happy paths for core UX) | Yes — `e2e/tickets.spec.ts` + Layer 10 ticket journeys |
| C5 | **API smoke depth** (multi-step domain flow, not `expect(defined)`) | Strong — Layer 8 §8.01–8.02 + relations |
| C6 | **RBAC regression** (viewer/agent matrix + integration-style tests) | Strong — QA §3 + `rbac-user-stories.test.ts` + ticket procedures |
| C7 | **Doc ↔ schema ↔ UI** alignment for lifecycle enums | Addressed in ITSM build plan / migrations narrative |

**“ITSM-grade” = C1–C7 satisfied for that module’s hero scope.**

---

## 2. Summary matrix (module → vs bar)

Legend: **Yes** = meets bar · **Partial** = some evidence, gaps remain · **No** = missing or skeletal · **N/A** = not in long-tail Tier A/B scope.

| Module / domain | C1 QA pack | C2 Gap plan | C3 Runbook | C4 Playwright | C5 API smoke | C6 RBAC story | Overall vs ITSM |
|-----------------|------------|-------------|------------|----------------|--------------|---------------|-------------------|
| **ITSM (tickets + SLA + relations)** | Yes | Yes | Yes | Yes | Yes | Yes | **Reference** |
| **Knowledge** | Partial (inside ITSM pack only) | No | Partial | Partial | Yes (L8) | Partial | **Partial** |
| **Catalog** | Partial | No | Partial | No | Partial | Partial | **Partial** |
| **Portal (self-service)** | Partial | No | Partial | Partial | Via tickets | Partial | **Partial** |
| **Changes (IT change)** | No | No | Partial | No | Partial (L8) | Partial | **Partial** |
| **Work orders** | No | No | Partial | No | Partial elsewhere | Partial | **Partial** |
| **Approvals** | No | No | Partial | Yes (`approvals.spec`) | Partial | Partial | **Partial** |
| **Dashboard / command surface** | No | No | Partial | Partial (L10 login) | Partial | Partial | **Partial** |
| **Admin** | No | No | Partial | No | Partial (L8) | Partial | **Partial** |
| **HR (cases, leave, directory)** | No | No | No | No | **No** (not in L8) | Partial (`rbac-user-stories`) | **No** |
| **Payroll / workforce / recruitment / performance** | No | No | No | No | Partial / unknown | Partial | **No** |
| **CRM** | No | No | No | No | Partial (L8) | Partial | **No** |
| **CSM (customer service cases)** | No | No | No | No | **No** (not in L8) | Partial | **No** |
| **GRC (risk, policy, audits)** | No | No | No | No | Partial (L8) | Partial | **No** |
| **Security (incidents)** | No | No | Partial | No | Yes (L8 lifecycle) | Partial | **Partial** |
| **India compliance** | No | No | No | No | Unknown | Partial | **No** |
| **Legal (investigations)** | No | No | No | No | Partial (`layer7-row-access`) | Partial | **No** |
| **Contracts** | No | No | No | No | Partial (L8) | Partial | **No** |
| **Procurement + vendors** | No | No | No | No | Partial (L8) | Partial | **No** |
| **Financial / accounting / inventory** | No | No | No | No | Partial / spotty | Partial | **No** |
| **Projects** | No | No | No | No | Partial (L8) | Partial | **No** |
| **Reports** | No | No | No | No | Partial (L8) | Partial | **No** |
| **Notifications / search** | No | No | Partial | No | Partial (L8) | Partial | **Partial** |

---

## 3. Module-level gaps & priority actions

### 3.1 ITSM (tickets) — reference

- **Maintain:** Keep QA pack, runbook, and Playwright **green on `main`**; extend only when product adds surface (e.g. major incident).
- **Optional stretch:** Dedicated `QA_KNOWLEDGE_E2E.md` / catalog if split from ITSM pack.

---

### 3.2 Knowledge & catalog & portal

| Gap | Action |
|-----|--------|
| C1 bundled only with ITSM | Extract **§ Knowledge** + **§ Catalog** into own pack OR clear sub-§ in ITSM pack with **ENV + cases** for portal KB search. |
| C4 thin | Add **Playwright**: portal knowledge search; agent KB publish (if in scope). |
| C6 | Confirm `knowledge` / `catalog` **matrix** matches server (`rbac.ts`); add **403** tests for viewer mutations. |

---

### 3.3 HR (hero: cases, leave, employee directory)

| Gap | Action |
|-----|--------|
| C5 **missing** in Layer 8 | Add **`describe("8.xx HR")`** (or dedicated file): create case → transition; leave request → approve; list employees — **realistic multi-step**. |
| C1–C3 | Author **`docs/QA_HR_E2E_TEST_PACK.md`** + **`docs/HR_STAGING_RUNBOOK.md`** (payroll jobs, calendar, bank export — mark N/A if not shipped). |
| C4 | **Playwright**: P2 agent leave flow; P4 employee self-service path. |
| Payroll | If included in Tier B: **separate sub-pack** + Redis/cron notes; else **explicitly beta** in ICP. |

---

### 3.4 CRM

| Gap | Action |
|-----|--------|
| C5 minimal (account/contact/deal only) | Extend smoke: **duplicate handling**, **lost deal**, **permissions on deal value**, list filters. |
| C1–C3 | `docs/QA_CRM_E2E_TEST_PACK.md` + 1-page **gap plan** (pipeline stages vs DB enum drift). |
| C4 | Playwright: **create deal → move stage → dashboard metric** visible. |

---

### 3.5 CSM / customer service

| Gap | Action |
|-----|--------|
| C5 **not in Layer 8** | Add **`caller.csm.*`** smoke: create case → assign → resolve; link to **account** if supported. |
| C1 | `docs/QA_CSM_E2E_TEST_PACK.md` with **explicit** story vs **tickets** (double-truth rule in runbook). |
| C4 | Playwright: **agent queue + customer-safe portal** path. |
| C6 | RBAC tests for **case PII** (viewer cannot export). |

---

### 3.6 Compliance (GRC + security + india-compliance)

| Gap | Action |
|-----|--------|
| GRC C5 thin (risk/policy only) | Extend: **audit**, **control**, **evidence** if routers exist; else **scope pack** to “risk + policy only”. |
| C1–C3 | `docs/QA_COMPLIANCE_E2E_TEST_PACK.md` (single pack for GRC + security read paths) + runbook **§ evidence export / retention**. |
| Security | Already stronger on L8 lifecycle — add **QA cases** for severity transitions + **403** matrix. |
| India compliance | Map procedures → pack; **ENV** for statutory features. |

---

### 3.7 Legal + contracts

| Gap | Action |
|-----|--------|
| Legal C5 partial (investigations in layer7 only) | **Unify**: investigations + contracts in **`docs/QA_LEGAL_E2E_TEST_PACK.md`**; add L8 or L7 **create → list → close** for investigations. |
| Contracts | Add smoke: **wizard path** or **obligations** + `completeObligation`; fix **list search** if still unimplemented server-side. |
| C4 | Playwright: **contract register → detail → transition**; legal **matter** if UI exists. |

---

### 3.8 Procurement + vendors + financial (Tier B ops)

| Gap | Action |
|-----|--------|
| C1–C3 none | **One** `docs/QA_PROCUREMENT_FINANCE_E2E_TEST_PACK.md` or split by business priority. |
| C5 | Extend PR flow: **reject**, **multi-line approval**, vendor **update**; financial **read** for viewer. |
| C4 | Optional Playwright for **PO list** if Tier B ship. |

---

### 3.9 Dashboard & admin (command centre spine)

| Gap | Action |
|-----|--------|
| Dashboard **mergeTrpcQueryOpts** / child components | Audit all **dashboard** queries for RBAC context (regression). |
| C1 | Short **`docs/QA_PLATFORM_SHELL_E2E_TEST_PACK.md`**: login, dashboard KPIs, notifications bell, admin user list **per persona**. |
| C4 | Layer 10: **dashboard loads for P2/P4** without 500. |

---

### 3.10 Changes, work orders, projects, reports

| Gap | Action |
|-----|--------|
| Same pattern | For each **Tier B** inclusion: pick **one hero journey**, add **QA §**, **L8 extension**, **1 Playwright** OR mark **post-v1**. |

---

## 4. Sequencing recommendation (engineering order)

1. **HR + CSM** — largest **C5 hole** (no Layer 8); highest **people + customer** risk for demos.  
2. **CRM + Legal/Contracts** — revenue + liability story for SMB narrative.  
3. **Compliance pack** — unifies GRC + security tests into **one buyer story**.  
4. **Procurement/finance** — if Tier B ship.  
5. **Knowledge/catalog/portal** — split from ITSM doc once ITSM stable.

---

## 5. “Done” definition per module (copy into tickets)

For module **X**, close the gap when:

- [ ] `docs/QA_<X>_E2E_TEST_PACK.md` exists with personas + ENV + **≥10** numbered cases  
- [ ] `docs/<X>_GAP_REMEDIATION_BUILD_PLAN.md` OR a section in a single **program** doc with **exit criteria**  
- [ ] Runbook updated (`ITSM_STAGING_RUNBOOK.md` **or** `docs/<X>_STAGING_RUNBOOK.md`)  
- [ ] `e2e/*.spec.ts` **or** expanded `layer10-journeys` covers **hero path**  
- [ ] `layer8-module-smoke` (or dedicated test) covers **≥1 multi-step API flow** for that router  
- [ ] RBAC: documented matrix + **automated 403** for sensitive writes  

---

## 6. If **all** `appRouter` namespaces were ITSM-grade — what the gap looks like

**Scope:** Every top-level key on `apps/api/src/routers/index.ts` (`export const appRouter = router({ … })`) held to **C1–C7** (§1).

### 6.1 Scale (honest counts)

| Bucket | Meaning | Count (of **45** routers) |
|--------|---------|---------------------------|
| **Reference** | Formal ITSM bundle **and** deep API smoke **and** Playwright for the hero UX | **1** — `tickets` |
| **API-smoke only** | `layer8-module-smoke.test.ts` runs a **multi-step** flow for that namespace (still missing dedicated C1/C2/C3 and usually C4/C6 for *that* router) | **12** — see §6.2 |
| **Tests elsewhere, not “module grade”** | e.g. `auth` in helpers + Layer 6 signup; `approvals` / RBAC in Playwright without matching QA pack + runbook | **2–4** depending how you count (`auth`, `approvals`; RBAC is cross-cutting) |
| **No standard domain smoke** | No Layer 8 block + no formal QA doc + no module Playwright | **~30** routers |

So “cover all modules at ITSM grade” is not a small tuning task: it is **dozens of parallel artefact streams** (QA pack + gap plan + runbook + Playwright + deep smoke + RBAC proofs **per** surface), on top of any product bugs those tests reveal.

### 6.2 Router-by-router — evidence **today** vs bar

Legend: **Ref** = ITSM reference bundle applies · **L8** = multi-step smoke in `layer8-module-smoke.test.ts` · **E2E** = domain-relevant Playwright (not only login) · **—** = not found in those layers · **(note)** = partial / adjacent.

| Router | C1–C3 formal docs | C5 L8 smoke | C4 Playwright | Gap vs ITSM bar |
|--------|-------------------|-------------|---------------|-----------------|
| `tickets` | **Ref** (`QA_ITSM…`, gap plan, runbook) | **L8** §8.01 | `tickets.spec` + L10 | Maintain; extend with product |
| `changes` | — | **L8** §8.02 | — | Full artefact set missing |
| `security` | — | **L8** §8.10 | — | Same |
| `contracts` | — | **L8** §8.14 | — | Same |
| `grc` | — | **L8** §8.11 | — | Same |
| `procurement` | — | **L8** §8.12 (+ nested vendors) | — | Same |
| `crm` | — | **L8** §8.15 | — | Same |
| `projects` | — | **L8** §8.18 | — | Same |
| `knowledge` | ◐ (inside ITSM pack only) | **L8** §8.22 | — | Split QA + UI tests |
| `notifications` | — | **L8** §8.29 | — | Same |
| `search` | — | **L8** §8.30 | — | Same |
| `reports` | — | **L8** §8.31 | — | Same |
| `admin` | — | **L8** §8.32 | — | Same |
| `auth` | — | — | `auth.spec` + L10 | C1–C3 + L8 domain procedures |
| `approvals` | — | — | `approvals.spec` | C1–C3 + L8 + RBAC 403 matrix |
| `catalog` | ◐ | — | — | L8 + pack + E2E |
| `mac` | — | — | — | Entire bar |
| `assets` | — | — | — | Entire bar |
| `workflows` | — | — | — | Entire bar |
| `hr` | — | — | — | Entire bar |
| `payroll` | — | — | — | Entire bar |
| `workforce` | — | — | — | Entire bar |
| `recruitment` | — | — | — | Entire bar |
| `performance` | — | — | — | Entire bar |
| `dashboard` | — | — | L10 (login only) | Pack + L8 + ticket/dashboard E2E |
| `workOrders` | — | — | — | Entire bar |
| `financial` | — | — | — | Entire bar |
| `accounting` | — | — | — | Entire bar |
| `inventory` | — | — | — | Entire bar |
| `legal` | — | — (see `layer7-row-access` for investigations) | — | L8 hero + pack + E2E |
| `devops` | — | — | — | Entire bar |
| `surveys` | — | — | — | Entire bar |
| `csm` | — | — | — | Entire bar |
| `apm` | — | — | — | Entire bar |
| `oncall` | — | — | — | Entire bar |
| `events` | — | — | — | Entire bar |
| `facilities` | — | — | — | Entire bar |
| `walkup` | — | — | — | Entire bar |
| `vendors` | — | **(note)** — L8 uses `procurement.vendors`, not `caller.vendors` | — | Align smoke + top-level router + docs |
| `ai` | — | — | — | Entire bar (+ safety / ENV story) |
| `indiaCompliance` | — | — | — | Entire bar |
| `assignmentRules` | — | — | — | Entire bar (often bundled with admin/ITSM) |
| `secretarial` | — | — | — | Entire bar |
| `integrations` | — | — | — | Entire bar |
| `customFields` | — | — | — | Entire bar (platform; still needs runbook if shipped) |

**Cross-cutting:** `rbac.spec.ts` + `rbac-user-stories.test.ts` exercise **permission matrices**, not a substitute for **per-router** C1/C3/C5/C7 alignment.

### 6.3 What “close the gap for all modules” implies (order of magnitude)

- **~44** namespaces need **new or split** formal QA material if held to the same *density* as `QA_ITSM_E2E_TEST_PACK.md` (personas, ENV IDs, numbered cases).  
- **~44** gap/remediation or runbook slices (or a structured program doc with per-router sub-§).  
- **~32** new **Layer 8** (or equivalent) **multi-step** API journeys — largest engineering lift after tickets.  
- **~40+** new or extended **Playwright** specs if every module with a UI gets a happy path.  
- **RBAC:** either expand **integration-style** `403` tests per router or accept **matrix-only** coverage as **insufficient** for ITSM-grade claims on sensitive domains (HR, payroll, legal, financial).

**Reality check:** Ship planning should **not** assume “ITSM-grade on all routers” for one release; use §4 sequencing + **explicit beta** flags for anything not climbing past **L8 + mini pack + one E2E** (your **G3** bar in the long-tail plan).

### 6.4 Execution sync — long-tail **100%** (excluding full ITSM-grade C1–C7 everywhere)

As of **2026-04-07**, the following are **true** regardless of row-level staleness in §6.2 above:

| Artefact | Status |
|----------|--------|
| **C1** — every `appRouter` key has a **primary or delegated** formal pack row | **Done** — see `docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` §0 master index + §1–§25 |
| **C5** — multi-step API smoke per wave | **Done** — `MODULE_GAP_EXECUTION_STATUS.md` C5 table + `layer8-module-smoke.test.ts` |
| **C4** — Playwright load smoke for first-class module routes | **Done** — `e2e/module-routes.spec.ts` (admin serial sweep + agent HR/CSM/catalog) |
| **C3** | **Done** — `STAGING_RUNBOOK_MODULES_ADDENDA.md` |
| **Full ITSM-grade C1–C7 on every router** | **Explicitly excluded** from this “100%” definition — remains multi-quarter (§6.3) |

When updating §6.2 for aesthetics, prefer copying the **§0** column layout from `QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` rather than hand-maintaining 45 rows in two places.

---

## 7. Document control

| Version | Date | Summary |
|---------|------|-----------|
| 1.0 | 2026-04-07 | Initial module vs ITSM-grade gap matrix |
| 1.1 | 2026-04-07 | §6 full `appRouter` coverage + gap-at-scale |
| 1.2 | 2026-04-07 | Cross-links to execution status + program doc; C5/C1/C3/C4 wave (see ledger) |
| 1.3 | 2026-04-07 | §6.4 long-tail 100% sync; `QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` |
| 1.4 | 2026-04-24 | Link `ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` (C1–C7 per module, serial) |
| 1.5 | 2026-04-24 | LG wave artefacts: `QA_LEGAL_GOVERNANCE_*`, gap/runbook, L8 §8.51, RBAC + Playwright |
| 1.6 | 2026-04-07 | FP wave artefacts: `QA_FINANCE_PROCUREMENT_*`, gap/runbook, L8 §8.39 depth, RBAC + Playwright |
| 1.7 | 2026-04-07 | Seq 21–23 sprint: `QA_FINANCE_SEQUENCE_21_23_*`, L8 §8.53–§8.54, `finance-sequence-21-23-*` |
| 1.8 | 2026-04-07 | Serial program **v1**: `ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md`; plan §7; `module-routes` expansion; long-tail §0 sync |

---

*This doc answers: “Are gaps identified by module?” — **Yes**: use §2 for pillars, §3 for actions, **§6 for every router key**. Update **`MODULE_GAP_EXECUTION_STATUS.md`** as artefacts land (then mirror §2 / §6 if needed).*
