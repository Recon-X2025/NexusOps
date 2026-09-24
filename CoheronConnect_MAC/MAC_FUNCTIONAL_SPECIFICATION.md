# CoheronConnect Master Admin Console (MAC) — Functional Specification & Developer Blueprint

**Version:** 1.0  
**Target Environment:** Internal Platform Staff Control Plane (`apps/mac` & `CoheronConnect_MAC`)  
**Backend:** Fastify + tRPC (`apps/api` with `MAC_ENABLED=true`)  
**Database:** PostgreSQL (`@coheronconnect/db` with RLS bypass via internal `macProcedure`)

---

## 1. Executive Summary & Architectural Invariants

### 1.1 Separation of Concerns
1. **No Customer Tenant Modules in MAC Sidebar**: Tenant workflows (`HRMS`, `Payroll`, `ITSM`, `CRM`, `Finance`, `Procurement`, `Documents`) exist exclusively in the tenant portal (`apps/web`). Super Admin controls them only via **Entitlements**, **Feature Flags**, **Health Monitoring**, and **Audited Impersonation**.
2. **Strict Impersonation Protocol**:
   - Time-boxed (15, 30, or 60 min).
   - Mandatory reason (minimum 10 characters).
   - Audit trail recorded at start and auto-expired at end.
   - Persistent banner visible in tenant portal: `⚠ IMPERSONATION MODE — [Organization Name] — Logged as [Operator Email]`.
3. **Compliance Control Tower (Oversight Only)**:
   - Super Admin does **NOT** file taxes or process individual employee statutory records.
   - Super Admin monitors filing health across tenants (GST, TDS, EPF, ESI, MCA), tracks overdue penalty exposure, triggers automated compliance sweeps, and sends formal escalation notices to tenant compliance officers.
4. **Platform Operator RBAC**:
   - Operators reside in `super_admin_users` and `super_admin_roles` (separate from tenant `users`).
   - `super_admin` role possesses immutable root access (`isSuperAdmin ? true : allowed`).

---

## 2. Global Information Architecture & Sidebar Navigation

