# NexusOps — User Story Backlog (Gap-Closure Programme)

**Purpose:** Consolidate **user stories** derived from module **gap analyses** and **sprint plans** in `docs/`. Use this for backlog refinement, PI planning, and traceability to source documents.  
**Living status:** Implementation truth lives in the **Status rollup** and **Changelog** near the end of this file — update them when stories ship.  
**Conventions:** Stories follow **As a / I want / So that**; **AC** = acceptance criteria. IDs are **stable prefixes** (`US-<MODULE>-###`).  
**Sources:** `SERVICENOW_ITSM_GAP_ANALYSIS.md`, `NEXUSOPS_SECURITY_COMPLIANCE_GAP_ANALYSIS.md`, `WORKDAY_PEOPLE_WORKPLACE_GAP_ANALYSIS.md`, `HUBSPOT_CUSTOMER_SALES_CRM_GAP_ANALYSIS.md`, `MICROSOFT_FINANCE_PROCUREMENT_GAP_ANALYSIS.md`, `RELIANCE_LEGAL_GOVERNANCE_INDIA_GAP_ANALYSIS.md`, `AMAZON_STRATEGY_PROJECTS_GAP_ANALYSIS.md` (all under `docs/`).  
**Date:** April 2026  
**Programme commitment:** **100% closure** of every `US-*` story in this backlog is the target, including decomposition of **US-LEG-009+** into trackable child stories. Delivery is **multi-year / multi-phase**; status and evidence live in the **rollup** and **changelog**. Items that touch **legal, tax, or regulated** workflows still require **professional validation** before production (see **Disclaimer**) — that is not an excuse to leave stories **Backlog** forever; it means **Done** includes documented sign-off where required.

---

## Programme charter (100% closure)

| Principle | How we run |
|-----------|------------|
| **North star** | Each story reaches **Done** only when its **AC** are met in product (or the story is **superseded** by another `US-*`, with both rollup rows updated and changelog noted). |
| **Epic: Legal depth** | **US-LEG-009+** is not “infinite backlog”: before counting programme %, split it into concrete **`US-LEG-010`…** (or similar) mapped to `RELIANCE_LEGAL_GOVERNANCE_INDIA_GAP_ANALYSIS.md` §3.9 / §6 rows. |
| **Deferred** | **Temporary** only; each **Deferred** row must name a **revisit trigger** (date, dependency, or decision) in **Notes**. Clearing **Deferred** is part of 100%. |
| **Partial** | Expected during delivery; **Partial** is not the end state — schedule the remaining AC and move to **Done**. |
| **Cadence** | After each merge that affects scope: update **rollup** + **changelog**. At least **quarterly**: refresh **Programme progress** counts below. |

### Programme progress (rollup-derived)

*Recalculate from **Status rollup** when statuses change. Last counted: **2026-04-25**.*

| Metric | Count |
|--------|------:|
| **Stories in rollup** | 58 |
| **Done** | 0 |
| **Partial** | 20 |
| **Deferred** | 1 |
| **Backlog** | 37 |
| **Approx. closure** (Done ÷ 58) | 0% — *treat **Partial** as in-flight, not closed* |

---

## How to use this document

| Column / field | Meaning |
|----------------|---------|
| **Source** | Gap doc + section (§) or sprint plan (§6 / §7) |
| **AC** | Minimum checks for **Done**; extend with non-functional requirements per team standards |
| **Priority** | Suggested: **P0** trust/safety, **P1** differentiator, **P2** scale — adjust per customer |

---

## Epic: ITSM & service operations (ServiceNow parity programme)

**Source:** `docs/SERVICENOW_ITSM_GAP_ANALYSIS.md`

### US-ITSM-001 — SLA pause with reason codes
**As an** IT operations manager  
**I want** SLA clocks to pause and resume with auditable reason codes  
**So that** enterprise buyers trust SLA reporting and audits match policy  

**AC:** Pause/resume events appear in audit trail; compatible with existing SLA job sync; org-configurable reasons.  
**Source:** §7 Sprint 1 (PBI-1.1–1.3) · §3.1 / §3.7  

### US-ITSM-002 — Multiple SLA targets per ticket
**As a** service owner  
**I want** separate enforceable SLA targets (e.g. response vs resolve vs internal) on one ticket  
**So that** we match enterprise ITSM expectations  

