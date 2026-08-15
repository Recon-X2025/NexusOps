# Module Completion & Reachability — Onboarding Source of Truth (2026-08-15)

_Read-only reachability audit. Source material for the pilot onboarding document. **An overstatement is
worse than a gap.**_

**Method.** Every claim was established by tracing the path a customer takes: **UI control → tRPC procedure
→ engine → real DB work**. "Reachable" means a user can get from a screen to a stored, usable result. Code
that exists but has no UI/nav/scheduler path is **not** counted as reachable. Findings are code-traced on
live SHA `deec1b7`; the prior `docs/audits/walk2_*` runtime walks are **render-only** (page loads), so most
button-level findings here are from code, not a click-through — see the UNVERIFIED register.

**How to read the completion %.** It is the share of what a customer reasonably expects from the module
that is **reachable and works end-to-end through the product** — not code existence. A module whose core
purpose is unreachable is capped low even if its engine is excellent.

| Band | Meaning |
|---|---|
| **80–100%** | Core workflows work end-to-end; gaps are edges/polish |
| **60–79%** | Usable for the pilot, with named caveats a customer will hit |
| **40–59%** | Reachable but a core piece is broken or unreachable; plan around it |
| **20–39%** | Mostly non-functional through the product; do not rely on it |
| **0–19%** | Shell / fabricated / orphaned — not a usable feature |

Legend in drill-downs: ✅ **Real** (works end-to-end) · 🟧 **Needs improvement** (reachable but incomplete/wrong)
· 🟥 **Stub/Shell** (inert, fabricated, or unreachable).

---

## A. Completion summary — all modules, by percentage

