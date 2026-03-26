# NexusOps v2.2.0 → v3.0.0: Gaps to Production
## Every gap, its severity, and the exact Cursor AI prompt to close it

**Current state:** Monorepo with Next.js 15 frontend (28 modules), Fastify + tRPC 11 API, PostgreSQL + Drizzle ORM, basic email-only login, demo seed data. All 28 module pages still render from mock data/useState.

**Target:** Production-ready, multi-tenant, secure, deployable platform.

---

## Gap Map — At a Glance

| # | Gap | Severity | Status | Est. Effort |
|---|-----|----------|--------|-------------|
| G1 | Auth has no password verification | CRITICAL | **Bridged** (bcrypt + `password_hash`, login verify, failed-attempt limit) | 2 days |
| G2 | No SSO / SAML / invite flow / 2FA | CRITICAL | Open | 4 days |
| G3 | Session validation may not be server-side on every tRPC call | CRITICAL | **Verified** — `createContext` loads session from DB + expiry; `protectedProcedure` enforces user/org | 1 day |
| G4 | No server-side RBAC on tRPC procedures | CRITICAL | **Partially bridged** — shared matrix in `@nexusops/types` (`rbac-matrix.ts`), `permissionProcedure` + `rbac-db` maps `owner/admin/member/viewer` → matrix; wired on domain routers (tickets, assets, …). User-scoped routes (e.g. notifications inbox) stay `protectedProcedure` only. | 2 days |
| G5 | No org_id multi-tenancy enforcement at query level | CRITICAL | Open | 2 days |
| G6 | No audit log middleware on mutations | HIGH | **Partially bridged** — `protectedProcedure` runs `auditMutation` middleware: successful mutations → `audit_logs` (`action` = tRPC path, `resource_type` = top-level router name). No `resource_id` / `changes` payload yet; no dedicated `admin.auditLog.list` route. | 1 day |
| G7 | Schema completeness — verify all 80+ tables exist | HIGH | Partial | 3 days |
| G8 | 28 module pages not wired to tRPC (still mock data) | CRITICAL | Open | 5 weeks |
| G9 | No workflow execution engine (Temporal.io) | HIGH | Open | 3 weeks |
| G10 | No real notification system (email/in-app/Slack) | HIGH | Open | 1 week |
| G11 | No AI layer (Claude API, embeddings, NL search) | MEDIUM | Open | 2 weeks |
| G12 | No Meilisearch full-text search wiring | MEDIUM | Open | 3 days |
| G13 | No external integrations (Slack, Jira, Email inbound, SAP) | MEDIUM | Open | 1 week |
| G14 | No webhook delivery system | MEDIUM | Open | 3 days |
| G15 | No file/attachment storage (S3/MinIO) | MEDIUM | Open | 2 days |
| G16 | Virtual agent still pattern-matched (no Claude API) | MEDIUM | Open | 3 days |
| G17 | No production Docker images / Helm charts | MEDIUM | Open | 1 week |
| G18 | No Terraform for Coheron-managed hosting | MEDIUM | Open | 1 week |
| G19 | No CI/CD pipeline | MEDIUM | Open | 2 days |
| G20 | No license key system for self-hosted | LOW | Open | 2 days |
| G21 | No test suite (zero tests) | HIGH | Open | Ongoing |
| G22 | No security hardening (CSP, rate limiting, input sanitization) | HIGH | Open | 3 days |
| G23 | No observability (OpenTelemetry, health endpoints, structured logging) | LOW | Open | 2 days |
| G24 | No documentation site | LOW | Open | 1 week |
| G25 | Role switcher and DB session are dual systems (needs unification) | MEDIUM | Open | 1 day |

---

## G1 — Auth Has No Password Verification
**Severity:** CRITICAL  
**Current state (after bridge):** `users.password_hash` (nullable text) stores bcrypt (cost 12). `auth.login` verifies with `bcrypt.compare`; signup and `acceptInvite` persist hashes; seed sets `demo1234!` for all demo users. Failed-login rate limit: **10 failures / email / 5 minutes** (in-memory; upgrade to Redis for HA). Responses strip `passwordHash` from user objects; context middleware strips hash for `ctx.user`.  
**Deploy:** `pnpm db:push` then `pnpm db:seed` (or backfill `password_hash` for existing rows).  
**Risk (residual):** No SSO/2FA yet (G2); multi-instance needs shared rate-limit store.

### Cursor Prompt — G1

```
The current auth system in NexusOps (apps/api/src/routers/auth.ts) matches users by 
email only and does not verify passwords. The users table in packages/db has no 
password column.

Fix this:

1. In packages/db, add a `password_hash` column (text, nullable) to the users table.
   Generate a migration.

2. In apps/api/src/routers/auth.ts:
   - auth.register mutation: accept { email, password, name, orgSlug? }.
     Hash password with bcrypt (cost factor 12) before storing.
     If orgSlug provided, look up org and add user to it.
     If no orgSlug, create new org with the user as owner.
   - auth.login mutation: accept { email, password }.
     Look up user by email + org_id. 
     Compare password against stored hash with bcrypt.compare().
     If mismatch, return TRPCError UNAUTHORIZED with message "Invalid credentials".
     If match, create session as before.

3. Update packages/db/src/seed.ts:
   - Hash "demo1234!" with bcrypt and store in password_hash for all seeded users.
   - After migration, re-run: pnpm db:push && pnpm db:seed

4. Update the /login page (apps/web/src/app/login/page.tsx):
   - Ensure the password field value is actually sent to auth.login (not ignored).
   - Show error toast on invalid credentials.

5. Add rate limiting on auth.login: max 10 attempts per email per 5 minutes.
   Use a simple in-memory map or Redis counter (INCR + EXPIRE).
   Return 429 Too Many Requests after limit hit.

Install bcrypt: pnpm --filter @nexusops/api add bcrypt @types/bcrypt

Do NOT break existing seed logins — demo1234! must still work after this change,
but now it's actually verified.
```

### Test gate — G1
```
- Login with correct password → session created
- Login with wrong password → 401 "Invalid credentials"
- Login with nonexistent email → 401 (same message, no email enumeration)
- 11th failed attempt in 5 min → 429
- Seeded users can still log in with demo1234!
- password_hash in DB is bcrypt hash, not plaintext
```

---

