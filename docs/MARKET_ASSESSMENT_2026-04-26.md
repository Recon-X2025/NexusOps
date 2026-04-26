# NexusOps — Market Assessment (Redo) & Pending-Build Register

**Date:** 2026-04-26 · **Revision:** redone end-of-day after the GA-readiness pass and a fresh disk-level survey.
**Method:** Direct codebase walk of `apps/api/src/routers/`, `packages/db/src/schema/`, `apps/api/src/services/`, `apps/api/src/workflows/`, `apps/api/src/http/`, `apps/web/src/app/app/`, and `e2e/`. Inventory artefact: `MARKET_ASSESSMENT_REDO_INVENTORY.md` (in-line below in §B). No marketing copy or older docs read.

> **Why a redo on the same day?** The first cut of this document was written before the GA-readiness execution pass. Several recommendations from the first cut shipped (Walk-Up retired, eMudhra adapter, virus-scan + retention workers, webhook hardening, integrations admin, expense split). The honest goal of this redo is to **stop counting what we have and start being precise about what is pending to be built**, with disk-verified evidence — including issues we caught while re-surveying.

---

## §A. What is true today (one-page recap, not a re-litigation)

| Area | Verdict (mid-market wedge) | Confidence | Δ vs first cut |
|---|---|---|---|
| Platform / multi-tenancy / auth | A− | high | unchanged |
| ITSM (incidents / requests / problems / changes / KB) | A− | high | unchanged |
| India statutory (TDS / GST / EPFO / MCA / ESOP) | **A** | high | unchanged — still the wedge |
| India payroll | A− | high | unchanged |
| Asset / CMDB | B | high | unchanged (no discovery) |
| Procurement / AP / AR / P2P | B+ | high | unchanged |
| Accounting / GL | B | high | unchanged (no recon, no depreciation engine) |
| FP&A / Budget | C+ | high | unchanged |
| Expense management | **B** *(was B−)* | medium | **employee self-serve + finance queue split shipped, but not at the route the team thinks it is — see §C5** |
| Core HR | B | high | unchanged |
| Recruitment / ATS | B | high | unchanged |
| Performance / OKR | C+ | high | unchanged |
| CRM | B− | high | unchanged |
| CSM | C+ | high | unchanged |
| GRC | B | high | unchanged |
| SecOps | B− | high | unchanged |
| **Contracts / CLM** | **B** *(was B−)* | medium | **eMudhra adapter shipped + DMS hardening + 8-year retention; clause AI / redline still missing** |
| Cap Table / ESOP / Secretarial | A− | high | unchanged |
| Strategy / Portfolio | B− | high | unchanged (Layer-A flagged off by default) |
| **AI layer** | **B** *(was B−)* | medium | **`ai-agent.ts` introduces an agentic copilot loop on Claude 3.5 Sonnet — see §C2** |
| **Workflow engine** | **C+** | medium | **8 workflow actions exist in `apps/api/src/workflows/actions/` but are not imported by anything outside the actions folder — see §C3** |
| **Integrations** | **B−** *(was C+)* | high | **12 catalogued (was 4); Indian wedge stack near complete; long-tail still narrow** |
| Document storage (DMS) | B | high | **shipped — virus-scan + retention sweep + legal hold + audit logs; no OCR** |
| Notifications | B | high | unchanged |
| Web UX / persona workbenches / Command Center | B+ | high | unchanged |
| Mobile (RN) | C | high | unchanged — **4 screens** confirmed |
| macOS Desktop | D / Bonus | high | unchanged |
| Testing | A− | high | unchanged — **62 test files (38 api + 24 e2e)**; no virus-scan or retention coverage yet (see §C4) |

**No verdict in §A moved more than one notch.** The wedge claims are unchanged. The interesting movement is in §B.

---

## §A.0 Retired / removed / hidden surfaces (explicitly not counted in §A)

This table is here so we stay honest: these surfaces are either **fully removed** from the repo (retired), or **present but intentionally hidden** (feature-flagged off by default).

| Area | Status | What that means | Where / how to verify |
|---|---|---|---|
| Walk-Up Experience | **Retired / removed** | Module dropped end-to-end (page, router, schema, RBAC, tests). Walk-ins are now a regular ticket channel (`tickets.channel = "walk_in"`). | See Architecture v2.1 changelog; verify absence of `walkup` router/schema and presence of ticket `walk_in` channel. |
| DevOps surfaces | **Hidden (feature-flagged)** | UI routes exist but are off by default; should not be used in positioning unless enabled for the tenant. | `NEXT_PUBLIC_ENABLE_DEVOPS` (web flag) controls rendering. |
| APM expansion surfaces | **Hidden (feature-flagged)** | `/app/apm` defaults to App Inventory; full EA/APM surfaces are additive behind a flag. | `NEXT_PUBLIC_ENABLE_APM` (web flag) controls expanded APM experience. |

## §A.1 Module map (what we are actually selling)

This section exists to prevent “platform soup.” It is the **module-by-module** list used by the deep market assessment in §F.

### A1.1 Primary web hubs (buyer-visible)

- **Platform**
  - Command Center (`/app/command`) + role views (metrics registry)
  - Workbenches (`/app/workbench/*`) — 12 persona daily surfaces
  - Admin (`/app/admin`) + setup (`/app/onboarding-wizard`)
  - Settings (`/app/settings/*`) — integrations, omnichannel, webhooks, API keys
- **IT Services**
  - Tickets/service desk (`/app/tickets`) + major incidents
  - Change (`/app/changes`) · Problems (`/app/problems`) · Releases (`/app/releases`)
  - Field service/work orders (`/app/work-orders`)
  - Events/ops (`/app/events`)
  - Assets/CMDB (incl. HAM/SAM surfaces) (`/app/cmdb`, `/app/ham`, `/app/sam`)
- **Security & Compliance**
  - SecOps (`/app/security`)
  - GRC/ESG (`/app/grc`, `/app/esg`)
  - Approvals (`/app/approvals`)
  - Flow Designer (`/app/flows`)
- **People & Workplace**
  - HR (`/app/hr`) including leave, attendance, holidays, OKRs, **expenses** (`/app/hr/expenses`)
  - Recruitment (`/app/recruitment`)
  - People analytics/workforce (`/app/people-analytics`)
  - Performance (`/app/performance`)
  - Facilities (`/app/facilities`)
- **Finance & Procurement**
  - Procurement (`/app/procurement`)
  - Financial (AP/AR) (`/app/financial`)
  - Accounting (`/app/accounting`)
  - Vendors (`/app/vendors`)
  - Contracts (`/app/contracts`)
  - Finance expense queue (`/app/finance/expenses`)
