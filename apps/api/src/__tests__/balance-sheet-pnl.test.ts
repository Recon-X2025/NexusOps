/**
 * Balance sheet + date-ranged P&L tests (Sprint 2.2).
 *
 * The accounting router gains two period-accurate financial statements built by
 * summing *posted* journal-entry lines rather than reading the currentBalance
 * snapshot blindly:
 *   - profitAndLoss(startDate,endDate): income − expense for movements whose
 *     entry date falls in the window (revenue = −net, expense = net).
 *   - balanceSheet(asOfDate?): Assets = Liabilities + Equity, with net income to
 *     date folded into equity as "current period earnings" so the identity holds
 *     without a period-close entry; contra-assets net down assets.
 *
 * Verifies the accounting identity, date-window filtering, draft-exclusion,
 * contra-asset netting and tenant isolation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg } from "./helpers";
import { accountingRouter } from "../routers/accounting";

describe("Balance sheet + date-ranged P&L (Sprint 2.2)", () => {
  let caller: any;
  let accounts: any[];

  /** Resolve a seeded COA account id by its code. */
  const acct = (code: string) => accounts.find((a) => a.code === code)!.id;

  /** Create + post a balanced journal entry on a given date. */
  async function postEntry(date: Date, lines: any[], description = "Entry") {
    const je = await caller.journal.create({ date, description, lines });
    await caller.journal.post({ id: je.id });
    return je;
  }

  beforeEach(async () => {
    const { orgId, adminId } = await seedFullOrg();
    caller = accountingRouter.createCaller(createMockContext(adminId, orgId));
    await caller.coa.seed();
    accounts = await caller.coa.list({});
  });

  it("date-ranged P&L nets income minus expense for the window only", async () => {
    // April: ₹100,000 cash service revenue.
    await postEntry(new Date("2025-04-15"), [
      { accountId: acct("1110"), debitAmount: 100_000, creditAmount: 0 },
      { accountId: acct("4110"), debitAmount: 0, creditAmount: 100_000 },
    ]);
    // April: ₹30,000 salaries expense (paid from cash).
    await postEntry(new Date("2025-04-20"), [
      { accountId: acct("5210"), debitAmount: 30_000, creditAmount: 0 },
      { accountId: acct("1110"), debitAmount: 0, creditAmount: 30_000 },
    ]);
    // May (out of window): ₹50,000 revenue that must NOT appear.
    await postEntry(new Date("2025-05-10"), [
      { accountId: acct("1110"), debitAmount: 50_000, creditAmount: 0 },
      { accountId: acct("4110"), debitAmount: 0, creditAmount: 50_000 },
    ]);

    const pnl = await caller.profitAndLoss({
      startDate: new Date("2025-04-01"),
      endDate: new Date("2025-04-30"),
    });
    expect(pnl.totalIncome).toBe(100_000);
    expect(pnl.totalExpenses).toBe(30_000);
    expect(pnl.netProfit).toBe(70_000);
    // Every surfaced amount is a positive presentation figure.
    expect(pnl.income.every((l: any) => l.amount > 0)).toBe(true);
    expect(pnl.expenses.every((l: any) => l.amount > 0)).toBe(true);
  });

  it("excludes draft (unposted) entries from the P&L", async () => {
    await postEntry(new Date("2025-04-15"), [
      { accountId: acct("1110"), debitAmount: 100_000, creditAmount: 0 },
      { accountId: acct("4110"), debitAmount: 0, creditAmount: 100_000 },
    ]);
    // A draft entry that is created but never posted.
    await caller.journal.create({
      date: new Date("2025-04-16"),
      description: "Unposted",
      lines: [
        { accountId: acct("1110"), debitAmount: 999_999, creditAmount: 0 },
        { accountId: acct("4110"), debitAmount: 0, creditAmount: 999_999 },
      ],
    });

    const pnl = await caller.profitAndLoss({
      startDate: new Date("2025-04-01"),
      endDate: new Date("2025-04-30"),
    });
    expect(pnl.totalIncome).toBe(100_000);
  });

  it("balance sheet balances: Assets = Liabilities + Equity via current-period earnings", async () => {
    // Owner injects ₹500,000 share capital into the bank.
    await postEntry(new Date("2025-04-01"), [
      { accountId: acct("1120"), debitAmount: 500_000, creditAmount: 0 },
      { accountId: acct("3100"), debitAmount: 0, creditAmount: 500_000 },
    ], "Capital injection");
    // ₹200,000 credit sale (AR debit, revenue credit).
    await postEntry(new Date("2025-04-10"), [
      { accountId: acct("1130"), debitAmount: 200_000, creditAmount: 0 },
      { accountId: acct("4110"), debitAmount: 0, creditAmount: 200_000 },
    ], "Credit sale");
    // ₹80,000 office expense on credit (expense debit, AP credit).
    await postEntry(new Date("2025-04-12"), [
      { accountId: acct("5300"), debitAmount: 80_000, creditAmount: 0 },
      { accountId: acct("2110"), debitAmount: 0, creditAmount: 80_000 },
    ], "Office expense on credit");

    const bs = await caller.balanceSheet();
    // Assets: bank 500k + AR 200k = 700k.
    expect(bs.totalAssets).toBe(700_000);
    // Liabilities: AP 80k.
    expect(bs.liabilities.total).toBe(80_000);
    // Equity: share capital 500k + current earnings (200k − 80k = 120k) = 620k.
    expect(bs.equity.currentPeriodEarnings).toBe(120_000);
    expect(bs.equity.total).toBe(620_000);
    expect(bs.totalLiabilitiesAndEquity).toBe(700_000);
    expect(bs.isBalanced).toBe(true);
  });

  it("nets contra-asset (accumulated depreciation) down the asset total", async () => {
    // Buy computer equipment for ₹100,000 cash.
    await postEntry(new Date("2025-04-01"), [
      { accountId: acct("1210"), debitAmount: 100_000, creditAmount: 0 },
      { accountId: acct("3100"), debitAmount: 0, creditAmount: 100_000 },
    ], "Buy equipment (equity funded)");
    // Charge ₹20,000 depreciation: expense debit, accumulated depreciation credit.
    await postEntry(new Date("2025-04-30"), [
      { accountId: acct("5500"), debitAmount: 20_000, creditAmount: 0 },
      { accountId: acct("1290"), debitAmount: 0, creditAmount: 20_000 },
    ], "Depreciation");

    const bs = await caller.balanceSheet();
    // Gross equipment 100k − accumulated depreciation 20k = 80k net assets.
    expect(bs.totalAssets).toBe(80_000);
    // Equity: 100k capital − 20k depreciation expense = 80k.
    expect(bs.equity.total).toBe(80_000);
    expect(bs.isBalanced).toBe(true);
  });

  it("scopes both statements to the caller's org", async () => {
    // Post revenue in a *different* org; it must not leak into ours.
    const other = await seedFullOrg();
    const otherCaller = accountingRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    await otherCaller.coa.seed();
    const otherAccounts = await otherCaller.coa.list({});
    const oAcct = (code: string) => otherAccounts.find((a: any) => a.code === code)!.id;
    const je = await otherCaller.journal.create({
      date: new Date("2025-04-15"),
      description: "Foreign revenue",
      lines: [
        { accountId: oAcct("1110"), debitAmount: 777_777, creditAmount: 0 },
        { accountId: oAcct("4110"), debitAmount: 0, creditAmount: 777_777 },
      ],
    });
    await otherCaller.journal.post({ id: je.id });

    const pnl = await caller.profitAndLoss({
      startDate: new Date("2025-04-01"),
      endDate: new Date("2025-04-30"),
    });
    expect(pnl.totalIncome).toBe(0);

    const bs = await caller.balanceSheet();
    expect(bs.totalAssets).toBe(0);
    expect(bs.isBalanced).toBe(true);
  });
});