**AC:** At least two concurrent targets supported; backward compatible with single-policy behaviour.  
**Source:** §7 Sprint 1 · §3.7  

### US-ITSM-003 — SLA dashboard and at-risk visibility
**As an** executive  
**I want** SLA health dashboards (at-risk, breached, paused)  
**So that** I can steer capacity before breach cascades  

**AC:** Filters by team/category; uses existing dashboard/reports patterns.  
**Source:** §7 Sprint 2 · §3.7  

### US-ITSM-004 — Major incident MVP
**As a** incident commander  
**I want** parent/child major incidents, a comms log, and a war-room view  
**So that** we can run MIM without a separate tool  

**AC:** Parent/child links; immutable comms append; read-focused war-room page.  
**Source:** §7 Sprint 3 · §3.1  

### US-ITSM-005 — Catalog variables and cart-lite
**As a** service consumer  
**I want** catalog items with variables and multi-line requests  
**So that** fulfillment matches enterprise catalog expectations  

**AC:** Variables validated; multi-item submit in one transaction; minimum fulfillment checklist.  
**Source:** §7 Sprint 4 · §3.4  

### US-ITSM-006 — CMDB class and service map
**As a** CMDB owner  
**I want** CI classes/types, relationship graph, and bulk import  
**So that** service impact and migration stories are credible  

**AC:** Class on CI; graph API + minimal UI; idempotent import.  
**Source:** §7 Sprint 5 · §3.5  

### US-ITSM-007 — Change risk and problem workspace
**As a** change manager  
**I want** risk questionnaire before approval and a first-class problem workspace  
**So that** governance demos match ITIL expectations  

**AC:** Gated approval stores scores; problem list/create links incidents.  
**Source:** §7 Sprint 6 · §3.3 / §3.2  

### US-ITSM-008 — Knowledge versioning and deflection metrics
**As a** knowledge manager  
**I want** article lifecycle and deflection-style analytics  
**So that** we prove KB value  

**AC:** Versioning + review states; attach event from ticket; dashboard slice.  
**Source:** §7 Sprint 7 · §3.6  

### US-ITSM-009 — ITSM executive scorecard and migration guide
**As a** programme director  
**I want** an executive ITSM dashboard and SNOW migration guidance  
**So that** displacement deals have a path  

**AC:** KPIs wired from prior sprints; migration doc v1; import prototype with dry-run.  
**Source:** §7 Sprint 8 · §6 backlog themes  

---

## Epic: Security & compliance (enterprise / CISO bar)

**Source:** `docs/NEXUSOPS_SECURITY_COMPLIANCE_GAP_ANALYSIS.md`

### US-SEC-001 — MFA policy enforcement
**As a** security architect  
**I want** org policy to require MFA for privileged roles  
**So that** we meet enterprise IAM expectations  

**AC:** Block sensitive procedures when MFA not satisfied; recovery path audited.  
**Source:** §6 Sprint 1 · §3.1  

### US-SEC-002 — KMS-backed integration secrets
**As a** CISO  
**I want** integration configs encrypted with KMS/envelope keys, not a single app secret  
**So that** crypto reviews pass  

**AC:** Legacy decrypt + rotation runbook; no secrets in logs.  
**Source:** §6 Sprint 2 · §3.5  

### US-SEC-003 — SIEM export and read-audit MVP
**As a** SOC lead  
**I want** structured security events and optional read-audit for sensitive modules  
**So that** SIEM onboarding is straightforward  

**AC:** Documented schema; webhook or signed push; read-audit behind flag with perf budget.  
**Source:** §6 Sprint 3 · §3.2 / §3.6  

### US-SEC-004 — IR playbooks and ITSM linkage
**As an** IR lead  
**I want** playbook checklists and links between security incidents and IT tickets  
**So that** response is coordinated  

**AC:** Checklist on incident; bidirectional link with correct RBAC.  
**Source:** §6 Sprint 4 · §3.2  

### US-SEC-005 — Vulnerability import and remediation SLAs
**As a** vulnerability manager  
**I want** scanner import, dedupe, and remediation SLAs  
**So that** vuln programme scales  

**AC:** Idempotent import; dedupe rules doc; exception record.  
**Source:** §6 Sprint 5 · §3.3  

### US-SEC-006 — GRC control library and evidence
**As an** internal auditor  
**I want** controls mapped to risks/audits with evidence artifacts  
**So that** SOC-style evidence exists in-product  