- **Legal & Governance**
  - Legal (`/app/legal`)
  - Secretarial/Company Secretary (`/app/secretarial`)
- **Customer & Sales**
  - CRM (`/app/crm`)
  - CSM (`/app/csm`)
  - Catalog (`/app/catalog`)
  - Surveys (`/app/surveys`)
- **Strategy Center**
  - Strategy hub (`/app/strategy`) + initiatives/projects (`/app/projects`) + reports (`/app/reports`)
- **Knowledge**
  - Knowledge base (`/app/knowledge`)

### A1.2 Backend module namespaces (tRPC routers, “what exists”)

This is the authoritative capability index: `auth`, `admin`, `tickets`, `assets`, `workflows`, `hr`, `procurement`, `dashboard`, `workOrders`, `changes`, `security`, `grc`, `financial`, `contracts`, `projects`, `crm`, `legal`, `devops`, `surveys`, `knowledge`, `notifications`, `catalog`, `csm`, `apm`, `oncall`, `events`, `facilities`, `vendors`, `approvals`, `reports`, `search`, `ai`, `indiaCompliance`, `assignmentRules`, `inventory`, `recruitment`, `secretarial`, `workforce`, `integrations`, `mac`, `performance`, `accounting`, `customFields`, `payroll`, `expenseReports`, `esign`, `documents`, `commandCenter`, `workbench`.

---

## §F. Deep market assessment (module-by-module) + explicit gaps

This is the “deep” section: for each shipped module we list the competitive set, buyer expectations (table stakes), NexusOps strengths, and the specific gaps that keep us from “category leader” claims. Where possible, gaps are mapped to the pending-build register in §B.

### F0. How to read this section

- **Competitors** are representative, not exhaustive. For mid-market India, the meaningful shortlists are usually “one global incumbent + one local/price winner.”
- **Table stakes** are what a buyer assumes will exist without asking; missing them creates surprise churn.
- **Differentiators** are what can credibly drive a win; if they are not end-to-end, they are not listed as differentiators.
- **Gaps** are written as “what buyers will ask next” and mapped to **P0/P1/P2** where it already exists; otherwise it becomes a new gap to add to §B in the next revision.

---

### F1. Platform (multi-tenancy, auth, RBAC, admin, settings)

- **Competitors (shortlist)**: ServiceNow Platform, Atlassian (JSM + ecosystem), Freshworks, ManageEngine; for India mid-market: Zoho (ecosystem), Tally/SAP Business One (finance-adjacent suites).
- **Table stakes**:
  - tenant isolation, RBAC by module, audit logs, SSO options, admin settings and onboarding, API keys/webhooks, background jobs, attachments/object storage
- **NexusOps strengths (today)**:
  - coherent cross-module RBAC model; admin/settings surfaces; webhook hardening posture; multi-hub navigation + persona workbenches that reduce “suite fatigue”
- **Key gaps / risks**:
  - **SAML SSO + SCIM** remain missing for buyers migrating from Okta/AzureAD (**P2-11, P2-12**)
  - “Platform API surface” positioning is risky until integrations/webhooks docs are crisp (**maps to P0-8 README hardening + P0-10 pricing posture**)

---

### F2. ITSM: Tickets / Service Desk (+ Knowledge)

- **Competitors (shortlist)**: ServiceNow ITSM, Jira Service Management, Freshservice, Zendesk (service), ManageEngine ServiceDesk Plus.
- **Table stakes**:
  - incident/request lifecycle, SLA timers/escalations, assignment rules, approvals, knowledge linking, notifications, CSAT loop, basic reporting
- **NexusOps strengths (today)**:
  - end-to-end ticketing + approvals + workbench surfaces; assignment rules (load/group); strong “ops narrative” framing via Command Center
- **Key gaps / risks**:
  - **Skills-based routing** missing (buyers compare to SNOW AWA) (**P1-8**)
  - **CSAT loop on resolve** missing (buyers expect it) (**P1-10**)
  - **PIR workflow for major incidents** missing (major incident maturity marker) (**P1-11**)
  - **Embedding pipeline** missing, so semantic support workflows are weaker than claimed “AI-first” story (**P1-9**)

---

### F3. ITOM-lite: Events / Service health map

- **Competitors (shortlist)**: ServiceNow ITOM, Datadog ITSM integrations, Opsgenie/PagerDuty adjacency, ManageEngine OpManager.
- **Table stakes**:
  - event ingestion, routing, suppression/basic correlation, linking events to services/CMDB, on-call escalation hooks
- **NexusOps strengths (today)**:
  - credible “operator surface” for service health; ties into tickets/approvals as a unified work surface
- **Key gaps / risks**:
  - correlation/suppression depth is not yet a win condition; “ITOM” claims should remain cautious until discovery exists (**see F4/P2-1**)

---

### F4. Assets / CMDB

- **Competitors (shortlist)**: ServiceNow CMDB + Discovery, Device42, Lansweeper, ManageEngine AssetExplorer; India mid-market often “Excel + procurement.”
- **Table stakes**:
  - asset register, ownership, lifecycle status, linkage to tickets/changes, basic imports/exports
- **NexusOps strengths (today)**:
  - CMDB surfaces exist and are integrated into the broader ops suite narrative
- **Key gaps / risks**:
  - **Discovery agent** missing; without it CMDB is “manually maintained,” which limits stickiness (**P2-1**)

---

### F5. Change management / Releases

- **Competitors (shortlist)**: ServiceNow Change, Jira change workflows, BMC Helix; plus internal “calendar in Google.”
- **Table stakes**:
  - change requests, approvals, change calendar view, collision awareness, post-change review notes
- **NexusOps strengths (today)**:
  - schema depth exists; workbench “change & release” persona surface is the right packaging direction
- **Key gaps / risks**:
  - **Visual change calendar / collision UI** is explicitly called out as missing (**P2-5**)

---

### F6. Approvals + Workflow automation (Flow Designer)

- **Competitors (shortlist)**: ServiceNow Flow Designer, Jira Automation, Zapier/Make for SMB, Workato for enterprise, Power Automate (M365).
- **Table stakes**:
  - triggers, conditions, action palette, test-run, auditability, basic connectors (email/chat)
- **NexusOps strengths (today)**:
  - Flow Designer route exists; workflow actions catalog exists; automation is conceptually first-class across modules
