# ITSM-grade upgrade — execution plan (one module at a time)

**Purpose:** Serial backlog to bring **every** `appRouter` namespace to the **same bar as tickets** (C1–C7 for that module’s **hero scope**).  
**Bar definition:** `docs/NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §1 + §5 (“Done” per module).  
**Living status:** Update `docs/MODULE_GAP_EXECUTION_STATUS.md` when each module closes; mirror `NEXUSOPS_MODULE_GAP_ANALYSIS_ITSM_GRADE.md` §6.2 row if you keep that table current.

**Rule:** **Only one module (`appRouter` key) is “in flight”** at a time (one epic / one branch focus). Finish C1–C7 for that module’s hero scope, merge, then start the next.

### Priority override — Legal & Governance first (**doable**)

**Yes.** There is **no hard dependency** that forces `changes` or ITSM-adjacent modules before **Legal & Governance**. The default order in §3 is a **recommendation**, not a technical gate.

**Execution baseline (2026-04-24):** C2/C3/C1 packs, C5 (Layer 8 §8.38 extended + §8.51), C6 (`legal-governance-rbac.test.ts`), C4 (`e2e/legal-governance.spec.ts`), C7 (Part IV + `legal/page.tsx` enum alignment) — **LG wave signed off**; §2 checkboxes in `LEGAL_GOVERNANCE_GAP_REMEDIATION_BUILD_PLAN.md` are **closed**.

**Finance & Procurement wave (2026-04-07, PM-approved):** `docs/QA_FINANCE_PROCUREMENT_E2E_TEST_PACK.md`, `FINANCE_PROCUREMENT_GAP_REMEDIATION_BUILD_PLAN.md`, `FINANCE_PROCUREMENT_STAGING_RUNBOOK.md`, C5 (Layer 8 §8.39 depth), C6 (`finance-procurement-rbac.test.ts`), C4 (`e2e/finance-procurement.spec.ts`).

**Changes wave (Seq 1, 2026-04-07):** `docs/QA_CHANGES_ITSM_E2E_TEST_PACK.md`, `CHANGES_GAP_REMEDIATION_BUILD_PLAN.md`, `CHANGES_STAGING_RUNBOOK.md`, Layer 8 **§8.02**, C6 **`changes-rbac.test.ts`**, C4 **`e2e/changes.spec.ts`**.

**Serial block Seq 2–12 (2026-04-07):** Seq **2–11** as in register v1.6; Seq **12** — `security` (`QA_SECURITY_ITSM_E2E_TEST_PACK.md`, L8 **§8.10** depth, `security-rbac.test.ts`, `e2e/security.spec.ts`). **Seq 13–16 + long-tail sample (2026-04-07, register v2.0):** `layer8-module-smoke` depth (**§8.11 / §8.34 / §8.33**), Vitest **`grc-rbac` / `csm-rbac` / `hr-crm-rbac`**, **`serial-longtail-rbac.test.ts`**, C4 **`e2e/grc|csm|hr|crm.spec.ts`** — **Class P** program closure; optional **L** lift per `§2` epic template.

### Where is **Accounting**?

**Accounting is its own serial module — not inside the FP wave.** In **§3** below it is **`accounting`** at **Seq 23** (after **`financial` (21)** and **`inventory` (22)**): hero scope **COA, journal, GSTR; India ENV**; UI spine **`/app/accounting`**. **Sprint C1–C7 (Seq 21–23 together):** `docs/QA_FINANCE_SEQUENCE_21_23_E2E_TEST_PACK.md`, `FINANCE_SEQUENCE_21_23_GAP_REMEDIATION_BUILD_PLAN.md`, `FINANCE_SEQUENCE_21_23_STAGING_RUNBOOK.md`, Layer 8 **§8.39 / §8.53 / §8.54**, `finance-sequence-21-23-rbac.test.ts`, `e2e/finance-sequence-21-23.spec.ts`. Long-tail index remains **`docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` §23** (`AC-TC-*`) for cross-links.

**What “Legal & Governance” means in this repo (three routers, three epics in order):**

| Order | Router | UI spine | Notes |
|-------|--------|----------|--------|
| **LG-1** | `legal` | `/app/legal` | Investigations hero; Layer 8 §8.38 exists — extend C1/C2/C3/C4/C6/C7 to full bar. |
| **LG-2** | `contracts` | `/app/contracts` | Register + obligations + wizard; C7 (enums) already sensitive — formal pack + Playwright. |
| **LG-3** | `secretarial` | `/app/secretarial` | Board, filings, share capital; Layer 8 smoke exists — same C1–C7 lift. |

**C1 head start:** `docs/QA_LEGAL_E2E_TEST_PACK.md` already exists — **expand or split** so **each** of the three routers has **≥10 cases** (or a dedicated `QA_CONTRACTS_…` / `QA_SECRETARIAL_…` if you split packs).  
**Risk to flag in C2:** `contracts` may touch **vendors / CRM** links; **secretarial** may reference **users / org** for directors — document **N/A** or thin integration in runbooks.

---

## 1. C1–C7 checklist (copy into every module epic)

| ID | Criterion | Done when |
|----|-----------|-----------|
| **C1** | Formal QA pack | `docs/QA_<MODULE>_E2E_TEST_PACK.md` (or an **approved** § in `QA_ITSM…` / `QA_KNOWLEDGE_CATALOG_PORTAL…` if intentionally merged) with **personas**, **ENV IDs**, **≥10 numbered cases**, ITIL/practice traceability where relevant |
| **C2** | Gap / remediation plan | `docs/<MODULE>_GAP_REMEDIATION_BUILD_PLAN.md` **or** a dated **§ in** `NEXUSOPS_MODULE_GAP_REMEDIATION_PROGRAM.md` with objectives → epics → **exit criteria** |
| **C3** | Staging runbook | New `docs/<MODULE>_STAGING_RUNBOOK.md` **or** addendum § in `STAGING_RUNBOOK_MODULES_ADDENDA.md` + **N/A** rules for missing deps |
| **C4** | Playwright | `e2e/<module>.spec.ts` **or** clear **§ in** `layer10-journeys.spec.ts` covering **hero UX** (not login-only) |
| **C5** | API smoke depth | `layer8-module-smoke.test.ts` **≥1 multi-step** `describe` for `caller.<module>.*` **or** dedicated `*.test.ts` in `apps/api/src/__tests__/` with same depth bar as §8.01 |
| **C6** | RBAC regression | QA pack **§ matrix** aligned to `apps/api/src/server/rbac.ts` + **Vitest** `403` / deny cases for **sensitive writes** on that module (pattern: `8.42` GRC) |
| **C7** | Doc ↔ schema ↔ UI | Lifecycle enums / statuses documented; migrations narrative if schema changed; no orphan UI states |

**Hero scope:** For each module below, **define hero scope in C2 before coding** (one paragraph). ITSM-grade applies to **hero scope only** unless product expands the claim.

---

## 2. How to run one module sprint (repeat)

1. **Pick** next row from §3 **or** run the **LG-1 → LG-2 → LG-3** wave (Legal & Governance first) if product priority says so.  
2. **Write** C2 exit criteria + hero scope (half page).  
3. **Extend or split** C1 pack to ≥10 cases (split from long-tail index if needed).  
4. **Implement** C5 → C6 → C4 → C3 (tests often drive runbook gaps).  
5. **C7** pass: grep module for enums vs DB vs UI copy.  
6. **Merge**; update **MODULE_GAP_EXECUTION_STATUS** + §6.2 row; tag release notes if customer-visible.

**Suggested cadence:** 1–2 engineering weeks per **small** router (S); 2–4 for **medium** (M); 4–8+ for **large** (L) where UI + policy surface is heavy (`hr`, `grc`, `procurement`, `financial`).

---

## 3. Ordered backlog (single serial queue)

**Rationale:** After **tickets** (reference), complete **ITSM-adjacent** surfaces (change, WO, KB, catalog, approvals), then **platform shell** (dashboard, admin, auth, notifications, search, reports), then **trust-heavy** domains (security, GRC, CSM, HR), then **commercial** (CRM, legal, contracts, procurement/finance family), then **operations / field / people extensions**, then **platform / edge** (integrations, custom fields, AI, mac).

| Seq | Module (`appRouter` key) | Size | Notes / hero scope hint |
|-----|---------------------------|------|---------------------------|
| **0** | `tickets` | — | **Reference** — no new ITSM-grade project; **maintenance only** (keep C1–C7 green on `main`). |
| **1** | `changes` | M | ITIL change lifecycle; align with `changes` router + `/app/changes` |
| **2** | `workOrders` | M | WO lifecycle + parts tab; field service narrative |
| **3** | `knowledge` | M | Split from ITSM pack or formal sub-§; KB publish + search |
| **4** | `catalog` | M | Requester browse → submit → fulfiller; admin tab |
| **5** | `approvals` | M | Queue + `myPending` / `mySubmitted` + flow designer if in scope |
| **6** | `notifications` | S | Bell, prefs, deep links; RBAC on read |
| **7** | `search` | S | Global search + scoped search; PII / viewer |
| **8** | `reports` | M | Canned reports + export N/A; viewer safety |
| **9** | `dashboard` | M | `mergeTrpcQueryOpts` audit; P2/P4/P5 widget matrix |
| **10** | `admin` | M | Users, roles, assignment rules entry, audit log |
| **11** | `auth` | M | Invite, session, password, OIDC ENV; L8 procedures if any |
| **12** | `security` | M | Incident lifecycle + severity; already strong L8 — formalize C1/C2/C3/C4/C6 |
| **13** | `grc` | L | Risk, policy, audit, vendor risk; C6 heavy |
| **14** | `csm` | M | Cases vs tickets positioning; PII RBAC |
| **15** | `hr` | L | Cases, leave, directory; payroll touch only if in hero |
| **16** | `crm` | M | Accounts, deals, pipeline enums C7 |
| **17** | `legal` | M | Investigations hero; align L7/L8 |
| **18** | `contracts` | M | Register + obligations + wizard C7 |
| **19** | `procurement` | L | PR/PO/GRN as shipped; threshold policy |
| **20** | `vendors` | S | Top-level `vendors` parity with nested; single sprint or merge with 19 |
| **21** | `financial` | L | Invoices, budget; align schema migrations |
| **22** | `inventory` | M | Parts / stock; tie to WO + procurement |
| **23** | **`accounting`** | L | **COA, journal, GSTR; India ENV** — UI `/app/accounting`; see **“Where is Accounting?”** (above) + `docs/QA_LONGTAIL_ROUTERS_E2E_TEST_PACK.md` §23 |
| **24** | `payroll` | L | Runs, payslips, tax preview; cron/Redis N/A |
| **25** | `projects` | M | Portfolio + tasking as shipped |
| **26** | `devops` | M | Pipelines, DORA, deploy read |
| **27** | `surveys` | S | Draft → activate → results |
| **28** | `apm` | M | Applications + portfolio |
| **29** | `oncall` | M | Schedules + rotation |
| **30** | `events` | M | Event list + health nodes + CMDB bridge |
| **31** | `facilities` | M | Buildings / space |
| **32** | `walkup` | S | Queue join + agent |
| **33** | `assets` | M | HAM/SAM alignment with `assets` router |
| **34** | `workflows` | M | Flow CRUD + runs |
| **35** | `recruitment` | M | Requisitions → pipeline |
| **36** | `workforce` | S | Headcount / tenure analytics |
| **37** | `performance` | M | Cycles, reviews, goals |
| **38** | `secretarial` | M | Board, filings, share capital |
| **39** | `indiaCompliance` | L | Statutory panels; ENV matrix |
| **40** | `assignmentRules` | S | Often admin-adjacent; own C6 |
| **41** | `integrations` | M | Hub catalog, webhooks, API keys |
| **42** | `customFields` | M | Definitions + values; entity matrix |
| **43** | `ai` | M | Safety, ENV, summarize + any UI |
| **44** | `mac` | S | Stats / health; minimal UI — C4 may be N/A with written rationale |

**Adjust order** only for **hard dependencies** (e.g. if `financial` must follow `accounting`, swap 21–23 after C2 clarifies). **Legal & Governance first:** use **LG-1 → LG-2 → LG-3** (see above), then resume §3 from **Seq 1** (`changes`) or whichever global priority applies.

---

## 7. Serial program **v1 closure** (full backlog traceability)

A **v1 execution pass** records **evidence for every Seq 0–44 row** without claiming each router received **LG-depth** dedicated packs. See:

- **`docs/ITSM_GRADE_SERIAL_V1_CLOSURE_REGISTER.md`** — per-module **Class (R / L / P)**, C1/C4/C5/C6 pointers, and umbrella C2/C3/C7 for **Class P** (program-grade closure).

**Upgrade:** Any **Class P** module may be promoted to **Class L** using the §4 epic template when product schedules that sprint.

---

## 4. Per-module epic template (paste into tickets)

```markdown
## Module: <name>
Hero scope: <one short paragraph>

