# NexusOps v2.2.0 → QA-Ready: Honest Gap Bridge

## What Cursor Actually Did vs What the Doc Implies

The v2.2.0 doc reads like a finished product. It isn't. Here's the honest audit — what's real, what's half-done, and the exact Cursor prompts to close every gap to QA.

---

## Layer-by-Layer Reality Check

### AUTH: Mostly done, rough edges

| Claim | Reality | Gap |
|-------|---------|-----|
| bcrypt password hashing | ✅ Confirmed — `password_hash` exists, seed hashes `demo1234!` | — |
| Session validation on every tRPC call | ✅ Confirmed — `createContext` resolves Bearer/cookie → sessions table → user+org | — |
| Login rate limiting | ⚠️ In-memory only (`login-rate-limit.ts`) | Resets on server restart. Not per-IP. |
| Invite flow | ⚠️ `auth.ts` lists invite/acceptInvite routes | Likely skeleton — needs verification of email sending, token expiry, and UI page |
| SSO / SAML | ❌ Not mentioned anywhere | Not started |
| 2FA / TOTP | ❌ Not mentioned | Not started |
| Password reset | ❌ Not mentioned | No forgot-password flow |

### RBAC: Shared matrix exists, enforcement is shallow

| Claim | Reality | Gap |
|-------|---------|-----|
| Shared matrix in `@nexusops/types` | ✅ `rbac-matrix.ts` with `hasPermission`, `canAccessModule` | — |
| `permissionProcedure` exists | ✅ In `apps/api/src/lib/trpc.ts` | — |
| "Most domain routers use permissionProcedure" | ⚠️ **Unverified** — doc says this but doesn't list which routers exist | Need to confirm every router actually uses it |
| DB role → matrix mapping | ⚠️ `rbac-db.ts` maps `owner`/`admin`/`member`/`viewer` to roles | Only 4 DB roles mapping to 22 matrix roles — coarse. `member` → `itil` means all members are IT agents |
| Row-level / requester-only rules | ❌ Doc explicitly says "not exhaustive" | Employee portal, confidential investigations, own-data-only not enforced |
| org_id scoping on every query | ⚠️ `ctx.orgId` exists from `createContext` | But no middleware guarantees every query uses it — depends on each router manually including WHERE org_id |

### AUDIT: Baseline only

| Claim | Reality | Gap |
|-------|---------|-----|
| Mutations write to `audit_logs` | ⚠️ Doc says "append a row" with "action = full tRPC path" | Basic — no `resource_id`, no `changes` diff, no IP consistently |
| `admin.auditLog.list` API | ❌ Doc says "may still be pending" | Not built |
| Audit log viewer in Admin Console | ⚠️ UI tab exists | But no backend to feed it |

### MODULE WIRING: The biggest question

| Claim | Reality | Gap |
|-------|---------|-----|
| 28 module pages exist | ✅ All page.tsx files render | — |
| Module tRPC routers exist | ❓ **Doc never lists domain routers** | Auth router confirmed. Doc mentions "domain routers (tickets, assets, contracts, …)" but doesn't confirm they exist or work |
| Pages read from DB, not mock data | ❓ **Extremely unlikely for all 28** | Doc still says "Mock Data Entities: 500+" in Platform Statistics — if pages were wired, mock data wouldn't be the metric |
| Seed creates cross-module data | ✅ `seed.ts` + `db:seed:modules` command exists | But seeding data ≠ pages reading from it via tRPC |

### EVERYTHING ELSE: Not started

| Component | Status |
|-----------|--------|
| Workflow engine (Temporal.io) | ❌ Not mentioned in doc |
| Notification system (email/in-app/Slack) | ❌ Not mentioned |
| AI layer (Claude API, embeddings, NL search) | ❌ Not mentioned |
| Meilisearch full-text search | ❌ docker-compose has it but no wiring code mentioned |
| File/attachment storage (S3/MinIO) | ❌ Not mentioned |
| External integrations (Slack, Jira, Email, SAP) | ❌ Admin Hub UI exists, nothing connected |
| Webhook delivery system | ❌ Not mentioned |
| Virtual agent — Claude API | ❌ Still pattern-matched |
| Production Docker images | ❌ Only `docker-compose.dev.yml` |
| Helm charts / Terraform | ❌ Not mentioned |
| CI/CD pipeline | ❌ Not mentioned |
| License key system | ❌ Not mentioned |
| Test suite | ❌ Zero tests mentioned |
| Security hardening (CSP, CORS, input sanitization) | ❌ Not mentioned |
| Observability (OpenTelemetry, health endpoints) | ❌ Not mentioned |
| Documentation site | ❌ Not mentioned |

