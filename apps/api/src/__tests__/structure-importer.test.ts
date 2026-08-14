/**
 * Salary-structure bulk importer — ingest.importStructures (UNIT B).
 * Skip-the-bad-row-and-report, dry-run-by-default, validated through the FORM's own schema
 * (SalaryStructureFormSchema). Basic is DERIVED (50 − DA) — never a column.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { makeContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { ingestRouter } from "../routers/ingest";
import { salaryStructures, eq, and, count } from "@coheronconnect/db";

const COLS = ["structure_name", "base_pay_annual", "da_percent", "hra_percent_of_basic", "lta_annual", "effective_from", "effective_to"];

describe("ingest.importStructures — bulk salary-structure import", () => {
  let orgId: string;
  let adminId: string;
  let caller: ReturnType<typeof ingestRouter.createCaller>;

  function goodRow(over: Record<string, string> = {}): Record<string, string> {
    return {
      structure_name: `Struct-${nanoid(6)}`,
      base_pay_annual: "1200000",
      da_percent: "0",
      hra_percent_of_basic: "50",
      effective_from: "2026-04-01",
      ...over,
    };
  }

  async function structCount(): Promise<number> {
    const [r] = await testDb().select({ n: count() }).from(salaryStructures).where(eq(salaryStructures.orgId, orgId));
    return Number(r?.n ?? 0);
  }
  async function byName(name: string) {
    const [r] = await testDb().select().from(salaryStructures)
      .where(and(eq(salaryStructures.orgId, orgId), eq(salaryStructures.structureName, name)));
    return r;
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    caller = ingestRouter.createCaller(makeContext(adminId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  it("creates structures with Basic DERIVED (50 − DA)", async () => {
    const rows = [
      goodRow({ structure_name: "Basic-Alone", da_percent: "0" }),   // Basic = 50
      goodRow({ structure_name: "Basic-Plus-DA", da_percent: "10" }), // Basic = 40
    ];
    const res = await caller.importStructures({ dryRun: false, columns: COLS, rows });
    expect(res.imported).toBe(2);
    expect(Number((await byName("Basic-Alone"))!.basicPercent)).toBe(50);
    expect(Number((await byName("Basic-Alone"))!.daPercent)).toBe(0);
    expect(Number((await byName("Basic-Plus-DA"))!.basicPercent)).toBe(40);
    expect(Number((await byName("Basic-Plus-DA"))!.daPercent)).toBe(10);
  });

  it("rejects a non-compliant ratio with a message NAMING the rule (not a generic error)", async () => {
    const res = await caller.importStructures({
      dryRun: false, columns: COLS, rows: [goodRow({ structure_name: "Bad", da_percent: "60" })],
    });
    expect(res.imported).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/Basic is derived as 50 − DA/);
    expect(res.skipped[0]!.reason).toMatch(/DA % must be between 0 and 50/);
  });

  it("one bad row does not abort the batch — the rest import, the failure is reported", async () => {
    const rows = [
      goodRow({ structure_name: "Ok-1" }),
      goodRow({ structure_name: "Bad", da_percent: "99" }),
      goodRow({ structure_name: "Ok-2" }),
    ];
    const res = await caller.importStructures({ dryRun: false, columns: COLS, rows });
    expect(res.imported).toBe(2);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.identifier).toBe("Bad");
    expect(await byName("Ok-1")).toBeTruthy();
    expect(await byName("Ok-2")).toBeTruthy();
  });

  it("the dry run writes NOTHING", async () => {
    const res = await caller.importStructures({ dryRun: true, columns: COLS, rows: [goodRow(), goodRow()] });
    expect(res.wouldImport).toBe(2);
    expect(res.imported).toBe(0);
    expect(await structCount()).toBe(0); // dryRun defaults true anyway, but assert nothing written
  });

  it("a duplicate name (existing OR within-batch) is skipped and reported", async () => {
    await caller.importStructures({ dryRun: false, columns: COLS, rows: [goodRow({ structure_name: "Dup" })] });
    // Existing name → skip
    const res1 = await caller.importStructures({ dryRun: false, columns: COLS, rows: [goodRow({ structure_name: "Dup" })] });
    expect(res1.imported).toBe(0);
    expect(res1.skipped[0]!.reason).toMatch(/already exists/);
    // Within-batch duplicate → the second is skipped
    const res2 = await caller.importStructures({
      dryRun: false, columns: COLS,
      rows: [goodRow({ structure_name: "InBatch" }), goodRow({ structure_name: "InBatch" })],
    });
    expect(res2.imported).toBe(1);
    expect(res2.skipped[0]!.reason).toMatch(/duplicated earlier/);
  });

  it("refuses the whole file when a required column is missing (nothing written)", async () => {
    await expect(
      caller.importStructures({ dryRun: false, columns: COLS.filter((c) => c !== "da_percent"), rows: [goodRow()] }),
    ).rejects.toThrow(/missing required column/i);
    expect(await structCount()).toBe(0);
  });

  it("the generated template matches the schema — required set, and NO Basic column", async () => {
    const t = await caller.structureImportTemplate();
    expect(t.headerRow).toEqual(COLS);
    expect(t.headerRow).not.toContain("basic_percent"); // Basic is derived, never a column
    const required = t.columns.filter((c) => c.required).map((c) => c.key);
    expect(required).toEqual(["structure_name", "base_pay_annual", "da_percent", "hra_percent_of_basic", "effective_from"]);
  });
});
