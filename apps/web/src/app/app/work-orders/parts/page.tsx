"use client";

import { useState } from "react";
import Link from "next/link";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Package, Plus, Search, RefreshCw, Wrench, AlertTriangle,
  CheckCircle2, ArrowUpDown, Download, Upload, Loader2, Hash,
  MapPin, Tag, ChevronRight,
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

export default function PartsInventoryPage() {
  const { can } = useRBAC();
  const canView = can("work_orders", "read") || can("incidents", "read");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low_stock">("all");

  // @ts-ignore – inventory router may not yet be typed
  const inventoryQuery = trpc.inventory?.list?.useQuery?.(undefined, { enabled: canView });
  const rawItems: any[] = Array.isArray(inventoryQuery?.data) ? inventoryQuery.data : (inventoryQuery?.data as any)?.items ?? [];

  if (!canView) return <AccessDenied module="Parts & Inventory" />;

  const items = rawItems.filter((p) => {
    if (filter === "low_stock" && p.qty > p.minQty) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const lowStockCount = rawItems.filter((p) => p.qty <= p.minQty).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Parts & Inventory</h1>
          <span className="text-[11px] text-muted-foreground">Field Service Stock</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => inventoryQuery?.refetch?.()} className="flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition">
            <RefreshCw className="h-3 w-3" />
          </button>
          {can("work_orders", "write") && (
            <button onClick={() => toast.info("Stock intake form coming soon")} className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition">
              <Plus className="h-3.5 w-3.5" />
              Stock Intake
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total SKUs",      value: rawItems.length,           color: "text-foreground" },
          { label: "Low Stock Items", value: lowStockCount,             color: lowStockCount > 0 ? "text-red-600" : "text-green-600" },
          { label: "Locations",       value: new Set(rawItems.map((p) => p.location.split("-")[0])).size, color: "text-blue-600" },
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
        <table className="w-full text-xs">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {["Part ID", "Description", "Category", "Qty / Min", "Location", "Last Used", ""].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((p) => {
              const lowStock = p.qty <= p.minQty;
              return (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{p.id}</td>
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
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {p.location}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.lastUsed}</td>
                  <td className="px-3 py-2">
                    {can("work_orders", "write") && (
                      <div className="flex gap-1">
                        <button onClick={() => toast.info(`Issue stock: ${p.id}`)} className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent transition">Issue</button>
                        <button onClick={() => toast.info(`Reorder: ${p.id}`)} className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent transition">Reorder</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  {search ? "No parts match your search." : "No inventory items."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
