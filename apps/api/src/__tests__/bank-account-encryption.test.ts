/**
 * `employees.bank_account_number` is encrypted at rest.
 *
 * Same KMS-envelope mechanism as PAN (`lib/pan.ts`). Deliberate differences,
 * both decided rather than inherited:
 *   - `bank_ifsc` stays PLAINTEXT. An IFSC is a published RBI branch code, not a
 *     secret; encrypting it costs a decrypt at the read site for no gain.
 *   - NO peppered match hash. PAN needs one for de-identified matching on a short
 *     brute-forceable format; nothing in this product matches on account numbers.
 *
 * These tests read the RAW database column, so they fail if any write path ever
 * stores plaintext again.
 */
// The local KMS provider derives its KEK from APP_SECRET, and envelope encryption
// needs it. Set a test-only value BEFORE anything encrypts — same convention as
// `employee-pan-encryption.test.ts`.
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-pan-do-not-use-in-prod";

import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { hrRouter } from "../routers/hr";
import { ingestRouter } from "../routers/ingest";
import { bankAccountColumns, decryptBankAccount, maskAccountNumber } from "../lib/bank-account";
import { isEnvelope } from "../services/encryption";
import { employees, salaryStructures, eq, and } from "@coheronconnect/db";

const ACCT = "50100123456789";

async function rawColumns(orgId: string, employeeId: string) {
  const [row] = await testDb()
    .select({
      acct: employees.bankAccountNumber,
      mask: employees.bankAccountMaskedDisplay,
      ifsc: employees.bankIfsc,
    })
    .from(employees)
    .where(and(eq(employees.orgId, orgId), eq(employees.employeeId, employeeId)));
  return row!;
}

describe("bank account encryption — the helper", () => {
  it("stores an envelope and a last-four mask, never the plaintext", async () => {
    const cols = (await bankAccountColumns(ACCT)) as { bankAccountNumber: string; bankAccountMaskedDisplay: string };
    expect(isEnvelope(cols.bankAccountNumber)).toBe(true);
    expect(cols.bankAccountNumber).not.toContain(ACCT);
    expect(cols.bankAccountMaskedDisplay).toBe("**********6789");
    expect(await decryptBankAccount(cols.bankAccountNumber)).toBe(ACCT);
  });

  it("returns {} for an absent value so stored columns are left untouched", async () => {
    expect(await bankAccountColumns(null)).toEqual({});
    expect(await bankAccountColumns("   ")).toEqual({});
  });

  /** Double-encrypting would make the account unrecoverable. */
  it("never re-encrypts a value that is already an envelope", async () => {
    const once = (await bankAccountColumns(ACCT)) as { bankAccountNumber: string };
    expect(await bankAccountColumns(once.bankAccountNumber)).toEqual({});
  });

  /** `decryptPan`'s precedent: a pre-encryption row must keep reading. */
  it("passes a LEGACY plaintext value through unchanged", async () => {
    expect(await decryptBankAccount(ACCT)).toBe(ACCT);
    expect(await decryptBankAccount(null)).toBeNull();
  });

  it("masks short values without leaking digits", () => {
    expect(maskAccountNumber("1234")).toBe("****");
  });
});

