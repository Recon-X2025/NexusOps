import { invoices, chartOfAccounts, eq, and, sql } from "@coheronconnect/db";
import { registerMetric } from "../registry";
import { emptyMetricValue } from "../resolve-helpers";
import { dbOf } from "./_db";

type CoaRow = { type: string; currentBalance: string | null };

registerMetric({
  id: "financial.cash_runway_months",
  label: "Cash runway (months)",
  function: "finance",
  dimension: "trend",
  direction: "higher_is_better",
  unit: "days",
  description: "// TODO: contribute from treasury / cash ledger when a canonical balance feed exists.",
  drillUrl: "/app/accounting",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const accounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.orgId, ctx.tenantId));
    const assets = (accounts as CoaRow[]).filter((a) => a.type === "asset");
    const expenses = (accounts as CoaRow[]).filter((a) => a.type === "expense");
    
    const totalAssets = assets.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    const monthlyBurn = expenses.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    
    if (totalAssets === 0 || monthlyBurn === 0) {
      return emptyMetricValue("no_data");
    }
    
    const runway = Math.round((totalAssets / monthlyBurn) * 10) / 10;
    
    return {
      current: runway,
      series: [],
      state: runway > 12 ? "healthy" : runway > 6 ? "watch" : "stressed",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 60 },
    { role: "ceo", surface: "trend", priority: 90 },
    { role: "cfo", surface: "trend", priority: 5 },
  ],
});

registerMetric({
  id: "financial.burn_rate",
  label: "Expense run rate (COA)",
  function: "finance",
  dimension: "volume",
  direction: "lower_is_better",
  unit: "currency_inr",
  description: "Sum of expense account balances — proxy burn until cash actuals feed this metric.",
  drillUrl: "/app/accounting",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const accounts = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.orgId, ctx.tenantId));
    const expenses = (accounts as CoaRow[]).filter((a) => a.type === "expense");
    const burn = expenses.reduce((s, a) => s + Math.abs(Number(a.currentBalance)), 0);
    if (accounts.length === 0) {
      return emptyMetricValue("no_data");
    }
    return {
      current: burn,
      // Snapshot of current ledger balances — no historical period closes stored.
      series: [],
      state: burn > 1_000_000 ? "watch" : "healthy",
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 61 },
    { role: "ceo", surface: "bullet", priority: 40 },
    { role: "cfo", surface: "bullet", priority: 10 },
  ],
});

registerMetric({
  id: "financial.ar_aged_60_plus",
  label: "AR aged 60+ days",
  function: "finance",
  dimension: "risk",
  direction: "lower_is_better",
  unit: "currency_inr",
  target: 0,
  description: "Outstanding receivable amount where due date is more than 60 days ago.",
  drillUrl: "/app/finance",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, ctx.tenantId),
          eq(invoices.invoiceFlow, "receivable"),
          sql`status IN ('pending','approved','overdue')`,
        ),
      );
    const now = Date.now();
    let aged = 0;
    for (const inv of rows) {
      if (!inv.dueDate) continue;
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      if (days > 60) aged += Number(inv.amount);
    }
    if (rows.length === 0) {
      return emptyMetricValue("no_data");
    }
    const state = aged === 0 ? "healthy" : aged > 500_000 ? "stressed" : "watch";
    return {
      current: aged,
      // Aged AR is a present-state aggregate; previous-period AR isn't tracked.
      series: [],
      state,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 62 },
    { role: "ceo", surface: "risk", priority: 10 },
    { role: "ceo", surface: "attention", priority: 12 },
    { role: "cfo", surface: "risk", priority: 5 },
  ],
});
