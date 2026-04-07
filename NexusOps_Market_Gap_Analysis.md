# NexusOps — Market Gap Analysis
## Module Mapping vs ServiceNow, India ERP/SMB Market Leaders & Beyond-Standard Modules

**Document:** NexusOps_Market_Gap_Analysis.md
**Version:** 1.0
**Date:** April 5, 2026
**Audience:** Product, Engineering, Strategy
**Scope:** NexusOps as a Startup/SMB-first platform — primary target is companies of 10–500 employees in India; enterprise is a future horizon

---

## 1. Purpose

NexusOps is positioned to target the gap between full enterprise ERPs (SAP, Oracle, ServiceNow — priced at $100–$200+/user/month) and lightweight tools (Notion, Monday.com, Google Sheets). The goal is enterprise-grade workflow orchestration at startup/SMB pricing.

This document:
1. Maps each NexusOps module to its ServiceNow equivalent and names the dominant India-market competitor for that module
2. Rates **gap depth** — how far NexusOps lags market leaders in that module, scoped to startup/SMB needs (not enterprise)
3. Lists specific missing features that need to be built to reach parity with market leaders
4. Identifies modules that go **beyond standard ERPs** — differentiators NexusOps already has or should build
5. Captures **India-specific requirements** that most global competitors get wrong

---

## 2. Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Built and functional in NexusOps |
| ⚠️ | Partially built — missing depth or specific features |
| ❌ | Not built at all |
| 🇮🇳 | India-specific requirement |
| 🚀 | Beyond-standard ERP / differentiator |
| 🔴 | Critical gap — blocks real-world SMB usage |
| 🟠 | High priority gap |
| 🟡 | Medium priority — important for maturity |
| 🔵 | Low priority / future |

---

## 3. Module-by-Module Mapping & Gap Analysis

---

### 3.1 IT Service Management (ITSM)

**NexusOps Route:** `/app/tickets`, `/app/problems`, `/app/changes`, `/app/releases`
**ServiceNow Module:** ITSM (Incident, Problem, Change, Release)
**Primary India SMB Competitor:** Freshservice (Freshworks — Chennai-based, dominant in India SMBs)
**Secondary Competitors:** Zoho Desk (support-oriented), ManageEngine ServiceDesk Plus (Chennai/Zoho), Jira Service Management (Atlassian)

#### Current NexusOps Coverage
✅ Incidents, Service Requests, Problems, Changes (Standard/Normal/Emergency), Releases
✅ SLA engine (breach detection, escalation, priority-based response targets)
✅ India-compliant priority/urgency matrix
✅ CAB approval workflow (Normal/Emergency change sub-types)
✅ Activity log, comments (internal/public), watchlist
✅ AI summary + resolution suggestion per ticket

#### Gaps vs Freshservice (India SMB leader)

| Feature | Freshservice | NexusOps | Gap | Priority |
|---------|-------------|---------|-----|---------|
| Asset Discovery Agent (network scan → auto-populate CMDB) | ✅ | ❌ | No agent-based/agentless network discovery | 🟡 |
| AI auto-categorization on ticket creation | ✅ | ⚠️ AI classify exists but not auto-applied | Auto-classify on create | 🟠 |
| Agent Gamification (points, badges, leaderboard) | ✅ | ❌ | Engagement feature for SMB teams | 🔵 |
| Service Health Dashboard (real-time infra status) | ✅ | ⚠️ Events module covers AIOps | Needs public status page | 🟡 |
| Sandbox / Preview Environment | ✅ | ❌ | Test changes without affecting production | 🟡 |
| Mobile App (iOS + Android) | ✅ | ❌ | **Critical for field support** | 🔴 |
| Canned Responses / Quick Replies | ✅ | ❌ | Save reply templates for common issues | 🟠 |
| **Time Tracking per ticket** | ✅ | ❌ | Log hours spent on resolution | 🟠 |
| Parent-Child ticket linking | ✅ | ⚠️ Related tab exists, no hierarchy | Full parent-child with rollup | 🟡 |
| Merge Duplicate Tickets | ✅ | ❌ | Merge duplicate incidents | 🟠 |
| Ticket Templates | ✅ | ❌ | Pre-fill forms for common request types | 🟠 |
| **WhatsApp channel for ticket creation** 🇮🇳 | ✅ (via add-on) | ❌ | **Very high India relevance** | 🔴 |
| **Email-to-ticket inbound parsing** | ✅ | ❌ | Auto-create tickets from inbound emails | 🔴 |
| SLA calendar (exclude holidays + weekends) 🇮🇳 | ✅ | ⚠️ SLA engine exists, no holiday calendar | India public holiday calendar | 🟠 |
| Requester satisfaction rating (CSAT per ticket) | ✅ | ⚠️ CSAT via Surveys module | Auto-trigger CSAT after resolution | 🟡 |

---

### 3.2 IT Asset Management (ITAM / CMDB)

**NexusOps Route:** `/app/cmdb`, `/app/ham`, `/app/sam`
**ServiceNow Module:** ITAM (HAM + SAM), CMDB
**Primary India SMB Competitor:** ManageEngine AssetExplorer, Freshservice CMDB
**Secondary:** Zluri (SaaS management, Bangalore-based), Zylo, Torii

#### Current NexusOps Coverage
✅ CMDB topology view, CI records, relationship mapping
✅ Hardware Asset Management (assign, retire, lifecycle)
✅ Software Asset Management (licenses, seat tracking)

#### Gaps vs ManageEngine AssetExplorer

