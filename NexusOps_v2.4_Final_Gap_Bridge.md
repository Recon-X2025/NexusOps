# NexusOps v2.4 → QA-Ready: Remaining Gaps

## What's Been Closed Since Last Review

The v2.4 build addressed the majority of the critical infrastructure gaps I flagged. Here's what's confirmed done:

**Auth (Prompts 2 fully done):** bcrypt login, SHA-256 hashed session tokens, sliding window expiry, Redis-backed rate limiting (email + IP), password reset flow with pages, invite accept page, session management (list + revoke). All confirmed with file paths.

**RBAC (Prompt 3 fully done):** `matrix_role` column on users, `withOrg` helper, `rbac-db.ts` updated to check matrixRole first, seed idempotency fixed, admin user management (list + update role).

**Audit (Prompt 4 fully done):** Rich payloads with `resource_id` + sanitised `changes`, `admin.auditLog.list` API, admin UI Audit Log tab wired with pagination + filters + expandable diff.

**Notifications (Prompt 6 fully done):** Live bell with 30s polling, dropdown, full `/app/notifications` page, `sendNotification` service with optional nodemailer, auto-triggers on tickets/WOs/changes/procurement.

**Security Headers (Prompt 8 partial):** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all set in `next.config.ts`.

**Infrastructure (Prompt 9 done):** Health + ready endpoints, Pino structured logging, CORS + Helmet + rate-limit plugins pre-existing.

**Module wiring (Prompt 5 partial — 9 of ~22 pages wired):**
- ✅ procurement, crm, knowledge, projects, cmdb, catalog, surveys, legal, devops
- ⏳ ham, sam, approvals, reports, problems, releases (explicitly listed as pending)
- ❓ tickets, changes, hr, employee-portal, security, grc, financial, contracts, csm, facilities, walk-up, apm, events, on-call, escalations, work-orders, vendors, admin (not listed either way)

---

## What's Actually Left — 6 Gaps to QA

| # | Gap | Effort | Severity |
|---|-----|--------|----------|
| R1 | ~13+ module pages still on mock data | 2–3 weeks | CRITICAL |
| R2 | Input sanitization on free-text fields | 1 day | HIGH |
| R3 | Row-level access enforcement (employee portal own-data, confidential investigations, internal comments) | 2 days | HIGH |
| R4 | Test suite — zero tests exist | 3–4 days | HIGH |
| R5 | Meilisearch wiring for global search | 2 days | MEDIUM |
| R6 | Remaining module-specific business logic (SLA timers, auto-numbering, state machines, approval chains) | 1 week | MEDIUM |

---

## PROMPT R1: Wire All Remaining Module Pages
*The single largest remaining task. 2–3 weeks.*

The doc confirms 9 pages are wired. The following pages are either explicitly pending or not mentioned — treat every one as needing verification and wiring.

```
AUDIT FIRST — before writing any new code, run this check:

For each page listed below, open the page.tsx file and check:
Does it import from trpc (e.g., trpc.xxx.useQuery)?
Or does it still use useState with hardcoded arrays?
Report the result for each page as: WIRED / MOCK / MIXED

Pages to check:
/app/tickets/page.tsx (the main queue — not the Overview KPI cards)
/app/tickets/new/page.tsx
/app/tickets/[id]/page.tsx
/app/escalations/page.tsx
/app/changes/page.tsx
/app/problems/page.tsx (doc says ⏳ Pending)
/app/releases/page.tsx (doc says ⏳ Pending)
/app/work-orders/page.tsx
/app/work-orders/parts/page.tsx
/app/work-orders/[id]/page.tsx
/app/on-call/page.tsx
/app/events/page.tsx
/app/ham/page.tsx (doc says ⏳ Pending)
/app/sam/page.tsx (doc says ⏳ Pending)
/app/security/page.tsx
/app/security/[id]/page.tsx
/app/grc/page.tsx
/app/grc/[id]/page.tsx
/app/compliance/page.tsx
/app/hr/page.tsx
/app/hr/[id]/page.tsx
/app/employee-portal/page.tsx
/app/employee-center/page.tsx
/app/csm/page.tsx
/app/financial/page.tsx
/app/contracts/page.tsx
/app/facilities/page.tsx
/app/walk-up/page.tsx
/app/apm/page.tsx
/app/vendors/page.tsx
/app/approvals/page.tsx (doc says ⏳ Pending)
/app/reports/page.tsx (doc says ⏳ Pending)
/app/secretarial/page.tsx
/app/admin/page.tsx (Audit Log tab is wired — check other 11 tabs)
/app/flows/page.tsx
/app/workflows/page.tsx

After the audit, for every page still on MOCK data:
```

