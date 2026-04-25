# Per-router **ITSM Class L** rollout — multi-quarter master plan

**Audience:** Engineering leads, PM, audit / GRC readers reconciling **“100% automation”** with **“ITSM-grade density.”**  
**Companion docs:** `docs/ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` (§1 C1–C7 bar, §2 sprint loop, §3 backlog) · `docs/ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md` (Class **R / L / P**) · `docs/MODULE_GAP_EXECUTION_STATUS.md` (Honest conclusion + automated gate).

---

## 1. What you are planning for (definitions)

| Term | Meaning in NexusOps |
|------|----------------------|
| **100% automation** | CI + local: Turbo **`pnpm test`**, full **`e2e/`** Playwright, migrations/seed. Proves **no regressions** on the paths covered by tests — **not** per-router LG narrative density. See **`MODULE_GAP_EXECUTION_STATUS.md`** §Automated execution gate. |
| **Class P (program-grade)** | Traceability row satisfied by long-tail index + Layer 8 batch + route smoke + umbrella C2/C3/C7. **Cheap evidence, wide coverage.** |
| **Class L (ITSM / LG-style)** | **Dedicated C1–C7 artefacts** for that router’s **hero scope**: formal QA pack (≥10 cases), gap plan, staging runbook, hero Playwright, deep API smoke, RBAC Vitest, enum/schema/UI alignment. **Expensive evidence, narrow slice.** |
| **“LG-style packs”** | Same as **Class L** in the closure register legend — not a separate bar. |

**Invariant:** **100% automation ≠ Class L everywhere.** Automation can be **100% green** while most routers remain **Class P** until each is upgraded in a scheduled epic.

---

## 2. Why this is multi-quarter

- **~45** `appRouter` namespaces (see `ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md`).
- **Class L** implies roughly **1–2 weeks (S)** to **4–8+ weeks (L)** per router for hero scope alone (`ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` §2 cadence), plus review and stabilisation.
- **Serial discipline** (one epic in flight per module) avoids thrash but **serialises** calendar time.
- **Large routers** (`grc`, `hr`, `procurement`, `financial`, `accounting`, `payroll`, `indiaCompliance`, …) dominate wall-clock even if many **S** routers finish quickly.

**Order-of-magnitude:** full **P → L** for **every** row (excluding **R** `tickets` maintenance-only) is on the order of **many person-quarters**, not one release train.

---

## 3. Current baseline (starting line)

1. **Already Class L** (per closure register): treat as **maintain on green** — Seq **1–12**, **17–23** (LG/FP/stack waves as listed), not net-new unless product expands hero scope.
2. **Class P today:** Seq **13–16**, **24–44** (and any stragglers) — **upgrade candidates** using this plan.
3. **Reference:** Seq **0** `tickets` — **no new L project**; keep existing C1–C7 green when touching ITSM core.

Use **`ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md`** as the live **promotion ledger**: flip a row from **P** to **L** only when **all** C1–C7 exit criteria for that module’s hero scope are merged and linked in the register.

---

## 4. Operating model (how each router is upgraded)

**Repeat for every Class P → L promotion** (copy from `ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` §4 epic template):

| Phase | Actions |
|-------|---------|
| **0 — Charter** | Pick Seq from §3 (or product override). Write **hero scope** + **out of scope** in C2 (half page). |
| **1 — C1** | New or expanded `docs/QA_<MODULE>_ITSM_E2E_TEST_PACK.md` (or approved § in an existing pack): **≥10** numbered cases, personas, ENV IDs, ITIL/practice trace where relevant. |
| **2 — C2 / C3** | `docs/<MODULE>_GAP_REMEDIATION_BUILD_PLAN.md` + `docs/<MODULE>_STAGING_RUNBOOK.md` (or dated addendum + explicit **N/A**). |
| **3 — C5** | Extend `layer8-module-smoke` or add `apps/api/src/__tests__/<module>-depth.test.ts` — **multi-step** flows for hero procedures (same bar as §8.01). |
| **4 — C6** | `*-rbac.test.ts`: matrix-aligned **403** / deny on **sensitive writes**; align QA pack §RBAC. |
| **5 — C4** | `e2e/<module>.spec.ts` (or extend existing spec): **hero UX**, not login-only / not only `module-routes` load. |
| **6 — C7** | Enum ↔ Postgres ↔ router ↔ UI copy pass; migration note if schema moved. |
| **7 — Close** | Merge; update **`MODULE_GAP_EXECUTION_STATUS.md`**; flip register row **P → L**; release notes if customer-visible. |

**Rule:** One **module epic** in flight at a time unless PM explicitly approves a **second lane** (e.g. LG wave + one ITSM module).

---

## 5. Phased roadmap (suggested — adjust per capacity)

Waves follow **risk and revenue**, not only Seq order. Within a wave, still use **§3 Seq** as default tie-breaker when priority is equal.

### Phase A — Trust & compliance (highest audit scrutiny)

| Target routers (examples) | Rationale |
|----------------------------|-----------|
| **`grc`**, **`csm`**, **`hr`**, **`crm`** | Already strong L8 smoke; **Class P** today — LG packs + C6 heavy lift unlock enterprise RFP language. |
| **`indiaCompliance`** | Statutory / ENV matrix; often **L** size. |

**Exit:** Each promoted router has **standalone** C1–C7 row in the closure register.

### Phase B — Money and supply chain