```text
┌──────────────────────────────────────────────────────────────┐
│ COHERONCONNECT MASTER ADMIN CONSOLE (MAC)                    │
├──────────────────────────────────────────────────────────────┤
│ 📊 PLATFORM                                                  │
│    └── Dashboard                     (/)                     │
│                                                              │
│ 🏢 TENANT MANAGEMENT                                         │
│    ├── Organizations                 (/tenants)              │
│    ├── Onboarding Monitor            (/setup-wizard-monitor) │
│    └── Global Users                  (/users/global)         │
│                                                              │
│ 🛡️ SECURITY & COMPLIANCE                                     │
│    ├── Compliance Oversight          (/compliance/statutory) │
│    ├── DPDP & Data Protection        (/compliance/dpdp)      │
│    └── Risk & GRC                    (/compliance/grc-risks) │
│                                                              │
│ 💳 SAAS MONETIZATION                                         │
│    └── Subscriptions & Billing       (/billing)              │
│                                                              │
│ ⚙️ PLATFORM OPERATIONS                                       │
│    ├── Operators & Roles             (/operators)            │
│    ├── Feature Flags                 (/feature-flags)        │
│    └── System Health & Queues        (/system-health)        │
│                                                              │
│ 📜 AUDIT & SUPPORT                                           │
│    ├── Audit Log                     (/audit-logs)           │
│    └── Impersonation Sessions        (/impersonations)       │
│                                                              │
│ 🔧 SYSTEM                                                    │
│    └── Settings                      (/settings)             │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Page-by-Page Functional Specification

---

### Page 1: Platform Dashboard (`/`)

* **Purpose**: Single-pane-of-glass executive overview for platform executives, engineering leads, and DevOps on tenant health, revenue, compliance risks, and system telemetry.
* **Top Metric Cards (KPIs)**:
  1. `Tenants Health`: Total Tenants, Active (green), Trialing (blue), Suspended (rose), Flagged (amber).
  2. `User Adoption`: Total Users across fleet, Active (last 24h), Invited, Pending.
  3. `SaaS Revenue`: Current MRR (₹ / $), ARR, Net Expansion, Churn Rate.
  4. `Compliance Risk Index`: Overdue Statutory Filings count, Penalty Exposure (₹), Active DPDP Breaches, Open DSRs near SLA.
  5. `Infrastructure Health`: Uptime (99.98%), API p99 Latency (14ms), Active Database Connections, Queue Depth.
* **Critical Alerts Panel**:
  - 🔴 `Statutory Filings Overdue`: List of top tenants with overdue MCA/GST filings and accumulated daily penalties.
  - 🔴 `DPDP Breaches Active`: Incidents requiring CERT-In/Board notification within the 72-hour window.
  - 🟠 `Stalled Onboardings`: Tenants stuck on Step 3 (India Compliance) or Step 5 (ITSM SLAs) for > 72 hours.
  - 🟡 `Trial Expirations`: Tenants expiring within 48 hours requiring sales/billing outreach.
* **Backend API Mapping**:
  - `trpc.mac.stats.useQuery()`
  - `trpc.mac.analyticsOverview.useQuery()`
  - `GET /super-admin/compliance/overview`
* **Permission Required**: `tenantsView`
* **Audit Event**: None (read-only view).

---

### Page 2: Organizations / Tenants Directory (`/tenants`)

* **Purpose**: Primary fleet management directory to search, inspect, provision, suspend, or impersonate any tenant organization on the platform.
* **Top Metric Cards**:
  - `Total Organizations` (e.g. 148)
  - `Active Subscriptions` (e.g. 122)
  - `Trial Organizations` (e.g. 21)
  - `Suspended / Locked` (e.g. 5)
* **Filters & Controls**:
  - Search input: Company name, tenant slug, GSTIN, or CIN.
  - Status filter: `All` | `Active` | `Trialing` | `Suspended` | `Flagged`.
  - Plan filter: `All` | `Free` | `Starter` | `Professional` | `Enterprise`.
  - Primary Action Button: `+ Provision Organization` (triggers New Tenant modal).
* **Table Columns**:
  1. `Organization`: Company Name + Slug + Industry.
  2. `Plan Tier`: Badge (`Free`, `Starter`, `Professional`, `Enterprise`) + Billing status.
  3. `Users Count`: Total active users enrolled.
  4. `Onboarding`: Progress bar + Step badge (Step 1-7 or `Completed`).
  5. `Compliance Status`: Badge (`Healthy`, `Due Soon`, `Overdue [X]`).
  6. `Status`: Badge (`Active` [green] vs `Suspended` [red] vs `Flagged` [amber]).
  7. `Created At`: Relative date (`3 days ago`, `2 months ago`).
  8. `Actions`: Dropdown menu (`View Details`, `Impersonate Admin`, `Edit Subscription`, `Toggle Suspend`, `Flag / Unflag`).
* **Modals & Drawers**:
  - **Modal: Provision Organization**:
    - Fields: `Company Name` (req), `Plan Tier` (req), `Admin Full Name` (req), `Admin Email` (req), `Industry` (opt), `Estimated Employees` (opt).
    - API: `trpc.mac.createOrganization.useMutation()`
    - Audit Event: `CREATE_ORGANIZATION`
  - **Modal: Emergency Tenant Suspension**:
    - Warning banner: "Suspending will immediately terminate all active sessions for this organization and block API access."
    - Mandatory Field: `Suspension Reason` (req, min 10 chars).
    - API: `trpc.mac.suspendOrganization.useMutation()` & `DELETE /super-admin/orgs/:id`
    - Audit Event: `SUSPEND_ORG`
* **Permission Required**: `tenantsView` (read), `tenantsSuspend` (suspend/activate), `impersonateTenant` (impersonation).

---

### Page 3: Tenant Detail Drawer (`/tenants/:id`)

* **Purpose**: Comprehensive 360-degree operational inspect-and-override pane for an individual tenant.
* **Drawer Tabs**:
  1. **Overview Tab**: Key metadata, Created date, Owner email, Domain/Slug, Primary address, Contact details.
  2. **Profile & Legal Entities**:
     - India statutory credentials: GSTIN, PAN, TAN, CIN, EPF Code, Primary State.
     - ITSM SLAs configuration: P1 (Hours), P2, P3, P4.
     - Action: `Override Legal Data` (allows Super Admin to correct bad GSTIN/PAN with validation).
  3. **Users Directory**:
     - Table of tenant users (Name, Email, Role, Status, Last Login).
     - Action: `Impersonate User` (select any active user to launch impersonated session).
     - Action: `Revoke All Sessions` (immediately logs out all tenant staff).
  4. **Module Entitlements**:
     - Toggle switches for platform modules:
       - `HRMS` (ON/OFF)
       - `Payroll` (ON/OFF)
       - `ITSM` (ON/OFF)
       - `CRM` (ON/OFF)
       - `Finance & Invoicing` (ON/OFF)
       - `Procurement` (ON/OFF)
       - `GRC & Compliance` (ON/OFF)
       - `Document Management` (ON/OFF)
       - `Command Center` (ON/OFF)
     - Logic: Defaulted by Plan Tier, but Super Admin can override modules as custom add-ons.
  5. **Feature Flags**:
     - Granular flags: `ai_features`, `advanced_workflows`, `sso`, `custom_branding`, `api_access`, `audit_export`.
     - Action: `Save Overrides` or `Reset to Plan Defaults`.
  6. **Subscription & Billing**:
     - Plan selector, Stripe Customer ID, Subscription Status (`active`, `past_due`, `canceled`, `trialing`), Trial End Date picker.
     - Override Reason input (mandatory).
  7. **Compliance Summary**:
     - Statutory filing status (GST, TDS, EPF, MCA), active penalties, open DSRs.
  8. **Audit Trail**:
     - Filtered audit log showing only changes made to this tenant by Coheron staff.
* **Backend API Mapping**:
  - `trpc.mac.getOrganization.useQuery({ id })`
  - `trpc.mac.listOrgUsers.useQuery({ orgId })`
  - `trpc.mac.getFeatureFlags.useQuery({ orgId })`
  - `trpc.mac.setFeatureFlag.useMutation()`
  - `trpc.mac.getBillingInfo.useQuery({ orgId })`
  - `trpc.mac.updateBillingInfo.useMutation()`
  - `PUT /super-admin/orgs/:orgId`
* **Permission Required**: `tenantsManage`

---

### Page 4: Onboarding / Setup Wizard Monitor (`/setup-wizard-monitor`)

* **Purpose**: Operational oversight of tenants moving through the 7-step onboarding process, with capability to unblock stalled customers via step data override.
* **Top Metric Cards**:
  - `Active Onboardings` (e.g. 34)
  - `Completed (Last 30d)` (e.g. 58)
  - `Stalled (> 48h)` (e.g. 8)
  - `Flagged for Ops Assistance` (e.g. 4)
* **7 Steps Tracked**:
  - `Step 1`: Welcome & Account Setup
  - `Step 2`: Organization Profile (Industry, Size, City, State)
  - `Step 3`: India Compliance & Statutory (GSTIN, PAN, CIN, TAN, EPF)
  - `Step 4`: Team Invitations & Admin Roles
  - `Step 5`: ITSM Configuration & SLA Hours (P1-P4)
  - `Step 6`: Finance & Payroll Configuration
  - `Step 7`: Launch Verification
* **Table Columns**:
  1. `Company Name`: Name + Slug.
  2. `Current Step`: Step number + Step name badge.
  3. `Completion %`: Visual progress bar (0% - 100%).
  4. `Status`: `Complete` (emerald), `In Progress` (blue), `Stalled` (amber), `Flagged` (rose).
  5. `Last Updated`: Relative timestamp.
  6. `Flag Details`: Assigned Ops Owner + Note.
  7. `Actions`: `Inspect Steps`, `Override Data`, `Flag / Unflag`, `Send Nudge Email`.
* **Modals & Actions**:
  - **Step Override Editor**:
    - Form fields rendered dynamically according to `STEP_FIELD_RULES` for the selected step.
    - Strict validation (e.g. GSTIN 15-char regex, PAN 10-char regex).
    - Mandatory Audit Log on save with before/after diff.
  - **Flag Organization**:
    - Fields: Reason dropdown (`Missing GSTIN documentation`, `SLA Configuration Error`, `Stalled at step 3`, `Custom`), Assigned Owner (Operator email), Note.
* **Backend API Mapping**:
  - `GET /super-admin/orgs` (with onboarding status and completedBy)
  - `PUT /super-admin/orgs/:orgId` (admin step update)
  - `POST /super-admin/orgs/:orgId/flag`
* **Permission Required**: `tenantsView` (view), `wizardOverride` (data override).

---

### Page 5: Global User Directory (`/users/global`)

* **Purpose**: Cross-tenant user intelligence tool. Allows ops and support to locate any user account across 100+ tenant organizations by email, name, or phone.
* **Top Metric Cards**:
  - `Total Provisioned Users` (e.g. 4,892)
  - `Active (30d)` (e.g. 3,921)
  - `Locked / Suspended` (e.g. 42)
  - `Invited / Pending Acceptance` (e.g. 189)
* **Search & Filter Controls**:
  - Live search input: Name, Email address, or Phone.
  - Filter: All Tenants | Select Specific Tenant.
  - Status filter: `Active` | `Invited` | `Suspended`.
* **Table Columns**:
  1. `User`: Avatar + Full Name + Email.
  2. `Tenant Organization`: Company Name (clickable link to Tenant Drawer).
  3. `Tenant Role`: `tenant_admin`, `hr_admin`, `it_admin`, `employee`, `finance_manager`.
  4. `Status`: Badge (`Active`, `Invited`, `Suspended`).
  5. `Last Login`: Timestamp + IP location.
  6. `Created Date`: Registration date.
  7. `Actions`: `View Tenant`, `Impersonate User`, `Revoke Sessions`.
* **Backend API Mapping**:
  - `trpc.mac.searchUsers.useQuery({ email })`
  - `trpc.mac.startImpersonation.useMutation()`
* **Permission Required**: `tenantsView`

---

### Page 6: Subscriptions & SaaS Monetization (`/billing`)

* **Purpose**: SaaS revenue management, tier entitlements, trial tracking, and billing overrides.
* **Top Metric Cards**:
  - `Monthly Recurring Revenue (MRR)`: Current value + % growth.
  - `Annual Recurring Revenue (ARR)`: Projected annualized run-rate.
  - `Active Paid Tenants`: Professional + Enterprise counts.
  - `Trial Conversion Rate`: % of trials converting to paid tiers.
  - `Past Due / Failed Payments`: Unpaid accounts requiring payment gateway retry.
* **Plan Tier Breakdown Cards**:
  - `Free Tier`: Count + User cap (5 users) + Modules enabled.
  - `Starter Tier`: Count + Pricing ($49/mo) + Workflows enabled.
  - `Professional Tier`: Count + Pricing ($199/mo) + AI + Custom branding.
  - `Enterprise Tier`: Count + Pricing ($499+/mo) + SSO + Dedicated SLAs.
* **Table Columns**:
  1. `Tenant`: Company Name + Slug.
  2. `Current Plan`: Badge (`Free`, `Starter`, `Professional`, `Enterprise`).
  3. `Status`: Badge (`Active`, `Trialing`, `Past Due`, `Canceled`).
  4. `Stripe Customer ID`: Linked ID.
  5. `Trial Ends At`: Date or `N/A`.
  6. `MRR Contribution`: Monthly value.
  7. `Actions`: `Change Plan / Override`, `Extend Trial`, `Sync Stripe`.
* **Modal: Subscription Override**:
  - Fields:
    - `Target Plan`: Select (Free / Starter / Professional / Enterprise).
    - `Subscription Status`: Select (Active / Trialing / Past Due / Canceled).
    - `Trial Expiry Date`: Datepicker (optional extension).
    - `Stripe Customer ID Override`: Text field.
    - `Override Reason`: Mandatory text (min 10 chars) explaining why plan was altered without direct checkout.
* **Backend API Mapping**:
  - `GET /super-admin/finance/overview`
  - `PUT /super-admin/finance/subscriptions/:orgId`
  - `trpc.mac.getBillingInfo.useQuery({ orgId })`
  - `trpc.mac.updateBillingInfo.useMutation()`
* **Permission Required**: `financeView` (inspect), `financeManage` (override).
* **Audit Event**: `OVERRIDE_SUBSCRIPTION` (captures old plan, new plan, reason).

---

### Page 7: Feature Flags Control Matrix (`/feature-flags`)

* **Purpose**: Platform-level and tenant-specific feature gatekeeper. Used for dark launches, enterprise custom rollouts, and beta testing.
* **Top Controls**:
  - Organization Selector: Choose specific tenant or view platform defaults.
  - Search flags: Search by flag key.
* **Flags Managed**:
  - `ai_features`: LLM copilot, smart triage, generative summaries.
  - `sso_saml`: Enterprise Single Sign-On (Okta, Azure AD, Google Workspace).
  - `custom_branding`: Tenant white-labeling, custom subdomains, logos.
  - `advanced_workflows`: Temporal multi-step approvals and orchestration.
  - `dpdp_suite`: Full DPDP 2023 consent logs and automated erasure sweeps.
  - `audit_export`: High-volume SIEM export and S3 audit sync.
  - `cross_org_reporting`: Multi-subsidiary analytics.
* **Table Columns**:
  1. `Flag Key`: Code identifier (e.g. `ai_features`).
  2. `Description`: Human-readable explanation.
  3. `Plan Default`: Default state for tenant's plan (`ON` / `OFF`).
  4. `Current Effective State`: Badge (`Enabled` / `Disabled`).
  5. `Override Status`: Badge (`Inherited from Plan` vs `Explicit Override`).
  6. `Toggle Action`: Switch toggle + `Reset to Default` button.
* **Backend API Mapping**:
  - `trpc.mac.getFeatureFlags.useQuery({ orgId })`
  - `trpc.mac.setFeatureFlag.useMutation()`
  - `trpc.mac.resetFeatureFlags.useMutation()`
* **Permission Required**: `tenantsManage`
* **Audit Event**: `SET_FEATURE_FLAG`

---

### Page 8: Compliance Oversight (Statutory Control Tower) (`/compliance/statutory`)

* **Purpose**: Cross-tenant regulatory monitoring across India statutory mandates (GST, TDS, EPF, ESI, MCA/ROC). Super Admin acts as a Control Tower to prevent systemic tenant compliance delinquency.
* **Top Metric Cards**:
  - `Critical Delinquencies`: Tenants with filings overdue > 30 days.
  - `Total Overdue Filings`: Count of unfiled statutory returns across all tenants.
  - `Filings Due This Week`: Upcoming deadlines across fleet.
  - `Total Platform Penalty Exposure`: Calculated ₹ exposure from late fees across delinquent tenants.
* **Category Health Breakdown**:
  - `GST (GSTR-1, GSTR-3B)`: Healthy (82) | Due Soon (12) | Overdue (4)
  - `TDS (24Q, 26Q)`: Healthy (91) | Due Soon (7) | Overdue (2)
  - `EPF (ECR Electronic Challan)`: Healthy (88) | Due Soon (4) | Overdue (5)
  - `ESI (Monthly Contribution)`: Healthy (95) | Due Soon (2) | Overdue (1)
  - `MCA / ROC (AOC-4, MGT-7)`: Healthy (73) | Due Soon (8) | Overdue (3)
* **Filters & Controls**:
  - Filter by Regulatory Body: `All` | `GST` | `TDS` | `EPF` | `ESI` | `MCA`.
  - Filter by Status: `All` | `Critical Overdue` | `Due Soon` | `Filed` | `Healthy`.
  - Primary Action Button: `+ Add Platform Statutory Deadline` (broadcasts a new government notification date to all tenants).
  - Secondary Action Button: `Export Delinquency Report (CSV)`.
* **Table Columns**:
  1. `Tenant Organization`: Company Name + State.
  2. `Statutory Return`: Return Name + Form (e.g. `GSTR-3B`, `MCA AOC-4`, `EPF ECR`).
  3. `Financial Period`: Financial Year + Month/Quarter (e.g. `FY 2025-26 · Q2`).
  4. `Statutory Due Date`: Standard government deadline.
  5. `Filing Status`: Badge (`Filed` [green], `Due Soon` [blue], `Overdue` [rose]).
  6. `Days Overdue`: Integer count (e.g. `+14 days`).
  7. `Accrued Late Fee Exposure`: Calculated ₹ amount based on daily statutory penalty.
  8. `Actions`:
     - `Inspect Tenant Compliance`: Opens Tenant Drawer -> Compliance tab.
     - `Send Nudge / Alert`: Dispatches email notification to tenant's Compliance Admin.
     - `Escalate to Legal`: Flags account as regulatory risk.
* **Modals & Actions**:
  - **Modal: Broadcast Statutory Deadline**:
    - Fields: `Compliance Type` (`annual` / `quarterly` / `monthly` / `event_based`), `Event Name`, `Form Name`, `Financial Year`, `Due Date`, `Daily Penalty Rate (INR)`.
    - API: `POST /super-admin/compliance/statutory-calendar`
  - **Modal: Dispatch Compliance Escalation Notice**:
    - Fields: Target tenant email, Subject template, Notice body, Severity (`Low Alert` / `Final Notice before Suspension`).
* **Backend API Mapping**:
  - `GET /super-admin/compliance/overview`
  - `GET /super-admin/compliance/statutory-calendar`
  - `POST /super-admin/compliance/statutory-calendar`
* **Permission Required**: `complianceView` (inspect), `complianceManage` (broadcast/escalate).

---

### Page 9: DPDP & Data Protection Oversight (`/compliance/dpdp`)

* **Purpose**: Oversight of India's Digital Personal Data Protection (DPDP) Act 2023 mandates across all customer organizations.
* **Top Metric Cards**:
  - `Active Data Breaches`: Breaches reported across tenants.
  - `Breaches Near 72h SLA`: Incidents with < 12h remaining to notify the Data Protection Board.
  - `Open DSR Requests`: Active Data Principal rights requests across fleet.
  - `DSRs Near 30d SLA`: Requests approaching statutory response deadline.
  - `Erasure Verification Queue`: Pending data deletion workflows requiring platform confirmation.
* **Tabs**:
  1. **Data Breach Incident Center**:
     - Tracks breach reports across all tenants.
     - Table Columns: `Tenant`, `Incident Title`, `Severity` (`Critical`, `High`, `Medium`, `Low`), `Affected Data Principals`, `Detected At`, `72h Notification Countdown Timer`, `Status` (`Detected`, `Assessing`, `Board Notified`, `Contained`, `Closed`), `Actions` (`View Report`, `Audit Sweeps`).
  2. **Data Subject Rights (DSR) Monitor**:
     - Tracks citizen requests across all tenants: Access, Correction, Erasure, Grievance, Nomination.
     - Table Columns: `Tenant`, `Principal Name / Masked ID`, `Request Type`, `Received Date`, `30-Day Due Date`, `Status` (`Verifying`, `In Progress`, `Fulfilled`, `Rejected`), `Actions` (`View Details`, `Nudge Tenant DPO`).
  3. **Automated Erasure & Retention Sweeps**:
     - Schedule and monitor background data purge jobs (deleting personal data past retention period).
     - Action Button: `Trigger Global DPDP Sweep Now`.
* **Backend API Mapping**:
  - `GET /super-admin/compliance/dpdp`
  - `POST /super-admin/compliance/dpdp/sweeps`
  - `POST /super-admin/compliance/dpdp/breach`
  - `PUT /super-admin/compliance/dpdp/breach/:id`
* **Permission Required**: `complianceView` (view), `complianceManage` (trigger sweeps/manage incidents).

---

### Page 10: Platform Risk & GRC Register (`/compliance/grc-risks`)

* **Purpose**: Platform-wide and cross-tenant operational risk register, tracking enterprise risk appetite, mitigations, and policy enforcement.
* **Top Metric Cards**:
  - `Critical Risks`: Count of Level 5/Critical risks.
  - `High Risks`: Count of Level 4 risks.
  - `Mitigation In Progress`: Risks actively being remediated.
  - `Unassigned Risks`: Risks missing a designated owner.
* **Table Columns**:
  1. `Risk ID`: Code (e.g. `RISK-019`).
  2. `Tenant / Platform Scope`: Tenant Name or `Platform-Wide Infrastructure`.
  3. `Risk Title`: Description of threat or vulnerability.
  4. `Category`: `Operational`, `Financial`, `Compliance`, `Security`, `Technology`, `Reputational`.
  5. `Inherent Score`: `Likelihood (1-5)` × `Impact (1-5)` = Risk Score (1-25) with color heat badge.
  6. `Treatment Strategy`: `Mitigate`, `Accept`, `Transfer`, `Avoid`.
  7. `Risk Owner`: Staff email.
  8. `Review Frequency`: `Monthly`, `Quarterly`, `Annual`.
  9. `Status`: `Identified`, `Assessed`, `Mitigating`, `Accepted`, `Closed`.
  10. `Actions`: `Edit Risk`, `Update Mitigation`, `Close Risk`.
* **Backend API Mapping**:
  - `GET /super-admin/compliance/risks`
  - `POST /super-admin/compliance/risks`
  - `PUT /super-admin/compliance/risks/:id`
* **Permission Required**: `complianceView`, `complianceManage`

---

### Page 11: Operators & Role Matrix (`/operators`)

* **Purpose**: Identity and Access Management (IAM) for Coheron internal staff. Controls who can access the Master Admin Console and what capabilities they possess.
* **Tabs**:
  1. **Operators List Tab**:
     - Top Action: `+ Add Operator` button.
     - Table Columns: `Operator Name`, `Email`, `Role Badge`, `Phone`, `Status` (`Active` [green] vs `Disabled` [gray]), `Last Login`, `Actions` (`Edit Operator`, `Reset Password`, `Disable / Enable`, `Delete`).
  2. **Role Capability Matrix Tab**:
     - System Roles: `Super Admin` (Rank 1, Immutable Root), `Operations Staff` (Rank 2), `Support Staff` (Rank 3), `Compliance Auditor` (Rank 4), plus Custom Roles.
     - Capability Matrix: 12-14 fine-grained capabilities with checkboxes.
     - Invariant: Super Admin checkboxes are permanently checked (`true`) and cannot be disabled.
* **Modals**:
  - **Modal: Add Operator**:
    - Fields: `Full Name` (req), `Email` (req), `Password` (req, min 8 chars), `Phone` (opt), `Assign Role` (dropdown of existing roles).
  - **Modal: Create Custom Operator Role**:
    - Fields: `Role Name`, `Description`, `Badge Color` (selector), `Permissions Map`.
* **Backend API Mapping**:
  - `GET /super-admin/operators`
  - `POST /super-admin/operators`
  - `PUT /super-admin/operators/:id`
  - `DELETE /super-admin/operators/:id`
  - `GET /super-admin/operator-roles`
  - `POST /super-admin/operator-roles`
* **Permission Required**: `operatorsManage` (Super Admin root only).
* **Audit Event**: `CREATE_OPERATOR`, `UPDATE_OPERATOR`, `DELETE_OPERATOR`, `UPDATE_ROLE_PERMISSIONS`.

---

### Page 12: System Health & Queues (`/system-health`)

* **Purpose**: Live technical telemetry for platform infrastructure, background job orchestrators, and database connection pools.
* **Service Status Cards**:
  1. `PostgreSQL Primary`: Connection pool count (e.g. 48/100), Active queries, p99 query latency (12ms), Health status (`Operational`).
  2. `Redis Cache & Queues`: Memory usage (34%), Hit ratio (98.2%), Evictions (0), Health status (`Operational`).
  3. `Temporal Workflow Engine`: Active running workflows (32), Completed (1,240), Failed/Stuck (0), Health status (`Operational`).
  4. `Meilisearch Engine`: Index status (All 3 indexes ready), Document count, Search latency (4ms), Health status (`Operational`).
  5. `Fastify API Server`: Event loop delay (1.2ms), Process RSS memory (310MB), Active HTTP connections.
  6. `Background BullMQ Workers`: Active jobs, Delayed jobs, Dead-Letter Queue (DLQ) count.
* **Dead-Letter Queue (DLQ) Actions**:
  - Table of failed background jobs (e.g. payroll batch calculation failure, webhook retry failure).
  - Actions: `Retry Job`, `Discard Job`, `Download Stack Trace`.
* **Backend API Mapping**:
  - `GET /super-admin/system/health`
  - `trpc.mac.stats.useQuery()`
* **Permission Required**: `systemHealth`

---

### Page 13: Immutable Audit Log (`/audit-logs`)

* **Purpose**: Forensic audit trail. Logs every privileged action executed across the control plane by any operator.
* **Top Metric Cards**:
  - `Total Logged Events` (All-time)
  - `Events (Last 24h)`
  - `Impersonation Events`
  - `Destructive Actions (Suspends / Deletions)`
* **Filters**:
  - Filter by Operator: Select operator email.
  - Filter by Tenant: Select organization.
  - Filter by Action Category: `All` | `Overrides` | `Suspensions` | `Impersonations` | `Role Changes` | `Flags`.
  - Date Range: Today | Last 7 Days | Last 30 Days | Custom.
  - Search: Full-text search across summary and JSON diff.
  - Action Button: `Export Audit Trail (JSON / CSV)`.
* **Table Columns**:
  1. `Timestamp`: Precise date + time (`09 Sep 2026 18:21:04 IST`).
  2. `Operator`: Email + Avatar.
  3. `Action`: Badge with icon (`Override Save`, `Flag Org`, `Suspend Org`, `Impersonate User`, `Update Role`, `Change Plan`).
  4. `Target Tenant`: Organization Name + Link.
  5. `Summary Description`: Short readable sentence (e.g. "Overrode Step 3 (India Compliance) for Acme Corp").
  6. `State Diff`: Clickable `View JSON Diff` button (displays before vs after side-by-side modal).
* **Modal: JSON State Diff**:
  - Shows exact previous state vs updated state with red/green syntax highlighting.
* **Backend API Mapping**:
  - `GET /super-admin/audit-logs`
* **Permission Required**: `auditView`

---

### Page 14: Impersonation Sessions Tracker (`/impersonations`)

* **Purpose**: Dedicated audit and security control monitor for all historical and live operator impersonation sessions.
* **Top Metric Cards**:
  - `Active Live Sessions`: Currently ongoing impersonations.
  - `Sessions Today`: Total count in last 24h.
  - `Average Session Duration`: e.g. 18 minutes.
  - `Operators Active`: Count of staff currently impersonating tenants.
* **Table Columns**:
  1. `Session ID`: Truncated UUID (`ses_8f12...`).
  2. `Operator`: Staff email who initiated the session.
  3. `Target Tenant`: Organization Name.
  4. `Target User`: Name & Email of impersonated user.
  5. `Reason for Access`: Full text justification entered at launch.
  6. `Duration / Expiry`: Remaining time countdown (e.g. `12 min remaining`) or `Expired`.
  7. `Status`: Badge (`Active Live` [pulsing green] vs `Expired` [gray] vs `Terminated Early` [amber]).
  8. `Action`: `Terminate Session Immediately` (emergency kill switch).
* **Impersonation Launch Modal (Used across Tenants / Users pages)**:
  - Header: `Start Audited Tenant Impersonation`
  - Tenant Name & Target User display.
  - Input: `Reason for Impersonation` (Textarea, required, min 10 characters, e.g. "Investigating payroll tax mismatch ticket #8921").
  - Radio Options: `Session Duration` (15 minutes | 30 minutes | 60 minutes).
  - Warning Banner: "All actions taken during this session will be logged under your operator identity and the tenant's security audit log."
  - Primary Button: `Confirm & Launch Session` -> Opens tenant portal in new window with impersonation token.
* **Tenant Portal Header Banner (Displayed inside `apps/web`)**:
  - Yellow high-contrast top bar:
    `⚠️ IMPERSONATION MODE — Viewing as [User Email] on behalf of [Tenant Name] — Operator: [Operator Email] — [Remaining Time] — [Exit Session Button]`
* **Backend API Mapping**:
  - `trpc.mac.startImpersonation.useMutation({ targetUserId, reason, durationMinutes })`
  - `trpc.mac.revokeOrgSessions.useMutation({ id })`
* **Permission Required**: `impersonateTenant` (Super Admin or Support Staff with explicit capability).

---

### Page 15: System Settings (`/settings`)

* **Purpose**: Global platform defaults and configuration parameters.
* **Configuration Sections**:
  1. `Platform Identity`: Platform build version (`v2.4.0`), Company legal name, Support contact email.
  2. `Authentication & Security Defaults`:
     - Default session timeout for tenant users.
     - Operator 2FA enforcement (`Mandatory for all Operators`).
     - IP Whitelisting for MAC access (CIDR block restrictions).
  3. `Compliance Automation Rules`:
     - Statutory filing alert threshold: Days before deadline to trigger first warning (`7 days`).
     - Daily late fee calculation currency (`INR`).
     - DPDP breach countdown threshold: Warning at `24h` remaining.
  4. `Email & Notification Gateways`:
     - SMTP / Postmark / SendGrid provider status.
     - SMS / WhatsApp gateway status for statutory reminders.
* **Backend API Mapping**:
  - `GET /super-admin/settings`
  - `PUT /super-admin/settings`
* **Permission Required**: `operatorsManage` (Super Admin only).

---

## 4. Complete Role & Permissions Matrix

| Capability Key | Capability Description | Super Admin (Root) | Operations Staff | Support Staff | Compliance Auditor |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `tenantsView` | View Organizations & Onboarding | ✅ | ✅ | ✅ | ✅ |
| `tenantsManage` | Edit Org Profiles, Entitlements, Flags | ✅ | ✅ | ❌ | ❌ |
| `wizardOverride` | Override Onboarding Step Data | ✅ | ✅ | ❌ | ❌ |
| `tenantsSuspend` | Emergency Suspend / Activate Tenants | ✅ | ❌ | ❌ | ❌ |
| `impersonateTenant`| Time-Boxed Impersonation of Tenant Admin | ✅ | ✅ | ✅ | ❌ |
| `operatorsManage`| Manage Internal Operators & Roles | ✅ | ❌ | ❌ | ❌ |
| `auditView` | Inspect Server Audit Trails & Diffs | ✅ | ✅ | ✅ | ✅ |
| `financeView` | View Subscriptions, MRR, Revenue Metrics| ✅ | ✅ | ❌ | ❌ |
| `financeManage` | Override Plans & Extend Trials | ✅ | ❌ | ❌ | ❌ |
| `complianceView`| Inspect Statutory & DPDP Records | ✅ | ✅ | ❌ | ✅ |
| `complianceManage`| Broadcast Deadlines, Sweeps, Escalations| ✅ | ✅ | ❌ | ❌ |
| `workflowsView` | Orchestrate Temporal & BullMQ Queues | ✅ | ✅ | ❌ | ❌ |
| `systemHealth` | Infrastructure Diagnostics & DLQ Actions | ✅ | ✅ | ❌ | ❌ |

---

## 5. Summary of Architecture Changes vs. Current Codebase

| Area | Current State in Codebase | New Functional Architecture | Implementation Action Required |
| :--- | :--- | :--- | :--- |
| **Sidebar Modules** | Links to `/modules/itsm`, `/modules/assets`, `/modules/hr`, `/modules/procurement` (stubs) | **REMOVED** from Super Admin sidebar entirely. | Clean up `Sidebar.tsx` and `App.tsx` routes. |
| **Module Entitlements**| Missing UI | Located in **Tenant Detail Drawer -> Module Entitlements tab** with toggles. | Implement switch list in `TenantDetailDrawer.tsx`. |
| **Finance Module** | Called `/modules/finance` | Renamed to **Subscriptions & Billing (`/billing`)**. | Rename route and update navigation labels. |
| **Compliance UX** | Single-tenant style modal "Mark Filed" for individual returns | **Control Tower Oversight UX**: Cross-tenant health (Healthy/Due Soon/Overdue), penalty calculation, and escalation nudges. | Update `ComplianceGrcPage.tsx` statutory tab. |
| **Impersonation** | Backend endpoint `startImpersonation` exists, but NO button in UI | Added `Impersonate Admin` button in Tenants page, Users page, and new `/impersonations` monitor. | Connect UI button to `trpc.mac.startImpersonation`. |
| **Global User Search**| Backend endpoint `searchUsers` exists, no UI | Dedicated page **`/users/global`** with instant multi-tenant user search. | Create `GlobalUsersPage.tsx`. |
| **Feature Flags** | Backend endpoints exist, no UI | Dedicated page **`/feature-flags`** and Tenant Drawer tab. | Create `FeatureFlagsPage.tsx`. |
