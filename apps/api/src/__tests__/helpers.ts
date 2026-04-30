/**
 * Test helpers — seed data, create sessions, build tRPC callers.
 * All helpers operate against the test DB (DATABASE_URL points to _test DB in setup.ts).
 */
import { createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { getDb } from '@coheronconnect/db';
import {
  organizations,
  users,
  sessions,
  ticketStatuses,
  ticketPriorities,
  ticketCategories,
} from '@coheronconnect/db';
import { eq, and, sql } from '@coheronconnect/db';
import { appRouter } from '../routers';
import type { Context } from '../lib/trpc';
import { setupTestDb, truncateAllTables } from './setup';

// ── Environment Init ────────────────────────────────────────────────────────

export async function initTestEnvironment() {
  const db = await setupTestDb();
  return db;
}

export async function cleanTestData() {
  const db = getDb();
  await truncateAllTables(db as any);
}

// ── DB accessor ────────────────────────────────────────────────────────────

export function testDb() {
  return getDb();
}

// ── Session helpers ────────────────────────────────────────────────────────

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  const db = testDb();
  const token = nanoid(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    expiresAt,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  });
  return token;
}

// ── tRPC caller ─────────────────────────────────────────────────────────────

/**
 * Build an authenticated tRPC caller by going through the real auth middleware.
 * This ensures session lookup, user hydration, and org resolution all work exactly
 * as they do in production.
 */
export async function authedCaller(token: string) {
  const { createContext } = await import('../middleware/auth');

  // Build a mock Fastify request with the token
  const mockReq = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'CoheronConnect-QA-Test/1.0',
    },
    ip: '127.0.0.1',
    // Fastify cookie shim — not used for Bearer auth
    cookies: {},
  };

  const ctx = await createContext(mockReq as any);
  return appRouter.createCaller(ctx);
}

export function makeContext(
  userId: string,
  orgId: string,
  overrides: Partial<Context> = {},
): Context {
  return {
    db: testDb(),
    mongoDb: null,
    databaseProvider: "postgres",
    user: {
      id: userId,
      orgId,
      email: 'test@coheronconnect.io',
      name: 'Test User',
      role: 'admin',
      matrixRole: 'admin',
      status: 'active',
    },
    org: { id: orgId, name: 'Test Org', slug: 'test-org' },
    orgId,
    sessionId: 'test-session',
    requestId: null,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    idempotencyKey: null,
    ...overrides,
  };
}

// ── Org / User seeding ─────────────────────────────────────────────────────

export async function seedTestOrg(slug?: string) {
  const db = testDb();
  const uniqueSlug = slug ?? `qa-test-${nanoid(6)}`;
  const [org] = await db
    .insert(organizations)
    .values({ name: 'QA Test Org', slug: uniqueSlug, plan: 'professional' })
    .returning();
  return { orgId: org!.id, org: org! };
}

export async function seedUser(
  orgId: string,
  opts: {
    email?: string;
    name?: string;
    role?: 'owner' | 'admin' | 'member' | 'viewer';
    matrixRole?: string;
    password?: string;
    status?: 'active' | 'invited' | 'disabled';
  } = {},
) {
  const db = testDb();
  const email = opts.email ?? `user-${nanoid(6)}@qa.coheronconnect.io`;
  const password = opts.password ?? 'TestPass123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(users)
    .values({
      orgId,
      email,
      name: opts.name ?? 'QA User',
      role: opts.role ?? 'member',
      matrixRole: opts.matrixRole ?? null,
      passwordHash,
      status: opts.status ?? 'active',
    })
    .returning();
  return { userId: user!.id, user: user! };
}