---

## The Actual Current State

**What's real and working:** Monorepo structure, Fastify + tRPC 11, PostgreSQL + Drizzle, bcrypt login, session validation, shared RBAC matrix, `protectedProcedure` / `permissionProcedure` / `adminProcedure`, basic mutation audit logging, seed data, 28 frontend pages.

**What's claimed but unverified:** Domain routers for modules, `permissionProcedure` actually applied to those routers, pages actually reading from tRPC instead of mock data.

**What's definitely not built:** Everything in the "Everything Else" table above.

---

## Gap Bridge Prompt: Phase by Phase

Each prompt below is designed to be pasted into Cursor as-is. They're ordered by dependency — each builds on the previous.

---

### PROMPT 1: Verify and Fix What Cursor Claims Exists
*Estimated: 1–2 days. Must be done FIRST before anything else.*

```
I need to audit and fix the NexusOps backend. The build reference claims several things
exist but I need to verify and fix each one. Go through these checks IN ORDER:

CHECK 1 — List all tRPC routers that actually exist.
Open apps/api/src/routers/ and list every .ts file. 
For each file, list the procedure names (e.g., tickets.list, tickets.create).
Show me the output as a table: Router File | Procedures | Uses permissionProcedure? | Uses protectedProcedure?

CHECK 2 — For each domain router found (NOT auth):
Verify it actually queries the database (has Drizzle db.select/db.insert calls).
If a router exists but its procedures return hardcoded data or empty arrays, 
flag it as "STUB — not wired to DB".

CHECK 3 — For each page.tsx under apps/web/src/app/app/:
Check if it imports from trpc (e.g., trpc.tickets.list.useQuery).
If a page still uses useState with hardcoded mock arrays, flag it as "MOCK — not wired to tRPC".
Show me the output as a table: Page | Data Source (tRPC / Mock / Mixed)

CHECK 4 — Verify org_id scoping:
In every router that queries a table with org_id, check if WHERE org_id = ctx.orgId 
(or equivalent) is present on EVERY query. Flag any query that's missing it.

CHECK 5 — Verify audit logging:
Look at the mutation audit middleware in apps/api/src/lib/trpc.ts.
Does it capture: resource_id? changes (diff)? IP address? user agent?
If any are missing, list what's missing.

CHECK 6 — Verify invite flow:
Does apps/web/src/app/(auth)/invite/[token]/page.tsx exist?
Does the auth.acceptInvite procedure actually create a user, mark invitation accepted, 
and create a session? Or is it a stub?

After all checks, give me a summary:
- Routers that are REAL (DB-backed, permission-gated, org-scoped)
- Routers that are STUBS (exist but don't query DB)
- Routers that are MISSING entirely
- Pages that are WIRED vs still MOCK
- Auth features that work vs are stubs
```

---

### PROMPT 2: Fix Auth Gaps
*Estimated: 2–3 days. Depends on Prompt 1 results.*

