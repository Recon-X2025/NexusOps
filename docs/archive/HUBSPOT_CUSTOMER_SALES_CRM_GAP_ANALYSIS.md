# HubSpot vs CoheronConnect — Customer & Sales / CRM Gap Analysis

**Perspective:** Chief Product Officer lens, using **HubSpot**’s **CRM** and adjacent **Customer Platform** (Marketing, Sales, and Service hubs, shared CRM objects, automation, and reporting) as the reference  
**Scope:** CoheronConnect **Customer & Sales Dashboard** (`/app/customer-sales`), **`crm`** API, **`csm`** (customer service cases), and linked surfaces (**catalog**, **surveys**)  
**Audience:** Product strategy, revenue operations, and CRM evaluation teams  
**Date:** April 2026  

---

## 1. Executive summary

CoheronConnect delivers a **unified operational dashboard** for revenue-adjacent work: **live CRM KPIs** (open pipeline, closed-won, new leads), a **deal list** and **stage-based pipeline summary**, **open catalog requests**, **active surveys**, and deep links into **CRM**, **CSM**, **catalog**, and **surveys**. The **`crm`** router implements **accounts, contacts, deals** (with a **fixed stage enum**), **leads** (lifecycle statuses, convert to deal), **activities**, **quotes**, and **dashboard metrics**.

HubSpot’s product story is a **connected customer platform**: a **flexible CRM** (custom properties, multiple pipelines, associations, timeline), **Marketing Hub** (forms, email, automation, ads, content), **Sales Hub** (sequences, playbooks, meetings, forecasting tiers), **Service Hub** (tickets, help desk, knowledge, portal), **Operations** and **data** tooling, **B2B commerce** where relevant, and a large **ecosystem** (App Marketplace, native integrations). CoheronConnect is **stronger as an ERP / service-management backbone** with CRM **adjacent**; it is **not** a full **HubSpot-class growth stack** out of the box.

**Bottom line:** For a HubSpot CPO-style evaluation, CoheronConnect covers **core CRM record types** and a **credible revenue dashboard**, with the largest gaps in **marketing automation**, **pipeline and property configurability**, **sales engagement** (sequences, meetings), **forecasting and RevOps depth**, **CSM metrics on the hub** (currently **placeholder**), and **platform ecosystem** parity.

---

## 2. What CoheronConnect provides (observed)

| Area | Implementation notes |
|------|------------------------|
| **Customer & Sales dashboard** | `apps/web/src/app/app/customer-sales/page.tsx`: KPIs from `crm.dashboardMetrics`; recent deals; pipeline by stage (client-side aggregation); catalog open count; survey counts; module cards to CSM, CRM, catalog, surveys. **CSM tile shows `"—"` for case counts** (not wired to live metrics on the hub). Pipeline stage colours include `qualified` while API stages use `qualification` — **minor label mismatch** risk in UI vs backend. |
| **CRM core** | `apps/api/src/routers/crm.ts`: `listAccounts` / `createAccount` / `updateAccount`; contacts; **deals** with `movePipeline` stages (`prospect` → `closed_won` / `closed_lost`); leads CRUD + `convertLead`; activities; quotes with line items; **`dashboardMetrics`** (open pipeline count/value, closed-won, new leads). |
| **Customer service (CSM)** | `apps/api/src/routers/csm.ts`: cases list/create/update tied to `csm_cases`, links to CRM account/contact. |
| **Adjacent modules** | **Service catalog** (`catalog`) and **surveys** surfaced on the same dashboard — closer to **ticket/catalog** than HubSpot **service desk**, but relevant for “customer operations.” |

---

## 3. Gap analysis by domain

### 3.1 Customer & Sales dashboard vs HubSpot “home / reporting”