**AC:** Control taxonomy seeded; many-to-many maps; file evidence with RBAC.  
**Source:** §6 Sprint 6 · §3.4  

### US-SEC-007 — Breach clocks and vendor assessment depth
**As a** privacy officer  
**I want** configurable breach notification clocks and vendor questionnaire/docs  
**So that** regulated workflows are trackable  

**AC:** Jurisdiction offsets configurable; legal hold flag; vendor attachments.  
**Source:** §6 Sprint 7 · §3.2 / §3.4  

### US-SEC-008 — SoD rules and trust centre starter
**As a** compliance manager  
**I want** SoD rules on critical flows and customer-facing trust materials  
**So that** enterprise procurement accelerates  

**AC:** At least one enforced SoD pair + tests; trust pack in docs or site.  
**Source:** §6 Sprint 8 · §3.1 / §3.7  

---

## Epic: People & workplace (Workday-oriented programme)

**Source:** `docs/WORKDAY_PEOPLE_WORKPLACE_GAP_ANALYSIS.md`

### US-HCM-001 — Live workplace KPIs on People hub
**As a** workplace lead  
**I want** facilities and walk-up tiles to show real metrics or honest empty states  
**So that** the hub is trustworthy  

**AC:** No silent placeholders where APIs exist; config flag for disconnected integrations.  
**Source:** §6 Sprint 1 · §3.1  

### US-HCM-002 — Honest workforce “grade” semantics
**As a** CHRO  
**I want** analytics labels to reflect departments vs compensation grades correctly  
**So that** executives are not misled  

**AC:** API/UI renamed or split; optional job grade field + migration note.  
**Source:** §6 Sprint 2 · §3.2 / §4  

### US-HCM-003 — Manager hub
**As a** people manager  
**I want** a team summary of headcount, pending leave, and performance cycle status  
**So that** I have one place for my team  

**AC:** Scoped to report chain; HR override rules documented.  
**Source:** §6 Sprint 3 · §3.1  

### US-HCM-004 — HR strip on platform home
**As an** employee  
**I want** people KPIs on the platform home when I have HR access  
**So that** I see signal without hunting modules  

**AC:** Feature-flagged; deep links to People & Workplace.  
**Source:** §6 Sprint 4 · §3.1  

### US-HCM-005 — Scoped people analytics
**As a** HRBP  
**I want** “my team” vs “org” scope on analytics  
**So that** manager insights do not leak across teams  

**AC:** Tests forbid cross-team leakage; toggle in UI.  
**Source:** §6 Sprint 5 · §3.6  

### US-HCM-006 — Onboarding journey progress
**As an** onboarding coordinator  
**I want** hub widget showing onboarding % complete from templates  
**So that** journeys are visible  

**AC:** Progress API; hub widget with deep link.  
**Source:** §6 Sprint 6 · §3.1  

### US-HCM-007 — Org chart and dotted-line manager
**As an** employee  
**I want** org chart and optional dotted-line reporting  
**So that** matrix orgs are reflected  

**AC:** Chart performant for typical org sizes; optional second manager audited.  
**Source:** §6 Sprint 7 · §3.2  

### US-HCM-008 — Engagement and recruitment signals
**As a** talent leader  
**I want** survey aggregates and pipeline counts on the people hub  
**So that** talent and listening are visible  

**AC:** Privacy-safe aggregation; recruitment read-only stat.  
**Source:** §6 Sprint 8 · §3.5 / §3.8  

---

## Epic: Customer & sales (HubSpot-oriented programme)

**Source:** `docs/HUBSPOT_CUSTOMER_SALES_CRM_GAP_ANALYSIS.md`

### US-CRM-001 — CSM metrics on Customer & Sales hub
**As a** CSM lead  
**I want** live case counts on the hub, not placeholders  
**So that** service + sales leadership see one picture  

**AC:** `csm.dashboardMetrics` (or equivalent); tile matches API statuses.  
**Source:** §6 Sprint 1 · §3.1  

### US-CRM-002 — CRM executive summary API
**As a** revenue leader  
**I want** one API for pipeline, leads, and aging-style slices  
**So that** dashboards stay fast  

**AC:** Documented fields; hub or CRM landing consumes it.  
**Source:** §6 Sprint 2 · §3.1  

### US-CRM-003 — Configurable deal approval thresholds
**As a** RevOps admin  
**I want** procurement-style thresholds configurable per org/currency  
**So that** global rollouts are possible  

