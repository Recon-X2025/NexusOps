import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../schema/index";

/**
 * Tenant-isolation schema guard.
 *
 * Multi-tenancy is enforced by always filtering on `org_id`. Any table that
 * carries an `org_id` column MUST also be able to satisfy those filters with an
 * index, otherwise per-tenant queries degrade to full table scans as data grows
 * and cross-tenant predicates become easy to forget. This test reflects over the
 * live Drizzle schema and fails the build if an `org_id`-bearing table has no
 * index, primary key, or unique constraint that leads with / covers `org_id`.
 *
 * A column is considered "covered" when `org_id` participates in any:
 *   - regular index
 *   - unique index
 *   - primary key
 * (composite is fine — a PK/unique on (org_id, …) still produces a usable index).
 */

type AnyTable = Parameters<typeof getTableConfig>[0];

function collectTables(): Array<{ name: string; cfg: ReturnType<typeof getTableConfig> }> {
  const out: Array<{ name: string; cfg: ReturnType<typeof getTableConfig> }> = [];
  for (const value of Object.values(schema)) {
    let cfg: ReturnType<typeof getTableConfig>;
    try {
      cfg = getTableConfig(value as AnyTable);
    } catch {
      continue; // not a pg table (enum, relation, operator re-export, …)
    }
    out.push({ name: cfg.name, cfg });
  }
  return out;
}

function indexCoversOrg(cfg: ReturnType<typeof getTableConfig>): boolean {
  const colNameOf = (c: unknown): string | undefined =>
    (c as { name?: string })?.name ??
    (c as { column?: { name?: string } })?.column?.name;

  // explicit indexes / unique indexes
  const inIndexes = cfg.indexes.some((i) =>
    i.config.columns.some((c) => colNameOf(c) === "org_id"),
  );
  if (inIndexes) return true;

  // primary key (single or composite) leading with / containing org_id
  const inPk = cfg.primaryKeys.some((pk) =>
    pk.columns.some((c) => (c as { name?: string }).name === "org_id"),
  );
  if (inPk) return true;

  // a column declared `.primaryKey()` inline shows up as cfg.columns[].primary
  const inlinePkOnOrg = cfg.columns.some(
    (c) => c.name === "org_id" && c.primary,
  );
  if (inlinePkOnOrg) return true;

  // unique constraints (drizzle exposes these separately from indexes)
  const inUnique = cfg.uniqueConstraints.some((u) =>
    u.columns.some((c) => (c as { name?: string }).name === "org_id"),
  );
  return inUnique;
}

describe("tenant-isolation schema guard", () => {
  const tables = collectTables();

  it("discovers a non-trivial set of tables", () => {
    // Sanity check: if introspection silently breaks, don't pass vacuously.
    expect(tables.length).toBeGreaterThan(100);
  });

  it("every table with an org_id column has an index covering org_id", () => {
    const orgTables = tables.filter(({ cfg }) =>
      cfg.columns.some((c) => c.name === "org_id"),
    );

    // Guard against the introspection returning zero org tables (vacuous pass).
    expect(orgTables.length).toBeGreaterThan(100);

    const offenders = orgTables
      .filter(({ cfg }) => !indexCoversOrg(cfg))
      .map(({ name }) => name)
      .sort();

    expect(
      offenders,
      `Tables carry an org_id column but no index/PK/unique covering it. ` +
        `Add an index on org_id (e.g. index("<table>_org_idx").on(t.orgId)) ` +
        `in the table's schema definition. Offenders:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