| Module | Route | % | Verdict |
|---|---|---:|---|
| Recruitment | `/app/recruitment` | **85%** | Real end-to-end; offer accept is manual |
| People & Workforce Analytics | `/app/people-analytics` | **85%** | Fully real read-only; attrition uses an `updatedAt` proxy |
| Knowledge Base | `/app/knowledge` | **80%** | Real CRUD + versioning; "not helpful" counter never increments |
| Service Catalog | `/app/catalog` | **80%** | Real request→approve→fulfil; single-item skips required-field validation |
| Payroll & Statutory | `/app/payroll` | **80%** | Computation production-grade; no downloadable filings, no leave-policy UI |
| Performance Management | `/app/performance` | **78%** | Fully real; review-form upload is filename-only |
| Security Operations | `/app/security` | **78%** | Real incidents/vulns + CVSS→SLA loop; evidence is a URI, not a file |
| CRM & Sales | `/app/crm` | **75%** | Real leads/deals/convert/scoring; CPQ can only make zero-value quotes |
| Problems | `/app/problems` | **75%** | Most complete ITSM module; problem→change link doesn't persist |
| Tickets / Service Requests | `/app/tickets` | **75%** | Real create→resolve→close; SLA-pause picker inert, escalate button tags only |
| HR Service Delivery | `/app/hr` | **75%** | Cases/leave/attendance/OKR real; document attachments filename-only |
| Surveys | `/app/surveys` | **75%** | Real incl. public response capture; public page renders CSAT only |
| Command Center | `/app/command` | **75%** | Real, data-backed; role/persona switching disabled |
| Employee Portal | `/app/employee-portal` | **75%** | Genuine self-scoped receive-only (payslips, Form 16, tax summary) |
| Integration Hub | `/app/settings/integrations` | **75%** | 11 of 13 connectors real; Teams + SMTP are store-only shells |
| Facilities & Real Estate | `/app/facilities` | **70%** | Fully real incl. double-booking guard; bookings not org-scoped |
| Financial Management | `/app/financial` | **70%** | Real invoices + GST + GL posting; CAPEX/OPEX + Taxation tabs cosmetic |
| Changes | `/app/changes` | **70%** | Real CAB engine; detail-page approval bypasses it, comment is a facade |
| HAM (Hardware Assets) | `/app/ham` | **70%** | Real CRUD + lifecycle; discovery fake, document storage mock |
| Administration | `/app/admin` | **70%** | 21 real tabs; custom-role write permissions are inert (vocabulary mismatch) |
| Customer Service (CSM) | `/app/csm` | **70%** | Real cases; honest about unmeasured SLA/CSAT |
| Expenses & Reimbursements | `/app/finance/expenses` | **65%** | Full lifecycle; no GL posting, finance-approve has no status guard |
| Work Orders | `/app/work-orders` | **65%** | Real CRUD + parts; SLA dead, actual-dates dead, one priority-enum bug |
| Events / AIOps | `/app/events` | **65%** | Real correlation engine; screen is monitor-only, AIOps panel inert |
| CMDB | `/app/cmdb` | **65%** | Real CIs/impact/cycle-detection; discovery is a random-number stub |
| Vendors | `/app/vendors` | **65%** | Wiring real; backend depth UNVERIFIED |
| Secretarial & CS | `/app/secretarial` | **65%** | Board/directors/shares/ESOP-register real; registers shell, MCA21 manual |
| Approvals & Workflow | `/app/approvals` | **65%** | Real decide w/ concurrency; not every module routes into the queue |
| Flow Designer | `/app/flows` | **65%** | Designer + executor + webhooks real; node-vocabulary split, `test` dry-run |
| Strategy / Initiatives | `/app/projects` | **65%** | Projects real; strategy hub read-only, one hardcoded KPI |
| Procurement | `/app/procurement` | **60%** | PR/PO/PO-GATE real; goods-receipt a status stamp, 3-way match unreachable |
| Contracts | `/app/contracts` | **60%** | Wiring real; renewal/expiry automation + depth UNVERIFIED |
| Risk & Compliance (GRC) | `/app/grc` | **60%** | Real CRUD; only likelihood×impact, no control-testing/scoring |
| Employee Center | `/app/employee-center` | **55%** | Real IT portal; announcements + service-status panels hardcoded empty |
| Legal Service Delivery | `/app/legal` | **55%** | Matters/requests/investigations real; RPT/RoPA/MCA21 backend-only |
| Chart of Accounts + Ledger + Journal | `/app/finance/accounting/*` | **55%** | Money-math real, but sidebar journal never posts; ledger columns blank |
| Bank Reconciliation | `/app/finance/accounting/reconciliation` | **55%** | Real matching engine; no cleared-balance / tie-out; gated by CoA gap |
| DPDP Privacy | `/app/dpdp` | **55%** | DSR/consent/breach/RoPA + sweep real; erasure dry-run, notices to DPO only |
| Webhooks | `/app/settings/webhooks` | **55%** | Dispatch real; most advertised events are never emitted |
| SAM (Software Assets) | `/app/sam` | **50%** | License registry real; compliance/optimization tabs shells, reconcile unreachable |
| Setup Wizard | `/app/onboarding-wizard` | **50%** | Configures the org; does NOT create COA/employees/structures |
| App Inventory (APM) | `/app/apm` | **50%** | Real CRUD; headline tiles always 0, RBAC tab/router mismatch |
| Major Incidents | `/app/it-services/major-incidents` | **45%** | List + analytics real; war room is a read-only viewer nothing can write to |
| Releases | `/app/releases` | **40%** | Rich UI over a thin table; most columns render undefined |
| API Keys | `/app/settings/api-keys` | **30%** | Keys created but **cannot authenticate** (`nxk_` vs `nxo_` prefix) |
| On-Call | `/app/on-call` | **25%** | Largely a shell — no member/chain entry, "Page Now" pages nobody |
| Depreciation | _(no route)_ | **10%** | Engine real + correct, but orphaned — no UI/nav/scheduler |
| Balance Sheet / P&L | _(no route)_ | **10%** | Procedure real & self-balancing; no screen exists |
| Omnichannel | `/app/settings/omnichannel` | **10%** | Static informational page; configures nothing |
| ESG Reporting | `/app/esg` | **5%** | 100% hardcoded fabricated numbers; no backend |
| Statutory Registers | `/app/secretarial?tab=registers` | **5%** | Nav link → wrong tab; no API, no UI |

_Percentages are reachability-weighted judgments, not measured coverage. Where a module carries an UNVERIFIED
tag (Vendors, Contracts), the figure is provisional pending a line-by-line router read._

---

## B. Per-module drill-down (Real / Needs improvement / Stub)

### People & Workplace