### For each MOCK page, apply this pattern:

```
Wire {PAGE_NAME} to its tRPC router.

RULES (apply to EVERY page you wire):
1. Every query MUST include WHERE org_id = ctx.orgId (use withOrg helper)
2. Every mutation MUST use permissionProcedure(module, action)
3. Every list MUST support pagination (cursor or offset+limit, default 50)
4. Every create on a numbered entity MUST auto-generate org-scoped numbers
   using SELECT FOR UPDATE or pg advisory lock to prevent races
5. Replace ALL hardcoded mock arrays with trpc.xxx.useQuery / useMutation
6. Show Skeleton loading states while fetching
7. Show empty state when no data matches
8. Keep ALL existing UI — tables, columns, badges, tabs, charts. Only swap data source.
9. The audit middleware already fires on mutations — no extra audit code needed
10. sendNotification is already called by tickets/WOs/changes/procurement — 
    for other modules, add fire-and-forget notifications on relevant mutations
    (e.g., hr.cases.create → notify assignee, security.incidents.create → notify team)

If the tRPC router for the module exists but is missing procedures:
Add the missing procedures to the existing router.

If the tRPC router doesn't exist at all:
Create apps/api/src/routers/{module}.ts with full CRUD + module-specific operations.
Register it in the root appRouter.

SPECIFIC INSTRUCTIONS per module group:

ITSM (tickets, escalations, work-orders, on-call):
- tickets.list needs statusCounts for sidebar badges
- tickets.create needs auto-number "INC-XXXX" with pg advisory lock
- tickets.update needs SLA recalculation on priority/status change
- tickets.addComment with is_internal filtering (only incidents.write users see internal)
- escalations.list = tickets where sla_breached=true OR sla_resolve_deadline < now() + 30min
- work-orders CRUD with lifecycle state management

Changes + Problems + Releases:
- changes.create auto-number "CHG-XXXX"
- changes.submitForApproval creates approval_requests based on approval_chains config
- changes.cabVote needs permissionProcedure('changes', 'approve')
- problems.create auto-number "PRB-XXXX"
- problems.linkIncident, problems.createKnownError
- releases.linkChange

Assets (ham, sam):
- ham: assets.list filtered by category=hardware, .assign creates asset_history
- sam: licenses.list with utilization % (assigned/total), .assign checks seat availability

Security + GRC + Compliance:
- security.incidents.transition MUST enforce state machine order
  (new→triage→containment→eradication→recovery→closed — reject out-of-order)
- grc.risks auto-calculate risk_score = likelihood × impact on save
- compliance page: wire to grc.audits or a dedicated compliance router

HR + Employee Portal:
- hr.cases.create auto-number "HR-XXXX"
- hr.onboarding.createFromTemplate generates tasks with due dates
- employee-portal: ALL queries scoped to ctx.user.id ONLY (see Prompt R3)

Financial + Contracts:
- financial.invoices.threeWayMatch (compare PO vs receipt vs invoice)
- financial.ap.aging (group payables by 0-30/31-60/61-90/90+ days)
- financial.ar.aging (group by customer + credit utilization)
- contracts.createFromWizard (5-step data structure)
- contracts.transition enforces state machine

CSM + Facilities + Walk-Up + APM + Vendors:
- csm.cases with SLA tracking and account linkage
- facilities.rooms.checkAvailability before creating bookings
- walkup.joinQueue assigns queue position, .callNext advances queue
- apm.applications CRUD with lifecycle management
- vendors: deduplicate with procurement.vendors if both exist

Approvals:
- approvals.myPending — items requiring current user's decision
- approvals.mySubmitted — items current user requested
- approvals.decide — approve/reject with comments, fires notification
- This is cross-module: pulls from approval_requests table regardless of source

Reports:
- reports.executiveOverview — aggregate KPIs across modules
- reports.slaDashboard — SLA metrics from tickets/changes/HR by priority/team
- reports.workloadAnalysis — ticket counts per assignee, queue depth
- reports.trendAnalysis — time-series aggregation per module

Admin (remaining tabs):
- Check which of the 12 tabs already query tRPC vs render mock
- Wire: slaDefinitions, businessRules, systemProperties, notificationRules, scheduledJobs
  (User Management and Audit Log are already done per v2.4)
```

