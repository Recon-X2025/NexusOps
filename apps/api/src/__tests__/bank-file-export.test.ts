/**
 * `payroll.exportBankFile` — the beneficiary name, and the refusal to emit a
 * file that pays nobody.
 *
 * Two defects this pins:
 *
 * 1. The beneficiary name was built from `employees.title` — which sits between
 *    `department` and `jobGrade` and is the JOB DESIGNATION. A payment
 *    instruction named the beneficiary "Senior Engineer", or fell back to the
 *    staff code, or to the literal string "Employee". Banks match beneficiary
 *    name against the account holder, so those files invite rejection.
 * 2. With every employee skipped the procedure returned a header-only body as a
 *    SUCCESS, with `recordCount: 0`. A customer could download something that
 *    looks like a payment file and instructs no payment.
 */
// Envelope encryption needs APP_SECRET; the export decrypts the stored account.
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-pan-do-not-use-in-prod";

import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { payrollRouter } from "../routers/payroll";
import { payrollRuns, payslips, employees, users, eq, and } from "@coheronconnect/db";

async function seedApprovedRun(orgId: string): Promise<string> {
  const [run] = await testDb()
    .insert(payrollRuns)
    .values({
      orgId, month: 4, year: 2026, status: "draft",
      pipelineStatus: "CFO_APPROVED",
      runNumber: Math.floor(Math.random() * 1_000_000),
      approvalChainLength: 2,
      workflowMetadata: { errors: [], approvals: [] },
    } as never)
    .returning({ id: payrollRuns.id });
  return run!.id;
}

/** One employee on the run, with whatever bank identity the test needs. */
async function seedPaidEmployee(
  orgId: string,
  runId: string,
  opts: { title?: string; bankAccountName?: string; userName?: string; acct?: string; ifsc?: string },
): Promise<void> {
  const [u] = await testDb()
    .insert(users)
    .values({
      orgId, email: `bf-${Math.random().toString(36).slice(2, 10)}@example.com`,
      name: opts.userName ?? "Platform Display Name", passwordHash: "x", role: "member",
    } as never)
    .returning({ id: users.id });
  const [emp] = await testDb()
    .insert(employees)
    .values({
      orgId, userId: u!.id, employeeId: `EMP-${Math.floor(Math.random() * 9000) + 1000}`,
      title: opts.title ?? "Senior Engineer",
      bankAccountName: opts.bankAccountName ?? null,
      bankAccountNumber: opts.acct ?? null,
      bankIfsc: opts.ifsc ?? null,
      bankName: "HDFC Bank",
    } as never)
    .returning({ id: employees.id });
  await testDb().insert(payslips).values({
    orgId, payrollRunId: runId, employeeId: emp!.id, month: 4, year: 2026,
    grossEarnings: "100000", totalDeductions: "15500", netPay: "84500.50",
  } as never);
}

describe("exportBankFile — beneficiary name is the account holder", () => {
  let orgId: string;
  let adminId: string;
  let caller: ReturnType<typeof payrollRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });

  it("uses bankAccountName, NOT the job designation", async () => {
    const runId = await seedApprovedRun(orgId);
    await seedPaidEmployee(orgId, runId, {
      title: "Senior Engineer",              // must NOT appear
      bankAccountName: "RAVI KUMAR NAIR",    // must appear
      userName: "Ravi K",
      acct: "50100123456789", ifsc: "HDFC0001234",
    });

    const res = await caller.exportBankFile({ runId, format: "hdfc_neft", debitAccount: "50200012345678" });
    const body = Buffer.from(res.contentBase64, "base64").toString("utf8");

    expect(res.recordCount).toBe(1);
    expect(body).toContain("RAVI KUMAR NAIR");
    expect(body).not.toContain("Senior Engineer");
    expect(body).not.toContain("Employee,"); // the old literal fallback
  });

  it("falls back to the person's name when no account name is recorded", async () => {
    const runId = await seedApprovedRun(orgId);
    await seedPaidEmployee(orgId, runId, {
      title: "Head of Finance",
      bankAccountName: null as unknown as string,
      userName: "Priya Menon",
      acct: "00123456789012", ifsc: "ICIC0000123",
    });

    const res = await caller.exportBankFile({ runId, format: "hdfc_neft", debitAccount: "50200012345678" });
    const body = Buffer.from(res.contentBase64, "base64").toString("utf8");
    expect(body).toContain("Priya Menon");
    expect(body).not.toContain("Head of Finance");
  });
});