```
Based on the audit, fix all auth gaps in NexusOps:

1. RATE LIMITING — upgrade from in-memory to Redis:
   The current login-rate-limit.ts uses an in-memory map that resets on restart.
   Replace with Redis-backed counter:
   - Key: `login_attempts:${email}` with TTL 300 seconds (5 minutes)
   - Max 10 attempts per email per 5 minutes
   - Also add per-IP limiting: `login_attempts_ip:${ip}` — 50 per 5 minutes
   - Return 429 with Retry-After header
   Uses Redis from docker-compose.dev.yml (already running).
   Install ioredis if not already: pnpm --filter @nexusops/api add ioredis

2. PASSWORD RESET FLOW:
   - Add tRPC route: auth.requestPasswordReset
     Input: { email }. Always returns success (no email enumeration).
     If user exists: generate token (crypto.randomBytes(32).toString('hex')),
     store hash in new password_reset_tokens table 
     (id, user_id, token_hash, expires_at = now + 1 hour, used_at nullable),
     log the reset URL to console for now: /reset-password/{token}
   - Add tRPC route: auth.resetPassword
     Input: { token, newPassword }. Validate token not expired/used.
     Hash new password, update users.password_hash, mark token as used,
     invalidate all existing sessions for that user.
   - Add pages:
     apps/web/src/app/(auth)/forgot-password/page.tsx — email input form
     apps/web/src/app/(auth)/reset-password/[token]/page.tsx — new password form
   - Add password_reset_tokens table to packages/db schema + migrate.

3. INVITE FLOW VERIFICATION:
   If the invite flow from auth.ts is a stub, complete it:
   - auth.invite must: validate admin permission, create invitation row, 
     return the invite token (for now — email sending is G10 notifications).
   - auth.acceptInvite must: validate token, create user with password hash,
     set user.role based on invitation.role, create session, mark invitation accepted.
   - /invite/[token] page must: fetch invitation details, show signup form 
     (name + password, email pre-filled), submit to acceptInvite, redirect to /app/dashboard.
   - Admin Console User Management tab must: have "Invite User" button 
     that opens dialog with email + role selector, calls auth.invite, shows success toast.

4. SESSION HARDENING:
   - Verify session tokens are stored as SHA-256 hashes (not plaintext).
     If currently plaintext: add hashing on session create, compare by hashing incoming token.
   - Add sliding window: on each valid request, extend session.expires_at by 24 hours.
   - Add: auth.listMySessions — returns active sessions for current user.
   - Add: auth.revokeSession — delete specific session (for "sign out other devices").
   - Add session info to user settings page if it exists (list of active sessions with 
     IP, user agent, last active, and "Revoke" button).
```

---

### PROMPT 3: Fix RBAC Depth and Org Scoping
*Estimated: 2 days*

```
The NexusOps RBAC system has a shared matrix and permissionProcedure, but several gaps
need closing before QA:

1. DB ROLE MAPPING IS TOO COARSE:
   Current rbac-db.ts maps only 4 DB roles (owner/admin/member/viewer) to matrix roles.
   This means all "members" get the same permissions (itil).

   Fix: Add a `matrix_role` column to the users table (text, nullable).
   When set, use it directly instead of the coarse mapping.
   When null, fall back to the current mapping.
   This allows admins to assign fine-grained roles (hr_manager, finance_manager, etc.)
   without changing the DB role enum.

   Update:
   - packages/db schema: add matrix_role to users table, migrate
   - apps/api/src/lib/rbac-db.ts: check ctx.user.matrix_role first, then fall back
   - Admin Console User Management: add "Platform Role" dropdown showing all 22 roles
     (separate from the DB role which controls org-level access)
   - Seed: set matrix_role on seeded users 
     (hr@coheron.com → hr_manager, finance@coheron.com → finance_manager, etc.)

2. ROW-LEVEL ACCESS ENFORCEMENT:
   Add these specific access rules inside the relevant routers:

   a) Employee Portal (portal.myPayslips, portal.myLeave, etc.):
      MUST filter by ctx.user.id — no employee can see another's payslips.
      Add: WHERE employee.user_id = ctx.user.id on all portal queries.
      If user is hr_manager or admin, they can access any employee's data 
      (for HR case management). Otherwise, own data only.

   b) Confidential Investigations (legal.investigations):
      Add: if investigation.confidential === true, 
      only investigator_id === ctx.user.id OR admin can see it.
      Other users get the investigation filtered from list results entirely.

   c) Security Incidents:
      Only users with security_incidents.read permission can list.
      Only security_incidents.write can modify.
      Enforce state machine: transitions must follow the defined order
      (new→triage→containment→eradication→recovery→closed).
      Reject out-of-order transitions with a clear error.

   d) Ticket Visibility:
      Internal comments (ticket_comments.is_internal = true) must be
      filtered from responses when the requesting user lacks incidents.write permission.
      Requesters should only see public comments.

3. ORG SCOPING GUARANTEE:
   Create apps/api/src/lib/with-org.ts:

   export function withOrg(table: any, orgId: string) {
     return eq(table.orgId, orgId);
   }

   Add a development-mode safety check:
   In protectedProcedure, after the procedure runs, log a WARNING if any 
   Drizzle query was executed on an org-scoped table without an org_id condition.
   (This can be done by wrapping the db client with a proxy in dev mode that 
   inspects the SQL before execution — or simpler, add a lint rule that greps 
   for db.select().from(xxxTable) without .where(withOrg(...)) in router files.)

   The goal: make it impossible to accidentally forget org scoping.
```

