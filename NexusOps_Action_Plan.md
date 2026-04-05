# NexusOps — Complete Action Plan to Bridge All Gaps
## Phased Roadmap: UI/UX · Market Features · India Compliance · Differentiators

**Document:** NexusOps_Action_Plan.md
**Version:** 1.0
**Date:** April 5, 2026
**Based on:**
- `NexusOps_Market_Gap_Analysis.md` — 15 module gap analyses, 20 critical market features
- `NexusOps_UIUX_Validation_Report.md` — 86 UI/UX findings
- `NexusOps_Complete_Business_Logic_v1.md` — 12 India compliance gaps
- `NexusOps_Technical_Requirements_Document.md` — Open TGs (TG-13 through TG-16)

**Target market:** India Startups and SMBs (10–500 employees)
**Current readiness score:** 70/100 for SMB readiness
**Target score after full plan:** 95/100

---

## How to Read This Plan

Each phase has a **goal statement**, **duration estimate**, and tasks grouped by workstream. Each task carries:

- `[UX]` = UI/UX fix from the UIUX Validation Report
- `[FEAT]` = New feature from the Market Gap Analysis
- `[IND]` = India-specific compliance requirement 🇮🇳
- `[SEC]` = Security / data correctness fix
- `[INFRA]` = Infrastructure / platform improvement

Priority tiers within each phase:
- 🔴 Must-do (blocks SMB onboarding or creates data integrity risk)
- 🟠 Should-do (significantly improves retention and depth)
- 🟡 Nice-to-have (maturity and delight)

---

## Phase 0 — Immediate Hotfixes (Week 1)
**Goal:** Fix everything that would cause embarrassment, confusion, or data trust issues on a real customer's first day
**Duration:** 3–5 days
**No new features — fixes only**

### Workstream: Security & Data Integrity

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 0.1 | Wrap `<RoleSwitcher>` in `process.env.NODE_ENV === 'development'` guard — remove from all production builds | [SEC] | 🔴 | 1h |
| 0.2 | Remove all mock/static data fallbacks from Contracts page (show proper empty state) | [UX] | 🔴 | 2h |
| 0.3 | Remove all static baseline numbers from Compliance dashboard (replace with live API data or `—`) | [UX] | 🔴 | 2h |
| 0.4 | Remove Employee Center static data fallback (replace with empty state + CTA) | [UX] | 🔴 | 1h |
| 0.5 | Fix "Remember Me" checkbox — implement session vs. persistent token correctly | [SEC] | 🔴 | 2h |

### Workstream: UI Bugs

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 0.6 | Reposition Virtual Agent floating widget to avoid overlapping action buttons (`bottom-20 right-4` or add auto-hide logic when modals open) | [UX] | 🔴 | 2h |
| 0.7 | Fix all phone number placeholders from US format to India format (`+91 XXXXX XXXXX`) across all forms (ticket new, HR employee, CRM contacts, profile) | [UX] | 🔴 | 1h |
| 0.8 | Add missing breadcrumb labels for all 30+ module routes in `BREADCRUMB_LABELS` | [UX] | 🟠 | 2h |
| 0.9 | Fix sidebar footer version number — read from `NEXT_PUBLIC_APP_VERSION` env var | [UX] | 🟡 | 30m |
| 0.10 | Fix notification/user-menu dropdowns to use CSS theme tokens instead of hardcoded `slate-900` (dark mode rendering bug) | [UX] | 🟠 | 2h |

**Phase 0 Deliverable:** A clean, trust-worthy platform ready for real first users. No fake data visible. No security demo tools exposed.

---

## Phase 1 — UX Foundation (Weeks 2–4)
**Goal:** Build the shared component library and UX infrastructure that every subsequent sprint depends on. Fix the structural UI/UX gaps that affect every page.
**Duration:** 2–3 weeks

### Workstream: Shared Component Library

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 1.1 | Create `<Button>` component (variants: primary/secondary/destructive/ghost/link, sizes: sm/md/lg, loading state) from shadcn/ui — replace all bespoke buttons | [UX] | 🔴 | 1 day |
| 1.2 | Create `<Modal>` / `<Dialog>` component wrapping Radix Dialog — replace all 25+ inline `fixed inset-0 z-50` modals | [UX] | 🔴 | 1 day |
| 1.3 | Create `<ConfirmDialog>` component for all destructive actions (delete, cancel, reject, terminate) | [UX] | 🔴 | 4h |
| 1.4 | Create `<EmptyState icon title description action />` component — replace all plain text empty states across 20+ pages | [UX] | 🟠 | 4h |
| 1.5 | Create `<TableSkeleton rows cols />` component — replace plain "Loading..." text in all list pages | [UX] | 🟠 | 3h |
| 1.6 | Create `<Pagination page totalPages onPageChange />` component | [UX] | 🔴 | 4h |
| 1.7 | Create `<DatePicker />` component using `react-day-picker` + Radix Popover — replace all native `<input type="date">` | [UX] | 🟠 | 1 day |
| 1.8 | Create `<KPICard />` as a standalone component in `/components/ui/` (extracted from dashboard) | [UX] | 🟡 | 2h |
| 1.9 | Create `<FileUpload />` component: trigger file picker, upload to storage endpoint, return URL | [UX] | 🔴 | 1 day |

