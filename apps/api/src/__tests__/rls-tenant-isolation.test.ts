/**
 * G14 — Postgres Row-Level Security: DB-level tenant isolation.
 *
 * These tests prove the SECOND wall (RLS, migration 0052) holds even if the
 * app-layer eq(*.orgId) filter is omitted. They replicate exactly what the
 * `rlsTenant` middleware in src/lib/trpc.ts does on every authenticated request:
 *   open a transaction, `SET LOCAL ROLE app_runtime`, `set_config('app.org_id',…)`
 * then run RAW SQL with NO org predicate and assert cross-org rows are invisible.
 *
 * The seed writes run on the pooled connection as the owner (a superuser →
 * RLS-exempt), mirroring how migrations / seeds / background workers keep full
 * access. Only the role-dropped, GUC-set transaction is constrained.
 *
 * Runs against the real test Postgres (port 5433). Each test seeds a fresh pair
 * of orgs and cleans them up so isolation holds under the shared DB.
 */
import { describe, it, expect, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { testDb } from "./helpers";
import { organizations, users, announcements, statutoryCeilings, sql, eq } from "@coheronconnect/db";

/** Seed an org + a user + one announcement (owner connection = RLS bypass). */
async function seedOrgWithAnnouncement(label: string) {
  const db = testDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: `RLS ${label}`, slug: `rls-${label}-${nanoid(6)}`, plan: "professional" })
    .returning();
  const orgId = org!.id;
  const [user] = await db
    .insert(users)
    .values({ orgId, email: `rls-${label}-${nanoid(6)}@qa.io`, name: `RLS ${label}` })
    .returning();
  const [ann] = await db
    .insert(announcements)
    .values({ orgId, title: `${label}-secret`, body: "x", type: "general", authorId: user!.id })
    .returning();
  return { orgId, userId: user!.id, announcementId: ann!.id };
}

/**
 * Run `fn` exactly as the rlsTenant middleware would: inside a transaction that
 * has dropped to app_runtime and set the org GUC (both transaction-local).
 */
async function asTenant<T>(orgId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  const db = testDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    await tx.execute(sql.raw("set local role app_runtime"));
    return fn(tx);
  });
}