**Payroll & Statutory — 80%**
- ✅ PF/EPF, ESI (6-month rule), Professional Tax (data-driven, 36 states), TDS (both regimes), gratuity, leave encashment — all real, test-backed (`packages/payroll-math/*`). 14-step run with server-enforced SoD. Tax-declaration capture (80C/80D/80CCD(1B)/80TTA/24b). Form 16 PDF (HR-reachable), bank NEFT file, payslip PDF.
- ✅ F9 (₹0 TDS for mid-year joiners) and F10 (HRA hardcoded 0 on payslip) — **fixed**, with regression tests.
- 🟧 No downloadable government-filing file — ECR/ESI/PT/24Q exist only as summary DB records; portal push is unconfigured. Payslip PDF is **employee-only** (HR/admin can't open it). Bank file uses a placeholder debit account. Mid-FY printed monthly-TDS estimate can differ from the stored deduction (annual reconciles).
- 🟥 Leave-policy configuration has **no UI** (`leaveAccrual.policy.upsert` wired to nothing) and no seed → a fresh tenant has no policies (nothing encashable, accrual won't credit) until set via API.

**Recruitment — 85%**
- ✅ Requisitions, candidates, pipeline (moveStage increments filled on hire), interviews, offers, analytics — all real (`recruitment.ts`).
- 🟧 Offer accept/decline is a manual status button, not candidate-driven.

**People & Workforce Analytics — 85%**
- ✅ Summary, headcount (subtree-scoped), tenure, attrition, leave analytics, grade distribution — all real aggregates (`workforce.ts`).
- 🟧 Attrition attributes termination by `employees.updatedAt` — a later edit shifts the month.

**Performance Management — 78%**
- ✅ Review cycles, self-scoped My Reviews/My Goals, createReview, goal CRUD — all real (`performance.ts`).
- 🟧 Review-form upload stores only the filename (`reviewFormUrl = file.name`); no rating/competency capture.

**HR Service Delivery — 75%**
- ✅ HR cases, leave (create/approve, per-type balances, maternity non-debiting), attendance (list/clock/self sign-in), holidays, OKR with a real rollup engine, onboarding/offboarding/lifecycle/F&F all wired.
- 🟧 Holiday seed hardcodes movable festivals (Holi/Diwali/Eid) to fixed dates — wrong for most years.
- 🟥 Document attachments are filename-strings only (no object storage); onboarding upload buttons honestly disabled.

**Employee Portal — 75%**
- ✅ Self-scoped payslips, tax summary (old vs new), Form 16 (≥12 processed months) — a genuine receive-only surface.
- 🟧 No explicit access-denied guard (relies on self-scoped queries returning empty).

**Employee Center — 55%**
- ✅ Real IT service portal (my catalog requests + my tickets + KB).
- 🟥 "IT Announcements" and "Service Status" panels are hardcoded empty; hero search has no handler.

**Facilities & Real Estate — 70%**
- ✅ Spaces, buildings, bookings, move requests, facility requests — all real; real double-booking conflict check.
- 🟧 `roomBookings` has no `orgId` (relies on the RLS wall); mild TOCTOU race on the conflict check.

### Payroll consumer & commercial model
- ✅ Genuine self-scoped receive-only surfaces exist (payslips, My Reviews/Goals, own leave, self clock-in).
- 🟥 No role grants *exactly* the consumer experience: the base `requester` role over-grants `hr/facilities/procurement/catalog` write — a plain member can create holidays, clock any employee, and **manager-approve expense claims** (SoD gap).

### IT Services

**Tickets — 75%**
- ✅ Create → assign → resolve → close/reopen with a real transition guard + SLA scheduling; comments, watch, bulk ops, similar-ticket embeddings.
- 🟥 SLA-pause reason picker inert (never rendered/sent); "Escalate Now" only appends a tag.

**Problems — 75%**
- ✅ RCA, workaround, KEDB materialization, notes, KB publish, problem→incident linking — all real and reachable.
- 🟥 Problem→change linking doesn't persist (query params dropped, no `problemId` column).

**Changes — 70%**
- ✅ Create, list, blackout windows, CAB approve/reject **from the list page** (lifecycle guard + risk gating + version concurrency).
- 🟧 Detail risk badge reads wrong column (always "low"); `category`/`businessJustification` dropped on create.
- 🟥 Detail-page "Approve (CAB)" bypasses the approval engine (no record, no gate, no notification); "Add Comment" is a facade that stores nothing.

**Work Orders — 65%**
- ✅ CRUD + tasks + notes + a real transactional Parts/Inventory backend.
- 🟧 New-WO form drops assetTag/contact fields; assignee/requester render hardcoded strings.
- 🟥 SLA sub-system dead (breach flag/KPI/flame/banner never fire); Actual-Start/End never written; priority `3_medium` vs server `3_moderate` **errors on create**.

**Events / AIOps — 65%**
- ✅ Ingestion + correlation genuinely auto-creates linked incidents; suppression/correlation/integration CRUD; 60s correlation sweep.
- 🟥 `events.ingest` has no UI trigger (external POST only); "AIOps Root Cause" panel always "in progress"; rule/policy Edit/Delete buttons dead.

**CMDB — 65%**
- ✅ CIs, relationships, service map, real impact/blast-radius traversal, real cycle detection.
- 🟧 CI grid pads ~7 inert columns (OS/IP/Owner/Health) the table doesn't store.
- 🟥 "Run Discovery" is a random-number stub (creates 0 CIs); "Bulk Import" writes HAM assets, not CIs.

**HAM — 70%**
- ✅ Add/assign/retire assets with history; contracts tab; CSV export.
- 🟥 "Run Discovery" cosmetic refetch; document upload uses mock storage (`sha256:"mockhash"`).

**SAM — 50%**
- ✅ License registry + seat assignment with cap enforcement.
- 🟥 Compliance & Optimization tabs bound to fields the API never returns (all 0/—); real reconciliation engine unreachable (no UI calls `reconcile`/`ingestInstalled`); "Sync Discovery" fake.

**Major Incidents — 45%**
- ✅ List (isMajorIncident) + war-room hierarchy + real SLA/DORA analytics.
- 🟥 War room is read-only over a comms log **no UI can write to** (`majorIncidentComms.append` has no caller); "View War Room" button doesn't navigate.

**Releases — 40%**
- ✅ Record (name/version/status/notes/date), change+problem linking, rollback-as-incident.
- 🟥 List renders ~11 columns that don't exist on the table (type/env/risk/owner/tests/steps/progress → undefined/0); New modal hardcodes version, misfiles Environment, drops Type; `deploymentPlan` writes to a non-existent column.

**On-Call — 25%**
- ✅ Schedules/incidents persist; `activeRotation` computes by week.
- 🟥 No UI to enter members or the escalation chain → every rotation stores empty; "currently on-call" always "—"; Escalation Policies permanently empty; **"Page Now" pages nobody** (row insert only, no notification).

### Security & Compliance

**Security Operations — 78%**
- ✅ Incident lifecycle + state machine; vulnerabilities with CVSS→SLA derivation; scanner-import dedupe; threat intel; **vuln→SLA escalation loop wired + firing**.
- 🟧 Compliance evidence is a URI pointer, not a stored file; SIEM export is a pull-preview.

**DPDP Privacy — 55%**
- ✅ DSR (real statutory clock), consent ledger (idempotent grant/withdraw/expire), breach register (72h clock), RoPA; the dpdpSweepWorkflow fires hourly.
- 🟥 Erasure is dry-run by default (`DPDP_ERASURE_ENABLED` off) — "fulfilling" an erasure DSR mutates no data. **Breach notices go only to the tenant's own DPO** — never the Data Protection Board or principals (by design; do not claim otherwise).

**Risk & Compliance (GRC) — 60%**
- ✅ Risks (likelihood×impact), policies (full lifecycle), audit plans, vendor risks, control evidence — all real CRUD.
- 🟧 No intelligence beyond likelihood×impact; no control-testing workflow; vendor-risk score is manual.

**Approvals — 65%**
- ✅ `decide` with optimistic concurrency + idempotency + durable post-decision workflow.
- 🟧 Not every module routes into the queue — payroll finance-approval bypasses it (shows "0 pending"); no multi-approver chain builder here.

**Flow Designer — 65%**
- ✅ Designer CRUD, Temporal BFS executor, **outbound webhooks fire** (HMAC-signed, retried) from real domain events.
- 🟧 `test` is dry-run; node-vocabulary split (event-bus `action` nodes vs Temporal typed nodes) — a flow authored for one path won't run on the other.

**ESG Reporting — 5%**
- 🟥 100% static hardcoded numbers (GHG 420, breaches 0…), zero backend, no ESG router. Actively misrepresents on an empty org.

### Customer & Sales

**CRM & Sales — 75%**
- ✅ Leads, deals (with close-won approval tier), lossless lead→deal convert, deterministic + persisted lead scoring (sortable column), account/contact CRUD. Two prior defects (source-enum 400, edit-status) verified fixed.
- 🟥 CPQ: the New Quote modal only sends a single hardcoded zero-value line → every UI quote totals 0. GST engine is real but unreachable with real values. Lead-scoring config is API-only (no UI).

**Service Catalog — 80%**
- ✅ Browse → Request → approve → fulfil with state-machine guards; real multi-item cart transaction.
- 🟧 Single-item Request skips required-field validation; fresh orgs start with an empty catalog.

**Customer Service (CSM) — 70%**
- ✅ Cases CRUD with auto-numbering; honest about unmeasured SLA/CSAT (returns null, not fabricated).
- 🟧 No SLA-breach column; `avgResolutionHours` unmeasured (0).

**Surveys — 75%**
- ✅ Create/activate/results real; **public response capture via `/api/public/surveys/:token`**.
- 🟧 Public respond page renders CSAT star + comment only, though the builder supports more types.

### Finance & Procurement

**Financial Management — 70%**
- ✅ Invoices AP/AR write the row **and** post a balanced GL journal atomically; real GST (CGST/SGST vs IGST); approve/pay with closed-period + approver≠payer SoD.
- 🟧 CAPEX/OPEX tab cosmetic (no field); India Taxation tab mostly static; AP/AR "overdue" filter branches are dead (enum never emits it); invoice-list Budget Code hardcoded, PO Ref raw UUID.

**Procurement — 60%**
- ✅ PR create/approve/reject; **Direct PO with PO-GATE** (value ceiling + server GST + balanced accrual JE); PO-from-PR; PO send.
- 🟥 "Goods Receipt" is a status stamp, not a receipt (`markReceived`); the real line-level GRN writer has zero web callers; **3-way match engine real but unreachable** (no UI runs it, no UI sets `grnId`).

**Chart of Accounts + Journal + Ledger — 55%**
- ✅ CoA seed (47 accounts); **Add Account now wired** (walk2 "F2 INERT" is stale); journal create with server-enforced debits==credits; ledger running-balance; GSTR-1 real per-line grouping (no 18% hardcode).
- 🟧 CoA New Account form has no sub-type selector → manual accounts get null subType → can't create bank/cash → reconciliation crippled to the one seeded account.
- 🟥 **Sidebar Journal creates drafts with no Post control** → entries never reach the ledger/trial balance/P&L/balance sheet (Post/Reverse live only on the orphaned `/app/accounting` page). Ledger Debit/Credit columns permanently blank (reads `debit`/`credit`; schema is `debitAmount`/`creditAmount`).

**Bank Reconciliation — 55%**
- ✅ Real end-to-end matching: create session → import CSV → genuine amount+date+token scoring → match/ignore → finalize.
- 🟧 Never computes a cleared balance or book-vs-statement difference — "Reconciled" = "all lines triaged", not "account ties out"; gated by the CoA subtype gap.

**Expenses & Reimbursements — 65%**
- ✅ Full lifecycle (file → manager approve → finance approve → reimburse) persists via `hr.expenses.*`.
- 🟧 Finance `approve` has no status guard (can approve a never-manager-approved claim, or flip a reimbursed one back); no submit control on the finance page.
- 🟥 No accounting integration — approve/reimburse post no journal entry; "reimbursed" is a status flag only. A richer `expenseReports.*` model exists with no UI (orphaned).

**Vendors — 65%** _(UNVERIFIED depth)_
- ✅ Create/list/bulk-import wired to real procedures.
- 🟧 No related-party flag; backend depth not read line-by-line.

**Contracts — 60%** _(UNVERIFIED depth)_
- ✅ Create-from-wizard/list/complete-obligation wired.
- 🟧 Renewal/expiry-alert automation + e-sign wiring not confirmed this pass.

**Depreciation — 10%** · **Balance Sheet / P&L — 10%**
- ✅ Engines real and correct (SLM+WDV+Schedule-II, balanced GL posting; balance sheet self-balances with current-period earnings folded into equity).
- 🟥 Orphaned — no UI, no nav, no route, no scheduler. Reachable only by a direct API call.

### Legal & Governance

**Legal Service Delivery — 55%**
- ✅ Matters (CNR/court/hearing/limitation/legal-hold), Legal Requests, Investigations (real confidentiality filter).
- 🟥 Related-party transactions, DPDP RoPA, programme matrix, governanceSummary, and the real MCA21 filing path are **built with no UI** — API-only.

**Secretarial & CS — 65%**
- ✅ Board & Directors (meetings/quorum/minutes, resolutions with vote tallies, DIN+KYC + auto DIR-3), Share Capital (PAN encrypted), MCA/ROC filings tracker, Compliance Calendar.
- 🟧 ESOP is a grants register with vesting **dates only** — no vesting schedule/computation (deck "ESOP vesting" is overstated). MCA/ROC tab is a manual tracker (hand-typed SRN), not electronic filing.
- 🟥 "Statutory Registers" nav link lands on the wrong tab; table exists, no API, no UI.

### Strategy / Knowledge

**Strategy / Initiatives — 65%**
- ✅ Projects CRUD, milestones, tasks, dependency cycle-detection, intake approval, portfolio KPIs.
- 🟧 "Overallocated Resources" KPI hardcoded 0 (no resource model); Agile Kanban flag-off; initiative/benefits router capabilities have no dedicated UI; `/app/strategy` is a read-only dashboard.

**Knowledge Base — 80%**
- ✅ Full CRUD, content versioning, publish/archive, feedback.
- 🟧 "Not helpful" 👎 never increments (`recordFeedback` only bumps `helpfulCount`).

### Platform / Settings / Setup

**Command Center — 75%**
- ✅ Metric payloads resolve against the real DB, 30s cache, AI narrative with deterministic fallback.
- 🟧 Role/persona switching disabled (hardcoded `ceo`); failed metric resolvers silently omitted.

**Administration — 70%**
- ✅ 21 real tabs (audit log, users, security policy, SSO, SLA defs, system properties, notification/business rules, scheduled jobs, custom roles).
- 🟥 Custom-role **write** permissions are inert — the editor's create/update/manage checkboxes don't match the runtime `read/write/admin/approve/assign/close` vocabulary (only read+delete overlap).

**Integration Hub — 75%**
- ✅ 11 of 13 connectors wire to a real consumer (Slack, Jira, SAP, WhatsApp, MSG91, Razorpay, ClearTax, eMudhra, DocuSign; Google/MS365 with server OAuth env). Creds envelope-encrypted.
- 🟥 Microsoft Teams and Email/SMTP are **store-only shells** — creds save but nothing reads them.

**Webhooks — 55%**
- ✅ Full CRUD + a real HMAC-signed, retried dispatch sweep; fires on contract/asset/invoice/employee events.
- 🟥 Of the 10 subscribable events, only `asset.created` (+ ITOM-auto `ticket.created`) fire; `ticket.*`/`change.*`/`workflow.*` are **never emitted**; the events that DO fire (contract/invoice/employee) aren't offered in the picker.

**API Keys — 30%**
- ✅ Create (hashed, prefixed, per-module permissions), list, revoke.
- 🟥 Created keys **cannot authenticate** — generated `nxk_`, but auth only accepts `nxo_` → 401. (Also ignores per-key permissions.)

**App Inventory (APM) — 50%**
- ✅ Application CRUD + real portfolio aggregates.
- 🟥 Headline tiles read non-existent lifecycle enum keys → always 0; health/tech-debt never computed; tab gates on `projects.read` but router enforces `analytics.read` (403 for some roles).

**Setup Wizard — 50%**
- ✅ Configures the org (profile, entity type, PF config, SLA hours, GSTIN, legal entities) in one transaction; live readiness checklist.
- 🟥 Does **not** create chart-of-accounts, employees, or salary structures — and the checklist's "Set up your chart of accounts" links back to the wizard, which has no COA action.

**Omnichannel — 10%**
- 🟥 Static informational page (hardcoded 4-item array); no query, no config control.

---

## C. Platform-deck claim verdicts

| Claim | Verdict today |
|---|---|
| Three-way match, flagged before payment | ❌ Not reachable — engine real, no GRN UI; degrades to two-way |
| Asset depreciation | ❌ Orphaned — engine real, no UI/nav/scheduler |
| Balance sheet | ❌ No screen — procedure real & self-balancing |
| Board resolutions with vote records | ✅ True |
| ESOP vesting | ⚠️ Overstated — dates only, no vesting computation |
| DIN & KYC status | ✅ True |
| Related-party transactions | ❌ Backend-only, no UI |
| Deterministic lead scoring | ✅ True |
| SLA pause reasons | ⚠️ Server-enforced, not reachable from the ticket UI |
| Escalation to a named on-call chain | ⚠️ Auto loop fires in-app only; manual button inert |
| Known-error database | ⚠️ Embedded in problems; no standalone browser |
| GSTR-1 rate grouping | ✅ True — real per-line, no 18% hardcode |
| Outbound webhooks fire | ⚠️ Engine true; most advertised events never emitted |
| DPDP breach notification | ⚠️ Alerts your DPO only — does NOT file with the DPB or notify principals |
| ESG / BRSR reporting | ❌ Fabricated — not functional |

---

## D. Shell register (the week-one list)
- **Full shells:** ESG Reporting; Omnichannel; Statutory Registers.
- **Partial shells / dead sub-features:** Major-incident War Room; On-Call; SAM Compliance & Optimization tabs; CMDB/HAM/SAM "Discovery".
- **Unusable-as-built:** API keys (prefix mismatch); custom-role write permissions (vocabulary mismatch); sidebar Journal Entries (never posts); CPQ quotes (zero-value only).
- **Orphaned engines (real, no reach):** Depreciation; Balance sheet + P&L; Related-party register; DPDP RoPA (legal); real MCA21 filing; SAM reconciliation; three-way match; GRN writer; `expenseReports` router.

---

## E. Manual set for a first payroll cycle
1. Create employees + salary structures (the Setup Wizard does not).
2. Seed leave policies via API (no UI editor; no default seed).
3. Set org statutory identity (EPF/ESI/PT numbers) before `generateStatutory` (else 400).
4. File all statutory returns yourself — ECR/ESI/PT/24Q have no downloadable file; portal push unconfigured.
5. PT for Kerala & Tamil Nadu (half-yearly) computed manually; Puducherry/Jharkhand/Sikkim/Bihar/Manipur warn (`unknownState`) and must be handled manually.
6. LTA exemption + bonus handled outside the system; Medical & Conveyance not paid.
7. Input tax credit on GST purchases — manual.
8. F&F paid within 2 working days with signed evidence (settlement is write-once).
9. Document/Aadhaar/PAN uploads are not stored in the deployed stack.
10. ROC / company-secretarial filings — manual.

---

## F. Deliberate refusals (confirmed in code)
Segregation of duties (payroll HR≠Finance≠CFO; invoice approver≠payer); closed-period posting block; PO-GATE value ceiling; unbalanced journal rejected (±0.001); gratuity 5-year gate (waived on death/disablement); maternity 26-week floor; PF 50%-wage clamp; encashable-types-only settlement; write-once F&F; CMDB cycle-closing relationship rejected; change scheduling blocked in blackout windows; license seat-cap + insufficient-stock guards; DPDP erasure dry-run (counsel-gated); breach notices withheld from regulator/principals by design; plus the platform-wide prohibition on fund transfers / payment execution.

---

## G. UNVERIFIED register (and how to settle each)
- **Button-level runtime behaviour of most detail `[id]` pages** — prior walks are render-only; nearly all findings here are code-traced. _Settle: an authenticated runtime walk of detail pages + the payroll/leave setup flow._
- **PT slab fallback on a fresh prod DB** (mig 0075 should seed defaults). _Settle: query the live DB._
- **Vendors / Contracts backend depth**, contract expiry-alert scheduler. _Settle: read those routers line-by-line._
- **On-call escalation-chain authoring UI**; whether the flow designer emits both node vocabularies. _Settle: open those canvas components._
- **Per-metric Command Center resolver coverage.**

---

_Read-only pass. Nothing was committed or pushed. Confidence note: the strongest evidence here is code-traced
reachability (control → procedure → real work); "works end-to-end" means the wiring is complete in current
source, not that it was clicked through a running app. The single highest-value follow-up before the pilot is
an authenticated runtime walk of the detail pages and the payroll/leave setup flow._