### Exit criteria (C1–C7)
- [ ] C1: QA pack path + case count ≥10
- [ ] C2: Gap plan path + exit bullets
- [ ] C3: Runbook path + ENV/N/A
- [ ] C4: Playwright path + scenario names
- [ ] C5: API test path + procedure list
- [ ] C6: RBAC doc § + Vitest file:line for 403s
- [ ] C7: Enum/schema note + UI copy check

### Out of scope (explicit)
- <bullets>

### Risks
- <bullets>
```

---

## 5. Starter detail — first three execution modules (after tickets)

### 5.1 Seq 1 — `changes`

| Item | Detail |
|------|--------|
| **Hero scope** | Change request lifecycle: create → submit → approve/reject → complete; CAB states as implemented |
| **C5** | Extend `layer8-module-smoke` §8.02 to match **all** critical transitions in `changes.ts`; add negative path (invalid transition) |
| **C4** | `e2e/changes.spec.ts`: P2 creates draft → P1 approves (or seed CHG-0001 deep link) |
| **C6** | Viewer cannot approve; requester cannot skip lifecycle |
| **C7** | `CHANGE_LIFECYCLE` / status enums in QA pack + runbook |
| **C1–C3** | Split from ITSM or `QA_CHANGES_E2E_TEST_PACK.md` + `CHANGES_STAGING_RUNBOOK.md` addendum |

### 5.2 Seq 2 — `workOrders`

| Item | Detail |
|------|--------|
| **Hero scope** | Create WO → assign → progress → close; parts tab read |
| **C5** | Deepen §8.37 beyond create/list/get if product supports transitions |
| **C4** | `e2e/work-orders.spec.ts` technician path |
| **C6** | `work_orders` module matrix vs `rbac.ts`; viewer write deny |
| **C7** | WO state enum vs UI |

### 5.3 Seq 3 — `knowledge`

| Item | Detail |
|------|--------|
| **Hero scope** | Article publish/version; portal search; agent KB attach to ticket (if in scope) |
| **C5** | L8 §8.22 multi-step: create article → publish → search hit |
| **C4** | Portal + agent KB Playwright (split from `module-routes` load-only) |
| **C6** | Viewer cannot publish; KB PII rules |
| **C1** | Formal split: `QA_KNOWLEDGE_E2E_TEST_PACK.md` **or** mandatory § in `QA_KNOWLEDGE_CATALOG_PORTAL_E2E_TEST_PACK.md` with ENV IDs |

---

## 6. Program hygiene

- **Branch naming:** `feat/itsm-grade/<module>-c1-c7`  
- **CI gate:** module epic cannot close if `pnpm vitest` (API) + `pnpm exec playwright test` (relevant spec) fail on `main`.  
- **Customer comms:** Only claim “ITSM-grade” for a module in marketing **after** C1–C7 for that module’s hero scope is merged and tagged in release notes.

---

## 8. Multi-quarter **Class L per-router** rollout

**100% CI automation** (Turbo + full Playwright) does **not** promote register rows from **P** to **L**. For the **multi-quarter** program to drive **every** remaining router to **Class L** (full C1–C7 density for declared hero scope), use:

**`docs/ITSM_CLASS_L_PER_ROUTER_ROLLOUT_PLAN.md`** — phases (trust → money → ops → platform), sizing, **P → L** promotion rules, KPIs, and risks.

---

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-04-24 | Initial serial backlog + C1–C7 template + starter modules 1–3 |
| 1.1 | 2026-04-24 | Legal & Governance first: LG-1→LG-3 wave; priority override |
| 1.2 | 2026-04-24 | LG wave baseline executed (docs + tests); PM sign-off on C2 §2 |
| 1.3 | 2026-04-07 | §8 pointer to **`ITSM_CLASS_L_PER_ROUTER_ROLLOUT_PLAN.md`** (P→L multi-quarter plan) |
