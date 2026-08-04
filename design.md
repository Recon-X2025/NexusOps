# System Architecture & Detailed Module Reference Guide

**Last Updated:** 2026-08-03  
**Target Repository:** CoheronConnect (NexusOps)

---

## 1. Architecture & Data Flow

CoheronConnect follows a monorepo structure with clear boundaries between UI components, end-to-end type-safe API routers, domain services, background workers, and PostgreSQL schemas.

```text
┌─────────────────────────────────────────┐      ┌──────────────────────────────────────────┐
│   Web App (Next.js 16 / React 19)       │      │  Mobile Client (Expo / React Native)     │
└────────────────────┬────────────────────┘      └────────────────────┬─────────────────────┘
                     │                                                │
                     └───────────────────┬────────────────────────────┘
                                         │  (tRPC Client queries & mutations)
                                         ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                          Fastify API Server (apps/api)                                    │
│   • Global Middlewares: Rate Limiter, Request Throttler, Prototype Pollution Guard        │
│   • tRPC Routers (55+ domain routers mounted on appRouter)                              │
│   • RBAC Matrix Gatekeeper (checkDbUserPermission)                                       │
└──────┬──────────────────────┬──────────────────────┬──────────────────────┬───────────────┘
       │                      │                      │                      │
       ▼                      ▼                      ▼                      ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
│ PostgreSQL 16│      │ Redis        │      │ Temporal.io  │      │ Meilisearch & S3 │
│ (Drizzle ORM)│      │ Cache/BullMQ │      │ Workflow Eng │      │ Search & Files   │
└──────────────┘      └──────────────┘      └──────────────┘      └──────────────────┘
```

---

## 2. Core Abstractions & Design Invariants

- **Type-Safe RPC Pipeline**: All API procedures use tRPC (`apps/api/src/routers/index.ts`). Frontend code consumes procedure types directly from `@coheronconnect/api`, eliminating REST specification drift.
- **Database & Data Isolation**: Tables live in `@coheronconnect/db/schema`. Database interactions are multi-tenant isolated via `orgId` filtering on all queries and mutations.
- **Tamper-Evident Audit Logging**: Sensitive or state-changing mutations call `appendAuditEntry`, updating a cryptographic hash-chain (`seq` + `prevHash` → `hash`) stored in `audit_logs`.
- **Auto-Numbering Sequences**: Entity ticket/PO numbers (`INC-1001`, `PO-5002`) are allocated atomically via `getNextSeq(db, orgId, entityType)`.
- **Statutory Data Protection (DPDP)**: Government PII (Aadhaar/PAN) is stored as a peppered HMAC hash + masked display string via `lib/pii-hash.ts`, never raw. Retention rules stamp `retainUntil` timestamps enforcing an 8-year floor on financial/compliance artifacts.

---

## 3. Comprehensive Module & Function Reference Guide

This reference details every core enterprise module, its underlying router procedures, purpose, and key considerations for **debugging and bug fixing**.

---

### Module 1: ITSM & Service Delivery

Handles IT service management, incident tracking, change control, service catalog, knowledge base, on-call escalations, and customer feedback.

#### Routers: `tickets`, `workOrders`, `changes`, `catalog`, `knowledge`, `oncall`, `events`, `surveys`, `csm`

#### Key Functions / tRPC Procedures

| Procedure Path | Purpose & Action | Key State Invariants / Debugging Focus |
| :--- | :--- | :--- |
| `tickets.list` | Fetches paginated, filtered ticket records (incidents, service requests). | Check `orgId` filtering and RBAC ticket visibility scope (`all` vs `assigned_only`). |
| `tickets.create` | Mints a new ITSM ticket with auto-numbering (`INC-xxxx`). | Verifies idempotency key in Redis cache. Triggers automatic assignment rules and business rule engine. |
| `tickets.update` | Updates ticket priority, assignment, status, or custom fields. | Logs status change in `ticketActivityLogs`. Evaluates SLA timers on state transition. |
| `tickets.resolve` | Sets ticket status to `RESOLVED` and records resolution code. | Fires `triggerCsatForResolvedTicket` to mint CSAT survey invitation if CSAT loop is enabled. |
| `tickets.addComment` | Appends public or internal work notes to a ticket. | Evaluates notification triggers (email/in-app) for requester and assigned agents. |
| `workOrders.create` | Generates field service work orders linked to tickets or assets. | Validates technician assignment and technician skill matrix matching. |
| `workOrders.updateStatus` | Transitions work order state (`PENDING` → `IN_PROGRESS` → `COMPLETED`). | Re-calculates linked ticket completion criteria when all sub-work orders complete. |
| `changes.create` | Initiates Change Advisory Board (CAB) change requests. | Requires risk assessment inputs and target deployment window bounds. |
| `changes.approve` | Records CAB approval votes and checks approval threshold. | Moves change request to `APPROVED` once required quorum is achieved. |
| `catalog.getItems` | Fetches active service catalog items and request forms. | Ensures deactivated items (`is_active = false`) are hidden from non-admin users. |
| `knowledge.search` | Executes full-text search across published KB articles. | Searches via Meilisearch index; fallback to PostgreSQL `ILIKE` on search service drop. |
| `oncall.getSchedule` | Resolves active on-call engineers for a given time window. | Evaluates shift rotation rules, overrides, and escalation policy tiers. |
| `surveys.submitCsat` | Captures public CSAT score and feedback comment against token. | One-time token validation. Aggregates CSAT metric score on `dashboard.getMetrics`. |

