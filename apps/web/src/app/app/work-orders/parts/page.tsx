"use client";

import { useState } from "react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Package, Plus, Search, RefreshCw, AlertTriangle,
  MapPin, Loader2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  mechanical:   "text-orange-700 bg-orange-100",
  electrical:   "text-yellow-700 bg-yellow-100",
  consumable:   "text-blue-700 bg-blue-100",
  tool:         "text-purple-700 bg-purple-100",
  spare:        "text-green-700 bg-green-100",
  safety:       "text-red-700 bg-red-100",
};

type ActionModal = { type: "issue" | "reorder" | "intake" | "create"; itemId?: string; itemName?: string };

export default function PartsInventoryPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const canView = can("work_orders", "read") || can("incidents", "read");
  const canWrite = can("work_orders", "write");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low_stock">("all");
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [qty, setQty] = useState(1);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [newItem, setNewItem] = useState({ partNumber: "", name: "", category: "spare", unit: "each", qty: 0, minQty: 5, location: "" });

  const inventoryQuery = trpc.inventory.list.useQuery(undefined, mergeTrpcQueryOpts("inventory.list", { enabled: canView }));
  const rawItems: any[] = (inventoryQuery.data as any)?.items ?? [];

  const issueStock = trpc.inventory.issueStock.useMutation({
    onSuccess: () => { toast.success("Stock issued successfully"); setModal(null); inventoryQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });
  const reorder = trpc.inventory.reorder.useMutation({
    onSuccess: () => { toast.success("Reorder request submitted"); setModal(null); inventoryQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });
  const intake = trpc.inventory.intake.useMutation({
    onSuccess: () => { toast.success("Stock intake recorded"); setModal(null); inventoryQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });
  const createItem = trpc.inventory.create.useMutation({
    onSuccess: () => { toast.success("Inventory item created"); setModal(null); inventoryQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  if (!canView) return <AccessDenied module="Parts & Inventory" />;

  const items = rawItems.filter((p) => {
    if (filter === "low_stock" && p.qty > p.minQty) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.partNumber.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const lowStockCount = rawItems.filter((p) => p.qty <= p.minQty).length;

  function openModal(type: ActionModal["type"], item?: any) {
    setModal({ type, itemId: item?.id, itemName: item?.name });
    setQty(1);
    setReference("");
    setNotes("");
  }

  function handleSubmit() {
    if (!modal) return;
    if (modal.type === "issue") {
      issueStock.mutate({ itemId: modal.itemId!, qty, reference: reference || undefined, notes: notes || undefined });
    } else if (modal.type === "reorder") {
      reorder.mutate({ itemId: modal.itemId!, qty, notes: notes || undefined });
    } else if (modal.type === "intake") {
      intake.mutate({ itemId: modal.itemId!, qty, reference: reference || undefined, notes: notes || undefined });
    } else if (modal.type === "create") {
      if (!newItem.partNumber || !newItem.name) { toast.error("Part number and name are required"); return; }
      createItem.mutate(newItem);
    }
  }

  const isPending = issueStock.isPending || reorder.isPending || intake.isPending || createItem.isPending;

  return (
    <div className="flex flex-col gap-3">
      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold capitalize">
                {modal.type === "create" ? "Add New Item" :
                 modal.type === "issue" ? `Issue Stock — ${modal.itemName}` :
                 modal.type === "reorder" ? `Reorder — ${modal.itemName}` :
                 `Stock Intake — ${modal.itemName}`}
              </h2>
              <button onClick={() => setModal(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {modal.type === "create" ? (
                <>
                  {[
                    { key: "partNumber", label: "Part Number *", type: "text" },
                    { key: "name",       label: "Description *", type: "text" },
                    { key: "location",   label: "Location",      type: "text" },
                    { key: "qty",        label: "Initial Qty",   type: "number" },
                    { key: "minQty",     label: "Min Qty",       type: "number" },
                  ].map(({ key, label, type: inputType }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                      <input
                        type={inputType}
                        value={(newItem as any)[key]}
                        onChange={(e) => setNewItem((n) => ({ ...n, [key]: inputType === "number" ? Number(e.target.value) : e.target.value }))}
                        className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Category</label>
                    <select value={newItem.category} onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value }))}
                      className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm">
                      {["spare","mechanical","electrical","consumable","tool","safety"].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Quantity *</label>
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Reference (WO / PO)</label>
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="e.g. WO-0042"
                      className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Notes</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setModal(null)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="px-4 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1.5"
              >
                {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                {modal.type === "create" ? "Create Item" :
                 modal.type === "issue" ? "Issue Stock" :
                 modal.type === "reorder" ? "Submit Reorder" :
                 "Record Intake"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Parts & Inventory</h1>
          <span className="text-[11px] text-muted-foreground">Field Service Stock</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => inventoryQuery.refetch()} className="flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition">
            <RefreshCw className="h-3 w-3" />
          </button>
          {canWrite && (
            <button
              onClick={() => openModal("create")}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Stock Intake
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total SKUs",      value: rawItems.length,           color: "text-foreground" },
          { label: "Low Stock Items", value: lowStockCount,             color: lowStockCount > 0 ? "text-red-600" : "text-green-600" },
          { label: "Locations",       value: new Set(rawItems.map((p) => (p.location ?? "").split("-")[0]).filter(Boolean)).size, color: "text-blue-600" },
          { label: "Categories",      value: new Set(rawItems.map((p) => p.category)).size, color: "text-purple-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card border border-border rounded p-3">
            <div className={cn("text-lg font-bold", kpi.color)}>{kpi.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parts…"
            className="w-full rounded border border-input bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={() => setFilter((f) => f === "all" ? "low_stock" : "all")}
          className={cn(
            "flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition",
            filter === "low_stock" ? "border-red-300 bg-red-50 text-red-700" : "border-border hover:bg-accent"
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          {filter === "low_stock" ? "Low stock only" : "All stock"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded overflow-hidden">
        {inventoryQuery.isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading inventory…</span>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {["Part #", "Description", "Category", "Qty / Min", "Location", "Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((p) => {
                const lowStock = p.qty <= p.minQty;
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{p.partNumber}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {lowStock && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                        <span className="font-medium text-foreground/90">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", CATEGORY_COLORS[p.category] ?? "bg-muted text-muted-foreground")}>
                        {p.category}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className={cn("font-semibold tabular-nums", lowStock ? "text-red-600" : "text-foreground")}>{p.qty}</span>
                        <span className="text-muted-foreground">/ {p.minQty} {p.unit}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">
                      {p.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {p.location}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canWrite && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => openModal("issue", p)}
                            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent transition"
                          >Issue</button>
                          <button
                            onClick={() => openModal("reorder", p)}
                            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent transition"
                          >Reorder</button>
                          <button
                            onClick={() => openModal("intake", p)}
                            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent transition"
                          >Intake</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    {inventoryQuery.data && rawItems.length === 0
                      ? <span>No inventory items yet. <button onClick={() => openModal("create")} className="text-primary underline">Add your first item</button></span>
                      : search ? "No parts match your search." : "No items match the current filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