| Feature | Market Leader | NexusOps | Gap | Priority |
|---------|-------------|---------|-----|---------|
| Network-based asset discovery (WMI/SSH/SNMP) | ✅ | ❌ | Auto-populate assets from network scan | 🟠 |
| Agent-based discovery (Windows/Mac/Linux agents) | ✅ | ❌ | Continuous asset inventory | 🟠 |
| Software metering (usage tracking per license) | ✅ | ❌ | Reclaim unused licenses | 🟡 |
| License compliance alerting | ✅ | ⚠️ Basic seat count | Over/under-license alerts | 🟡 |
| Asset depreciation calculation 🇮🇳 | ✅ | ❌ | Straight-line/WDV per Companies Act | 🟠 |
| Barcode/QR scan for asset check-in/out | ✅ | ❌ | Physical asset management | 🟡 |
| Contract/warranty expiry alerts | ✅ | ⚠️ Contracts module but not linked to assets | Asset-contract link + expiry alerts | 🟠 |
| Purchase-to-retire full lifecycle with cost | ✅ | ⚠️ Lifecycle tabs exist | Procurement→asset link, actual cost tracking | 🟡 |

---

### 3.3 HR Service Delivery + Core HR

**NexusOps Route:** `/app/hr`, `/app/employee-portal`, `/app/recruitment`, `/app/people-analytics`
**ServiceNow Module:** HRSD
**Primary India SMB Competitors:** Keka HR (Hyderabad, dominant India SMB), Darwinbox (Hyderabad, mid-market), GreytHR (Bangalore, payroll-strong), HROne, Zoho People
**Secondary:** BambooHR (global), sumHR, Spine HR

#### Current NexusOps Coverage
✅ HR Cases (Benefit, Policy, Payroll, ER)
✅ Employee Onboarding/Offboarding workflows
✅ Lifecycle events (promotions, transfers, parental leave)
✅ India Payroll Engine (PF, ESI, PT, TDS — Old/New regime, 12-step run)
✅ Employee Self-Service (payslips, tax, leave, benefits, performance)
✅ Recruitment / ATS (requisitions, pipeline stages, interviews, offers)
✅ Workforce Analytics (/app/people-analytics)

#### Gaps vs Keka HR (India SMB leader)

| Feature | Keka HR | NexusOps | Gap | Priority |
|---------|---------|---------|-----|---------|
| **Attendance Management** (biometric/geo-fence integration) 🇮🇳 | ✅ | ❌ | Clock-in/out, shift management, OT | 🔴 |
| **India Holiday Calendar** (state + national) 🇮🇳 | ✅ | ❌ | Must-have for leave/payroll accuracy | 🔴 |
| **Leave Calendar + Team View** | ✅ | ❌ | Visual team leave calendar | 🔴 |
| **Expense Management** (travel + reimbursement) 🇮🇳 | ✅ | ❌ | Expense claims with receipt upload, approval | 🔴 |
| **Form 16 generation and download** 🇮🇳 | ✅ | ❌ | Mandatory annual TDS certificate | 🔴 |
| **ESIC Management** (contribution, returns) 🇮🇳 | ✅ | ❌ | Mandatory for organizations with <10L wages | 🔴 |
| **PF ECR challan generation** 🇮🇳 | ✅ | ⚠️ PF computed, no ECR output | ECR format for EPFO portal upload | 🔴 |
| **Full & Final Settlement** 🇮🇳 | ✅ | ❌ | Gratuity, notice period, dues computation | 🔴 |
| **Arrear Salary Calculation** 🇮🇳 | ✅ | ❌ | Retrospective salary revisions | 🔴 |
| **Professional Tax challan** 🇮🇳 | ✅ | ⚠️ PT computed, no challan output | State-wise PT return/challan | 🟠 |
| 360-Degree Performance Review | ✅ | ⚠️ Performance tab in Employee Portal | Full review cycle, ratings, calibration | 🟠 |
| OKR / Goal Management | ✅ | ❌ | Individual + team OKR tracking | 🟠 |
| **Succession Planning** | ✅ | ❌ | Identify and groom successors | 🔵 |
| Learning Management System (LMS) | ✅ | ❌ | Course library, completion tracking | 🟡 |
| **Job portal / career page** | ✅ | ❌ | Publish JDs to Naukri, LinkedIn, etc. 🇮🇳 | 🟠 |
| Interview scheduling with calendar integration | ✅ | ⚠️ Interview stage in ATS | Calendar sync (Google/Outlook), interviewer slots | 🟠 |
| Offer letter generation with templates | ✅ | ⚠️ Offer stage exists | PDF offer letter auto-generation | 🟠 |
| **Background Verification (BGV) integration** 🇮🇳 | ✅ | ❌ | AuthBridge / IDfy API integration | 🟡 |
| Employee directory with org chart | ✅ | ⚠️ Employee list exists | Visual org chart (hierarchy view) | 🟡 |
| **Gratuity exemption tax computation** 🇮🇳 | ✅ | ❌ | Sec 10(10): min(actual, 15/26×basic×years, ₹20L) | 🟠 |
| Mobile app with self-service | ✅ | ❌ | Critical for field/non-desk workers | 🔴 |
| **Aadhaar e-KYC verification** 🇮🇳 | ✅ | ⚠️ Aadhaar stored, not verified | API-based Aadhaar verification | 🟡 |

---

### 3.4 Finance & Accounting

**NexusOps Route:** `/app/financial`
**ServiceNow Module:** Financial Management (IT-focused)
**Primary India SMB Competitors:** Tally Prime (dominant), Zoho Books, Busy Accounting, QuickBooks India
**Secondary:** Odoo, ERPNext, RazorpayX (banking layer), ClearTax