---

### PROMPT 4: Complete the Audit System
*Estimated: 1 day*

```
The current audit middleware writes basic entries (tRPC path, router name, org, user).
Complete it:

1. In apps/api/src/lib/trpc.ts, upgrade the audit middleware:

   For mutations, capture:
   - resource_id: extract from input.id (for updates/deletes) or result.id (for creates)
   - changes: for updates, fetch the entity BEFORE the mutation, then diff against
     the input to produce a { field: { old: x, new: y } } object.
     Store as jsonb in audit_logs.changes.
   - ip_address: from ctx (already in createContext from Fastify request)
   - user_agent: from ctx

   For creates: changes = { _action: "created", ...input } (sanitized — no passwords)
   For deletes: changes = { _action: "deleted", id: input.id }

   Sanitize: strip password, token, secret, key from logged input.

2. Create the admin audit log API:
   In apps/api/src/routers/admin.ts (or create it):
   
   admin.auditLog.list — adminProcedure
   Input: { page, limit, dateFrom?, dateTo?, userId?, action?, resourceType? }
   Returns paginated audit entries with user name joined.

3. Wire the Admin Console Audit Log tab:
   The UI tab already exists at /app/admin. Wire it to admin.auditLog.list.
   Show: timestamp, user name, action, resource type, resource ID, IP address.
   Click to expand: show full changes JSON.
   Filters: date range, user dropdown, action type, resource type.
```

---

### PROMPT 5: Wire Module Pages to tRPC (The Big One)
*Estimated: 3–5 weeks depending on how many routers Prompt 1 reveals as stubs/missing.*

This is broken into sub-prompts by module group. For each: create the router if missing,
make it DB-backed if it's a stub, and wire the page if it's still on mock data.

**IMPORTANT INSTRUCTION FOR ALL SUB-PROMPTS:**
```
For every module router you create or fix:
- Every query MUST include WHERE org_id = ctx.orgId (use withOrg helper)
- Every mutation MUST use permissionProcedure(module, action) — not just protectedProcedure
- Every mutation MUST be covered by the audit middleware (already automatic if using permissionProcedure)
- Every list query MUST support pagination (cursor or offset, limit default 50)
- Every create on a numbered entity MUST auto-generate org-scoped sequential numbers
  (e.g., "INC-0001" for tickets, "CHG-0001" for changes, "PR-0001" for purchase reqs)
  Use a pg advisory lock or SELECT FOR UPDATE to prevent race conditions.
- Every page.tsx MUST use trpc.xxx.useQuery / useMutation — NO hardcoded arrays
- Show loading skeletons while data loads (use the existing shadcn Skeleton component)
- Show empty state when no data (keep existing empty state designs if they exist)
- Keep ALL existing UI (table columns, badges, status bars, tabs). Only change the data source.
```

