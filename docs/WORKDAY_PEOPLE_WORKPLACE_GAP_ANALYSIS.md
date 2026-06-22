# Workday vs CoheronConnect — People & Workplace / HCM Gap Analysis

**Perspective:** Chief Human Resources Officer lens, using **Workday HCM** (Core, Talent, Absence, Payroll adjacent products, and **people analytics** experiences such as Workday People Analytics / manager insights) as the reference bar  
**Scope:** CoheronConnect **People & Workplace** entry (`/app/people-workplace`), **platform home** (`/app/dashboard`), **People Analytics** (`/app/people-analytics`), and supporting **HR / workforce / performance / recruitment** APIs  
**Audience:** HR technology strategy, people analytics, and workplace operations leaders  
**Date:** April 2026  

---

> **Status (2026-04-26):** the **Walk-Up Experience** module referenced throughout this analysis was retired in the GA-readiness pass (see `docs/MARKET_ASSESSMENT_2026-04-26.md` and the Architecture Design changelog v2.1). Walk-in visits are now captured as regular `tickets` rows with `channel = "walk_in"` and worked from the Service Desk workbench. Where this document mentions "walk-up tiles", "walkup KPIs", "queue length from `walkup` router", etc., treat those gaps as **N/A — surface removed**. The remaining gap commentary (HCM depth, manager hub, position management, analytics) is unchanged.

---

## 1. Executive summary

CoheronConnect offers a **modular People & Workplace hub**: a **dashboard** summarising HR cases, onboarding/offboarding counts, and links into **HR service delivery**, **employee portal**, **facilities**, and **walk-up**; a separate **People Analytics** experience powered by **`workforce`** APIs (headcount, tenure, leave, attrition, department/location splits); and a broad **`hr`** surface (employees, cases, leave, onboarding templates, payroll-related procedures, holidays, attendance, expenses, OKRs) plus **`performance`** (review cycles, reviews, goals) and **`recruitment`**.

Workday’s value proposition for global enterprises is **unified HCM on a single object model**: **effective-dated** worker and position data, deep **organisational** and **compensation** structures, **configurable business processes**, **global payroll and benefits** ecosystems, **enterprise talent** (learning, skills, succession), and **analytics** with governance (storyboards, benchmarks, hierarchy-aware security). CoheronConnect is **stronger as an integrated “business OS”** with ITSM, finance, and security adjacent to HR; it is **not yet equivalent** to Workday’s depth in **core HCM data semantics**, **global scale**, **manager/employee experience polish**, or **analytics productisation**.

**Bottom line:** For a Workday-calibre CHRO evaluation, CoheronConnect reads as a **capable mid-market people operations layer** with **analytics snapshots** and **growing talent/payroll features**, with the largest gaps in **core HCM richness**, **people analytics depth**, **benefits and global payroll**, and **dashboard completeness** (several workplace tiles still **placeholder**).

---

## 2. What CoheronConnect provides (observed)

| Area | Implementation notes |
|------|----------------------|
| **People & Workplace dashboard** | `apps/web/src/app/app/people-workplace/page.tsx`: KPIs for open HR cases, active onboardings, pending offboardings, total employees; alerts; module cards to HR, employee portal, facilities, walk-up; recent cases and employee activity lists. Facilities/walk-up **summary stats show placeholders** (`"—"`) for spaces and queue. |
| **Platform home** | `apps/web/src/app/app/dashboard/page.tsx`: **operations-centric** metrics (tickets, SLA, approvals, work orders, finance, assets)—**not** a Workday-style “today for people” landing. |
| **People Analytics** | `apps/web/src/app/app/people-analytics/page.tsx` + `workforce` router: headcount (incl. by dept/type/location), tenure bands, leave utilisation, attrition trends, `summary` for totals/on-leave/new hires/pending leaves; gated by `workforce_analytics` (`apps/api/src/routers/workforce.ts`). |
| **Core HR** | `hr` router: employees (directory, manager link, employment types), HR cases, leave (balances, approve/reject), onboarding templates, payroll-related flows, holidays, attendance, expenses, OKRs (`apps/api/src/routers/hr.ts`). |
| **Performance** | Review cycles (including 360 flag in schema), reviews, goals (`apps/api/src/routers/performance.ts`). |
| **Workplace** | Facilities and walk-up routes exist at product level; dashboard integration **partial** (see above). |
| **Recruitment** | Dedicated module and dashboard patterns (`apps/web/src/app/app/recruitment/page.tsx`). |
| **Surveys** | `surveys` router in API (employee listening can be extended; not deep‑compared here). |

---

## 3. Gap analysis by domain

