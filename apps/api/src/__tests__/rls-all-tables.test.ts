/**
 * R-1 — Every tenant table has its database wall (Phase 1 ratchet, root cause #5).
 *
 * Tenant isolation has a second line of defence behind the app-layer
 * `eq(table.orgId, ctx.org.id)` filters: Postgres Row-Level Security, installed by
 * migration `packages/db/drizzle/0052_odd_forgotten_wall.sql`. That migration walls
 * *every table carrying an `org_id` column* by both ENABLE-ing and FORCE-ing RLS and
 * attaching a `tenant_isolation` policy.
 *
 * The weakness this test closes: `0052` walled the tables that existed when it was
 * written, but new tenant tables added afterwards (`shift_schedules`,
 * `esi_challan_records`, `pt_challan_records`) were never added to it — so they carry
 * `org_id` but have no wall. The old `tenant-isolation.test.ts` only checks a few
 * hand-picked tables through tRPC, so it never noticed.
 *
 * This test asks the live database two independent questions and cross-checks them:
 *   1. Which base tables have an `org_id` column?  (information_schema.columns —
 *      the exact rule `0052` used to decide what to wall.)
 *   2. For each of those, is RLS both ENABLED and FORCED?  (pg_class.relrowsecurity
 *      AND relforcerowsecurity — Postgres's own catalog.)
 *
 * Every `org_id`-bearing table must answer yes to (2). The moment any tenant table
 * exists without the wall — today's three, or any future one — this fails and names
 * the offenders. It is the ratchet A11's migration turns green.
 *
 * NOTE (expected RED until A11): this test is written in Phase 1 and is expected to
 * FAIL against the current schema, listing the three unwalled tables above. That red
 * is the proof the ratchet works; A11 (Phase 2) installs the wall and turns it green.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { testDb } from "./helpers";
import { sql } from "@coheronconnect/db";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: pnpm docker:test:up && source apps/api/.env.test",
    );
  }
});

describe("R-1: every tenant table has RLS enabled and forced", () => {
  let db: ReturnType<typeof testDb>;

  beforeAll(() => {
    db = testDb();
  });

  /**
   * "Tenant table" = a public base table that carries an `org_id` column. This is
   * precisely the predicate migration 0052 used to choose which tables to wall, so
   * the test's notion of "must be walled" matches the migration's.
   */
  async function getTenantTables(): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT DISTINCT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND c.column_name = 'org_id'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name
    `);
    return (rows as { table_name: string }[]).map((r) => r.table_name);
  }

  /**
   * Read RLS state straight from Postgres's catalog. Both flags must be true:
   *   - relrowsecurity      → RLS is ENABLED
   *   - relforcerowsecurity → RLS is FORCED (also applies to the table owner; without
   *                           FORCE the owner/superuser bypasses the policy)
   */
  async function getRlsState(
    table: string,
  ): Promise<{ enabled: boolean; forced: boolean } | null> {
    const rows = await db.execute(sql`
      SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ${table}
    `);
    const row = (rows as { enabled: boolean; forced: boolean }[])[0];
    if (!row) return null;
    return { enabled: Boolean(row.enabled), forced: Boolean(row.forced) };
  }

  it("finds at least one tenant table (sanity: the enumeration works)", async () => {
    const tables = await getTenantTables();
    // Guard against the query silently returning nothing and the real assertion
    // below passing vacuously.
    expect(tables.length).toBeGreaterThan(0);
  });

  it("every table with an org_id column has RLS enabled AND forced", async () => {
    const tables = await getTenantTables();

    const unwalled: string[] = [];
    for (const table of tables) {
      const state = await getRlsState(table);
      if (!state || !state.enabled || !state.forced) {
        unwalled.push(
          `${table} (enabled=${state?.enabled ?? "missing"}, forced=${state?.forced ?? "missing"})`,
        );
      }
    }

    expect(
      unwalled,
      `Tenant tables (they carry org_id) that are missing the RLS wall — each must be ` +
        `ENABLE + FORCE ROW LEVEL SECURITY per 0052_odd_forgotten_wall.sql:\n  ` +
        unwalled.join("\n  "),
    ).toEqual([]);
  });
});