describe("exportBankFile — a file that pays nobody is an error", () => {
  let orgId: string;
  let adminId: string;
  let caller: ReturnType<typeof payrollRouter.createCaller>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
  });

  it("REFUSES when no employee has bank details, naming each reason", async () => {
    const runId = await seedApprovedRun(orgId);
    // Exactly the live state: bank columns empty in every seeded tenant.
    await seedPaidEmployee(orgId, runId, { bankAccountName: "A Holder", acct: undefined, ifsc: undefined });

    await expect(
      caller.exportBankFile({ runId, format: "hdfc_neft", debitAccount: "50200012345678" }),
    ).rejects.toThrow(/would instruct no payment/i);

    await expect(
      caller.exportBankFile({ runId, format: "hdfc_neft", debitAccount: "50200012345678" }),
    ).rejects.toThrow(/No bank account number on file/i);
  });

  it("still succeeds when at least one employee is payable, and reports the rest", async () => {
    const runId = await seedApprovedRun(orgId);
    await seedPaidEmployee(orgId, runId, { bankAccountName: "PAYABLE ONE", acct: "50100123456789", ifsc: "HDFC0001234" });
    await seedPaidEmployee(orgId, runId, { bankAccountName: "NO ACCOUNT", acct: undefined, ifsc: undefined });

    const res = await caller.exportBankFile({ runId, format: "hdfc_neft", debitAccount: "50200012345678" });
    expect(res.recordCount).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.reason).toMatch(/No bank account number on file/i);
  });
});

/**
 * The beneficiary name is built in the PROCEDURE, so it is asserted there — for
 * EVERY format, not just the one. A generator-level check would not have caught
 * the original bug, which lived in `payroll.ts`.
 */
const ALL_FORMATS = [
  "hdfc_neft",
  "icici_connected_banking",
  "sbi_cmp",
  "axis_power_access",
  "kotak_fynn",
  "nach_credit",
  "generic_neft",
] as const;

describe("exportBankFile — every format, at the procedure", () => {
  let orgId: string;
  let adminId: string;
  let caller: ReturnType<typeof payrollRouter.createCaller>;
  let runId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId!;
    caller = payrollRouter.createCaller(createMockContext(adminId, orgId));
    runId = await seedApprovedRun(orgId);
    await seedPaidEmployee(orgId, runId, {
      title: "Senior Engineer",
      bankAccountName: "RAVI KUMAR NAIR",
      userName: "Ravi K",
      acct: "50100123456789",
      ifsc: "HDFC0001234",
    });
  });

  for (const format of ALL_FORMATS.filter((f) => f !== "nach_credit")) {
    it(`${format} names the account holder, never the designation`, async () => {
      const res = await caller.exportBankFile({
        runId, format, debitAccount: "50200012345678",
        ...(format === "nach_credit" ? { utilityName: "COHERON PAYROLL" } : {}),
      } as never);
      const body = Buffer.from(res.contentBase64, "base64").toString("utf8");
      expect(res.recordCount).toBe(1);
      expect(body).toContain("RAVI KUMAR NAIR");
      expect(body).not.toContain("Senior Engineer");
      expect(body).not.toContain("Ravi K,"); // the fallback must not win over an account name
    });
  }

  /**
   * NACH-credit carries NO beneficiary-name field — it identifies the payee by
   * account + IFSC, with the corporate utility name and the employee code as
   * reference. Pinned so a future change cannot silently introduce one: putting a
   * name into a fixed-width record would shift every subsequent field.
   */
  it("nach_credit contains NO beneficiary name, by format design", async () => {
    const res = await caller.exportBankFile({
      runId, format: "nach_credit", debitAccount: "50200012345678",
      utilityName: "COHERON PAYROLL", utilityCode: "NACH00000000012345", sponsorBankCode: "HDFC0000001",
    } as never);
    const body = Buffer.from(res.contentBase64, "base64").toString("utf8");
    expect(res.recordCount).toBe(1);
    expect(body).not.toContain("RAVI KUMAR NAIR");
    expect(body).not.toContain("Ravi K");
    // What it DOES carry: the account, the IFSC and the employee code.
    expect(body).toContain("50100123456789");
    expect(body).toContain("HDFC0001234");
  });
});

/**
 * End to end with the account ENCRYPTED at rest: the file must carry the
 * plaintext account number, decrypted at the one read site.
 */
describe("exportBankFile — decrypts the stored account", () => {
  it("writes the plaintext account into the file from an encrypted column", async () => {
    const seeded = await seedFullOrg();
    const caller = payrollRouter.createCaller(createMockContext(seeded.adminId!, seeded.orgId));
    const runId = await seedApprovedRun(seeded.orgId);

    const { bankAccountColumns } = await import("../lib/bank-account");
    const enc = (await bankAccountColumns("50100123456789")) as { bankAccountNumber: string };

    await seedPaidEmployee(seeded.orgId, runId, {
      bankAccountName: "ENCRYPTED HOLDER",
      acct: enc.bankAccountNumber, // the ciphertext, exactly as a write path stores it
      ifsc: "HDFC0001234",
    });

    const res = await caller.exportBankFile({ runId, format: "hdfc_neft", debitAccount: "50200012345678" });
    const body = Buffer.from(res.contentBase64, "base64").toString("utf8");

    expect(body).toContain("50100123456789");            // decrypted
    expect(body).not.toContain(enc.bankAccountNumber);   // never the envelope
    expect(res.recordCount).toBe(1);
  });
});
