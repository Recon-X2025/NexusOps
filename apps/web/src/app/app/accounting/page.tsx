"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import {
  BookOpen, Plus, RefreshCw, Download, Loader2, ChevronRight,
  BarChart3, Scale, FileSpreadsheet, Receipt, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied, PermissionGate } from "@/lib/rbac-context";
import { EmptyState, TableSkeleton, Pagination } from "@nexusops/ui";
import { cn } from "@/lib/utils";

type Tab = "coa" | "journal" | "trial_balance" | "pnl" | "gstr";

const TABS = [
  { key: "coa" as Tab,           label: "Chart of Accounts", icon: BookOpen },
  { key: "journal" as Tab,       label: "Journal Entries",   icon: FileSpreadsheet },
  { key: "trial_balance" as Tab, label: "Trial Balance",     icon: Scale },
  { key: "pnl" as Tab,           label: "P&L Statement",     icon: BarChart3 },
  { key: "gstr" as Tab,          label: "GSTR Generation",   icon: Receipt },
];

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset:           "text-blue-700 bg-blue-100",
  liability:       "text-red-700 bg-red-100",
  equity:          "text-purple-700 bg-purple-100",
  income:          "text-green-700 bg-green-100",
  expense:         "text-orange-700 bg-orange-100",
  contra_asset:    "text-blue-600 bg-blue-50",
  contra_liability:"text-red-600 bg-red-50",
};

function fmtInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