### Workstream: Platform-Wide UX Fixes

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 1.10 | Add pagination to all list pages (tickets, CRM, procurement, vendors, HR, GRC, recruitment, projects, notifications) using the new `<Pagination>` component | [UX] | 🔴 | 1 day |
| 1.11 | Standardize all multi-tab pages to use `?tab=<key>` URL query params (procurement, tickets, HR, financial, GRC, security, devops, reports, admin) | [UX] | 🟠 | 1 day |
| 1.12 | Apply `<EmptyState>` to all 20+ list pages that currently show raw text for empty data | [UX] | 🟠 | 4h |
| 1.13 | Apply `<TableSkeleton>` loading state to all list pages | [UX] | 🟠 | 3h |
| 1.14 | Add global React error boundary (`<ErrorBoundary>`) wrapping the app layout — renders friendly error screen + Sentry capture on unexpected throws | [UX] | 🔴 | 3h |
| 1.15 | Standardize z-index scale across all modals, dropdowns, tooltips, virtual agent, mobile overlay — fix conflicts | [UX] | 🟠 | 3h |
| 1.16 | Add `focus-visible:ring-2 focus-visible:ring-primary/30` to all custom inputs and buttons where `outline-none` is currently bare (WCAG 2.1 AA fix) | [UX] | 🟠 | 3h |
| 1.17 | Add `aria-label` to all icon-only buttons (`Download`, `Filter`, `RefreshCw`, `MoreHorizontal`, overflow menus) | [UX] | 🟠 | 2h |
| 1.18 | Add `title` tooltip to all icon-only buttons | [UX] | 🟡 | 1h |
| 1.19 | Add `×` clear button to sidebar navigator filter input | [UX] | 🟡 | 1h |

### Workstream: Chart Library Integration

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 1.20 | Install Recharts; create `<LineChart>`, `<BarChart>`, `<DonutChart>`, `<AreaChart>` wrapper components | [UX] | 🔴 | 1 day |
| 1.21 | Reports page — replace all `MiniBar` pseudo-charts with real Recharts charts: line chart for ticket trends, donut for ticket type distribution, area chart for SLA performance over time | [UX] | 🔴 | 1 day |
| 1.22 | Dashboard — add a 30-day ticket volume sparkline to the KPI section | [UX] | 🟠 | 4h |
| 1.23 | Reports — add custom date range picker (start + end date) as "Custom" option alongside preset ranges | [UX] | 🟠 | 3h |
| 1.24 | GRC — render the 5×5 risk heatmap as a real colour-coded interactive grid (dots per risk, click to view) | [UX] | 🟠 | 4h |
| 1.25 | Procurement Dashboard — add bar chart for monthly spend trend and pie chart for spend by category | [UX] | 🟠 | 4h |
| 1.26 | People Analytics — replace static numbers with live workforce data charts (headcount by department, attrition trend, hire rate) | [UX] | 🟠 | 1 day |

**Phase 1 Deliverable:** Consistent UI component system. Real charts everywhere. Every page paginated, deep-linkable, and properly empty-stated. WCAG AA baseline met.

---

## Phase 2 — Core SMB Feature Gaps (Weeks 4–8)
**Goal:** Build the features that SMB users expect on Day 1 and without which NexusOps cannot replace existing tools
**Duration:** 4 weeks

### Workstream: ITSM Essentials

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 2.1 | **Email-to-ticket** — inbound email parsing: configure a mailbox (e.g. support@org.nexusops.com), parse subject→title, body→description, sender→requester, auto-create ticket | [FEAT] | 🔴 | 3 days |
| 2.2 | **Ticket templates** — pre-defined forms for common request types (New laptop, VPN access, Password reset); auto-fill fields on selection | [FEAT] | 🟠 | 1 day |
| 2.3 | **Canned responses** — admin-created reply templates; agents select from dropdown while composing comment | [FEAT] | 🟠 | 1 day |
| 2.4 | **Merge duplicate tickets** — select 2+ tickets, merge into one master, redirect all activity | [FEAT] | 🟠 | 1 day |
| 2.5 | **Time tracking per ticket** — agents log hours worked on a ticket; total time displayed in ticket detail | [FEAT] | 🟠 | 1 day |
| 2.6 | **India Holiday Calendar** — admin-configurable calendar with national + state public holidays; drives SLA pause (exclude non-working hours), leave management, and payroll | [FEAT][IND] | 🔴 | 2 days |
| 2.7 | **SLA business hours calendar** — integrate holiday calendar into SLA engine; pause SLA clock outside business hours and on public holidays | [FEAT][IND] | 🔴 | 1 day |
| 2.8 | **AI auto-categorize on ticket create** — apply existing `ai.classifyTicket` on ticket creation; auto-set category, priority suggestion, and routing rule | [FEAT] | 🟠 | 1 day |

### Workstream: HR Completeness

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 2.9 | **Leave Calendar** — visual monthly/weekly team leave calendar; who is on leave per day; manager approval view | [FEAT][IND] | 🔴 | 2 days |
| 2.10 | **Attendance Management** — daily clock-in/out (web + optional geo-fence API); attendance register; present/absent/half-day/late; shift definition | [FEAT][IND] | 🔴 | 3 days |
| 2.11 | **Expense Management** — employee expense claims (travel, food, accommodation, misc); receipt image upload (via `<FileUpload>`); approval workflow; reimbursement status | [FEAT][IND] | 🔴 | 3 days |
| 2.12 | **Offer letter PDF generation** — auto-generate PDF offer letter from offer record (name, role, CTC, start date, joining bonus); download/email to candidate | [FEAT] | 🟠 | 1 day |
| 2.13 | **Interview scheduling with calendar sync** — propose time slots, send Google/Outlook calendar invite to interviewer + candidate; mark outcome (proceed/reject) | [FEAT] | 🟠 | 2 days |
| 2.14 | **OKR / Goal Management** — individual and team OKRs; quarterly cycles; key result check-ins (0–100%); link to performance review | [FEAT] | 🟠 | 3 days |
| 2.15 | **Employee org chart** — visual hierarchy view of the organisation; click employee to see their profile, manager, and direct reports | [FEAT] | 🟠 | 2 days |
| 2.16 | **360-Degree Performance Review** — review cycle (quarterly/annual); self-assessment + peer review + manager review; ratings calibration; final score | [FEAT] | 🟠 | 3 days |

