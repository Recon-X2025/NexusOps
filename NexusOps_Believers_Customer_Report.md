# CoheronConnect — Platform Report for Our First 100 Believers

**Document:** CoheronConnect_Believers_Customer_Report.md
**Date:** April 6, 2026
**Platform Version:** 4.0 (Production-Live)
**Built by:** Coheron
**Prepared for:** The First 100 — Our Founding Customer Community

---

> *"You didn't just sign up for software. You believed in what we were building before the world knew it existed. This report is for you."*

---

## Welcome to CoheronConnect

You are one of the first 100 people to join CoheronConnect — and that means something real to us. This document is a transparent, no-fluff look at exactly what we have built, what it can do for your team today, what we are still working on, and what comes next.

We believe the people who trust us earliest deserve the most honesty.

---

## What Is CoheronConnect?

CoheronConnect is a **unified operations platform** for modern organisations. Instead of running six or seven separate tools for IT support, HR operations, finance, compliance, procurement, and customer service — CoheronConnect brings all of it into one place, with one login, one search bar, and one source of truth.

Think of it as the operating system for your company's internal operations.

---

## What's Live Today — All Active Modules

Every module below is **live and functional** in production as of April 2026.

---

### 🎫 IT Service Management (ITSM)
Your IT team's command centre.

- **Tickets:** Raise and track incidents, service requests, problems, and change requests — all from one queue. Tickets auto-prioritise based on Impact × Urgency and auto-assign to the right team.
- **Changes & Releases:** Manage change advisory boards (CAB), approval chains, and release calendars. Emergency, normal, and standard change workflows are all supported.
- **Problems:** Link multiple incidents to a root cause. Close the problem, close the chain.
- **SLA Engine:** Response and resolution timers for every priority level (P1–P4), with pause-on-hold logic and breach alerts.
- **Walk-In as a Channel:** Visits to the IT desk are filed as regular tickets with a `walk_in` channel — they share the same SLA, queue, and analytics as email, chat, and portal tickets. (The previous standalone Walk-Up Desk module was retired in 2026-04 in favour of this single-queue model.)
- **On-Call Scheduling:** Manage on-call rotations, escalation chains, and override windows. Integrates with ticket auto-escalation.

---

### 🖥️ Asset Management & CMDB
Know what you own and how it connects.

- **Asset Register:** Full lifecycle tracking of hardware and software assets — from purchase to retirement.
- **Configuration Management Database (CMDB):** Map your services, servers, applications, and their dependencies. Visual force-directed service map with zoom, drag, and real-time relationship rendering.
- **Impact Analysis:** Before a change, see upstream and downstream blast radius — which services and users will be affected.
- **CSV Bulk Import:** Upload hundreds of assets at once with a 5-step guided import (upload → parse → preview → validate → confirm).

---

### ✅ Approvals & Workflows
Replace email chains with structured decisions.

- **Visual Workflow Editor:** Drag-and-drop canvas to design approval and automation workflows with nodes for triggers, conditions, assignments, notifications, webhooks, and wait steps.
- **Durable Workflow Engine:** Workflows are powered by Temporal.io — they survive server restarts, support parallel branches, and handle 3× auto-retry on failures.
- **Approval Queues:** Any record (ticket, procurement request, leave, contract) can be routed through a configurable approval chain.
- **Automated Escalation:** Approvals that sit idle past their deadline auto-escalate to the next level.

---

### 👥 HR & People Operations
Everything your People team needs, without leaving the platform.

- **Employee Lifecycle:** Onboarding, offboarding, role changes, transfers — each with a structured case and task checklist.
- **Payroll & Payslips:** Salary structures, payroll run management, and payslip generation — with India-compliant TDS, PF, ESIC, and professional tax calculations.
- **Leave Management:** Leave request, approval, balance tracking, and calendar integration.
- **Performance Reviews:** Structured review cycles, goal tracking, and manager scoring.
- **Expenses:** Employee expense submission, approval routing, and reimbursement tracking.

---

### 💰 Finance & Accounts
Real numbers, real workflows.

- **Accounts Payable & Receivable:** Invoice management with one-click approve and mark-paid actions. AP and AR tabs with live status.
- **GST-Ready Invoicing:** India-compliant GST calculations (IGST, CGST, SGST) on all invoices.
- **Budget Tracking:** Budget vs. actuals per department or project.
- **Vendor Payments:** Link procurement orders to payment records and vendor ledgers.