---

## PROMPT R2: Input Sanitization
*1 day. Doc explicitly says ⏳ Pending.*

```
Add input sanitization to NexusOps for all free-text fields:

1. Install: pnpm --filter @nexusops/api add isomorphic-dompurify
   pnpm --filter @nexusops/api add -D @types/dompurify

2. Create apps/api/src/lib/sanitize.ts:

   import DOMPurify from 'isomorphic-dompurify';

   // For rich text fields (ticket descriptions, KB articles, comments, contract clauses)
   export function sanitizeHtml(input: string): string {
     return DOMPurify.sanitize(input, {
       ALLOWED_TAGS: ['b', 'i', 'u', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 
                       'h1', 'h2', 'h3', 'a', 'code', 'pre', 'blockquote', 'table',
                       'thead', 'tbody', 'tr', 'th', 'td'],
       ALLOWED_ATTR: ['href', 'target', 'rel'],
     });
   }

   // For plain text fields (titles, names, short descriptions)
   export function sanitizeText(input: string): string {
     return input.replace(/<[^>]*>/g, '').trim();
   }

3. Apply in every tRPC mutation that accepts user text input:
   - Before db.insert or db.update, run the input through the appropriate sanitizer
   - Rich text fields (description, body, content, notes, resolution, clauses): sanitizeHtml
   - Plain text fields (title, name, subject, label): sanitizeText
   
   Pattern:
   .mutation(async ({ ctx, input }) => {
     const sanitized = {
       ...input,
       title: sanitizeText(input.title),
       description: input.description ? sanitizeHtml(input.description) : null,
     };
     await db.insert(table).values({ ...sanitized, orgId: ctx.orgId });
   })

4. Grep the codebase for any raw SQL (db.execute, sql`...` with string concatenation).
   All must use Drizzle parameterized queries. Fix any that don't.

5. Add Zod refinements for common attack vectors:
   - Max length on all text fields (title: 500, description: 50000, comment: 10000)
   - Email format validation where emails are accepted
   - URL format validation where URLs are accepted
```

---

## PROMPT R3: Row-Level Access Enforcement
*2 days. Flagged in prior review, not addressed in v2.4.*