### Workstream: Projects & Knowledge

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 2.17 | **Gantt / Timeline chart** — visual project timeline using `@dnd-kit` or `react-gantt`; task bars, dependencies, milestones, today line | [FEAT] | 🔴 | 3 days |
| 2.18 | **Task dependencies** — FS (finish-to-start), SS, FF links between tasks; predecessor blocking | [FEAT] | 🟠 | 2 days |
| 2.19 | **Agile board DnD wired to API** — implement `@dnd-kit/core` drag-and-drop on Kanban board; dragging a card fires `projects.updateTask` status mutation | [UX][FEAT] | 🟠 | 1 day |
| 2.20 | **Rich text editor for Knowledge Base** — replace basic editor with Tiptap (ProseMirror); support bold/italic/headings/tables/bullet lists/code blocks/image embed | [UX][FEAT] | 🟠 | 2 days |
| 2.21 | **Article versioning** — each KB edit saves a version; "View history" shows diff; revert to prior version | [FEAT] | 🟡 | 1 day |

### Workstream: Service Catalog

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 2.22 | **Dynamic catalog form builder** — admin defines custom fields per catalog item (text, select, date, checkbox, file); forms render dynamically on request submission | [FEAT] | 🔴 | 3 days |
| 2.23 | **Per-item approval workflow** — configure multi-step approval chain per catalog item (e.g. "New laptop" requires manager + IT lead + finance) | [FEAT] | 🟠 | 2 days |

### Workstream: Guided Onboarding

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 2.24 | **Post-signup setup wizard** — step-by-step org setup: complete profile → invite team → set SLA policies → configure categories → create first ticket; progress bar; completion tracked per-org in DB | [UX] | 🔴 | 2 days |
| 2.25 | **File attachments** — add file attachment upload to: ticket detail (files tab), HR case documents, contract drafts, GRC audit findings; use `<FileUpload>` from Phase 1 | [UX] | 🔴 | 2 days |
| 2.26 | **Avatar upload** — implement camera button on profile page; file picker → upload → store `users.avatar_url` → display as `<img>` | [UX] | 🟠 | 4h |

**Phase 2 Deliverable:** NexusOps can replace Freshservice for ITSM teams. HR managers can use leave + attendance. Projects teams have a Gantt view. New orgs are guided through setup.

---

## Phase 3 — India Compliance Depth (Weeks 8–12)
**Goal:** Make NexusOps the most India-compliant SMB platform in the market — covering statutory obligations that global tools get wrong
**Duration:** 4 weeks

### Workstream: Payroll & Statutory Compliance

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 3.1 | **Form 16 generation** — compute Part A (TDS deducted employer) + Part B (gross salary breakup, deductions, taxable income); generate downloadable PDF signed with organisation name | [FEAT][IND] | 🔴 | 3 days |
| 3.2 | **PF ECR challan generation** — generate EPFO ECR (Electronic Challan cum Return) format file for monthly PF deposit and EPFO portal upload | [FEAT][IND] | 🔴 | 2 days |
| 3.3 | **ESIC management** — employee ESIC contribution (1.75% employee + 4.75% employer); monthly ESIC challan; half-yearly return; applicability check (gross wages < ₹21,000/month) | [FEAT][IND] | 🔴 | 3 days |
| 3.4 | **Full & Final Settlement (FnF)** — on offboarding trigger: compute notice period recovery/pay, gratuity (if ≥5 years), encashable leave balance, remaining salary, deductions; generate FnF statement PDF | [FEAT][IND] | 🔴 | 3 days |
| 3.5 | **Arrear salary calculation** — when salary is revised with backdated effective date, compute arrear for past months; add to next payroll run as one-time component; recompute TDS | [FEAT][IND] | 🔴 | 2 days |
| 3.6 | **Gratuity exemption computation** — Sec 10(10): min(actual gratuity paid, 15/26 × basic per day × years of service, ₹20 lakh); apply in FnF and in TDS computation for retiring employees | [FEAT][IND] | 🟠 | 1 day |
| 3.7 | **Professional Tax challan** — generate state-wise PT challan for employer deposit; support all PT states (MH, KA, WB, TN, AP, TS, GJ) with their specific slabs and due dates | [FEAT][IND] | 🟠 | 2 days |