| Capability | HubSpot (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|------------|
| **Role-aware CRM home** | Customisable reports, today’s meetings, deal alerts | Dashboard is **aggregate KPI + tables**; no **rep-level task** surface on this page | **Partial** |
| **Service + sales in one view** | Service Hub + CRM unified timeline | CSM + CRM linked by account; hub **does not show case volume** | **Gap** — **CSM stats placeholder** on dashboard |
| **Marketing snapshot** | Traffic, form submissions, campaign performance | **Not on Customer & Sales hub** | **Gap** |
| **Drill-down reporting** | Report builder, dashboards, attribution | **Fixed metrics** + raw lists | **Gap** vs **HubSpot reporting** depth |

### 3.2 CRM data model (companies, contacts, deals)

| Capability | HubSpot (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|------------|
| **Companies & contacts** | Rich records, dedupe, merge | Accounts + contacts with optional link | **Partial** — **dedupe/merge** not assumed |
| **Custom properties** | Extensive, per object | Org **custom fields** exist elsewhere in platform; **not enumerated** on CRM objects in this review | **Partial** — verify CRM object coverage |
| **Associations** | Many-to-many, custom association types | Account/contact/deal **foreign keys** | **Partial** |
| **Multiple deal pipelines** | Per team / product line | **Single** stage enum on `movePipeline` | **Gap** |
| **Configurable stages** | Admin-defined | **Code-defined** enum | **Gap** for RevOps self-serve |
| **Products & line items on deals** | Product library, SKUs | **Quotes** have line items; deal object is **simpler** | **Partial** |

### 3.3 Marketing Hub (inbound, campaigns, automation)

| Capability | HubSpot (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|------------|
| **Forms & landing pages** | Drag-drop, GDPR, progressive profiling | **Not in CRM router** | **Gap** |
| **Email marketing & nurture** | Visual builder, A/B, send-time | **Not observed** as HubSpot-equivalent | **Gap** |
| **Workflows / automation** | If/then across objects | **Workflows** engine exists platform-wide; **not** positioned as **marketing automation** | **Partial** — different **centre of gravity** |
| **Lists & segmentation** | Active/static lists | **Filter queries** on entities; **not** full list builder UX | **Partial** |
| **Ads, social, blog, SEO** | Native or integrated | **Out of scope** for CoheronConnect CRM surface | **Gap** for **all-in-one** comparison |

### 3.4 Sales Hub (engagement, productivity, forecasting)

| Capability | HubSpot (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|------------|
| **Email tracking & sequences** | Opens, clicks, multi-step sequences | **Not observed** in CRM API | **Gap** |
| **Meetings & calendar** | Booking links, round-robin | **Not observed** | **Gap** |
| **Playbooks & templates** | Guided selling | **Not observed** | **Gap** |
| **Forecasting** | Team rollup, categories, quota | **Weighted value** on create; **no** forecast workspace | **Partial** |
| **Mobile CRM** | Native apps | Web-first | **Partial** |

### 3.5 Service Hub (support) vs CoheronConnect CSM

| Capability | HubSpot (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|------------|
| **Tickets & SLAs** | Pipelines, SLAs, help desk | **CSM cases** + **ITSM-style** platform elsewhere | **Partial** — **different** primary model |
| **Knowledge base & portal** | Customer-facing KB | **Knowledge** module is **internal**-leaning in broader product | **Partial** |
| **CSAT / surveys** | Native feedback | **Surveys** on same dashboard | **Partial** — compare **ticket-survey** linkage |

### 3.6 Quotes, CPQ, and revenue operations

| Capability | HubSpot (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|------------|
| **Quotes & e-sign** | Quote PDF, signatures (tiers) | **Quotes** with items, status lifecycle | **Partial** — **e-sign** not assumed |
| **Subscriptions & billing** | Commerce / integrations | **Financial** modules separate; **not** quote-to-cash in one HubSpot-like flow | **Partial** |
| **RevOps analytics** | Waterfall, pipeline velocity | Basic **stage counts** on dashboard | **Gap** |

### 3.7 Platform, AI, and ecosystem

| Capability | HubSpot (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|------------|
| **App Marketplace & integrations** | Thousands of connectors | **Integrations** router, curated catalogue | **Partial** at scale |
| **CRM-powered AI** | Content, insights, agents (e.g. Breeze) | **`ai`** router platform-wide; **not** CRM-scoped in this review | **Partial** |
| **Data sync & quality** | Ops Hub, dedupe tools | **Not** positioned as **HubSpot Ops** equivalent | **Gap** |

---

## 4. Strategic implications (CPO talking points)

1. **Positioning:** CoheronConnect should be sold as **“CRM + operations on one spine”** (deals + catalog + service cases + finance adjacent), not as a **replacement for HubSpot Marketing + Sales + Service** without a **clear scope line**.
2. **Quick win:** Wire **CSM case counts** (open, high priority) into the Customer & Sales dashboard to remove the **`"—"`** placeholder and align with **unified revenue + service** narrative.
3. **Pipeline semantics:** Align **UI stage labels** with **`movePipeline` enums** (e.g. `qualification` vs `qualified`) to avoid **RevOps distrust** in demos.
4. **Partner strategy:** For **marketing automation** and **sales engagement**, a **partner** or **integration-first** story (HubSpot, Salesforce Marketing Cloud, Outreach, etc.) may be more honest than implying **native parity**.

---

## 5. Code references (for CoheronConnect maintainers)

| Topic | Location |
|-------|----------|
| Customer & Sales dashboard | `apps/web/src/app/app/customer-sales/page.tsx` |
| CRM API | `apps/api/src/routers/crm.ts` |
| CSM API | `apps/api/src/routers/csm.ts` |

---

## 6. Customer & Sales gap-closure — sprint plan (Scrum)

This section maps **§3 gaps** and **§4 strategic themes** to a **time-boxed backlog** for one cross-functional team (backend, web, QA, product, RevOps SME). **Marketing Hub** parity (§3.3) is treated as **integration / partner** work unless product strategy explicitly funds a native builder.

### 6.1 Cadence and guardrails

| Item | Proposal |
|------|----------|
| **Sprint length** | 2 weeks |
| **Ceremonies** | Sprint Planning, Daily Scrum, Sprint Review, Sprint Retrospective |
| **Backlog refinement** | Weekly; RevOps SME validates **stage** and **metric** definitions |
| **Definition of Ready** | API contract for new `crm.*` / `csm.*` procedures; dashboard mocks for KPI changes |
| **Definition of Done** | RBAC unchanged or explicitly extended; **no** stage regression for in-flight deals; E2E or integration test for **movePipeline** when stages change |

**Product goal (program):** *Revenue and customer leaders see a **single trustworthy hub**: **live service load**, **accurate pipeline semantics**, **richer CRM metrics**, and a **path** to **RevOps** and **configurable selling** — without claiming full HubSpot Marketing/Sales/Service parity.*

**Ordering:** **Dashboard honesty** first (CSM + labels), then **metrics depth**, then **seller-centric** views, then **configurable pipeline** and **RevOps** slices.

---

### 6.2 Sprint 0 — discovery (1 week; spike sprint)

| ID | Backlog item | Maps to |
|----|----------------|---------|
| SPIKE-C0-01 | **CSM metrics** contract: open cases, by priority/status, SLA if any in schema | §3.1, §4 |
| SPIKE-C0-02 | **Configurable stages** options: org-scoped stage table vs multiple pipelines | §3.2 |
| SPIKE-C0-03 | **RevOps** MVP: which 2–3 metrics (velocity, aging, conversion) are feasible from current tables | §3.6 |
| SPIKE-C0-04 | **Marketing** stance: native forms vs **embed** + webhook vs HubSpot sync integration | §3.3, §4 |

**Sprint goal:** *ADRs and metric dictionary; no production feature requirement.*

---

### 6.3 Sprint 1 — CSM on the Customer & Sales hub

**Sprint goal:** *Remove the **CSM `"—"`** placeholder; service volume is visible next to pipeline.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C1-1 | **`csm.dashboardMetrics`** (or extend existing): `openCases`, `urgentOrHigh`, optional `createdLast7d` | `permissionProcedure("csm","read")` |
| PBI-C1-2 | **`customer-sales/page.tsx`**: wire first CSM module tile stats + optional top alert | Matches catalog/survey pattern |
| PBI-C1-3 | Deep link to filtered CSM list (e.g. open cases) | UX copy reviewed |

---

### 6.4 Sprint 2 — Pipeline semantics and UI truth

**Sprint goal:** *Demo pipeline colours and labels match **`movePipeline`** enums (§2 mismatch).*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C2-1 | Align **`PIPELINE_STAGE_COLORS`** / labels with `crm` stages (`qualification` not `qualified`, include `verbal_commit`, etc.) | Single source of truth (shared constant or API metadata) |
| PBI-C2-2 | **Ordered funnel** option: canonical stage order for hub chart (not locale sort) | Document order for RevOps |

---

### 6.5 Sprint 3 — CRM dashboard metrics v2

**Sprint goal:** *Hub rivals basic HubSpot **reporting tiles** for ops reviews.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C3-1 | Extend **`crm.dashboardMetrics`**: e.g. leads by status breakdown, **avg open deal age**, **closing this month** (expected close in range) | Performance tested on large orgs |
| PBI-C3-2 | Customer & Sales **KPI row** for new metrics (behind layout / responsive rules) | No duplicate confusing labels |

---

### 6.6 Sprint 4 — Seller-centric “my work” strip

**Sprint goal:** *Address §3.1 **role-aware** gap at MVP — rep sees **their** pipeline on the hub.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C4-1 | **`crm.myDashboardMetrics`** or filtered queries: `myOpenDeals`, `myNewLeads`, `myActivitiesDue` (if activity due date exists; else stub with “activities this week”) | Scoped to `ctx.user.id` as owner |
| PBI-C4-2 | Dashboard section **visible when** `accounts` read + user is in sales role (matrix or flag) | Fallback: hide if no deals owned |

---

### 6.7 Sprint 5 — Configurable deal stages (MVP)

**Sprint goal:** *Begin §3.2 **admin-defined stages** without full HubSpot multi-pipeline.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C5-1 | **`crm_pipeline_stages`** (or equivalent): org-scoped ordered stages, active flag | Migration: map current enum to seed rows |
| PBI-C5-2 | **`movePipeline`** validates against org stages; admin UI CRUD (protected) | Existing deals migrated or grandfathered |
| PBI-C5-3 | Hub funnel reads **stage config** for labels/colours | Removes hardcoded drift |

---

### 6.8 Sprint 6 — RevOps analytics slice

**Sprint goal:** *§3.6 **velocity / health** beyond raw sums.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C6-1 | **Pipeline velocity** or **stage conversion** (simple): SQL view + `crm.pipelineAnalytics` query | Document definitions in `docs/` |
| PBI-C6-2 | Customer & Sales **mini report** card or link to `/app/reports` pre-filter | RevOps SME sign-off |

---

### 6.9 Sprint 7 — Associations and data hygiene (lite)

**Sprint goal:** *§3.2 **dedupe** / quality — pragmatic MVP.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C7-1 | **Duplicate contact** warning on create (same org + email) | Soft block or flag |
| PBI-C7-2 | **Lead convert** links **account** when company string matches existing account (optional helper) | Audit trail |

---

### 6.10 Sprint 8 — Quote-to-cash teaser or survey linkage

**Sprint goal:** *Deepen **customer journey** narrative on the hub.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-C8-1 | **Quotes awaiting acceptance** count on `dashboardMetrics` or hub | Uses `crmQuotes` statuses |
| **or** PBI-C8-2 | **Survey NPS** or last-response snippet on hub (privacy-safe aggregate) | Legal/privacy review if PII |

*(Pick one primary for the sprint; the other becomes fast-follow.)*

---

### 6.11 Fast-follow epics (outside core 8 sprints)

| Epic | Maps to | Note |
|------|---------|------|
| **Marketing**: forms, email, nurture | §3.3 | Prefer **integration** (HubSpot/Mailchimp) unless strategy shifts |
| **Sequences, meetings, playbooks** | §3.4 | Partner or phased native |
| **Multiple deal pipelines** | §3.2 | After stage MVP stabilises |
| **Forecast categories & quota** | §3.4 | Often finance + CRM joint design |
| **E-sign on quotes** | §3.6 | Vendor selection (DocuSign, etc.) |

### 6.12 Dependencies and parallelisation

- **Sprint 2** should complete before large **stage migration** (Sprint 5) so UX patterns are stable.
- **Sprint 5** is a **breaking-change risk** — feature-flag migration and backfill script mandatory.
- **Sprint 4** can run parallel to **Sprint 3** if two engineers available (different procedures).

### 6.13 Team metrics (sample)

| Metric | Purpose |
|--------|---------|
| Hub **CSM** tile **non-placeholder** rate | Dashboard completeness |
| **Stage mismatch** bugs (UI vs API) | Data trust |
| **Median time** to add org stage (admin) | Config usability |
| RevOps SME **metric sign-off** per sprint | Stakeholder alignment |

---

## 7. Disclaimer

This document is based on **repository review** as of the analysis date. **HubSpot** packaging and features vary by **hub, tier, and add-ons**. CoheronConnect capabilities vary by **deployment and UI completeness**. Use this as a **competitive positioning and roadmap checklist**, not a warranty of either product.