---

### Module 2: HR, People Operations & Statutory Compliance

Manages employee onboarding/offboarding, leave accruals, gratuity provisioning, attendance, and statutory payroll calculations.

#### Routers: `hr`, `payroll`, `gratuity`, `leaveAccrual`, `recruitment`, `performance`, `workforce`, `onboarding`, `indiaCompliance`

#### Key Functions / tRPC Procedures

| Procedure Path | Purpose & Action | Key State Invariants / Debugging Focus |
| :--- | :--- | :--- |
| `hr.employees.list` | Retrieves employee directory records with department and manager hierarchy. | Soft-deleted employees (`status = archived`) must be excluded from active directory views. |
| `hr.employees.create` | Provisions a new employee record and links user identity. | Asserts unique email per organization and validates `salaryStructureId` binding. |
| `hr.leave.apply` | Submits a leave request against available leave category balance. | Verifies overlap with existing approved requests and checks balance limits. |
| `hr.leave.approve` | Approves leave application and deducts balance units. | Must run inside a transaction to prevent negative balance race conditions under concurrent approvals. |
| `leaveAccrual.runMonthlyAccrual` | Computes periodic leave accrual and carry-forward for active employees. | Enforces statutory max caps per leave category (e.g. max 30 days earned leave carryover). |
| `gratuity.computeAccrual` | Calculates statutory gratuity liability per employee under Payment of Gratuity Act 1972. | Formula: `(15 / 26) * Last Basic Salary * Completed Years of Service` (guarded for tenure ≥ 5 years). |
| `payroll.runs.create` | Mints a new monthly payroll draft run for an organization. | Checks that no existing active/locked run exists for the target calendar month and year. |
| `payroll.runs.lockPeriod` | Freezes inputs, computes baseline run totals, transitions `DRAFT` → `PERIOD_LOCKED`. | Locks attendance days and employee structures. Check run totals drift if inputs are modified post-lock. |
| `payroll.runs.computePayslips` | Computes gross earnings, EPF, ESI, PT, LWF, TDS, and net pay for all employees. | Uses `@coheronconnect/payroll-math`. Generates per-employee `payslips` database rows. |
| `payroll.runs.approve` | Advances pipeline status through HR → Finance → CFO approval steps. | Verifies RBAC approval permissions (`hr:approve`, `finance:approve`, `cfo:approve`). |
| `payroll.exportBankFile` | Generates bank disbursement text file (NEFT/NACH format). | **Security Note:** Ensure run is in approved state before allowing export generation. |
| `indiaCompliance.generateEcr` | Compiles EPFO Electronic Challan cum Return (ECR) text payload. | Validates UAN numbers, PF basic ceiling (₹15,000 statutory cap), and EPS/EPF split ratios. |

---

### Module 3: Finance, Accounting & Procurement

Handles purchasing (PR/PO), 3-way invoice matching, General Ledger (GL) journal postings, tax filing (GST), and depreciation.

#### Routers: `financial`, `accounting`, `procurement`, `expenseReports`, `vendors`, `depreciation`

#### Key Functions / tRPC Procedures

