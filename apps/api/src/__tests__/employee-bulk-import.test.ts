/**
 * Employee bulk importer — ingest.importEmployees.
 * ─────────────────────────────────────────────────────────────────────────────
 * Onboarding for the pilots is 30–80 employees each; the only prior path was single-record
 * hr.employees.create. This importer is skip-the-bad-row-and-report (the importInvoices shape),
 * NOT abort-the-whole-batch (the importVendors shape). These tests pin every behaviour the brief
 * called out:
 *
 *   • a good row creates the user + employee, allocates EMP-NNNN, and stores PAN ENCRYPTED with the
 *     masked columns populated;
 *   • a malformed-PAN row is skipped and named while the rest of the batch still imports — the
 *     behaviour importVendors does NOT have (its strict z.array rejects the whole request);
 *   • a missing-email row is skipped and named;
 *   • a structure-name that is not found, or is ambiguous across two families, is skipped and named
 *     and NO employee is created for it;
 *   • a dry run (the default) writes nothing;
 *   • EMP-NNNN allocation is correct across a batch AND after a prior delete (the count(*)+1 bug);
 *   • the taxRegime COLUMN is mandatory: a file missing it is refused whole (statutory election must
 *     not silently default to NEW), while a blank cell in a present column is a named row skip.
 */

// PAN encryption derives its KEK from APP_SECRET — set a test-only value before anything encrypts
// (mirrors employee-pan-encryption / pan-encryption-at-rest).
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-pan-do-not-use-in-prod";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { ingestRouter } from "../routers/ingest";
import { hrRouter } from "../routers/hr";
import { decryptPan } from "../lib/pan";
import * as encryptionService from "../services/encryption";
import { employees, users, salaryStructures, eq, and, count } from "@coheronconnect/db";
import { nanoid } from "nanoid";

/** The column keys a full employee CSV carries — taxRegime INCLUDED (the header is present). */
const ALL_COLUMNS = [
  "name", "email", "structureName", "state", "department", "title", "jobGrade",
  "employmentType", "location", "city", "isMetroCity", "taxRegime", "startDate",
  "pan", "uan", "esiIpNumber", "bankAccountNumber", "bankIfsc", "bankName",
  "bankAccountName", "gender", "dateOfBirth",
];