## G2 — No SSO / SAML / Invite Flow / 2FA
**Severity:** CRITICAL  
**Current state:** Email+password only (once G1 is done). No way for enterprises to use Okta/Azure AD. No way for admins to invite team members. No two-factor auth.  
**Risk:** Enterprise deal-breaker. Every ServiceNow competitor requires SSO.

### Cursor Prompt — G2

```
Add enterprise auth features to NexusOps:

1. INVITE FLOW:
   - Add to packages/db schema: invitations table 
     (id uuid, org_id FK, email text, role text, invited_by FK users, 
      token text unique, expires_at timestamptz, accepted_at timestamptz nullable, created_at)
   - Add tRPC route in apps/api: auth.invite mutation
     Input: { email, role }. Requires admin permission.
     Generates crypto.randomUUID() token, stores in invitations, sends email 
     (for now, log the invite URL to console: /invite/{token}).
   - Add tRPC route: auth.acceptInvite mutation
     Input: { token, name, password }. 
     Validates token not expired and not already accepted.
     Creates user in the invitation's org with the specified role.
     Marks invitation as accepted. Creates session. Returns session.
   - Add page: apps/web/src/app/(auth)/invite/[token]/page.tsx
     Fetches invitation details (org name, role, inviter name).
     Shows signup form (name, password — email pre-filled from invitation).
     Submits to auth.acceptInvite. Redirects to /app/dashboard.
   - Add "Invite User" button in Admin Console → User Management tab.
     Opens dialog: email input, role dropdown, send button.
     Calls auth.invite. Shows success toast with "Invite sent" message.

2. GOOGLE OAUTH:
   - Install: pnpm --filter @nexusops/api add @fastify/oauth2
   - Add env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
   - Add Fastify route: GET /auth/google → redirects to Google OAuth consent
   - Add Fastify route: GET /auth/google/callback → exchanges code for profile,
     finds or creates user by email, creates session, redirects to /app/dashboard.
   - Add "Sign in with Google" button on /login page.

3. SAML SSO (Phase 2 — stub the interface now):
   - Add to packages/db: sso_configs table 
     (id, org_id, provider enum[okta/azure_ad/onelogin/custom], 
      metadata_url text, entity_id text, certificate text, 
      is_active boolean, created_at)
   - Add admin page section: /app/admin → Integration Hub → "SSO Configuration" 
     Form to input SAML metadata URL and certificate.
   - Add to /login: when user types email, check if their domain has an SSO config.
     If yes, show "Sign in with SSO" button that will redirect to IdP.
   - Implementation: use saml2-js or boxyhq/saml-jackson for SAML SP.
     For MVP, stub the redirect and document that full SAML is next sprint.

4. TWO-FACTOR AUTH (TOTP):
   - Add to packages/db: totp_secrets table (id, user_id FK, secret_encrypted text,
     is_enabled boolean, backup_codes text[], created_at)
   - Add tRPC routes: auth.setupTOTP (generates QR code URI), 
     auth.verifyTOTP (validates 6-digit code), auth.enableTOTP, auth.disableTOTP
   - On login, if user has TOTP enabled: return { requiresTOTP: true, sessionPending: id }
     Frontend shows TOTP input. User submits code → auth.verifyTOTP → full session.
   - Add to employee profile/settings: "Enable Two-Factor Authentication" section
     with QR code display and verification step.
   - Install: pnpm --filter @nexusops/api add otpauth qrcode

Prioritize invite flow and Google OAuth first (1-2 days).
SAML and TOTP can be stubbed with UI and implemented over the following week.
```

### Test gate — G2
```
- Admin creates invite → invitation record in DB with valid token
- Open /invite/{token} → shows signup form with email pre-filled
- Complete signup via invite → user created in correct org with correct role
- Expired invite token (>7 days) → "Invite expired" error
- Already-accepted invite → "Invite already used" error
- Google OAuth: click button → redirect to Google → callback creates/finds user → dashboard
- (SAML stub): domain with SSO config → "SSO" button appears on login
- (TOTP stub): enable 2FA → QR code shown → verify code → 2FA active
- Login with 2FA enabled → prompted for TOTP code → valid code → session
```

---

## G3 — Session Validation Not Confirmed Server-Side
**Severity:** CRITICAL  
**Current state:** Session stored in localStorage + cookie. Unclear if every tRPC call validates the token against the sessions DB table.  
**Risk:** If session tokens are trusted without server verification, the API is effectively unauthenticated.

### Cursor Prompt — G3

```
Verify and fix server-side session validation in NexusOps:

1. Open apps/api/src/routers/auth.ts and the tRPC context creation 
   (likely in apps/api/src/trpc.ts or apps/api/src/context.ts).

2. Ensure createTRPCContext does ALL of the following on EVERY request:
   a) Reads the session token from the Authorization header (Bearer {token}) 
      OR from the nexusops_session cookie
   b) Looks up the token in the sessions table in PostgreSQL
   c) Verifies the session is not expired (sessions.expires_at > now())
   d) Loads the user row (with role and org_id) from the session's user_id
   e) Attaches { user, org, session } to the tRPC context
   f) If any step fails: ctx.user = null, ctx.org = null

3. Create a protectedProcedure in apps/api/src/trpc.ts:
   - A tRPC middleware that checks ctx.user is not null
   - If null, throws TRPCError UNAUTHORIZED "Not authenticated"
   - All non-auth procedures should use protectedProcedure as their base

4. Create an adminProcedure:
   - Extends protectedProcedure
   - Additionally checks ctx.user.role === 'admin' (or is in elevated roles list)
   - If not, throws TRPCError FORBIDDEN "Admin access required"

5. Session cleanup:
   - auth.logout: deletes session from DB + clears cookie
   - Add a scheduled cleanup: delete sessions where expires_at < now()
     (can be a simple setInterval in the API server for now)

6. Session security:
   - Session token must be a cryptographically random string (crypto.randomBytes(32).toString('hex'))
   - Store token_hash (SHA-256) in DB, not the raw token
   - Compare by hashing the incoming token and matching against stored hash
   - Set session expiry to 24 hours by default
   - On each valid request, extend expiry by 24 hours (sliding window)

If the current implementation already does all of this correctly, 
document it with inline comments. If any step is missing, add it.
```

### Test gate — G3
```
- Request with valid session token → 200 with user data
- Request with expired session token → 401
- Request with garbage token → 401
- Request with no token → 401 (on protected procedures)
- auth.logout → subsequent requests with that token → 401
- Session token in DB is hashed (not plaintext)
- Valid request extends session expiry (verify updated expires_at)
```