```
Add row-level access rules to specific modules where data sensitivity requires it:

1. EMPLOYEE PORTAL — own-data-only enforcement:
   Every procedure in the employee portal router (portal.myPayslips, portal.myLeave,
   portal.myBenefits, portal.myProfile, portal.myAssets, etc.) MUST:
   
   - Filter by WHERE employee.user_id = ctx.user.id
   - If the user has hr_manager or admin matrix_role, allow access to any employee
     (for HR case management purposes)
   - Otherwise, requesting another employee's data returns empty result (not 403)
   
   This applies to: payslips, leave balances, leave requests, benefits, performance data,
   documents, and any other employee-personal data.

2. CONFIDENTIAL INVESTIGATIONS:
   In the legal router (legal.investigations.list and legal.investigations.get):
   - If investigation.confidential === true:
     Only return the investigation if:
     a) ctx.user.id === investigation.investigator_id, OR
     b) ctx.user has admin or security_admin matrix_role
   - Filter confidential investigations entirely from list results for other users
   - Do NOT return 403 — the user should not even know the investigation exists

3. INTERNAL TICKET COMMENTS:
   In the tickets router (tickets.get or wherever comments are returned):
   - ticket_comments where is_internal = true should be filtered from the response
     when the requesting user lacks permissionCheck('incidents', 'write')
   - Requesters (who submitted the ticket) should only see public comments
   - Agents and admins see all comments including internal notes

4. SECURITY INCIDENTS:
   In security.incidents.list:
   - Only return results if user has permissionCheck('security_incidents', 'read')
   - This should already be handled by permissionProcedure, but verify it's applied

5. SENSITIVE FINANCIAL DATA:
   In financial.invoices, financial.ap, financial.ar:
   - Ensure these are gated with permissionProcedure('financial', 'read') at minimum
   - Write/approve operations need 'write'/'approve' respectively
```

---

## PROMPT R4: Test Suite
*3–4 days for infrastructure + critical path. Expand ongoing.*

```
Set up test infrastructure and write critical-path tests for NexusOps:

1. SETUP:
   pnpm --filter @nexusops/api add -D vitest supertest
   pnpm add -D @playwright/test
   
   Create apps/api/vitest.config.ts:
   - Environment: node
   - Setup file that:
     a) Creates a test database (use DATABASE_URL_TEST or append _test to existing)
     b) Runs Drizzle migrations before all tests
     c) Truncates all tables between test suites (not between individual tests — too slow)
     d) Creates one test org + test users with known passwords

   Create a test helper: apps/api/src/__tests__/helpers.ts
   - seedTestOrg() → creates org + admin + agent + requester users, returns their IDs
   - loginAs(email) → calls auth.login, returns session token
   - authedCaller(token) → creates a tRPC caller with that session for direct procedure calls

2. AUTH TESTS (apps/api/src/__tests__/auth.test.ts):
   - auth.login correct password → returns session token
   - auth.login wrong password → throws UNAUTHORIZED
   - auth.login nonexistent email → throws UNAUTHORIZED (same error, no enumeration)
   - auth.login 11th failed attempt for same email → throws TOO_MANY_REQUESTS
   - Protected procedure with valid token → succeeds
   - Protected procedure with expired token → throws UNAUTHORIZED
   - Protected procedure with no token → throws UNAUTHORIZED
   - auth.logout → token no longer valid
   - auth.requestPasswordReset → no error (even for nonexistent email)
   - auth.resetPassword with valid token → password updated, old sessions invalidated
   - auth.invite + auth.acceptInvite → new user created in correct org with correct role

3. RBAC TESTS (apps/api/src/__tests__/rbac.test.ts):
   - User with matrix_role=admin → permissionProcedure('incidents', 'write') passes
   - User with matrix_role=itil → permissionProcedure('incidents', 'write') passes
   - User with matrix_role=requester → permissionProcedure('incidents', 'write') throws FORBIDDEN
   - User with matrix_role=finance_manager → permissionProcedure('financial', 'admin') passes
   - User with matrix_role=itil → permissionProcedure('financial', 'admin') throws FORBIDDEN
   - adminProcedure → passes for admin, throws for everyone else

4. MULTI-TENANCY TESTS (apps/api/src/__tests__/tenancy.test.ts):
   - Seed two orgs (Org A, Org B) each with a user and tickets
   - Org A user: tickets.list → only Org A tickets returned (verify count)
   - Org A user: tickets.get(orgBTicketId) → not found / empty
   - Org A user: tickets.update(orgBTicketId) → fails (no matching row)
   - tickets.create as Org A → org_id in DB matches Org A (not from input)

5. AUDIT TESTS (apps/api/src/__tests__/audit.test.ts):
   - Create a ticket → audit_logs row exists with action containing 'tickets'
   - Update a ticket → audit_logs row has resource_id matching ticket ID
   - audit_logs.changes does NOT contain 'password' or 'token' keys
   - admin.auditLog.list → returns entries, pagination works

6. MODULE SMOKE TESTS (one per wired module):
   For each module that's wired to tRPC, write one basic create+list test:
   - tickets.create → returns ticket with auto-number, SLA deadlines set
   - tickets.list → returns the created ticket
   - changes.create → returns change with auto-number
   - procurement.purchaseRequests.create → returns PR
   - crm.deals.create → returns deal
   - (repeat pattern for each wired module)

7. E2E TESTS (playwright):
   Create playwright.config.ts at repo root.
   
   - Login flow: navigate to /login, fill email+password, submit → redirected to /app/dashboard
   - Login wrong password: submit → error message shown, not redirected
   - Auth guard: navigate to /app/tickets without session → redirected to /login
   - Create ticket: login → go to /app/tickets/new → fill form → submit → 
     see ticket in list with correct number
   - Role switching: login → switch role via dropdown → tabs on module page change

8. Scripts:
   Add to root package.json:
   "test": "turbo run test",
   "test:e2e": "playwright test",
   "test:ci": "turbo run test && playwright test"
   
   apps/api/package.json:
   "test": "vitest run",
   "test:watch": "vitest"
```

