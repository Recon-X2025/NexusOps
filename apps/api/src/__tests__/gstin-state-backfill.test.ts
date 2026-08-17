/**
 * Migration 0095 — gstin_registry.state_code backfilled from the GSTIN.
 *
 * The Setup Wizard wrote a 2-letter ISO 3166-2:IN code ("KA", "MH") into a column
 * that must hold a 2-DIGIT GST code ("29"). `normaliseStateToCode('KA')` returns
 * null, so the supplier had no resolvable state, `computeGST` compared '' against
 * the buyer's code, and a Karnataka-to-Karnataka supply billed inter-state IGST.
 * The write path was fixed separately; this covers the rows that already exist.
 *
 * The tests execute the REAL migration file rather than a copy of its SQL, so the
 * assertions cannot drift from what actually runs against production.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { seedFullOrg, testDb } from "./helpers";
import { gstinRegistry, eq, and } from "@coheronconnect/db";
import { normaliseStateToCode } from "@coheronconnect/payroll-math";

const MIGRATION = resolve(
  __dirname,
  "../../../../packages/db/drizzle/0095_glorious_wallflower.sql",
);

/** The guard and the UPDATE, as drizzle runs them — split on its breakpoint marker. */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Run the real migration's statements, SCOPED to the org under test.
 *
 * Why scoping is necessary, and why it does not weaken the test.
 *
 * The shipped migration is deliberately GLOBAL — it guards and updates every row
 * in `gstin_registry` with no org filter, because that is exactly what it must do
 * in production. The shared test database, however, is full of other suites'
 * fixtures using GSTINs like `27JKIZJR0A1Z5` — 13 characters, not 15, so
 * structurally invalid — and each is referenced by an invoice under a RESTRICT
 * foreign key. Run unscoped here the guard raises on THEIR data, which is correct
 * behaviour for the migration and says nothing about the rows under test; and
 * they cannot be cleaned up first, because the FK refuses to let them go.
 *
 * So the WHERE clauses are narrowed to this test's org. The guard logic, the
 * derivation and the raise are the file's own, read from disk — only the row set
 * is narrowed. `the shipped migration is not org-scoped` below pins that the
 * narrowing is a test affordance and never leaks into what ships.
 *
 * The unscoped file is separately validated end-to-end against a populated clone
 * of a real database, which is where global behaviour genuinely belongs.
 */
function scopedStatements(orgId: string): string[] {
  return migrationStatements().map((stmt) =>
    stmt
      .replace(
        /FROM gstin_registry\s+WHERE gstin IS NOT NULL/,
        `FROM gstin_registry WHERE org_id = '${orgId}'::uuid AND gstin IS NOT NULL`,
      )
      .replace(
        /UPDATE gstin_registry\s+SET/,
        `UPDATE gstin_registry SET`,
      )
      .replace(
        /WHERE gstin IS NOT NULL\s+AND btrim\(gstin\) <> ''\s+AND state_code IS DISTINCT FROM/,
        `WHERE org_id = '${orgId}'::uuid AND gstin IS NOT NULL AND btrim(gstin) <> '' AND state_code IS DISTINCT FROM`,
      ),
  );
}

async function runMigration(orgId: string): Promise<void> {
  const db = testDb();
  for (const stmt of scopedStatements(orgId)) {
    await db.execute(sql.raw(stmt));
  }
}