#### Sub-prompt 5a: ITSM (Tickets + Escalations + On-Call)
```
[Audit result from Prompt 1 will tell you if tickets router exists or is a stub]

If tickets router is missing or stub, create apps/api/src/routers/tickets.ts:
  tickets.list — permissionProcedure('incidents', 'read')
    Input: { status?, priority?, assignee?, category?, type?, search?, cursor?, limit? }
    Paginated. Full-text search via tsvector on title+description.
    Returns { items, nextCursor, statusCounts: { open, in_progress, resolved, closed } }

  tickets.get — permissionProcedure('incidents', 'read')
    Returns ticket + comments (filter internal if user lacks write) + watchers + relations

  tickets.create — permissionProcedure('incidents', 'write')
    Auto-number "INC-XXXX". Set SLA deadlines from priority. Audit log.

  tickets.update — permissionProcedure('incidents', 'write')
    Partial update. Diff for audit. SLA recalc on priority/status change.
    Status → resolved sets resolved_at. Status → closed sets closed_at.

  tickets.addComment — permissionProcedure('incidents', 'write')
  tickets.assign — permissionProcedure('incidents', 'assign')
  tickets.bulkUpdate — permissionProcedure('incidents', 'write')
  tickets.getStatusCounts — protectedProcedure
  tickets.listEscalations — protectedProcedure (SLA-breached or within 30 min of breach)

Wire /app/tickets/page.tsx, /app/tickets/new/page.tsx, /app/escalations/page.tsx.
Replace ALL mock data with tRPC hooks. Keep existing UI.
```

#### Sub-prompt 5b: Changes + Problems + Releases
```
changes.list, .get, .create ("CHG-XXXX"), .update,
.submitForApproval (creates approval_request), .cabVote (permissionProcedure approve),
.getCalendar (scheduled changes in date range)

problems.list, .get, .create ("PRB-XXXX"), .update,
.linkIncident, .createKnownError
knownErrors.list

releases.list, .get, .create, .update, .linkChange

Wire /app/changes, /app/problems, /app/releases. Replace mock data.
```

#### Sub-prompt 5c: Assets + CMDB
```
assets.list, .get, .create ("AST-XXXX"), .update, .assign (history entry), .retire, .dispose
assets.bulkImport (array input for CSV upload)

cmdb.listCIs, .getCI, .createCI, .updateCI,
.addRelationship, .removeRelationship,
.getTopology (nodes + edges for graph), .impactAnalysis (recursive CTE)

licenses.list (with utilization %), .get, .create, .update, .assign, .revoke, .expiringWithin

Wire /app/cmdb, /app/ham, /app/sam.
```

#### Sub-prompt 5d: HR + Employee Portal
```
hr.cases.list, .get, .create ("HR-XXXX"), .update, .addTask, .completeTask (auto-resolve),
hr.onboarding.createFromTemplate
hr.employees.list, .get, .create, .update, .getOrgChart
hr.leave.request, .approve, .reject, .getBalances
hr.documents.list, .upload

portal.myDashboard, .myPayslips, .myLeave, .myBenefits, .myProfile, .myAssets
  ALL scoped to ctx.user.id ONLY (G3 row-level enforcement)
portal.requestLeave, .submitRequest

Wire /app/hr, /app/hr/[id], /app/employee-portal.
```

#### Sub-prompt 5e: Security + GRC
```
security.incidents.list, .get, .create, .update,
.transition (enforce state machine — reject out-of-order),
.addIOC, .addContainment
security.vulnerabilities.list, .get, .create, .remediate

grc.risks.list, .get, .create, .update (auto-calc score = likelihood × impact)
grc.policies.list, .get, .create, .update, .publish
grc.audits.list, .get, .create, .addFinding
grc.vendorRisk.list, .get, .create, .update

Wire /app/security, /app/security/[id], /app/grc, /app/grc/[id].
```

#### Sub-prompt 5f: Procurement + Financial + Contracts
```
procurement.pr.list, .get, .create ("PR-XXXX"), .update,
  .submit (approval chain: <$1K auto, $1-10K dept head, >$10K VP+finance)
procurement.po.list, .get, .createFromPR, .update, .send,
  .receive (partial/full; auto-create assets if linked)
procurement.inventory.list, .get, .update, .checkReorderAlerts

financial.budget.list, .get, .create, .update, .getVariance
financial.invoices.list, .get, .create, .update, .approve, .markPaid,
  .threeWayMatch (PO vs receipt vs invoice comparison)
financial.chargebacks.list, .create
financial.ap.aging (group by 0-30/31-60/61-90/90+)
financial.ar.aging (group by customer + credit utilization)

contracts.list, .get, .create, .createFromWizard, .update,
  .transition (state machine), .getExpiringWithin
contracts.obligations.list, .markComplete

Wire /app/procurement, /app/financial, /app/contracts.
```