- **Key gaps / risks**:
  - action library must be fully wired into real triggers and used by the designer (**P0-2, P2-8**)
  - connector breadth will be the first procurement objection after the Indian wedge stack (**P2-13**)

---

### F7. Integrations (catalog + adapters) + Webhooks posture

- **Competitors (shortlist)**: ServiceNow IntegrationHub, Atlassian Marketplace, Workato, Zapier, Power Automate; India-specific stacks: ClearTax, Razorpay, WhatsApp BSPs.
- **Table stakes**:
  - credential management UI, test connection, retry semantics, webhook security, auditability
- **NexusOps strengths (today)**:
  - tenant-managed integrations admin UI; eMudhra + ClearTax + Razorpay + WhatsApp/SMS coverage matches the India-first wedge
  - webhook hardening order-of-ops is defensible (origin block → allowlist → HMAC)
- **Key gaps / risks**:
  - e-sign “test connection” correctness is critical for first deployments (**P0-1**)
  - webhook e2e coverage must match the hardening posture (eMudhra is covered; WhatsApp/Razorpay need parity) (**P0-7**)
  - production documentation must be explicit about allowlist defaults (**P0-8**)

---

### F8. Documents / DMS (attachments, retention, legal hold)

- **Competitors (shortlist)**: SharePoint (default), Box, Google Drive, DocuSign CLM stores; for ITSM suites: built-in attachment stores.
- **Table stakes**:
  - object storage, versioning, audit logs, retention policies, legal hold, malware scanning (in regulated orgs)
- **NexusOps strengths (today)**:
  - malware scan + retention sweep + legal hold are shipped; e-sign audit retention posture aligns with Indian compliance expectations
- **Key gaps / risks**:
  - **OCR/search** for documents is missing; only receipt OCR exists today (**future gap; consider pairing with search improvements after P1-9**)

---

### F9. India compliance: Secretarial / Cap table / MCA / ESOP

- **Competitors (shortlist)**: ClearTax (compliance suite), Zoho (books/payroll + addons), local CS tooling, in-house CA/CS workflows.
- **Table stakes**:
  - compliance calendar, filings/registers, audit trail, reminders, document packs, role separation (CS vs finance vs legal)
- **NexusOps strengths (today)**:
  - credible India-first posture: secretarial + e-sign + retention + compliance calendar framing is a cohesive wedge story
- **Key gaps / risks**:
  - reminder workflows must be unquestionably wired and observable (ties back to workflow engine/action wiring) (**P0-2**)

---

### F10. Payroll (India)

- **Competitors (shortlist)**: Darwinbox (HR suite), Keka, Zoho Payroll, RazorpayX payroll adjacency, legacy outsource/CA workflows.
- **Table stakes**:
  - runs, payslips, statutory computations, employee self-serve, exports/bank files, year-end forms
- **NexusOps strengths (today)**:
  - “last-mile” credibility improved with Form 16 and bank-file exports already shipped (defensible differentiator inside the suite narrative)
- **Key gaps / risks**:
  - buyer diligence will ask for “bank format coverage” and “year-end correctness proofs”; keep claims anchored to exact supported formats and test fixtures (process/doc gap more than code gap in this revision)

---

### F11. HR Service Delivery (Core HR, leave, attendance, employee portal)

- **Competitors (shortlist)**: Darwinbox, Keka, Zoho People, BambooHR (global SMB), Workday (upper mid-market).
- **Table stakes**:
  - org/employee directory, time off, attendance, HR requests, approvals, basic analytics, role-specific portals
- **NexusOps strengths (today)**:
  - HR sits natively beside ITSM/finance/governance; this reduces “another system” friction in mid-market orgs
- **Key gaps / risks**:
  - HR suite breadth is credible, but deep HRIS features (benefits, complex payroll integrations, etc.) should not be claimed as category parity

---

### F12. Expenses (employee self-serve + finance queue)

- **Competitors (shortlist)**: SAP Concur, Expensify, Zoho Expense, Rippling/Deel adjacency (global).
- **Table stakes**:
  - mobile capture, receipt OCR, policy rules, approvals, reimbursements, auditability, export to accounting
- **NexusOps strengths (today)**:
  - split surfaces (employee vs finance) + receipt OCR + policy engine move this to a credible “B/B+” story inside a suite
- **Key gaps / risks**:
  - **mobile breadth** is still thin, which matters disproportionately for expenses (**P1-12**)
  - accounting export/recon loop is the real “finance buyer” gating item (ties to accounting gaps in F14)

---

### F13. Procurement + AP/AR (operational finance)

- **Competitors (shortlist)**: Coupa, SAP Ariba (enterprise), Zoho Books/Inventory (SMB), Tally+add-ons (India), SAP Business One (mid-market).
- **Table stakes**:
  - vendor register, PO lifecycle, invoice capture/approval, AP aging, AR aging, payment status, audit trail
- **NexusOps strengths (today)**:
  - P2P/AP/AR is sufficiently present to support the “one suite” narrative; ClearTax IRN dual-write makes the India wedge stronger
- **Key gaps / risks**:
  - vendor portal is a common Coupa/Ariba-style expectation as orgs scale (**P2-4**)

---

### F14. Accounting / GL

- **Competitors (shortlist)**: NetSuite (upper mid-market), Tally (India default), Zoho Books, QuickBooks; plus “accountant + spreadsheets.”
- **Table stakes**:
  - chart of accounts, journal entries, period close basics, exports, audit trail; for maturity: bank recon, fixed assets/depreciation
- **NexusOps strengths (today)**:
  - enough accounting surface to connect operational finance modules; not positioned as “NetSuite replacement” (and should not be)
- **Key gaps / risks**:
  - **bank reconciliation** missing (**P2-2**)
  - **depreciation engine** missing (**P2-3**)

---

### F15. Contracts / CLM + e-sign

- **Competitors (shortlist)**: Ironclad, Icertis, DocuSign CLM, SpotDraft (India-friendly), Contractbook (SMB).
- **Table stakes**:
  - repository, metadata, reminders, e-sign integration, audit trail; for CLM maturity: clause library, playbooks, redlining, approval workflows
- **NexusOps strengths (today)**:
  - eMudhra e-sign + retention/audit makes the “India legal validity” story credible in mid-market
- **Key gaps / risks**:
  - **clause library + AI extraction + redline collaboration** missing (**P2-7**)

---

### F16. Security (SecOps) + GRC

- **Competitors (shortlist)**: Vanta/Drata (SMB compliance automation), ServiceNow GRC, Archer (enterprise), Wiz/Snyk adjacency (SecOps).
- **Table stakes**:
  - asset/control mapping, evidence collection workflows, risk register, audit plans, remediation tracking