---

## G4 — No Server-Side RBAC on tRPC Procedures
**Severity:** CRITICAL  
**Current state (post-bridge):** `packages/types/src/rbac-matrix.ts` is the shared matrix; `apps/web/src/lib/rbac.ts` re-exports it. API uses `permissionProcedure(module, action)` in `apps/api/src/lib/trpc.ts` with `checkDbUserPermission` in `rbac-db.ts` (`member` → `itil`, `viewer` → `report_viewer`, `owner`/`admin` → admin bypass). Most module routers use `permissionProcedure`; auth `me`/`logout` and user-scoped notification handlers use `protectedProcedure` without module checks.  
**Remaining:** Fine-grained row-level rules (confidential legal, “own tickets only” for requester), optional sync with `user_roles` table, and any new routers must pick module/action explicitly.  
**Risk if reverted:** Authorization bypass via API for routes that only use `protectedProcedure`.

### Cursor Prompt — G4

```
Add server-side RBAC enforcement to every tRPC procedure in NexusOps.

1. Copy the permission matrix from apps/web/src/lib/rbac.ts into a shared location.
   Best option: packages/types/src/rbac.ts — export the PERMISSION_MATRIX, 
   SystemRole type, PermissionModule type, PermissionAction type.
   Both apps/web and apps/api import from @nexusops/types.

2. In apps/api/src/trpc.ts, create:

   function checkPermission(
     userRole: string, module: string, action: string
   ): boolean {
     // Look up role in PERMISSION_MATRIX
     // Return true if role has the action for the module
     // Admin role always returns true
   }

   const permissionProcedure = (module: string, action: string) => 
     protectedProcedure.use(async ({ ctx, next }) => {
       if (!checkPermission(ctx.user.role, module, action)) {
         throw new TRPCError({ 
           code: 'FORBIDDEN', 
           message: `Permission denied: ${module}.${action}` 
         });
       }
       return next();
     });

3. Apply to the auth router as a pattern example:
   - auth.invite → permissionProcedure('admin_console', 'admin')
   - auth.me → protectedProcedure (any authenticated user)

4. Document the convention for ALL future routers:
   // Convention:
   // .list / .get queries → protectedProcedure (read access)
   // .create / .update → permissionProcedure(module, 'write')
   // .delete → permissionProcedure(module, 'delete')
   // .approve / .reject → permissionProcedure(module, 'approve')
   // .assign → permissionProcedure(module, 'assign')
   // admin/config operations → permissionProcedure(module, 'admin')

5. For module-specific read restrictions (e.g., investigations with confidential flag,
   employee portal showing only own data), add additional checks inside the procedure:
   
   // Example: employee portal
   if (ctx.user.id !== targetEmployeeUserId && !isAdmin(ctx.user.role)) {
     throw new TRPCError({ code: 'FORBIDDEN' });
   }

6. Update apps/web to import RBAC types from @nexusops/types instead of local rbac.ts.
   The client-side PermissionGate and server-side permissionProcedure now share
   the same source of truth.
```

### Test gate — G4
```
- itil role user calls permissionProcedure('incidents', 'write') → allowed
- requester role calls permissionProcedure('incidents', 'write') → 403
- requester role calls permissionProcedure('incidents', 'read') → allowed
- finance_manager calls permissionProcedure('financial', 'admin') → allowed
- itil role calls permissionProcedure('financial', 'admin') → 403
- admin role passes ALL permission checks
- Permission matrix is identical between server and client (import from same file)
```

---

## G5 — No Multi-Tenancy Enforcement at Query Level
**Severity:** CRITICAL  
**Current state:** Tables have org_id columns (via schema) but no middleware ensures queries are scoped. A user in Org A could theoretically access Org B data via crafted API calls.  
**Risk:** Data leak between tenants.

### Cursor Prompt — G5

```
Add org-scoping middleware to NexusOps so every query is tenant-isolated:

1. In apps/api/src/trpc.ts, enhance protectedProcedure:
   After verifying session, attach org_id to context:
   ctx.orgId = ctx.user.org_id  // guaranteed non-null for authenticated users

2. Create a helper in apps/api/src/lib/db-helpers.ts:

   import { and, eq, SQL } from 'drizzle-orm';
   
   // Use in every query:
   export function withOrg<T extends { org_id: typeof uuid }>(
     table: T, 
     orgId: string
   ) {
     return eq(table.org_id, orgId);
   }

   // Usage in routers:
   // const tickets = await db.select().from(ticketsTable)
   //   .where(and(withOrg(ticketsTable, ctx.orgId), ...otherFilters))

3. Create a Drizzle query wrapper that ALWAYS includes org_id:

   export function orgScopedQuery(db: DrizzleDB, orgId: string) {
     return {
       select: <T>(table: T) => db.select().from(table).where(eq(table.org_id, orgId)),
       insert: <T>(table: T, values: any) => db.insert(table).values({ ...values, org_id: orgId }),
       // etc.
     };
   }

4. In EVERY router that will be created, enforce the pattern:
   - Every SELECT includes WHERE org_id = ctx.orgId
   - Every INSERT sets org_id = ctx.orgId
   - Every UPDATE/DELETE includes WHERE org_id = ctx.orgId AND id = input.id
   - NEVER trust org_id from client input — always use ctx.orgId

5. Add a safety net: create a Drizzle plugin or middleware that logs a WARNING 
   if any query on an org-scoped table does NOT include an org_id filter.
   This catches mistakes during development.

6. For cross-org admin operations (Coheron internal admin panel only):
   - Create a separate superAdminProcedure that skips org scoping
   - Requires a special SUPER_ADMIN_KEY env var
   - Never exposed to regular users
```

### Test gate — G5
```
- Seed two orgs (Org A, Org B) with separate users and tickets
- User in Org A calls tickets.list → only Org A tickets returned
- User in Org A calls tickets.get with Org B ticket ID → not found (not 403, just empty)
- User in Org A calls tickets.update on Org B ticket → fails (row not found)
- Insert via tickets.create → org_id is always ctx.orgId regardless of input
- SQL log shows WHERE org_id = $1 on every query (or equivalent)
```

---