export async function seedFullOrg() {
  const { orgId, org } = await seedTestOrg();
  const password = 'TestPass123!';

  const { userId: adminId } = await seedUser(orgId, {
    email: `admin-${nanoid(4)}@qa.coheronconnect.io`,
    role: 'admin',
    matrixRole: 'admin',
    password,
  });
  const { userId: agentId } = await seedUser(orgId, {
    email: `agent-${nanoid(4)}@qa.coheronconnect.io`,
    role: 'member',
    matrixRole: 'itil',
    password,
  });
  const { userId: hrId } = await seedUser(orgId, {
    email: `hr-${nanoid(4)}@qa.coheronconnect.io`,
    role: 'member',
    matrixRole: 'hr_manager',
    password,
  });
  const { userId: financeId } = await seedUser(orgId, {
    email: `finance-${nanoid(4)}@qa.coheronconnect.io`,
    role: 'member',
    matrixRole: 'finance_manager',
    password,
  });
  const { userId: requesterId } = await seedUser(orgId, {
    email: `requester-${nanoid(4)}@qa.coheronconnect.io`,
    role: 'member',
    matrixRole: 'requester',
    password,
  });
  const { userId: viewerId } = await seedUser(orgId, {
    email: `viewer-${nanoid(4)}@qa.coheronconnect.io`,
    role: 'viewer',
    matrixRole: 'report_viewer',
    password,
  });
  const { userId: securityAnalystId } = await seedUser(orgId, {
    email: `security-${nanoid(4)}@qa.coheronconnect.io`,
    role: 'member',
    matrixRole: 'security_analyst',
    password,
  });

  // Seed ticket defaults (priorities + statuses + categories)
  const db = testDb();
  await db.insert(ticketPriorities).values([
    { orgId, name: 'P1 - Critical', color: '#ef4444', slaResponseMinutes: 15, slaResolveMinutes: 240, sortOrder: 1 },
    { orgId, name: 'P2 - High', color: '#f97316', slaResponseMinutes: 60, slaResolveMinutes: 480, sortOrder: 2 },
    { orgId, name: 'P3 - Medium', color: '#eab308', slaResponseMinutes: 240, slaResolveMinutes: 1440, sortOrder: 3 },
    { orgId, name: 'P4 - Low', color: '#22c55e', slaResponseMinutes: 480, slaResolveMinutes: 4320, sortOrder: 4 },
  ]);

  await db.insert(ticketStatuses).values([
    { orgId, name: 'Open', category: 'open', color: '#6366f1', sortOrder: 1 },
    { orgId, name: 'In Progress', category: 'in_progress', color: '#f97316', sortOrder: 2 },
    { orgId, name: 'Pending', category: 'pending', color: '#94a3b8', sortOrder: 3 },
    { orgId, name: 'Resolved', category: 'resolved', color: '#22c55e', sortOrder: 4 },
    { orgId, name: 'Closed', category: 'closed', color: '#6b7280', sortOrder: 5 },
  ]);

  await db.insert(ticketCategories).values([
    { orgId, name: 'Hardware', sortOrder: 1 },
    { orgId, name: 'Software', sortOrder: 2 },
    { orgId, name: 'Network', sortOrder: 3 },
  ]);

  const [p1] = await db.select().from(ticketPriorities).where(and(eq(ticketPriorities.orgId, orgId), eq(ticketPriorities.sortOrder, 1)));
  const [p2] = await db.select().from(ticketPriorities).where(and(eq(ticketPriorities.orgId, orgId), eq(ticketPriorities.sortOrder, 2)));
  const [statusOpen] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "open")));
  const [statusInProgress] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "in_progress")));
  const [statusResolved] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "resolved")));

  return {
    orgId,
    org,
    password,
    adminId,
    agentId,
    hrId,
    financeId,
    requesterId,
    viewerId,
    securityAnalystId,
    p1Id: p1?.id,
    p2Id: p2?.id,
    statusOpenId: statusOpen?.id,
    statusInProgressId: statusInProgress?.id,
    statusResolvedId: statusResolved?.id,
  };
}

export async function loginAndGetToken(email: string, password: string): Promise<string> {
  const db = testDb();
  const caller = appRouter.createCaller({
    db,
    mongoDb: null,
    databaseProvider: "postgres",
    user: null,
    org: null,
    orgId: null,
    sessionId: null,
    requestId: null,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    idempotencyKey: null,
  });
  const result = await caller.auth.login({ email, password });
  // FIX: 2026-03-25 — auth.login returns { sessionId } not { sessionToken }
  return (result as { sessionId: string }).sessionId;
}

export async function cleanupOrg(orgId: string) {
  const db = testDb();
  // Delete in FK-dependency order to avoid constraint violations
  await db.execute(sql`DELETE FROM ticket_comments WHERE ticket_id IN (SELECT id FROM tickets WHERE org_id = ${orgId})`);
  await db.execute(sql`DELETE FROM ticket_activity_logs WHERE ticket_id IN (SELECT id FROM tickets WHERE org_id = ${orgId})`);
  await db.execute(sql`DELETE FROM ticket_relations WHERE source_id IN (SELECT id FROM tickets WHERE org_id = ${orgId}) OR target_id IN (SELECT id FROM tickets WHERE org_id = ${orgId})`);
  await db.execute(sql`DELETE FROM tickets WHERE org_id = ${orgId}`);
  // Recruitment (no ON DELETE CASCADE on org in base migrations)
  await db.execute(sql`DELETE FROM interviews WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM job_offers WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM candidate_applications WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM job_requisitions WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM candidates WHERE org_id = ${orgId}`);
  // Performance + CSM + custom fields (Layer 8 smoke)
  await db.execute(sql`DELETE FROM performance_reviews WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM goals WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM review_cycles WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM csm_cases WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM custom_field_values WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM custom_field_definitions WHERE org_id = ${orgId}`);
  // Secretarial (board resolutions reference meetings)
  await db.execute(sql`DELETE FROM board_resolutions WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM board_meetings WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM secretarial_filings WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM share_capital WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM esop_grants WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM company_directors WHERE org_id = ${orgId}`);
  // Change management: `change_approvals.approver_id` → users is RESTRICT; org CASCADE may delete
  // users before child rows — clear approvals + requests explicitly first.
  await db.execute(sql`
    DELETE FROM change_approvals
    WHERE change_id IN (SELECT id FROM change_requests WHERE org_id = ${orgId})
  `);
  await db.execute(sql`DELETE FROM change_requests WHERE org_id = ${orgId}`);
  await db.execute(sql`DELETE FROM change_blackout_windows WHERE org_id = ${orgId}`);
  // Work orders (activity logs reference users — delete WOs before org/users)
  await db.execute(sql`DELETE FROM work_orders WHERE org_id = ${orgId}`);
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

// Keep the legacy export for existing tests
export { makeContext as createMockContext };

// Module-level DB reference for convenience
const db = testDb;
export { db };