| Procedure Path | Purpose & Action | Key State Invariants / Debugging Focus |
| :--- | :--- | :--- |
| `procurement.pr.create` | Submits a Purchase Requisition (PR) with line item costs. | Validates department budget thresholds and triggers approval chain if amount exceeds threshold. |
| `procurement.po.create` | Converts approved PR into a formal Purchase Order (PO). | Assigns PO sequence number (`PO-xxxx`) and commits committed spend against budget. |
| `procurement.threeWayMatch` | Performs 3-way match validation between PO, Goods Receipt, and Vendor Invoice. | Checks line item quantity and cost tolerance (e.g. ±1%). Flags variances for manual review. |
| `financial.createInvoice` | Creates an AP (Payable) or AR (Receivable) invoice record. | Validates vendor/customer binding, tax rates, line items sum, and payment terms. |
| `accounting.postJournalEntry` | Posts a manual or automated double-entry GL journal entry. | **Strict Invariant:** Sum of Debits MUST equal Sum of Credits. Returns `BALANCED_ENTRY_REQUIRED` error on discrepancy. |
| `accounting.getGeneralLedger` | Generates GL account activity and running ledger balances. | Filters entries by organization, fiscal year, and account code. |
| `accounting.getBalanceSheet` | Computes Balance Sheet (Assets = Liabilities + Equity) at a point in time. | Aggregates real accounts (`ASSET`, `LIABILITY`, `EQUITY`) from posted journal entries. |
| `financial.computeGstr1` | Aggregates B2B, B2C sales invoices and Tax liabilities for GSTR-1 return filing. | Groups line items by GSTIN, HSN/SAC code, and tax rate (5%, 12%, 18%, 28%). |
| `expenseReports.submit` | Submits employee expense reports with receipt attachments for finance reimbursement. | Distinct from `hr.expenses` (claims); creates finance-tracked expense reports with GL posting bindings. |
| `depreciation.runMonthly` | Computes asset book value depreciation and posts depreciation GL journals. | Supports Straight-Line (SLM) and Written-Down Value (WDV) statutory calculation methods. |

---

### Module 4: Asset Management (ITAM/SAM) & Infrastructure Operations

Manages physical hardware assets, CMDB relationships, facilities maintenance, DevOps DORA metrics, and APM tracking.

#### Routers: `assets`, `inventory`, `facilities`, `devops`, `apm`

#### Key Functions / tRPC Procedures

| Procedure Path | Purpose & Action | Key State Invariants / Debugging Focus |
| :--- | :--- | :--- |
| `assets.list` | Retrieves hardware and software asset registry items. | Supports filtering by asset tag, status (`IN_USE`, `IN_STOCK`, `RETIRED`), category, and owner. |
| `assets.create` | Registers a new asset with purchase cost, serial number, and warranty bounds. | Mints unique asset tag (`AST-xxxx`) and initializes depreciation schedule. |
| `assets.assign` | Assigns asset ownership to an employee or location. | Updates asset status and records assignment history entry. |
| `assets.cmdb.addRelation`| Connects CMDB configuration items with dependency links. | **Cycle Guard:** Traverses tree to detect and block circular dependency graphs (`A → B → A`). |
| `inventory.adjustStock` | Adjusts spare parts/inventory quantities for warehouse items. | Updates stock ledger and flags reorder alerts when quantity falls below safety threshold. |
| `facilities.createTicket` | Submits building/facilities maintenance work requests. | Categorizes requests by building, floor, and urgency. Links to facilities maintenance team. |
| `devops.getDoraMetrics` | Computes DORA metrics (Deployment Frequency, Lead Time, MTTR, Change Failure Rate). | Links deployment events (`tickets.deploymentId`) to incidents to compute Mean Time to Recover (MTTR). |

---

### Module 5: Security, GRC & DPDP Compliance

Enforces data protection compliance (DPDP Act), risk registers, contract obligations, e-signatures, and regulatory audits.

#### Routers: `grc`, `compliance`, `security`, `documents`, `esign`, `secretarial`, `legal`, `contracts`

#### Key Functions / tRPC Procedures

| Procedure Path | Purpose & Action | Key State Invariants / Debugging Focus |
| :--- | :--- | :--- |
| `compliance.submitDsr` | Registers a Data Subject Right (DSR) request (access, correction, erasure). | Computes statutory fulfillment deadline (e.g. 30 days) and creates compliance tracking item. |
| `compliance.executeDsrErasure`| Executes PII anonymization/erasure for an approved DSR request. | Checks feature flag `DPDP_ERASURE_ENABLED`. Anonymizes user profile while preserving statutory financial records. |
| `grc.risks.create` | Log a risk item with likelihood, impact score, and mitigation strategy. | Risk score = `Likelihood × Impact`. Categorizes residual vs inherent risk. |
| `grc.controls.assess` | Evaluates control effectiveness for security compliance frameworks (ISO27001, SOC2). | Attaches evidence documentation and schedules periodic reassessment reminders. |
| `security.logVulnerability`| Tracks system vulnerabilities and patches. | Deduplicates vulnerability imports by CVE ID and affected asset ID. |
| `esign.requestSignature` | Initiates e-signature request for legal contracts/payslips. | Integrates with eMudhra / digital signature providers to mint signed document hash. |
| `documents.upload` | Stores document artifacts in S3 object store and creates version entry. | Enqueues virus scan job and computes document SHA-256 hash for integrity verification. |

---

### Module 6: CRM & Business Operations

Manages customer accounts, sales lead pipelines, deal thresholds, project tasks, and team structures.

#### Routers: `crm`, `projects`, `teams`, `approvals`, `assignmentRules`

#### Key Functions / tRPC Procedures

