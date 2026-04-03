"use client";

import { useState, useEffect } from "react";
import { Building2, Plus, Star, AlertTriangle, X } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const TIER_COLOR: Record<string, string> = {
  Strategic: "text-purple-700 bg-purple-100",
  Critical:  "text-red-700 bg-red-100",
  Preferred: "text-blue-700 bg-blue-100",
  Managed:   "text-muted-foreground bg-muted",
};

const STATUS_COLOR: Record<string, string> = {
  active:           "text-green-700 bg-green-100",
  under_review:     "text-yellow-700 bg-yellow-100",
  at_risk:          "text-red-700 bg-red-100",
  inactive:         "text-muted-foreground bg-muted",
  renewal_due:      "text-orange-700 bg-orange-100",
  pending_decision: "text-yellow-700 bg-yellow-100",
};

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${value >= 90 ? "bg-green-500" : value >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[11px] font-bold ${value >= 90 ? "text-green-700" : value >= 70 ? "text-yellow-600" : "text-red-600"}`}>{value}%</span>
    </div>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}><div className="h-3 bg-muted animate-pulse rounded" /></td>
      ))}
    </tr>
  );
}

const VENDOR_TABS = [
  { key: "vendors",   label: "Vendors",   module: "vendors"   as const, action: "read" as const },
  { key: "contracts", label: "Contracts", module: "contracts" as const, action: "read" as const },
];

export default function VendorsPage() {
  const { can } = useRBAC();
  const router = useRouter();
  const visibleTabs = VENDOR_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "vendors");
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [vendorForm, setVendorForm] = useState({ name: "", contactEmail: "", contactPhone: "", address: "", paymentTerms: "", notes: "" });

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // @ts-ignore
  const vendorsQuery = trpc.vendors.list.useQuery({ limit: 50 });
  // @ts-ignore
  const contractsQuery = trpc.contracts.list.useQuery({ limit: 50 });
  // @ts-ignore
  const createVendorMutation = trpc.vendors.create.useMutation({
    onSuccess: () => {
      vendorsQuery.refetch();
      toast.success("Vendor created");
      setShowAddVendor(false);
      setVendorForm({ name: "", contactEmail: "", contactPhone: "", address: "", paymentTerms: "", notes: "" });
    },
    onError: (e: any) => { toast.error(e.message || "Failed to create vendor"); },
  });

  if (!can("vendors", "read") && !can("contracts", "read")) return <AccessDenied module="Vendor Management" />;

  const vendors = vendorsQuery.data?.items ?? [];
  const contracts = contractsQuery.data?.items ?? [];
  const totalSpend = vendors.reduce((s: number, v: any) => s + (v.spend ?? v.annualSpend ?? 0), 0);
  const atRisk = vendors.filter((v: any) => v.status === "at_risk" || v.status === "under_review").length;

  return (
    <div className="flex flex-col gap-3">

      {/* Add Vendor Modal */}
      {showAddVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold">Add Vendor</h3>
              <button onClick={() => setShowAddVendor(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Vendor Name *</label>
                <input autoFocus className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background" value={vendorForm.name} onChange={(e) => setVendorForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Contact Email</label>
                <input type="email" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background" value={vendorForm.contactEmail} onChange={(e) => setVendorForm(f => ({ ...f, contactEmail: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Contact Phone</label>
                <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background" value={vendorForm.contactPhone} onChange={(e) => setVendorForm(f => ({ ...f, contactPhone: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Address</label>
                <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background" value={vendorForm.address} onChange={(e) => setVendorForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Payment Terms</label>
                <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background" placeholder="e.g. Net 30" value={vendorForm.paymentTerms} onChange={(e) => setVendorForm(f => ({ ...f, paymentTerms: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Notes</label>
                <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background" value={vendorForm.notes} onChange={(e) => setVendorForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                disabled={!vendorForm.name || createVendorMutation.isPending}
                onClick={() => createVendorMutation.mutate({ name: vendorForm.name, contactEmail: vendorForm.contactEmail || undefined, contactPhone: vendorForm.contactPhone || undefined, address: vendorForm.address || undefined, paymentTerms: vendorForm.paymentTerms || undefined, notes: vendorForm.notes || undefined } as any)}
                className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {createVendorMutation.isPending ? "Creating…" : "Create Vendor"}
              </button>
              <button onClick={() => setShowAddVendor(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent ml-auto">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Vendor & Supplier Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Vendor Register · Contracts · SLA · Performance</span>
        </div>
        <button
          onClick={() => setShowAddVendor(true)}
          className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" /> Add Vendor
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Vendor Spend",  value: `₹${(totalSpend / 1000000).toFixed(1)}M`, color: "text-foreground/80" },
          { label: "Active Vendors",      value: vendors.filter((v: any) => v.status === "active").length, color: "text-green-700" },
          { label: "At Risk / Review",    value: atRisk, color: atRisk > 0 ? "text-red-700" : "text-green-700" },
          { label: "Contracts Expiring (90d)", value: contracts.filter((c: any) => c.endDate && new Date(c.endDate) < new Date(Date.now() + 90*86400000)).length, color: "text-orange-700" },
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
        {tab === "vendors" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Vendor</th>
                <th>Category</th>
                <th>Tier</th>
                <th>Annual Spend</th>
                <th className="text-center">Contracts</th>
                <th className="text-center">Open Issues</th>
                <th>SLA Score</th>
                <th className="text-center">CSAT</th>
                <th>Status</th>
                <th>Renewal</th>
              </tr>
            </thead>
            <tbody>
              {vendorsQuery.isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={11} />)
                : vendors.length === 0
                ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-muted-foreground/70 text-[12px]">
                      No vendors found.
                    </td>
                  </tr>
                )
                : vendors.map((v: any) => (
                  <tr key={v.id} className={v.status === "at_risk" ? "bg-red-50/30" : v.status === "under_review" ? "bg-yellow-50/20" : ""}>
                    <td className="p-0"><div className={`priority-bar ${v.status === "at_risk" ? "bg-red-600" : v.status === "under_review" ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                    <td>
                      <div>
                        <div className="font-medium text-foreground">{v.name}</div>
                        <div className="text-[10px] text-muted-foreground/70">{Array.isArray(v.contacts) ? v.contacts[0] : (v.primaryContact ?? "")}</div>
                      </div>
                    </td>
                    <td><span className="status-badge text-muted-foreground bg-muted">{v.category}</span></td>
                    <td><span className={`status-badge ${TIER_COLOR[v.tier] ?? "text-muted-foreground bg-muted"}`}>{v.tier}</span></td>
                    <td className="font-mono text-[11px] text-foreground/80">${((v.spend ?? v.annualSpend ?? 0) / 1000).toFixed(0)}K</td>
                    <td className="text-center text-muted-foreground">{v.contracts ?? v.contractCount ?? 0}</td>
                    <td className="text-center">{(v.activeIssues ?? 0) > 0 ? <span className="text-red-700 font-bold">{v.activeIssues}</span> : <span className="text-green-600">0</span>}</td>
                    <td><ScoreBar value={v.slaScore ?? 0} /></td>
                    <td className="text-center">
                      <div className="flex items-center gap-0.5 justify-center">
                        {Array.from({length:5}).map((_,i) => (
                          <Star key={i} className={`w-3 h-3 ${i < Math.round(v.csat ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-slate-200"}`} />
                        ))}
                        <span className="text-[10px] text-muted-foreground ml-0.5">{v.csat ?? 0}</span>
                      </div>
                    </td>
                    <td><span className={`status-badge capitalize ${STATUS_COLOR[v.status] ?? "text-muted-foreground bg-muted"}`}>{(v.status ?? "").replace(/_/g," ")}</span></td>
                    <td className={`text-[11px] ${v.renewalDate && new Date(v.renewalDate) < new Date(Date.now() + 90*86400000) ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>{v.renewalDate ?? "—"}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        )}

        {tab === "contracts" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Contract ID</th>
                <th>Vendor</th>
                <th>Type</th>
                <th>Value</th>
                <th>Start</th>
                <th>End</th>
                <th>Auto-Renew</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contractsQuery.isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={9} />)
                : contracts.length === 0
                ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground/70 text-[12px]">
                      No contracts found.
                    </td>
                  </tr>
                )
                : (contracts as any[]).map((c) => {
                  const endDate = c.endDate ?? c.end ?? null;
                  const startDate = c.startDate ?? c.start ?? null;
                  const autoRenew = c.autoRenew ?? false;
                  const value = Number(c.value ?? c.totalValue ?? 0);
                  return (
                    <tr key={c.id}>
                      <td className="font-mono text-[11px] text-primary">{c.contractNumber ?? c.id?.slice(-10).toUpperCase()}</td>
                      <td className="font-medium text-foreground">{c.vendorId ? `Vendor …${c.vendorId.slice(-6)}` : (c.vendor ?? "—")}</td>
                      <td className="text-muted-foreground">{c.type ?? c.contractType ?? "—"}</td>
                      <td className="font-mono text-[11px] text-foreground/80">{value > 0 ? `₹${(value/1000).toFixed(0)}K` : "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{startDate ? new Date(startDate).toISOString().split("T")[0] : "—"}</td>
                      <td className={`text-[11px] ${endDate && new Date(endDate) < new Date(Date.now() + 90*86400000) ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>
                        {endDate ? new Date(endDate).toISOString().split("T")[0] : "—"}
                      </td>
                      <td>{autoRenew ? <span className="text-green-700 text-[11px]">✓ Auto</span> : <span className="text-muted-foreground/70 text-[11px]">Manual</span>}</td>
                      <td>
                        <span className={`status-badge capitalize ${STATUS_COLOR[c.status ?? "active"] ?? "text-muted-foreground bg-muted"}`}>
                          {(c.status ?? "active").replace(/_/g," ")}
                        </span>
                      </td>
                      <td><button onClick={() => router.push(`/app/procurement?tab=vendors&id=${v.id ?? ""}`)} className="text-[11px] text-primary hover:underline">View</button></td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