describe("ingest.importEmployees — bulk employee import", () => {
  let orgId: string;
  let adminId: string;
  let caller: ReturnType<typeof ingestRouter.createCaller>;

  /** Call the importer with the full present-columns list (taxRegime present) unless overridden. */
  function imp(args: { dryRun?: boolean; rows: Array<Record<string, string>>; columns?: string[] }) {
    const { columns = ALL_COLUMNS, ...rest } = args;
    return caller.importEmployees({ columns, ...rest });
  }

  /** Seed a salary structure; returns its familyId (= its own id via the 0065 trigger). */
  async function seedStructure(name: string): Promise<string> {
    const [row] = await testDb()
      .insert(salaryStructures)
      .values({
        orgId,
        structureName: name,
        ctcAnnual: "1200000",
        basicPercent: "40",
        effectiveFrom: new Date("2015-01-01"),
      })
      .returning();
    return row!.familyId;
  }

  /** A minimally-valid row; override any field. Email is unique per call. taxRegime present + valid. */
  function goodRow(over: Record<string, string> = {}): Record<string, string> {
    return {
      name: "Asha Rao",
      email: `emp-${nanoid(8)}@qa.coheronconnect.io`,
      structureName: "Engineering",
      state: "Karnataka",
      taxRegime: "new",
      ...over,
    };
  }

  async function empCount(): Promise<number> {
    const [r] = await testDb().select({ n: count() }).from(employees).where(eq(employees.orgId, orgId));
    return Number(r?.n ?? 0);
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" }));
    caller = ingestRouter.createCaller(makeContext(adminId, orgId));
    await seedStructure("Engineering");
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
    vi.restoreAllMocks(); // undo any per-test encryption spy so later tests encrypt for real
  });

  it("imports a good row: employee + user created, EMP-NNNN allocated, PAN encrypted + masked", async () => {
    const email = `asha-${nanoid(6)}@qa.coheronconnect.io`;
    const res = await imp({ dryRun: false, rows: [goodRow({ email, pan: "ABCDE1234F" })] });

    expect(res.imported).toBe(1);
    expect(res.skipped).toHaveLength(0);
    expect(res.ids).toHaveLength(1);

    const [emp] = await testDb().select().from(employees).where(eq(employees.id, res.ids[0]!));
    expect(emp!.employeeId).toMatch(/^EMP-\d{4}$/);
    // structure resolved by NAME to the family id
    const [struct] = await testDb()
      .select()
      .from(salaryStructures)
      .where(and(eq(salaryStructures.orgId, orgId), eq(salaryStructures.structureName, "Engineering")));
    expect(emp!.salaryStructureId).toBe(struct!.familyId);
    // PAN stored encrypted, masked columns populated, never plaintext, round-trips
    expect(emp!.pan).toMatch(/^v2:/);
    expect(emp!.pan).not.toContain("ABCDE1234F");
    expect(emp!.panMaskedHash).toBeTruthy();
    expect(emp!.panMaskedDisplay).toContain("234F");
    expect(await decryptPan(emp!.pan)).toBe("ABCDE1234F");
    // a user row was created for the employee
    const [u] = await testDb().select().from(users).where(eq(users.id, emp!.userId));
    expect(u!.email).toBe(email);
  });

  it("skips a malformed-PAN row and names it, while the rest of the batch still imports", async () => {
    // The bad row is FIRST — proving the batch continues past it (importVendors would reject all).
    const goodEmail = `good-${nanoid(6)}@qa.coheronconnect.io`;
    const res = await imp({
      dryRun: false,
      rows: [
        goodRow({ email: `bad-${nanoid(6)}@qa.coheronconnect.io`, pan: "NOTAPAN" }),
        goodRow({ email: goodEmail, pan: "ABCDE1234F" }),
      ],
    });

    expect(res.imported).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.row).toBe(1);
    expect(res.skipped[0]!.reason).toMatch(/PAN/i);
    // the good (second) row is the one that made it in
    const [emp] = await testDb().select().from(employees).where(eq(employees.id, res.ids[0]!));
    const [u] = await testDb().select().from(users).where(eq(users.id, emp!.userId));
    expect(u!.email).toBe(goodEmail);
    expect(await empCount()).toBe(1);
  });

  it("skips a row with no email and names it", async () => {
    const rows = [goodRow()];
    delete rows[0]!.email;
    const res = await imp({ dryRun: false, rows });

    expect(res.imported).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/email is required/i);
    expect(await empCount()).toBe(0);
  });

  it("skips a row whose salary-structure name is not found — and creates NO employee for it", async () => {
    const res = await imp({ dryRun: false, rows: [goodRow({ structureName: "Marketing" })] }); // never seeded

    expect(res.imported).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/not found/i);
    expect(await empCount()).toBe(0);
  });

  it("skips a row whose salary-structure name is ambiguous across two families", async () => {
    // Two DISTINCT families sharing one name — the genuinely ambiguous case.
    await seedStructure("Sales");
    await seedStructure("Sales");
    const res = await imp({ dryRun: false, rows: [goodRow({ structureName: "Sales" })] });

    expect(res.imported).toBe(0);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/ambiguous/i);
    expect(await empCount()).toBe(0);
  });

  it("dry run (the default) writes nothing", async () => {
    const before = await empCount();
    // No dryRun flag at all — the server must default to the safe mode.
    const res = await imp({ rows: [goodRow(), goodRow(), goodRow()] });

    expect(res.dryRun).toBe(true);
    expect(res.imported).toBe(0);
    expect(res.wouldImport).toBe(3);
    expect(await empCount()).toBe(before); // unchanged
  });

  it("reports a valid row's structure resolution in a dry run without writing", async () => {
    const res = await imp({ dryRun: true, rows: [goodRow({ structureName: "Marketing" }), goodRow()] });
    expect(res.imported).toBe(0);
    expect(res.wouldImport).toBe(1); // only the resolvable one would import
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/not found/i);
    expect(await empCount()).toBe(0);
  });

  it("skips a within-batch duplicate email and names it", async () => {
    const dupe = `dupe-${nanoid(6)}@qa.coheronconnect.io`;
    const res = await imp({ dryRun: false, rows: [goodRow({ email: dupe }), goodRow({ email: dupe })] });
    expect(res.imported).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/duplicated/i);
  });

  it("allocates EMP-NNNN correctly across a batch AND after a prior delete (no count()+1 collision)", async () => {
    // Batch of 3 on a fresh org → EMP-0001..0003.
    const first = await imp({ dryRun: false, rows: [goodRow(), goodRow(), goodRow()] });
    expect(first.imported).toBe(3);
    const rows1 = await testDb().select().from(employees).where(eq(employees.orgId, orgId));
    const codes1 = rows1.map((r) => r.employeeId).sort();
    expect(codes1).toEqual(["EMP-0001", "EMP-0002", "EMP-0003"]);

    // Delete the middle one — count(*) now understates the high-water mark.
    const middle = rows1.find((r) => r.employeeId === "EMP-0002")!;
    await testDb().delete(employees).where(eq(employees.id, middle.id));
    expect(await empCount()).toBe(2);

    // Import one more. A count(*)+1 allocator would produce EMP-0003 and collide; the atomic,
    // monotonic allocator produces EMP-0004.
    const second = await imp({ dryRun: false, rows: [goodRow()] });
    expect(second.imported).toBe(1);
    const [added] = await testDb().select().from(employees).where(eq(employees.id, second.ids[0]!));
    expect(added!.employeeId).toBe("EMP-0004");
  });

  it("a PAN row that FAILS ENCRYPTION is skipped and named, and the rest of the batch still imports", async () => {
    // Simulate a KMS / APP_SECRET outage: envelope encryption throws. panColumnsTolerant's fallback
    // re-calls encrypt and re-throws a plain Error — which, left unguarded, would escape the per-row
    // handler and abort the whole batch. The importer must instead convert it to a named per-row skip.
    vi.spyOn(encryptionService, "encryptSecretEnvelope").mockRejectedValue(new Error("kms unavailable"));

    const okEmail = `nopanned-${nanoid(6)}@qa.coheronconnect.io`;
    const res = await imp({
      dryRun: false,
      rows: [
        goodRow({ email: `haspan-${nanoid(6)}@qa.coheronconnect.io`, pan: "ABCDE1234F" }), // will fail to encrypt
        goodRow({ email: okEmail }), // no PAN → never encrypts → must still import
      ],
    });

    // The PAN row is skipped and named; the encryption failure did NOT take down the batch.
    expect(res.imported).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.row).toBe(1);
    expect(res.skipped[0]!.reason).toMatch(/could not encrypt PAN/i);
    // The PAN-less row imported.
    const [emp] = await testDb().select().from(employees).where(eq(employees.id, res.ids[0]!));
    const [u] = await testDb().select().from(users).where(eq(users.id, emp!.userId));
    expect(u!.email).toBe(okEmail);
    expect(await empCount()).toBe(1);
  });

  // ── taxRegime column mandate ────────────────────────────────────────────────
  it("REFUSES the whole file when the taxRegime column is absent — nothing is written", async () => {
    const before = await empCount();
    const columnsWithoutRegime = ALL_COLUMNS.filter((c) => c !== "taxRegime");
    // Two otherwise-perfect rows: they must NOT import, because the column is missing at the file
    // level (a bulk import must not silently elect the tax regime for the whole workforce).
    await expect(
      caller.importEmployees({ dryRun: false, columns: columnsWithoutRegime, rows: [goodRow(), goodRow()] }),
    ).rejects.toThrow(/taxRegime/i);
    expect(await empCount()).toBe(before); // 0 — no rows processed
  });

  it("the file-refusal message names the column and states both old and new are accepted", async () => {
    const columnsWithoutRegime = ALL_COLUMNS.filter((c) => c !== "taxRegime");
    await expect(
      caller.importEmployees({ dryRun: false, columns: columnsWithoutRegime, rows: [goodRow()] }),
    ).rejects.toThrow(/taxRegime.*old.*new|old.*new.*taxRegime/is);
  });

  it("a BLANK taxRegime cell in a present column is a named row skip (distinct from an invalid value); the rest import", async () => {
    const blank = goodRow();
    delete blank.taxRegime; // column present (in `columns`) but this cell is empty
    const res = await imp({ dryRun: false, rows: [blank, goodRow({ taxRegime: "old" })] });

    expect(res.imported).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.row).toBe(1);
    expect(res.skipped[0]!.reason).toMatch(/blank/i);
    expect(res.skipped[0]!.reason).not.toMatch(/invalid/i); // distinguished from a bad value
    expect(await empCount()).toBe(1);
  });

  it("an UNRECOGNISED taxRegime value is a named row skip (unchanged behaviour)", async () => {
    const res = await imp({
      dryRun: false,
      rows: [goodRow({ taxRegime: "hybrid" }), goodRow({ taxRegime: "new" })],
    });
    expect(res.imported).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.row).toBe(1);
    expect(res.skipped[0]!.reason).toMatch(/invalid taxRegime/i);
    expect(await empCount()).toBe(1);
  });

  it("valid taxRegime values import and round-trip onto the employee (both old and new)", async () => {
    const oldEmail = `old-${nanoid(6)}@qa.coheronconnect.io`;
    const newEmail = `new-${nanoid(6)}@qa.coheronconnect.io`;
    const res = await imp({
      dryRun: false,
      rows: [goodRow({ email: oldEmail, taxRegime: "old" }), goodRow({ email: newEmail, taxRegime: "new" })],
    });
    expect(res.imported).toBe(2);

    for (const id of res.ids) {
      const [emp] = await testDb().select().from(employees).where(eq(employees.id, id));
      const [u] = await testDb().select().from(users).where(eq(users.id, emp!.userId));
      if (u!.email === oldEmail) expect(emp!.taxRegime).toBe("old");
      if (u!.email === newEmail) expect(emp!.taxRegime).toBe("new");
    }
  });

  it("hr.employees.create now REQUIRES a tax regime — the silent default is closed (TAX-REGIME-DEFAULT)", async () => {
    // Previously the form path let an absent regime fall to the NOT NULL DEFAULT 'new'. The importer
    // already required an explicit election; this closes the same silent default on the weaker create
    // path (a form choice is a choice — it must be made, not defaulted).
    const hr = hrRouter.createCaller(makeContext(adminId, orgId));
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `Form-${nanoid(4)}`, ctcAnnual: "600000", basicPercent: "50", daPercent: "0", effectiveFrom: new Date("2020-01-01") })
      .returning();
    await expect(
      hr.employees.create({
        userName: "Form User",
        userEmail: `form-${nanoid(6)}@qa.coheronconnect.io`,
        state: "Karnataka",
        salaryStructureId: st!.id,
        // taxRegime omitted on purpose — must now be rejected, not defaulted.
      } as never),
    ).rejects.toThrow(/regime/i);
  });
});