**AC:** DB-backed rules; audit on change; migration from constants.  
**Source:** §6 Sprint 3 · §3.5  

### US-CRM-004 — Duplicate invoice and match tolerance
**As an** AP analyst  
**I want** duplicate payable detection and configurable PO match tolerance  
**So that** mistakes are caught early  

**AC:** Org setting soft/hard block; tolerance documented.  
**Source:** §6 Sprint 4 · §3.2  

### US-CRM-005 — Line-aware three-way match
**As a** buyer  
**I want** PO lines and receipts reflected in match quality  
**So that** pay-ready is defensible  

**AC:** Compare line totals / receipt where data exists; invoice pay-ready flag optional.  
**Source:** §6 Sprint 5 · §3.2  

### US-CRM-006 — SoD matrix and one enforced rule
**As an** auditor  
**I want** documented SoD for CRM/finance paths and one automated check  
**So that** controls are demonstrable  

**AC:** `FINANCE_SOD`-style doc for revenue path; feature-flagged rule.  
**Source:** §6 Sprint 6 · §3.7  

### US-CRM-007 — Accounting period close MVP
**As a** controller  
**I want** fiscal periods open/closed with posting guard  
**So that** close discipline exists  

**AC:** Close blocks relevant postings; checklist UI v1.  
**Source:** §6 Sprint 7 · §3.1  

### US-CRM-008 — Legal entity slice on transactions
**As a** group finance lead  
**I want** optional legal entity on invoices and POs  
**So that** multi-entity pilots are supported  

**AC:** Nullable FK; admin CRUD for entities; no eliminations in scope.  
**Source:** §6 Sprint 8 · §3.1  

*Note: US-CRM-006–008 align with **Finance & Procurement** sprint numbering in `MICROSOFT_FINANCE_PROCUREMENT_GAP_ANALYSIS.md` (PBI-F6–F8); kept under CRM epic here only if your team splits epics — prefer **US-FIN-*** below for finance-only tracking.*

---

## Epic: Finance & procurement (Microsoft / Dynamics-class programme)

**Source:** `docs/MICROSOFT_FINANCE_PROCUREMENT_GAP_ANALYSIS.md`

### US-FIN-001 — Finance hub invoice KPIs and PR status alignment
**As a** CFO  
**I want** the Finance & Procurement hub to show real invoice stats and correct PR pending logic  
**So that** CPO metrics match the database  

**AC:** No `"—"` placeholder; PR statuses match `procurement` API.  
**Source:** §6 Sprint 1 · §3.8  

### US-FIN-002 — Financial executive summary
**As a** FP&A partner  
**I want** AP aging, AR outstanding, and overdue counts in one procedure  
**So that** exec reviews are one click  

**AC:** `financial.executiveSummary` (or equivalent); drill-down links.  
**Source:** §6 Sprint 2 · §3.2  

### US-FIN-003 — Configurable procurement approval rules
**As a** procurement admin  
**I want** INR (or multi-currency) thresholds in DB, not code constants  
**So that** policy changes do not require deploys  

**AC:** Admin UI; audit; migration defaults match today.  
**Source:** §6 Sprint 3 · §3.5  

### US-FIN-004 — Duplicate AP invoice and match tolerance
**Same as US-CRM-004** — dedupe vendor+invoice; configurable `matchToOrder` tolerance.  
**Source:** §6 Sprint 4  

### US-FIN-005 — Three-way match v1
**Same as US-CRM-005** — line/receipt-aware matching.  
**Source:** §6 Sprint 5  

### US-FIN-006 — Finance SoD matrix and enforcement
**As an** internal auditor  
**I want** `FINANCE_SOD_MATRIX.md` and an enforced SoD example  
**So that** SOX narratives hold  

**AC:** Doc + one rule + tests.  
**Source:** §6 Sprint 6 · §3.7  

### US-FIN-007 — Accounting period close
**Same as US-CRM-007**  
**Source:** §6 Sprint 7  

### US-FIN-008 — Legal entity on financial documents
**Same as US-CRM-008**  
**Source:** §6 Sprint 8  

---

## Epic: Legal & governance — India & issuer programme

**Source:** `docs/RELIANCE_LEGAL_GOVERNANCE_INDIA_GAP_ANALYSIS.md` (includes **§3.9** 100% closure matrix and **§6** phased plan)