| Procedure Path | Purpose & Action | Key State Invariants / Debugging Focus |
| :--- | :--- | :--- |
| `crm.leads.create` | Registers new sales lead with contact details and lead source. | Validates duplicate email/phone numbers against existing customer contacts. |
| `crm.leads.convert` | Converts qualified lead into an Account, Contact, and Deal record. | Lossless conversion: copies lead notes, activity history, and custom fields to target deal. |
| `crm.deals.updateStage` | Advances deal through pipeline stages (`PROSPECT` → `CLOSED_WON`). | Enforces required stage fields and evaluates deal approval threshold rules. |
| `projects.createTask` | Adds a project task linked to a milestone, project, and assignee. | Updates project completion percentage and parent task dependency links. |
| `approvals.pending` | Fetches pending approval items assigned to current user. | Aggregates approvals across PRs, Expenses, Leaves, and Custom Workflows. |
| `assignmentRules.evaluate` | Evaluates auto-assignment rules for incoming tickets/leads. | Order-based evaluation: matches conditions (category, priority, tags) and assigns target team/agent. |

---

### Module 7: Platform Administration & System Infrastructure

Provides central governance, user management, authentication, search, audit logging, system properties, and AI copilot integration.

#### Routers: `auth`, `admin`, `customFields`, `notifications`, `search`, `reports`, `dashboard`, `commandCenter`, `workbench`, `ingest`, `integrations`, `mac`, `workflows`, `ai`, `agent`

#### Key Functions / tRPC Procedures

| Procedure Path | Purpose & Action | Key State Invariants / Debugging Focus |
| :--- | :--- | :--- |
| `auth.login` | Authenticates user credentials via password / SSO. | Verifies password hash (`bcrypt`), checks active state, checks MFA enrollment, issues session token. |
| `auth.mfa.enroll` | Initiates TOTP 2FA secret enrollment for a user account. | Generates QR code secret. Verifies confirmation code before activating `mfa_enabled = true`. |
| `admin.users.invite` | Invites a new user account into an organization with designated role. | Sends invite link token. Checks duplicate email in target organization. |
| `admin.rbac.updateMatrix` | Configures permissions across system roles and custom roles. | Updates global access matrix. Invalidates user RBAC permission cache in Redis. |
| `admin.auditLog.list` | Retrieves paginated system audit log entries. | Displays redacted sensitive fields. Includes tamper-evident sequence hash verification. |
| `customFields.create` | Defines a custom field schema attached to an entity (`ticket`, `asset`, `employee`). | Supports types: `text`, `number`, `select`, `date`, `boolean`. Appends definitions to entity schema. |
| `workflows.publish` | Validates and activates a visual workflow definition. | Checks `WORKFLOW_ENGINE_REQUIRED`. Validates node graph connectivity before deploying to Temporal. |
| `dashboard.getMetrics` | Aggregates real-time organizational KPIs (incidents, outstanding AP/AR, CSAT). | Returns `null` for CSAT when no responses exist (never fabricates scores). |
| `agent.chat` | Multi-turn RAG Copilot interaction using Anthropic Claude API. | Maintains conversation context window, queries platform knowledge tools, executes allowed write actions. |

---

## 4. Debugging & Troubleshooting Guide for Developers

When diagnosing errors or fixing bugs in CoheronConnect, follow this systematic resolution protocol:

### 1. Verify Error Traceback & Logs
- Run commands with `.env.test` or check API console logs.
- Fastify logs are formatted via Pino (`apps/api`). Search for `requestId` or error stack trace.

### 2. Inspect Database State & Schema Invariants
- Use Drizzle Studio (`make db-studio`) to inspect underlying tables.
- **Common Invariants to Check:**
  - **Balanced GL Entries**: Sum(Debit) must equal Sum(Credit) in `journal_entries`.
  - **Multi-Tenant Scoping**: All tenant queries must include `eq(table.orgId, orgId)`.
  - **Audit Chain Sequence**: `audit_logs.seq` must be strictly monotonic without gaps or NULLs in tamper-evident chains.
  - **Government ID Masking**: Aadhaar/PAN fields must store HMAC hash + masked string (`XXXX-XXXX-1234`), never raw PII.

### 3. Check RBAC & Procedure Authorization
- If a client call returns `FORBIDDEN` (403), verify `checkDbUserPermission(db, userId, orgId, module, action)` configuration.
- Regenerate tRPC RBAC map hints if routers were modified:
  ```bash
  pnpm exec tsx scripts/generate-trpc-rbac-map.ts
  ```

### 4. Verify tRPC Procedure Parity
- Run the tRPC parity checker to detect unaligned frontend/backend procedure calls:
  ```bash
  pnpm check:trpc-parity
  ```

---
*Built & Maintained by Coheron Engineering.*
