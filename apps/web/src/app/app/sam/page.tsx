"use client";

import { useState, useEffect } from "react";
import { Key, AlertTriangle, CheckCircle2, Clock, Plus, Download, Search, TrendingDown, TrendingUp, RefreshCw } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const SAM_TABS = [
  { key: "dashboard",    label: "License Dashboard",   module: "sam" as const, action: "read"  as const },
  { key: "software",     label: "Software Catalog",    module: "sam" as const, action: "read"  as const },
  { key: "compliance",   label: "Compliance Position", module: "sam" as const, action: "read"  as const },
  { key: "optimization", label: "Optimization",        module: "sam" as const, action: "write" as const },
];

const COMPLIANCE_COLOR: Record<string, string> = {
  compliant:      "text-green-700 bg-green-100",
  non_compliant:  "text-red-700 bg-red-100 font-semibold",
  under_licensed: "text-orange-700 bg-orange-100",
  over_licensed:  "text-yellow-700 bg-yellow-100",
};

export default function SAMPage() {
  const { can } = useRBAC();
  const visibleTabs = SAM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  if (!can("sam", "read")) return <AccessDenied module="Software Asset Management" />;

  // @ts-ignore
  const licensesQuery = trpc.assets.sam.licenses.list.useQuery({ limit: 100, search: search || undefined });
  // @ts-ignore
  const assignLicense = trpc.assets.sam.licenses.assign?.useMutation?.({
    onSuccess: () => { void licensesQuery.refetch(); toast.success("License assigned"); },
    onError: (e: any) => { console.error("sam.licenses.assign failed:", e); toast.error(e.message || "Failed to assign license"); },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const licenses: any[] = licensesQuery.data ?? [];

  const filteredLicenses = licenses.filter((l) =>
    !search ||
    (l.software ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.vendor ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const nonCompliant = licenses.filter((l) => l.compliance === "non_compliant");
  const totalCost = licenses.reduce((s: number, l) => s + (l.cost ?? 0), 0);
  const overageCount = licenses.filter((l) => (l.overage ?? 0) > 0).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Software Asset Management</h1>
          <span className="text-[11px] text-muted-foreground/70">License Compliance · Usage · Optimization</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <RefreshCw className="w-3 h-3" /> Sync Discovery
          </button>
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <Download className="w-3 h-3" /> Export
          </button>
          <button className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
            <Plus className="w-3 h-3" /> Add License
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Annual License Cost",   value: `$${(totalCost / 1000).toFixed(0)}K`,         color: "text-foreground/80" },
          { label: "Non-Compliant Titles",  value: nonCompliant.length,                           color: "text-red-700" },
          { label: "Titles With Overage",   value: overageCount,                                  color: "text-orange-700" },
          { label: "Potential Savings",     value: `$${(potentialSavings / 1000).toFixed(0)}K`,   color: "text-green-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {nonCompliant.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2 text-[12px] text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>{nonCompliant.length} software titles</strong> are out of license compliance and require immediate remediation: {nonCompliant.map((l) => l.software).join(", ")}
        </div>
      )}

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
        {(tab === "dashboard" || tab === "software" || tab === "compliance") && (
          <>
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
              <Search className="w-3 h-3 text-muted-foreground/70" />
              <input
                type="text"
                placeholder="Search software or vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-[12px] outline-none flex-1 placeholder:text-muted-foreground/70 bg-transparent"
              />
            </div>
            {licensesQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
              </div>
            ) : licensesQuery.isError ? (
              <div className="text-center py-8 text-muted-foreground text-[12px]">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                Failed to load licenses. Please try again.
              </div>
            ) : filteredLicenses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Key className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-[13px]">No licenses found</p>
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>Software</th>
                    <th>Vendor</th>
                    <th>Type</th>
                    <th className="text-center">Purchased</th>
                    <th className="text-center">Deployed</th>
                    <th className="text-center">Available</th>
                    <th className="text-center">Overage</th>
                    <th className="text-center">Unused</th>
                    <th>Annual Cost</th>
                    <th>Renewal</th>
                    <th>Compliance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {filteredLicenses.map((l: any) => (
                    <tr key={l.id} className={l.compliance === "non_compliant" ? "bg-red-50/30" : ""}>
                      <td className="p-0"><div className={`priority-bar ${l.compliance === "non_compliant" ? "bg-red-600" : (l.unused ?? 0) > 30 ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                      <td className="font-medium text-foreground">{l.software}</td>
                      <td className="text-muted-foreground">{l.vendor}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{l.type}</span></td>
                      <td className="text-center font-mono text-foreground/80">{l.purchased ?? 0}</td>
                      <td className="text-center font-mono text-foreground/80">{l.deployed ?? 0}</td>
                      <td className="text-center font-mono text-green-700">{l.available ?? 0}</td>
                      <td className="text-center">{(l.overage ?? 0) > 0 ? <span className="font-bold text-red-700">+{l.overage}</span> : <span className="text-muted-foreground/70">—</span>}</td>
                      <td className="text-center">{(l.unused ?? 0) > 0 ? <span className={(l.unused ?? 0) > 20 ? "text-yellow-600 font-semibold" : "text-muted-foreground"}>{l.unused}</span> : "—"}</td>
                      <td className="font-mono text-[11px] text-foreground/80">{l.cost ? `$${(l.cost as number).toLocaleString()}` : "—"}</td>
                      <td className={`text-[11px] ${l.renewalDate && new Date(l.renewalDate) < new Date(Date.now() + 90 * 86400000) ? "text-orange-600 font-semibold" : "text-muted-foreground"}`}>{l.renewalDate ?? "—"}</td>
                      <td><span className={`status-badge capitalize ${COMPLIANCE_COLOR[l.compliance as string] ?? "text-muted-foreground bg-muted"}`}>{(l.compliance as string)?.replace(/_/g, " ") ?? "—"}</span></td>
                      <td>
                        <button
                          className="px-2 py-0.5 text-[10px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
                          onClick={() => assignLicense?.mutate?.({ licenseId: l.id } as any)}
                        >
                          Assign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "optimization" && (
          <div className="p-8 text-center">
            <TrendingDown className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">No optimization recommendations available yet</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Recommendations will appear after license discovery data is collected</p>
          </div>
        )}
      </div>
    </div>
  );
}