#### Current NexusOps Coverage
✅ IT Budget (lines, YTD actuals, committed spend, forecast)
✅ Chargeback/Showback (IT cost allocation)
✅ CAPEX/OPEX tracking, depreciation
✅ Vendor invoice register
✅ Accounts Payable (aging, 3-way match, payment run)
✅ Accounts Receivable (aging, credit utilisation, collections)
✅ Full GST engine (CGST/SGST/IGST, ITC, e-Invoice, e-Way Bill)

#### Gaps vs Zoho Books / Tally Prime (India SMB leaders)

| Feature | Tally/Zoho Books | NexusOps | Gap | Priority |
|---------|-----------------|---------|-----|---------|
| **Double-Entry Bookkeeping / Journal Entries** | ✅ | ❌ | Foundation of accounting; no COA, no ledgers | 🔴 |
| **Chart of Accounts** | ✅ | ❌ | Account hierarchy (Assets/Liabilities/Income/Expense) | 🔴 |
| **Balance Sheet, P&L, Trial Balance** | ✅ | ❌ | Core financial statements | 🔴 |
| **Bank Reconciliation** (statement import/API) | ✅ | ❌ | Match bank statement to books | 🔴 |
| **Multi-currency support** | ✅ | ❌ | Essential for any company with USD invoices | 🔴 |
| **Recurring Invoices** | ✅ | ❌ | Auto-generate on schedule (SaaS subscriptions) | 🟠 |
| **TDS Returns (Form 26Q/24Q)** 🇮🇳 | ✅ | ❌ | Quarterly TDS return filing | 🔴 |
| **GSTR-1 / GSTR-3B auto-generation** 🇮🇳 | ✅ | ❌ | Monthly/quarterly GST return filing | 🔴 |
| **GSTR-2B reconciliation** 🇮🇳 | ✅ | ❌ | Match vendor invoices with GSTR-2B | 🟠 |
| **Multi-GSTIN support** 🇮🇳 | ✅ | ❌ | Pan-India companies with state-wise GSTINs | 🔴 |
| **Cash Flow Statement** | ✅ | ❌ | Direct/Indirect method | 🟠 |
| **Expense Management** (integrated with HR) | ✅ | ❌ | Employee reimbursement, receipt scanning | 🔴 |
| **UPI Payment collection** 🇮🇳 | ✅ (Razorpay) | ❌ | UPI QR on invoices for instant customer payment | 🔴 |
| **Razorpay/PayU payment gateway integration** 🇮🇳 | ✅ | ❌ | Online payment collection | 🔴 |
| **Budget vs Actuals variance report** | ✅ | ⚠️ IT Budget has variance | Cross-company budget vs actuals | 🟠 |
| **Project-wise P&L** | ✅ | ❌ | Cost center / project profitability | 🟡 |
| **Fixed Asset Register with depreciation** 🇮🇳 | ✅ | ❌ | Companies Act Sch II depreciation rates | 🟠 |
| Audit trail (who changed what in accounting) | ✅ | ⚠️ Global audit log exists | Finance-specific immutable audit trail | 🟡 |

---

### 3.5 Supply Chain & Procurement

**NexusOps Route:** `/app/procurement`, `/app/vendors`
**ServiceNow Module:** Sourcing & Procurement Operations
**Primary India SMB Competitors:** Zoho Inventory, Kissflow Procurement Cloud, Procol (India, Y Combinator-backed), Coupa (enterprise), Tradogram
**Secondary:** Odoo, ERPNext

#### Current NexusOps Coverage
✅ Purchase Requisitions with multi-level approval thresholds (India-specific ₹ amounts)
✅ Purchase Orders with supplier routing
✅ Goods Receipt, 3-Way Matching (PO ↔ GRN ↔ Invoice)
✅ Inventory/Parts with reorder policies
✅ Vendor master with GSTIN, PAN, TDS section, MSME flag
✅ MSME payment tracking (45-day rule)

#### Gaps vs Zoho Inventory / Procol

| Feature | Market Leader | NexusOps | Gap | Priority |
|---------|-------------|---------|-----|---------|
| **RFQ (Request for Quotation) module** | ✅ | ❌ | Send to 3+ vendors, collect quotes, compare | 🔴 |
| **Comparative Statement for vendor selection** | ✅ | ❌ | Side-by-side quote comparison | 🔴 |
| **Vendor Rating / Scorecard** | ✅ | ⚠️ Vendor Risk tab exists | Quantitative vendor performance rating | 🟠 |
| **Vendor Portal** (supplier self-service) | ✅ | ❌ | Vendors submit invoices, track POs themselves | 🟠 |
| **TDS on vendor payments — Form 26Q logic** 🇮🇳 | ✅ | ⚠️ TDS computed, no 26Q output | Quarterly Form 26Q challan + return | 🔴 |
| **Multi-warehouse / location inventory** | ✅ | ⚠️ Single location tracking | Multiple godowns / warehouses | 🟡 |
| **Barcode/SKU based inventory** | ✅ | ❌ | Product codes, SKUs, barcode tracking | 🟡 |
| **Bill of Materials (BOM)** | ✅ | ❌ | Manufacturing/assembly businesses | 🔵 |
| **Dropshipping / Back-to-back PO** | ✅ | ❌ | Direct supplier-to-customer fulfilment | 🔵 |
| **E-procurement marketplace integration** 🇮🇳 | ✅ | ❌ | GeM (Govt e-Marketplace), ONDC | 🔵 |
| Recurring/Standing POs | ✅ | ❌ | Auto-renew POs for regular vendors | 🟡 |
| Spend analytics by category/vendor | ✅ | ⚠️ Dashboard KPIs only | Deep spend cube — category, department, vendor | 🟠 |