## G6 — No Audit Log Middleware
**Severity:** HIGH  
**Current state (post-bridge):** `protectedProcedure` composes `auditMutation` in `apps/api/src/lib/trpc.ts` — after a **successful** mutation it inserts into `audit_logs` (org, user, full tRPC path as `action`, router prefix as `resource_type`, IP, user agent). Failed mutations and queries are not logged.  
**Remaining:** `resource_id` and `changes` (sanitized), audit viewer API + admin UI, and whether to log failed/denied attempts.  
**Risk if incomplete:** Weaker forensics than full enterprise audit expectations.

### Cursor Prompt — G6

```
Add automatic audit logging to every tRPC mutation in NexusOps:

1. Create apps/api/src/middleware/audit.ts:

   import { db } from '@nexusops/db';
   import { auditLogs } from '@nexusops/db/schema';
   
   export function createAuditMiddleware(resourceType: string) {
     return middleware(async ({ ctx, next, type, path, rawInput }) => {
       const result = await next();
       
       // Only log mutations (not queries)
       if (type === 'mutation') {
         await db.insert(auditLogs).values({
           id: crypto.randomUUID(),
           org_id: ctx.orgId,
           user_id: ctx.user.id,
           action: path,  // e.g., "tickets.create", "tickets.update"
           resource_type: resourceType,
           resource_id: extractResourceId(rawInput, result),
           changes: sanitizeForAudit(rawInput),
           ip_address: ctx.ipAddress,
           user_agent: ctx.userAgent,
           created_at: new Date(),
         });
       }
       
       return result;
     });
   }
   
   // Extract resource ID from input (for updates/deletes) or result (for creates)
   function extractResourceId(input: any, result: any): string | null {
     return input?.id ?? result?.data?.id ?? null;
   }
   
   // Remove sensitive fields before logging
   function sanitizeForAudit(input: any): object {
     const sanitized = { ...input };
     delete sanitized.password;
     delete sanitized.token;
     delete sanitized.secret;
     return sanitized;
   }

2. Attach to permissionProcedure so it's automatic:
   Every mutation through permissionProcedure gets audited.
   No router needs to explicitly call audit — it just happens.

3. Add IP address and user agent to tRPC context:
   In createTRPCContext, read from Fastify request:
   ctx.ipAddress = request.headers['x-forwarded-for'] || request.ip
   ctx.userAgent = request.headers['user-agent']

4. Admin Console → Audit Log tab:
   Wire the existing UI to a tRPC route: admin.auditLog.list
   Input: { dateRange?, userId?, action?, resourceType?, page, limit }
   Returns paginated audit entries with user name and action description.
```

### Test gate — G6
```
- Create a ticket → audit_logs has entry with action="tickets.create"
- Update a ticket → audit_logs has entry with changes showing what changed
- Delete action → audit_logs has entry with resource_id
- Audit log entry has correct user_id, org_id, ip_address
- Password fields are NOT in the changes column
- Admin can view audit log via API; non-admin cannot
```

---

## G7 — Schema Completeness
**Severity:** HIGH  
**Current state:** packages/db has a schema but it's unclear if all 80+ tables for 28 modules are defined. The seed creates cross-module data but the full extent is unknown without inspecting the code.  
**Risk:** Module wiring (G8) will fail if tables are missing.

### Cursor Prompt — G7

```
Audit and complete the Drizzle schema in packages/db for all 28 NexusOps modules.

Open packages/db/src/schema/ and check every table against this required list.
For any table that DOES NOT EXIST, create it. For tables that exist but are 
missing columns, add the columns. Generate migrations for all changes.

REQUIRED TABLES (grouped by module):

ITSM: ticket_categories, ticket_priorities, ticket_statuses, tickets, 
  ticket_comments, ticket_watchers, ticket_relations, escalations, sla_policies

CHANGES: change_requests, change_approvals

PROBLEMS: problems, problem_incident_links, known_errors

RELEASES: releases, release_change_links

ASSETS: asset_types, assets, asset_history, ci_items, ci_relationships, 
  software_licenses, license_assignments

HR: employees, hr_cases, hr_case_tasks, onboarding_templates, leave_requests, 
  leave_balances, employee_documents, payslips

SECURITY: security_incidents, vulnerabilities

GRC: risks, policies, audit_plans, vendor_risks

PROCUREMENT: vendors, purchase_requisitions, pr_line_items, purchase_orders, 
  po_line_items, goods_receipts, inventory_items

FINANCIAL: budget_lines, invoices, chargebacks

CONTRACTS: contracts, contract_obligations

PROJECTS: projects, project_milestones, project_tasks

CRM: crm_accounts, crm_contacts, crm_deals, crm_leads, crm_activities, crm_quotes

CSM: csm_cases

LEGAL: legal_matters, legal_requests, investigations

FACILITIES: buildings, rooms, room_bookings, move_requests, facility_requests

DEVOPS: pipeline_runs, deployments

SURVEYS: surveys, survey_responses

KNOWLEDGE: kb_articles, kb_feedback

WORKFLOWS: workflows, workflow_versions, workflow_runs, workflow_step_runs

APPROVALS: approval_requests, approval_steps, approval_chains

NOTIFICATIONS: notifications, notification_preferences

INTEGRATIONS: integrations, integration_sync_log, webhooks, webhook_deliveries

WALKUP: walkup_visits, walkup_appointments

APM: applications

ONCALL: oncall_schedules

CATALOG: catalog_items, catalog_requests

AI: ai_usage_log

AUDIT: audit_logs (should already exist)

AUTH: organizations, users, sessions, api_keys, invitations (from G2)

For each table: ensure org_id FK exists, UUIDs for PKs, created_at with default,
proper indexes on (org_id), (org_id, status), (org_id, created_at).

Use pgEnum for all enum columns. Export everything from a barrel file.

After schema changes: pnpm db:push (or generate migration and run it).
Then update seed.ts to populate any new tables with demo data.
```

### Test gate — G7
```
- pnpm db:push runs without errors
- pnpm db:seed populates all tables (check row counts)
- Drizzle Studio (pnpm db:studio) shows all tables with correct columns
- Every table except organizations has org_id column
- All foreign keys resolve correctly
```

---

## G8 — 28 Module Pages Not Wired to tRPC
**Severity:** CRITICAL  
**Current state:** Every page.tsx under apps/web/src/app/app/ renders from hardcoded mock data arrays and useState. No tRPC calls are made from any module page.  
**Risk:** The product has no real functionality. This is the largest gap by effort.

**Strategy:** Work in priority order. Each module = 1 tRPC router + page refactor. Paste one prompt per module into Cursor.

### Cursor Prompt — G8a: ITSM (Tickets)