### US-LEG-001 — Legal hub: secretarial truth and contracts
**As a** GC  
**I want** the Legal & Governance hub to show secretarial and contract KPIs, not wrong tiles  
**So that** I trust the landing page  

**AC:** Secretarial tile uses meetings/calendar/KYC; contracts expiring surfaced.  
**Source:** §6 Phase 1 Sprint 1 · §3.8 / §2  

### US-LEG-002 — Legal governance summary API
**As a** product engineer  
**I want** one composite API for the legal hub  
**So that** performance and consistency improve  

**AC:** Single round-trip; RBAC respected.  
**Source:** §6 Phase 1 Sprint 2  

### US-LEG-003 — Legal and secretarial RBAC split
**As a** legal counsel  
**I want** `legal` and `secretarial` permissions separate from blanket `grc`  
**So that** privilege walls hold  

**AC:** Matrix + migration; hub gate documented.  
**Source:** §6 Phase 1 Sprint 3 · §3.8  

### US-LEG-004 — Board and compliance visibility on hub
**As a** company secretary  
**I want** next meetings and compliance due/overdue on the hub  
**So that** nothing obvious is missed  

**AC:** Data from `secretarial` + `india-compliance`.  
**Source:** §6 Phase 1 Sprint 4 · §3.3  

### US-LEG-005 — Litigation structured fields
**As a** litigator  
**I want** CNR, court, forum, and next hearing on matters  
**So that** docket management is usable  

**AC:** Filters by hearing window; migration.  
**Source:** §6 Phase 1 Sprint 5 · §3.5  

### US-LEG-006 — Contract stamp and registration tracking
**As a** legal ops analyst  
**I want** stamp and registration status on contracts  
**So that** India formalities are tracked  

**AC:** Nullable fields; report/hub badge.  
**Source:** §6 Phase 1 Sprint 6 · §3.4  

### US-LEG-007 — RPT register MVP
**As an** audit committee secretary  
**I want** related-party transactions with approvals and exports  
**So that** packs are assemble-able  

**AC:** CSV export; optional resolution link.  
**Source:** §6 Phase 1 Sprint 7 · §3.2  

### US-LEG-008 — DPDP RoPA starter
**As a** DPO  
**I want** a processing activities register linked to privacy matters  
**So that** DPDP posture is documented  

**AC:** Org-scoped; privacy SME sign-off.  
**Source:** §6 Phase 1 Sprint 8 · §3.6  

### US-LEG-009+ — Full issuer & secretarial depth (programme)
**As a** listed company secretary  
**I want** registers, MCA packs, SRN tracking, LODOR library, grievances, voting, e-Courts, DPDP full, FEMA/CCI — per **§3.9**  
**So that** we approach **100% closure** of the master matrix  

**AC:** Map each **§3.9** row to **Done** per **§6 Phases 2–6** (Sprints 7–36).  
**Source:** §3.9 · §6.3–6.8  

---

## Epic: Strategy & projects (market-leader bar)

**Source:** `docs/AMAZON_STRATEGY_PROJECTS_GAP_ANALYSIS.md`

### US-STR-001 — Strategy hub analytics tile live
**As a** strategy PMO  
**I want** the Analytics module tile to show a real metric  
**So that** executives do not see `"—"`  

**AC:** Uses `reports` / `dashboard` / count; permission-safe.  
**Source:** §6 Sprint 1 · §3.8  

### US-STR-002 — Strategy portfolio summary API
**As a** frontend engineer  
**I want** one summary procedure for the strategy dashboard  
**So that** we reduce over-fetch  

**AC:** Cached/rate-limited; includes portfolio health + APM optional.  
**Source:** §6 Sprint 2  

### US-STR-003 — OKRs visible on Strategy & Projects
**As an** executive  
**I want** OKR health on the strategy home with link to detail  
**So that** goals are not buried in HR  

**AC:** KPIs from `hr.okr` or proxy; RBAC clear.  
**Source:** §6 Sprint 3 · §3.1  

### US-STR-004 — Strategic initiatives linked to projects
**As a** chief of staff  
**I want** initiatives/themes with projects hanging off them  
**So that** we can explain alignment  

**AC:** `initiativeId` on projects; coverage widget.  
**Source:** §6 Sprint 4 · §3.1  