---

### 3.6 CRM & Sales

**NexusOps Route:** `/app/crm`
**ServiceNow Module:** CRM & Sales
**Primary India SMB Competitors:** Zoho CRM (dominant India), Freshsales (Freshworks), LeadSquared (Delhi-based, strong India), HubSpot CRM (free tier popular)
**Secondary:** Salesforce (enterprise), Pipedrive, Kylas CRM (India startup)

#### Current NexusOps Coverage
✅ Pipeline (Kanban with stages)
✅ Accounts, Contacts, Leads, Activities, Quotes
✅ AI lead scoring (0–100), source tracking, campaign attribution
✅ Sales Analytics (pipeline funnel, revenue by stage, leaderboard)
✅ INR currency throughout

#### Gaps vs Zoho CRM / Freshsales

| Feature | Zoho CRM | NexusOps | Gap | Priority |
|---------|---------|---------|-----|---------|
| **Email integration** (send/receive emails within CRM) | ✅ | ❌ | Read+reply to emails inside deal view | 🔴 |
| **Email sequences / drip campaigns** | ✅ | ❌ | Automated follow-up email series | 🟠 |
| **WhatsApp Business API integration** 🇮🇳 | ✅ | ❌ | **Huge India usage** — WhatsApp as primary sales channel | 🔴 |
| **LinkedIn Sales Navigator integration** | ✅ | ❌ | Enrich contact from LinkedIn | 🟡 |
| **Meeting scheduler** (Calendly-style) | ✅ | ❌ | Booking link in emails | 🟡 |
| **Product catalog linked to quotes** | ✅ | ⚠️ Quote line items manual | Products/services catalog feeding into quotes | 🟠 |
| **Invoice generation from won deals** | ✅ | ❌ | CRM → Finance flow (deal won → invoice) | 🔴 |
| Marketing automation | ✅ | ❌ | Campaign management, lead nurturing | 🟡 |
| **Missed call auto-SMS** 🇮🇳 | ✅ (Indian CRMs) | ❌ | Missed call from lead → auto SMS reply | 🔴 |
| **Justdial / Sulekha / IndiaMART lead import** 🇮🇳 | ✅ (Indian CRMs) | ❌ | Major India B2B lead sources | 🔴 |
| Territory / Region management | ✅ | ❌ | Assign accounts by geography | 🟡 |
| Custom fields on all entities | ✅ | ❌ | User-defined fields for industry-specific data | 🟠 |
| Mobile CRM app | ✅ | ❌ | Field sales teams | 🔴 |
| Commission tracking | ✅ | ❌ | Sales rep commission computation | 🟡 |

---

### 3.7 Customer Service Management (CSM)

**NexusOps Route:** `/app/csm`
**ServiceNow Module:** CSM
**Primary India SMB Competitors:** Freshdesk (dominant India), Zoho Desk, Intercom (startups), Zendesk
**Secondary:** Kayako, HappyFox (Chennai-based)

#### Current NexusOps Coverage
✅ Customer Cases, Accounts, Contacts
✅ SLA by priority + customer tier (Gold auto-elevate)
✅ CSAT scoring, tier-based escalation
✅ India-specific compliance case type (DPDP data request)

#### Gaps vs Freshdesk (India market leader)

| Feature | Freshdesk | NexusOps | Gap | Priority |
|---------|---------|---------|-----|---------|
| **Customer portal / self-service** | ✅ | ❌ | External-facing customer support portal | 🔴 |
| **Omnichannel inbox** (email, chat, WhatsApp, social) | ✅ | ❌ | **All channels in one inbox** | 🔴 |
| **Live chat widget** | ✅ | ❌ | Embedded chat on product/website | 🟠 |
| **Knowledge Base for customers** (public) | ✅ | ⚠️ KB exists but internal only | Public-facing help center | 🟠 |
| **Ticket threading from email replies** | ✅ | ❌ | Email thread stays in one ticket | 🔴 |
| **SLA business hours** (exclude weekends + holidays) | ✅ | ⚠️ SLA exists, no business hours calendar | Business hours + India holiday calendar | 🟠 |
| **Child tickets / linked ticket groups** | ✅ | ❌ | Complex issue sub-tasks | 🟡 |
| **Customer health score** | ✅ | ⚠️ Account health field | Computed score from interactions + CSAT | 🟡 |
| **WhatsApp for customer support** 🇮🇳 | ✅ | ❌ | WhatsApp as support channel | 🔴 |

---

### 3.8 Legal & Governance

**NexusOps Route:** `/app/legal`, `/app/contracts`
**ServiceNow Module:** Legal Service Delivery
**Primary India Competitors:** SpotDraft (Bangalore, contracts), Leegality (e-sign + contracts), SeedLegals, LegalWiz, Vakilsearch, Kira Systems (enterprise)
**Secondary:** ContractPodAi, Ironclad, Icertis

#### Current NexusOps Coverage
✅ Legal Matter register (all matter types including M&A, Data Privacy)
✅ Confidential Investigations (ethics, fraud, whistleblower) with anonymity flags
✅ Contract Register, Wizard, Obligations, Renewals
✅ Legal KB (playbooks, templates, jurisdiction guides)

#### Gaps vs SpotDraft / Leegality (India)