### 3.1 People & Workplace dashboard vs Workday “home / today”

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| Role-aware **home** (tasks, approvals, team insights) | My Workday, inbox-driven processes, prompts | People hub is **case- and count-centric**; platform home is **IT/finance heavy** | **Gap** for a **single CHRO landing** mirroring Workday Today. |
| **Manager** dashboard (team health, time off, goals) | Manager hub, team calendar | Not a first-class consolidated manager view in People hub | **Gap**. |
| **Cross-module** workplace metrics (space utilisation, walk-up wait) | Often integrated or partner solutions | Module cards describe facilities/walk-up; **live KPIs not wired** on hub | **Partial** — **implementation gap** visible in UI. |
| **Personalisation / journeys** | Configurable journeys, nudges | Onboarding counts and HR cases; **no journey orchestration** at hub level | **Gap**. |

### 3.2 Core HCM (worker, job, organisation)

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| **Worker / employment model** | Multiple employments, contracts, global IDs | Employee linked to **one user**, `employeeId`, manager, dept, title, type, location | **Partial** — simpler **1:1 user–employee** model. |
| **Position management** | Position vs job, vacancy, FTE | Not observed as first-class | **Gap** for position‑centric orgs. |
| **Effective dating** | All major objects effective-dated | Point-in-time fields; **no universal effective dating** | **Gap** for audit and reorganisation history. |
| **Org chart / hierarchy** | Dynamic supervsory matrix, matrix managers | Manager field + reportees on **get** | **Partial** — limited **matrix / dotted-line** storytelling. |
| **Compensation architecture** | Grade, step, plans, eligibility | `gradeDistribution` API labels **department** as “grade” in places — **semantic mismatch** | **Gap** for comp-grade analytics until model aligns. |
| **Global / local** | Localisations, statutory bundles | India-oriented compliance elsewhere in suite; **not Workday-scale localisation** in core HR router | **Partial**. |

### 3.3 Time, absence, and labour

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| **Absence policies & accruals** | Complex eligibility, calendars, carryover | Leave requests, balances, holidays | **Partial** — policy engine depth **not equivalent**. |
| **Time tracking / scheduling** | Time clocks, labour allocation | **Attendance** surface in HR | **Partial** — enterprise T&A **unlikely parity**. |

### 3.4 Payroll and benefits

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| **Global payroll** | Country payroll, gross-net, integrations | Payroll procedures under **`hr.payroll`** (e.g. regional flows) | **Partial** — scope **narrower** than Workday Payroll network. |
| **Benefits administration** | Plans, enrolment, life events | Not surfaced as dedicated benefits module in this review | **Gap** for US-style benefits **admin** experiences. |

### 3.5 Talent (recruiting, learning, performance, skills)

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| **Recruiting ATS** | Full requisition-to-offer | **Recruitment** module present | **Partial** — feature depth **case-by-case**. |
| **Learning** | LMS, compliance training assignments | Knowledge/HR adjacent; **no Workday Learning equivalent** called out | **Gap** at LMS parity. |
| **Performance** | Continuous feedback, calibration, talent reviews | Cycles, reviews, goals, optional 360 flag | **Partial** — calibration **workbench** depth typically **lighter**. |
| **Skills / career hub** | Skills cloud, gigs, internal mobility | OKRs exist; **skills ontology / marketplace** not observed | **Gap**. |
| **Succession** | Nomination, readiness | Not observed | **Gap**. |

### 3.6 People analytics vs Workday People Analytics

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| **Metric catalogue** | Large standard library, governed definitions | **Custom aggregates** (headcount, leave, attrition, tenure) | **Partial**. |
| **Hierarchy-aware security** | Row-level by supervisory org | Org-scoped **RBAC**; analytics via **`workforce_analytics`** | **Partial** — **not** hierarchy-scoped drill-down like Prism. |
| **Benchmarks / external data** | Industry benchmarks | Not observed | **Gap**. |
| **Storyboards / insights** | Narrative analytics, distribution | Charts in **People Analytics** UI | **Partial** — **less productised**. |
| **Workforce planning** | Headcount planning, scenarios | Basic headcount **actuals** | **Gap** for **scenario planning**. |

### 3.7 Configuration, workflow, and governance

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| **Business process definition** | No-code process builder | **Code-first** routers + workflows engine elsewhere | **Different** — faster for devs, **less** business-owned config. |
| **Security / segmentation** | Domain-level security groups | Module RBAC + matrix roles | **Partial** for **field-level** and **segmented security** expectations. |
| **Audit of HR changes** | Change logs, who changed what | Platform **mutation audit** pattern applies broadly | **Partial** — compare field-level HR audit **requirements**. |

### 3.8 Employee experience and mobile

| Capability | Workday (typical) | CoheronConnect | Assessment |
|------------|-------------------|----------|--------------|
| **Mobile-first ESS/MSS** | Native apps | Web employee portal; **mobile app** stack separate | **Partial** — depends on **mobile** roadmap. |
| **Listening / engagement** | Pulse, lifecycle surveys | **Surveys** API exists | **Partial** until wired to **HR insights**. |

