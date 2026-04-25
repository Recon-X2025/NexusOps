"use client";

import Link from "next/link";
import {
  Banknote, ShoppingCart, FileSignature, Building2,
  ChevronRight, DollarSign, Clock, AlertTriangle, Loader2,
} from "lucide-react";
import { useRBAC } from "@/lib/rbac-context";
import { AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";

function KPICard({ label, value, color, href, icon: Icon, isLoading }: {
  label: string; value: string | number; color: string; href?: string; icon: React.ElementType; isLoading?: boolean;
}) {
  const content = (
    <div className="bg-card border border-border rounded p-3 hover:shadow-sm transition-shadow cursor-pointer">
      <div className="flex items-start justify-between">
        <Icon className="w-4 h-4 text-muted-foreground/70" />
      </div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const MODULES = [
  {
    label: "Financial Management", href: "/app/financial",   icon: DollarSign,   color: "text-blue-600 bg-blue-50",
    description: "Budget management, AP/AR, chargebacks, financial reporting and forecasting.",
  },
  {
    label: "Procurement & Vendors", href: "/app/procurement", icon: ShoppingCart, color: "text-green-600 bg-green-50",
    description: "Purchase orders, vendor management, catalog-driven procurement, supplier evaluation.",
  },
  {
    label: "Contract Management",   href: "/app/contracts",  icon: FileSignature, color: "text-purple-600 bg-purple-50",
    description: "Contract lifecycle, renewals, obligation tracking, e-signature workflows.",
  },
];

export default function FinanceProcurementDashboard() {
  const { can, isAuthenticated, mergeTrpcQueryOpts } = useRBAC();

  const canProcurement = isAuthenticated && can("procurement", "read");
  const canContracts = isAuthenticated && can("contracts", "read");
  const canFinancial = isAuthenticated && can("financial", "read");

  const { data: procurementDash, isLoading: loadingProcDash } = trpc.procurement.dashboard.useQuery(
    undefined,
    mergeTrpcQueryOpts("procurement.dashboard", { enabled: canProcurement }),
  );
  const { data: purchaseOrdersList, isLoading: loadingPOs } = trpc.procurement.purchaseOrders.list.useQuery(
    undefined,
    mergeTrpcQueryOpts("procurement.purchaseOrders.list", { enabled: canProcurement }),
  );
  const { data: finExec, isLoading: loadingFinExec } = trpc.financial.executiveSummary.useQuery(
    undefined,
    mergeTrpcQueryOpts("financial.executiveSummary", { enabled: canFinancial }),
  );
  const { data: contractsPage, isLoading: loadingContracts } = trpc.contracts.list.useQuery({}, mergeTrpcQueryOpts("contracts.list", { enabled: canContracts },));
  const { data: expiringContracts, isLoading: loadingExpiring } = trpc.contracts.expiringWithin.useQuery({ days: 30 }, mergeTrpcQueryOpts("contracts.expiringWithin", { enabled: canContracts },));
  const { data: vendors, isLoading: loadingVendors } = trpc.vendors.list.useQuery({}, mergeTrpcQueryOpts("vendors.list", { enabled: canProcurement }));

  if (!can("financial", "read") && !can("procurement", "read") && !can("contracts", "read")) {
    return <AccessDenied module="Finance & Procurement" />;
  }

  const contracts = contractsPage?.items ?? [];

  const expiringArr: any[] = (expiringContracts as any) ?? [];
  const vendorItems: any[] = (vendors as any)?.items ?? (vendors as any) ?? [];

  /** PRs awaiting approval — aligns with `pr_status` / `procurement.dashboard` (pending). */
  const pendingPRApprovals = procurementDash?.pendingApprovals ?? 0;
  const activeContracts = contracts.filter((c: any) => c.status === "active" || c.status === "signed").length;

  const alerts = [
    expiringArr.length > 0
      ? { color: "bg-red-500", text: `${expiringArr.length} contract${expiringArr.length !== 1 ? "s" : ""} expiring within 30 days` }
      : null,
    pendingPRApprovals > 0
      ? { color: "bg-orange-500", text: `${pendingPRApprovals} purchase requisition${pendingPRApprovals !== 1 ? "s" : ""} pending approval` }
      : null,
    vendorItems.length > 0
      ? { color: "bg-blue-500", text: `${vendorItems.length} vendor${vendorItems.length !== 1 ? "s" : ""} in the system` }
      : null,
  ].filter(Boolean) as { color: string; text: string }[];

  const apOpen = finExec?.apOpenCount ?? 0;
  const arOpen = finExec?.arOpenCount ?? 0;
  const spendLabel =
    procurementDash?.totalSpend != null && String(procurementDash.totalSpend) !== ""
      ? `₹${Number(procurementDash.totalSpend).toLocaleString("en-IN")}`
      : "—";

  type HubModStat = { k: string; v: string; href?: string };
  const moduleStats: HubModStat[][] = [
    [
      { k: "AP open", v: loadingFinExec ? "…" : String(apOpen), href: canFinancial ? "/app/financial?tab=ap" : undefined },
      { k: "AR open", v: loadingFinExec ? "…" : String(arOpen), href: canFinancial ? "/app/financial?tab=ar" : undefined },
    ],
    [
      { k: "PR pending", v: loadingProcDash ? "…" : String(pendingPRApprovals) },
      { k: "PO spend", v: loadingProcDash ? "…" : spendLabel },
      { k: "Vendors", v: loadingVendors ? "…" : String(vendorItems.length) },
    ],
    [
      { k: "Active",    v: loadingContracts ? "…" : String(activeContracts) },
      { k: "Expiring",  v: loadingExpiring  ? "…" : String(expiringArr.length) },
    ],
  ];

  return (
    <div className="flex flex-col gap-3 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-yellow-100 flex items-center justify-center">
            <Banknote className="w-4 h-4 text-yellow-600" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Link href="/app/dashboard" className="hover:text-primary">Platform</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-foreground/70">Finance & Procurement</span>
            </div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">Finance & Procurement Dashboard</h1>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/60">3 modules · live data</span>
      </div>

      {alerts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded text-[11px] text-foreground/80">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.color}`} />
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <KPICard label="PRs Pending Approval" value={pendingPRApprovals} color="text-orange-700" icon={ShoppingCart} href="/app/procurement" isLoading={loadingProcDash} />
        <KPICard label="Contracts Expiring 30d" value={expiringArr.length} color="text-red-700" icon={FileSignature} href="/app/contracts" isLoading={loadingExpiring} />
        <KPICard label="Active Contracts" value={activeContracts} color="text-blue-700" icon={Building2} href="/app/contracts" isLoading={loadingContracts} />
        <KPICard label="Total Vendors" value={vendorItems.length} color="text-green-700" icon={Banknote} href="/app/procurement" isLoading={loadingVendors} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MODULES.map((m, idx) => {
          const Icon = m.icon;
          const statsRow = (
            <div className="flex gap-3 mt-auto pt-1 border-t border-border">
              {moduleStats[idx]?.map((s) => (
                <div key={s.k} className="text-center flex-1 min-w-0">
                  {s.href ? (
                    <Link href={s.href} className="block hover:opacity-80 rounded">
                      <div className="text-[13px] font-bold text-foreground">{s.v}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.k}</div>
                    </Link>
                  ) : (
                    <>
                      <div className="text-[13px] font-bold text-foreground">{s.v}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.k}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
          if (idx === 0) {
            return (
              <div
                key={m.label}
                className="bg-card border border-border rounded p-3 hover:shadow-sm hover:border-primary/30 transition-all flex flex-col gap-2"
              >
                <Link href={m.href} className="group flex flex-col gap-2 flex-1 min-h-0">
                  <div className="flex items-center justify-between">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-foreground">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{m.description}</div>
                  </div>
                </Link>
                {statsRow}
              </div>
            );
          }
          return (
            <Link key={m.label} href={m.href}
              className="bg-card border border-border rounded p-3 hover:shadow-sm hover:border-primary/30 transition-all group flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div>
                <div className="text-[12px] font-semibold text-foreground">{m.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{m.description}</div>
              </div>
              {statsRow}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Recent Purchase Orders */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Purchase Orders</span>
            </div>
            <Link href="/app/procurement" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loadingPOs ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <table className="ent-table w-full">
              <thead><tr><th>PO</th><th>Entity</th><th>Vendor / ref</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {(purchaseOrdersList ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-4 text-[12px]">No purchase orders found</td></tr>
                ) : (purchaseOrdersList ?? []).slice(0, 5).map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[11px] text-primary">{p.poNumber ?? p.number ?? p.id?.slice(0, 8)}</td>
                    <td className="font-mono text-[10px] text-muted-foreground">{p.legalEntityCode ?? "—"}</td>
                    <td className="max-w-[140px]"><span className="truncate block text-foreground">{p.title ?? p.notes ?? "—"}</span></td>
                    <td className="font-mono text-[11px] font-semibold text-foreground">
                      {p.totalAmount ? `₹${parseFloat(String(p.totalAmount)).toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td>
                      <span className={`status-badge text-[10px] capitalize ${p.status === "received" || p.status === "paid" || p.status === "invoiced" ? "text-green-700 bg-green-100" : p.status === "sent" || p.status === "acknowledged" || p.status === "partially_received" ? "text-orange-700 bg-orange-100" : "text-muted-foreground bg-muted"}`}>
                        {String(p.status ?? "").replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Expiring Contracts */}
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Contracts Expiring Soon</span>
            </div>
            <Link href="/app/contracts" className="text-[11px] text-primary hover:underline">All →</Link>
          </div>
          {loadingExpiring ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-border">
              {expiringArr.length === 0 ? (
                <div className="text-center text-muted-foreground py-4 text-[12px]">No contracts expiring within 30 days</div>
              ) : expiringArr.slice(0, 5).map((c: any) => (
                <div key={c.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-foreground truncate max-w-[160px]">{c.title}</span>
                    </div>
                    <span className="text-[11px] font-bold text-foreground">
                      {c.value ? `₹${parseFloat(String(c.value)).toLocaleString("en-IN")}` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/70">{c.counterparty}</span>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-orange-500" />
                      <span className="text-[10px] text-orange-600 font-medium">
                        {c.endDate ? new Date(c.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </span>
                    </div>
                  </div>
                  <span className={`status-badge text-[9px] mt-1 capitalize ${c.status === "active" ? "text-green-700 bg-green-100" : c.status === "under_review" ? "text-blue-700 bg-blue-100" : "text-orange-700 bg-orange-100"}`}>
                    {c.status?.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