| Feature | SpotDraft / Leegality | NexusOps | Gap | Priority |
|---------|---------------------|---------|-----|---------|
| **Aadhaar/PAN e-Sign integration** 🇮🏻 | ✅ | ❌ | Legally valid e-signing per IT Act 2000 | 🔴 |
| **DigiLocker document verification** 🇮🇳 | ✅ | ❌ | Verify identity docs from DigiLocker | 🟡 |
| **Legal expense / matter billing** | ✅ | ❌ | Track external counsel costs per matter | 🟠 |
| **Contract redlining / version comparison** | ✅ | ⚠️ Clause editor exists | Side-by-side diff, tracked changes | 🟠 |
| **AI contract review** (clause risk flagging) | ✅ | ❌ | AI identifies unfavorable clauses | 🟡 |
| **Convertible Note / SAFE tracking** 🇮🇳 | ✅ | ❌ | Startup-critical instrument tracking | 🔴 |
| **Cap table management** 🇮🇳 | ✅ (partial) | ❌ | Founder/investor equity, dilution | 🔴 |
| **Court hearing date tracker** 🇮🇳 | ✅ | ❌ | Litigation calendar with hearing dates | 🟠 |
| **External counsel portal** | ✅ | ❌ | Invite lawyers to matters, share docs | 🟡 |
| **DPDP Act 2023 compliance checklist** 🇮🇳 | ✅ | ❌ | India's new data protection law (2023) | 🔴 |

---

### 3.9 Corporate Secretarial & Governance

**NexusOps Route:** `/app/secretarial`
**ServiceNow Module:** No equivalent (NexusOps differentiator 🚀)
**Primary India Competitors:** CimplyFive (Bangalore, market leader), Corpstore, VakilSearch, MCA Portal (manual)

#### Current NexusOps Coverage
✅ Board meetings, resolutions, minutes
✅ MCA/ROC filing tracker (AOC-4, MGT-7A, INC-22A)
✅ Share capital, ESOP pool management
✅ Statutory registers (members, directors, charges)
✅ DIR-3 KYC automated workflow with penalty alerts
✅ India ROC/MCA compliance calendar with event-based forms

#### Gaps vs CimplyFive (India leader)

| Feature | CimplyFive | NexusOps | Gap | Priority |
|---------|-----------|---------|-----|---------|
| **MCA XML auto-generation for filings** 🇮🇳 | ✅ | ❌ | Auto-draft MCA-compatible XML for upload | 🔴 |
| **DSC-based digital signing** 🇮🏻 | ✅ | ⚠️ DSC expiry tracked, no signing workflow | Integrate DSC signing in resolution workflows | 🔴 |
| **XBRL tagging for AOC-4** 🇮🏻 | ✅ | ❌ | Mandatory for large companies | 🟠 |
| **SEBI LODR compliance calendar** 🇮🏻 | ✅ | ❌ | Listed company quarterly compliance | 🟡 |
| **Board effectiveness evaluation** | ✅ | ❌ | Annual board self-assessment | 🔵 |
| **Virtual Board Meeting** (video + resolution) | ✅ | ❌ | Online board meetings with e-voting | 🟡 |
| **Convertible instruments register** 🇮🏻 | ✅ | ❌ | CCDs, OCDs, warrants in statutory register | 🔴 |
| **Director DSC renewal workflow** 🇮🏻 | ✅ | ⚠️ Expiry tracked | Guided renewal process + CA linkage | 🟠 |
| **LLP compliance** (LLP-11, LLP-8) 🇮🏻 | ✅ | ❌ | Many Indian startups are LLPs | 🟠 |
| **ESOP vesting schedule and exercise tracker** 🇮🏻 | ✅ | ⚠️ ESOP pool tracked | Per-employee vesting cliff + schedule + exercise | 🔴 |

---

### 3.10 GRC — Governance, Risk & Compliance

**NexusOps Route:** `/app/grc`, `/app/compliance`
**ServiceNow Module:** IRM/GRC
**Primary India SMB Competitors:** VComply (Bangalore-based, India SMB leader), Diligent (enterprise), MetricStream (enterprise), Nuvepro, ComplyKart
**Secondary:** LogicGate, ServiceNow IRM (enterprise)

#### Current NexusOps Coverage
✅ Risk register with 5×5 heatmap (inherent vs residual)
✅ COSO-based audit findings (Criteria/Condition/Cause/Effect)
✅ Policy management, attestation
✅ BCP (RTO/RPO), vendor risk questionnaires
✅ Risk-based audit scheduling

#### Gaps vs VComply (India SMB leader)

| Feature | VComply | NexusOps | Gap | Priority |
|---------|---------|---------|-----|---------|
| **Regulatory change management** (track law amendments) | ✅ | ❌ | Alert when a law NexusOps maps to is amended | 🟠 |
| **SOC 2 Type II control library** | ✅ | ❌ | Pre-built SOC 2 control set + evidence mapping | 🟠 |
| **ISO 27001 control library** | ✅ | ❌ | Pre-built 27001 annex A controls | 🟠 |
| **DPDP Act 2023 data flow mapping** 🇮🏻 | ✅ | ❌ | India data protection compliance module | 🔴 |
| **Compliance calendar automation** | ✅ | ⚠️ Calendar tab exists | Auto-populate from regulatory database | 🟡 |
| **Third-party risk portal** (vendor self-assessment) | ✅ | ⚠️ Vendor risk tab exists | Vendor-facing portal to submit answers | 🟡 |
| **Cyber security incident response playbook** | ✅ | ⚠️ Security incidents exist | Structured NIST-based IR playbook | 🟠 |
| **CERT-In reporting** 🇮🏻 | ✅ | ❌ | 6-hour mandatory incident report to CERT-In | 🔴 |
| **IT Act 2000 / PDPA compliance module** 🇮🏻 | ✅ | ❌ | India-specific statutory IT compliance | 🟠 |

