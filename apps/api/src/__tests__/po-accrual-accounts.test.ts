/**
 * PO accrual account-resolution tests (Sprint 0.2).
 *
 * Regression guard for the previously hardcoded placeholder account IDs
 * ("00000000-…-0001"/"…-0002") in procurement.ts. The PO draft accrual journal
 * must reference REAL chart_of_accounts rows (satisfying the
 * journal_entry_lines.account_id FK, onDelete: restrict), remain balanced
 * (debits == credits), and post to an expense (debit) + accounts-payable
 * liability (credit) account — lazily provisioning them if the org has none.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initTestEnvironment,
  seedFullOrg,
  authedCaller,
  createSession,
  cleanupOrg,
  testDb,
} from "./helpers";
import {
  vendors,
  chartOfAccounts,
  journalEntries,
  journalEntryLines,
  eq,
  and,
  inArray,
} from "@coheronconnect/db";

const PLACEHOLDER_IDS = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
];

describe("PO accrual account resolution (Sprint 0.2)", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  let vendorId: string;

  beforeEach(async () => {
    await initTestEnvironment();
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
    const db = testDb();
    const [v] = await db
      .insert(vendors)
      .values({ orgId: orgCtx.orgId, name: "PO Accrual Vendor" })
      .returning();
    vendorId = v!.id;
  });

  afterEach(async () => {
    await cleanupOrg(orgCtx.orgId);
  });

  async function createPo(totalAmount: number) {
    const caller = await authedCaller(adminToken);
    return caller.procurement.purchaseOrders.create({
      vendorId,
      totalAmount,
      items: [{ description: "Widgets", quantity: 2, unitPrice: totalAmount / 2 }],
    });
  }

  async function accrualLines(poNumber: string) {
    const db = testDb();
    const [je] = await db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.orgId, orgCtx.orgId),
          eq(journalEntries.number, `JE-PO-${poNumber}`),
        ),
      );
    expect(je).toBeDefined();
    const lines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, je!.id));
    return { je: je!, lines };
  }

  it("provisions real expense + AP accounts when the org has none (no placeholder UUIDs)", async () => {
    const po = await createPo(1000);
    const { je, lines } = await accrualLines(po!.poNumber);

    expect(lines).toHaveLength(2);
    // No fabricated placeholder account IDs leak into the ledger.
    for (const l of lines) {
      expect(PLACEHOLDER_IDS).not.toContain(l.accountId);
    }

    // Every referenced account actually exists in the org's COA.
    const accts = await testDb()
      .select()
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.orgId, orgCtx.orgId),
          inArray(
            chartOfAccounts.id,
            lines.map((l) => l.accountId),
          ),
        ),
      );
    expect(accts).toHaveLength(2);

    const debitLine = lines.find((l) => Number(l.debitAmount) > 0)!;
    const creditLine = lines.find((l) => Number(l.creditAmount) > 0)!;
    const debitAcct = accts.find((a) => a.id === debitLine.accountId)!;
    const creditAcct = accts.find((a) => a.id === creditLine.accountId)!;

    expect(debitAcct.type).toBe("expense");
    expect(creditAcct.type).toBe("liability");
    expect(creditAcct.subType).toBe("accounts_payable");

    // Balanced: debits == credits == header totals.
    expect(Number(debitLine.debitAmount)).toBe(1000);
    expect(Number(creditLine.creditAmount)).toBe(1000);
    expect(Number(je.totalDebit)).toBe(Number(je.totalCredit));
  });

  it("reuses existing expense + AP accounts instead of creating duplicates", async () => {
    const db = testDb();
    // Pre-seed the org's COA.
    const [expense] = await db
      .insert(chartOfAccounts)
      .values({
        orgId: orgCtx.orgId,
        code: "6100",
        name: "Operating Expense",
        type: "expense" as const,
        subType: "expense" as const,
      })
      .returning();
    const [payable] = await db
      .insert(chartOfAccounts)
      .values({
        orgId: orgCtx.orgId,
        code: "2000",
        name: "Accounts Payable",
        type: "liability" as const,
        subType: "accounts_payable" as const,
      })
      .returning();

    const before = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.orgId, orgCtx.orgId));

    const po = await createPo(500);
    const { lines } = await accrualLines(po!.poNumber);

    // No new COA rows were created — existing ones were reused.
    const after = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.orgId, orgCtx.orgId));
    expect(after).toHaveLength(before.length);

    const usedIds = lines.map((l) => l.accountId);
    expect(usedIds).toContain(expense!.id);
    expect(usedIds).toContain(payable!.id);
  });
});
