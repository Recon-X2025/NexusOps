import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, db as testDb } from "./helpers";
import { accountingRouter } from "../routers/accounting";
import { chartOfAccounts, eq, and } from "@coheronconnect/db";

/**
 * Invariant: reversing a posted journal entry must undo its balance impact.
 *
 * Regression guard for the bug where `journal.reverse` created a posted
 * reversal entry but never decremented `chartOfAccounts.currentBalance`,
 * leaving the ledger permanently skewed by the original posting.
 */
describe("Journal reversal balance invariant", () => {
  let ctx: any;
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    ctx = createMockContext(seeded.adminId, orgId);
    caller = accountingRouter.createCaller(ctx);
    await caller.coa.seed();
  });

  async function balanceOf(code: string): Promise<number> {
    const db = testDb();
    const [row] = await db
      .select({ b: chartOfAccounts.currentBalance })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.orgId, orgId), eq(chartOfAccounts.code, code)));
    return Number(row?.b ?? 0);
  }

  it("post then reverse returns every affected account to its pre-post balance", async () => {
    const accounts = await caller.coa.list({});
    const cash = accounts.find((a: any) => a.code === "1110"); // Cash (asset)
    const revenue = accounts.find((a: any) => a.code === "4100"); // Revenue (income)

    const cashBefore = await balanceOf("1110");
    const revenueBefore = await balanceOf("4100");

    const je = await caller.journal.create({
      date: new Date(),
      description: "Reversible sale",
      lines: [
        { accountId: cash.id, debitAmount: 1000, creditAmount: 0 },
        { accountId: revenue.id, debitAmount: 0, creditAmount: 1000 },
      ],
    });

    await caller.journal.post({ id: je.id });

    // After posting, balances have moved by net = debit − credit.
    expect(await balanceOf("1110")).toBeCloseTo(cashBefore + 1000, 3);
    expect(await balanceOf("4100")).toBeCloseTo(revenueBefore - 1000, 3);

    const rev = await caller.journal.reverse({ id: je.id });
    expect(rev.type).toBe("reversal");
    expect(rev.status).toBe("posted");

    // After reversal, balances must be back to exactly where they started.
    expect(await balanceOf("1110")).toBeCloseTo(cashBefore, 3);
    expect(await balanceOf("4100")).toBeCloseTo(revenueBefore, 3);
  });

  it("marks the original entry as reversed and refuses to reverse a draft", async () => {
    const accounts = await caller.coa.list({});
    const cash = accounts.find((a: any) => a.code === "1110");
    const revenue = accounts.find((a: any) => a.code === "4100");

    const draft = await caller.journal.create({
      date: new Date(),
      description: "Draft entry",
      lines: [
        { accountId: cash.id, debitAmount: 500, creditAmount: 0 },
        { accountId: revenue.id, debitAmount: 0, creditAmount: 500 },
      ],
    });

    // A draft entry has not moved balances, so it cannot be reversed.
    await expect(caller.journal.reverse({ id: draft.id })).rejects.toThrow(/posted/i);

    await caller.journal.post({ id: draft.id });
    await caller.journal.reverse({ id: draft.id });

    const list = await caller.journal.list({ limit: 200 });
    const original = list.items.find((e: any) => e.id === draft.id);
    expect(original?.status).toBe("reversed");
  });
});
