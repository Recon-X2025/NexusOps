"use client";

import { useState, useEffect } from "react";
import { HardDrive, Plus, Search, AlertTriangle, CheckCircle2, Clock, Download, RefreshCw, Cpu, Server, Monitor, Wifi } from "lucide-react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { downloadCSV } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const HAM_TABS = [
  { key: "assets",    label: "All Assets",          module: "ham"       as const, action: "read"  as const },
  { key: "lifecycle", label: "Lifecycle",            module: "ham"       as const, action: "write" as const },
  { key: "contracts", label: "Contracts & Warranty", module: "contracts" as const, action: "read"  as const },
];

const STATUS_COLOR: Record<string, string> = {
  in_use:     "text-green-700 bg-green-100",
  in_stock:   "text-blue-700 bg-blue-100",
  in_repair:  "text-orange-700 bg-orange-100",
  retired:    "text-muted-foreground bg-muted",
  disposed:   "text-red-700 bg-red-100",
};

const TYPE_ICON: Record<string, React.ElementType> = {
  Server:           Server,
  "Network Device": Wifi,
  Laptop:           Monitor,
  Workstation:      Monitor,
  Firewall:         Cpu,
  Storage:          HardDrive,
  "Storage Array":  HardDrive,
};

export default function HAMPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const visibleTabs = HAM_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "assets");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // @ts-ignore
  const assetsQuery = trpc.assets.ham.list.useQuery({ limit: 50, search: search || undefined }, mergeTrpcQueryOpts("assets.ham.list", undefined));
  // @ts-ignore
  const assignAsset = trpc.assets.ham.assign?.useMutation?.({
    onSuccess: () => { void assetsQuery.refetch(); toast.success("Asset assigned"); },
    onError: (e: any) => { console.error("ham.assign failed:", e); toast.error(e.message || "Failed to assign asset"); },
  });

  const assetTypesQuery = trpc.assets.listTypes.useQuery(undefined, mergeTrpcQueryOpts("assets.listTypes", { staleTime: 60000 }));
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [assetForm, setAssetForm] = useState({ name: "", typeId: "", location: "", vendor: "", purchaseCost: "", purchaseDate: "" });
  const [assetMsg, setAssetMsg] = useState<string | null>(null);

  const createAsset = trpc.assets.create.useMutation({
    onSuccess: (a) => {
      setAssetMsg(`Asset ${(a as any).assetTag ?? "new"} added`);
      setShowAddAsset(false);
      setAssetForm({ name: "", typeId: "", location: "", vendor: "", purchaseCost: "", purchaseDate: "" });
      assetsQuery.refetch();
      setTimeout(() => setAssetMsg(null), 4000);
    },
    onError: (e) => { toast.error(e.message || "Failed to add asset"); },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assets: any[] = assetsQuery.data?.items ?? [];

  if (!can("ham", "read")) return <AccessDenied module="Hardware Asset Management" />;

  const expiringWarranty = assets.filter((a) => {
    if (!a.warrantyEnd) return false;
    const end = new Date(a.warrantyEnd);
    if (isNaN(end.getTime())) return false;
    const soon = new Date(Date.now() + 180 * 86400000);
    return end <= soon;
  }).length;

  const totalCost = assets.reduce((s: number, a) => s + (a.cost ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Hardware Asset Management</h1>
          <span className="text-[11px] text-muted-foreground/70">Full Lifecycle · Contracts · Warranty · Disposal</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { assetsQuery.refetch(); toast.success("Discovery initiated — refreshing asset inventory"); }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <RefreshCw className="w-3 h-3" /> Run Discovery
          </button>
          <button
            onClick={() => downloadCSV(assets.map((a: any) => ({ Tag: a.assetTag ?? a.tag ?? "", Name: a.name, Type: a.type ?? a.typeName ?? "", Status: a.status, Location: a.location ?? "", Owner: a.ownerName ?? a.ownerId ?? "Unassigned", Purchase_Cost: a.purchaseCost ?? a.cost ?? "", Warranty_End: a.warrantyEnd ? new Date(a.warrantyEnd).toLocaleDateString("en-IN") : "" })), "asset_inventory")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <button
            onClick={() => setShowAddAsset((v) => !v)}
            className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" /> {showAddAsset ? "Cancel" : "Add Asset"}
          </button>
        </div>
      </div>

      {assetMsg && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 rounded text-[12px] text-green-700 font-medium">{assetMsg}</div>
      )}
      {showAddAsset && (
        <div className="bg-card border border-primary/30 rounded p-4">
          <h3 className="text-[12px] font-semibold text-foreground mb-3">Add New Asset</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Asset Name *</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="e.g. Dell Latitude 5540" value={assetForm.name} onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Asset Type *</label>
              <select className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={assetForm.typeId} onChange={(e) => setAssetForm((f) => ({ ...f, typeId: e.target.value }))}>
                <option value="">— Select type —</option>
                {(assetTypesQuery.data ?? []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Location</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Building / Floor / Desk" value={assetForm.location} onChange={(e) => setAssetForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Vendor</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Supplier name" value={assetForm.vendor} onChange={(e) => setAssetForm((f) => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Purchase Cost (₹)</label>
              <input type="number" min="0" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="0" value={assetForm.purchaseCost} onChange={(e) => setAssetForm((f) => ({ ...f, purchaseCost: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Purchase Date</label>
              <input type="date" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={assetForm.purchaseDate} onChange={(e) => setAssetForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              disabled={!assetForm.name || !assetForm.typeId || createAsset.isPending}
              onClick={() => createAsset.mutate({ name: assetForm.name, typeId: assetForm.typeId, location: assetForm.location || undefined, vendor: assetForm.vendor || undefined, purchaseCost: assetForm.purchaseCost ? parseFloat(assetForm.purchaseCost) : undefined, purchaseDate: assetForm.purchaseDate ? new Date(assetForm.purchaseDate) : undefined })}
              className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createAsset.isPending ? "Adding…" : "Add Asset"}
            </button>
            <button onClick={() => setShowAddAsset(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Assets",         value: assets.length,                                                          color: "text-foreground/80" },
          { label: "Total Purchase Cost",  value: `₹${(totalCost / 1000).toFixed(0)}K`,                                   color: "text-blue-700" },
          { label: "Expiring Warranty",    value: expiringWarranty,                                                        color: expiringWarranty > 0 ? "text-orange-700" : "text-green-700" },
          { label: "Unassigned Assets",    value: assets.filter((a) => a.status === "in_stock").length,                   color: "text-yellow-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {expiringWarranty > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded px-3 py-2 flex items-center gap-2 text-[12px] text-orange-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>{expiringWarranty} assets</strong> have warranty expiring within 180 days. Review for renewal or replacement planning.
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 bg-card border border-border rounded flex-1 max-w-xs">
          <Search className="w-3 h-3 text-muted-foreground/70" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-[12px] outline-none flex-1 placeholder:text-muted-foreground/70"
          />
        </div>
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
        {tab === "assets" && (
          <>
            {assetsQuery.isLoading ? (
              <div className="animate-pulse p-4 space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded" />)}
              </div>
            ) : assetsQuery.isError ? (
              <div className="text-center py-8 text-muted-foreground text-[12px]">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                Failed to load assets. Please try again.
              </div>
            ) : assets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <HardDrive className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-[13px]">No assets found</p>
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Asset Tag</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Serial</th>
                    <th>Owner</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>OS / Firmware</th>
                    <th>Specs</th>
                    <th>Purchase Cost</th>
                    <th>Warranty End</th>
                    <th>Last Seen</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {assets.map((a: any) => {
                    const Icon = TYPE_ICON[a.type as string] ?? HardDrive;
                    const warrantyExpired = a.warrantyEnd ? new Date(a.warrantyEnd) < new Date() : false;
                    return (
                      <tr key={a.id} className={warrantyExpired ? "bg-orange-50/20" : ""}>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground/70 flex-shrink-0" />
                            <span className="font-mono text-[11px] text-primary">{a.tag ?? a.id}</span>
                          </div>
                        </td>
                        <td className="font-medium text-foreground">{a.name}</td>
                        <td><span className="status-badge text-muted-foreground bg-muted">{a.type}</span></td>
                        <td className="font-mono text-[11px] text-muted-foreground">{a.serial ?? "—"}</td>
                        <td className="text-muted-foreground">{a.owner ?? a.ownerId ?? "Unassigned"}</td>
                        <td className="text-muted-foreground text-[11px]">{a.location ?? "—"}</td>
                        <td><span className={`status-badge capitalize ${STATUS_COLOR[a.status as string] ?? "text-muted-foreground bg-muted"}`}>{(a.status as string)?.replace(/_/g, " ") ?? "—"}</span></td>
                        <td className="text-muted-foreground text-[11px]">{a.os ?? "—"}</td>
                        <td className="text-[11px] text-muted-foreground">{a.cpuCores ? `${a.cpuCores}c ` : ""}{a.ram ?? ""}{a.storage ? ` · ${a.storage}` : ""}</td>
                        <td className="font-mono text-[11px] text-foreground/80">{a.cost ? `$${(a.cost as number).toLocaleString()}` : "—"}</td>
                        <td className={`text-[11px] ${warrantyExpired ? "text-red-600 font-semibold" : a.warrantyEnd && new Date(a.warrantyEnd) < new Date(Date.now() + 180 * 86400000) ? "text-orange-500 font-semibold" : "text-muted-foreground"}`}>
                          {a.warrantyEnd ?? "—"}{warrantyExpired ? " ⚠" : ""}
                        </td>
                        <td className="text-muted-foreground/70 text-[11px]">{a.lastSeen ?? "—"}</td>
                        <td>
                          {a.status === "in_stock" && (
                            <button
                              className="px-2 py-0.5 text-[10px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
                              onClick={() => assignAsset?.mutate?.({ assetId: a.id })}
                            >
                              Assign
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === "lifecycle" && (
          <div className="p-4 grid grid-cols-5 gap-3">
            {[
              { stage: "In Stock",          count: assets.filter((a) => a.status === "in_stock").length,   color: "bg-blue-100 text-blue-700",    border: "border-blue-200" },
              { stage: "Deployed",          count: assets.filter((a) => a.status === "in_use").length,     color: "bg-green-100 text-green-700",  border: "border-green-200" },
              { stage: "In Repair",         count: assets.filter((a) => a.status === "in_repair").length,  color: "bg-orange-100 text-orange-700", border: "border-orange-200" },
              { stage: "Awaiting Disposal", count: assets.filter((a) => a.status === "retired").length,    color: "bg-yellow-100 text-yellow-700", border: "border-yellow-200" },
              { stage: "Disposed / EOL",    count: assets.filter((a) => a.status === "disposed").length,   color: "bg-muted text-muted-foreground",    border: "border-border" },
            ].map((s) => (
              <div key={s.stage} className={`border rounded p-3 text-center ${s.border}`}>
                <div className={`text-3xl font-bold mb-1 ${s.color.split(" ")[1]}`}>{s.count}</div>
                <div className="text-[11px] text-muted-foreground font-medium">{s.stage}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "contracts" && (
          <div className="p-4 text-center text-muted-foreground text-[12px]">
            <p className="mb-3">Hardware contracts, vendor SLAs, maintenance agreements, and renewal tracking.</p>
            <p className="text-[11px] text-muted-foreground/70">Integrated with Vendor Management module</p>
          </div>
        )}
      </div>
    </div>
  );
}