---

## 4. Strategic implications (CHRO talking points)

1. **Operating model:** CoheronConnect fits organisations that want **HR plus operations on one stack**; Workday fits organisations optimising for **HCM depth and partner ecosystem**. The **People & Workplace dashboard** should be positioned honestly as a **command centre**, not a full **Workday Home** replacement until manager insights, journey metrics, and facilities/walk-up KPIs are **live**.
2. **Analytics credibility:** Rename or fix **`gradeDistribution`** semantics (currently **department‑based**) before selling to buyers who **equate “grade” with compensation band**—a CHRO will flag that immediately.
3. **Global narrative:** Lead with **modules you ship** (cases, leave, performance, recruitment, payroll slices); avoid implying **benefits admin** or **global payroll parity** without a roadmap slide.

---

## 5. Code and UX references (for CoheronConnect maintainers)

| Topic | Location |
|-------|----------|
| People & Workplace dashboard | `apps/web/src/app/app/people-workplace/page.tsx` |
| Platform home | `apps/web/src/app/app/dashboard/page.tsx` |
| People Analytics UI | `apps/web/src/app/app/people-analytics/page.tsx` |
| Workforce analytics API | `apps/api/src/routers/workforce.ts` |
| HR API | `apps/api/src/routers/hr.ts` |
| Performance API | `apps/api/src/routers/performance.ts` |
| Workforce analytics RBAC | `packages/types/src/rbac-matrix.ts` (`workforce_analytics`) |

---

## 6. People & workplace gap-closure — sprint plan (Scrum)

This section maps **§3 gaps** and **§4 strategic themes** to a **time-boxed backlog** for one cross-functional team (backend, web, QA, product, HR SME). Extend with a **second squad** for payroll/benefits if those SKUs are in scope.

### 6.1 Cadence and guardrails

| Item | Proposal |
|------|----------|
| **Sprint length** | 2 weeks |
| **Ceremonies** | Sprint Planning, Daily Scrum, Sprint Review, Sprint Retrospective |
| **Backlog refinement** | Weekly; HR SME validates copy and process assumptions |
| **Definition of Ready** | UX wire or API contract for dashboard changes; data definitions signed off for analytics |
| **Definition of Done** | Feature behind RBAC; `workforce_analytics` / `hr` tests updated; no regressions on `people-workplace` LCP; **rename/migration** runbooks for schema changes |

**Product goal (program):** *HR and managers get a **credible People & Workplace hub** with **real workplace KPIs**, **manager-relevant insights**, **honest workforce semantics** (grades vs departments), and a **clear path** toward analytics scoped to the org hierarchy.*

**Ordering:** Ship **visible dashboard wins** early (Sprints 1–2), then **manager** and **platform home** (3–4), then **analytics depth** and **HCM structure** (5–8).

---

### 6.2 Sprint 0 — discovery (1 week; spike sprint)

| ID | Backlog item | Maps to |
|----|----------------|---------|
| SPIKE-P0-01 | **Facilities & walk-up:** which existing procedures return **occupancy / queue depth**; contract for People hub tiles | §3.1 |
| SPIKE-P0-02 | **Compensation / job grade** target model: new column vs reference table; impact on `workforce.gradeDistribution` | §3.2, §4 |
| SPIKE-P0-03 | **Manager scope** for analytics: supervisory chain only vs permission matrix | §3.6 |
| SPIKE-P0-04 | **Journey** MVP: reuse `onboardingTemplates` + tasks vs workflow engine | §3.1 |

**Sprint goal:** *ADRs and API sketches; no production feature requirement.*

---

### 6.3 Sprint 1 — People hub: live workplace KPIs

**Sprint goal:** *Replace **placeholder** facility and walk-up stats with **live or clearly “no integration”** zero states.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P1-1 | **Facilities** tile: surface real **space/desk/booking** counts or API-backed “connected / not configured” | Updates `people-workplace` module card stats for Facilities |
| ~~PBI-P1-2~~ | ~~**Walk-up** tile: **queue length** or **appointments today** from `walkup` router~~ — **N/A.** Walk-Up Experience module retired 2026-04-26; walk-in visits are now ordinary `tickets` rows with `channel = "walk_in"` and surface in the Service Desk workbench, not on the People hub. Drop this PBI from the sprint. |
| PBI-P1-3 | Error and **empty states** consistent with design system | No silent `"—"` where data is expected |

---

### 6.4 Sprint 2 — Workforce semantics and analytics honesty

