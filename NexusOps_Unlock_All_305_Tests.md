# NexusOps — Unlock All 305 Tests: Environment Provisioning Prompt

## The Problem

98 of 305 tests pass. The other 207 aren't failing — they're skipped because the test environment lacks:
1. A running PostgreSQL database (`nexusops_test`)
2. A running Redis instance
3. A running dev server (for Playwright E2E)

The test code is written. The logic is verified by code review. This prompt provisions the environment and makes all 305 tests executable.

---

## Cursor Prompt

```
The NexusOps QA suite has 305 tests written across 10 layers. 98 pass (pure logic tests).
207 are skipped because the test database, Redis, and dev server aren't available.

Fix this by doing the following IN ORDER:

=============================================================================
STEP 1: Test Docker Compose
=============================================================================

Create docker-compose.test.yml at the repo root (separate from docker-compose.dev.yml 
so tests don't interfere with development data):

version: '3.8'
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nexusops_test
      POSTGRES_PASSWORD: nexusops_test
      POSTGRES_DB: nexusops_test
    ports:
      - "5433:5432"    # Different port from dev (5432) so both can run simultaneously
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexusops_test"]
      interval: 2s
      timeout: 5s
      retries: 10
    tmpfs:
      - /var/lib/postgresql/data  # RAM-backed for speed — data doesn't persist

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"    # Different port from dev Redis
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 5s
      retries: 10

  meilisearch-test:
    image: getmeili/meilisearch:v1.6
    environment:
      MEILI_MASTER_KEY: test_master_key
      MEILI_ENV: development
    ports:
      - "7701:7700"    # Different port from dev Meilisearch
    tmpfs:
      - /meili_data


=============================================================================
STEP 2: Test Environment Variables
=============================================================================

Create .env.test at the repo root:

DATABASE_URL=postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test
REDIS_URL=redis://localhost:6380
MEILISEARCH_URL=http://localhost:7701
MEILISEARCH_KEY=test_master_key
AUTH_SECRET=test-secret-do-not-use-in-production-abcdef123456
ENCRYPTION_KEY=test-encryption-key-32-chars-long!
NEXT_PUBLIC_API_URL=http://localhost:3001
NODE_ENV=test


=============================================================================
STEP 3: Update Test Setup to Use Test Environment
=============================================================================

Update apps/api/src/__tests__/setup.ts:

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.test BEFORE any other imports that read env vars
config({ path: resolve(__dirname, '../../../../.env.test') });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';

let testDb: ReturnType<typeof drizzle>;
let pgClient: ReturnType<typeof postgres>;

export async function setupTestDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set — run tests with .env.test loaded');
  }
  
  pgClient = postgres(connectionString, { max: 10 });
  testDb = drizzle(pgClient);
  
  // Apply schema
  // Option A: If using drizzle-kit push programmatically
  // Option B: Run migrations
  // Option C: Execute the schema SQL directly
  // The simplest approach that matches pnpm db:push:
  const { execSync } = await import('child_process');
  execSync('pnpm --filter @nexusops/db db:push', { 
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: 'pipe'
  });
  
  return testDb;
}

export async function teardownTestDb() {
  if (pgClient) {
    await pgClient.end();
  }
}

export async function truncateAllTables(db: typeof testDb) {
  // Get all table names in public schema
  const tables = await db.execute(sql`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT LIKE 'drizzle_%'
  `);
  
  if (tables.length > 0) {
    const tableNames = tables.map((t: any) => `"${t.tablename}"`).join(', ');
    await db.execute(sql.raw(`TRUNCATE TABLE ${tableNames} CASCADE`));
  }
}

export { testDb };


=============================================================================
STEP 4: Update vitest.config.ts to Load Test Env
=============================================================================

In apps/api/vitest.config.ts, ensure it loads .env.test:

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Load .env.test
    env: {
      // dotenv will be loaded in setup.ts, but also set here as fallback
    },
    // Run layers sequentially (not in parallel) to avoid DB conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,  // All tests in one process to share DB connection
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});


=============================================================================
STEP 5: Update Test Helpers to Actually Connect
=============================================================================

In apps/api/src/__tests__/helpers.ts, update the helpers to use real DB operations:

import { setupTestDb, truncateAllTables, testDb } from './setup';
import { organizations, users, sessions } from '@nexusops/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

let db: typeof testDb;

export async function initTestEnvironment() {
  db = await setupTestDb();
  return db;
}

export async function cleanTestData() {
  await truncateAllTables(db);
}

export async function seedTestOrg(name = 'QA Test Org', slug = 'qa-test') {
  const orgId = crypto.randomUUID();
  await db.insert(organizations).values({
    id: orgId,
    name,
    slug,
    plan: 'enterprise',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { orgId };
}

export async function seedUser(orgId: string, opts: {
  email: string;
  password?: string;
  role?: string;
  matrixRole?: string;
  name?: string;
}) {
  const userId = crypto.randomUUID();
  const passwordHash = opts.password 
    ? await bcrypt.hash(opts.password, 12)
    : null;
  
  await db.insert(users).values({
    id: userId,
    orgId,
    email: opts.email,
    name: opts.name || opts.email.split('@')[0],
    role: opts.role || 'member',
    matrixRole: opts.matrixRole || null,
    passwordHash,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  
  return { userId };
}

export async function seedFullOrg() {
  const { orgId } = await seedTestOrg();
  
  const admin = await seedUser(orgId, { 
    email: 'admin@qa-test.com', password: 'Test1234!', 
    role: 'owner', matrixRole: 'admin', name: 'QA Admin' 
  });
  const agent = await seedUser(orgId, { 
    email: 'agent@qa-test.com', password: 'Test1234!', 
    role: 'member', matrixRole: 'itil', name: 'QA Agent' 
  });
  const hrManager = await seedUser(orgId, { 
    email: 'hr@qa-test.com', password: 'Test1234!', 
    role: 'member', matrixRole: 'hr_manager', name: 'QA HR Manager' 
  });
  const financeManager = await seedUser(orgId, { 
    email: 'finance@qa-test.com', password: 'Test1234!', 
    role: 'member', matrixRole: 'finance_manager', name: 'QA Finance Manager' 
  });
  const requester = await seedUser(orgId, { 
    email: 'requester@qa-test.com', password: 'Test1234!', 
    role: 'member', matrixRole: 'requester', name: 'QA Requester' 
  });
  const viewer = await seedUser(orgId, { 
    email: 'viewer@qa-test.com', password: 'Test1234!', 
    role: 'viewer', matrixRole: 'report_viewer', name: 'QA Viewer' 
  });
  const securityAnalyst = await seedUser(orgId, {
    email: 'security@qa-test.com', password: 'Test1234!',
    role: 'member', matrixRole: 'security_analyst', name: 'QA Security'
  });
  
  return {
    orgId,
    adminId: admin.userId,
    agentId: agent.userId,
    hrManagerId: hrManager.userId,
    financeManagerId: financeManager.userId,
    requesterId: requester.userId,
    viewerId: viewer.userId,
    securityAnalystId: securityAnalyst.userId,
  };
}

export async function createSession(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  
  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    createdAt: new Date(),
  });
  
  return rawToken;  // Return the unhashed token (what the client would hold)
}

// Create a tRPC caller that's authenticated as a specific user
export async function authedCaller(token: string) {
  // Import the actual tRPC router and createContext
  const { appRouter } = await import('../routers/_app');
  const { createContext } = await import('../middleware/auth');
  
  // Build a mock Fastify request with the token
  const mockReq = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-forwarded-for': '127.0.0.1',
      'user-agent': 'NexusOps-QA-Test/1.0',
    },
  };
  
  const ctx = await createContext({ req: mockReq as any });
  return appRouter.createCaller(ctx);
}

export async function loginAndGetToken(email: string, password: string) {
  // Import and call auth.login directly
  const { appRouter } = await import('../routers/_app');
  const publicCaller = appRouter.createCaller({
    user: null, org: null, orgId: null, session: null,
    ipAddress: '127.0.0.1', userAgent: 'QA-Test',
  } as any);
  
  const result = await publicCaller.auth.login({ email, password });
  return result.token; // or whatever the login returns
}


=============================================================================
STEP 6: Remove All test.skip() Guards
=============================================================================

In EVERY test file (layer1 through layer9), find all instances of:

  test.skip('...', ...)
  it.skip('...', ...)
  describe.skip('...', ...)
  
And also any conditional skipping like:

  const SKIP_DB_TESTS = !process.env.DATABASE_URL;
  beforeAll(() => { if (SKIP_DB_TESTS) return; ... });

Replace ALL of these with unconditional versions:

  test('...', ...)    // not test.skip
  it('...', ...)      // not it.skip
  describe('...', ...)

The tests should FAIL loudly if the DB isn't available, not silently skip.
A skipped test is invisible. A failed test is actionable.

Add this to the very top of each layer file after imports:

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test'
      );
    }
  });

This way, if someone runs tests without the infrastructure, they get a clear
error message telling them exactly what to do — not 207 mysterious skips.


=============================================================================
STEP 7: Fix the Approval Threshold Discrepancy
=============================================================================

The QA report found:
"Approval thresholds: <$1K auto, $1K–$10K dept, >$10K VP+Finance — 
 Differs from spec's ₹75K/₹750K — USD thresholds in code"

The platform uses INR (₹). The thresholds should be in INR.

Open apps/api/src/routers/procurement.ts and update the approval chain logic:

  // WRONG (USD thresholds):
  if (totalAmount < 1000) { /* auto-approve */ }
  else if (totalAmount < 10000) { /* dept head */ }
  else { /* VP + finance */ }

  // CORRECT (INR thresholds):
  const AUTO_APPROVE_LIMIT = 75000;        // ₹75,000
  const DEPT_HEAD_LIMIT = 750000;          // ₹7,50,000
  
  if (totalAmount < AUTO_APPROVE_LIMIT) { /* auto-approve */ }
  else if (totalAmount < DEPT_HEAD_LIMIT) { /* dept head */ }
  else { /* VP + finance sequential */ }

Then update the corresponding tests in layer5-business-logic.test.ts:

  test('PR under ₹75,000 is auto-approved', async () => {
    // Create PR with total = 50000 → status should be "approved"
  });
  test('PR ₹75,000–₹7,50,000 routes to dept head', async () => {
    // Create PR with total = 300000
  });
  test('PR over ₹7,50,000 routes to VP then finance', async () => {
    // Create PR with total = 1000000
  });


=============================================================================
STEP 8: Playwright Config for E2E
=============================================================================

Update playwright.config.ts at repo root to properly wait for the dev server:

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,         // Run sequentially (tests share state)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                   // Single worker for consistent state
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Auto-start the dev server before E2E tests
  webServer: [
    {
      command: 'pnpm --filter @nexusops/api dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
      },
    },
    {
      command: 'pnpm --filter @nexusops/web dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});


=============================================================================
STEP 9: Add Seed Before E2E
=============================================================================

Create e2e/global-setup.ts:

import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('🌱 Seeding test database for E2E tests...');
  
  execSync('pnpm db:push', { 
    env: { 
      ...process.env, 
      DATABASE_URL: 'postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test' 
    },
    stdio: 'inherit' 
  });
  
  execSync('pnpm db:seed', { 
    env: { 
      ...process.env, 
      DATABASE_URL: 'postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test' 
    },
    stdio: 'inherit' 
  });
  
  console.log('✅ Seed complete');
}

Add to playwright.config.ts:
  globalSetup: require.resolve('./e2e/global-setup'),


=============================================================================
STEP 10: One-Command Full Execution Script
=============================================================================

Create scripts/run-full-qa.sh at repo root:

#!/bin/bash
set -e

echo "=========================================="
echo "NexusOps Full QA Suite — 10 Layer Execution"
echo "=========================================="

# Step 1: Start test infrastructure
echo "🐳 Starting test infrastructure..."
docker compose -f docker-compose.test.yml up -d --wait
echo "✅ Postgres, Redis, Meilisearch running"

# Step 2: Load test env
export $(cat .env.test | grep -v '^#' | xargs)

# Step 3: Apply schema
echo "📋 Applying database schema..."
pnpm --filter @nexusops/db db:push
echo "✅ Schema applied"

# Step 4: Seed data (for E2E)
echo "🌱 Seeding demo data..."
pnpm --filter @nexusops/db db:seed
echo "✅ Seed complete"

# Step 5: Run Layer 1-9 (API tests)
echo ""
echo "=========================================="
echo "Running API Tests (Layers 1-9)"
echo "=========================================="
echo ""

for i in $(seq 1 9); do
  echo "--- Layer $i ---"
  pnpm --filter @nexusops/api vitest run --reporter=verbose "src/__tests__/layer${i}*" || {
    echo "❌ Layer $i FAILED"
    FAILED=true
  }
  echo ""
done

# Step 6: Run Layer 10 (E2E)
echo "=========================================="
echo "Running E2E Tests (Layer 10)"
echo "=========================================="
echo ""

pnpm exec playwright test --reporter=list || {
  echo "❌ Layer 10 (E2E) FAILED"
  FAILED=true
}

# Step 7: Report
echo ""
echo "=========================================="
if [ "$FAILED" = true ]; then
  echo "❌ QA SUITE: FAILURES DETECTED"
  echo "Review output above for failing tests."
  echo "=========================================="
  exit 1
else
  echo "✅ QA SUITE: ALL LAYERS PASSED"
  echo "Platform is PRODUCTION READY."
  echo "=========================================="
  exit 0
fi

Make it executable:
chmod +x scripts/run-full-qa.sh

Add to root package.json scripts:
"test:full-qa": "bash scripts/run-full-qa.sh",
"test:layer1": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer1*",
"test:layer2": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer2*",
"test:layer3": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer3*",
"test:layer4": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer4*",
"test:layer5": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer5*",
"test:layer6": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer6*",
"test:layer7": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer7*",
"test:layer8": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer8*",
"test:layer9": "dotenv -e .env.test -- pnpm --filter @nexusops/api vitest run src/__tests__/layer9*",
"test:layer10": "playwright test",
"test:all-layers": "pnpm test:full-qa",
"test:qa-report": "bash scripts/run-full-qa.sh 2>&1 | tee qa-report-$(date +%Y%m%d-%H%M%S).txt"

Install dotenv-cli if not present:
pnpm add -D dotenv-cli


=============================================================================
STEP 11: Verify and Fix Any Test That Fails for Real Reasons
=============================================================================

After running the full suite, some tests may fail not because of missing infrastructure
but because of actual bugs. For each failing test:

1. Read the error message carefully.
2. If it's a connection error → the Docker container isn't ready. Wait and retry.
3. If it's a "table doesn't exist" → a schema migration is missing. Run pnpm db:push.
4. If it's a "procedure not found" → a tRPC router isn't registered. Check _app.ts.
5. If it's an assertion failure → this is a REAL BUG. Fix it:
   a. Open the router file the test targets
   b. Fix the logic
   c. Re-run just that layer: pnpm test:layerN
   d. Once green, re-run all layers to check for regressions

Common expected issues:
- Approval thresholds in USD instead of INR (fixed in Step 7 above)
- Session token format mismatch between test helper and auth middleware
- Missing seed data for specific entity types (add to fixtures.ts)
- Drizzle column name mismatch (camelCase in TS vs snake_case in DB)
- tRPC procedure name mismatch (test uses 'tickets.list', router exports 'list' under 'tickets')

For each fix, document it by adding a comment in the test:
// FIX: [date] — [what was wrong] → [what was fixed]
```

---

## After Running This Prompt

The execution flow is:

```
bash scripts/run-full-qa.sh
```

This single command:
1. Starts isolated test Postgres + Redis + Meilisearch (different ports from dev)
2. Applies the schema
3. Seeds demo data
4. Runs all 9 API test layers against the real database
5. Starts the dev server
6. Runs all Playwright E2E tests
7. Produces a pass/fail report

**Expected outcome:** Most of the 207 skipped tests will immediately pass once the database is available, because the test logic is already verified correct by code review. The failures that DO appear are the actual punch list — real bugs to fix, not infrastructure gaps.

**The approval threshold discrepancy (USD vs INR) is the one known bug** from the QA report. Step 7 fixes it. Everything else should be clean.