---

### 3.11 DevOps / Engineering Ops

**NexusOps Route:** `/app/devops`
**ServiceNow Module:** DevOps (Change Velocity)
**Primary Competitors:** GitHub (dominant), GitLab, Jira + Confluence, Azure DevOps, LinearApp (startups)
**Secondary:** Harness, CircleCI, ArgoCD

#### Current NexusOps Coverage
✅ CI/CD pipeline view, deployment records, DORA metrics
✅ Agile Kanban board (Sprint management)
✅ DORA (Deployment Frequency, MTTR, Change Failure Rate, Lead Time)
✅ Tool integrations (GitHub Actions, Jenkins, GitLab CI, Jira, Datadog, Snyk)

#### Gaps vs GitHub + Jira (dominant SMB stack)

| Feature | GitHub / Jira | NexusOps | Gap | Priority |
|---------|-------------|---------|-----|---------|
| **Live GitHub/GitLab webhook sync** | ✅ | ⚠️ Mock integration listed | Real-time PR + commit data in NexusOps | 🟠 |
| **Backlog / Story-point estimation** | ✅ | ⚠️ Agile board exists | Story points, sprint velocity, burndown chart | 🟠 |
| **Epic hierarchy** (Epic > Story > Task) | ✅ | ❌ | Multi-level work item hierarchy | 🟡 |
| **Roadmap / Timeline view** (Gantt) | ✅ | ❌ | Visual sprint/release roadmap | 🟠 |
| **PR review integration** | ✅ | ❌ | PR linked to tickets/stories | 🟡 |
| **On-call management** (separate module exists) | ✅ | ✅ (via /app/on-call) | Mostly covered | — |
| **Feature flag management** | ✅ | ❌ | Per-user/team flag toggles with rollout % | 🟡 |

---

### 3.12 Projects & Portfolio Management (PPM)

**NexusOps Route:** `/app/projects`
**ServiceNow Module:** Strategic Portfolio Management (SPM)
**Primary India SMB Competitors:** Asana, Monday.com, Basecamp, ClickUp, Zoho Projects, Notion (task-heavy)
**Secondary:** MS Project, Smartsheet, Jira (software teams)

#### Current NexusOps Coverage
✅ Portfolio view, project list, resource management, demand, Agile board

#### Gaps vs Monday.com / Asana (India SMB popular)

| Feature | Monday / Asana | NexusOps | Gap | Priority |
|---------|--------------|---------|-----|---------|
| **Gantt / Timeline chart** | ✅ | ❌ | Visual project timeline with dependencies | 🔴 |
| **Task dependencies** (FS/SS/FF links) | ✅ | ❌ | Predecessor-successor relationships | 🟠 |
| **Milestone tracking** | ✅ | ❌ | Named milestones with dates | 🟠 |
| **Time tracking on tasks** | ✅ | ⚠️ Time logging in business logic, no UI | Task-level time logging UI | 🟠 |
| **File attachments on tasks** | ✅ | ❌ | Attach documents to tasks | 🟠 |
| **Project templates** | ✅ | ❌ | Pre-built templates (product launch, etc.) | 🟡 |
| **Guest/client view** | ✅ | ❌ | Share project view with external clients | 🔵 |
| **Workload view** (capacity heat map) | ✅ | ⚠️ Resource tab | Visual workload per person | 🟡 |
| **Recurring tasks** | ✅ | ❌ | Repeating tasks on schedule | 🟡 |
| **Calendar view** | ✅ | ❌ | Calendar view of tasks/deadlines | 🟡 |

---

### 3.13 Knowledge Management

**NexusOps Route:** `/app/knowledge`
**ServiceNow Module:** Knowledge Management
**Primary India SMB Competitors:** Confluence (Atlassian), Notion, Guru, Document360, Helpjuice
**Secondary:** Slite, Tettra, HelpScout Docs

#### Current NexusOps Coverage
✅ KB article list, editor, AI suggested articles
✅ Knowledge base for internal and legal teams

#### Gaps vs Confluence / Notion (India SMB leader)

| Feature | Confluence / Notion | NexusOps | Gap | Priority |
|---------|-------------------|---------|-----|---------|
| **Rich text editor** (WYSIWYG with tables, embeds) | ✅ | ⚠️ Basic editor in clause-editor | Full rich text editor (Tiptap/ProseMirror) | 🟠 |
| **Nested page hierarchy** | ✅ | ❌ | Space > Section > Page > Sub-page | 🟡 |
| **Public knowledge base** (customer-facing) | ✅ | ❌ | External help center | 🟡 |
| **Article versioning + history** | ✅ | ❌ | Track edits, revert to prior version | 🟡 |
| **Full-text search within articles** | ✅ | ⚠️ Meilisearch global search | Article-specific full-text search | 🟡 |
| **Article analytics** (views, helpfulness rating) | ✅ | ❌ | Track which articles resolve tickets | 🟡 |
| **AI article suggestions from tickets** 🚀 | ✅ | ⚠️ Suggest Articles button exists | Auto-suggest based on ticket text | 🟡 |
| **Video embedding in articles** | ✅ | ❌ | Loom/YouTube embeds | 🔵 |

---

### 3.14 Service Catalog