#### Sub-prompt 5g: CRM + CSM + Projects
```
crm.accounts, .contacts, .deals, .leads, .activities, .quotes — full CRUD each
crm.deals.movePipeline (stage change + audit)
crm.leads.convert (create deal from lead)
crm.dashboardMetrics, .salesAnalytics (funnel, leaderboard)

csm.cases.list, .get, .create, .update (with SLA, account linkage)

projects.list, .get, .create, .update
projects.milestones.list, .create, .update
projects.tasks.list, .create, .update, .getAgileBoard (group by status)
projects.getDashboardMetrics

Wire /app/crm, /app/csm, /app/projects, /app/projects/[id].
```

#### Sub-prompt 5h: All Remaining Modules
```
legal.matters, .legalRequests, .investigations — CRUD
  (investigations: confidential flag access control per G3)

facilities.buildings, .rooms, .rooms.checkAvailability,
  .bookings.list/create/cancel, .moveRequests, .facilityRequests

devops.pipelineRuns, .deployments, .doraMetrics, .getAgileBoard

apm.applications — CRUD + lifecycle

walkup.visits.joinQueue, .callNext, .complete (CSAT), .appointments

surveys.list, .get, .create, .update, .submitResponse, .getResults

knowledge.articles — CRUD + .recordView, .recordFeedback

catalog.items — CRUD, .requests.submit, .requests.fulfill

vendors — CRUD (may overlap with procurement — deduplicate)

admin.users, .slaDefinitions, .businessRules, .systemProperties,
  .notificationRules, .auditLog (from Prompt 4)

reports.executiveOverview, .slaDashboard, .workloadAnalysis, .trendAnalysis

approvals.myPending, .mySubmitted, .decide, .history

Wire ALL remaining pages. After this, every page.tsx reads from tRPC.
```

---

### PROMPT 6: Notification System
*Estimated: 3–4 days*

```
Build the notification pipeline for NexusOps:

1. apps/api/src/services/notifications.ts:
   send(userId, { title, body, link, type, sourceType, sourceId })
   - Always: insert into notifications table (in-app)
   - If SMTP configured: send email via Nodemailer
   - Future: Slack webhook (stub interface now)

2. apps/api/src/routers/notifications.ts:
   notifications.list — protectedProcedure (own notifications only)
     Paginated, unread first, then recent
   notifications.markRead — protectedProcedure
   notifications.markAllRead
   notifications.getUnreadCount (for header bell badge)

3. Wire AppHeader notification bell:
   Poll getUnreadCount every 60 seconds (or SSE if you want real-time)
   Click bell → dropdown showing recent notifications
   Click notification → navigate to link, mark as read

4. Auto-triggers (no workflow engine needed):
   After ticket.assign mutation: notify the assignee
   After approval created: notify the approver
   After leave.approve/reject: notify the employee
   After SLA breach check (scheduled or on status change): notify assignee + manager

5. Email sending:
   Use Nodemailer with SMTP config from env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
   If vars not set, log email to console instead of sending
   HTML email template with NexusOps branding
```

---

### PROMPT 7: Search
*Estimated: 2 days*

```
Wire Meilisearch for global search:

1. apps/api/src/services/search.ts:
   MeilisearchClient connecting to MEILISEARCH_URL with MEILISEARCH_KEY
   Indexes: tickets, assets, ci_items, kb_articles, employees, contracts, crm_deals
   Each: { id, org_id, title/name, description/content, type, status, number, created_at }

2. Index on entity create/update:
   After successful create/update mutations, index the entity to Meilisearch
   (async — don't block the response)

3. search.global — protectedProcedure
   Input: { query, entityTypes?: string[], limit?: number }
   Meilisearch search with filter: org_id = ctx.orgId
   Return: { results: [{ type, id, title, description, href }] }

4. Wire to AppHeader search bar:
   Debounce 300ms, call search.global
   Results grouped by type in dropdown
   Click → navigate to entity page

5. Wire to Knowledge Base search on /app/knowledge
```