---

## PROMPT R5: Meilisearch Global Search
*2 days. Infrastructure exists (docker-compose) but not wired.*

```
Wire Meilisearch to power the global search bar in NexusOps:

1. Install: pnpm --filter @nexusops/api add meilisearch

2. Create apps/api/src/services/search.ts:
   import { MeiliSearch } from 'meilisearch';
   
   const client = new MeiliSearch({
     host: process.env.MEILISEARCH_URL || 'http://localhost:7700',
     apiKey: process.env.MEILISEARCH_KEY || '',
   });

   const INDEXES = ['tickets', 'assets', 'ci_items', 'kb_articles', 
                     'employees', 'contracts', 'crm_deals', 'crm_accounts'];

   // Initialize indexes with filterable attributes
   export async function initSearchIndexes() {
     for (const index of INDEXES) {
       await client.index(index).updateFilterableAttributes(['org_id', 'status', 'type']);
       await client.index(index).updateSearchableAttributes(['title', 'name', 'description', 'content', 'number']);
     }
   }

   // Index a document (call after create/update mutations)
   export async function indexDocument(indexName: string, doc: {
     id: string; org_id: string; title?: string; name?: string; 
     description?: string; number?: string; type?: string; status?: string;
   }) {
     await client.index(indexName).addDocuments([doc], { primaryKey: 'id' });
   }

   // Global search scoped to org
   export async function globalSearch(query: string, orgId: string, entityTypes?: string[], limit = 20) {
     const indexes = entityTypes?.length ? entityTypes : INDEXES;
     const results = await Promise.all(
       indexes.map(idx => 
         client.index(idx).search(query, { 
           filter: `org_id = "${orgId}"`, 
           limit: Math.ceil(limit / indexes.length) 
         }).then(r => r.hits.map(h => ({ ...h, _index: idx })))
       )
     );
     return results.flat().slice(0, limit);
   }

3. Create tRPC route: search.global — protectedProcedure
   Input: { query: string, entityTypes?: string[], limit?: number }
   Calls globalSearch(input.query, ctx.orgId, input.entityTypes, input.limit)
   Returns array of { id, type, title, description, href } where href is computed
   from index name (tickets→/app/tickets/{id}, kb_articles→/app/knowledge, etc.)

4. Add indexing calls to existing mutation procedures:
   After tickets.create: indexDocument('tickets', { id, org_id, title, description, number, type, status })
   After assets.create: indexDocument('assets', { id, org_id, name, ... })
   After knowledge.create: indexDocument('kb_articles', { id, org_id, title, content })
   After contracts.create: indexDocument('contracts', { id, org_id, title, ... })
   After crm.deals.create: indexDocument('crm_deals', { id, org_id, title, ... })
   All fire-and-forget (don't await, don't block the mutation response).

5. Wire to AppHeader search bar:
   - Debounce 300ms on input change
   - Call trpc.search.global.useQuery({ query: debouncedQuery }, { enabled: query.length > 1 })
   - Show dropdown grouped by type (Tickets, Assets, Articles, Contracts, Deals)
   - Click result → router.push(result.href)
   - Keyboard: arrow keys navigate results, Enter selects

6. Call initSearchIndexes() on API server startup (in the Fastify boot sequence).

7. If MEILISEARCH_URL is not configured, search.global should return empty results
   with no error (graceful degradation).
```