**NexusOps Route:** `/app/catalog`, `/app/employee-center`
**ServiceNow Module:** Service Catalog + Employee Center
**Primary Competitors:** Freshservice Catalog, Jira Service Catalog, ServiceNow

#### Current NexusOps Coverage
✅ Catalog items, employee self-service portal, request tracking

#### Gaps vs Freshservice Catalog

| Feature | Freshservice | NexusOps | Gap | Priority |
|---------|------------|---------|-----|---------|
| **Dynamic form builder** (custom fields per catalog item) | ✅ | ❌ | Variable forms for different request types | 🔴 |
| **Multi-step approval workflow per item** | ✅ | ⚠️ Global approvals module | Per-item approval chain configuration | 🟠 |
| **Catalog item pricing** (chargeback) | ✅ | ❌ | Show cost per catalog item | 🟡 |
| **Fulfillment stages per item** | ✅ | ❌ | Track fulfilment progress step-by-step | 🟡 |
| **Featured / promoted items** | ✅ | ❌ | Highlight popular catalog items | 🔵 |

---

### 3.15 Facilities / Workplace

**NexusOps Route:** `/app/facilities`
**ServiceNow Module:** Workplace Service Delivery (WSD)
**Primary India SMB Competitors:** OfficeSpace Software, Robin, Envoy, SpaceIQ

#### Current NexusOps Coverage
✅ Buildings, rooms, space bookings, move requests, facility requests

#### Gaps vs OfficeSpace / Robin

| Feature | Market Leader | NexusOps | Gap | Priority |
|---------|-------------|---------|-----|---------|
| **Hot-desking / desk reservation map** | ✅ | ❌ | Floor plan visual with desk bookings | 🟡 |
| **Visitor management** | ✅ | ❌ | Pre-register visitors, print badges | 🟠 |
| **Cafeteria/meal ordering** 🇮🇳 | ✅ | ❌ | Popular in India corporate offices | 🔵 |
| **Meeting room display integration** (room panels) | ✅ | ❌ | Digital display showing room schedule | 🔵 |
| **Maintenance request tracking** (linked to assets) | ✅ | ⚠️ Facility requests exist | Link to CMDB asset for maintenance tracking | 🟡 |

---

## 4. Beyond-Standard ERP — Differentiators & Emerging Modules

These are capabilities that go beyond what standard ERPs offer and represent opportunities where NexusOps can stand out, particularly for India startups/SMBs.

### 4.1 Already Built (NexusOps Differentiators ✅ 🚀)

| Module | Why It's a Differentiator |
|--------|--------------------------|
| **India Payroll Engine** | Most global tools handle India payroll poorly. NexusOps built TDS (Old/New regime), PT, PF, ESI correctly |
| **India GST Engine** | Full CGST/SGST/IGST + ITC + e-Invoice + e-Way Bill — no global tool does this natively |
| **India ROC/MCA Compliance** | Corporate Secretarial with DIR-3 KYC, filing calendar, penalty alerts — unique in this category |
| **Unified ITSM + ERP** | Single platform covering IT ops + HR + Finance + CRM + Legal — no SMB tool does this at this price |
| **Walk-up Experience** | Physical service desk queue management — most SMB tools lack this |
| **AI Virtual Agent** | Embedded bot that creates real tickets, queries real data — tRPC-connected |
| **Full GRC** | Risk matrix, COSO audit, BCP — enterprise GRC in an SMB-priced tool |

### 4.2 India-Specific Modules to Build (🚀 High Opportunity)

| Module | Description | Target User | Priority |
|--------|------------|------------|---------|
| **WhatsApp Business Integration** | Two-way WhatsApp for IT support, HR queries, CSM | All SMBs in India | 🔴 |
| **UPI/Razorpay Collection** | UPI QR on invoices, payment auto-reconciliation | Finance teams | 🔴 |
| **Startup Compliance Dashboard** 🇮🏻 | DPIIT startup registration, FEMA compliance, angel tax tracking (56(2)(viib)) | Early-stage startups | 🔴 |
| **Cap Table Management** 🇮🏻 | Convertible notes, SAFEs, equity splits, waterfall analysis | Funded startups | 🔴 |
| **India Holiday & Leave Calendar** 🇮🏻 | State-wise public holiday calendar driving leave, SLA, payroll | All companies | 🔴 |
| **Vendor e-Invoicing via IRP** 🇮🏻 | Direct IRP API integration for e-invoice generation/verification | Finance + Procurement | 🔴 |
| **DigiLocker Integration** 🇮🏻 | Pull verified documents (PAN, Aadhaar, degree certs) from DigiLocker | HR + Legal | 🟠 |
| **MSME Udyam Registration Tracker** 🇮🏻 | Track vendor MSME status, auto-alert on 45-day overdue | Procurement | 🟠 |
| **SMS OTP via Indian providers** 🇮🏻 | MSG91, Exotel, Textlocal for OTPs — not just email auth | Auth / HR | 🟠 |
| **Credit Bureau Integration** 🇮🏻 | CIBIL/Experian credit check on CRM accounts / CSM customers | CRM + Finance | 🟡 |
| **ONDC Commerce Integration** 🇮🏻 | Open Network Digital Commerce for procurement | Procurement | 🔵 |

### 4.3 Emerging / Next-Gen Modules (Future Roadmap)