### US-STR-005 — Project benefit tracking
**As a** finance partner  
**I want** benefit type/target/actual on projects  
**So that** we track outcomes not only spend  

**AC:** Hub aggregate documented.  
**Source:** §6 Sprint 5 · §3.2  

### US-STR-006 — Portfolio intake approval
**As a** portfolio gatekeeper  
**I want** proposed projects to require approval before full execution  
**So that** governance matches enterprise PMO  

**AC:** Status machine + audit + notification.  
**Source:** §6 Sprint 6 · §3.2  

### US-STR-007 — Cross-project dependencies
**As a** program manager  
**I want** dependencies between projects with risk signal  
**So that** delays are visible early  

**AC:** No destructive cycles; hub heuristic documented.  
**Source:** §6 Sprint 7 · §3.3  

### US-STR-008 — APM linked to projects
**As an** enterprise architect  
**I want** applications linked to migration projects  
**So that** rationalization ties to delivery  

**AC:** Join or array; hub stat for linked projects.  
**Source:** §6 Sprint 8 · §3.6  

---

## Backlog hygiene

| Practice | Recommendation |
|----------|----------------|
| **De-duplication** | **US-CRM-004**–**008** vs **US-FIN-004**–**008** — keep **one** ID per team boundary (CRM vs FIN). |
| **Sizing** | Size in story points after technical spikes; **US-LEG-009+** is **epic-only** until phased breakdown. |
| **Dependencies** | Security **Sprint 3** before org-wide SIEM; Legal **RBAC** before composite API if procedures assume new modules. |
| **Traceability** | Link Jira/Linear `NEXUS-xxx` ↔ `US-*` in your tracker. |

---

## Living document

This backlog is **maintained in-repo**. When a story ships, is de-scoped, or stalls, update the **Status rollup** (below), refresh **Programme progress** counts if needed, and append a row to **Changelog**. Prefer **Partial** over **Done** until every **AC** in the story is satisfied. The programme **target remains 100%** of rollup stories **Done** (see **Programme charter**).

### Status meanings

| Status | Meaning |
|--------|---------|
| **Backlog** | Not started; story text and AC remain the planning target. |
| **In progress** | Active implementation; point **Notes** at branch/PR if useful. |
| **Partial** | Some AC met; **Notes** spell out what is left or what was descoped. |
| **Done** | All AC satisfied (or story explicitly superseded — say by what). |
| **Deferred** | Postponed by decision; **Notes** hold reason / revisit trigger. |
| **Blocked** | Waiting on dependency, vendor, or architecture decision. |

### Status rollup

*Snapshot **last reviewed: 2026-04-25** (codebase paths: `apps/api`, `apps/web`, `packages/db`, `docs/`). Update this table on merge; do not let it rot.*

