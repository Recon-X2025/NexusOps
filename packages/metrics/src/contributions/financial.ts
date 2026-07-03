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
    // Aging buckets by days-past-due. `current` remains the 60+ total so the
    // existing risk/attention rules keep working; `categories` powers the
    // AR aging distribution bar on the Finance hub.
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const inv of rows) {
      if (!inv.dueDate) continue;
      const amount = Number(inv.amount);
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      if (days <= 30) buckets["0-30"] += amount;
      else if (days <= 60) buckets["31-60"] += amount;
      else if (days <= 90) buckets["61-90"] += amount;
      else buckets["90+"] += amount;
      if (days > 60) aged += amount;
    }
    if (rows.length === 0) {
      return emptyMetricValue("no_data");
    }
    const state = aged === 0 ? "healthy" : aged > 500_000 ? "stressed" : "watch";
    return {
      current: aged,
      // Aged AR is a present-state aggregate; previous-period AR isn't tracked.
      series: [],
      categories: [
        { label: "0–30d", value: Math.round(buckets["0-30"]), state: "healthy" },
        { label: "31–60d", value: Math.round(buckets["31-60"]), state: "watch" },
        { label: "61–90d", value: Math.round(buckets["61-90"]), state: "stressed" },
        { label: "90d+", value: Math.round(buckets["90+"]), state: "stressed" },
      ],
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

registerMetric({
  id: "financial.ap_aged_60_plus",
  label: "AP aged 60+ days",
  function: "finance",
  dimension: "risk",
  direction: "lower_is_better",
  unit: "currency_inr",
  target: 0,
  description: "Outstanding payable amount where due date is more than 60 days ago.",
  drillUrl: "/app/finance",
  resolve: async (ctx) => {
    const db = dbOf(ctx);
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, ctx.tenantId),
          eq(invoices.invoiceFlow, "payable"),
          sql`status IN ('pending','approved','overdue')`,
        ),
      );
    const now = Date.now();
    let aged = 0;
    // Same aging buckets as AR: `current` carries the 60+ total for the
    // risk/attention rules; `categories` powers the AP aging distribution bar.
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const inv of rows) {
      if (!inv.dueDate) continue;
      const amount = Number(inv.amount);
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      if (days <= 30) buckets["0-30"] += amount;
      else if (days <= 60) buckets["31-60"] += amount;
      else if (days <= 90) buckets["61-90"] += amount;
      else buckets["90+"] += amount;
      if (days > 60) aged += amount;
    }
    if (rows.length === 0) {
      return emptyMetricValue("no_data");
    }
    const state = aged === 0 ? "healthy" : aged > 500_000 ? "stressed" : "watch";
    return {
      current: aged,
      // Aged AP is a present-state aggregate; previous-period AP isn't tracked.
      series: [],
      categories: [
        { label: "0–30d", value: Math.round(buckets["0-30"]), state: "healthy" },
        { label: "31–60d", value: Math.round(buckets["31-60"]), state: "watch" },
        { label: "61–90d", value: Math.round(buckets["61-90"]), state: "stressed" },
        { label: "90d+", value: Math.round(buckets["90+"]), state: "stressed" },
      ],
      state,
      lastUpdated: new Date(),
    };
  },
  appearsIn: [
    { role: "ceo", surface: "heatmap", priority: 63 },
    { role: "ceo", surface: "risk", priority: 11 },
    { role: "cfo", surface: "risk", priority: 6 },
  ],
});