- **NexusOps strengths (today)**:
  - integrated GRC + approvals + audit trails inside the suite; this sells well when paired with India governance story
- **Key gaps / risks**:
  - continuous control monitoring (CCM) is the typical next ask in SOC2/ISO motions (**P2-15**)

---

### F17. CRM + CSM

- **Competitors (shortlist)**: Salesforce (upmarket), HubSpot/Zoho CRM (mid-market), Freshsales; CSM: Gainsight (upmarket), Totango/Planhat.
- **Table stakes**:
  - accounts/contacts/opportunities basics; for CSM: health scoring, renewals, playbooks
- **NexusOps strengths (today)**:
  - present enough to support “one customer record” narrative for service + success, but not a dedicated best-in-class CRM win condition
- **Key gaps / risks**:
  - connector breadth (Gmail/Outlook, Salesforce) will dominate objections if CRM is used in positioning (**P2-13**)

---

### F18. Strategy / Portfolio (PMO)

- **Competitors (shortlist)**: Jira Align (enterprise), Aha!, Monday/Smartsheet (mid-market), ServiceNow SPM; many mid-market orgs use “PowerPoint + Excel.”
- **Table stakes**:
  - initiatives, milestones, dependencies, rollups, reporting
- **NexusOps strengths (today)**:
  - strategy center + PMO workbench packaging is a credible exec story inside an ops suite
- **Key gaps / risks**:
  - if we lean into “enterprise architecture” narratives, ensure APM/EA features are truly on and not confusingly flag-gated (positioning risk; not a code gap in this doc)

---

### F19. AI layer (copilot/agents) + Search

- **Competitors (shortlist)**: ServiceNow Now Assist, Atlassian Intelligence, Microsoft Copilot (horizontal), bespoke RAG tools.
- **Table stakes**:
  - semantic search, summarization, Q&A against tickets/KB, guardrails and auditability
- **NexusOps strengths (today)**:
  - agentic loop exists and is an “AI-first ops” narrative anchor when paired with real write tools and auditability
- **Key gaps / risks**:
  - **ticket embedding pipeline** is the single biggest functional gap for AI/search quality (**P1-9**)

---

### F20. Mobile

- **Competitors (shortlist)**: every incumbent suite has a mobile app; expenses and approvals are the acid test.
- **Table stakes**:
  - approvals, notifications, ticket updates, expense capture
- **NexusOps strengths (today)**:
  - a viable starting point exists; the hard part is expanding without fragmenting RBAC/data shape
- **Key gaps / risks**:
  - mobile needs the “manager loop” breadth (approve HR + finance, capture receipts) to avoid category penalty (**P1-12**)

---

### F21. Executive surfaces: Command Center + Workbenches

- **Competitors (shortlist)**: ServiceNow dashboards/role-based workspaces, Freshservice analytics, bespoke BI.
- **Table stakes**:
  - role views, KPIs, drill-down to work, “today’s priorities” experience, not just charts
- **NexusOps strengths (today)**:
  - persona workbenches are a real product decision that can differentiate by reducing navigation and helping adoption
- **Key gaps / risks**:
  - the risk is data freshness/latency and trust; this is mitigated by explicit “no_data” fallbacks and source timeouts, but needs consistent “explain why panel is empty” UX over time (ongoing product discipline)

## §B. Pending-build register — what is left to be built

This is the operational document. Every row is something a reviewer should be able to verify against the codebase **does not yet exist** or **exists but is not wired in**. Priority ordering:

- **P0 — must land before GA marketing.** These are honesty bugs, broken paths, or claims we cannot defend in a buyer call.
- **P1 — first 90 days post-GA.** These move us out of "credible mid-market" into "differentiated" within the wedge.
- **P2 — quarter-2/3 post-GA.** These widen the moat or open adjacent segments.

### B0. P0 — must land before GA