### Workstream: GST & Financial Compliance

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 3.8 | **GSTR-1 auto-generation** — from invoices table, compile monthly GSTR-1 (B2B, B2C, CDNR, exports) in JSON format downloadable for GST portal upload or direct IRP filing | [FEAT][IND] | 🔴 | 3 days |
| 3.9 | **GSTR-3B auto-generation** — monthly summary return: compute output tax liability, ITC available, net payable; generate JSON for portal upload | [FEAT][IND] | 🔴 | 2 days |
| 3.10 | **GSTR-2B reconciliation** — download GSTR-2B data (or accept CSV upload from portal); match against `invoices` table; flag mismatches and missing ITC | [FEAT][IND] | 🟠 | 3 days |
| 3.11 | **Multi-GSTIN support** — allow organisations to register multiple GSTINs (one per state); each GSTIN has separate ITC ledger, invoice series, GSTR filings, and e-Way bill integration | [FEAT][IND] | 🔴 | 3 days |
| 3.12 | **TDS Returns (Form 26Q / 24Q)** — aggregate quarterly TDS on vendor payments (26Q) and salary (24Q); generate NSDL-compliant FVU file for upload to TRACES | [FEAT][IND] | 🔴 | 3 days |
| 3.13 | **UPI / Razorpay payment collection** — generate UPI QR code and payment link on customer invoices; Razorpay/PayU webhook marks invoice as paid on successful payment; auto-reconcile in AR | [FEAT][IND] | 🔴 | 2 days |

### Workstream: Accounting Foundation

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 3.14 | **Chart of Accounts (COA)** — hierarchical account structure (Assets, Liabilities, Equity, Income, Expense); pre-seeded with India standard accounts; admin can add custom accounts | [FEAT] | 🔴 | 2 days |
| 3.15 | **Journal Entries & General Ledger** — double-entry bookkeeping engine; every financial transaction creates a journal entry (debit + credit); General Ledger view per account | [FEAT] | 🔴 | 4 days |
| 3.16 | **Trial Balance** — auto-computed from journal entries; closing balance per account; balanced check | [FEAT] | 🔴 | 1 day |
| 3.17 | **Balance Sheet** — auto-generated from COA; Assets = Liabilities + Equity; period-selectable | [FEAT] | 🔴 | 2 days |
| 3.18 | **Profit & Loss Statement** — auto-generated from income/expense accounts; period comparison (month vs. prior month, YTD vs. prior YTD) | [FEAT] | 🔴 | 2 days |
| 3.19 | **Bank Reconciliation** — import bank statement (CSV/OFX from Indian banks: HDFC, ICICI, SBI, Axis, Kotak); auto-match transactions to journal entries; flag unmatched | [FEAT] | 🔴 | 3 days |
| 3.20 | **Multi-currency support** — foreign currency invoices/payments; exchange rate management; realised/unrealised forex gain/loss journal entries | [FEAT] | 🔴 | 2 days |
| 3.21 | **Recurring invoices** — schedule auto-generation of invoices at defined intervals (weekly/monthly/quarterly/annual); supports SaaS subscription billing | [FEAT] | 🟠 | 1 day |
| 3.22 | **Fixed Asset Register with depreciation** — register fixed assets with purchase cost, date, useful life; compute monthly depreciation per Companies Act Sch II (SLM/WDV rates); post depreciation journal entries | [FEAT][IND] | 🟠 | 2 days |
| 3.23 | **Cash Flow Statement** — indirect method: net profit ± working capital changes ± investing ± financing; period-selectable | [FEAT] | 🟠 | 2 days |

### Workstream: Procurement Compliance

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 3.24 | **RFQ (Request for Quotation) module** — raise RFQ against a PR; send to minimum 3 vendors (email or portal); vendors submit quotes; buyer reviews all quotes | [FEAT] | 🔴 | 3 days |
| 3.25 | **Comparative Statement** — side-by-side comparison of vendor quotes (unit price, tax, total, delivery date, terms); recommend lowest or best-value vendor | [FEAT] | 🔴 | 1 day |
| 3.26 | **TDS Form 26Q for vendor payments** — from `vendor_payments` table, compile quarterly 26Q return (challan details, deductee PAN, section-wise breakdown); generate NSDL FVU | [FEAT][IND] | 🔴 | 2 days |

### Workstream: Legal & Secretarial Compliance

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 3.27 | **DPDP Act 2023 compliance module** — data processing register, consent management, data subject rights (access/correction/erasure), 72-hour breach notification workflow, DPO appointment; mapped to GRC | [FEAT][IND] | 🔴 | 4 days |
| 3.28 | **ESOP vesting schedule tracker** — per-employee ESOP grant with cliff + vesting schedule (monthly/quarterly); exercise window; exercised vs. lapsed shares; linked to Secretarial share capital | [FEAT][IND] | 🔴 | 3 days |
| 3.29 | **Cap table management** — shareholder register with equity class (equity/preference/CCPS/warrants/SAFE/CCD); dilution calculator on new round; waterfall analysis | [FEAT][IND] | 🔴 | 4 days |
| 3.30 | **Aadhaar/PAN e-Sign integration** — integrate with eMudhra / Digio / Leegality for Aadhaar-based e-signing of contracts and board resolutions (IT Act 2000 compliant) | [FEAT][IND] | 🔴 | 3 days |
| 3.31 | **DSC-based signing workflow** — director DSC token → sign resolutions and MCA filings digitally; track DSC expiry + renewal in secretarial module | [FEAT][IND] | 🔴 | 2 days |
| 3.32 | **MCA XML auto-generation** — from secretarial data, auto-draft MGT-7A, AOC-4, DIR-12 in MCA-compatible XML; download for portal upload | [FEAT][IND] | 🔴 | 4 days |
| 3.33 | **CERT-In 6-hour incident reporting** — on P1 security incident creation, trigger CERT-In mandatory report workflow: collect required fields (affected systems, attack type, timeline), generate report, track submission | [FEAT][IND] | 🔴 | 1 day |

**Phase 3 Deliverable:** NexusOps becomes the deepest India-compliance platform in the SMB market. Finance teams can file GST returns. HR can file PF/ESI. Legal can e-sign contracts. Secretarial can file MCA forms. No other SMB tool at this price point covers this.

