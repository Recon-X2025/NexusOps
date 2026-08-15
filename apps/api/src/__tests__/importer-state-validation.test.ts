/**
 * The employee CSV importer must reject a work state the professional-tax engine
 * cannot resolve.
 *
 * Round 4 established the hole with an 80-row import: `state` was checked for
 * PRESENCE only, so "Atlantis" and "Karnatak" both imported clean. Those
 * employees then reached payroll, where the run warned (`unknownState`) and
 * deducted ₹0 PT — long after whoever typed the CSV had moved on. Across seven
 * tenants and ~560 rows that is the most likely silent-wrong-tax path.
 *
 * The accepted vocabulary is `professional_tax_slabs.state_name`, which is
 * canonical BY DEFINITION: `apps/api/src/lib/india/statutory-ceilings.ts` keys the
 * PT engine's slab overrides on `stateName.toUpperCase().replace(/\s+/g, "_")`,
 * so a value absent from that table can never resolve a slab.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { salaryStructures, employees, users, professionalTaxSlabs, eq, and, isNull, or } from "@coheronconnect/db";
import { ingestRouter } from "../routers/ingest";

const COLUMNS = ["name", "email", "structureName", "state", "taxRegime", "startDate", "employmentType"];

describe("employee importer — work-state validation", () => {
  let orgId: string;
  let caller: ReturnType<typeof ingestRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    caller = ingestRouter.createCaller(createMockContext(userId, orgId));

    const famId = randomUUID();
    await testDb().insert(salaryStructures).values({
      id: famId, orgId, familyId: famId, structureName: "Standard",
      ctcAnnual: "600000", basicPercent: "50", effectiveFrom: new Date("2026-04-01"),
    } as never);
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  function row(i: number, over: Record<string, string> = {}) {
    return {
      name: `Emp ${i}`, email: `emp${i}@state.test`, structureName: "Standard",
      state: "Karnataka", taxRegime: "new", startDate: "2026-04-01",
      employmentType: "full_time", ...over,
    };
  }

  it("an 80-row import skips only the invalid states and imports the rest", async () => {
    const rows: Record<string, string>[] = [];
    for (let i = 1; i <= 76; i++) rows.push(row(i));
    rows.push(row(77, { state: "Atlantis" }));      // not a state at all
    rows.push(row(78, { state: "Karnatak" }));      // valid state, misspelled
    rows.push(row(79, { state: "Maharashtra" }));   // valid per 2c
    rows.push(row(80, { state: "Tamil Nadu" }));    // valid per 2c

    const res = (await caller.importEmployees({ dryRun: false, columns: COLUMNS, rows } as never)) as {
      imported: number;
      skipped: { row: number; identifier: string; reason: string }[];
    };

    // Exactly the two bad rows skip; partial commit leaves the other 78 imported.
    expect(res.skipped.map((s) => s.row).sort((a, b) => a - b)).toEqual([77, 78]);
    expect(res.imported).toBe(78);

    // Both valid-per-2c rows are actually in the database. The importer creates a
    // user per employee, so the address lives on `users`, not `employees`.
    for (const email of ["emp79@state.test", "emp80@state.test"]) {
      const [u] = await testDb().select({ id: users.id }).from(users)
        .where(and(eq(users.orgId, orgId), eq(users.email, email)));
      expect(u, `${email} should have imported`).toBeTruthy();
    }
  }, 180_000);

  it("the skip message names the offending value and states what is accepted", async () => {
    const res = (await caller.importEmployees({
      dryRun: false, columns: COLUMNS, rows: [row(1, { state: "Karnatak" })],
    } as never)) as { imported: number; skipped: { row: number; identifier: string; reason: string }[] };

    expect(res.imported).toBe(0);
    expect(res.skipped).toHaveLength(1);
    const skip = res.skipped[0]!;
    expect(skip.identifier).toBe("emp1@state.test");
    expect(skip.reason).toContain('"Karnatak"');            // names the offending value
    expect(skip.reason).toMatch(/professional-tax slab/i);   // says why it matters
    expect(skip.reason).toContain("Karnataka");              // and what is accepted
  }, 60_000);

  it("accepts the canonical spelling case- and whitespace-insensitively", async () => {
    const res = (await caller.importEmployees({
      dryRun: false, columns: COLUMNS,
      rows: [row(1, { state: "karnataka" }), row(2, { state: "  Tamil   Nadu " })],
    } as never)) as { imported: number; skipped: { reason: string }[] };

    expect(res.skipped).toEqual([]);
    expect(res.imported).toBe(2);
  }, 60_000);

  it("stores the CANONICAL spelling, so the stored row resolves a slab", async () => {
    await caller.importEmployees({
      dryRun: false, columns: COLUMNS, rows: [row(1, { state: "karnataka" })],
    } as never);

    const [u] = await testDb().select({ id: users.id }).from(users)
      .where(and(eq(users.orgId, orgId), eq(users.email, "emp1@state.test")));
    const [emp] = await testDb().select({ state: employees.state }).from(employees)
      .where(and(eq(employees.orgId, orgId), eq(employees.userId, u!.id)));

    expect(emp!.state).toBe("Karnataka");

    // And that stored value must exist in the table the PT engine keys on.
    const slabStates = await testDb()
      .select({ stateName: professionalTaxSlabs.stateName })
      .from(professionalTaxSlabs)
      .where(or(eq(professionalTaxSlabs.orgId, orgId), isNull(professionalTaxSlabs.orgId)));
    const keys = new Set(slabStates.map((s) => s.stateName.toUpperCase().replace(/\s+/g, "_")));
    expect(keys.has(emp!.state!.toUpperCase().replace(/\s+/g, "_"))).toBe(true);
  }, 60_000);
});
