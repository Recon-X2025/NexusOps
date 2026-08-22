/**
 * "This id belongs to my org" — ONE implementation.
 *
 * The isolation sweep of 2026-08-22 found handlers that correctly validate their
 * PARENT record and then store a SECONDARY reference — an owner, an assignee, a
 * linked asset — straight from input. Where that reference lands in a table with
 * no `org_id`, there is no RLS behind it and the app-layer check is the only
 * wall; where it lands in a table that has one, RLS still blocks the read-back
 * but the row is left holding a dangling cross-tenant reference.
 *
 * Six sites needed the same three lines. A second copy of an ownership rule is
 * the divergent-duplicate defect this codebase keeps rediscovering, so it lives
 * here and the callers call it.
 *
 * NOT FOUND, not FORBIDDEN: a caller must not be able to tell the difference
 * between "this id is in another org" and "this id does not exist", or the error
 * becomes an existence oracle across tenants.
 */
import { TRPCError } from "@trpc/server";
import { eq, and, type DbOrTx } from "@coheronconnect/db";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/** Any table carrying the two columns this check needs. */
export type OrgScopedTable = PgTable & { id: PgColumn; orgId: PgColumn };

/**
 * Throws NOT_FOUND unless `id` names a row of `table` inside `orgId`.
 * `label` is used only for the error message.
 */
export async function assertSameOrg(
  db: DbOrTx,
  table: OrgScopedTable,
  id: string,
  orgId: string,
  label: string,
): Promise<void> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.orgId, orgId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `${label} not found` });
}

/** Same check, skipped when the reference is absent. */
export async function assertSameOrgIfPresent(
  db: DbOrTx,
  table: OrgScopedTable,
  id: string | null | undefined,
  orgId: string,
  label: string,
): Promise<void> {
  if (id === null || id === undefined) return;
  await assertSameOrg(db, table, id, orgId, label);
}