---

## Phase 4 — India-First Integrations & Channels (Weeks 12–16)
**Goal:** Connect NexusOps to the channels and services that Indian SMBs actually use daily
**Duration:** 4 weeks

### Workstream: WhatsApp Business Platform

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 4.1 | **WhatsApp for IT Support** — incoming WhatsApp messages to a business number auto-create tickets; ticket updates sent as WhatsApp messages to requester; agent can reply from ticket detail | [FEAT][IND] | 🔴 | 4 days |
| 4.2 | **WhatsApp for HR** — employees message HR queries to a WhatsApp bot; Virtual Agent handles common queries (leave balance, payslip, holiday list); escalates to HR case | [FEAT][IND] | 🔴 | 2 days |
| 4.3 | **WhatsApp for CRM** — sales reps engage leads via WhatsApp; conversation logged to CRM contact; send quotes via WhatsApp; WhatsApp template messages for follow-ups | [FEAT][IND] | 🔴 | 2 days |
| 4.4 | **WhatsApp OTP / notifications** — system notifications via WhatsApp (approval pending, ticket assigned, invoice due) as alternative to email; user preference per-channel | [FEAT][IND] | 🟠 | 1 day |

### Workstream: India Payment Infrastructure

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 4.5 | **Razorpay integration** — create Razorpay payment links and UPI QR codes from invoices; webhook receiver marks invoice paid + posts payment journal entry; supports UPI, NEFT, IMPS, cards | [FEAT][IND] | 🔴 | 3 days |
| 4.6 | **NEFT/RTGS payment instruction export** — from AP payment run, generate bank file (NEFT/RTGS format: HDFC, ICICI, SBI, Axis) for bulk vendor payments | [FEAT][IND] | 🟠 | 2 days |
| 4.7 | **Direct bank statement import** — import transactions from Indian bank CSV/Excel formats (HDFC, ICICI, SBI, Axis, Kotak, Yes Bank) for bank reconciliation | [FEAT][IND] | 🔴 | 2 days |

### Workstream: CRM Channels

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 4.8 | **Email integration for CRM** — connect Gmail/Outlook inbox to CRM; emails to/from a contact auto-log in the activity timeline; reply from deal view | [FEAT] | 🔴 | 3 days |
| 4.9 | **IndiaMART / JustDial / Sulekha lead import** 🇮🇳 — API or CSV import of leads from major India B2B portals; auto-create lead records with source attribution | [FEAT][IND] | 🔴 | 2 days |
| 4.10 | **Missed-call auto-SMS** 🇮🏻 — when a lead calls the sales number and the call is missed, auto-send an SMS (via MSG91/Exotel) with a callback link or WhatsApp message | [FEAT][IND] | 🔴 | 1 day |
| 4.11 | **Meeting scheduler** (Calendly-style) — shareable booking link per sales rep; slots based on calendar availability; auto-creates activity in CRM on booking | [FEAT] | 🟠 | 2 days |
| 4.12 | **Invoice from won deal** — when a CRM deal moves to "Closed Won", one-click creates a customer invoice in the Financial module with line items from the quote | [FEAT] | 🔴 | 1 day |
| 4.13 | **Product/Service catalog** — shared catalog of products/services with price, tax code, HSN/SAC; used in CRM quotes and Finance invoices consistently | [FEAT] | 🟠 | 2 days |
| 4.14 | **Email sequences** — configure automated follow-up email series (Day 0, Day 3, Day 7) triggered on lead creation or deal stage change | [FEAT] | 🟠 | 2 days |

### Workstream: HR Integrations

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 4.15 | **Job portal publishing** — publish job requisitions to Naukri, LinkedIn Jobs, Indeed India via their posting APIs; track applications per source | [FEAT][IND] | 🟠 | 3 days |
| 4.16 | **Background Verification (BGV) integration** 🇮🏻 — integrate with AuthBridge or IDfy API; trigger BGV check on offer acceptance; track status in candidate profile | [FEAT][IND] | 🟡 | 2 days |
| 4.17 | **Aadhaar e-KYC verification** 🇮🏻 — use UIDAI API / DigiLocker to verify Aadhaar number submitted by employee during onboarding | [FEAT][IND] | 🟠 | 2 days |
| 4.18 | **DigiLocker document pull** — allow employees to fetch verified documents (PAN card, Aadhaar, degree certs, driving licence) directly from DigiLocker into their HR profile | [FEAT][IND] | 🟠 | 2 days |
| 4.19 | **Biometric / geo-fence attendance** — integrate with Aadhaar-linked biometric devices (ZKTeco/eSSL common in India offices) or mobile GPS geo-fence for clock-in/out | [FEAT][IND] | 🟠 | 3 days |
| 4.20 | **SMS notifications** via Indian providers (MSG91, Textlocal) — for OTPs, payslip notifications, leave approvals; Indian number format, DLT-registered templates | [FEAT][IND] | 🟠 | 1 day |

### Workstream: CSM — Customer-Facing Layer

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 4.21 | **Customer self-service portal** — external-facing portal at `support.{org}.nexusops.com`; customers log in, raise cases, track status, view their invoice history | [FEAT] | 🔴 | 4 days |
| 4.22 | **Public knowledge base** — external help center with articles searchable by customers; linked from customer portal; article feedback (helpful / not helpful) | [FEAT] | 🟠 | 2 days |
| 4.23 | **Omnichannel inbox** — unified inbox aggregating support tickets from email, WhatsApp, live chat widget; agent sees all channels in one view | [FEAT] | 🔴 | 4 days |
| 4.24 | **Live chat widget** — embeddable JavaScript snippet for product/website; connects to CSM queue; agent responds from inbox | [FEAT] | 🟠 | 3 days |