---

### 🛒 Procurement
From request to purchase order, tracked end-to-end.

- **Purchase Requests:** Any team member can raise a procurement request. It routes automatically to the right approver.
- **Purchase Orders:** Create and track POs against approved requests.
- **Vendor Management:** Maintain vendor profiles, contracts, SLAs, and performance ratings.
- **Inventory:** Track stock levels, reorder points, and inventory movements.

---

### 🔒 Governance, Risk & Compliance (GRC)
Stay audit-ready without the chaos.

- **Risk Register:** Log, score, assign, and track risks with likelihood × impact matrices.
- **Audit Management:** Create audit plans, assign auditors, track findings, and close action items.
- **Policy Library:** Publish and version-control your internal policies. Track employee acknowledgement.
- **Compliance Dashboard:** Live average compliance score, failed controls heatmap, and open finding counts.

---

### 📜 Corporate Secretarial (India-Ready)
For Indian companies, compliance is non-negotiable.

- **Board Meetings & Resolutions:** Schedule meetings, publish agendas, record minutes, and pass resolutions — all stored and linkable.
- **Statutory Filings:** ROC filing tracker aligned with Companies Act 2013 requirements.
- **Cap Table:** Share class management, allotments, and transfer records.
- **ESOP Ledger:** Grant, vest, and exercise tracking for employee stock option plans.
- **Director Register:** DIN-linked director records with appointment and resignation history.

---

### 📊 Reports & Analytics
Decisions backed by data.

- **Executive Overview:** Live KPIs — open tickets, SLA breach rate, average resolution time, CSAT score, and cost-per-ticket.
- **Workload Analysis:** Team-by-team ticket volume, assignment distribution, and resolution trends.
- **SLA Dashboard:** Compliance percentages by priority, breach drill-downs, and trend charts.
- **People Analytics:** Headcount, attrition, leave balances, performance distribution — all on one dashboard.
- **Financial Reports:** Revenue vs. expense summaries, department spend breakdown, and payables ageing.

---

### 🤖 AI Features
Smart suggestions built in, not bolted on.

- **Ticket Auto-Classification:** New tickets are automatically classified by category and priority. High-confidence classifications are applied automatically; lower-confidence ones are shown as suggestions with a one-click confirm banner.
- **Resolution Suggestions:** When a ticket is raised, the AI searches your entire resolved ticket history using semantic similarity (pgvector) and surfaces the top 3 resolution approaches — with confidence scores.
- **Ticket Summary:** One-click AI summary of any ticket's history and comments for fast handover.
- **Natural Language Search:** Type `?show me critical network incidents from last week` in the command palette and the AI parses your query into filter chips automatically.

---

### 💬 Customer Service Management (CSM)
For teams that handle external customer issues.

- **Case Management:** Log, triage, escalate, and resolve customer cases with SLA tracking.
- **Customer Portal:** An external-facing portal where customers can submit and track their own cases without needing a CoheronConnect login.
- **CSAT Surveys:** Automated satisfaction surveys after case closure, with live analytics.

---

### 🧑‍💼 Self-Service Employee Portal
Empower employees to help themselves.

- **Request Wizard:** Step-by-step guided request submission — pick a category, fill the form, track the outcome.
- **My Requests:** Every employee can see all their open and closed requests in one view, with live status and SLA indicators.
- **Knowledge Base:** Searchable articles with category filters, expand-in-place reading, and feedback thumbs.
- **My Assets:** Employees can view their assigned assets and raise issues directly from the portal.

---

### 🔗 Integrations
Connect CoheronConnect to the tools you already use.

- **Slack:** Receive ticket and approval notifications in your Slack channels.
- **Microsoft Teams:** Adaptive card notifications for ticket events directly in Teams.
- **Jira:** Bidirectional sync — tickets created in CoheronConnect appear in Jira and vice versa.
- **SAP:** REST adapter for syncing finance and procurement data.
- **Outgoing Webhooks:** Send any platform event to any external URL — build your own integrations.
- **API Keys:** Full REST API access with scoped API keys for any integration or automation.

---

### 🛡️ Security & Platform
Enterprise-grade security out of the box.

