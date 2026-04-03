"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Coins, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Plus, Download, BarChart2, Loader2, RefreshCw, Calendar, X } from "lucide-react";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const FIN_TABS = [
  { key: "budget",      label: "IT Budget",              module: "budget"      as const, action: "read"  as const },
  { key: "chargebacks", label: "Chargeback / Showback",  module: "chargebacks" as const, action: "read"  as const },
  { key: "capex_opex",  label: "CAPEX / OPEX",           module: "financial"   as const, action: "admin" as const },
  { key: "invoices",    label: "Invoices",               module: "financial"   as const, action: "read"  as const },
  { key: "ap",          label: "Accounts Payable",       module: "financial"   as const, action: "read"  as const },
  { key: "ar",          label: "Accounts Receivable",    module: "financial"   as const, action: "read"  as const },
  { key: "taxation",    label: "Taxation (India)",       module: "financial"   as const, action: "admin" as const },
];


const STATUS_CFG: Record<string, { label: string; color: string }> = {
  on_track:   { label: "On Track",   color: "text-green-700 bg-green-100" },
  at_risk:    { label: "At Risk",    color: "text-yellow-700 bg-yellow-100" },
  over_budget:{ label: "Over Budget",color: "text-red-700 bg-red-100" },
  under_spend:{ label: "Under Spend",color: "text-blue-700 bg-blue-100" },
};

const INV_STATUS: Record<string, string> = {
  paid:     "text-green-700 bg-green-100",
  pending:  "text-blue-700 bg-blue-100",
  overdue:  "text-red-700 bg-red-100",
  disputed: "text-orange-700 bg-orange-100",
};