```
Create the tickets tRPC router and wire it to the existing tickets page.

1. Create apps/api/src/routers/tickets.ts:

   tickets.list — protectedProcedure
     Input: { status?, priority?, assignee?, category?, type?, search?: string,
       cursor?: string, limit?: number (default 50) }
     Query tickets table WHERE org_id = ctx.orgId, apply filters.
     Full-text search on title+description using PostgreSQL: 
       WHERE to_tsvector('english', title || ' ' || coalesce(description,'')) 
       @@ plainto_tsquery('english', input.search)
     Return { items: Ticket[], nextCursor, statusCounts: { open, in_progress, resolved, closed } }
   
   tickets.get — protectedProcedure
     Input: { id: string }
     Return ticket + comments (ordered by created_at) + watchers + relations.
     Comments: if current user lacks 'incidents.write' permission, filter out is_internal=true.
   
   tickets.create — permissionProcedure('incidents', 'write')
     Input: Zod schema { title, description?, categoryId?, priorityId, type, assigneeId? }
     Auto-generate number: SELECT max number for org → increment → "INC-" + padded.
     Use pg advisory lock to prevent race conditions on number generation.
     Set SLA deadlines from priority's sla_response_minutes / sla_resolve_minutes.
     Insert ticket. Create audit log. Return created ticket.
   
   tickets.update — permissionProcedure('incidents', 'write')
     Input: { id, ...partial fields }
     Fetch current ticket (with org scope). Compute diff. Update. Audit log with diff.
     If status changes to resolved: set resolved_at = now().
     If status changes to closed: set closed_at = now().
     If priority changes: recalculate SLA deadlines.
     Return updated ticket.
   
   tickets.addComment — permissionProcedure('incidents', 'write')
     Input: { ticketId, body, isInternal: boolean }
     Insert into ticket_comments. Return comment.
   
   tickets.assign — permissionProcedure('incidents', 'assign')
     Input: { ticketId, assigneeId, note?: string }
     Update ticket.assignee_id. Create audit entry. 
     If note provided, create internal comment.
   
   tickets.bulkUpdate — permissionProcedure('incidents', 'write')
     Input: { ids: string[], changes: { statusId?, priorityId?, assigneeId? } }
     Update all matching tickets (with org scope). One audit entry per ticket.
   
   tickets.getStatusCounts — protectedProcedure
     Return { open, in_progress, resolved, closed } counts for current org.

2. Register in apps/api/src/routers/_app.ts (or equivalent root router).

3. Refactor apps/web/src/app/app/tickets/page.tsx:
   - Import trpc from the client: import { trpc } from '@/lib/trpc'
   - Replace the mock data arrays with:
     const { data, isLoading } = trpc.tickets.list.useQuery({ ...filters })
   - The status filter sidebar: read counts from data.statusCounts
   - Table rows: map over data.items instead of mockTickets
   - Filter changes: update query params → useQuery refetches automatically
   - Keep ALL existing JSX, column definitions, ent-table class, status badges,
     priority bars, SLA indicators. Only change the data source.
   - Loading state: show skeleton/spinner while isLoading
   - Empty state: keep existing empty state component

4. Refactor apps/web/src/app/app/tickets/new/page.tsx:
   - Form submit calls trpc.tickets.create.useMutation()
   - On success: redirect to /app/tickets/{newTicket.id} and show success toast

5. If a ticket detail page exists (tickets/[id]/page.tsx), wire it:
   - trpc.tickets.get.useQuery({ id: params.id })
   - Comment form calls trpc.tickets.addComment.useMutation()
   - Assign dropdown calls trpc.tickets.assign.useMutation()

6. Wire /app/escalations page:
   Add tickets.listEscalations — returns tickets where sla_breached=true 
   OR sla_resolve_deadline < now() + interval '30 minutes'.
```

### Cursor Prompt — G8b: Changes + Problems + Releases

```
Create tRPC routers for change management, problem management, and release management.
Same pattern as tickets — router with CRUD + domain operations, then wire to pages.

apps/api/src/routers/changes.ts:
- changes.list, .get, .create (auto-number "CHG-XXXX"), .update
- changes.submitForApproval — create approval_request entries based on approval_chains
- changes.cabVote — permissionProcedure('changes', 'approve')
  Input: { changeId, decision: 'approved'|'rejected', comments }
- changes.getCalendar — returns changes with scheduled_start/end for calendar view

apps/api/src/routers/problems.ts:
- problems.list, .get, .create (auto-number "PRB-XXXX"), .update
- problems.linkIncident — input: { problemId, ticketId }
- problems.createKnownError — from problem, creates known_errors entry
- knownErrors.list — searchable known error database

apps/api/src/routers/releases.ts:
- releases.list, .get, .create, .update
- releases.linkChange — associate change with release

Wire each to their respective page.tsx. Replace mock data with tRPC hooks.
```

### Cursor Prompt — G8c: Assets + CMDB

```
apps/api/src/routers/assets.ts:
- assets.list (filterable by type/status/owner/location), .get (with history + CIs + licenses),
  .create (auto-tag "AST-XXXX"), .update, .assign (creates asset_history), .retire, .dispose
- assets.bulkImport — input: array of asset objects

apps/api/src/routers/cmdb.ts:
- cmdb.listCIs, .getCI (with relationships), .createCI, .updateCI
- cmdb.addRelationship, .removeRelationship
- cmdb.getTopology — return all CIs + relationships as { nodes, edges } for graph rendering
- cmdb.impactAnalysis — recursive CTE query traversing depends_on/runs_on from given CI

apps/api/src/routers/licenses.ts:
- licenses.list (with computed utilization %), .get, .create, .update
- licenses.assign (check seat availability), .revoke
- licenses.expiringWithin({ days })

Wire to /app/cmdb, /app/ham, /app/sam.
```

### Cursor Prompt — G8d: HR + Employee Portal

```
apps/api/src/routers/hr.ts:
- hrCases.list, .get, .create (auto-number "HR-XXXX"), .update
- hrCases.addTask, .completeTask (if all tasks done → auto-resolve case)
- onboarding.createFromTemplate — creates case + tasks with calculated due dates
- employees.list, .get, .create, .update
- employees.getOrgChart — tree from manager_id self-references
- leave.request, .approve, .reject, .getBalances
- documents.list, .upload (store metadata — actual file via S3 in G15)

apps/api/src/routers/employeePortal.ts:
IMPORTANT: every procedure returns ONLY current user's data (ctx.user.id).
- portal.myDashboard, .myPayslips, .myLeave, .myBenefits, .myProfile, .myAssets
- portal.requestLeave, .submitRequest

Wire to /app/hr, /app/hr/[id], /app/employee-portal.
```