| ID | Status | Notes |
|----|--------|--------|
| US-ITSM-001 | Partial | SLA pause + reason on tickets (`tickets` router, `sla_pause_reason_code`); org-configurable reason *catalog* still thin. |
| US-ITSM-002 | Partial | Response vs resolve SLA fields (`sla_response_*`, `sla_resolve_*`); “multiple concurrent targets” beyond two clocks not fully validated vs AC. |
| US-ITSM-003 | Backlog | — |
| US-ITSM-004 | Partial | `parent_ticket_id` + wiring; comms log / war-room / full MIM not done. |
| US-ITSM-005 | Backlog | — |
| US-ITSM-006 | Partial | `cmdb` CI create/update/link (`assets` router); class graph, bulk import, service map depth still backlog. |
| US-ITSM-007 | Backlog | — |
| US-ITSM-008 | Backlog | — |
| US-ITSM-009 | Backlog | — |
| US-SEC-001 | Partial | Privileged **step-up** gate (`stepUpGate`, Redis session); org “MFA policy” matrix not fully productized. |
| US-SEC-002 | Backlog | — |
| US-SEC-003 | Backlog | — |
| US-SEC-004 | Backlog | — |
| US-SEC-005 | Backlog | — |
| US-SEC-006 | Backlog | — |
| US-SEC-007 | Backlog | — |
| US-SEC-008 | Partial | `docs/FINANCE_SOD_MATRIX.md`, `docs/TRUST_CENTRE_STARTER.md`; SoD example on invoice pay (`markPaid` vs approver). |
| US-HCM-001 | Backlog | — |
| US-HCM-002 | Backlog | — |
| US-HCM-003 | Backlog | — |
| US-HCM-004 | Backlog | — |
| US-HCM-005 | Backlog | — |
| US-HCM-006 | Backlog | — |
| US-HCM-007 | Backlog | — |
| US-HCM-008 | Backlog | — |
| US-CRM-001 | Partial | Customer & Sales hub: `csm.dashboard` counts from `csm_cases`; KPI + module tile + alert (no `"—"` when user has `csm` read). |
| US-CRM-002 | Backlog | — |
| US-CRM-003 | Backlog | — |
| US-CRM-004 | Partial | Duplicate payable policy + match tolerance (`org-settings`, `procurement.matchToOrder`, `financial`); track under **US-FIN-004** if finance owns. |
| US-CRM-005 | Backlog | Line/receipt-aware three-way match not v1-complete. |
| US-CRM-006 | Partial | SoD doc + one enforced path; prefer **US-FIN-006** as source of truth for finance SoD. |
| US-CRM-007 | Partial | Period close guard (`isInvoicePeriodClosed`, org settings); checklist UI v1 open. |
| US-CRM-008 | Partial | `legal_entities`, `invoices.legal_entity_id`; admin CRUD / PO slice as needed. |
| US-FIN-001 | Partial | Finance & Procurement hub: `procurement.dashboard` (PR **pending** = `pr_status.pending`), `financial.executiveSummary` (AP/AR open), real **PO** list via `purchaseOrders.list`; labels fixed (PR vs PO). |
| US-FIN-002 | Partial | `financial.executiveSummary`; drill-down links / hub wiring may lag. |
| US-FIN-003 | Backlog | DB-backed thresholds + admin UI + audit. |
| US-FIN-004 | Partial | Same implementation as **US-CRM-004** (dedupe + tolerance). |
| US-FIN-005 | Backlog | — |
| US-FIN-006 | Partial | Matrix doc + enforced SoD example (invoice pay); expand tests / more pairs. |
| US-FIN-007 | Partial | Same as **US-CRM-007**. |
| US-FIN-008 | Partial | Same as **US-CRM-008**. |
| US-LEG-001 | Backlog | — |
| US-LEG-002 | Backlog | — |
| US-LEG-003 | Deferred | Split `legal` / `secretarial` permissions — parked; revisit before composite legal API hard-gates. |
| US-LEG-004 | Backlog | — |
| US-LEG-005 | Backlog | — |
| US-LEG-006 | Backlog | — |
| US-LEG-007 | Backlog | — |
| US-LEG-008 | Backlog | — |
| US-LEG-009+ | Backlog | Programme epic; break into phased **US-LEG-xxx** when executing §3.9 / §6. |
| US-STR-001 | Partial | Strategy hub Analytics tile: live **open tickets** count via `reports.executiveOverview` when user has `reports` read (else honest `"—"`). |
| US-STR-002 | Partial | `projects.portfolioHealth` (+ related APM portfolio routes); “one procedure for strategy dashboard” may still split calls. |
| US-STR-003 | Partial | OKR schema + `hr` OKR procedures + `dashboard.getMetrics` **activeOkrs** + migration `0017_okr_objectives`; Strategy home UX/RBAC polish open. |
| US-STR-004 | Backlog | — |
| US-STR-005 | Backlog | — |
| US-STR-006 | Backlog | — |
| US-STR-007 | Backlog | — |
| US-STR-008 | Backlog | — |

### Changelog

| Date | Change |
|------|--------|
| 2026-04-25 | Introduced **Living document**: status meanings, **Status rollup** (initial snapshot), **Changelog**. |
| 2026-04-25 | Hub gap closures: **US-FIN-001** (finance-procurement), **US-CRM-001** (`csm.dashboard` SQL metrics), **US-STR-001** (strategy analytics tile); rollup updated. |
| 2026-04-25 | **Programme charter**: explicit **100% closure** target, phased rules, **US-LEG-009+** decomposition requirement, rollup-derived **Programme progress** snapshot. |

---

## Disclaimer

User stories are **planning artefacts** derived from static gap docs. The **programme** may still target **100% closure** of this backlog as a product roadmap: **Done** for sensitive domains means **implemented and professionally validated** where required — not “shipped untested to production.” **Legal, tax, and regulatory** stories require **professional validation** before use in regulated contexts; that work is part of reaching **Done**, not a reason to leave rows unbounded in **Backlog**.