---

## PROMPT R6: Business Logic Gaps
*1 week. These are domain-specific rules that distinguish a real product from a CRUD shell.*

```
Add the following business logic to the tRPC routers. These rules make the difference
between "data goes in and comes out" and "the system enforces real business processes."

1. AUTO-NUMBERING (all entity types):
   Create apps/api/src/lib/auto-number.ts:
   
   export async function getNextNumber(
     db: DrizzleDB, orgId: string, prefix: string, table: AnyTable
   ): Promise<string> {
     // Use pg advisory lock to prevent race conditions
     const lockKey = hashToInt(`${orgId}:${prefix}`); // consistent hash → int
     await db.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);
     
     const [last] = await db.select({ number: table.number })
       .from(table)
       .where(eq(table.orgId, orgId))
       .orderBy(desc(table.createdAt))
       .limit(1);
     
     const lastNum = last?.number ? parseInt(last.number.split('-')[1]) : 0;
     return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
   }

   Apply to: tickets (INC-), changes (CHG-), problems (PRB-), hr_cases (HR-),
   purchase_requisitions (PR-), purchase_orders (PO-), security_incidents (SEC-),
   contracts (CON-), csm_cases (CSM-), legal_matters (LEG-), work_orders (WO-)

2. SLA CALCULATION (tickets, HR cases, CSM cases):
   On ticket create: look up sla_policies matching the ticket's priority.
   Set: sla_response_deadline = now() + response_minutes
        sla_resolve_deadline = now() + resolve_minutes
   On ticket status change:
   - Status → "in_progress" (first response): check if within sla_response_deadline
   - Status → "resolved": check if within sla_resolve_deadline
   - Status → "open" (reopened): pause SLA clock was ticking; reset if needed
   - Set sla_breached = true if any deadline passed

3. SECURITY INCIDENT STATE MACHINE:
   Define valid transitions:
   const VALID_TRANSITIONS = {
     new: ['triage'],
     triage: ['containment', 'closed'],  // can close as false positive from triage
     containment: ['eradication'],
     eradication: ['recovery'],
     recovery: ['closed'],
     closed: [],  // terminal
   };
   
   In security.incidents.update (or .transition):
   if (!VALID_TRANSITIONS[current].includes(requested)) {
     throw new TRPCError({ 
       code: 'BAD_REQUEST',
       message: `Cannot transition from ${current} to ${requested}. Valid: ${VALID_TRANSITIONS[current].join(', ')}`
     });
   }

4. CONTRACT STATE MACHINE:
   const CONTRACT_TRANSITIONS = {
     draft: ['under_review'],
     under_review: ['legal_review', 'draft'],
     legal_review: ['awaiting_signature', 'under_review'],
     awaiting_signature: ['active', 'legal_review'],
     active: ['expiring_soon', 'terminated'],
     expiring_soon: ['active', 'expired', 'terminated'],
     expired: [],
     terminated: [],
   };
   Enforce on contracts.update when status changes.

5. PROCUREMENT APPROVAL CHAIN:
   On purchase_requisitions.submit:
   - Total < ₹75,000 → auto-approve (status → approved, no approval_request)
   - ₹75,000–₹7,50,000 → route to department head (create approval_request)
   - > ₹7,50,000 → sequential: VP approval then finance_manager approval
   Create approval_requests with correct sequence numbers.
   When last approval step is approved → PR status → approved.
   When any step is rejected → PR status → rejected.

6. 3-WAY MATCH (financial.invoices):
   financial.invoices.threeWayMatch({ invoiceId }):
   - Load invoice, its linked PO, and goods_receipts for that PO
   - Compare: invoice.amount vs PO.total_amount vs sum(goods_receipts quantities × unit prices)
   - Return { matched: boolean, variances: { invoice_vs_po: number, invoice_vs_receipt: number } }
   - If all within 2% tolerance → matched = true

7. APPROVAL WORKFLOW INTEGRATION:
   approvals.decide mutation:
   - On approve: check if all steps in the approval_request are now approved
     If yes: update the source entity status (change → approved, PR → approved, etc.)
     Fire notification to requester.
   - On reject: update source entity status to rejected.
     Fire notification to requester.
   The source entity type and ID should be stored on approval_requests.entity_type + entity_id.

8. LEAVE BALANCE MANAGEMENT:
   hr.leave.request:
   - Check leave_balances: does the employee have enough days?
     If pending_days + requested_days > (total_days - used_days) → reject with clear error
   - On request: increment pending_days
   - On approve: decrement pending_days, increment used_days
   - On reject: decrement pending_days
   - On cancel: decrement pending_days (if was pending) or decrement used_days (if was approved)
```

