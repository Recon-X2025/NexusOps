import { chartOfAccounts, eq } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { deriveStateFromTarget, emptyMetricValue } from "../resolve-helpers";
import { dbOf } from "./_db";

type CoaRow = { type: string; currentBalance: string | null };

registerMetric({
  id: "financial.gross_margin",
  label: "Net margin % (P&L proxy)",
  function: "finance",
  dimension: "sla",
  direction: "higher_is_better",
  unit: "percent",
  target: 15,
  description: "Net profit as a percent of income from chart of accounts balances (simplified).",
  drillUrl: "/app/accounting",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const accounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.orgId, ctx.tenantId));
    if (accounts.length === 0) {
      return emptyMetricValue("no_data");
    }
    const income = (accounts as CoaRow[]).filter((a) => a.type === "income");
    const expenses = (accounts as CoaRow[]).filter((a) => a.type === "expense");
    const totalIncome = income.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    const totalExpenses = expenses.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    if (totalIncome <= 0) {
      return emptyMetricValue("no_data");
    }
    const net = totalIncome - totalExpenses;
    const marginPct = Math.round((net / totalIncome) * 1000) / 10;
    const state = deriveStateFromTarget(marginPct, 15, "higher_is_better");
    return {
      current: marginPct,
      // Margin is computed from current ledger balances — a series would
      // require historical period closes which we don't yet store.
      series: [],
      state,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 63 },
    { role: "ceo", surface: "bullet", priority: 30 },
    { role: "ceo", surface: "trend", priority: 92 },
    { role: "cfo", surface: "bullet", priority: 8 },
  ],
});