describe("0095 — GSTIN state backfill", () => {
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
  });

  it("corrects an ISO code to the code the GSTIN implies", async () => {
    const db = testDb();
    await db.insert(gstinRegistry).values({
      orgId,
      gstin: "29AABCC1234D1ZP",
      legalName: "ISO Code Ltd",
      stateCode: "KA", // what the wizard wrote
      isActive: true,
    });

    // Before: unusable — this is the whole defect.
    expect(normaliseStateToCode("KA")).toBeNull();

    await runMigration(orgId);

    const [row] = await db
      .select()
      .from(gstinRegistry)
      .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.gstin, "29AABCC1234D1ZP")));
    expect(row!.stateCode).toBe("29");
    // And the stored value is now one the GST engine can actually resolve.
    expect(normaliseStateToCode(row!.stateCode)).toBe("29");
  });

  it("corrects a state from a jurisdiction other than Karnataka", async () => {
    const db = testDb();
    await db.insert(gstinRegistry).values({
      orgId,
      gstin: "32AABCC2222D1ZP", // Kerala
      legalName: "Kerala Branch Ltd",
      stateCode: "KL",
      isActive: true,
    });

    await runMigration(orgId);

    const [row] = await db
      .select()
      .from(gstinRegistry)
      .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.gstin, "32AABCC2222D1ZP")));
    expect(row!.stateCode).toBe("32");
  });

  it("leaves a row that is already correct untouched", async () => {
    const db = testDb();
    const [before] = await db
      .insert(gstinRegistry)
      .values({
        orgId,
        gstin: "27AABCC3333D1ZP", // Maharashtra, already stored correctly
        legalName: "Already Correct Ltd",
        stateCode: "27",
        isActive: true,
      })
      .returning();

    await runMigration(orgId);

    const [after] = await db
      .select()
      .from(gstinRegistry)
      .where(eq(gstinRegistry.id, before!.id));
    expect(after!.stateCode).toBe("27");
    // `IS DISTINCT FROM` means the row is not rewritten, so updated_at does not move.
    expect(after!.updatedAt?.getTime()).toBe(before!.updatedAt?.getTime());
  });

  /**
   * An ABSENT GSTIN is a tenant that is not GST registered — `orgWizardWrite`
   * legitimately creates such a row. It must be skipped, NOT raised on, or every
   * non-registered tenant would block the deploy.
   */
  it("skips a row with no GSTIN instead of raising", async () => {
    const db = testDb();
    const [before] = await db
      .insert(gstinRegistry)
      .values({ orgId, gstin: "", legalName: "Not Registered Ltd", stateCode: "KA", isActive: true })
      .returning();

    await expect(runMigration(orgId)).resolves.toBeUndefined();

    const [after] = await db.select().from(gstinRegistry).where(eq(gstinRegistry.id, before!.id));
    expect(after!.stateCode).toBe("KA"); // untouched, and it cannot issue a tax invoice anyway
  });

  /**
   * A GSTIN that is PRESENT but unparseable is a data finding. Deriving a state
   * from it would invent a place of supply, so the migration must stop the deploy
   * and name the row.
   */
  it("RAISES on a malformed GSTIN rather than guessing past it", async () => {
    const db = testDb();
    await db.insert(gstinRegistry).values({
      orgId,
      gstin: "NOTAGSTIN123",
      legalName: "Malformed Ltd",
      stateCode: "KA",
      isActive: true,
    });

    await expect(runMigration(orgId)).rejects.toThrow(/cannot be parsed into a GST state/i);

    // Clean up so the shared database does not carry a poison row into other suites.
    await db
      .delete(gstinRegistry)
      .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.gstin, "NOTAGSTIN123")));
  });

  it("RAISES on a GSTIN whose leading digits are not a real jurisdiction", async () => {
    const db = testDb();
    // "25" was Daman & Diu, merged into 26 in 2020 — it is no longer a valid code.
    await db.insert(gstinRegistry).values({
      orgId,
      gstin: "25AABCC4444D1ZP",
      legalName: "Retired Jurisdiction Ltd",
      stateCode: "DD",
      isActive: true,
    });

    await expect(runMigration(orgId)).rejects.toThrow(/cannot be parsed into a GST state/i);

    await db
      .delete(gstinRegistry)
      .where(and(eq(gstinRegistry.orgId, orgId), eq(gstinRegistry.gstin, "25AABCC4444D1ZP")));
  });

  /**
   * The scoping above is a TEST affordance only. If it ever leaks into the
   * shipped file, the migration would silently correct one tenant and leave every
   * other one mis-splitting GST forever.
   */
  it("the shipped migration is not org-scoped", () => {
    const raw = readFileSync(MIGRATION, "utf8");
    expect(raw).not.toMatch(/org_id\s*=\s*'/);
    expect(raw).toContain("UPDATE gstin_registry");
  });
});