---

## Execution Order

```
Week 1:     PROMPT R2 (sanitization, 1 day) → PROMPT R3 (row-level access, 2 days) → 
            PROMPT R6 (business logic, start)
Week 2-3:   PROMPT R1 (wire remaining ~13 pages — largest task)
            PROMPT R6 (business logic, complete alongside wiring)
Week 4:     PROMPT R5 (search, 2 days) → PROMPT R4 (test suite, 3-4 days)
Week 5:     Full regression testing → QA handoff

TOTAL: ~5 weeks to QA-ready
```

---

## What's Out of Scope for QA (Unchanged from Prior Plan)

- Workflow execution engine (Temporal.io)
- AI layer (Claude API, embeddings, NL search)
- Virtual agent upgrade (Claude streaming)
- External integrations (Slack, Jira, SAP, IMAP)
- Webhook delivery system
- Production Docker / Helm / Terraform
- CI/CD pipeline
- License key system
- SSO / SAML / 2FA
- Documentation site

---

## QA Entry Criteria Checklist

When all 6 prompts above are complete, verify:

```
[ ] Every /app/* page loads data from PostgreSQL via tRPC (zero hardcoded mock arrays)
[ ] Every tRPC mutation uses permissionProcedure or adminProcedure
[ ] Every query includes WHERE org_id = ctx.orgId
[ ] Audit logs capture resource_id + changes on every mutation
[ ] Free-text inputs are sanitized before DB insert
[ ] Employee portal returns only logged-in user's data
[ ] Confidential investigations hidden from non-investigators
[ ] Internal ticket comments hidden from requesters
[ ] Security incident transitions enforce state machine
[ ] Contract transitions enforce state machine
[ ] Procurement approvals route by amount threshold
[ ] SLA deadlines set on ticket creation and checked on status change
[ ] Auto-numbering produces sequential, org-scoped IDs without duplicates under concurrency
[ ] Global search returns results from Meilisearch, scoped by org
[ ] Notifications fire on ticket/change/procurement/HR mutations
[ ] Auth: login rejects wrong passwords, rate limits after 10 failures, sessions are hashed
[ ] Password reset flow works end-to-end
[ ] Invite flow works end-to-end
[ ] Security headers present on all responses
[ ] Test suite passes: auth, RBAC, tenancy, audit, module smoke tests, E2E login+create
[ ] pnpm build completes without errors
```