| Module | Description | Competitive Relevance | Priority |
|--------|------------|----------------------|---------|
| **Inventory / Stock Ledger** | Full inventory accounting with FIFO/LIFO valuation | Bridges gap with Tally for trading companies | 🟠 |
| **Point of Sale (POS)** | Retail counter billing integrated with inventory | Retail SMBs | 🔵 |
| **Subscription & SaaS Billing** | Recurring billing, dunning, MRR analytics | SaaS startups | 🟠 |
| **ESG Tracking** | Environmental/Social/Governance KPI reporting | Growing compliance requirement | 🟡 |
| **Innovation Management** | Idea pipeline, evaluation, funding decisions | Enterprise culture feature | 🔵 |
| **Employee Wellness** | Mental health check-ins, pulse surveys, EAP | Post-COVID SMB need | 🟡 |
| **Contractor Management** | Gig worker onboarding, contracts, payments | India gig economy | 🟠 |
| **AI Agents (Autonomous Workforce)** | AI that auto-resolves tickets, auto-assigns, auto-escalates | Frontier differentiator | 🟡 |
| **Whistle-blower Hotline** | Anonymous complaint portal with SEBI/MCA linkage | GRC + Legal + HR | 🟡 |

---

## 5. Competitive Positioning Summary

### NexusOps vs. Key India Market Players — by Module

| Module | ServiceNow | Freshservice | Keka | Zoho Books | Tally | NexusOps Score |
|--------|-----------|------------|------|-----------|-------|---------------|
| ITSM | 100% | 95% | — | — | — | **82%** |
| ITAM/CMDB | 100% | 90% | — | — | — | **70%** |
| HR / HRMS | 85% | 70% | 95% | — | — | **65%** |
| Payroll 🇮🏻 | 40% | 50% | 95% | — | 90% | **75%** |
| Finance/Accounting | 70% | — | — | 90% | 95% | **35%** |
| Procurement | 90% | — | — | 80% | — | **70%** |
| CRM & Sales | 75% | 85% | — | 60% | — | **65%** |
| CSM | 95% | 90% | — | — | — | **60%** |
| Legal | 85% | — | — | — | — | **70%** |
| GRC | 100% | — | — | — | — | **75%** |
| Corporate Secretarial 🚀 | — | — | — | — | — | **80%** |
| DevOps | 80% | 65% | — | — | — | **70%** |
| Projects/PPM | 85% | — | — | — | — | **65%** |
| Knowledge | 85% | 80% | — | — | — | **60%** |

### Where NexusOps Wins Today
1. **Breadth** — No other SMB tool covers ITSM + HR + Finance + Legal + GRC + CRM + DevOps in one platform
2. **India compliance depth** — GST engine, payroll engine, ROC/MCA calendar, MSME tracking — better than most global tools
3. **Corporate Secretarial** — Unique in SMB market; no direct competitor at this price point
4. **Unified RBAC** — One permission model across all 30+ modules

### Where NexusOps Must Close Gaps to Win SMBs
1. **Finance/Accounting** — Without double-entry bookkeeping and bank reconciliation, CFOs cannot replace Tally/Zoho Books
2. **Mobile App** — Non-negotiable for field support, HR self-service, and CRM in India
3. **WhatsApp Integration** — India's primary business communication channel
4. **Attendance + Leave Calendar** — No HR team will adopt without this
5. **Email-to-ticket** — Most ITSM replacements require this as day-1 feature
6. **Gantt chart for Projects** — Monday.com/Asana users expect this

---

## 6. Top 20 Gaps to Build for SMB Market Readiness

In priority order:

| # | Gap | Module | Impact |
|---|-----|--------|--------|
| 1 | WhatsApp Business API (support + sales + HR) | ITSM / CRM / HR | Removes #1 India SMB objection |
| 2 | Mobile App (iOS + Android) | All | Non-negotiable for India field workforce |
| 3 | Email-to-ticket inbound parsing | ITSM | Day-1 requirement for any support tool |
| 4 | India Holiday Calendar (state-wise) | HR / ITSM / CSM | Drives leave, SLA, payroll accuracy |
| 5 | Attendance Management | HR | Keka/Darwinbox primary killer feature |
| 6 | Form 16 generation | HR Payroll | Mandatory annual statutory requirement |
| 7 | Double-entry accounting / Chart of Accounts | Finance | CFO adoption blocker |
| 8 | Bank Reconciliation | Finance | CFO adoption blocker |
| 9 | GSTR-1 / GSTR-3B return generation | Finance | Monthly statutory requirement |
| 10 | UPI/Razorpay payment collection on invoices | Finance / CRM | India payment reality |
| 11 | RFQ + Comparative Statement | Procurement | Procurement team adoption blocker |
| 12 | Customer-facing support portal | CSM | Freshdesk core feature |
| 13 | Cap Table Management | Legal / Secretarial | Critical for funded startups |
| 14 | DPDP Act 2023 compliance module | GRC / Legal | Regulatory requirement from 2024 |
| 15 | Gantt Chart / Timeline view | Projects | Monday/Asana migration blocker |
| 16 | Email integration in CRM (send/receive) | CRM | Zoho CRM core feature |
| 17 | Expense Management (travel + reimbursement) | HR / Finance | Keka + Zoho Expense feature |
| 18 | ESOP vesting schedule + exercise tracker | HR / Secretarial | Every funded startup needs this |
| 19 | Aadhaar e-Sign for contracts | Legal | Legally valid e-signing in India |
| 20 | Startup compliance dashboard (DPIIT, FEMA, angel tax) | GRC / Secretarial | Unique India differentiator |

---

*Document: NexusOps_Market_Gap_Analysis.md*
*Version: 1.0 — April 5, 2026*
*Author: NexusOps Product & Engineering, Coheron*
*Review: This document must be updated every time a new module is built or a major gap is closed*
