"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Database, Search, GitMerge, Server, Cpu, Wifi, Shield, Globe, Plus, RefreshCw, Cloud, X, Upload, Zap } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ServiceMap } from "./service-map";
import { BulkImportModal } from "./bulk-import-modal";

const CMDB_TABS = [
  { key: "cis",         label: "CI Browser",  module: "cmdb" as const, action: "read"  as const },
  { key: "service_map", label: "Service Map", module: "cmdb" as const, action: "read"  as const },
  { key: "discovery",   label: "Discovery",   module: "cmdb" as const, action: "admin" as const },
];

const STATUS_DOT: Record<string, string> = {
  operational: "bg-green-500",
  degraded:    "bg-yellow-400 animate-pulse",
  critical:    "bg-red-600 animate-pulse",
  maintenance: "bg-blue-400",
  retired:     "bg-slate-400",
};

const CLASS_ICON: Record<string, React.ElementType> = {
  "Linux Server":       Server,
  "Database Server":    Database,
  "Application Server": Cpu,
  "Network Switch":     Wifi,
  "Firewall":           Shield,
  "Load Balancer":      Globe,
  "Cloud Database":     Cloud,
};

export default function CMDBPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const visibleTabs = CMDB_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "cis");
  const [search, setSearch] = useState("");
  const [showAddCI, setShowAddCI] = useState(false);
  const [ciForm, setCIForm] = useState({ name: "", class: "Linux Server", location: "", ipAddress: "", status: "operational" as "operational"|"degraded"|"critical"|"maintenance"|"retired" });

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);

  const { data: cisData, refetch: refetchCIs } = trpc.assets.cmdb.list.useQuery(undefined, mergeTrpcQueryOpts("assets.cmdb.list", { refetchOnWindowFocus: false },));
  const { data: topologyData } = trpc.assets.cmdb.getTopology.useQuery(undefined, mergeTrpcQueryOpts("assets.cmdb.getTopology", { refetchOnWindowFocus: false },));

  const createCI = trpc.assets.create.useMutation({
    onSuccess: () => { toast.success("CI added to CMDB"); setShowAddCI(false); setCIForm({ name: "", class: "Linux Server", location: "", ipAddress: "", status: "operational" }); refetchCIs(); },
    onError: (e: any) => toast.error(e?.message ?? "Something went wrong"),
  });

  const [selectedCI, setSelectedCI] = useState<string | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);

  if (!can("cmdb", "read")) return <AccessDenied module="Configuration Management" />;

  const ciList = (cisData ?? []) as any[];
  const topoHasNodes = (((topologyData as any)?.nodes ?? []) as any[]).length > 0;

  const displayCIs = ciList.filter((ci: any) =>
    !search || ci.name?.toLowerCase().includes(search.toLowerCase()) || ci.class?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">CMDB — Configuration Management</h1>
          <span className="text-[11px] text-muted-foreground/70">CI Browser · Service Map · Discovery</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetchCIs(); toast.success("Discovery scan initiated — refreshing CI inventory…"); }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
            <RefreshCw className="w-3 h-3" /> Run Discovery
          </button>
          {can("cmdb", "write") && (
            <>
              <button
                onClick={() => setShowBulkImport(true)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground">
                <Upload className="w-3 h-3" /> Bulk Import
              </button>
              <button
                onClick={() => setShowAddCI(true)}
                className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
                <Plus className="w-3 h-3" /> Add CI
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total CIs",          value: ciList.length,  color: "text-foreground/80" },
          { label: "CIs Degraded/Critical", value: ciList.filter((c: any) => c.status !== "operational").length, color: "text-red-700" },
          { label: "Stale (>24h)",       value: ciList.filter((c: any) => { const d = c.lastDiscovered ?? c.lastSeen; if (!d) return false; return Date.now() - new Date(d).getTime() > 86400000; }).length, color: "text-yellow-700" },
          { label: "Discovery Sources",  value: "—",        color: "text-blue-700" },
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
        {tab === "cis" && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-card border border-border rounded">
                <Search className="w-3 h-3 text-muted-foreground/70" />
                <input type="text" placeholder="Search CIs..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="text-[11px] outline-none text-foreground/80 placeholder:text-muted-foreground/70 w-48" />
              </div>
            </div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th className="w-4" />
                  <th>CI ID</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Environment</th>
                  <th>Status</th>
                  <th>OS / Version</th>
                  <th>IP Address</th>
                  <th>Owner</th>
                  <th className="text-center">Relationships</th>
                  <th>CMDB Health</th>
                  <th>Last Discovered</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ciList.length === 0 ? (
                  <tr><td colSpan={13} className="text-center py-6 text-[11px] text-muted-foreground/50">No configuration items discovered yet</td></tr>
                ) : displayCIs.map((ci) => {
                  const Icon = CLASS_ICON[ci.class] ?? Database;
                  return (
                    <tr key={ci.id} onClick={() => setSelectedCI(selectedCI === ci.id ? null : ci.id)} className="cursor-pointer">
                      <td className="p-0"><div className={`priority-bar ${ci.status === "critical" ? "bg-red-600" : ci.status === "degraded" ? "bg-yellow-500" : "bg-green-500"}`} /></td>
                      <td className="font-mono text-[11px] text-primary">{ci.id}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[ci.status]}`} />
                          <span className="font-medium text-foreground">{ci.name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
                          <span className="status-badge text-muted-foreground bg-muted">{ci.class}</span>
                        </div>
                      </td>
                      <td><span className={`status-badge capitalize ${ci.env === "Production" ? "text-red-700 bg-red-100" : "text-muted-foreground bg-muted"}`}>{ci.env}</span></td>
                      <td><span className={`status-badge capitalize ${ci.status === "critical" ? "text-red-700 bg-red-100" : ci.status === "degraded" ? "text-yellow-700 bg-yellow-100" : "text-green-700 bg-green-100"}`}>{ci.status}</span></td>
                      <td className="text-muted-foreground text-[11px]">{ci.os}</td>
                      <td className="font-mono text-[11px] text-muted-foreground">{ci.ip}</td>
                      <td className="text-muted-foreground">{ci.owner}</td>
                      <td className="text-center">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">{ci.relationships}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${ci.cmdbHealth === 100 ? "bg-green-500" : "bg-yellow-400"}`}
                              style={{ width: `${ci.cmdbHealth}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{ci.cmdbHealth}%</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground/70 text-[11px]">{ci.lastDiscovered}</td>
                      <td className="text-center" onClick={e => e.stopPropagation()}>
                        <Link href={`/app/cmdb/impact/${ci.id}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded transition-colors">
                          <Zap className="w-2.5 h-2.5" /> Impact
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {tab === "service_map" && (
          <div className="p-4">
            <div className="text-[11px] text-muted-foreground mb-3">
              Service dependency map — interactive force-directed graph · drag nodes · click to inspect
            </div>
            {!topoHasNodes ? (
              <div className="py-12 text-center bg-muted/30 border border-border rounded">
                <GitMerge className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-[12px] text-muted-foreground/50">No topology data available yet</p>
              </div>
            ) : (
              <ServiceMap
                nodes={(topologyData as any)?.nodes ?? []}
                edges={(topologyData as any)?.edges ?? []}
              />
            )}
          </div>
        )}

        {tab === "discovery" && (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Type</th>
                <th>Source</th>
                <th>Started</th>
                <th>Duration</th>
                <th className="text-center">Discovered</th>
                <th className="text-center">Updated</th>
                <th className="text-center">New</th>
                <th className="text-center">Errors</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={10} className="text-center py-8 text-[11px] text-muted-foreground/50">No discovery runs recorded yet</td></tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Add CI Modal */}
      {showAddCI && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Add Configuration Item</h2>
              <button onClick={() => setShowAddCI(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">CI Name <span className="text-red-500">*</span></label>
              <input value={ciForm.name} onChange={(e) => setCIForm(f => ({...f, name: e.target.value}))} placeholder="e.g. prod-db-01" className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium">Class</label>
                <select value={ciForm.class} onChange={(e) => setCIForm(f => ({...f, class: e.target.value}))} className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none">
                  {["Linux Server","Windows Server","Database Server","Application Server","Network Switch","Firewall","Load Balancer","Cloud Database","Virtual Machine","Container"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium">Status</label>
                <select value={ciForm.status} onChange={(e) => setCIForm(f => ({...f, status: e.target.value as any}))} className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none">
                  {["operational","degraded","critical","maintenance","retired"].map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium">Location</label>
                <input value={ciForm.location} onChange={(e) => setCIForm(f => ({...f, location: e.target.value}))} placeholder="e.g. DC1-Rack-A3" className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium">IP Address</label>
                <input value={ciForm.ipAddress} onChange={(e) => setCIForm(f => ({...f, ipAddress: e.target.value}))} placeholder="e.g. 10.0.1.45" className="px-3 py-2 text-sm border border-border rounded bg-background focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowAddCI(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={() => { if (!ciForm.name.trim()) { toast.error("Name is required"); return; } createCI.mutate({ name: ciForm.name.trim(), class: ciForm.class, location: ciForm.location || undefined, ipAddress: ciForm.ipAddress || undefined, status: ciForm.status } as any); }}
                disabled={createCI.isPending}
                className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50">
                {createCI.isPending ? "Adding…" : "Add CI"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <BulkImportModal onClose={() => setShowBulkImport(false)} />
      )}
    </div>
  );
}