// ── Chart of Accounts Tab ─────────────────────────────────────────────────
function CoaTab() {
  const { can } = useRBAC();
  const canWrite = can("financial", "write");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "asset" as const, subType: "", description: "", currency: "INR", openingBalance: "0" });

  const utils  = trpc.useUtils();
  const coaQ   = trpc.accounting.coa.list.useQuery({ activeOnly: false });
  const seedMut = trpc.accounting.coa.seed.useMutation({ onSuccess: (d) => { toast.success(`Seeded ${(d as any).seeded} India COA accounts`); void utils.accounting.coa.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const createMut = trpc.accounting.coa.create.useMutation({ onSuccess: () => { toast.success("Account created"); setShowNew(false); void utils.accounting.coa.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });

  const accounts = (coaQ.data ?? []) as any[];
  const filtered = accounts.filter(a => {
    if (filterType && a.type !== filterType) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts…" className="px-3 py-1.5 text-[12px] border border-border rounded bg-background outline-none focus:ring-1 focus:ring-primary/30 flex-1 max-w-64" />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none">
          <option value="">All Types</option>
          {["asset","liability","equity","income","expense"].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
        </select>
        {canWrite && <>
          <button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-50">{seedMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Seed India COA</button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"><Plus className="w-3 h-3" /> Add Account</button>
        </>}
      </div>

      {coaQ.isLoading ? <TableSkeleton rows={10} cols={5} /> : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No accounts" description="Seed the India standard Chart of Accounts or add manually." action={canWrite ? <button onClick={() => seedMut.mutate()} className="px-3 py-1.5 bg-primary text-white text-[12px] rounded">Seed India COA</button> : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 border-b border-border">
              <tr>{["Code", "Account Name", "Type", "Sub-Type", "Current Balance", "Status"].map(h => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((a: any) => (
                <tr key={a.id} className="bg-card hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{a.code}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{a.name}</td>
                  <td className="px-3 py-2"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${ACCOUNT_TYPE_COLORS[a.type] ?? ""}`}>{a.type}</span></td>
                  <td className="px-3 py-2 text-muted-foreground capitalize text-[11px]">{(a.subType ?? "—").replace(/_/g, " ")}</td>
                  <td className={`px-3 py-2 font-mono font-semibold ${Number(a.currentBalance) >= 0 ? "text-foreground" : "text-red-600"}`}>{fmtInr(Number(a.currentBalance))}</td>
                  <td className="px-3 py-2"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${a.isActive ? "text-green-700 bg-green-100" : "text-muted-foreground bg-muted"}`}>{a.isActive ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-sm font-semibold mb-4">New Account</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Code *</label><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="1100" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div className="col-span-1"><label className="text-[11px] font-medium text-muted-foreground block mb-1">Account Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Bank — HDFC" className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none focus:ring-1 focus:ring-primary/50" /></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Type</label><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className="w-full px-3 py-2 text-[12px] border border-border rounded bg-background outline-none">{["asset","liability","equity","income","expense"].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}</select></div>
              <div><label className="text-[11px] font-medium text-muted-foreground block mb-1">Opening Balance (₹)</label><input type="number" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
              <div className="col-span-2"><label className="text-[11px] font-medium text-muted-foreground block mb-1">Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 text-[12px] border border-border rounded outline-none" /></div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-[12px] border border-border rounded hover:bg-muted/50">Cancel</button>
              <button disabled={!form.code || !form.name || createMut.isPending} onClick={() => createMut.mutate({ ...form, openingBalance: parseFloat(form.openingBalance || "0") })} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded disabled:opacity-50">
                {createMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Journal Entries Tab ────────────────────────────────────────────────────
function JournalTab() {
  const { can } = useRBAC();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const journalQ = trpc.accounting.journal.list.useQuery({ limit: 200 });
  const utils = trpc.useUtils();
  const postMut = trpc.accounting.journal.post.useMutation({ onSuccess: () => { toast.success("Journal entry posted"); void utils.accounting.journal.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });
  const reverseMut = trpc.accounting.journal.reverse.useMutation({ onSuccess: () => { toast.success("Entry reversed"); void utils.accounting.journal.list.invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Failed") });

  const entries = ((journalQ.data as any)?.items ?? []) as any[];
  const pageItems = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      {journalQ.isLoading ? <TableSkeleton rows={8} cols={6} /> : entries.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No journal entries" description="Journal entries are auto-created from invoices, payroll runs, and payments. You can also create manual entries." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>{["Number", "Date", "Description", "Debit", "Credit", "Status", "Actions"].map(h => <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((je: any) => (
                  <tr key={je.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{je.number}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{new Date(je.date).toLocaleDateString("en-IN")}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground max-w-[200px] truncate">{je.description}</td>
                    <td className="px-3 py-2.5 font-mono text-foreground">{fmtInr(Number(je.totalDebit))}</td>
                    <td className="px-3 py-2.5 font-mono text-foreground">{fmtInr(Number(je.totalCredit))}</td>
                    <td className="px-3 py-2.5"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${je.status === "posted" ? "text-green-700 bg-green-100" : je.status === "reversed" ? "text-muted-foreground bg-muted" : "text-yellow-700 bg-yellow-100"}`}>{je.status}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {je.status === "draft" && can("financial", "write") && <button onClick={() => postMut.mutate({ id: je.id })} className="px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded hover:bg-green-200">Post</button>}
                        {je.status === "posted" && can("financial", "write") && <button onClick={() => reverseMut.mutate({ id: je.id })} className="px-2 py-0.5 text-[10px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200">Reverse</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} totalItems={entries.length} pageSize={PAGE_SIZE} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}

// ── Trial Balance Tab ──────────────────────────────────────────────────────
function TrialBalanceTab() {
  const tbQ = trpc.accounting.trialBalance.useQuery({});
  const data = tbQ.data as any;

  return tbQ.isLoading ? <TableSkeleton rows={10} cols={4} /> : !data ? null : (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] ${data.isBalanced ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
        {data.isBalanced ? "✓ Trial balance is balanced" : `⚠ Trial balance is out of balance by ${fmtInr(Math.abs(data.totalDebit - data.totalCredit))}`}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/40 border-b border-border">
            <tr>{["Code", "Account Name", "Type", "Debit (₹)", "Credit (₹)"].map(h => <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider ${h.includes("₹") ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data.lines as any[]).filter((l: any) => l.debit !== 0 || l.credit !== 0).map((line: any) => (
              <tr key={line.id} className="bg-card hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{line.code}</td>
                <td className="px-3 py-2 font-medium text-foreground">{line.name}</td>
                <td className="px-3 py-2"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${ACCOUNT_TYPE_COLORS[line.type] ?? ""}`}>{line.type}</span></td>
                <td className="px-3 py-2 text-right font-mono text-foreground">{line.debit > 0 ? fmtInr(line.debit) : "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-foreground">{line.credit > 0 ? fmtInr(line.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/60 border-t border-border font-bold">
            <tr>
              <td colSpan={3} className="px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase">Totals</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtInr(data.totalDebit)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtInr(data.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── P&L Tab ────────────────────────────────────────────────────────────────
function PnLTab() {
  const pnlQ = trpc.accounting.incomeStatement.useQuery({});
  const data = pnlQ.data as any;

  return pnlQ.isLoading ? <TableSkeleton rows={8} cols={2} /> : !data ? null : (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className={`text-center py-4 rounded-lg border-2 ${data.netProfit >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
        <div className={`text-2xl font-bold ${data.netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>{fmtInr(data.netProfit)}</div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">{data.netProfit >= 0 ? "Net Profit" : "Net Loss"}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Income</h3>
          {(data.income as any[]).map((a: any) => (
            <div key={a.id} className="flex justify-between text-[12px] py-1 border-b border-border/50 last:border-0">
              <span className="text-muted-foreground">{a.name}</span>
              <span className="font-mono font-medium text-green-700">{fmtInr(Math.abs(Number(a.currentBalance)))}</span>
            </div>
          ))}
          <div className="flex justify-between text-[12px] pt-2 font-bold">
            <span>Total Income</span><span className="font-mono text-green-700">{fmtInr(data.totalIncome)}</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Expenses</h3>
          {(data.expenses as any[]).map((a: any) => (
            <div key={a.id} className="flex justify-between text-[12px] py-1 border-b border-border/50 last:border-0">
              <span className="text-muted-foreground">{a.name}</span>
              <span className="font-mono font-medium text-red-700">{fmtInr(Math.abs(Number(a.currentBalance)))}</span>
            </div>
          ))}
          <div className="flex justify-between text-[12px] pt-2 font-bold">
            <span>Total Expenses</span><span className="font-mono text-red-700">{fmtInr(data.totalExpenses)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GSTR Tab ───────────────────────────────────────────────────────────────
function GSTRTab() {
  const [gstinId, setGstinId] = useState("");
  const [formType, setFormType] = useState<"GSTR-1" | "GSTR-3B">("GSTR-1");
  const [month, setMonth]       = useState(new Date().getMonth() + 1);
  const [year, setYear]         = useState(new Date().getFullYear());
  const [generated, setGenerated] = useState<any>(null);

  const gstinQ   = trpc.accounting.gstin.list.useQuery();
  const gstins   = (gstinQ.data ?? []) as any[];

  const gstr1Q   = trpc.accounting.gstr.generateGSTR1.useQuery({ gstinId, month, year }, { enabled: false });
  const gstr3bQ  = trpc.accounting.gstr.generateGSTR3B.useQuery({ gstinId, month, year }, { enabled: false });

  async function generate() {
    if (!gstinId) { toast.error("Select a GSTIN first"); return; }
    const result = formType === "GSTR-1" ? await gstr1Q.refetch() : await gstr3bQ.refetch();
    if (result.data) setGenerated(result.data);
  }

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={gstinId} onChange={e => setGstinId(e.target.value)} className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none min-w-[200px]">
          <option value="">Select GSTIN…</option>
          {gstins.map((g: any) => <option key={g.id} value={g.id}>{g.gstin} — {g.legalName}</option>)}
        </select>
        <select value={formType} onChange={e => setFormType(e.target.value as any)} className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none">
          <option value="GSTR-1">GSTR-1 (Outward Supplies)</option>
          <option value="GSTR-3B">GSTR-3B (Summary Return)</option>
        </select>
        <select value={month} onChange={e => setMonth(+e.target.value)} className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none">
          {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(+e.target.value)} className="px-2 py-1.5 text-[12px] border border-border rounded bg-background text-foreground outline-none">
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={generate} disabled={!gstinId || gstr1Q.isFetching || gstr3bQ.isFetching} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] rounded hover:bg-primary/90 disabled:opacity-50">
          {(gstr1Q.isFetching || gstr3bQ.isFetching) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />}
          Generate {formType}
        </button>
        {generated && (
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(generated.payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `${formType}-${months[month - 1]}-${year}.json`; a.click();
          }} className="flex items-center gap-1 px-2 py-1.5 text-[12px] border border-border rounded hover:bg-muted/30 text-muted-foreground"><Download className="w-3 h-3" /> Download JSON</button>
        )}
      </div>

      {generated && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-3">{formType} — {months[month - 1]} {year} · GSTIN: {generated.gstin}</h3>
          {formType === "GSTR-1" ? (
            <div className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-foreground">{generated.invoiceCount}</span> invoices compiled into GSTR-1 payload.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: "Output IGST", v: fmtInr(generated.summary.outputIGST) },
                { l: "Output CGST", v: fmtInr(generated.summary.outputCGST) },
                { l: "Output SGST", v: fmtInr(generated.summary.outputSGST) },
                { l: "Total Output Tax", v: fmtInr(generated.summary.totalOutputTax) },
                { l: "Total ITC", v: fmtInr(0) },
                { l: "Net Payable", v: fmtInr(generated.summary.netPayable) },
              ].map(k => <div key={k.l} className="bg-muted/40 rounded p-2"><div className="text-[11px] text-muted-foreground">{k.l}</div><div className="font-mono font-semibold text-foreground text-[13px]">{k.v}</div></div>)}
            </div>
          )}
          <details className="mt-3">
            <summary className="text-[11px] text-primary cursor-pointer hover:underline">View raw JSON payload</summary>
            <pre className="mt-2 text-[10px] bg-muted p-3 rounded overflow-auto max-h-80">{JSON.stringify(generated.payload, null, 2)}</pre>
          </details>
        </div>
      )}

      {gstins.length === 0 && (
        <EmptyState icon={Building2} title="No GSTINs registered" description="Add your GSTIN(s) under Organisation Settings → Financial → GSTIN Registry to generate GSTR returns." />
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AccountingPage() {
  const { can } = useRBAC();
  const [tab, setTab] = useState<Tab>("coa");

  if (!can("financial", "read")) return <AccessDenied module="Accounting" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Accounting</h1>
          <span className="text-[11px] text-muted-foreground/70">COA · Journal Entries · Trial Balance · P&L · GSTR</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors", tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "coa"           && <CoaTab />}
      {tab === "journal"       && <JournalTab />}
      {tab === "trial_balance" && <TrialBalanceTab />}
      {tab === "pnl"           && <PnLTab />}
      {tab === "gstr"          && <GSTRTab />}
    </div>
  );
}
