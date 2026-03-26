# NexusOps v2.5 — Exhaustive 10-Layer QA Validation Suite
## Each layer validates and improves on the previous. Nothing untouched.

**Philosophy:** This is not "does the happy path work." This is "can we break it, and if we can't, is it production-ready." Every route, every tRPC procedure, every permission boundary, every edge case, every concurrent scenario, every pixel-level UI contract. 10 QA passes, each building on the last, each one deeper.

---

## HOW TO USE THIS IN CURSOR

Paste this entire prompt into Cursor. It generates a single comprehensive test suite that runs sequentially. Each "layer" is a test file or group. Layer N assumes Layer N-1 passed and probes deeper. When the full suite runs green, the platform is production-ready. When it doesn't, the failures are your punch list.

---

## CURSOR PROMPT — BEGIN

```
Build an exhaustive, 10-layer QA test suite for the NexusOps platform.
Every layer validates and deepens the previous layer's coverage.
Nothing in the application is left untested.

The test suite lives in: apps/api/src/__tests__/ (vitest) and e2e/ (Playwright).
All tests must be runnable via: pnpm test && pnpm test:e2e

Global test infrastructure (create if not already present):

apps/api/src/__tests__/setup.ts:
- Before all: connect to test DB (DATABASE_URL_TEST or append _test to DATABASE_URL)
- Before all: run Drizzle migrations (drizzle-kit push)
- After all: drop test database or truncate all tables
- Export: testDb (Drizzle client for test DB)

apps/api/src/__tests__/helpers.ts:
- seedTestOrg(): creates org "QA Test Org" with slug "qa-test", returns { orgId, org }
- seedUser(orgId, { email, role, matrixRole, password }): creates user with bcrypt hash, returns { userId, user }
- seedFullOrg(): creates org + admin + agent (itil) + hr_manager + finance_manager + 
  requester + viewer users. Returns all IDs.
- createSession(userId): creates session row, returns raw token (unhashed)
- authedCaller(token): creates tRPC caller with that session for direct procedure invocation
- loginAndGetToken(email, password): calls auth.login, returns session token
- makeContext(userId, orgId): builds a mock tRPC context for unit testing procedures
- cleanupOrg(orgId): deletes all data for an org (cascade)

apps/api/src/__tests__/fixtures.ts:
- TICKET_FIXTURES: 20 ticket objects covering all priorities (P1-P4), all types 
  (incident/request/problem/change), all statuses, with and without assignees
- CHANGE_FIXTURES: 10 changes across all types and states
- HR_CASE_FIXTURES: 10 HR cases across all types
- CRM_FIXTURES: { accounts: 5, contacts: 10, deals: 8, leads: 10, activities: 20, quotes: 3 }
- PROCUREMENT_FIXTURES: { vendors: 5, prs: 5 (varying amounts for approval chain testing), pos: 3 }
- ASSET_FIXTURES: { hardware: 10, software_licenses: 5, ci_items: 8, ci_relationships: 12 }
- CONTRACT_FIXTURES: 5 contracts across all states
- SECURITY_FIXTURES: { incidents: 5 across all states, vulnerabilities: 8 }
- GRC_FIXTURES: { risks: 5, policies: 3, audits: 2, vendorRisks: 3 }
- FINANCIAL_FIXTURES: { budgetLines: 10, invoices: 8, chargebacks: 3 }
- All fixtures include org_id placeholder to be replaced with test org's ID

=============================================================================
LAYER 1: INFRASTRUCTURE INTEGRITY
Purpose: Verify the foundation is solid before testing anything on top of it.
File: apps/api/src/__tests__/layer1-infrastructure.test.ts
=============================================================================

describe('Layer 1: Infrastructure Integrity', () => {

  describe('1.1 Database Schema Completeness', () => {
    // Query information_schema.tables and verify EVERY expected table exists
    // Tables to verify (exhaustive list):
    test('organizations table exists with correct columns', async () => {
      // Verify: id, name, slug, plan, settings, logo_url, primary_color, domain, created_at, updated_at
    });
    test('users table exists with all columns including password_hash and matrix_role', async () => {
      // Verify: id, org_id, email, name, avatar_url, role, status, matrix_role, 
      // password_hash, last_login_at, created_at, updated_at
    });
    test('sessions table exists with hashed token storage', async () => {
      // Verify: id (stores hash), user_id, expires_at, ip_address, user_agent, created_at
    });
    test('audit_logs table exists with resource_id and changes columns', async () => {
      // Verify: id, org_id, user_id, action, resource_type, resource_id, changes, 
      // ip_address, user_agent, created_at
    });
    // Repeat for EVERY table in the schema:
    // tickets, ticket_comments, ticket_watchers, ticket_relations, ticket_categories,
    // ticket_priorities, ticket_statuses, sla_policies, escalations,
    // change_requests, change_approvals,
    // problems, problem_incident_links, known_errors,
    // releases, release_change_links,
    // assets, asset_types, asset_history, ci_items, ci_relationships,
    // software_licenses, license_assignments,
    // employees, hr_cases, hr_case_tasks, onboarding_templates,
    // leave_requests, leave_balances, employee_documents, payslips,
    // security_incidents, vulnerabilities,
    // risks, policies, audit_plans, vendor_risks,
    // vendors, purchase_requisitions, pr_line_items, purchase_orders,
    // po_line_items, goods_receipts, inventory_items,
    // budget_lines, invoices, chargebacks,
    // contracts, contract_obligations,
    // projects, project_milestones, project_tasks,
    // crm_accounts, crm_contacts, crm_deals, crm_leads, crm_activities, crm_quotes,
    // csm_cases,
    // legal_matters, legal_requests, investigations,
    // buildings, rooms, room_bookings, move_requests, facility_requests,
    // pipeline_runs, deployments,
    // surveys, survey_responses,
    // kb_articles, kb_feedback,
    // workflows, workflow_versions, workflow_runs, workflow_step_runs,
    // approval_requests, approval_steps, approval_chains,
    // notifications, notification_preferences,
    // integrations, integration_sync_log, webhooks, webhook_deliveries,
    // walkup_visits, walkup_appointments,
    // applications,
    // oncall_schedules,
    // catalog_items, catalog_requests,
    // ai_usage_log,
    // verification_tokens (for password reset)
    
    test('every org-scoped table has org_id column', async () => {
      // Query information_schema for ALL tables, exclude organizations itself
      // Verify each has org_id column
      // FAIL if any table is missing org_id
    });
    
    test('every org-scoped table has index on org_id', async () => {
      // Query pg_indexes, verify idx exists on org_id for every relevant table
    });

    test('all foreign keys resolve correctly', async () => {
      // Query information_schema.table_constraints for FK constraints
      // Verify each FK references a valid table and column
    });

    test('all enum types are defined', async () => {
      // Query pg_type for custom enums
      // Verify each enum has the expected values
    });
  });

  describe('1.2 tRPC Router Registry', () => {
    // Import the root appRouter and verify every expected router is registered
    test('root appRouter has all expected routers', async () => {
      // Verify these keys exist on the router:
      // auth, tickets, changes, problems, assets, hr, security, grc, 
      // procurement, financial, contracts, crm, csm, legal, projects,
      // devops, knowledge, catalog, surveys, admin, notifications,
      // search, approvals, reports, apm, oncall, events, facilities,
      // walkup, vendors, workflows
      // FAIL listing any missing router
    });

    test('every router procedure uses protectedProcedure or permissionProcedure', async () => {
      // For each router, inspect its procedures
      // Verify none use publicProcedure (except auth.login, auth.register, 
      // auth.requestPasswordReset, auth.resetPassword, auth.acceptInvite)
      // FAIL listing any unprotected procedure that should be protected
    });
  });

  describe('1.3 Server Boot', () => {
    test('Fastify server starts without errors', async () => {
      // Import and boot the server, verify it listens
    });
    test('GET /health returns 200 with { status: "ok" }', async () => {});
    test('GET /ready returns 200 when DB is connected', async () => {});
    test('tRPC endpoint responds to valid requests', async () => {
      // POST to tRPC endpoint with auth.me, verify structured response
    });
    test('CORS headers are set correctly', async () => {
      // Verify Access-Control-Allow-Origin is not *
    });
    test('Helmet security headers present', async () => {
      // Verify X-Content-Type-Options, X-Frame-Options on API responses
    });
  });

  describe('1.4 Seed Data Integrity', () => {
    test('pnpm db:seed is idempotent — running twice produces no errors', async () => {
      // Run seed programmatically twice, verify no duplicate key errors
    });
    test('seed creates exactly 7 demo users', async () => {
      // Verify: admin, agent1, agent2, hr, finance, employee, viewer
    });
    test('all seeded users have password_hash set', async () => {
      // Query users, verify none have null password_hash
    });
    test('seeded users have correct matrix_role assignments', async () => {
      // hr@coheron.com → hr_manager, finance@coheron.com → finance_manager, etc.
    });
    test('seed creates cross-module demo data', async () => {
      // Verify: tickets exist, assets exist, contracts exist, etc.
      // At least 5 rows per major entity table
    });
  });
});


=============================================================================
LAYER 2: AUTHENTICATION — EVERY PATH, EVERY EDGE CASE
Purpose: Prove the auth system cannot be bypassed, abused, or confused.
File: apps/api/src/__tests__/layer2-auth.test.ts
=============================================================================

describe('Layer 2: Authentication', () => {

  describe('2.1 Login — Happy Path', () => {
    test('valid email + correct password → session token returned', async () => {});
    test('returned token is not the session ID in the DB (DB stores hash)', async () => {
      // Login, get token, SHA-256 hash it, verify sessions.id matches the hash
    });
    test('session has expires_at set to ~24h from now', async () => {});
    test('users.last_login_at is updated on successful login', async () => {});
  });

  describe('2.2 Login — Rejection Cases', () => {
    test('wrong password → UNAUTHORIZED, generic message', async () => {
      // Verify error message does NOT say "wrong password" (prevents enumeration)
    });
    test('nonexistent email → UNAUTHORIZED, same generic message as wrong password', async () => {
      // MUST be identical error to prevent email enumeration
    });
    test('user with status=disabled → UNAUTHORIZED', async () => {
      // Create disabled user, attempt login, verify rejection
    });
    test('user with null password_hash → UNAUTHORIZED', async () => {
      // Create user without password, attempt login
    });
    test('empty email → validation error (Zod)', async () => {});
    test('empty password → validation error (Zod)', async () => {});
    test('email with SQL injection attempt → sanitized, returns UNAUTHORIZED', async () => {
      // Try: "admin@coheron.com'; DROP TABLE users; --"
    });
    test('email with XSS payload → sanitized', async () => {
      // Try: "<script>alert(1)</script>@evil.com"
    });
    test('extremely long email (10000 chars) → validation error', async () => {});
    test('extremely long password (10000 chars) → rejected before bcrypt (DoS prevention)', async () => {
      // bcrypt has a 72-byte limit. Verify the system handles this gracefully.
    });
  });

  describe('2.3 Rate Limiting', () => {
    test('10 failed logins for same email → 11th returns TOO_MANY_REQUESTS', async () => {
      // Rapid-fire 10 bad passwords, then try once more
    });
    test('rate limit is per-email (different email is not blocked)', async () => {
      // Exhaust limit for email A, verify email B still works
    });
    test('rate limit has per-IP component', async () => {
      // Verify IP-based limiting exists (may need to mock IP header)
    });
    test('successful login after rate limit window expires', async () => {
      // If using 15-min TTL, either wait or mock Redis TTL
    });
    test('rate limit counter resets on successful login', async () => {
      // Or verify it doesn't — document the behavior
    });
  });

  describe('2.4 Session Validation', () => {
    test('valid token → ctx.user and ctx.org populated', async () => {});
    test('expired token → UNAUTHORIZED', async () => {
      // Create session with expires_at in the past, try to use it
    });
    test('token that was never issued → UNAUTHORIZED', async () => {
      // Random UUID as token
    });
    test('token from deleted session → UNAUTHORIZED', async () => {
      // Login, delete session row, try to use token
    });
    test('token from different org → still works but ctx.org matches the user\'s org', async () => {
      // Verify session is tied to user, not to any arbitrary org
    });
    test('sliding window: session expires_at extends on valid request', async () => {
      // Login, record expires_at, make a request, verify expires_at moved forward
    });
    test('sliding window: extension does not exceed 24h from current time', async () => {});
    test('Bearer token in Authorization header works', async () => {});
    test('nexusops_session cookie works', async () => {});
    test('both provided — Bearer takes precedence (or verify actual behavior)', async () => {});
    test('malformed Authorization header (no Bearer prefix) → UNAUTHORIZED', async () => {});
    test('empty Bearer token → UNAUTHORIZED', async () => {});
  });

  describe('2.5 Session Management', () => {
    test('auth.listMySessions returns only current user sessions', async () => {
      // Login as user A and user B, verify A only sees A's sessions
    });
    test('auth.revokeSession deletes the specified session', async () => {
      // Login, get session list, revoke one, verify it's gone
    });
    test('cannot revoke another user\'s session', async () => {
      // User A tries to revoke user B's session ID → should fail or silently ignore
    });
    test('auth.logout invalidates the current session', async () => {
      // Logout, try to use the same token → UNAUTHORIZED
    });
    test('logout does not affect other sessions for same user', async () => {
      // Login twice (two sessions), logout one, verify the other still works
    });
  });

  describe('2.6 Password Reset', () => {
    test('requestPasswordReset for existing email → creates verification_token', async () => {
      // Verify token row exists in DB
    });
    test('requestPasswordReset for nonexistent email → no error (prevents enumeration)', async () => {
      // Verify same success response as for existing email
    });
    test('resetPassword with valid token → password updated', async () => {
      // Request reset, get token from DB, call resetPassword, login with new password
    });
    test('resetPassword invalidates all existing sessions for that user', async () => {
      // Login (session A), request reset, reset password, verify session A is dead
    });
    test('resetPassword with expired token → error', async () => {
      // Create token with expires_at in the past
    });
    test('resetPassword with already-used token → error', async () => {
      // Use token once, try to use it again
    });
    test('resetPassword with invalid token → error', async () => {
      // Random string as token
    });
    test('new password must meet minimum requirements', async () => {
      // Try empty password, single char, etc. — verify Zod validation
    });
  });

  describe('2.7 Invite Flow', () => {
    test('admin can create invite', async () => {
      // As admin, call auth.invite → invitation row created with token
    });
    test('non-admin cannot create invite → FORBIDDEN', async () => {
      // As requester, attempt invite → 403
    });
    test('acceptInvite with valid token → user created in correct org', async () => {
      // Create invite, accept it with name + password
      // Verify: user exists, org_id matches, role matches invitation role
    });
    test('acceptInvite creates a session (user is logged in immediately)', async () => {});
    test('acceptInvite with expired token → error', async () => {});
    test('acceptInvite with already-used token → error', async () => {});
    test('acceptInvite with email that already has an account → appropriate handling', async () => {
      // Either error or merge — verify which behavior exists and that it's safe
    });
    test('invited user can login with their chosen password', async () => {});
    test('invited user has the role specified in the invitation', async () => {});
  });

  describe('2.8 Registration', () => {
    test('signup creates new org + user as owner', async () => {});
    test('signup with duplicate email → appropriate error', async () => {});
    test('signup with duplicate org slug → appropriate error', async () => {});
    test('created user has password_hash set (not plaintext)', async () => {
      // Verify the stored hash starts with $2b$ (bcrypt prefix)
    });
  });
});


=============================================================================
LAYER 3: RBAC — EVERY ROLE × EVERY MODULE × EVERY ACTION
Purpose: Mathematically verify the permission matrix. No role can do what it shouldn't.
File: apps/api/src/__tests__/layer3-rbac.test.ts
=============================================================================

describe('Layer 3: RBAC Exhaustive Matrix', () => {

  // For this layer, we test the ACTUAL permission checks, not just the matrix data.
  // Create users with every matrix_role and verify they can/can't call specific procedures.

  const ROLES_TO_TEST = [
    'admin', 'itil', 'itil_admin', 'itil_manager', 'change_manager', 'problem_manager',
    'field_service', 'security_admin', 'security_analyst', 'grc_analyst',
    'hr_manager', 'hr_analyst', 'procurement_admin', 'procurement_analyst',
    'finance_manager', 'project_manager', 'approver', 'requester',
    'report_viewer', 'cmdb_admin', 'vendor_manager', 'catalog_admin'
  ];

  const CRITICAL_PROCEDURES = [
    // Format: [procedure_path, module, action, description]
    ['tickets.create', 'incidents', 'write', 'Create a ticket'],
    ['tickets.update', 'incidents', 'write', 'Update a ticket'],
    ['tickets.assign', 'incidents', 'assign', 'Assign a ticket'],
    ['tickets.delete', 'incidents', 'delete', 'Delete a ticket'],
    ['changes.create', 'changes', 'write', 'Create a change request'],
    ['changes.approve', 'changes', 'approve', 'Approve a change'],
    ['security.incidents.create', 'security_incidents', 'write', 'Create security incident'],
    ['security.incidents.transition', 'security_incidents', 'write', 'Transition security incident'],
    ['hr.cases.create', 'hr', 'write', 'Create HR case'],
    ['hr.leave.approve', 'hr', 'approve', 'Approve leave request'],
    ['procurement.pr.create', 'procurement', 'write', 'Create purchase requisition'],
    ['procurement.pr.submit', 'procurement', 'approve', 'Submit PR for approval'],
    ['financial.invoices.approve', 'financial', 'approve', 'Approve invoice'],
    ['financial.budget.create', 'financial', 'write', 'Create budget line'],
    ['contracts.create', 'contracts', 'write', 'Create contract'],
    ['crm.deals.create', 'crm', 'write', 'Create CRM deal'],
    ['legal.matters.create', 'legal', 'write', 'Create legal matter'],
    ['legal.investigations.create', 'legal', 'write', 'Create investigation'],
    ['admin.users.list', 'admin_console', 'admin', 'List users (admin only)'],
    ['admin.users.update', 'admin_console', 'admin', 'Update user role'],
    ['admin.auditLog.list', 'admin_console', 'admin', 'View audit log'],
    ['knowledge.create', 'knowledge', 'write', 'Create KB article'],
    ['catalog.items.create', 'catalog', 'write', 'Create catalog item'],
    ['projects.create', 'project_mgmt', 'write', 'Create project'],
    ['grc.risks.create', 'grc', 'write', 'Create risk'],
    ['grc.policies.create', 'grc', 'write', 'Create policy'],
  ];

  // Generate tests dynamically: for each role × each procedure, verify allow or deny
  for (const role of ROLES_TO_TEST) {
    describe(`Role: ${role}`, () => {
      let token: string;
      
      beforeAll(async () => {
        // Create user with this matrix_role, login, get token
      });

      for (const [proc, module, action, desc] of CRITICAL_PROCEDURES) {
        const shouldAllow = hasPermission(role, module, action); // from @nexusops/types
        
        if (shouldAllow) {
          test(`✅ CAN ${desc} (${proc})`, async () => {
            // Call the procedure, verify it does NOT throw FORBIDDEN
            // (it may throw other errors like "not found" which is fine — 
            //  the point is it passed the permission check)
          });
        } else {
          test(`🚫 CANNOT ${desc} (${proc})`, async () => {
            // Call the procedure, verify it throws FORBIDDEN
          });
        }
      }
    });
  }

  describe('3.2 Admin Bypass', () => {
    test('admin role bypasses all permission checks', async () => {
      // As admin, call every procedure in CRITICAL_PROCEDURES
      // ALL must succeed (not throw FORBIDDEN)
    });
  });

  describe('3.3 Matrix Consistency', () => {
    test('server and client use identical permission matrix', async () => {
      // Import ROLE_PERMISSIONS from @nexusops/types on server side
      // Import from apps/web/src/lib/rbac.ts on client side (or verify import chain)
      // Deep compare the objects — they must be identical
    });
    test('every module referenced in permissionProcedure exists in ROLE_PERMISSIONS', async () => {
      // Grep all permissionProcedure calls in routers, extract module names
      // Verify each exists as a key in ROLE_PERMISSIONS
    });
  });
});


=============================================================================
LAYER 4: MULTI-TENANCY ISOLATION
Purpose: Prove tenant A can NEVER see, modify, or infer tenant B's data.
File: apps/api/src/__tests__/layer4-tenancy.test.ts
=============================================================================

describe('Layer 4: Multi-Tenancy Isolation', () => {

  let orgA: { orgId: string, adminToken: string, agentToken: string };
  let orgB: { orgId: string, adminToken: string, agentToken: string };

  beforeAll(async () => {
    // Seed two completely independent orgs with their own users and data
    // Org A: 5 tickets, 3 assets, 2 contracts, 1 HR case
    // Org B: 5 tickets, 3 assets, 2 contracts, 1 HR case
  });

  // Test EVERY entity type
  const ENTITIES = [
    { name: 'tickets', listProc: 'tickets.list', getProc: 'tickets.get' },
    { name: 'changes', listProc: 'changes.list', getProc: 'changes.get' },
    { name: 'assets', listProc: 'assets.ham.list', getProc: 'assets.get' },
    { name: 'contracts', listProc: 'contracts.list', getProc: 'contracts.get' },
    { name: 'hr_cases', listProc: 'hr.cases.list', getProc: 'hr.cases.get' },
    { name: 'security_incidents', listProc: 'security.incidents.list', getProc: 'security.getIncident' },
    { name: 'risks', listProc: 'grc.risks.list', getProc: 'grc.getRisk' },
    { name: 'vendors', listProc: 'vendors.list', getProc: 'vendors.get' },
    { name: 'crm_deals', listProc: 'crm.listDeals', getProc: 'crm.getDeal' },
    { name: 'crm_accounts', listProc: 'crm.listAccounts', getProc: 'crm.getAccount' },
    { name: 'projects', listProc: 'projects.list', getProc: 'projects.get' },
    { name: 'purchase_reqs', listProc: 'procurement.purchaseRequests.list', getProc: null },
    { name: 'invoices', listProc: 'financial.invoices.list', getProc: null },
    { name: 'kb_articles', listProc: 'knowledge.list', getProc: null },
    { name: 'surveys', listProc: 'surveys.list', getProc: null },
    { name: 'notifications', listProc: 'notifications.list', getProc: null },
    { name: 'audit_logs', listProc: 'admin.auditLog.list', getProc: null },
  ];

  for (const entity of ENTITIES) {
    describe(`Isolation: ${entity.name}`, () => {
      test(`Org A list returns ONLY Org A ${entity.name}`, async () => {
        // Call list as Org A user, verify all returned items have org_id = orgA.orgId
      });
      test(`Org B list returns ONLY Org B ${entity.name}`, async () => {});
      test(`Org A cannot access Org B ${entity.name} by ID`, async () => {
        // Get an ID from Org B's data, call get as Org A user
        // Must return NOT_FOUND or empty — NOT the data
        // Must NOT return FORBIDDEN (that would confirm the item exists)
      });
    });
  }

  describe('4.2 Cross-Org Mutation Prevention', () => {
    test('Org A cannot update Org B ticket', async () => {
      // Get Org B ticket ID, try tickets.update as Org A → fails
    });
    test('Org A cannot delete Org B asset', async () => {});
    test('Org A cannot approve Org B change request', async () => {});
    test('Create mutation always uses ctx.orgId regardless of input', async () => {
      // As Org A, call tickets.create with a body that includes org_id: orgB.orgId
      // Verify the created ticket has org_id = orgA.orgId (ctx wins over input)
    });
  });

  describe('4.3 Auto-Numbering Isolation', () => {
    test('Org A and Org B can both have INC-0001', async () => {
      // Create first ticket in each org, verify both get INC-0001
    });
    test('numbering is sequential within each org independently', async () => {
      // Create 3 tickets in Org A → INC-0001, INC-0002, INC-0003
      // Create 2 tickets in Org B → INC-0001, INC-0002
    });
  });

  describe('4.4 Search Isolation', () => {
    test('Meilisearch results are scoped to requesting user org', async () => {
      // Index tickets for both orgs
      // Search as Org A → only Org A results
    });
  });
});


=============================================================================
LAYER 5: BUSINESS LOGIC — STATE MACHINES, CALCULATIONS, CHAINS
Purpose: Verify every business rule enforces correctly, including edge cases.
File: apps/api/src/__tests__/layer5-business-logic.test.ts
=============================================================================

describe('Layer 5: Business Logic', () => {

  describe('5.1 Auto-Numbering', () => {
    test('first ticket in new org gets INC-0001', async () => {});
    test('sequential: INC-0001, INC-0002, INC-0003', async () => {});
    test('50 concurrent ticket creates produce 50 unique sequential numbers', async () => {
      // Use Promise.all with 50 parallel tickets.create calls
      // Verify: no duplicates, no gaps, all INC-0001 through INC-0050
      // This tests the pg_advisory_xact_lock mechanism
    });
    test('numbers are zero-padded to 4 digits', async () => {});
    test('numbering works for all entity types', async () => {
      // Create one of each: ticket (INC-), change (CHG-), problem (PRB-), 
      // HR case (HR-), security incident (SEC-), contract (CON-), work order (WO-)
      // Verify each has correct prefix
    });
  });

  describe('5.2 SLA Calculation', () => {
    test('ticket create sets sla_response_deadline from priority policy', async () => {
      // Create P1 ticket (e.g., 15 min response), verify deadline = now + 15min
    });
    test('ticket create sets sla_resolve_deadline from priority policy', async () => {
      // P1 with 4h resolve → deadline = now + 4h
    });
    test('status change to in_progress before response deadline → not breached', async () => {});
    test('status change to in_progress AFTER response deadline → sla_breached = true', async () => {
      // Create ticket, manually set response deadline to past, change status
    });
    test('status change to resolved before resolve deadline → not breached', async () => {});
    test('status change to resolved AFTER resolve deadline → sla_breached = true', async () => {});
    test('reopened ticket (resolved → open) recalculates SLA', async () => {});
    test('priority change recalculates SLA deadlines', async () => {
      // Change from P4 (24h) to P1 (4h) → new tighter deadlines
    });
  });

  describe('5.3 Security Incident State Machine', () => {
    const VALID_PATHS = [
      ['new', 'triage'],
      ['triage', 'containment'],
      ['triage', 'closed'],  // false positive
      ['containment', 'eradication'],
      ['eradication', 'recovery'],
      ['recovery', 'closed'],
    ];
    const INVALID_PATHS = [
      ['new', 'containment'],     // skip triage
      ['new', 'closed'],          // skip everything
      ['new', 'recovery'],        // way out of order
      ['triage', 'recovery'],     // skip containment + eradication
      ['containment', 'closed'],  // skip eradication + recovery
      ['closed', 'new'],          // reopen from terminal
      ['closed', 'triage'],       // reopen
    ];

    for (const [from, to] of VALID_PATHS) {
      test(`${from} → ${to} is ALLOWED`, async () => {
        // Create incident, set to 'from' state, transition to 'to', verify success
      });
    }
    for (const [from, to] of INVALID_PATHS) {
      test(`${from} → ${to} is REJECTED`, async () => {
        // Create incident, set to 'from' state, attempt transition to 'to'
        // Verify BAD_REQUEST error with message about valid transitions
      });
    }
  });

  describe('5.4 Contract State Machine', () => {
    const VALID = [
      ['draft', 'under_review'],
      ['under_review', 'legal_review'],
      ['under_review', 'draft'],       // send back
      ['legal_review', 'awaiting_signature'],
      ['legal_review', 'under_review'], // send back
      ['awaiting_signature', 'active'],
      ['active', 'expiring_soon'],
      ['active', 'terminated'],
      ['expiring_soon', 'active'],      // renewed
      ['expiring_soon', 'expired'],
      ['expiring_soon', 'terminated'],
    ];
    const INVALID = [
      ['draft', 'active'],              // skip review chain
      ['draft', 'awaiting_signature'],   // skip reviews
      ['expired', 'active'],            // resurrect
      ['terminated', 'active'],         // resurrect
    ];
    // Same pattern as security incidents — test each transition
    for (const [from, to] of VALID) {
      test(`${from} → ${to} is ALLOWED`, async () => {});
    }
    for (const [from, to] of INVALID) {
      test(`${from} → ${to} is REJECTED`, async () => {});
    }
  });

  describe('5.5 Procurement Approval Chain', () => {
    test('PR under ₹75,000 is auto-approved', async () => {
      // Create PR with total ₹50,000, submit → status should be "approved"
      // No approval_request row created
    });
    test('PR ₹75,000–₹7,50,000 routes to dept head', async () => {
      // Create PR with total ₹3,00,000, submit
      // Verify: status = pending_approval, one approval_request with dept_head step
    });
    test('PR over ₹7,50,000 routes to VP then finance sequentially', async () => {
      // Create PR ₹10,00,000, submit
      // Verify: two approval steps, step 1 = VP (pending), step 2 = finance (not yet active)
    });
    test('approving step 1 activates step 2', async () => {
      // Approve VP step → finance step becomes pending
    });
    test('approving final step → PR status = approved', async () => {
      // Approve both → PR status changes
    });
    test('rejecting any step → PR status = rejected immediately', async () => {
      // Create high-value PR, reject at VP stage → PR rejected, finance step skipped
    });
    test('approval fires notification to requester', async () => {
      // After approval, check notifications table for requester
    });
    test('rejection fires notification to requester', async () => {});
  });

  describe('5.6 Leave Balance Management', () => {
    test('leave request checks balance before accepting', async () => {
      // Employee has 10 days vacation, request 5 → accepted (pending_days += 5)
    });
    test('leave request rejected if insufficient balance', async () => {
      // Employee has 2 days remaining, request 5 → error
    });
    test('approve leave → used_days incremented, pending_days decremented', async () => {});
    test('reject leave → pending_days decremented, used_days unchanged', async () => {});
    test('cancel pending leave → pending_days decremented', async () => {});
    test('cancel approved leave → used_days decremented', async () => {});
    test('balance calculation: total - used - pending = available', async () => {
      // Verify the math across multiple requests and approvals
    });
  });

  describe('5.7 Three-Way Invoice Match', () => {
    test('matching amounts within 2% → matched = true', async () => {
      // PO = ₹1,00,000, receipts total = ₹1,00,000, invoice = ₹1,01,500 (1.5%) → match
    });
    test('variance exceeding 2% → matched = false with variances', async () => {
      // PO = ₹1,00,000, invoice = ₹1,05,000 (5%) → no match
    });
    test('partial receipt → amounts compared proportionally', async () => {});
    test('no linked PO → match returns appropriate error', async () => {});
  });

  describe('5.8 Approval Workflow Integration', () => {
    test('approvals.decide with approve on final step → source entity updated', async () => {
      // Create change request → submit for approval → approve → change status = approved
    });
    test('approvals.decide with reject → source entity marked rejected', async () => {});
    test('only the assigned approver can decide', async () => {
      // Other users → FORBIDDEN on that specific approval step
    });
    test('double-approve on same step → idempotent or error', async () => {});
  });
});


=============================================================================
LAYER 6: DATA INTEGRITY — INPUT VALIDATION, SANITIZATION, CONSTRAINTS
Purpose: Verify no bad data can enter the system, no injection is possible.
File: apps/api/src/__tests__/layer6-data-integrity.test.ts
=============================================================================

describe('Layer 6: Data Integrity', () => {

  describe('6.1 Input Sanitization', () => {
    test('HTML in ticket title is stripped (plain text field)', async () => {
      // Create ticket with title: '<script>alert("xss")</script>Server Down'
      // Verify stored title: 'Server Down' (tags stripped)
    });
    test('HTML in ticket description is sanitized (rich text field)', async () => {
      // Create with description: '<script>alert(1)</script><b>Bold text</b><img onerror="hack">'
      // Verify: script removed, b tag preserved, img onerror removed
    });
    test('HTML in KB article content is sanitized', async () => {});
    test('HTML in comment body is sanitized', async () => {});
    test('HTML in contract clause text is sanitized', async () => {});
    test('SQL injection in search query is harmless', async () => {
      // search.global with query: "'; DROP TABLE tickets; --"
      // Verify: no error, empty results, tables still exist
    });
  });

  describe('6.2 Zod Validation on Every Mutation', () => {
    test('ticket title exceeding 500 chars → validation error', async () => {});
    test('ticket description exceeding 50000 chars → validation error', async () => {});
    test('comment body exceeding 10000 chars → validation error', async () => {});
    test('invalid email format rejected', async () => {});
    test('invalid URL format rejected where URLs expected', async () => {});
    test('negative amounts in financial fields rejected', async () => {});
    test('negative SLA minutes rejected', async () => {});
    test('empty required fields rejected (title, name, etc.)', async () => {});
    test('invalid enum values rejected', async () => {
      // e.g., ticket type "banana" instead of "incident"/"request"/etc.
    });
    test('invalid UUID format for ID fields rejected', async () => {});
  });

  describe('6.3 Database Constraints', () => {
    test('duplicate org slug → unique constraint violation', async () => {});
    test('duplicate user email within same org → unique constraint', async () => {});
    test('FK violation: ticket with nonexistent category_id → rejected', async () => {});
    test('FK violation: asset with nonexistent asset_type_id → rejected', async () => {});
    test('NOT NULL violation: ticket without title → rejected', async () => {});
  });

  describe('6.4 Audit Log Integrity', () => {
    test('every mutation creates an audit_log entry', async () => {
      // Create a ticket, update it, add comment, assign it
      // Verify: 4 audit_log entries exist for this org
    });
    test('audit log captures correct resource_id', async () => {
      // Create ticket, verify audit_log.resource_id = ticket.id
    });
    test('audit log changes field does not contain passwords', async () => {
      // Auth.register or password reset → audit log changes must NOT have password/hash
    });
    test('audit log changes field does not contain tokens', async () => {});
    test('audit log records IP address and user agent', async () => {});
    test('audit log org_id matches the user who performed the action', async () => {});
  });
});


=============================================================================
LAYER 7: ROW-LEVEL ACCESS — SENSITIVE DATA BOUNDARIES
Purpose: Verify data visibility rules beyond module-level RBAC.
File: apps/api/src/__tests__/layer7-row-access.test.ts
=============================================================================

describe('Layer 7: Row-Level Access', () => {

  describe('7.1 Employee Portal — Own Data Only', () => {
    test('employee sees only their own payslips', async () => {
      // Create payslips for employee A and employee B
      // As employee A: portal.myPayslips → only A's payslips
    });
    test('employee sees only their own leave balances', async () => {});
    test('employee sees only their own leave requests', async () => {});
    test('employee sees only their own benefits', async () => {});
    test('employee sees only their own performance data', async () => {});
    test('employee cannot see another employee\'s profile details', async () => {});
    test('HR manager CAN see any employee\'s data', async () => {
      // As hr_manager: portal endpoints return data for specified employee
    });
    test('admin CAN see any employee\'s data', async () => {});
  });

  describe('7.2 Confidential Investigations', () => {
    test('confidential investigation hidden from non-investigator in list', async () => {
      // Create investigation with confidential=true, investigator=userA
      // As userB (not admin): legal.investigations.list → does NOT include it
    });
    test('confidential investigation hidden from non-investigator in get', async () => {
      // As userB: legal.investigations.get(id) → NOT_FOUND (not FORBIDDEN)
    });
    test('assigned investigator CAN see confidential investigation', async () => {
      // As userA (investigator): list and get both return the investigation
    });
    test('admin CAN see confidential investigation', async () => {});
    test('security_admin CAN see confidential investigation', async () => {});
    test('non-confidential investigation visible to all with legal.read', async () => {});
  });

  describe('7.3 Internal Ticket Comments', () => {
    test('requester sees only public comments on their ticket', async () => {
      // Create ticket as requester, add public comment + internal comment (as agent)
      // As requester: tickets.get → comments array contains only public comment
    });
    test('agent sees all comments (public + internal)', async () => {
      // As agent: tickets.get → both comments present
    });
    test('admin sees all comments', async () => {});
    test('internal comment count matches expectations', async () => {
      // 3 public + 2 internal: requester sees 3, agent sees 5
    });
  });

  describe('7.4 Financial Data Gates', () => {
    test('user without financial.read cannot list invoices', async () => {
      // As requester → FORBIDDEN
    });
    test('user without financial.approve cannot approve invoice', async () => {});
    test('finance_manager CAN approve', async () => {});
    test('AP and AR data only visible to financial roles', async () => {});
  });

  describe('7.5 Notification Isolation', () => {
    test('user only sees their own notifications', async () => {
      // Create notifications for user A and user B
      // As user A: notifications.list → only A's notifications
    });
    test('user cannot mark another user\'s notification as read', async () => {});
  });
});


=============================================================================
LAYER 8: FULL MODULE SMOKE TESTS — CRUD + DOMAIN OPERATIONS
Purpose: Verify every module's core operations work end-to-end.
File: apps/api/src/__tests__/layer8-module-smoke.test.ts
=============================================================================

describe('Layer 8: Module Smoke Tests', () => {

  // For each module: create, list, get, update, and one domain-specific operation

  describe('8.01 Tickets (ITSM)', () => {
    test('create → list → get → addComment → assign → update status → resolve', async () => {});
    test('bulk update 5 tickets → all updated', async () => {});
    test('statusCounts returns correct numbers', async () => {});
    test('full-text search finds ticket by title keyword', async () => {});
  });

  describe('8.02 Changes', () => {
    test('create → submitForApproval → approve → complete', async () => {});
    test('CAB vote records decision', async () => {});
    test('getCalendar returns scheduled changes', async () => {});
  });

  describe('8.03 Problems', () => {
    test('create → linkIncident → addKnownError → resolve', async () => {});
  });

  describe('8.04 Releases', () => {
    test('create → linkChange → deploy → complete', async () => {});
  });

  describe('8.05 Assets (HAM)', () => {
    test('create → assign → retire', async () => {
      // Verify: asset_history entries created for assign and retire
    });
    test('retired asset cannot be assigned', async () => {});
  });

  describe('8.06 Assets (SAM)', () => {
    test('create license → assign to user → revoke → assign to different user', async () => {});
    test('assign beyond seat count → rejected', async () => {});
  });

  describe('8.07 CMDB', () => {
    test('create CI → add relationship → getTopology returns graph', async () => {});
    test('impactAnalysis returns dependency chain', async () => {});
  });

  describe('8.08 HR Cases', () => {
    test('create case → add task → complete task → auto-resolve case', async () => {});
    test('onboarding from template → tasks generated with due dates', async () => {});
  });

  describe('8.09 Leave Management', () => {
    test('request → approve → balance updated', async () => {});
    test('request → reject → balance unchanged', async () => {});
  });

  describe('8.10 Security Incidents', () => {
    test('full lifecycle: new → triage → contain → eradicate → recover → close', async () => {});
    test('add IOC, add containment action', async () => {});
  });

  describe('8.11 GRC', () => {
    test('create risk → auto-score → update → close', async () => {});
    test('create policy → publish', async () => {});
    test('create audit → add finding', async () => {});
  });

  describe('8.12 Procurement', () => {
    test('create PR → submit → approve → create PO → receive → auto-create asset', async () => {});
  });

  describe('8.13 Financial', () => {
    test('create budget → create invoice → three-way match', async () => {});
    test('AP aging returns correct bucket distribution', async () => {});
    test('AR aging returns customer credit utilization', async () => {});
  });

  describe('8.14 Contracts', () => {
    test('createFromWizard → review → sign → active', async () => {});
    test('getExpiringWithin returns soon-expiring contracts', async () => {});
    test('obligations.markComplete', async () => {});
  });

  describe('8.15 CRM', () => {
    test('create account → contact → lead → convert to deal → move pipeline → close', async () => {});
    test('create quote with line items → total calculated correctly', async () => {});
    test('dashboardMetrics returns pipeline value', async () => {});
  });

  describe('8.16 CSM', () => {
    test('create case → assign → resolve → CSAT', async () => {});
  });

  describe('8.17 Legal', () => {
    test('create matter → add cost → update phase → close', async () => {});
    test('create investigation (confidential) → only visible to investigator', async () => {});
  });

  describe('8.18 Projects', () => {
    test('create project → add milestone → add task → complete task', async () => {});
    test('agile board returns tasks grouped by status', async () => {});
  });

  describe('8.19 Facilities', () => {
    test('checkAvailability → create booking → verify room occupied', async () => {});
    test('move request → approve → complete', async () => {});
  });

  describe('8.20 Walk-Up', () => {
    test('joinQueue → callNext → complete with CSAT', async () => {});
  });

  describe('8.21 Surveys', () => {
    test('create survey → submit response → getResults aggregation', async () => {});
  });

  describe('8.22 Knowledge', () => {
    test('create article → recordView → recordFeedback', async () => {
      // Verify view_count incremented
    });
  });

  describe('8.23 Catalog', () => {
    test('create item → submit request → fulfill', async () => {});
  });

  describe('8.24 Vendors', () => {
    test('create → update → performance metrics', async () => {});
  });

  describe('8.25 DevOps', () => {
    test('DORA metrics calculation returns valid data', async () => {});
    test('pipeline runs list returns stage breakdowns', async () => {});
  });

  describe('8.26 APM', () => {
    test('create application → update lifecycle → portfolio summary', async () => {});
  });

  describe('8.27 On-Call', () => {
    test('create schedule → list → active rotation', async () => {});
  });

  describe('8.28 Events', () => {
    test('create event → acknowledge → suppress', async () => {});
  });

  describe('8.29 Notifications', () => {
    test('ticket create fires notification to assignee', async () => {
      // Create ticket with assignee, verify notification row exists
    });
    test('change approve fires notification to requester', async () => {});
    test('markRead updates is_read flag', async () => {});
    test('markAllRead updates all unread for user', async () => {});
    test('unreadCount returns correct number', async () => {});
  });

  describe('8.30 Search', () => {
    test('search.global returns results from multiple indexes', async () => {});
    test('search results are org-scoped', async () => {});
    test('graceful degradation when Meilisearch is unavailable', async () => {
      // Mock Meilisearch connection failure → empty results, no error
    });
  });

  describe('8.31 Reports', () => {
    test('executiveOverview returns platform KPIs', async () => {});
    test('slaDashboard returns SLA metrics by priority', async () => {});
    test('workloadAnalysis returns per-agent stats', async () => {});
  });

  describe('8.32 Admin', () => {
    test('users.list returns all org users', async () => {});
    test('users.update changes role and matrix_role', async () => {});
    test('auditLog.list returns paginated filtered results', async () => {});
    test('slaDefinitions.list returns SLA policies', async () => {});
  });
});


=============================================================================
LAYER 9: CONCURRENCY, PERFORMANCE, AND EDGE CASES
Purpose: Break the system under stress. Find race conditions, deadlocks, data loss.
File: apps/api/src/__tests__/layer9-stress.test.ts
=============================================================================

describe('Layer 9: Concurrency & Edge Cases', () => {

  describe('9.1 Auto-Number Races', () => {
    test('100 concurrent ticket creates → 100 unique sequential numbers', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => 
        authedCaller(adminToken).tickets.create({ 
          title: `Concurrent ticket ${i}`, priorityId: p2Id, type: 'incident' 
        })
      );
      const results = await Promise.all(promises);
      const numbers = results.map(r => r.number);
      const unique = new Set(numbers);
      expect(unique.size).toBe(100);
      // Verify sequential (no gaps)
      const nums = numbers.map(n => parseInt(n.split('-')[1])).sort((a, b) => a - b);
      for (let i = 0; i < nums.length; i++) {
        expect(nums[i]).toBe(i + 1); // or starting from last number + 1
      }
    });
  });

  describe('9.2 Double-Submit Prevention', () => {
    test('two identical ticket creates within 1 second → two separate tickets (no dedup)', async () => {
      // Or verify idempotency if implemented — document the behavior
    });
    test('double-approve on same approval step → second attempt is idempotent or errors', async () => {});
    test('double-reject → second attempt idempotent or errors', async () => {});
  });

  describe('9.3 Session Races', () => {
    test('two requests with same session token at exact same time → both succeed', async () => {
      // Verify sliding window doesn't cause a race on expires_at update
    });
    test('logout during active request → active request completes, next one fails', async () => {});
  });

  describe('9.4 Large Data Sets', () => {
    test('list 10,000 tickets with pagination → correct page counts, no timeout', async () => {
      // Insert 10,000 tickets, then list with limit=50
      // Verify: page 1 = 50 items, response time < 1000ms
    });
    test('list with complex filters on 10,000 tickets → response < 1000ms', async () => {
      // Filter by status + priority + assignee + date range
    });
    test('search.global on 10,000 indexed documents → response < 500ms', async () => {});
  });

  describe('9.5 Boundary Values', () => {
    test('ticket with title exactly 500 chars → accepted', async () => {});
    test('ticket with title 501 chars → rejected', async () => {});
    test('invoice amount of ₹0 → accepted or rejected (verify behavior)', async () => {});
    test('invoice amount of ₹99,99,99,99,999.99 → accepted', async () => {});
    test('leave request for 0 days → rejected', async () => {});
    test('leave request for 0.5 days → accepted', async () => {});
    test('risk with likelihood=0 → rejected (must be 1-5)', async () => {});
    test('risk with likelihood=6 → rejected', async () => {});
    test('risk with likelihood=5, impact=5 → score=25', async () => {});
  });

  describe('9.6 Deletion Cascades and Orphans', () => {
    test('deleting a ticket does not orphan comments', async () => {
      // Delete ticket, verify comments are either cascade-deleted or handled
    });
    test('deleting an org cascades all data', async () => {
      // Only if org deletion is supported — verify or skip
    });
    test('disabling a user does not break their existing tickets/assignments', async () => {
      // Disable user, verify their tickets still list correctly
    });
  });

  describe('9.7 Unicode and Internationalization', () => {
    test('ticket title with Hindi characters → stored and returned correctly', async () => {
      // "सर्वर डाउन है" as title
    });
    test('ticket title with emoji → stored and returned correctly', async () => {
      // "🔥 Critical Server Issue" 
    });
    test('ticket title with Chinese characters → stored and returned correctly', async () => {});
    test('search finds Unicode content', async () => {
      // Create ticket with Hindi title, search for it
    });
    test('INR formatting: ₹31,54,000 format preserved in API responses', async () => {
      // Verify monetary fields return correct values for Indian formatting
    });
  });
});


=============================================================================
LAYER 10: END-TO-END USER JOURNEYS (Playwright)
Purpose: Test complete user workflows through the actual browser UI.
File: e2e/layer10-journeys.spec.ts
=============================================================================

// All E2E tests use Playwright against the running dev servers.
// Prerequisite: pnpm dev running, DB seeded.

import { test, expect } from '@playwright/test';

test.describe('Layer 10: End-to-End User Journeys', () => {

  test.describe('10.1 Authentication Journeys', () => {
    test('login → dashboard → verify user name in header', async ({ page }) => {
      await page.goto('/login');
      await page.fill('[name="email"]', 'admin@coheron.com');
      await page.fill('[name="password"]', 'demo1234!');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/app\/dashboard/);
      // Verify user name appears in header
    });

    test('login with wrong password → error message shown', async ({ page }) => {
      await page.goto('/login');
      await page.fill('[name="email"]', 'admin@coheron.com');
      await page.fill('[name="password"]', 'wrong');
      await page.click('button[type="submit"]');
      await expect(page.locator('text=Invalid')).toBeVisible();
      await expect(page).toHaveURL(/\/login/); // stayed on login
    });

    test('unauthenticated /app/dashboard → redirected to /login', async ({ page }) => {
      // Clear all cookies/storage first
      await page.context().clearCookies();
      await page.goto('/app/dashboard');
      await expect(page).toHaveURL(/\/login/);
    });

    test('forgot password → request → receive (check console) → reset → login', async ({ page }) => {
      await page.goto('/forgot-password');
      await page.fill('[name="email"]', 'admin@coheron.com');
      await page.click('button[type="submit"]');
      // Verify success message (generic, no leak)
      await expect(page.locator('text=If an account')).toBeVisible();
    });

    test('logout → session cleared → redirect to login', async ({ page }) => {
      // Login first, then logout
      // After logout, /app/dashboard should redirect to /login
    });
  });

  test.describe('10.2 Ticket Lifecycle (Agent Journey)', () => {
    test('create ticket → appears in list → view detail → add comment → assign → resolve', async ({ page }) => {
      // Login as agent
      await page.goto('/login');
      await page.fill('[name="email"]', 'agent1@coheron.com');
      await page.fill('[name="password"]', 'demo1234!');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/app\/dashboard/);

      // Navigate to new ticket form
      await page.goto('/app/tickets/new');
      await page.fill('[name="title"]', 'E2E Test Ticket - Server Down');
      // Fill other required fields (priority, type, etc.)
      await page.click('button:has-text("Create")');
      
      // Verify redirect to ticket detail or list
      // Verify ticket number (INC-XXXX) appears
      
      // Navigate to ticket list
      await page.goto('/app/tickets');
      await expect(page.locator('text=E2E Test Ticket')).toBeVisible();

      // Click into the ticket
      await page.click('text=E2E Test Ticket');
      
      // Add a comment
      // Assign to self
      // Change status to resolved
      // Verify resolved_at appears
    });
  });

  test.describe('10.3 Procurement Flow (Finance Journey)', () => {
    test('create PR → submit → appears in approvals → approve → PO created', async ({ page }) => {
      // Login as procurement user
      // Create purchase requisition with line items
      // Submit for approval
      // Switch to approver user (or login as admin)
      // Go to /app/approvals → see the pending PR
      // Approve it
      // Verify PR status changed
    });
  });

  test.describe('10.4 HR Journey (HR Manager)', () => {
    test('create HR case → add tasks → complete tasks → case resolves', async ({ page }) => {
      // Login as HR manager
      // Navigate to /app/hr → create new case
      // Add onboarding tasks
      // Complete each task
      // Verify case auto-resolves when all tasks complete
    });
  });

  test.describe('10.5 RBAC in UI (Role Switcher)', () => {
    test('switching to requester role hides admin tabs', async ({ page }) => {
      // Login as admin
      // Open role switcher in header
      // Switch to "requester" mock user
      // Navigate to /app/admin → should see AccessDenied
      // Navigate to /app/tickets → should see only basic tabs
    });

    test('switching to finance_manager shows financial tabs, hides security tabs', async ({ page }) => {
      // Switch role, navigate to /app/financial → visible
      // Navigate to /app/security → AccessDenied or hidden
    });
  });

  test.describe('10.6 Global Search', () => {
    test('type in search bar → results appear grouped by type → click navigates', async ({ page }) => {
      // Login, click search bar (or press Cmd+K)
      // Type "server"
      // Wait for dropdown results
      // Verify results are grouped (Tickets, Assets, etc.)
      // Click a result → navigate to correct page
    });
  });

  test.describe('10.7 Notification Flow', () => {
    test('create ticket with assignee → notification bell shows count → click → see notification', async ({ page }) => {
      // Login as admin, create ticket assigned to agent1
      // Login as agent1
      // Verify notification bell shows count ≥ 1
      // Click bell → see the notification in dropdown
      // Click notification → navigate to ticket
      // Verify notification marked as read
    });
  });

  test.describe('10.8 Every Module Page Loads Without Error', () => {
    const ROUTES = [
      '/app/dashboard', '/app/it-services', '/app/security-compliance',
      '/app/people-workplace', '/app/customer-sales', '/app/finance-procurement',
      '/app/legal-governance', '/app/strategy-projects', '/app/developer-ops',
      '/app/tickets', '/app/escalations', '/app/changes', '/app/problems',
      '/app/releases', '/app/work-orders', '/app/on-call', '/app/events',
      '/app/cmdb', '/app/ham', '/app/sam',
      '/app/security', '/app/grc', '/app/compliance',
      '/app/approvals', '/app/flows', '/app/workflows',
      '/app/hr', '/app/employee-portal', '/app/employee-center',
      '/app/facilities', '/app/walk-up',
      '/app/csm', '/app/crm', '/app/catalog', '/app/surveys',
      '/app/procurement', '/app/financial', '/app/vendors', '/app/contracts',
      '/app/legal', '/app/secretarial',
      '/app/projects', '/app/apm', '/app/reports',
      '/app/devops', '/app/knowledge',
      '/app/admin', '/app/notifications', '/app/virtual-agent',
    ];

    for (const route of ROUTES) {
      test(`${route} loads without console errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', err => errors.push(err.message));

        // Login first (reuse stored auth state)
        await page.goto(route);
        await page.waitForLoadState('networkidle');

        // Page should not show "unhandled error" or blank screen
        const bodyText = await page.textContent('body');
        expect(bodyText).not.toContain('Unhandled Runtime Error');
        expect(bodyText).not.toContain('Application error');
        
        // Filter out non-critical console errors (like favicon 404)
        const criticalErrors = errors.filter(e => 
          !e.includes('favicon') && !e.includes('Failed to load resource: net::ERR')
        );
        expect(criticalErrors).toHaveLength(0);
      });
    }
  });

  test.describe('10.9 Security Headers on Web Responses', () => {
    test('CSP header present', async ({ page }) => {
      const response = await page.goto('/app/dashboard');
      const csp = response?.headers()['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
    });
    test('HSTS header present', async ({ page }) => {
      const response = await page.goto('/app/dashboard');
      const hsts = response?.headers()['strict-transport-security'];
      expect(hsts).toBeDefined();
    });
    test('X-Frame-Options: DENY', async ({ page }) => {
      const response = await page.goto('/app/dashboard');
      expect(response?.headers()['x-frame-options']).toBe('DENY');
    });
    test('X-Content-Type-Options: nosniff', async ({ page }) => {
      const response = await page.goto('/app/dashboard');
      expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    });
  });

  test.describe('10.10 Cross-Layer Validation', () => {
    test('API RBAC and UI RBAC agree: requester cannot create ticket via API even if UI button appears', async ({ page }) => {
      // This catches cases where UI gates are bypassed but API enforcement works
      // Login as user with requester role
      // Attempt to POST directly to the tRPC endpoint for tickets.create
      // Verify FORBIDDEN response
    });

    test('data created via API appears correctly in UI', async ({ page }) => {
      // Create a ticket directly via tRPC (not through UI)
      // Navigate to /app/tickets in browser
      // Verify the ticket appears with correct data
    });

    test('data created via UI persists across page reload', async ({ page }) => {
      // Create something via the UI form
      // Reload the page
      // Verify the data is still there (not just in React state)
    });
  });
});