describe("G14 RLS — DB-level tenant isolation", () => {
  const seededOrgIds: string[] = [];

  afterEach(async () => {
    const db = testDb();
    for (const id of seededOrgIds.splice(0)) {
      // Owner connection (bypass) cleans up regardless of RLS.
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it("app_runtime role exists and is neither superuser nor BYPASSRLS", async () => {
    const db = testDb();
    const rows = await db.execute(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = 'app_runtime'`,
    );
    const row = (rows as unknown as Array<{ rolsuper: boolean; rolbypassrls: boolean }>)[0];
    expect(row).toBeTruthy();
    expect(row.rolsuper).toBe(false);
    expect(row.rolbypassrls).toBe(false);
  });

  it("a tenant session sees ONLY its own rows even with NO org filter (SELECT isolation)", async () => {
    const a = await seedOrgWithAnnouncement("A");
    const b = await seedOrgWithAnnouncement("B");
    seededOrgIds.push(a.orgId, b.orgId);

    // Raw, UN-FILTERED select inside org-A's tenant session.
    const rows = await asTenant(a.orgId, (tx) =>
      tx.execute(sql`select org_id, title from announcements`),
    );
    const list = rows as unknown as Array<{ org_id: string; title: string }>;

    // Every visible row belongs to org A; org B's row is invisible.
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.every((r) => r.org_id === a.orgId)).toBe(true);
    expect(list.some((r) => r.title === "B-secret")).toBe(false);
    expect(list.some((r) => r.title === "A-secret")).toBe(true);
  });

  it("blocks a cross-org INSERT via WITH CHECK", async () => {
    const a = await seedOrgWithAnnouncement("A");
    const b = await seedOrgWithAnnouncement("B");
    seededOrgIds.push(a.orgId, b.orgId);

    let blocked = false;
    try {
      await asTenant(a.orgId, (tx) =>
        tx.execute(
          sql`insert into announcements (org_id, title, body, type, author_id)
              values (${b.orgId}, 'evil', 'x', 'general', ${a.userId})`,
        ),
      );
    } catch {
      blocked = true;
    }
    expect(blocked).toBe(true);
  });

  it("cannot UPDATE another org's row (USING hides it → 0 rows affected)", async () => {
    const a = await seedOrgWithAnnouncement("A");
    const b = await seedOrgWithAnnouncement("B");
    seededOrgIds.push(a.orgId, b.orgId);

    const res = await asTenant(a.orgId, (tx) =>
      tx.execute(sql`update announcements set body = 'hacked' where title = 'B-secret'`),
    );
    // postgres-js exposes affected-row count on `.count`.
    expect((res as unknown as { count: number }).count).toBe(0);

    // Confirm B's row is untouched (owner read).
    const db = testDb();
    const check = await db
      .select({ body: announcements.body })
      .from(announcements)
      .where(eq(announcements.id, b.announcementId));
    expect(check[0]!.body).toBe("x");
  });

  it("cannot DELETE another org's row (USING hides it → 0 rows affected)", async () => {
    const a = await seedOrgWithAnnouncement("A");
    const b = await seedOrgWithAnnouncement("B");
    seededOrgIds.push(a.orgId, b.orgId);

    const res = await asTenant(a.orgId, (tx) =>
      tx.execute(sql`delete from announcements where title = 'B-secret'`),
    );
    expect((res as unknown as { count: number }).count).toBe(0);

    const db = testDb();
    const still = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(eq(announcements.id, b.announcementId));
    expect(still.length).toBe(1);
  });

  it("exposes platform-default (org_id IS NULL) rows to every tenant", async () => {
    const a = await seedOrgWithAnnouncement("A");
    seededOrgIds.push(a.orgId);

    const db = testDb();
    // Seed a platform-default statutory ceiling (org_id NULL) as owner.
    const [row] = await db
      .insert(statutoryCeilings)
      .values({
        orgId: null,
        metricKey: "pf_wage_ceiling",
        value: "15000",
        effectiveFrom: new Date("2020-01-01"),
      })
      .returning();

    const seen = await asTenant(a.orgId, (tx) =>
      tx.execute(sql`select count(*)::int as n from statutory_ceilings where org_id is null`),
    );
    expect((seen as unknown as Array<{ n: number }>)[0].n).toBeGreaterThanOrEqual(1);

    // cleanup the platform-default row (owner)
    await db.delete(statutoryCeilings).where(eq(statutoryCeilings.id, row!.id));
  });

  it("owner (pool) connection is unconstrained — seeds/workers keep full access", async () => {
    const a = await seedOrgWithAnnouncement("A");
    const b = await seedOrgWithAnnouncement("B");
    seededOrgIds.push(a.orgId, b.orgId);

    const db = testDb();
    // No role drop, no GUC — sees both orgs' rows.
    const rows = await db.execute(
      sql`select count(*)::int as n from announcements where org_id in (${a.orgId}, ${b.orgId})`,
    );
    expect((rows as unknown as Array<{ n: number }>)[0].n).toBe(2);
  });

  it("SET LOCAL ROLE does not leak to the pooled connection after the tx", async () => {
    const a = await seedOrgWithAnnouncement("A");
    seededOrgIds.push(a.orgId);

    // Run a constrained tenant tx…
    await asTenant(a.orgId, (tx) => tx.execute(sql`select 1`));

    // …then the very next pooled query must be back to the owner role.
    const db = testDb();
    const who = await db.execute(sql`select current_user as u, current_setting('app.org_id', true) as org`);
    const row = (who as unknown as Array<{ u: string; org: string | null }>)[0];
    expect(row.u).not.toBe("app_runtime");
    // GUC was transaction-local, so it is unset (NULL/empty) on the pool now.
    expect(row.org === null || row.org === "").toBe(true);
  });
});