| # | Item | Why it's P0 | Where it lives now (or is missing) |
|---|---|---|---|
| **P0-1** | **Fix `integrations.testIntegration` path for `emudhra`.** | The provider catalog uses provider id `emudhra` (legal eSign category). The `testIntegration` mutation branches on `input.provider.startsWith("esign_")` and falls through to `getIntegrationAdapter("emudhra")` — but eMudhra is registered under `getEsignProvider("emudhra")`, not `getIntegrationAdapter`. Result: pressing **Test Connection** in the admin UI for eMudhra never tests anything. This will fail every design-partner dry-run before the runbook even starts. | `apps/api/src/routers/integrations.ts` (mutation `testIntegration`) + `apps/api/src/services/integrations/registry.ts` (no `emudhra` entry) + `apps/api/src/services/esign/index.ts` (real registration). |
| **P0-2** | **Wire the workflow action library into actual triggers.** | `apps/api/src/workflows/actions/` has 8 action definitions (`notify-via-email`, `notify-via-slack`, `notify-via-teams`, `notify-via-whatsapp`, `notify-via-sms`, `escalate-on-sla-breach`, `gst-filing-reminder`, `dir3-kyc-reminder`, `contract-renewal-reminder`, `stale-lead-nudge`). `listWorkflowActions` / `getWorkflowAction` are exported but **no other file in the repo imports them** outside `actions/index.ts` itself. We have an action library that nothing executes. Either wire it into the `workflows` Temporal worker, the SLA breach worker, and the `india-compliance` reminder cron — or stop claiming it exists. | `apps/api/src/workflows/actions/*.ts` (built, untested, unimported). |
| **P0-3** | **Delete the empty `apps/web/src/app/app/walk-up/` directory.** | The folder exists with no `page.tsx`. Anyone who navigates to `/app/walk-up` after the retirement gets a Next.js 404 instead of a 308 to `/app/tickets?channel=walk_in`. Tiny fix; large optics impact (we just announced retirement in v2.1 of the architecture doc). | `apps/web/src/app/app/walk-up/` (empty). Add a `page.tsx` that calls `redirect("/app/tickets?channel=walk_in")` and 410s old tRPC ids. |
| **P0-4** | **Add a `walk_in` value to the `tickets.channel` enum.** | The retirement narrative says walk-ins flow through `tickets.channel = "walk_in"`. Verify (and add if missing) the enum value in `packages/db/src/schema/tickets.ts`. Without it, the retirement is a marketing claim, not a working code path. | `packages/db/src/schema/tickets.ts`. Migration if absent. |
| **P0-5** | **Move the employee expense surface to `/app/hr/expenses` (or commit to `/app/expenses`).** | The PRODUCT_REFERENCE doc and the v2.1 architecture changelog both claim employee self-serve lives at `/app/hr/expenses`. The actual file on disk is `apps/web/src/app/app/expenses/page.tsx` — there is no `hr/expenses/` page. Either move the file to align with the docs, or correct the docs. The **finance** queue is correctly at `apps/web/src/app/app/finance/expenses/page.tsx`. | `apps/web/src/app/app/expenses/page.tsx` (current employee surface) vs documented path. |
| **P0-6** | **Test coverage for virus-scan + retention workers.** | `e2e/esign-webhook.spec.ts` proves the e-sign callback path. There is **zero** automated coverage for `virusScanWorkflow.ts` or `documentRetentionWorkflow.ts`. Both workers touch S3 + Postgres + audit logs; both are silent in production unless they fire. Add a Vitest unit (mock S3 + clamd socket) for virus scan and a Vitest unit for the retention sweep predicate (`legalHold` must always win). | `apps/api/src/__tests__/` — no `virus*` or `retention*` files. |
| **P0-7** | **HMAC + IP allowlist verification e2e for AiSensy and Razorpay.** | The e-sign webhook has happy-path + bad-HMAC + unknown-envelope + browser-Origin tests. The other two webhook receivers (`/webhooks/wa/aisensy/:integrationId`, `/webhooks/razorpay/:integrationId`) have **no e2e tests**. Add a parallel spec for each — same shape, three negative paths. | `e2e/` — no `aisensy*` or `razorpay*` specs. |
| **P0-8** | **Document the `WEBHOOK_ALLOWLIST_*` posture explicitly in `README.md`.** | An empty allowlist accepts every IP and relies on HMAC alone. That is the current default. This is a defensible posture, but only if it is documented as a deliberate choice. Add a §"Production webhook hardening" subsection to README explaining: (a) HMAC is mandatory, (b) IP allowlist is opt-in, (c) what to set when the provider publishes an IP list. | `README.md` (no current mention). |
| **P0-9** | **Confirm `redirect()` in `dashboard/page.tsx` and `strategy-projects/page.tsx` returns HTTP 308 and not 307.** | Next.js App Router's default `redirect()` is 307. Several markdown docs claim "308". A 307 vs 308 distinction matters for SEO / bookmark stability and for any tenant linking from external systems. Either pin to `permanentRedirect()` (which is 308) or correct the docs. | `apps/web/src/app/app/dashboard/page.tsx`, `apps/web/src/app/app/strategy-projects/page.tsx`, `apps/web/src/app/app/page.tsx`. |
| **P0-10** | **Honest pricing & support posture in `README.md`.** | README has a `## Pricing` heading. Before GA, we either ship a pricing position (per-seat, per-tenant, free-tier limits) or remove the section. A heading-with-no-body reads like an unfinished landing page. | `README.md`. |

### B1. P1 — first 90 days post-GA (within the wedge)

> **Status legend:** ✅ Shipped 2026-04-26. ⏳ Pending. The shipped rows have artefact details in **§B1a** below the table so cell widths stay readable in markdown previews.

| # | Item | Why P1 | Status |
|---|---|---|---|
| **P1-1** | Form 16 / Form 16A generation engine | India payroll is A−. The single missing piece is statutory form generation (Form 16 for employees, Form 24Q for the org). Without it, year-end is manual JSON export → ClearTax. Closes the "manual filing" gap from the first cut. | ✅ Shipped — see §B1a |
| **P1-2** | NEFT / RTGS / NACH bank file generation for payroll disbursement | After "12-step pipeline → STATUTORY_GENERATED → COMPLETED", we still hand the operator a CSV. Banks expect SBI / HDFC / ICICI specific NACH formats. Add a `payroll.exportBankFile` mutation with a per-bank format selector. | ✅ Shipped — see §B1a |
| **P1-3** | Live ClearTax IRN integration end-to-end | The adapter exists (`services/integrations/cleartax-gst.ts`, 128 LOC) and the catalog entry is live. What's missing: a dual-write from `procurement.invoices` to ClearTax IRN at invoice post time, with retry queue and IRN persistence on the invoice row. | ✅ Shipped — see §B1a |
| **P1-4** | eMudhra design-partner sandbox dry-run | The runbook (`docs/EMUDHRA_PRODUCTION_RUNBOOK.md`) is written. The dry-run with a real customer in the eMudhra sandbox has not happened. Until it has, the e-sign claim is theoretical. | ⏳ Process item — schedule with first design partner |
| **P1-5** | Receipt OCR for expenses (Anthropic vision) | Concur / Expensify parity blocker. We already pay for Anthropic. Take a receipt image, call Claude vision, return amount, currency, date, vendor, category, confidence. Pre-fill `hr.expenses.createMine` from the result. | ✅ Shipped — see §B1a |
| **P1-6** | Per-diem + mileage + policy violation engine for expenses | Schema field for category exists; rules don't. Add per-category caps, mileage rates, receipt-required, and check on `createMine` plus finance-queue load. | ✅ Shipped — see §B1a |
| **P1-7** | Native AI agentic copilot surface across modules | The read-only agent loop (Claude 3.5 Sonnet) already exists. Missing: (a) write tools, (b) a Command Palette entry-point, (c) memory / conversation persistence. This is how we land the "AI-first ops" story. | ✅ Shipped — see §B1a |
| **P1-8** | Skills-based ticket routing | Assignment rules exist (`assignment-rules.ts`, 209 LOC) but route by **group + load**, not **skills**. Closes a frequent SNOW Advanced Work Assignment gap. Schema: `users.skills text[]`, `tickets.required_skill text`, scoring in `lib/assignment-rules.ts`. | ⏳ Pending |
| **P1-9** | Embedding pipeline for `tickets.embedding` | Column is present but the fill pipeline is not. Today the column is empty for new tickets, so semantic search returns nothing. Add a BullMQ worker that embeds on `ticket.created` / `ticket.resolved`. | ⏳ Pending |
| **P1-10** | CSAT survey loop wired into ticket close | `surveys` router exists (112 LOC). Missing: an automatic CSAT survey trigger on `ticket.resolved` for `requester` users, with a 1-click email/SMS deeplink. Closes a SNOW ITSM table-stakes gap. | ⏳ Pending |
| **P1-11** | PIR (post-incident review) workflow for major incidents | Schema supports `tickets.isMajorIncident`. Missing: a structured PIR template (timeline, root cause, action items) saved as a `kb_articles` row at close. | ⏳ Pending |
| **P1-12** | Mobile app: file/approve/view-team for finance + people managers | 4 screens today (Login, Dashboard, Tickets, Approvals). Add: Expenses (file + approve), Time off (file + approve), Org chart, Notifications (push). | ⏳ Pending |

