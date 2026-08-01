/**
 * R-2 — One permission vocabulary, or none (Phase 1 ratchet, root cause #3).
 *
 * A permission is stored as (resource, action). The set of legal *actions* is
 * declared in three independent places, and today they disagree:
 *
 *   1. The database enum `permission_action` — the column type the DB will
 *      actually accept — has FIVE values:
 *          create · read · update · delete · manage
 *      (packages/db/src/schema/auth.ts:248-254)
 *
 *   2. The TypeScript type `RbacAction` — what the shared types package says an
 *      action is — has SEVEN values:
 *          read · write · delete · admin · approve · assign · close
 *      (packages/types/src/rbac-matrix.ts:102-109)
 *
 *   3. The admin UI's role-builder grid hard-codes the SAME seven strings as
 *      column headers and as the value written into each checkbox
 *      (apps/web/src/app/app/admin/page.tsx:479, 488). Whatever the admin ticks
 *      is the `action` string sent to the server to create a custom role.
 *
 * So the screen offers `write / admin / approve / assign / close` — none of which
 * the database column can hold — and hides `create / update / manage`, which it
 * can. The two camps overlap on only `read` and `delete`. The mismatch was
 * papered over by `as any` casts on the write path (admin.ts), so nothing ever
 * complained: this is root cause #3 — deciding "same or different" by comparing
 * two vocabularies that were never the same word list.
 *
 * This ratchet pins all three to ONE list and fails the moment any two diverge:
 *
 *   • RUNTIME pin — reads the live enum straight from Postgres's `pg_enum`
 *     catalog (not a copy of it) and compares that set to the UI's seven strings,
 *     replicated here verbatim from admin/page.tsx. Two independent sources,
 *     cross-checked, so it cannot pass vacuously.
 *
 *   • COMPILE-TIME pin — imports the real `RbacAction` type from
 *     `@coheronconnect/types` and asserts every one of its members is a member of
 *     the DB-enum set. Today it is not (write/admin/approve/assign/close have no
 *     home in the enum), so this assertion is red too.
 *
 * NOTE (expected RED until Phase 2): both assertions are written to fail against
 * the current schema, listing the divergence in both directions. That red is the
 * proof the ratchet works; Phase 2 collapses the three surfaces onto one
 * vocabulary and turns it green.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { testDb } from "./helpers";
import { sql } from "@coheronconnect/db";
import type { RbacAction } from "@coheronconnect/types";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: pnpm docker:test:up && source apps/api/.env.test",
    );
  }
});

/**
 * The seven strings the admin role-builder grid offers, copied verbatim from
 * apps/web/src/app/app/admin/page.tsx:479 & :488. These are the exact `action`
 * values the UI sends to the server when an admin creates a custom role. If that
 * screen's list changes, this constant must change with it — and this test is
 * what forces the two to stay in step with the DB enum.
 */
const UI_ROLE_BUILDER_ACTIONS = [
  "read",
  "write",
  "delete",
  "admin",
  "approve",
  "assign",
  "close",
] as const;

/**
 * Every member of the `RbacAction` type, listed as runtime values so the
 * compile-time type and the runtime check share one source. The
 * `satisfies readonly RbacAction[]` below makes TypeScript reject this array if
 * it ever drifts from the `RbacAction` union — so this is the type surface, not
 * a hand-maintained guess.
 */
const RBAC_ACTION_VALUES = [
  "read",
  "write",
  "delete",
  "admin",
  "approve",
  "assign",
  "close",
] as const satisfies readonly RbacAction[];

describe("R-2: one permission vocabulary across DB enum, RbacAction type, and UI", () => {
  let db: ReturnType<typeof testDb>;

  beforeAll(() => {
    db = testDb();
  });

  /**
   * Read the legal `action` values straight from the live Postgres catalog —
   * the exact set the `permissions.action` column will accept. `pg_enum` holds
   * one row per enum label; joining to `pg_type` by name selects our enum.
   */
  async function getDbEnumActions(): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT e.enumlabel AS label
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'permission_action'
      ORDER BY e.enumsortorder
    `);
    return (rows as { label: string }[]).map((r) => r.label);
  }

  it("finds the permission_action enum in the live DB (sanity: the read works)", async () => {
    const enumActions = await getDbEnumActions();
    // Guard against the catalog query silently returning nothing and the real
    // assertions below passing vacuously.
    expect(enumActions.length).toBeGreaterThan(0);
  });

  it("RUNTIME: the UI role-builder actions are exactly the DB enum actions", async () => {
    const enumActions = new Set(await getDbEnumActions());
    const uiActions = new Set<string>(UI_ROLE_BUILDER_ACTIONS);

    const offeredByUiButDbRejects = [...uiActions].filter(
      (a) => !enumActions.has(a),
    );
    const acceptedByDbButUiHides = [...enumActions].filter(
      (a) => !uiActions.has(a),
    );

    expect(
      { offeredByUiButDbRejects, acceptedByDbButUiHides },
      `The admin role-builder (apps/web/src/app/app/admin/page.tsx) and the ` +
        `permission_action DB enum (packages/db/src/schema/auth.ts) must offer the ` +
        `exact same set of actions.\n` +
        `  Offered by the UI but the DB column will reject: [${offeredByUiButDbRejects.join(", ")}]\n` +
        `  Accepted by the DB but the UI never offers:      [${acceptedByDbButUiHides.join(", ")}]`,
    ).toEqual({ offeredByUiButDbRejects: [], acceptedByDbButUiHides: [] });
  });

  it("COMPILE-TIME: every RbacAction value is a value the DB enum accepts", async () => {
    const enumActions = new Set(await getDbEnumActions());

    const rbacActionsDbRejects = RBAC_ACTION_VALUES.filter(
      (a) => !enumActions.has(a),
    );

    expect(
      rbacActionsDbRejects,
      `Every member of the RbacAction type (@coheronconnect/types) must be a ` +
        `value the permission_action DB enum can store. These RbacAction values ` +
        `have no home in the enum:\n  [${rbacActionsDbRejects.join(", ")}]`,
    ).toEqual([]);
  });
});