| Target routers | Rationale |
|----------------|-----------|
| **`payroll`**, **`projects`**, **`devops`** (beyond current RBAC sample) | Financial and delivery narrative; deepen C5/C4 beyond long-tail §. |
| **`vendors`** (if not merged with procurement epic) | Top-level parity with nested procurement story. |

### Phase C — Operations / field / people extensions

| Target routers | Rationale |
|----------------|-----------|
| **`surveys`**, **`apm`**, **`oncall`**, **`events`**, **`facilities`**, **`walkup`** | Medium **M** mix; hero scope must be chosen to avoid boiling the ocean. |
| **`assets`**, **`recruitment`**, **`workforce`**, **`performance`** | CMDB / HR adjacency; C7 sensitive. |

### Phase D — Platform and edge

| Target routers | Rationale |
|----------------|-----------|
| **`integrations`**, **`customFields`**, **`ai`**, **`assignmentRules`** | ENV-heavy, cross-cutting; C3 **N/A** discipline matters. |
| **`mac`** | Minimal UI — **C4 N/A** with written rationale acceptable if C5/C6 justified. |

**Quarters (illustrative):** map **Phase A → Q1**, **B → Q2**, **C → Q3–Q4**, **D → Q4+** for a single squad; **halve** calendar time only if you add parallel squads and accept integration risk.

---

## 6. Sizing and capacity planning

Use **`ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` §3 “Size”** column as the planning knob:

| Size | Indicative calendar (1 engineer, serial) | Notes |
|------|--------------------------------------------|--------|
| **S** | ~1–2 weeks | Tight hero scope; C4 may be thin but not empty unless N/A documented. |
| **M** | ~2–4 weeks | Typical router with real UI + several mutations. |
| **L** | ~4–8+ weeks | Policy, PII, finance, payroll, GRC-class surfaces. |

**Capacity formula (planning only):**

`Σ (router_effort_weeks) ÷ (squads × velocity_weeks_per_squad) ≈ calendar_quarters`

Re-baseline **quarterly** using actual epic burn-down.

---

## 7. Promotion mechanics (P → L)

1. **Do not** mark **L** in the register until **all** C1–C7 checkboxes for **hero scope** are merged on `main`.
2. **C4 “hero”** must be **stronger** than `module-routes` load-only for that router (or an explicit **§** in `layer10-journeys.spec.ts` with named scenarios).
3. **C6** must be **Vitest** denies (not only §8.42 umbrella); file name convention: `<module>-rbac.test.ts` or merged pack with clear **§** pointer in C1.
4. Update **`ITSM_GRADE_BASELINE_TRACEABILITY_INDEX.md`** when a **Class P** row is removed from the baseline set.

---

## 8. Dependencies and risks

| Risk | Mitigation |
|------|------------|
| **Scope creep** (“make whole router ITSM”) | **Hero scope** paragraph in C2; everything else **Out of scope** with PM sign-off. |
| **Enum / schema drift (C7)** | Run C7 **before** C4 freeze; block merge on pack Part IV table updates. |
| **RBAC matrix vs product** | Single source: `apps/api/src/server/rbac.ts` + pack § matrix; disagree = product decision, then code. |
| **Parallel epics** | Default **forbidden**; exception needs **dependency map** in C2 (e.g. `contracts` ↔ vendors). |
| **Automation false confidence** | CI green does **not** update register to **L**; only the epic checklist does. |

---

## 9. KPIs (program health)

| KPI | Target |
|-----|--------|
| **P → L promotions / quarter** | Set per team (e.g. 2–4 for one squad). |
| **Regression rate post-promotion** | Zero **P0** auth/RBAC regressions on promoted modules for N releases. |
| **Register accuracy** | 100% of **L** rows have working links to C1–C7 artefacts (quarterly audit). |
| **Hero scope churn** | ≤1 major hero-scope rewrite per module after C2 sign-off (else replan quarter). |

---

## 10. Artefact index (where things live)

| Need | Doc / path |
|------|------------|
| C1–C7 definition | `ITSM_GRADE_ALL_MODULES_EXECUTION_PLAN.md` §1 |
| Sprint loop | Same doc §2 |
| Backlog order + sizes | Same doc §3 |
| Class R/L/P + evidence | `ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md` |
| Class P scan | `ITSM_GRADE_BASELINE_TRACEABILITY_INDEX.md` |
| Long-tail index | `QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` §0 |
| Living execution ledger | `MODULE_GAP_EXECUTION_STATUS.md` |
| Gap program umbrella | `NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §6 |
| **Re-run all current Class L rows** (Vitest L8 + L `*-rbac` + hero Playwright; excludes Class P-only RBAC) | Root **`pnpm test:class-l`** → `scripts/run-class-l-tests.sh` (closure register **v2.3**) |
| **Re-run Class P program bar** (L8 smoke + P RBAC + `module-routes` + GRC/CSM/HR/CRM) | Root **`pnpm test:class-p`** → `scripts/run-class-p-tests.sh` (closure register **v2.4**) |

---

## 11. Version

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Initial master plan: automation vs Class L, phases, promotion rules, KPIs |
| 1.1 | 2026-04-07 | §10 artefact index: **`pnpm test:class-l`** for regression on already-**L** modules |
| 1.2 | 2026-04-07 | §10: **`pnpm test:class-p`** for **Class P** regression (program bar, not L hero packs) |

When a **phase** completes (e.g. “Phase A trust slice”), bump minor version and add a one-line **evidence pointer** (release tag or date range).