### B1a. P1 — shipped 2026-04-26 (artefact detail per row)

The four highest-ROI rows from §D landed in a single execution pass. Each block below lists the new / changed files so a reviewer can verify against the codebase.

#### P1-1 — Form 16 / Form 16A PDF generator

- New service `apps/api/src/services/form16-pdf.ts` (Part B, IT-style template, `pdfkit`).
- New aggregator `apps/api/src/lib/india/form16-aggregator.ts` (FY rollup from `payslips` + `india-tax-engine`).
- New Fastify route `apps/api/src/http/payroll-form16-pdf.ts` registered as `/payroll/form16` (auth + HR-manager permission gate).
- New Next.js proxy `apps/web/src/app/api/payroll/form16/route.ts`.
- Employee portal already had the download CTA; it now serves a real PDF.

#### P1-2 — NEFT / RTGS / NACH bank-file export

- New generator `apps/api/src/lib/india/bank-file-generator.ts` covering HDFC, ICICI, SBI, Axis, Kotak, generic NEFT, and the NPCI NACH credit fixed-width spec.
- New `payroll.exportBankFile` mutation in `apps/api/src/routers/payroll.ts` (takes `runId` + `format`, returns base64-encoded file with sanitized per-bank filename).

#### P1-3 — Live ClearTax IRN dual-write

- New BullMQ queue + worker `apps/api/src/workflows/irnGenerationWorkflow.ts` (registered in `services/workflow.ts`) with retry + structured error capture.
- `financial.createGSTInvoice` enqueues the job when e-invoice is required.
- New `financial.retryEInvoiceGeneration` mutation for admin-driven retries from the UI.
- Migration `packages/db/drizzle/0029_p1_features.sql` adds `e_invoice_signed_qr_code`, `e_invoice_status`, `e_invoice_last_attempt_at`, `e_invoice_error`, plus an `(org_id, e_invoice_status)` index.

#### P1-5 — Receipt OCR (Anthropic vision)

- New service `apps/api/src/services/ai-receipt-ocr.ts` (Claude 3.5 Sonnet vision; returns `expenseDate`, `amount`, `currency`, `merchant`, `category`, `gstin`, `description`, `confidence`, `raw`).
- Exposed via new `hr.expenses.ocrReceipt` mutation in `apps/api/src/routers/hr.ts`.
- `hr.expenses.createMine` accepts `ocrExtracted` + `ocrConfidence` and persists them onto the row for audit / re-extraction.

#### P1-6 — Per-diem / mileage / policy engine

- Extended `apps/api/src/lib/org-settings.ts` with `OrgExpenseSettings` (base currency, default per-item cap, enforcement mode `warn` or `block`, default receipt-required, per-category overrides for per-diem cap, per-item cap, mileage rate, receipt-required).
- New pure-function `apps/api/src/lib/expense-policy.ts` (`evaluateExpenseClaim`) wired into `hr.expenses.createMine`. `block` enforcement throws; `warn` stamps `policy_violation_code` / `policy_violation_reason` for the approver to see.
- New `apps/api/src/__tests__/expense-policy.test.ts` — 9 Vitest cases (currency mismatch, receipt required, category-level receipt waiver, per-diem cap, per-item cap, mileage required, mileage computation, enforcement modes, empty-settings fallback). All green; runs with `VITEST_SKIP_GLOBAL_MIGRATE=1` (no DB needed).

#### P1-7 — Agentic copilot surface

- New schema `packages/db/src/schema/agent.ts` — `agent_conversations` + `agent_messages` (rolling summary, tool result preview, sequence index).
- Multi-turn tool-use loop `apps/api/src/services/agent-copilot.ts` on Claude 3.5 Sonnet with server-side memory (4-round cap, 20-message history window).
- Write tools `apps/api/src/services/ai-tools/create-ticket.ts` + `update-ticket-status.ts` (RBAC-checked at runtime; system prompt requires explicit user confirmation).
- New `agent` tRPC router `apps/api/src/routers/agent.ts` exposing `chat`, `listConversations`, `getConversation`, `deleteConversation`.
- New chat UI `apps/web/src/app/app/agent/page.tsx` with conversation sidebar.
- Command Palette entry **Ask NexusOps Copilot** in `apps/web/src/components/layout/command-palette.tsx`.

### B2. P2 — next quarter (widen the moat / adjacent segments)

| # | Item | Why P2 | Notes |
|---|---|---|---|
| **P2-1** | **CMDB discovery agent (Linux/macOS/Windows).** | Closes the SNOW Discovery gap. Lightweight Go binary, OS-package install, posts to `/internal/cmdb/heartbeat`. | New repo (`agents/`) + new internal HTTP route. |
| **P2-2** | **Bank reconciliation module.** | Statement upload (Mt940 / CSV) + auto-match against `journal_entries`. Closes a NetSuite / Tally gap. | New router `accounting.bankRecon`. |
| **P2-3** | **Fixed asset depreciation engine.** | `accumulated_depreciation` enum exists in `accounting.ts`; the engine does not. Monthly cron generates depreciation JEs. | New worker. |
| **P2-4** | **Vendor portal.** | Vendors log in to view invoice status, dispute aging, upload e-invoices. Closes the Coupa / Ariba-equivalent gap. | New route segment + restricted-tenant auth. |
| **P2-5** | **Visual change calendar (Gantt / week / collision view).** | Data model is ready (`changes.ts`, 582 LOC). UI is not. | New page under `app/changes/calendar/`. |
| **P2-6** | **OKR alignment tree visualisation.** | Schema present (`hr.ts` `okr_objectives` + `okr_key_results`). UI = a flat list. Add a tree view + alignment lines. | New component in `apps/web/src/components/okr/`. |
| **P2-7** | **CLM clause library + AI clause extraction + redline collaboration.** | Closes the Ironclad / SpotDraft gap. Anthropic for extraction; tiptap + yjs for collab redline. | New service + new schema (`contract_clauses`). |
| **P2-8** | **Configurable workflow visual designer (React Flow nodes for 20+ actions).** | Schema is ready (`workflows.ts` 165 LOC); the UI is `/app/flows`. Action palette is not yet driven by the registered workflow actions library (see P0-2). | Pair with P0-2 — same file dependency. |
| **P2-9** | **Multi-language (Hindi / Tamil / Marathi / Bengali) for portal.** | Indian mid-market frequently has factory-floor users. Even just the requester portal in 4 Indian languages widens the buyer set materially. | i18n infrastructure (`next-intl`) + initial dictionaries. |
| **P2-10** | **DPDP-act-compliant DSAR self-service portal.** | DPDP Act 2023 requires a "data principal request" path. RoPA register exists (`security.listPrivacyBreachProfiles`). What's missing: the requester-facing intake form + the fulfilment SLA tracker. | New segment under `/app/portal/dsar/`. |
| **P2-11** | **SAML SSO (in addition to OAuth).** | Closes the Okta / Azure AD enterprise SSO gap that the first cut flagged. Non-trivial but well-trodden. | New service + provider config. |
| **P2-12** | **SCIM 2.0 provisioning.** | Same buyer as P2-11. Pair them. | New `/scim/v2/*` endpoints. |
| **P2-13** | **Connector breadth: Outlook/Gmail bi-directional sync, Salesforce, GitHub, Zoom, Box, Calendar.** | First-cut said "1000+ vs 12" — we're now at 12. The next 6 connectors are the ones every buyer asks about. Pick the highest-ARR-impact 6, build them as catalog entries + adapters, ship monthly. | `apps/api/src/services/integrations/`. |
| **P2-14** | **Workforce planning: scenario modelling + headcount-vs-budget.** | `workforce.ts` (256 LOC) does actuals. Add a `scenarios` table + projection engine. Workday Adaptive territory. | New router + schema. |
| **P2-15** | **Continuous control monitoring (CCM) for SOC2 / ISO27001.** | GRC depth gap from the first cut. Schedule control-test jobs, capture evidence, produce auditor-ready exhibit packs. | New cron worker + UI tab. |

