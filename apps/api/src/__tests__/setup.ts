import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.test BEFORE any other imports that read env vars
config({ path: resolve(__dirname, '../../../../.env.test') });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

let _testDb: ReturnType<typeof drizzle> | undefined;
let _pgClient: ReturnType<typeof postgres> | undefined;

export async function setupTestDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set — run tests with .env.test loaded');
  }

  _pgClient = postgres(connectionString, { max: 10 });
  _testDb = drizzle(_pgClient);

  // Apply schema using drizzle-kit migrate (versioned migration files — more
  // reliable than `db:push` which silently exits in strict mode when piped).
  const { execSync } = await import('child_process');
  execSync('pnpm --filter @coheronconnect/db db:migrate', {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: 'pipe',
  });

  return _testDb;
}

export async function teardownTestDb() {
  if (_pgClient) {
    await _pgClient.end();
    _pgClient = undefined;
    _testDb = undefined;
  }
}

export async function truncateAllTables(db: ReturnType<typeof drizzle>) {
  const tables = await db.execute(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE 'drizzle_%'
  `);

  if (tables.length > 0) {
    const tableNames = (tables as Array<{ tablename: string }>)
      .map((t) => `"${t.tablename}"`)
      .join(', ');
    await db.execute(sql.raw(`TRUNCATE TABLE ${tableNames} CASCADE`));
  }
}

// Exported reference — populated after setupTestDb() is called
export let testDb: ReturnType<typeof drizzle>;

// Ensure testDb reference is kept in sync
Object.defineProperty(exports, 'testDb', {
  get() { return _testDb; },
});