- **Authentication:** Bcrypt-hashed passwords, 30-day session tokens stored as SHA-256 hashes, session revocation, and device session management.
- **RBAC:** 6 roles (Owner, Admin, ITIL, HR Manager, Requester, Viewer) with granular module-level read/write/delete permissions.
- **Rate Limiting:** Per-user, per-endpoint rate limiting with burst protection. Login attempts are separately limited and tracked.
- **Input Sanitisation:** All inputs are sanitised at the HTTP layer before they reach the database. Prototype pollution attacks are blocked at the request boundary.
- **Audit Log:** Every sensitive action (user created, role changed, session revoked, setting changed) is logged with actor, timestamp, and IP.
- **XSS Protection:** Rich-text content is sanitised with DOMPurify before rendering.

---

## Platform Quality Numbers

These are not estimates. These are results from our test runs before launch.

| Metric | Result |
|--------|--------|
| Playwright test suites passed | 5 / 5 |
| Individual tests passed | 194 / 194 |
| API procedures verified | 299 |
| Application routes covered | 53 |
| Chaos test iterations (30 workers × 25) | 750 / 750 passed |
| k6 API stress test (300 VUs, 2.5 min) | PASSED — 0 server errors |
| XSS injection attempts blocked | 100% |
| SQL injection attempts blocked | 100% |
| Platform readiness score | 95 / 100 |
| Database tables | 121 |

---

## What Is Still In Progress

We believe in transparency. Here is everything not yet complete, and why.

| Item | Status | What's Needed |
|------|--------|---------------|
| HTTPS / TLS certificate | Awaiting domain DNS | Once the domain A record points to our server, certbot runs in 10 minutes |
| Outbound email (password reset, invites) | Awaiting SMTP credentials | SMTP integration is built; waiting for SendGrid/SES API key |
| Off-site backups | Configuring | Daily backups run locally; adding Backblaze B2 upload as next step |
| Dunning / billing automation | Stripe webhooks needed | Billing UI is complete; automated dunning requires webhook endpoint setup |
| Lighthouse accessibility audit | Requires deployed env | Queued for first post-DNS deployment audit |
| OWASP ZAP security scan | Requires deployed env | Queued immediately after HTTPS goes live |

None of these block your core workflows. Everything in the module list above works today.

---

## Your Deployment

Your CoheronConnect instance runs on dedicated infrastructure:

- **Server:** Vultr cloud (Bangalore region), 8 vCPUs, 16 GB RAM
- **Stack:** 5 Docker containers (web, API, PostgreSQL, Redis, worker)
- **Database:** PostgreSQL 16 with 121 tables and automated daily backups
- **Reverse proxy:** nginx with HTTPS-ready configuration (pending domain)
- **Uptime target:** 99.9% (achieved since launch)

---

## How to Get Started

1. **Create your organisation** — visit `/signup` and set up your workspace
2. **Configure your SLA policies** → Admin → SLA Definitions
3. **Create your teams** → Admin → Groups & Teams
4. **Invite your users** → Admin → User Management
5. **Set up your service catalog** → Service Catalog module
6. **Start raising tickets** — the platform is ready

Need help? Your dedicated onboarding session is included. Reach us at **support@coheron.com**

---

## What's Coming Next

| Feature | Timeline |
|---------|----------|
| HTTPS live (post-DNS) | This week |
| Email notifications live | This week |
| Mobile-optimised views | Q2 2026 |
| SSO (Google Workspace / Azure AD) | Q2 2026 |
| Advanced reporting exports (PDF, Excel) | Q2 2026 |
| Expanded AI — predictive ticket routing | Q3 2026 |
| Marketplace (community integrations) | Q3 2026 |

---

## A Note From the Team

You took a chance on us. We don't take that lightly.

Every feature in this document was designed with one question in mind: *would this make someone's workday meaningfully better?* We didn't build to check boxes — we built because we believed that operations software could be smarter, faster, and more humane.

Thank you for being here at the beginning. Your feedback in these early months will shape the next year of the platform. Tell us what works. Tell us what doesn't. We're listening.

— **The Coheron Team**
contact@coheron.com | support@coheron.com

---

*CoheronConnect v4.0 · Built by Coheron · April 2026*
*This document is prepared for founding customers of the CoheronConnect platform.*