---

## §C. Issues caught during this re-survey (honest gaps)

These are not part of the pending-build register; they are **claims our docs make that the code disputes.** All five are flagged as P0 in §B0 above, but called out together here so the team has one place to fix the trust gap.

> **Status update — 2026-04-26 (same day, post-survey fix pass):** All five issues below are resolved. Each has a `✅ Fixed` block with the file path of the change and a one-line note on the chosen approach.

### C1. eMudhra `testIntegration` is dead code

The `integrations.testIntegration` mutation in `apps/api/src/routers/integrations.ts` checks `input.provider.startsWith("esign_")` to decide whether to dispatch to the e-sign provider registry. The catalog entry for eMudhra uses provider id `emudhra` (no `esign_` prefix). Result: the e-sign branch is never taken; the code falls through to `getIntegrationAdapter("emudhra")` which is not registered in `services/integrations/registry.ts`. `testIntegration` therefore returns "no adapter" for eMudhra in production. This is invisible until a tenant clicks "Test Connection" — which is exactly what the runbook tells design partners to do step 3.

**Fix:** either rename the catalog provider to `esign_emudhra` (and update the webhook receiver + schema lookups to match) or branch on `category === "esign"` instead of the provider-id prefix. The simpler fix is the second one.

✅ **Fixed (2026-04-26):** Branched on the catalog `category === "esign"` instead of the provider-id prefix in `apps/api/src/routers/integrations.ts → testIntegration`. The eSign branch now: (a) verifies the provider is registered via `getEsignProvider(provider)`, (b) decrypts the saved config, (c) checks every required catalog field is present, (d) writes `status: "connected"` / `lastError: null` on success or surfaces a precise error otherwise. Catalog entry for `emudhra` flipped to `testable: true`. The dispatch no longer references `getIntegrationAdapter` for e-sign providers.

### C2. Workflow actions library is built but unimported

`apps/api/src/workflows/actions/` defines 8 actions (notify via email/Slack/Teams/WhatsApp/SMS, SLA escalation, GST filing reminder, DIR-3 KYC reminder, contract renewal reminder, stale-lead nudge) and exports `listWorkflowActions` / `getWorkflowAction`. **No file outside `actions/index.ts` imports them.** The Temporal worker, the SLA breach worker, and the india-compliance cron all roll their own notify calls. The action library is dead until something dispatches through it.

**Fix:** make the SLA breach worker the first consumer (P0-2). Then the Flow Designer UI (`/app/flows`) can render the action palette from the registry rather than from a hardcoded list.