### Cursor Prompt — G8e: Security + GRC

```
apps/api/src/routers/security.ts:
- securityIncidents.list, .get, .create, .update
- securityIncidents.transition — enforce state machine 
  (new→triage→containment→eradication→recovery→closed, no skipping)
- securityIncidents.addIOC, .addContainment
- vulnerabilities.list, .get, .create, .remediate

apps/api/src/routers/grc.ts:
- risks.list, .get, .create, .update (auto-calculate risk_score = likelihood × impact)
- policies.list, .get, .create, .update, .publish
- audits.list, .get, .create, .addFinding
- vendorRisk.list, .get, .create, .update

Wire to /app/security, /app/security/[id], /app/grc, /app/grc/[id].
```

### Cursor Prompt — G8f: Procurement + Financial + Contracts

```
apps/api/src/routers/procurement.ts:
- pr.list, .get, .create (auto-number "PR-XXXX"), .update
- pr.submit — approval chain by amount: <$1K auto, $1-10K dept head, >$10K VP+finance
- po.list, .get, .createFromPR, .update, .send
- po.receive — partial/full receipt; if linked to asset_type → auto-create assets
- inventory.list, .get, .update, .checkReorderAlerts

apps/api/src/routers/financial.ts:
- budget.list, .get, .create, .update, .getVariance
- invoices.list, .get, .create, .update, .approve, .markPaid
- invoices.threeWayMatch — compare invoice vs PO vs goods receipt, return variances
- chargebacks.list, .get, .create
- ap.aging — group payables by 0-30/31-60/61-90/90+ days
- ar.aging — group receivables by customer with credit utilization

apps/api/src/routers/contracts.ts:
- contracts.list, .get, .create, .createFromWizard (5-step), .update
- contracts.transition — enforce state machine
- contracts.getExpiringWithin({ days })
- obligations.list, .markComplete

Wire to /app/procurement, /app/financial, /app/contracts.
```

### Cursor Prompt — G8g: CRM + CSM + Projects

```
apps/api/src/routers/crm.ts:
- accounts.list, .get, .create, .update
- contacts.list, .get, .create, .update
- deals.list, .get, .create, .update, .movePipeline (stage change)
- leads.list, .get, .create, .update, .convert (create deal from lead)
- activities.list, .get, .create, .complete
- quotes.list, .get, .create, .send
- crm.dashboardMetrics, .salesAnalytics (funnel, leaderboard)

apps/api/src/routers/csm.ts:
- csmCases.list, .get, .create, .update (with SLA tracking, account linkage)

apps/api/src/routers/projects.ts:
- projects.list, .get, .create, .update
- milestones.list, .create, .update
- tasks.list, .create, .update, .getAgileBoard (grouped by status for kanban)
- projects.getDashboardMetrics

Wire to /app/crm, /app/csm, /app/projects, /app/projects/[id].
```

### Cursor Prompt — G8h: All Remaining Modules

```
Create tRPC routers for all remaining modules. Each follows standard CRUD + 
module-specific operations. Same org-scoping and permission patterns.

apps/api/src/routers/legal.ts:
- matters.list, .get, .create, .update (with confidential flag access control)
- legalRequests.list, .get, .create, .update
- investigations.list, .get, .create, .update
  (only investigator + admin can see confidential investigations)

apps/api/src/routers/facilities.ts:
- buildings.list, rooms.list, rooms.checkAvailability
- bookings.list, .create (check availability first), .cancel
- moveRequests.list, .create, .approve
- facilityRequests.list, .create, .update

apps/api/src/routers/devops.ts:
- pipelineRuns.list, .get, deployments.list, .get
- devops.doraMetrics — calculate from pipeline/deployment data
- devops.getAgileBoard

apps/api/src/routers/apm.ts:
- applications.list, .get, .create, .update

apps/api/src/routers/walkup.ts:
- visits.list, .joinQueue, .callNext, .complete (with CSAT)
- appointments.list, .create, .cancel

apps/api/src/routers/surveys.ts:
- surveys.list, .get, .create, .update
- surveys.submitResponse, .getResults (aggregated)

apps/api/src/routers/knowledge.ts:
- articles.list (searchable), .get, .create, .update
- articles.recordView, .recordFeedback

apps/api/src/routers/catalog.ts:
- catalogItems.list, .get, .create, .update
- catalogRequests.submit, .fulfill

apps/api/src/routers/vendors.ts:
- vendors.list, .get, .create, .update

apps/api/src/routers/admin.ts:
- All require permissionProcedure('admin_console', 'admin')
- users.list, .get, .update, .disable
- slaDefinitions.list, .create, .update
- businessRules.list, .create, .update
- systemProperties.list, .set
- notificationRules.list, .create, .update
- auditLog.list (paginated, filterable)

apps/api/src/routers/reports.ts:
- reports.executiveOverview, .slaDashboard, .workloadAnalysis, .trendAnalysis

apps/api/src/routers/approvals.ts:
- approvals.myPending, .mySubmitted, .decide, .history

Register ALL routers in the root appRouter. Wire each to its page.tsx.
```

### Test gate — G8 (run after all sub-prompts)
```
- Every /app/* page renders real data from PostgreSQL (not hardcoded arrays)
- Create a ticket via UI → appears in ticket list → view detail → add comment → resolve
- Create a change request → submit for approval → approve via /app/approvals → status updates
- Create purchase request → approval chain triggers → approve → convert to PO
- Employee portal shows only logged-in user's payslips and leave
- Security incident state machine enforced (can't skip from new to recovery)
- CMDB impact analysis returns correct dependency chain
- CRM deal pipeline move updates stage
- All mutations generate audit log entries
- All queries are org-scoped (verified with two-org test)
```

---

## G9 — No Workflow Execution Engine
**Severity:** HIGH  
**Current state:** /app/flows has a visual Flow Designer (React Flow) that draws nodes and edges. No execution runtime. Publishing a workflow does nothing.

### Cursor Prompt — G9