---

### PROMPT 8: Security Hardening
*Estimated: 2 days*

```
Harden NexusOps for QA and pre-production:

1. HTTP HEADERS — in apps/web/next.config.js, add security headers:
   Content-Security-Policy (restrict script-src, style-src, connect-src to self + API URL)
   Strict-Transport-Security: max-age=31536000; includeSubDomains
   X-Frame-Options: DENY
   X-Content-Type-Options: nosniff
   Referrer-Policy: strict-origin-when-cross-origin

2. INPUT SANITIZATION:
   Every tRPC procedure that accepts text input (title, description, body, content)
   must sanitize before DB insert. Use DOMPurify (server-side, via isomorphic-dompurify)
   for any rich text field. For plain text: strip HTML tags.
   Install: pnpm --filter @nexusops/api add isomorphic-dompurify

3. API RATE LIMITING:
   Add @fastify/rate-limit to apps/api:
   - Global: 200 requests/min per user (by session token)
   - Auth endpoints: 10/min per IP (already partially done for login — extend to all auth.*)
   Install: pnpm --filter @nexusops/api add @fastify/rate-limit

4. CORS:
   Configure Fastify CORS to only allow the NEXT_PUBLIC_APP_URL origin
   (currently probably *, which is insecure).

5. FILE UPLOAD PREP:
   If any file upload endpoints exist (HR documents, ticket attachments):
   - Whitelist: pdf, png, jpg, jpeg, gif, doc, docx, xlsx, csv
   - Max size: 25MB
   - Store metadata in DB, actual file to S3 (or local /tmp for dev)
   If no upload endpoints exist yet, create a generic fileUpload.presignUrl
   procedure that returns a pre-signed S3 URL (for when S3 is configured).

6. SQL INJECTION VERIFICATION:
   Grep the codebase for any raw SQL (db.execute, sql``, or template literals with user input).
   All queries must use Drizzle parameterized queries. Flag and fix any raw SQL.

7. DEPENDENCY AUDIT:
   Run `pnpm audit` at repo root. Fix all high and critical vulnerabilities.
   If unfixable, document them with justification.
```

---

### PROMPT 9: Health Endpoints + Structured Logging
*Estimated: 1 day*

```
1. Health endpoints in apps/api:
   GET /health → { status: "ok", timestamp }
   GET /health/detailed → { 
     db: "ok" | "error", 
     redis: "ok" | "error" | "not_configured",
     meilisearch: "ok" | "error" | "not_configured",
     uptime: process.uptime(),
     version: package.json version
   }
   /health is public (no auth). /health/detailed requires adminProcedure or an API key.

2. Structured logging:
   Replace all console.log with pino logger.
   Install: pnpm --filter @nexusops/api add pino pino-pretty
   Create apps/api/src/lib/logger.ts — pino instance with:
   - JSON format in production, pretty in development
   - Correlation ID per request (generate UUID, attach to all log entries for that request)
   - Log: request method, path, status, duration, user_id, org_id
   - Don't log: request bodies (may contain sensitive data), password fields

3. Error handling:
   Global Fastify error handler that:
   - Logs the full error with stack trace
   - Returns sanitized error to client (no stack traces in production)
   - Returns TRPCError codes correctly
   - For unexpected errors: log as ERROR level, return 500 with generic message
```

---

### PROMPT 10: Test Infrastructure + Critical Path Tests
*Estimated: 3–4 days for infrastructure + core tests. Ongoing for full coverage.*

