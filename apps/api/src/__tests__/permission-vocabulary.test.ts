/**
 * R-2 — One permission vocabulary on the custom-role save path (Phase 1 ratchet,
 * root cause #3).
 *
 * A custom-role permission is stored as (resource, action). The set of legal
 * *actions* is declared in three independent places that all meet on the single
 * path where an admin creates or edits a custom role — and they must agree:
 *
 *   1. The database enum `permission_action` — the column type
 *      `permissions.action` will actually accept — has FIVE values:
 *          create · read · update · delete · manage
 *      (packages/db/src/schema/auth.ts / migration 0000).
 *
 *   2. The admin.ts create/update input schema — the tRPC boundary the save path
 *      validates against — is `z.enum(ROLE_PERMISSION_ACTIONS)`. That constant is
 *      imported here directly (not copied), so this test tracks the real schema
 *      source (apps/api/src/routers/admin.ts).
 *
 *   3. The admin UI's role-builder grid hard-codes the action strings as column
 *      headers and as the value written into each checkbox
 *      (apps/web/src/app/app/admin/page.tsx:479, 488). Whatever the admin ticks
 *      is the `action` string sent to the server. Replicated here verbatim.
 *
 * These three are the only surfaces that genuinely touch on the save path: the
 * UI produces the value, the admin.ts schema validates it, and the DB enum stores
 * it. If any two diverge, a custom role either fails to save (UI offers a value
 * the enum rejects) or silently under-offers (enum accepts a value the UI hides).
 *
 * NOTE ON SCOPE: the runtime authorization vocabulary — the `RbacAction` type and
 * the `ROLE_PERMISSIONS` matrix in @coheronconnect/types (read/write/delete/admin/
 * approve/assign/close) — is deliberately NOT pinned here. That vocabulary is used
 * by ~754 `permissionProcedure` checks and never reaches the `permission_action`
 * enum; the two are separate systems that never meet. An earlier version of this
 * ratchet asserted `RbacAction ⊆ permission_action`, which pinned a relationship
 * that does not exist and would only have been satisfiable by widening the runtime
 * vocabulary to match a DB column it never consults. That assertion has been
 * removed. The real consequence — custom roles can only express CRUD, so they
 * cannot grant approve/assign/close even though built-in roles can — is a product
 * limitation tracked separately (fix-plan A6), not a code invariant.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { testDb } from "./helpers";
import { sql } from "@coheronconnect/db";
import { ROLE_PERMISSION_ACTIONS } from "../routers/admin";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: pnpm docker:test:up && source apps/api/.env.test",
    );
  }
});

/**
 * The action strings the admin role-builder grid offers, copied verbatim from
 * apps/web/src/app/app/admin/page.tsx:479 & :488. These are the exact `action`
 * values the UI sends to the server when an admin creates a custom role. If that
 * screen's list changes, this constant must change with it — and this test is
 * what forces the two to stay in step with the admin.ts schema and the DB enum.
 */
const UI_ROLE_BUILDER_ACTIONS = [
  "create",
  "read",
  "update",
  "delete",
  "manage",
] as const;

describe("R-2: one permission vocabulary on the custom-role save path", () => {
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

  it("the UI role-builder actions are exactly the DB enum actions", async () => {
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

  it("the admin.ts create/update input schema is exactly the DB enum actions", async () => {
    const enumActions = new Set(await getDbEnumActions());
    const schemaActions = new Set<string>(ROLE_PERMISSION_ACTIONS);

    const acceptedBySchemaButDbRejects = [...schemaActions].filter(
      (a) => !enumActions.has(a),
    );
    const acceptedByDbButSchemaRejects = [...enumActions].filter(
      (a) => !schemaActions.has(a),
    );

    expect(
      { acceptedBySchemaButDbRejects, acceptedByDbButSchemaRejects },
      `The admin.roles create/update input schema (ROLE_PERMISSION_ACTIONS in ` +
        `apps/api/src/routers/admin.ts) and the permission_action DB enum must ` +
        `accept the exact same set of actions.\n` +
        `  Accepted by the schema but the DB column will reject: [${acceptedBySchemaButDbRejects.join(", ")}]\n` +
        `  Accepted by the DB but the schema rejects:            [${acceptedByDbButSchemaRejects.join(", ")}]`,
    ).toEqual({ acceptedBySchemaButDbRejects: [], acceptedByDbButSchemaRejects: [] });
  });
});