```
Wire the Flow Designer to a real workflow execution engine using Temporal.io:

1. Setup:
   - Add to docker-compose.dev.yml: temporalio/auto-setup:latest on port 7233
   - Install: pnpm --filter @nexusops/api add @temporalio/client @temporalio/worker 
     @temporalio/workflow @temporalio/activity
   - Create apps/api/src/temporal/client.ts — Temporal client
   - Create apps/api/src/temporal/worker.ts — worker process (separate entrypoint)

2. Workflow (apps/api/src/temporal/workflows/orchestrate.ts):
   Input: { workflowId, versionId, triggerData }
   - Load nodes + edges from workflow_versions table
   - Traverse graph: execute each node as a Temporal activity
   - Handle CONDITION nodes: evaluate expression, choose branch
   - Handle PARALLEL_GATEWAY: Promise.all on fork branches
   - Handle ACTION_WAIT: Temporal timer
   - Handle ACTION_APPROVAL: wait for Temporal signal
   - Record each step in workflow_step_runs

3. Activities (apps/api/src/temporal/activities/):
   assign.ts, update.ts, notify.ts, webhook.ts, approve.ts, create.ts, classify.ts
   Each: read config from node definition, execute against DB, return output.
   Retry policy: 3 attempts, exponential backoff (1s, 5s, 25s).

4. Triggers (apps/api/src/temporal/triggers.ts):
   Export function checkAndTriggerWorkflows(orgId, eventType, entityData).
   Called from ticket/change/HR/procurement routers after mutations.
   Finds active workflows matching trigger_type + evaluates trigger_config conditions.
   Starts Temporal workflow for each match.

5. tRPC additions:
   - workflows.publish → save version + activate
   - workflows.test → dry-run (activities log but don't execute side effects)
   - workflowRuns.list, .get (per-step detail), .cancel

6. Worker startup:
   Add script in package.json: "worker": "tsx src/temporal/worker.ts"
   Document: run alongside API server for workflow execution.
```

### Test gate — G9
```
- Create workflow: ticket_created + priority=critical → assign to user X → notify
- Create critical ticket → workflow runs → ticket assigned → notification created
- Create low priority ticket → workflow does NOT trigger
- Parallel gateway: both branches execute
- Dry-run: returns step outputs, no DB side effects
- Failed activity: retried 3x then marked failed
```

---

## G10 — No Notification System
**Severity:** HIGH

### Cursor Prompt — G10

```
Build notification pipeline:

1. apps/api/src/services/notifications.ts:
   send(userId, { title, body, link, type, sourceType, sourceId })
   - Always: insert into notifications table (in-app)
   - If user has email enabled for this event: send via Nodemailer (SMTP)
   - If Slack integration connected: POST to Slack DM

2. apps/api/src/routers/notifications.ts:
   - notifications.list (unread + recent, paginated)
   - notifications.markRead, .markAllRead
   - notifications.getUnreadCount (for header bell badge)
   - notifications.preferences.get, .update

3. SSE for real-time: apps/api route or Fastify plugin
   Client subscribes on app load. New notifications push immediately.
   Update AppHeader bell with live count.

4. Default triggers (no workflow needed):
   - Ticket assigned to me → notify
   - Approval required → notify
   - SLA approaching breach (15 min) → notify
   - Leave request decision → notify employee
```

---

## G11 — No AI Layer
**Severity:** MEDIUM

### Cursor Prompt — G11

```
Add AI features using Anthropic Claude API:

1. apps/api/src/services/ai/classification.ts:
   classifyTicket(title, description) → { category, priority, confidence }
   Claude claude-sonnet-4-20250514 with JSON output. Confidence >0.8 auto-apply, 0.5-0.8 suggest.
   Graceful fallback if ANTHROPIC_API_KEY not set.

2. apps/api/src/services/ai/search.ts:
   parseNaturalLanguageQuery(query) → structured filter object
   "critical tickets from last week" → { priority: 'critical', dateRange: '7d' }

3. apps/api/src/services/ai/suggestions.ts:
   getSuggestions(ticketId) → similar resolved tickets + KB articles
   Uses pgvector embeddings. Generate embeddings on ticket create/resolve.

4. apps/api/src/services/ai/conversational.ts:
   answerFromKB(question, orgId) → { answer, citations }
   Search KB articles via embeddings, synthesize with Claude.

5. Upgrade virtual-agent-widget.tsx:
   Replace if/else with Claude API streaming via tRPC subscription or fetch.
   System prompt with tool_use: search_tickets, create_ticket, search_kb.
   Keep existing UI (chat bubble, typing indicator, suggestion chips).
   Fallback to pattern-match if API key not configured.

6. Feature flags per org. Rate limiting. Usage tracking in ai_usage_log.
```

---

## G12 — No Meilisearch Wiring
**Severity:** MEDIUM

### Cursor Prompt — G12

```
Wire Meilisearch for full-text search across NexusOps:

1. apps/api/src/services/search.ts:
   - Connect to Meilisearch at MEILISEARCH_URL with MEILISEARCH_KEY
   - Indexes: tickets, assets, ci_items, kb_articles, employees, contracts, crm_deals
   - On entity create/update: index document { id, org_id, title, description, type, status }
   - search.global(query, orgId, entityTypes?) — searches across indexes, filters by org_id

2. Wire to AppHeader global search bar:
   - Debounced input calls search.global via tRPC
   - Results grouped by type (Tickets, Assets, KB Articles, etc.)
   - Click result → navigate to entity detail page

3. Wire to /app/knowledge search and portal KB search.
```

---

## G13–G16: Integrations, Webhooks, File Storage, Virtual Agent

These are covered in the previous gap-fill plan's Phase 5 (G13–G14), Phase 4 (G16), and are straightforward additions. Reference the prompts from the previous plan document for Slack/Jira/Email/SAP connectors, webhook delivery system with BullMQ retry, S3/MinIO file storage for attachments, and virtual agent Claude API upgrade.

---

## G17–G20: Production Deployment

### Cursor Prompt — G17+G18+G19+G20