=============================================================================
EXECUTION AND REPORTING
=============================================================================

After all 10 layers are implemented, add these scripts to the root package.json:

"scripts": {
  "test:layer1": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer1*",
  "test:layer2": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer2*",
  "test:layer3": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer3*",
  "test:layer4": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer4*",
  "test:layer5": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer5*",
  "test:layer6": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer6*",
  "test:layer7": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer7*",
  "test:layer8": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer8*",
  "test:layer9": "pnpm --filter @nexusops/api vitest run --reporter=verbose src/__tests__/layer9*",
  "test:layer10": "playwright test e2e/layer10*",
  "test:all-layers": "pnpm test:layer1 && pnpm test:layer2 && pnpm test:layer3 && pnpm test:layer4 && pnpm test:layer5 && pnpm test:layer6 && pnpm test:layer7 && pnpm test:layer8 && pnpm test:layer9 && pnpm test:layer10",
  "test:qa-report": "pnpm test:all-layers 2>&1 | tee qa-report-$(date +%Y%m%d).txt"
}

When ALL layers pass:
- Generate the QA report: pnpm test:qa-report
- The output file is the production readiness certificate
- Any failures are the punch list — fix and rerun

Expected test count when fully implemented:
- Layer 1: ~30 tests (infrastructure)
- Layer 2: ~45 tests (auth)
- Layer 3: ~500+ tests (22 roles × 26 procedures — generated dynamically)
- Layer 4: ~60 tests (tenancy)
- Layer 5: ~50 tests (business logic)
- Layer 6: ~25 tests (data integrity)
- Layer 7: ~25 tests (row-level access)
- Layer 8: ~80 tests (module smoke)
- Layer 9: ~25 tests (stress/edge)
- Layer 10: ~60 tests (E2E Playwright)
TOTAL: ~900+ tests

When the report says "900 passed, 0 failed" — ship it.
```