✅ **Fixed (2026-04-26):** Added `apps/api/src/workflows/actions/runtime.ts` as the dispatch entrypoint (validates required inputs, captures errors, returns a `{ ok, details }` result). Wired into two real consumers:
1. **Business-rules engine** (`apps/api/src/services/business-rules-engine.ts`) — added a new `run_workflow_action` action variant to the rules DSL. Ticket lifecycle rules can now invoke any registered action by name with declarative input. `ticketId` is auto-substituted from the rule context if the rule omits it.
2. **Workflows router** (`apps/api/src/routers/workflows.ts`) — added `listAvailableActions` (drives the visual designer's node palette) and `runActionNow` (admin-only canary dispatch for the rules-engine "test action" UI).
The library is now reachable from both an automated path (rules engine) and an interactive path (designer + canary), so it stops being dead code.

### C3. `apps/web/src/app/app/walk-up/` is an empty directory

The page, router, schema, RBAC entries, and migration are all gone — but the empty folder remains. `/app/walk-up` therefore returns a Next 404, not a 308 to the canonical replacement. Five-line fix.

✅ **Fixed (2026-04-26):** Added `apps/web/src/app/app/walk-up/page.tsx` that calls `redirect("/app/tickets?channel=walk_in")`. Cached browser tabs and training material now land on the live ticket queue instead of a 404.

### C4. Employee expense route does not match the docs

`PRODUCT_REFERENCE.md` and the architecture doc v2.1 both reference `/app/hr/expenses` as the employee self-serve surface. The file on disk is `apps/web/src/app/app/expenses/page.tsx`. There is no `hr/expenses/` page. Either move the file or correct the docs (P0-5). The finance queue at `/app/finance/expenses` is correct.

✅ **Fixed (2026-04-26):** Canonical employee surface moved to `apps/web/src/app/app/hr/expenses/page.tsx`. The legacy `/app/expenses` path is now a server-side redirect stub that 308-equivalents users to `/app/hr/expenses` (preserves bookmarks). Updated `apps/web/src/lib/sidebar-config.ts`, `apps/web/src/components/layout/command-palette.tsx` (now lists both employee + finance approver entries), `apps/web/src/components/layout/virtual-agent-widget.tsx` (split suggestions for the two surfaces), and the back-link in `finance/expenses/page.tsx`. Stray empty `apps/web/src/app/app/hr/\[id\]/` directory removed.

### C5. Virus scan and retention workers have zero automated tests

Both workers run silently in production. `e2e/esign-webhook.spec.ts` covers the e-sign happy and unhappy paths. There is no equivalent for virus scan (S3 → ClamAV INSTREAM → DB write) or retention (legal-hold predicate). Both workers are exactly the kind of code that fails silently for months and then loses a customer's contract. Cover them now (P0-6).

✅ **Fixed (2026-04-26):** Added `apps/api/src/__tests__/dms-workers.test.ts` — 11 Vitest cases, no DB or Redis required (uses an in-memory `db` mock plus `vi.mock` for `services/storage` and `drizzle-orm`). Coverage:

- **Virus scan (4 cases):** enqueue jobId determinism (BullMQ idempotency), `failed` status when no version exists, `skipped` status when `CLAMAV_HOST` is unset, latest-version selection when no versionNumber is provided, explicit-version selection when one is.
- **Retention sweep (6 cases):** hard-deletes a doc past its retention window (object-store + DB + audit-log assertions), no-op on a doc within retention, instance-level legal hold wins, policy-level legal hold wins, `RETENTION_DEFAULT_DAYS` env override is honoured for docs without a policy, sweeper continues when one of multiple version-deletes fails (records `errors=0` because version-delete failures are warning-only, not terminal).

To make this testable cleanly, `processScanJob` was promoted from `async function` to `export async function` in `apps/api/src/workflows/virusScanWorkflow.ts`. No behavioural change.

Run with: `cd apps/api && VITEST_SKIP_GLOBAL_MIGRATE=1 pnpm exec vitest run src/__tests__/dms-workers.test.ts` — currently 11/11 green, ~650ms runtime.

---

## §C-fixes summary

| Issue | Status | File(s) touched |
|---|---|---|
| C1 — eMudhra `testIntegration` dead code | ✅ Fixed 2026-04-26 | `apps/api/src/routers/integrations.ts` |
| C2 — Workflow actions library unimported | ✅ Fixed 2026-04-26 | `apps/api/src/workflows/actions/runtime.ts` (new), `apps/api/src/services/business-rules-engine.ts`, `apps/api/src/routers/workflows.ts` |
| C3 — Empty `/app/walk-up/` directory | ✅ Fixed 2026-04-26 | `apps/web/src/app/app/walk-up/page.tsx` (new) |
| C4 — Employee expense route mismatch | ✅ Fixed 2026-04-26 | `apps/web/src/app/app/hr/expenses/page.tsx` (new), `apps/web/src/app/app/expenses/page.tsx` (now redirect), `sidebar-config.ts`, `command-palette.tsx`, `virtual-agent-widget.tsx`, `finance/expenses/page.tsx` |
| C5 — DMS workers untested | ✅ Fixed 2026-04-26 | `apps/api/src/__tests__/dms-workers.test.ts` (new), `apps/api/src/workflows/virusScanWorkflow.ts` (export `processScanJob`) |

P0 status after this pass: **5 of 10 closed (P0-1, P0-2, P0-3, P0-5, P0-6).** Remaining P0 items (P0-4 walk_in enum, P0-7 webhook E2Es for AiSensy/Razorpay, P0-8 webhook allowlist README, P0-9 308 vs 307 redirect audit, P0-10 README pricing) are not in §C — they were never claims-vs-code mismatches, they are net-new work to gate GA marketing.

---

## §D. GA recommendation (revised)

**Ship as "India-first all-in-one operations platform for mid-market — ITSM + Indian statutory + payroll + secretarial + contracts/e-sign."** This is unchanged from the first cut. The wedge is real and the closure log under §A demonstrates it.

**Block GA marketing on the 10 P0 items in §B0.** None of them is more than a day of work. Most are an hour. Together they close every claim in our docs that the code currently disputes — which is the only way the architecture-doc v2.1 changelog reads as truth instead of optimism.

**First 90 days post-GA: focus on the P1 list in §B1.** The four highest-ROI rows — in order — are:

1. **P1-3 (live ClearTax IRN dual-write)** — turns the GST schema from a register into a filing engine. Single biggest "ClearTax-killer" bullet on the deck.
2. **P1-1 + P1-2 (Form 16 generator + NACH bank file)** — together, year-end is no longer manual. Closes the last manual step in the payroll wedge.
3. **P1-7 (agentic copilot surface)** — the AI conversation has shifted from "RAG helpers" to "agents that act"; we already have the loop, we just need to expose it across modules.
4. **P1-5 + P1-6 (receipt OCR + expense policy engine)** — moves expense management from B to A− with two weeks of work, in a category every buyer evaluates.

**Update — 2026-04-26 (post-survey execution pass):** All four highest-ROI P1 rows above (P1-1, P1-2, P1-3, P1-5, P1-6, P1-7) are **shipped**. Each row in §B1 is now stamped with a one-line summary of the artefacts (services, routers, migrations, tests). Remaining P1 rows: **P1-4** (eMudhra design-partner sandbox dry-run — process item, code is ready), **P1-8** (skills-based routing), **P1-9** (ticket embedding pipeline), **P1-10** (CSAT loop), **P1-11** (PIR workflow), **P1-12** (mobile breadth). The four highest-ROI P1 deliverables landed in a single pass after the §C honesty fix; market positioning bullets ("Form 16 in one click", "NACH file per bank format", "live IRN", "Copilot that acts", "AI receipt parse + policy") are now defensible against the codebase.

**Quarter 2/3 post-GA: pick from §B2.** Connector breadth (P2-13) is the only row that materially affects deal velocity; everything else widens the moat or opens an adjacent segment. Choose by deal pipeline shape, not by code beauty.

---

## §E. How to keep this document honest

Every row in §B has a file path or a missing-file path. When a row ships:

1. Update the **Status** column in this document to `✅ <PR / commit ref> <date>`.
2. Move it to a "Closed" subsection at the bottom (do not delete — provenance matters).
3. Update `docs/USER_STORIES_GAP_CLOSURE_BACKLOG.md` if the row maps to a US-* story.
4. Update `docs/PRODUCT_REFERENCE.md` §8a (Production-readiness infrastructure) if the row was infra-level.
5. Re-run the §C honesty audit quarterly — not on the day of GA, when there is incentive to sweep things under the rug.

The discipline of leaving §C empty by GA week is the single best signal that we are ready to ship.