```
Set up test infrastructure and write tests for the critical path:

1. SETUP:
   Install: vitest, @testing-library/react, playwright, supertest
   
   apps/api/vitest.config.ts — API unit and integration tests
   apps/web/vitest.config.ts — component tests
   playwright.config.ts at repo root — E2E tests

   Test database: use DATABASE_URL_TEST env var pointing to a separate DB.
   Helper: beforeAll → run migrations; afterEach → truncate all tables.
   Helper: seedTestOrg() → creates one org + admin user for test isolation.

2. AUTH TESTS (apps/api/src/__tests__/auth.test.ts):
   - Register: creates org + user with hashed password
   - Login correct password → session with valid token
   - Login wrong password → 401
   - Login nonexistent email → 401 (same error, no enumeration)
   - Rate limit: 11th failed attempt → 429
   - Session: valid token → user data; expired → 401; garbage → 401
   - Logout → token invalidated → subsequent requests 401
   - Invite → accept → new user can login
   - Password reset → new password works, old doesn't

3. RBAC TESTS (apps/api/src/__tests__/rbac.test.ts):
   - Admin can call any permissionProcedure → allowed
   - itil role + incidents.write → allowed
   - requester role + incidents.write → 403
   - finance_manager + financial.admin → allowed
   - itil role + financial.admin → 403
   - Employee portal: user A cannot see user B's payslips

4. MULTI-TENANCY TESTS:
   - Seed two orgs with tickets
   - Org A user: tickets.list → only Org A tickets
   - Org A user: tickets.get(orgBTicketId) → not found
   - Org A user: tickets.update(orgBTicketId) → fails

5. MODULE TESTS (one per critical module):
   - tickets.create → auto-number INC-0001, SLA deadlines set
   - tickets.update status→resolved → resolved_at set
   - 50 concurrent ticket creates → no duplicate numbers
   - changes.submitForApproval → approval_request created
   - procurement.pr.submit $500 → auto-approved; $5000 → routed to approval
   - security.transition new→recovery → rejected (can't skip states)

6. E2E TESTS (Playwright):
   - Login with demo1234! → dashboard loads
   - Login with wrong password → error shown
   - /app/dashboard without session → redirect to /login
   - Create ticket via form → appears in list → view detail → add comment
   - Admin invite → open invite link → complete signup → login → see data

7. Package.json scripts:
   "test": "turbo test",
   "test:e2e": "playwright test",
   "test:ci": "turbo test && playwright test"
```

---

## Execution Order & Dependencies

```
Week 1:     PROMPT 1 (audit) → PROMPT 2 (auth) → PROMPT 3 (RBAC + org scope)
Week 2:     PROMPT 4 (audit system) → PROMPT 8 (security hardening)
Week 3-4:   PROMPT 5a-5b (ITSM, Changes, Problems)
Week 5-6:   PROMPT 5c-5d (Assets, CMDB, HR, Portal)
Week 7-8:   PROMPT 5e-5f (Security, GRC, Procurement, Financial, Contracts)
Week 9:     PROMPT 5g-5h (CRM, CSM, Projects, all remaining)
Week 10:    PROMPT 6 (notifications) + PROMPT 7 (search)
Week 11:    PROMPT 9 (health + logging) + PROMPT 10 (tests)
Week 12:    Full regression testing → QA handoff

TOTAL: ~12 weeks to QA-ready state
```

---

## What's Explicitly OUT OF SCOPE for QA Phase

These are post-QA / post-launch items. Do NOT attempt them before the above is done:

- Workflow engine (Temporal.io) — Phase 2
- AI layer (Claude API, embeddings) — Phase 2
- Virtual agent upgrade (Claude streaming) — Phase 2
- External integrations (Slack, Jira, SAP, IMAP) — Phase 2
- Webhook delivery system — Phase 2
- Production Docker images + Helm charts — Phase 3
- Terraform for Coheron-managed hosting — Phase 3
- CI/CD pipeline — Phase 3
- License key system — Phase 3
- Documentation site — Phase 3
- SSO / SAML — Phase 3 (enterprise feature)
- 2FA / TOTP — Phase 3 (enterprise feature)

The prompts above get NexusOps to a state where:
Every page shows real data from PostgreSQL, every mutation is permission-checked and audited,
every query is org-scoped, auth is secure with bcrypt + rate limiting + session validation,
search works, notifications work, and there's a test suite covering the critical path.

That's QA-ready.