describe("bank account encryption — every write path", () => {
  let orgId: string;
  let adminId: string;
  let structureId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId, structureName: `S-${Math.random().toString(36).slice(2, 8)}`, ctcAnnual: "600000", effectiveFrom: new Date("2026-01-01") } as never)
      .returning({ id: salaryStructures.id });
    structureId = st!.id;
  });

  it("hr.employees.create stores ciphertext", async () => {
    const hr = hrRouter.createCaller(createMockContext(adminId, orgId));
    const emp = await hr.employees.create({
      userName: "Create Path", userEmail: `cp-${Math.random().toString(36).slice(2, 9)}@example.com`,
      salaryStructureId: structureId, state: "Karnataka", taxRegime: "new",
      bankAccountNumber: ACCT, bankIfsc: "HDFC0001234", bankAccountName: "CREATE PATH",
    } as never);
    const raw = await rawColumns(orgId, (emp as { employeeId: string }).employeeId);
    expect(raw.acct).not.toBe(ACCT);
    expect(isEnvelope(raw.acct!)).toBe(true);
    expect(raw.mask).toBe("**********6789");
    // IFSC is deliberately NOT encrypted.
    expect(raw.ifsc).toBe("HDFC0001234");
    expect(await decryptBankAccount(raw.acct)).toBe(ACCT);
  });

  it("hr.employees.update stores ciphertext", async () => {
    const hr = hrRouter.createCaller(createMockContext(adminId, orgId));
    const emp = (await hr.employees.create({
      userName: "Update Path", userEmail: `up-${Math.random().toString(36).slice(2, 9)}@example.com`,
      salaryStructureId: structureId, state: "Karnataka", taxRegime: "new",
    } as never)) as { id: string; employeeId: string };

    await hr.employees.update({ id: emp.id, bankAccountNumber: ACCT, bankIfsc: "ICIC0000123" } as never);

    const raw = await rawColumns(orgId, emp.employeeId);
    expect(isEnvelope(raw.acct!)).toBe(true);
    expect(raw.acct).not.toContain(ACCT);
    expect(raw.mask).toBe("**********6789");
    expect(raw.ifsc).toBe("ICIC0000123");
    expect(await decryptBankAccount(raw.acct)).toBe(ACCT);
  });
});

/**
 * The THIRD write path — the CSV importer. It is the path that will actually
 * populate these columns for the pilot tenants, so plaintext leaking here would
 * defeat the whole change.
 */
describe("bank account encryption — the CSV importer", () => {
  it("ingest.importEmployees stores ciphertext", async () => {
    const seeded = await seedFullOrg();
    const [st] = await testDb()
      .insert(salaryStructures)
      .values({ orgId: seeded.orgId, structureName: "IMP-STRUCT", ctcAnnual: "600000", effectiveFrom: new Date("2026-01-01") } as never)
      .returning({ id: salaryStructures.id });
    expect(st).toBeTruthy();

    const ingest = ingestRouter.createCaller(createMockContext(seeded.adminId!, seeded.orgId));
    const res = await ingest.importEmployees({
      dryRun: false,
      columns: ["name", "email", "structureName", "state", "taxRegime", "bankAccountNumber", "bankIfsc"],
      rows: [
        {
          name: "Import Path",
          email: `imp-${Math.random().toString(36).slice(2, 9)}@example.com`,
          structureName: "IMP-STRUCT",
          state: "Karnataka",
          taxRegime: "new",
          bankAccountNumber: ACCT,
          bankIfsc: "HDFC0001234",
        },
      ],
    } as never);
    expect(res).toBeTruthy();

    const [row] = await testDb()
      .select({ acct: employees.bankAccountNumber, mask: employees.bankAccountMaskedDisplay, ifsc: employees.bankIfsc })
      .from(employees)
      .where(eq(employees.orgId, seeded.orgId));

    expect(row!.acct).not.toBe(ACCT);
    expect(isEnvelope(row!.acct!)).toBe(true);
    expect(row!.mask).toBe("**********6789");
    expect(row!.ifsc).toBe("HDFC0001234"); // IFSC deliberately plaintext
    expect(await decryptBankAccount(row!.acct)).toBe(ACCT);
  });
});

/**
 * The payslip masks the PLAINTEXT account, never the envelope. Masking ciphertext
 * would print something like `*****9a3f` on a document handed to an employee.
 */
describe("bank account encryption — the payslip masks plaintext", () => {
  it("maskBank receives the decrypted value, not the stored blob", async () => {
    const { maskBank } = await import("../lib/payslip-view");
    const enc = (await bankAccountColumns(ACCT)) as { bankAccountNumber: string };

    const decrypted = await decryptBankAccount(enc.bankAccountNumber);
    const masked = maskBank(decrypted ?? undefined);

    expect(masked).toContain("6789");                       // last four of the real account
    expect(masked).not.toContain(enc.bankAccountNumber);    // never the envelope
    expect(masked).not.toContain("v2:");
    // And the wrong way round is visibly wrong — this is what the bug would look like.
    expect(maskBank(enc.bankAccountNumber)).not.toContain("6789");
  });
});