```
Create production deployment infrastructure:

1. Docker (deploy/docker/):
   - Dockerfile.web — multi-stage Next.js production build, non-root user, <300MB
   - Dockerfile.api — Fastify + tRPC server
   - Dockerfile.worker — Temporal worker
   - docker-compose.prod.yml: web, api, worker, postgres, redis, meilisearch, temporal, minio
     Traefik reverse proxy with auto-SSL (Let's Encrypt)
   - .env.production.example

2. Helm (deploy/helm/nexusops/):
   - Chart.yaml, values.yaml, templates for: deployment-web, deployment-api, 
     deployment-worker, service, ingress, configmap, secret, hpa

3. Terraform (deploy/terraform/):
   - modules/aws: ECS or EKS, RDS PostgreSQL, ElastiCache, S3, ALB
   - modules/gcp: Cloud Run or GKE, Cloud SQL, Memorystore, Cloud Storage

4. CI/CD (.github/workflows/):
   - ci.yml: lint → type-check → test → build
   - deploy.yml: build images → push → deploy to staging → smoke → production

5. Health endpoints:
   - GET /api/health → { status: "ok" }
   - GET /api/health/detailed → { db, redis, meilisearch, temporal }

6. CLI (scripts/nexusops-cli.sh):
   nexusops migrate, seed, create-admin, backup, restore, health

7. License (apps/api/src/services/license.ts):
   Validate LICENSE_KEY (JWT with Coheron public key).
   Contains: plan, max_users, features[], expires_at.
   No key → community mode (5 users, tickets + dashboard only).
```

---

## G21 — No Tests
**Severity:** HIGH

### Cursor Prompt — G21

```
Set up the test infrastructure and write foundational tests:

1. Install: vitest, @testing-library/react, playwright, supertest
   Configure vitest.config.ts in apps/api and apps/web.
   Configure playwright.config.ts for E2E.

2. Test database: use a separate DATABASE_URL_TEST pointing to a test database.
   Before each test suite: run migrations, seed minimal data.
   After each suite: truncate all tables.

3. Write tests for every gap that was closed:
   - Auth: login, register, session validation, rate limiting (G1, G3)
   - RBAC: permission checks for each role (G4)
   - Multi-tenancy: org isolation (G5)
   - Audit: mutation logging (G6)
   - Tickets: CRUD, auto-number, SLA, search (G8a)
   - One test per module router verifying list + create + org-scope (G8b-h)
   - Workflow: trigger, execute, parallel, approval (G9)

4. E2E (Playwright):
   - Login → dashboard → create ticket → view → comment → resolve
   - Admin invite → accept → login as new user
   - Portal: view my payslips, request leave

5. Add to CI: pnpm test && pnpm test:e2e
```

---

## G22 — No Security Hardening
**Severity:** HIGH

### Cursor Prompt — G22

```
Harden NexusOps for production:

1. HTTP headers (apps/web/next.config.js):
   Content-Security-Policy, Strict-Transport-Security, X-Frame-Options: DENY,
   X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin

2. Input sanitization:
   - DOMPurify on all rich text inputs (ticket description, KB articles, comments)
   - Zod validation on every tRPC input (already using Zod — verify completeness)

3. Rate limiting (apps/api):
   - Auth endpoints: 10/min per IP
   - API endpoints: 200/min per user
   - Use @fastify/rate-limit or Redis-based counter

4. CORS: only allow NEXT_PUBLIC_APP_URL origin

5. File uploads: type whitelist (pdf/png/jpg/doc/xlsx/csv), max 25MB

6. SQL injection: verify all queries use Drizzle parameterized queries (no raw SQL)

7. npm audit: fix all high/critical vulnerabilities
```

---

## G23 — No Observability
**Severity:** LOW

### Cursor Prompt — G23

```
Add observability:

1. Structured logging: pino in apps/api with correlation IDs per request
2. OpenTelemetry: instrument tRPC procedures with trace spans
3. Health endpoints (covered in G17)
4. Error tracking: global error handler in Fastify, structured error responses
5. Request duration metrics: histogram per tRPC procedure
```

---

## G24 — No Documentation Site
**Severity:** LOW

### Cursor Prompt — G24

```
Create documentation using Nextra (apps/docs):

Structure:
- /getting-started: quickstart (Docker), first ticket, invite team
- /admin-guide: RBAC, workflows, templates, integrations, AI settings
- /modules: one page per module (28 pages — can be generated from build reference)
- /api-reference: auto-generated from tRPC using trpc-openapi
- /self-hosted: Docker, Kubernetes, configuration, upgrading, backup
- /coheron-managed: onboarding, SLA, compliance

Add in-app onboarding checklist for new admins (dismissable).
```

---

## G25 — Dual RBAC System Needs Unification
**Severity:** MEDIUM  
**Current state:** Header role-switcher drives client-side mock users from rbac.ts. Actual logged-in user comes from DB session. Both coexist.

### Cursor Prompt — G25

```
Unify the RBAC system:

1. Move PERMISSION_MATRIX to @nexusops/types (done in G4).

2. RBACProvider in apps/web/src/lib/rbac-context.tsx:
   - In production mode (NEXT_PUBLIC_DEMO_MODE !== 'true'):
     Read the logged-in user's role from the tRPC session (auth.me query).
     Remove the role switcher from the header.
   - In demo mode (NEXT_PUBLIC_DEMO_MODE === 'true'):
     Keep the role switcher for demos/sales presentations.
     The switcher overrides the UI permission checks only (server still enforces real role).

3. AppHeader: conditionally render role switcher based on NEXT_PUBLIC_DEMO_MODE.

4. All PermissionGate components continue to work — they read from RBACContext
   which now gets its data from the real session in production.
```

---

## Execution Order

The gaps have dependencies. Execute in this order:

```
Week 1:    G1 (password) → G3 (session) → G4 (server RBAC) → G5 (org scope) → G6 (audit)
Week 2:    G7 (schema completeness) → G25 (RBAC unification) → G2 (invite + OAuth)
Week 3-4:  G8a (tickets) → G8b (changes/problems) → G8c (assets/CMDB)
Week 5-6:  G8d (HR) → G8e (security/GRC) → G8f (procurement/financial/contracts)
Week 7:    G8g (CRM/CSM/projects) → G8h (remaining modules)
Week 8-10: G9 (workflow engine)
Week 11:   G10 (notifications) → G12 (Meilisearch)
Week 12-13: G11 (AI layer) → G16 (virtual agent)
Week 14:   G13 (integrations) → G14 (webhooks) → G15 (file storage)
Week 15-16: G17-G20 (deployment infra)
Week 17:   G22 (security hardening) → G21 (tests — ongoing but final gate here)
Week 18:   G23 (observability) → G24 (docs) → FINAL REGRESSION → v3.0.0
```

---

**Total: 25 gaps, 18 weeks, ~30 Cursor AI prompts.**

*NexusOps by Coheron — from prototype to production.*