**Sprint goal:** *CHROs no longer see **“grade”** labels on **department** aggregates.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P2-1 | Rename or split **`gradeDistribution`**: e.g. `departmentDistribution` + optional **`compensationBand`** / `jobGrade` breakdown when field populated | API + People Analytics UI labels updated |
| PBI-P2-2 | **Migration** for optional `jobGrade` or `compBand` on `employees` (nullable) | Backfill strategy documented |
| PBI-P2-3 | **Metric dictionary** `docs/` snippet: definition of each workforce KPI | Supports demos |

---

### 6.5 Sprint 3 — Manager hub (MVP)

**Sprint goal:** *People leaders see **their team** in one place (leave, performance cycle, headcount).*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P3-1 | **`workforce.managerSummary`** (or equivalent): direct/indirect report counts, pending leave for team, on-leave today | RBAC: user must be manager or HR |
| PBI-P3-2 | **Web route** `/app/people-workplace/team` (or tab) consuming summary + links to HR | Mobile-friendly layout |
| PBI-P3-3 | Surface **active performance cycle** status for reportees (read-only) | Uses `performance` router |

---

### 6.6 Sprint 4 — Platform home: HR-aware strip

**Sprint goal:** *Platform dashboard shows **people signal** when the user has HR/manager access — without diluting the ops focus.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P4-1 | Optional **`workforce.summary`** (or manager summary) **KPI row** on `dashboard/page.tsx` when `can("hr","read")` or manager | Feature-flag or role gate |
| PBI-P4-2 | Deep link to **People & Workplace** and **People Analytics** | Telemetry optional |

---

### 6.7 Sprint 5 — People analytics: hierarchy-scoped drill-down

**Sprint goal:** *Analytics respect **manager tree** (or HR “see all”) per Sprint 0 ADR.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P5-1 | **Scoped** `headcount` / `leaveAnalytics` inputs: `managerId` or `scope=my_team` | Forbid cross-team leakage in tests |
| PBI-P5-2 | People Analytics UI: **scope toggle** (Org / My team) for eligible users | Copy reviewed by HR SME |
| PBI-P5-3 | Document limitation vs Workday Prism (no external benchmarks) | §3.6 expectation setting |

---

### 6.8 Sprint 6 — Onboarding journey on the hub

**Sprint goal:** *Workday-style **journey** parity at **MVP**: progress, not full no-code builder.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P6-1 | **Onboarding progress** API: template steps completed vs pending for employees in `onboarding` status | Driven by existing templates/tasks |
| PBI-P6-2 | People hub **widget**: top N in-flight onboardings with % complete | Links to HR detail |

---

### 6.9 Sprint 7 — Org experience: chart and matrix manager

**Sprint goal:** *Improve **§3.2** storytelling without full position management.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P7-1 | **Org chart** visual (manager chain + reportees) on employee profile or dedicated page | Performance budget for large teams |
| PBI-P7-2 | Optional **`dottedLineManagerId`** (nullable) on employee + display | Audit in mutation log |

---

### 6.10 Sprint 8 — Listening loop and pipeline signal

**Sprint goal:** *Connect **engagement** and **talent** signals to the hub.*

| ID | Backlog item | Acceptance notes |
|----|----------------|------------------|
| PBI-P8-1 | **Survey** participation or NPS-style aggregate on **People Analytics** tab (org scope) | Privacy-safe aggregation |
| PBI-P8-2 | People hub **recruitment** tile stat: **open reqs** or **candidates in pipeline** (read-only) | Uses `recruitment` API |

---

### 6.11 Fast-follow epics (outside core 8 sprints)

| Epic | Maps to | Note |
|------|---------|------|
| **Effective dating** for org attributes | §3.2 | Large schema effort — schedule after Sprint 0 data model spike |
| **Position management** | §3.2 | Often separate product phase |
| **Benefits admin** | §3.4 | Regulatory complexity — dedicated squad |
| **LMS / skills cloud** | §3.5 | Multi-quarter |
| **Leave accrual engine** | §3.3 | Rules engine + QA burden |

### 6.12 Dependencies and parallelisation

- **Sprint 2** should land before external **CHRO demos** that mention career structure.
- **Sprint 5** depends on **Sprint 3** manager identity (who is “my team”).
- **Sprint 1** can run parallel to **Sprint 0** documentation if API already exists; otherwise complete Sprint 0 first.

### 6.13 Team metrics (sample)

| Metric | Purpose |
|--------|---------|
| % People hub tiles with **real data** vs placeholder | Dashboard completeness |
| Defects on **manager scope** (data leakage) | Security/privacy |
| Time-to-complete **onboarding** (median) after PBI-P6 | Outcome KPI |
| HR SME **story sign-off** per sprint | Stakeholder alignment |

---

## 7. Disclaimer

This document is based on **repository review** as of the analysis date. **Workday** capabilities vary by **product SKU, tenant configuration, and release**. CoheronConnect capabilities vary by **deployment and UI completeness**. Use this as a **competitive and architecture checklist**, not a warranty of either vendor.