**Phase 4 Deliverable:** NexusOps connects to WhatsApp (India's #1 channel), Razorpay (India's #1 payment), Indian job portals, bank statements, and DigiLocker. CRM teams can replace Zoho CRM. CSM teams have an external customer portal.

---

## Phase 5 — Startup-Specific Modules (Weeks 16–20)
**Goal:** Build the modules that are uniquely valuable for India startups that no other tool addresses
**Duration:** 4 weeks

### Workstream: Startup Compliance Dashboard

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 5.1 | **DPIIT Startup Registration tracker** 🇮🏻 — track DPIIT recognition status, certificate download, eligibility for tax benefits (Sec 80-IAC), fund/scheme applications | [FEAT][IND] | 🔴 | 2 days |
| 5.2 | **Angel tax compliance** 🇮🏻 — Sec 56(2)(viib) tracking; fair market value computation; Form 56 filing tracker; CBDT exemption application status | [FEAT][IND] | 🔴 | 2 days |
| 5.3 | **FEMA compliance** 🇮🏻 — foreign investment reporting (FC-GPR on equity issuance, FC-TRS on share transfer, ODI, ECB); due date calendar; RBI compliance tracker | [FEAT][IND] | 🔴 | 3 days |
| 5.4 | **SEBI LODR calendar** 🇮🏻 — for listed/about-to-list companies; quarterly results filing, board meeting notices, related-party disclosures, board diversity reporting | [FEAT][IND] | 🟡 | 2 days |
| 5.5 | **ROC startup-specific forms** 🇮🏻 — INC-20A (commencement), BEN-2 (beneficial ownership), DIR-2 (consent), MGT-14 (resolutions) with filing status and due-date alerts | [FEAT][IND] | 🟠 | 2 days |

### Workstream: UX Depth — Notification & Preferences

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 5.6 | **Per-event notification preferences** — for each notification trigger (ticket assigned, SLA breach, approval pending, comment on watched ticket, invoice due, leave approved), user chooses Always / Role-based / Never per channel (in-app / email / WhatsApp / SMS) | [UX][FEAT] | 🟠 | 2 days |
| 5.7 | **Keyboard shortcut system** — implement `Cmd/Ctrl+K` → global search focus; `N` → new record on list pages; `?` → shortcut reference modal; `Escape` → close panel/modal | [UX] | 🟠 | 1 day |
| 5.8 | **Recently visited** — track last 8 visited records per module in `localStorage`; show "Recently visited" section on platform dashboard | [UX] | 🟡 | 4h |
| 5.9 | **Dashboard widget customization** — drag-and-drop dashboard cards to reorder; show/hide individual KPI cards; state persisted per user in DB | [UX] | 🟡 | 2 days |
| 5.10 | **Column toggle on data tables** — gear icon → checkbox per column → visibility persisted per module in `localStorage` | [UX] | 🟡 | 1 day |

### Workstream: DevOps & Projects Depth

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 5.11 | **Live GitHub/GitLab webhook sync** — incoming webhooks for PR opened/merged, commit pushed, CI run completed; auto-link to linked ticket/story; show in DevOps pipeline view | [FEAT] | 🟠 | 3 days |
| 5.12 | **Story point estimation + sprint velocity** — add story points to tasks; burn-down chart per sprint; velocity trend over last 5 sprints | [FEAT] | 🟠 | 2 days |
| 5.13 | **Feature flag management** — create feature flags (boolean/percentage/user-list); used in DevOps for controlled rollouts; visible in APM application view | [FEAT] | 🟡 | 2 days |
| 5.14 | **Project templates** — pre-built templates (Product Launch, Sprint Planning, Bug Bash, Onboarding) with predefined tasks and milestones | [FEAT] | 🟡 | 1 day |
| 5.15 | **Roadmap view** — release-level timeline showing which features/epics land in which sprint/release | [FEAT] | 🟡 | 2 days |

### Workstream: CMDB & Asset Depth

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 5.16 | **CMDB visual topology** — React Flow graph rendering CI nodes and their relationships; pan/zoom; click node to see CI details; add/remove relationship from graph | [UX][FEAT] | 🟠 | 3 days |
| 5.17 | **Software metering** — track software usage per seat per month; highlight unused licenses for reclaim; alert when usage drops below 30% of purchased seats | [FEAT] | 🟡 | 2 days |
| 5.18 | **Asset depreciation** 🇮🏻 — per Companies Act Sch II; compute monthly depreciation for each asset; post depreciation journal entry; net book value report | [FEAT][IND] | 🟠 | 2 days |

### Workstream: GRC Depth

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 5.19 | **ISO 27001 control library** — pre-built Annex A control set; map risks and audit findings to controls; evidence attachment per control; readiness percentage | [FEAT] | 🟠 | 2 days |
| 5.20 | **SOC 2 Type II control library** — Trust Service Criteria (Security/Availability/Processing Integrity/Confidentiality/Privacy); map to existing controls; evidence collection | [FEAT] | 🟠 | 2 days |
| 5.21 | **Regulatory change management** — subscribe to regulatory feeds (MCA circulars, SEBI notifications, RBI guidelines, GST amendments); alert compliance team; link to impacted controls/policies | [FEAT] | 🟠 | 3 days |
| 5.22 | **Third-party vendor assessment portal** — external portal for vendors to self-complete risk questionnaire; results auto-populate vendor risk score in vendor master | [FEAT] | 🟡 | 2 days |

**Phase 5 Deliverable:** NexusOps is the only SMB tool with a comprehensive India startup compliance dashboard (DPIIT, FEMA, angel tax). Rich DevOps/Projects depth. CMDB visual graph. GRC control libraries.

---

## Phase 6 — Mobile App (Weeks 20–28)
**Goal:** Launch iOS and Android apps — non-negotiable for India SMB market penetration
**Duration:** 8 weeks
**Approach:** React Native (shared codebase) connecting to the existing tRPC API

### Workstream: Mobile Foundation

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 6.1 | Bootstrap React Native project in monorepo (`apps/mobile`) with Expo; configure tRPC client with shared `@nexusops/types` | [INFRA] | 🔴 | 3 days |
| 6.2 | Auth flows — login, signup, forgot password, SSO redirect, biometric unlock (Face ID / fingerprint) | [FEAT] | 🔴 | 3 days |
| 6.3 | Push notifications — FCM (Android) + APNS (iOS) integration; existing notification events trigger push | [FEAT] | 🔴 | 2 days |

### Workstream: Core Mobile Modules (MVP)

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 6.4 | **Mobile Ticket management** — list, detail, create, comment, resolve, assign | [FEAT] | 🔴 | 1 week |
| 6.5 | **Mobile Employee Self-Service** — payslip view, leave request (submit + approve), attendance clock-in/out with GPS, expense claim submission with camera receipt capture | [FEAT][IND] | 🔴 | 1 week |
| 6.6 | **Mobile Approvals** — notification → open approval → approve/reject with comment | [FEAT] | 🔴 | 3 days |
| 6.7 | **Mobile Virtual Agent** — chat-style interface for self-service IT and HR queries | [FEAT] | 🟠 | 3 days |
| 6.8 | **Mobile CRM** — view pipeline, log calls/meetings, add notes to deals; QR scan for business cards | [FEAT] | 🟠 | 1 week |
| 6.9 | **Mobile Notifications center** — all notifications, mark read, navigate to record | [FEAT] | 🔴 | 2 days |
| 6.10 | **Offline mode** — cache last-viewed tickets and approvals; submit queue when back online | [FEAT] | 🟡 | 1 week |

**Phase 6 Deliverable:** iOS + Android app covering the top 6 daily-use workflows: ticket support, leave/attendance, expense claims, approvals, CRM field sales, and notifications.

---

## Phase 7 — Differentiation & Beyond-Standard Features (Weeks 28–36)
**Goal:** Build the features that make NexusOps unique — things no other SMB tool does
**Duration:** 8 weeks

### Workstream: AI Agents

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 7.1 | **AI auto-resolution** — when ticket is created, AI checks knowledge base and previous similar resolved tickets; if confidence > 85%, sends auto-resolution suggestion to requester; requester confirms or escalates | [FEAT] | 🟠 | 2 days |
| 7.2 | **AI anomaly detection** — analyse ticket volume patterns; alert if spike in incident type (possible outage), spike in leave requests (possible team dissatisfaction), unusual procurement spend | [FEAT] | 🟠 | 3 days |
| 7.3 | **Context-aware Virtual Agent** — make the widget read `usePathname()` and show relevant quick actions per module; wire all scripted flows to live tRPC queries instead of hardcoded responses | [UX][FEAT] | 🟠 | 2 days |
| 7.4 | **AI contract review** — on contract upload, AI flags unusual/unfavorable clauses (non-standard IP assignment, unlimited liability, no limitation of liability, auto-renewal) with severity rating | [FEAT] | 🟡 | 3 days |
| 7.5 | **AI spend optimisation** — analyse procurement spend; recommend vendor consolidation, flag anomalous purchase amounts, identify duplicate orders | [FEAT] | 🟡 | 3 days |

### Workstream: ESG & Sustainability

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 7.6 | **ESG tracking module** — environmental KPIs (electricity, water, waste, carbon footprint); social KPIs (diversity ratios, training hours, community investment); governance KPIs (board diversity, policy compliance rate) | [FEAT] | 🟡 | 4 days |
| 7.7 | **ESG reporting** — GRI / BRSR (India Business Responsibility and Sustainability Report) format export | [FEAT][IND] | 🟡 | 2 days |

### Workstream: Innovation Management

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 7.8 | **Idea pipeline** — employees submit ideas; category tagging; voting/endorsement; management evaluation scores; funding decision workflow | [FEAT] | 🔵 | 3 days |

### Workstream: Employee Wellness

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 7.9 | **Pulse / wellness surveys** — weekly 3-question anonymous pulse survey; eNPS trend; burnout indicator (based on OT hours + survey scores); alert HR manager when team score drops | [FEAT] | 🟡 | 2 days |
| 7.10 | **Employee Assistance Program (EAP) directory** — list of EAP vendors/contacts (counsellors, legal aid, financial advisors); visible to all employees from Employee Portal | [FEAT] | 🔵 | 1 day |

### Workstream: Contractor & Gig Worker Management

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 7.11 | **Contractor onboarding** — separate contractor profile (no PF/ESI/TDS-as-salary); NDA/MSA e-sign; work order / SOW creation; monthly invoice management; TDS 194C deduction | [FEAT][IND] | 🟠 | 3 days |
| 7.12 | **Gig/freelancer payment** — track per-milestone payments; auto-generate payment release on milestone approval; TDS 194C challan | [FEAT][IND] | 🟠 | 2 days |

### Workstream: Platform Polish

| # | Task | Type | Priority | Effort |
|---|------|------|----------|--------|
| 7.13 | **Custom fields framework** — admin can add custom fields (text, number, date, select, multi-select, user lookup) to any entity (tickets, contacts, deals, employees, assets) without code changes | [FEAT] | 🟠 | 4 days |
| 7.14 | **Custom branding** — org-specific logo, primary colour, and favicon; visible on login page and all portal pages | [FEAT] | 🟡 | 1 day |
| 7.15 | **Whistle-blower hotline** — anonymous external reporting form (separate from investigations module); encrypted submission; auto-creates confidential investigation; no reverse trace to reporter | [FEAT][IND] | 🟡 | 2 days |
| 7.16 | **Multi-language support** — English + Hindi (`hi-IN`) as first two locales; i18n framework (`next-intl`); date/number/currency formatting per locale | [FEAT][IND] | 🟡 | 1 week |
| 7.17 | **Subscription & SaaS billing module** — recurring billing engine; customer subscriptions with plan + billing cycle; dunning (failed payment retry); MRR / ARR / churn analytics | [FEAT] | 🟠 | 1 week |

**Phase 7 Deliverable:** NexusOps is differentiated with AI agents, ESG, contractor management, custom fields, and full multi-language support. No direct SMB competitor has all of these at this price point.

---

## Summary Roadmap

```
Week  1      2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21-28  29-36
      │───────────────────────────────────────────────────────────────────────────────────────────────
Ph 0  ████████│
Ph 1         ████████████████████│
Ph 2                             ████████████████████████████████│
Ph 3                                                             ████████████████████████│
Ph 4                                                                                     ████████████│
Ph 5                                                             ─────────────────────── ████████████
Ph 6                                                                                                 ████████████████│
Ph 7                                                                                                                 ████████████████
```

---

## Progress Scorecard

| Phase | SMB Readiness After | Key Unlock |
|-------|--------------------|-----------:|
| Baseline (today) | 70/100 | Platform is live, India-compliant ITSM/HR/Finance core |
| After Phase 0 | 73/100 | No fake data, security hardened, professional |
| After Phase 1 | 79/100 | Charts in reports, shared components, paginated lists |
| After Phase 2 | 84/100 | Email-to-ticket, leave calendar, attendance, Gantt, onboarding |
| After Phase 3 | 90/100 | Full India statutory (GST returns, Form 16, PF/ESIC, double-entry accounting) |
| After Phase 4 | 93/100 | WhatsApp, Razorpay, CRM email, customer portal, job portals |
| After Phase 5 | 95/100 | Startup compliance, ISO/SOC2 control libraries, CMDB visual |
| After Phase 6 | 97/100 | Mobile app — India field workforce unlocked |
| After Phase 7 | 99/100 | AI agents, ESG, contractor management, custom fields |

---

## Total Effort Estimate

| Phase | Duration | Approx Dev Effort |
|-------|----------|------------------|
| Phase 0 — Hotfixes | Week 1 | ~20 dev-hours |
| Phase 1 — UX Foundation | Weeks 2–4 | ~8 dev-days |
| Phase 2 — Core SMB Features | Weeks 4–8 | ~25 dev-days |
| Phase 3 — India Compliance | Weeks 8–12 | ~35 dev-days |
| Phase 4 — India Integrations | Weeks 12–16 | ~30 dev-days |
| Phase 5 — Differentiators | Weeks 16–20 | ~20 dev-days |
| Phase 6 — Mobile App | Weeks 20–28 | ~40 dev-days |
| Phase 7 — Beyond-ERP | Weeks 28–36 | ~35 dev-days |
| **Total** | **~9 months** | **~215 dev-days** |

*All estimates assume a team of 2 full-stack engineers + 1 frontend engineer. Parallel execution across workstreams will compress calendar time.*

---

## Key Dependency Map

```
Phase 0 (hotfixes)
    └─► Phase 1 (shared components)
            └─► Phase 2 (feature builds use Phase 1 components)
                    ├─► Phase 3 (India compliance — independent workstreams)
                    ├─► Phase 4 (integrations — needs Phase 3 for payments/GST)
                    └─► Phase 5 (differentiators — needs Phase 2 UX foundation)
Phase 6 (mobile) — can start after Phase 3 API is stable; parallel to Phase 4/5
Phase 7 (beyond-ERP) — can start after Phase 4 integrations are live
```

---

## Definition of Done (per task)

A task is complete when:
1. ✅ Feature is fully wired to the tRPC API (no mock data, no static fallbacks)
2. ✅ RBAC enforced — only permitted roles can access/mutate
3. ✅ `onError` handler present on all mutations (sonner toast)
4. ✅ Loading state shown during data fetch
5. ✅ Empty state shown when no data exists (using `<EmptyState>` from Phase 1)
6. ✅ India-specific fields use ₹ and `en-IN` locale
7. ✅ Playwright E2E test added to the relevant test suite
8. ✅ `NexusOps_Complete_Build_Reference.md` updated to reflect new coverage
9. ✅ `NexusOps_Market_Gap_Analysis.md` gap status updated from ❌/⚠️ to ✅

---

*Document: NexusOps_Action_Plan.md*
*Version: 1.0 — April 5, 2026*
*Author: NexusOps Product & Engineering, Coheron*
*Sources: NexusOps_Market_Gap_Analysis.md · NexusOps_UIUX_Validation_Report.md · NexusOps_Complete_Business_Logic_v1.md*
*Next review: After Phase 2 completion — update status, re-prioritize based on customer feedback*