export default function FinancialPage() {
  const { can } = useRBAC();
  const router = useRouter();
  const visibleTabs = FIN_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "budget");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  const { data: budgetData, isLoading: budgetLoading } = trpc.financial.listBudget.useQuery(
    { fiscalYear: new Date().getFullYear() },
    { refetchOnWindowFocus: false },
  );
  const { data: invoicesData, isLoading: invoicesLoading } = trpc.financial.listInvoices.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false },
  );

  const { data: chargebacksData, isLoading: chargebacksLoading } = trpc.financial.listChargebacks.useQuery(
    { periodYear: new Date().getFullYear() },
    { refetchOnWindowFocus: false },
  );
  const { data: apAgingData } = trpc.financial.apAging.useQuery(undefined, { refetchOnWindowFocus: false });

  const approveInvoiceMutation = trpc.financial.approveInvoice.useMutation({ onSuccess: () => (trpc as any).financial?.listInvoices?.invalidate?.(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const markPaidMutation       = trpc.financial.markPaid.useMutation({ onSuccess: () => (trpc as any).financial?.listInvoices?.invalidate?.(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });

  const [showNewBudget, setShowNewBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ category: "", department: "", budgeted: "" });
  const createBudgetLine = trpc.financial.createBudgetLine.useMutation({
    onSuccess: () => { toast.success("Budget line added"); setShowNewBudget(false); setBudgetForm({ category: "", department: "", budgeted: "" }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add budget line"),
  });

  const { data: arInvoicesData } = trpc.financial.listInvoices.useQuery(
    { limit: 50, direction: "receivable" } as any,
    { refetchOnWindowFocus: false },
  );

  // India compliance — GST filing calendar (live)
  const currentMonth = new Date().getMonth() + 1;
  const currentYear  = new Date().getFullYear();
  const gstCalendarQuery = (trpc as any).financial.gstFilingCalendar.useQuery(
    { month: currentMonth, year: currentYear },
    { refetchOnWindowFocus: false },
  );
  const tdsChallansQuery = (trpc as any).indiaCompliance.tdsChallans.list.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );

  if (!can("financial", "read")) return <AccessDenied module="Financial Management" />;

  const gstFilings: any[] = gstCalendarQuery.data ?? [];
  const tdsChallans: any[] = tdsChallansQuery.data ?? [];

  const CHALLAN_STATUS_COLOR: Record<string, string> = {
    paid:    "text-green-700 bg-green-100",
    pending: "text-orange-700 bg-orange-100",
    overdue: "text-red-700 bg-red-100",
  };

  type BudgetLine = NonNullable<typeof budgetData>[number];
  type InvoiceItem = NonNullable<typeof invoicesData>["items"][number];
  type ChargebackItem = NonNullable<typeof chargebacksData>[number];

  const budgetLines: BudgetLine[] = budgetData ?? [];
  const invoices: InvoiceItem[] = invoicesData?.items ?? [];
  const chargebackLines: ChargebackItem[] = chargebacksData ?? [];

  // DB fields: budgeted/actual/committed/forecast (decimal strings)
  const totalBudget = budgetLines.reduce((s, b) => s + Number(b.budgeted ?? 0), 0);
  const totalActual = budgetLines.reduce((s, b) => s + Number(b.actual ?? 0), 0);
  const totalCommitted = budgetLines.reduce((s, b) => s + Number(b.committed ?? 0), 0);
  const overBudget = budgetLines.filter((b) => {
    const used = Number(b.actual ?? 0) + Number(b.committed ?? 0);
    return Number(b.budgeted ?? 0) > 0 && used > Number(b.budgeted ?? 0);
  }).length;
  // DB invoice status: "pending" | "approved" | "paid" | "disputed" (no "overdue")
  const totalInvoicePending = invoices
    .filter((i) => i.status === "pending" || i.status === "approved")
    .reduce((s, i) => s + Number(i.amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">IT Financial Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Budget · Chargebacks · CAPEX/OPEX · Invoices</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV([
              ...budgetLines.map((b: any) => ({ Type: "Budget", Department: b.department ?? b.costCenter ?? "", Category: b.category ?? "", FY_Budget: b.allocatedAmount ?? b.total ?? "", YTD_Actual: b.actualAmount ?? b.spent ?? "", Variance: ((b.allocatedAmount ?? 0) - (b.actualAmount ?? 0)).toFixed(2), Status: b.status ?? "" })),
              ...invoices.map((i: any) => ({ Type: "Invoice", Vendor: i.vendorName ?? "", Invoice_No: i.invoiceNumber ?? i.number ?? "", Amount: i.totalAmount ?? "", Status: i.status ?? "", Due_Date: i.dueDate ? new Date(i.dueDate).toLocaleDateString("en-IN") : "" })),
            ], "fy_report")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export FY Report
          </button>
          {can("budget", "write") && (
            <button
              onClick={() => setShowNewBudget(true)}
              className="flex items-center gap-1 px-2 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> Add Budget Line
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "FY2026 IT Budget",         value: `₹${(totalBudget / 10000000).toFixed(1)}Cr`, color: "text-foreground/80" },
          { label: "YTD Actuals",              value: `₹${(totalActual / 100000).toFixed(0)}L`,    color: "text-blue-700" },
          { label: "YTD Committed",            value: `₹${(totalCommitted / 100000).toFixed(0)}L`, color: "text-indigo-700" },
          { label: "Over Budget Lines",        value: overBudget, color: overBudget > 0 ? "text-red-700" : "text-green-700" },
          { label: "Invoices Pending/Overdue", value: `₹${(totalInvoicePending / 100000).toFixed(0)}L`, color: "text-orange-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border bg-card rounded-t">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {tab === "budget" && (
          budgetLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading budget…</span>
            </div>
          ) : budgetLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <BarChart2 className="w-5 h-5 opacity-30" />
              <span className="text-xs">No budget lines found.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Category</th>
                  <th>Type</th>
                  <th>Annual Budget</th>
                  <th>YTD Actuals</th>
                  <th>YTD Committed</th>
                  <th>YTD Total</th>
                  <th>Forecast</th>
                  <th>Variance</th>
                  <th>% Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {budgetLines.map((b) => {
                  // DB fields are decimal strings: budgeted, actual, committed, forecast
                  const annualBudget = Number(b.budgeted ?? 0);
                  const ytdActual = Number(b.actual ?? 0);
                  const ytdCommitted = Number(b.committed ?? 0);
                  const forecast = Number(b.forecast ?? 0);
                  const ytdTotal = ytdActual + ytdCommitted;
                  const variance = annualBudget - ytdTotal;
                  const pctUsed = annualBudget > 0 ? Math.round((ytdTotal / annualBudget) * 100) : 0;
                  const budgetStatus = pctUsed > 100 ? "over_budget" : pctUsed > 80 ? "at_risk" : ytdTotal < annualBudget * 0.1 ? "under_spend" : "on_track";
                  const sCfg = (STATUS_CFG[budgetStatus] ?? STATUS_CFG.on_track)!;
                  return (
                    <tr key={b.id} className={budgetStatus === "over_budget" ? "bg-red-50/30" : ""}>
                      <td className="p-0"><div className={`priority-bar ${budgetStatus === "over_budget" ? "bg-red-600" : budgetStatus === "at_risk" ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                      <td className="font-medium text-foreground">{b.category ?? "—"}</td>
                      <td><span className="status-badge text-blue-700 bg-blue-100">{b.department ?? "OPEX"}</span></td>
                      <td className="font-mono text-[11px] text-foreground/80">₹{annualBudget.toLocaleString("en-IN")}</td>
                      <td className="font-mono text-[11px] text-foreground/80">₹{ytdActual.toLocaleString("en-IN")}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">₹{ytdCommitted.toLocaleString("en-IN")}</td>
                      <td className="font-mono text-[12px] font-bold text-foreground">₹{ytdTotal.toLocaleString("en-IN")}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">₹{forecast.toLocaleString("en-IN")}</td>
                      <td>
                        <span className={`font-mono text-[12px] font-bold ${variance > 0 ? "text-green-700" : "text-red-600"}`}>
                          {variance > 0 ? "+" : ""}{variance < 0 ? "-" : ""}₹{Math.abs(variance).toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pctUsed > 100 ? "bg-red-500" : pctUsed > 75 ? "bg-yellow-500" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, pctUsed)}%` }} />
                          </div>
                          <span className={`text-[11px] font-bold ${pctUsed > 100 ? "text-red-700" : pctUsed > 75 ? "text-yellow-600" : "text-foreground/80"}`}>{pctUsed}%</span>
                        </div>
                      </td>
                      <td><span className={`status-badge ${sCfg.color}`}>{sCfg.label}</span></td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/30 font-semibold">
                  <td /><td className="font-bold text-foreground">TOTAL</td><td />
                  <td className="font-mono text-[12px] font-bold">₹{totalBudget.toLocaleString("en-IN")}</td>
                  <td className="font-mono text-[12px] font-bold">₹{totalActual.toLocaleString("en-IN")}</td>
                  <td className="font-mono text-[12px] font-bold">₹{totalCommitted.toLocaleString("en-IN")}</td>
                  <td className="font-mono text-[13px] font-bold">₹{(totalActual + totalCommitted).toLocaleString("en-IN")}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          )
        )}

        {tab === "chargebacks" && (
          chargebacksLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading chargebacks…</span>
            </div>
          ) : chargebackLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <BarChart2 className="w-5 h-5 opacity-30" />
              <span className="text-xs">No chargeback records found for this period.</span>
            </div>
          ) : (
          <div>
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 text-[12px] text-blue-700">
              IT cost chargeback model — costs allocated to business units based on actual consumption.
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Service</th>
                  <th>Allocation Method</th>
                  <th>Period</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {chargebackLines.map((c: any) => (
                  <tr key={c.id}>
                    <td className="font-medium text-foreground">{c.department}</td>
                    <td className="text-muted-foreground">{c.service}</td>
                    <td className="text-muted-foreground text-[11px]">{c.allocationMethod ?? "—"}</td>
                    <td className="font-mono text-[11px] text-muted-foreground">{c.periodMonth}/{c.periodYear}</td>
                    <td className="font-mono text-[12px] font-bold text-foreground">₹{Number(c.amount ?? 0).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        )}

        {tab === "capex_opex" && (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-6">
              {["CAPEX","OPEX"].map((type) => {
                // DB schema has no CAPEX/OPEX type field; show all lines under OPEX
                const lines = type === "OPEX" ? budgetLines : [];
                const total = lines.reduce((s, b) => s + Number(b.budgeted ?? 0), 0);
                const actual = lines.reduce((s, b) => s + Number(b.actual ?? 0), 0);
                return (
                  <div key={type} className="border border-border rounded overflow-hidden">
                    <div className={`px-4 py-3 border-b border-border ${type === "CAPEX" ? "bg-purple-50" : "bg-blue-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground/80">{type}</span>
                        <div className="text-right">
                          <div className="text-[15px] font-bold text-foreground">₹{total.toLocaleString("en-IN")}</div>
                          <div className="text-[11px] text-muted-foreground/70">FY2026 Budget</div>
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-card/60 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${type === "CAPEX" ? "bg-purple-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(100, Math.round((actual / (total || 1)) * 100))}%` }} />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">₹{actual.toLocaleString("en-IN")} actuals ({Math.round((actual/(total||1))*100)}%)</div>
                    </div>
                    <div className="divide-y divide-border">
                      {lines.map((b) => {
                        const lineAct = Number(b.actual ?? 0) + Number(b.committed ?? 0);
                        const lineBgt = Number(b.budgeted ?? 0);
                        const lineStatus = lineBgt > 0 && lineAct > lineBgt ? "over_budget" : lineAct / (lineBgt || 1) > 0.8 ? "at_risk" : "on_track";
                        const lineSt = (STATUS_CFG[lineStatus] ?? STATUS_CFG.on_track)!;
                        return (
                        <div key={b.id} className="flex items-center justify-between px-4 py-2 text-[11px]">
                          <span className="text-foreground/80">{b.category}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-muted-foreground">₹{Number(b.actual ?? 0).toLocaleString("en-IN")}</span>
                            <span className="text-slate-300">/</span>
                            <span className="font-mono font-semibold text-foreground">₹{Number(b.budgeted ?? 0).toLocaleString("en-IN")}</span>
                            <span className={`status-badge text-[10px] ${lineSt.color}`}>{lineSt.label}</span>
                          </div>
                        </div>
                      );})}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "invoices" && (
          invoicesLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading invoices…</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Coins className="w-5 h-5 opacity-30" />
              <span className="text-xs">No invoices found.</span>
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>Invoice ID</th>
                  <th>Vendor</th>
                  <th>Reference</th>
                  <th>Invoice Date</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Budget Code</th>
                  <th>PO Ref</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const invStatus = inv.status ?? "";
                  // DB fields: invoiceNumber (vendor ref), vendorId (UUID), poId, amount (string), dueDate
                  const invVendor = `Vendor …${inv.vendorId?.slice(-6) ?? "—"}`;
                  const invRef = inv.invoiceNumber ?? "—";
                  const invDate = inv.createdAt ? new Date(inv.createdAt).toISOString().split("T")[0] : "—";
                  const invAmount = Number(inv.amount ?? 0);
                  const invPoRef = inv.poId ?? null;
                  const invDue = inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : "—";
                  return (
                    <tr key={inv.id} className={invStatus === "overdue" ? "bg-red-50/30" : invStatus === "disputed" ? "bg-orange-50/20" : ""}>
                      <td className="p-0"><div className={`priority-bar ${invStatus === "overdue" ? "bg-red-600" : invStatus === "disputed" ? "bg-orange-500" : invStatus === "paid" ? "bg-green-500" : "bg-blue-400"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{inv.id.slice(-8).toUpperCase()}</td>
                      <td className="font-medium text-foreground">{invVendor}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">{invRef}</td>
                      <td className="text-muted-foreground text-[11px]">{invDate}</td>
                      <td className={`text-[11px] ${invStatus === "overdue" ? "text-red-600 font-bold" : "text-muted-foreground"}`}>{invDue}</td>
                      <td className="font-mono text-[12px] font-bold text-foreground">₹{invAmount.toLocaleString("en-IN")}</td>
                      <td className="font-mono text-[10px] text-muted-foreground/70">—</td>
                      <td className="font-mono text-[11px] text-primary">{invPoRef ?? "—"}</td>
                      <td><span className={`status-badge capitalize ${INV_STATUS[invStatus] ?? ""}`}>{invStatus}</span></td>
                        <td>
                          <div className="flex gap-1.5">
                            {invStatus === "pending" && (
                              <PermissionGate module="financial" action="write">
                                <button
                                  disabled={approveInvoiceMutation.isPending}
                                  onClick={() => approveInvoiceMutation.mutate({ id: (inv as any).id })}
                                  className="text-[11px] text-green-700 hover:underline disabled:opacity-50"
                                >{approveInvoiceMutation.isPending ? "…" : "Approve Payment"}</button>
                              </PermissionGate>
                            )}
                            {invStatus === "approved" && (
                              <PermissionGate module="financial" action="write">
                                <button
                                  disabled={markPaidMutation.isPending}
                                  onClick={() => markPaidMutation.mutate({ id: (inv as any).id, paymentMethod: "bank_transfer" })}
                                  className="text-[11px] text-blue-700 hover:underline font-semibold disabled:opacity-50"
                                >{markPaidMutation.isPending ? "…" : "Mark Paid"}</button>
                              </PermissionGate>
                            )}
                            {invStatus === "overdue" && (
                              <button
                                disabled={approveInvoiceMutation.isPending}
                                onClick={() => approveInvoiceMutation.mutate({ id: (inv as any).id })}
                                className="text-[11px] text-red-600 font-semibold hover:underline"
                              >Approve & Escalate</button>
                            )}
                            <button onClick={() => { const i = inv as any; router.push(`/app/procurement?tab=invoices&id=${i.id ?? ""}`); }} className="text-[11px] text-primary hover:underline">View</button>
                          </div>
                        </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {/* ACCOUNTS PAYABLE */}
        {tab === "ap" && (
          <div className="p-4 space-y-4">
            {/* AP KPIs from live apAging */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Current (0–30d)",   value: `₹${((apAgingData?.current ?? 0) / 100000).toFixed(1)}L`,  color: "text-green-700" },
                { label: "31–60 Days",          value: `₹${((apAgingData?.d30 ?? 0) / 100000).toFixed(1)}L`,     color: "text-yellow-700" },
                { label: "61–90 Days",          value: `₹${((apAgingData?.d60 ?? 0) / 100000).toFixed(1)}L`,     color: "text-orange-700" },
                { label: "90+ Days",            value: `₹${((apAgingData?.d90 ?? 0) / 100000).toFixed(1)}L`,     color: (apAgingData?.d90 ?? 0) > 0 ? "text-red-700" : "text-green-700" },
                { label: "Over 90 Days",        value: `₹${((apAgingData?.over90 ?? 0) / 100000).toFixed(1)}L`,  color: (apAgingData?.over90 ?? 0) > 0 ? "text-red-700 font-bold" : "text-green-700" },
              ].map(k => (
                <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
                  <div className={`text-xl font-black ${k.color}`}>{k.value}</div>
                  <div className="text-[10px] text-muted-foreground/70 uppercase">{k.label}</div>
                </div>
              ))}
            </div>
            {(() => {
              const payableInvoices = invoices.filter((i: any) => !i.direction || i.direction === "payable");
              const overdue = payableInvoices.filter((i: any) => i.status === "overdue");
              return payableInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-1">
                  <BarChart2 className="w-6 h-6 opacity-30" />
                  <p className="text-[12px]">No payable invoices found.</p>
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {overdue.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-red-700 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <strong>{overdue.length} overdue invoice{overdue.length !== 1 ? "s" : ""}</strong>&nbsp;— total ₹{overdue.reduce((s: number, i: any) => s + Number(i.totalAmount ?? 0), 0).toLocaleString()}
                    </div>
                  )}
                  <table className="ent-table w-full">
                    <thead>
                      <tr>
                        <th>Invoice #</th><th>Vendor</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payableInvoices.map((inv: any) => (
                        <tr key={inv.id} className={inv.status === "overdue" ? "bg-red-50/30" : ""}>
                          <td><span className="font-mono text-[11px]">{inv.invoiceNumber ?? inv.id.slice(0,8)}</span></td>
                          <td className="text-[12px]">{inv.vendorName ?? "—"}</td>
                          <td className="font-semibold text-[12px]">₹{Number(inv.totalAmount ?? 0).toLocaleString()}</td>
                          <td className="text-[11px] text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "—"}</td>
                          <td><span className={`status-badge capitalize ${INV_STATUS[inv.status] ?? "bg-muted text-muted-foreground"}`}>{inv.status}</span></td>
                          <td className="flex gap-2">
                            {inv.status === "pending" && can("financial", "write") && (
                              <button onClick={() => approveInvoiceMutation.mutate({ id: inv.id })} disabled={approveInvoiceMutation.isPending} className="text-[10px] text-blue-600 hover:underline disabled:opacity-50">Approve</button>
                            )}
                            {(inv.status === "pending" || inv.status === "overdue") && can("financial", "write") && (
                              <button onClick={() => markPaidMutation.mutate({ id: inv.id })} disabled={markPaidMutation.isPending} className="text-[10px] text-green-600 hover:underline disabled:opacity-50">Mark Paid</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ACCOUNTS RECEIVABLE */}
        {tab === "ar" && (
          <div className="p-4">
            {(() => {
              const arInvoices: any[] = (arInvoicesData as any)?.items ?? [];
              const totalAR = arInvoices.reduce((s: number, i: any) => s + Number(i.totalAmount ?? 0), 0);
              const overdueAR = arInvoices.filter((i: any) => i.status === "overdue");
              return arInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                  <TrendingUp className="w-8 h-8 opacity-30" />
                  <p className="text-[13px]">No receivable invoices found</p>
                  <p className="text-[11px] text-muted-foreground/60">Invoices with direction &apos;receivable&apos; will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-border rounded px-3 py-2">
                      <div className="text-xl font-bold text-foreground/80">₹{(totalAR / 100000).toFixed(1)}L</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Total AR Outstanding</div>
                    </div>
                    <div className="border border-border rounded px-3 py-2">
                      <div className={`text-xl font-bold ${overdueAR.length > 0 ? "text-red-700" : "text-green-700"}`}>{overdueAR.length}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Overdue Invoices</div>
                    </div>
                    <div className="border border-border rounded px-3 py-2">
                      <div className="text-xl font-bold text-blue-700">{arInvoices.filter((i: any) => i.status === "pending").length}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Pending Collection</div>
                    </div>
                  </div>
                  <table className="ent-table w-full">
                    <thead><tr><th>Invoice #</th><th>Customer</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {arInvoices.map((inv: any) => (
                        <tr key={inv.id}>
                          <td><span className="font-mono text-[11px]">{inv.invoiceNumber ?? inv.number ?? inv.id.slice(0,8)}</span></td>
                          <td className="text-[12px]">{inv.vendorName ?? inv.customerName ?? "—"}</td>
                          <td className="font-semibold text-[12px]">₹{Number(inv.totalAmount ?? 0).toLocaleString()}</td>
                          <td className="text-[11px] text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "—"}</td>
                          <td><span className={`status-badge capitalize ${INV_STATUS[inv.status] ?? "bg-muted text-muted-foreground"}`}>{inv.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {tab === "taxation" && (
          <div className="p-4 space-y-5">
            {/* Corporate Tax Rates */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Corporate Income Tax — AY 2026-27 (FY 2025-26)</p>
              <table className="ent-table w-full mb-3">
                <thead><tr><th>Entity Type</th><th>Base Rate</th><th>Surcharge</th><th>Cess</th><th>Effective Rate</th><th>Condition</th></tr></thead>
                <tbody>
                  {[
                    { type: "Domestic — Section 115BAA (New Regime)", base: "22%", surcharge: "10%", cess: "4%", effective: "25.168%", note: "Opt-in required; no specified deductions/exemptions" },
                    { type: "Domestic — New Manufacturing (Sec 115BAB)", base: "15%", surcharge: "10%", cess: "4%", effective: "17.01%", note: "Setup & commenced production before 31 Mar 2024" },
                    { type: "Domestic — Turnover ≤ ₹400 Cr", base: "25%", surcharge: "7%/12%", cess: "4%", effective: "26–29.12%", note: "Previous year turnover ≤ ₹400 Cr" },
                    { type: "Domestic — General (Turnover > ₹400 Cr)", base: "30%", surcharge: "7%/12%", cess: "4%", effective: "31.2–34.944%", note: "Surcharge: 7% (₹1-10 Cr), 12% (>₹10 Cr income)" },
                    { type: "Foreign Company", base: "40%", surcharge: "2%/5%", cess: "4%", effective: "41.6–43.68%", note: "Royalty/FTS from Govt: 20%; Others: 40%" },
                    { type: "MAT (Minimum Alternate Tax)", base: "15%", surcharge: "As applicable", cess: "4%", effective: "15%+", note: "On book profit; MAT credit carry-forward for 15 years" },
                  ].map(r => (
                    <tr key={r.type}>
                      <td className="font-medium text-foreground text-[11px]">{r.type}</td>
                      <td className="font-mono font-bold text-blue-700">{r.base}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">{r.surcharge}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">{r.cess}</td>
                      <td className="font-mono font-bold text-primary">{r.effective}</td>
                      <td className="text-[11px] text-muted-foreground/80">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* GST */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">GST — Goods & Services Tax</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <table className="ent-table w-full">
                    <thead><tr><th>GST Slab</th><th>CGST</th><th>SGST/UTGST</th><th>IGST</th><th>Examples</th></tr></thead>
                    <tbody>
                      {[
                        { slab: "Nil", cgst: "0%", sgst: "0%", igst: "0%", eg: "Food grains, fresh produce, books" },
                        { slab: "5%",  cgst: "2.5%", sgst: "2.5%", igst: "5%",  eg: "Packaged food, transport services" },
                        { slab: "12%", cgst: "6%", sgst: "6%", igst: "12%", eg: "IT services, software products" },
                        { slab: "18%", cgst: "9%", sgst: "9%", igst: "18%", eg: "Professional services, SaaS, cloud" },
                        { slab: "28%", cgst: "14%", sgst: "14%", igst: "28%", eg: "Luxury goods, automobiles, cement" },
                      ].map(r => (
                        <tr key={r.slab}>
                          <td className="font-mono font-bold text-primary">{r.slab}</td>
                          <td className="font-mono text-[11px] text-muted-foreground">{r.cgst}</td>
                          <td className="font-mono text-[11px] text-muted-foreground">{r.sgst}</td>
                          <td className="font-mono text-[11px] text-muted-foreground">{r.igst}</td>
                          <td className="text-[11px] text-muted-foreground/80">{r.eg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">GSTIN registration mandatory if turnover &gt; ₹40L (goods) / ₹20L (services). Composition scheme available up to ₹1.5Cr.</p>
                </div>
                <div className="space-y-2">
                  <div className="bg-card border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">GST Return Calendar — {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}</p>
                      {gstCalendarQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    </div>
                    {gstFilings.length > 0 ? (
                      gstFilings.map((r: any) => (
                        <div key={r.form} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                          <div>
                            <span className="font-mono text-[11px] font-bold text-primary">{r.form}</span>
                            <span className="text-[11px] text-muted-foreground ml-2">{r.description}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-muted-foreground/70">{r.frequency}</div>
                            <div className="text-[10px] font-medium text-foreground/80">Due: {r.dueDate}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      [
                        { form: "GSTR-1",  freq: "Monthly / Quarterly", due: "11th / 13th of next month", desc: "Outward supplies" },
                        { form: "GSTR-3B", freq: "Monthly",              due: "20th of next month",        desc: "Summary + tax payment" },
                        { form: "GSTR-9",  freq: "Annual",               due: "31 December",               desc: "Annual return" },
                        { form: "GSTR-9C", freq: "Annual",               due: "31 December",               desc: "Reconciliation statement (turnover > ₹5Cr)" },
                      ].map(r => (
                        <div key={r.form} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                          <div>
                            <span className="font-mono text-[11px] font-bold text-primary">{r.form}</span>
                            <span className="text-[11px] text-muted-foreground ml-2">{r.desc}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-muted-foreground/70">{r.freq}</div>
                            <div className="text-[10px] font-medium text-foreground/80">Due: {r.due}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* TDS Challan Status — live */}
                  <div className="bg-card border border-border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase">TDS Challan Status</p>
                      {tdsChallansQuery.isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    </div>
                    {tdsChallans.length > 0 ? (
                      tdsChallans.slice(0, 4).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                          <div>
                            <span className="font-mono text-[11px] font-bold text-primary">{c.formType}</span>
                            <span className="text-[11px] text-muted-foreground ml-2">Q{c.quarter} {c.fy}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-foreground/80">₹{Number(c.tdsAmount ?? 0).toLocaleString("en-IN")}</span>
                            <span className={`status-badge text-[10px] ${CHALLAN_STATUS_COLOR[c.status] ?? "text-muted-foreground bg-muted"}`}>{c.status}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-muted-foreground/50 py-2 text-center">No TDS challans recorded — payments tracked in HR &gt; Payroll Compliance</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* TDS / TCS */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">TDS — Tax Deducted at Source (Key Sections)</p>
              <table className="ent-table w-full">
                <thead><tr><th>Section</th><th>Nature of Payment</th><th>Rate (Resident)</th><th>Threshold</th><th>Due Date</th></tr></thead>
                <tbody>
                  {[
                    { sec: "192",   nature: "Salaries",                              rate: "As per slab",   threshold: "Basic exemption", due: "7th of next month" },
                    { sec: "194C",  nature: "Contractor / Sub-contractor payments",  rate: "1% / 2%",       threshold: "₹30,000 (single) / ₹1L (aggregate)", due: "7th of next month" },
                    { sec: "194J",  nature: "Professional / Technical services",     rate: "2% / 10%",      threshold: "₹30,000 p.a.",     due: "7th of next month" },
                    { sec: "194H",  nature: "Commission or brokerage",               rate: "5%",            threshold: "₹15,000 p.a.",     due: "7th of next month" },
                    { sec: "194I",  nature: "Rent (land/building/machinery)",        rate: "2% / 10%",      threshold: "₹2,40,000 p.a.",   due: "7th of next month" },
                    { sec: "194Q",  nature: "Purchase of goods",                     rate: "0.1%",          threshold: "₹50L p.a. from seller", due: "7th of next month" },
                    { sec: "195",   nature: "Payments to non-residents (incl. royalty, FTS)", rate: "As per DTAA / 20%+", threshold: "Any amount", due: "7th of next month" },
                  ].map(r => (
                    <tr key={r.sec}>
                      <td className="font-mono font-bold text-primary">Sec {r.sec}</td>
                      <td className="font-medium text-foreground text-[11px]">{r.nature}</td>
                      <td className="font-mono font-bold text-blue-700">{r.rate}</td>
                      <td className="text-[11px] text-muted-foreground">{r.threshold}</td>
                      <td className="text-[11px] text-foreground/80">{r.due}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Advance Tax & Transfer Pricing */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Advance Tax Instalments — Companies</p>
                <table className="ent-table w-full">
                  <thead><tr><th>Instalment</th><th>Due Date</th><th>% of Total Tax</th><th>Status</th></tr></thead>
                  <tbody>
                    {[
                      { inst: "1st",  due: "15 June 2025",      pct: "15%",  status: "paid" },
                      { inst: "2nd",  due: "15 Sep 2025",       pct: "45%",  status: "paid" },
                      { inst: "3rd",  due: "15 Dec 2025",       pct: "75%",  status: "paid" },
                      { inst: "4th",  due: "15 Mar 2026",       pct: "100%", status: "paid" },
                    ].map(r => (
                      <tr key={r.inst}>
                        <td className="font-medium text-foreground">{r.inst} Instalment</td>
                        <td className="text-[11px] text-muted-foreground">{r.due}</td>
                        <td className="font-mono font-bold text-primary">{r.pct}</td>
                        <td><span className="status-badge text-green-700 bg-green-100 capitalize">{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-muted-foreground/70 mt-1.5">Interest u/s 234B/234C applies for shortfall in advance tax. Deferred Tax Asset/Liability per Ind AS 12.</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Transfer Pricing & Other Key Compliances</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Transfer Pricing Report (Form 3CEB)", due: "31 Oct 2026", status: "pending", note: "Mandatory if international transactions > ₹1Cr or specified domestic > ₹20Cr" },
                    { label: "ITR-6 (Corporate Return)", due: "31 Oct 2026", status: "pending", note: "Extended deadline for companies with audit" },
                    { label: "Tax Audit Report (Form 3CA/3CB + 3CD)", due: "30 Sep 2026", status: "pending", note: "Turnover > ₹1Cr (business) / ₹50L (professional)" },
                    { label: "Form 15CA/15CB (Overseas Remittance)", due: "Per transaction", status: "ongoing", note: "Before remittances to non-residents; CA certificate required" },
                    { label: "DTAA Benefit (Form 10F + Tax Residency Cert.)", due: "Per claim", status: "ongoing", note: "Required for lower TDS under tax treaty" },
                    { label: "Country-by-Country Report (CbCR)", due: "31 Mar 2026", status: "paid", note: "Consolidated group revenue > ₹5,500 Cr" },
                  ].map(r => (
                    <div key={r.label} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground">{r.label}</p>
                        <p className="text-[10px] text-muted-foreground/70">{r.note}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-[10px] text-muted-foreground">Due: {r.due}</div>
                        <span className={`status-badge text-[10px] capitalize ${r.status === "paid" ? "text-green-700 bg-green-100" : r.status === "ongoing" ? "text-blue-700 bg-blue-100" : "text-orange-700 bg-orange-100"}`}>{r.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Individual Tax Quick Reference */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Individual Income Tax — AY 2026-27 (New Regime — Default u/s 115BAC)</p>
              <div className="grid grid-cols-2 gap-4">
                <table className="ent-table w-full">
                  <thead><tr><th>Income Slab</th><th>New Regime</th><th>Old Regime</th></tr></thead>
                  <tbody>
                    {[
                      { slab: "Up to ₹3,00,000",              newRate: "Nil",  oldRate: "Nil" },
                      { slab: "₹3,00,001 – ₹7,00,000",        newRate: "5%",   oldRate: "5% (up to ₹5L)" },
                      { slab: "₹7,00,001 – ₹10,00,000",       newRate: "10%",  oldRate: "20% (₹5L–₹10L)" },
                      { slab: "₹10,00,001 – ₹12,00,000",      newRate: "15%",  oldRate: "30% (above ₹10L)" },
                      { slab: "₹12,00,001 – ₹15,00,000",      newRate: "20%",  oldRate: "30%" },
                      { slab: "Above ₹15,00,000",              newRate: "30%",  oldRate: "30%" },
                    ].map(r => (
                      <tr key={r.slab}>
                        <td className="font-medium text-foreground text-[11px]">{r.slab}</td>
                        <td className="font-mono font-bold text-green-700">{r.newRate}</td>
                        <td className="font-mono text-muted-foreground">{r.oldRate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="space-y-2 text-[11px]">
                  <div className="bg-green-50 border border-green-200 rounded p-2.5">
                    <p className="font-semibold text-green-700 mb-1">New Regime Highlights</p>
                    <ul className="text-muted-foreground space-y-0.5 text-[10px]">
                      <li>• Standard deduction: ₹75,000 (salaried)</li>
                      <li>• Rebate u/s 87A: Full tax rebate if income ≤ ₹12L</li>
                      <li>• No HRA, LTA, 80C/80D/80G deductions allowed</li>
                      <li>• Employer NPS contribution deductible u/s 80CCD(2)</li>
                      <li>• Surcharge: 10% (₹50L–₹1Cr), 15% (₹1–2Cr), 25% (₹2–5Cr), 25% ({'>'}₹5Cr)</li>
                      <li>• Health & Education Cess: 4% on tax + surcharge</li>
                    </ul>
                  </div>
                  <div className="bg-muted/30 border border-border rounded p-2.5">
                    <p className="font-semibold text-foreground/80 mb-1">Key Filing Deadlines</p>
                    <ul className="text-muted-foreground space-y-0.5 text-[10px]">
                      <li>• ITR-1/2/3/4 (Individuals): <strong>31 July 2026</strong></li>
                      <li>• Revised / Belated ITR: 31 December 2026</li>
                      <li>• Form 16 issuance by employer: 15 June 2026</li>
                      <li>• TDS return (24Q): 31 May 2026 (Q4)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {showNewBudget && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold">Add Budget Line</h2>
            <button onClick={() => setShowNewBudget(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Category *</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. Cloud Infrastructure" value={budgetForm.category} onChange={(e) => setBudgetForm((f) => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Department</label>
              <input className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. Engineering" value={budgetForm.department} onChange={(e) => setBudgetForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Annual Budget (₹) *</label>
              <input type="number" className="mt-1 w-full border border-border rounded px-2 py-1.5 text-[12px] bg-background" placeholder="e.g. 5000000" value={budgetForm.budgeted} onChange={(e) => setBudgetForm((f) => ({ ...f, budgeted: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowNewBudget(false)} className="flex-1 px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
            <button
              onClick={() => {
                if (!budgetForm.category.trim() || !budgetForm.budgeted) { toast.error("Category and budget amount are required"); return; }
                createBudgetLine.mutate({ category: budgetForm.category.trim(), department: budgetForm.department || undefined, fiscalYear: new Date().getFullYear(), budgeted: budgetForm.budgeted });
              }}
              disabled={createBudgetLine.isPending}
              className="flex-1 px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {createBudgetLine.isPending ? "Adding…" : "Add Line"}
            </button>
          </div>
        </div>
      </div>
    )}
  );
}
