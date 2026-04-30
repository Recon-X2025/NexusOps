"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import {
  ShoppingCart, Plus, Download, CheckCircle2,
  XCircle, Clock, AlertTriangle, Package,
  FileText, Send, Loader2,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { downloadCSV, cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid } from "@/components/ui/detail-grid";

const PROC_TABS = [
  { key: "dashboard",    label: "Dashboard",             module: "procurement"    as const, action: "read"  as const },
  { key: "requisitions", label: "Purchase Requisitions", module: "procurement"    as const, action: "read"  as const },
  { key: "orders",       label: "Purchase Orders",       module: "purchase_orders"as const, action: "read"  as const },
  { key: "receiving",    label: "Goods Receipt",         module: "inventory"      as const, action: "read"  as const },
  { key: "inventory",    label: "Inventory / Parts",     module: "inventory"      as const, action: "read"  as const },
  { key: "catalog",      label: "Parts Catalog",         module: "catalog"        as const, action: "read"  as const },
  { key: "reorder",      label: "Reorder Policies",      module: "inventory"      as const, action: "admin" as const },
];

// PRState covers both DB values and legacy mock values
type PRState = "draft" | "pending" | "submitted" | "pending_approval" | "approved" | "rejected" | "ordered" | "received" | "closed" | "fulfilled" | "cancelled";
// POState covers both DB values and legacy mock values
type POState = "draft" | "sent" | "acknowledged" | "partially_received" | "received" | "invoiced" | "paid" | "pending_approval" | "approved" | "sent_to_supplier" | "fully_received" | "cancelled" | "disputed";
type POPriority = "routine" | "urgent" | "emergency";

// DB PR statuses: draft | pending | approved | rejected | ordered | received | closed
// Extended to also cover legacy mock statuses for backward compat
const PR_STATE_CFG: Record<string, { label: string; color: string }> = {
  draft:           { label: "Draft",            color: "text-muted-foreground bg-muted" },
  pending:         { label: "Pending Approval", color: "text-yellow-700 bg-yellow-100" },
  submitted:       { label: "Submitted",        color: "text-blue-700 bg-blue-100" },
  pending_approval:{ label: "Pending Approval", color: "text-yellow-700 bg-yellow-100" },
  approved:        { label: "Approved",         color: "text-green-700 bg-green-100" },
  rejected:        { label: "Rejected",         color: "text-red-700 bg-red-100" },
  ordered:         { label: "PO Raised",        color: "text-indigo-700 bg-indigo-100" },
  received:        { label: "Received",         color: "text-green-700 bg-green-100" },
  closed:          { label: "Closed",           color: "text-muted-foreground/70 bg-muted" },
  fulfilled:       { label: "Fulfilled",        color: "text-green-700 bg-green-100" },
  cancelled:       { label: "Cancelled",        color: "text-muted-foreground/70 bg-muted" },
};

// DB PO statuses: draft | sent | acknowledged | partially_received | received | invoiced | paid | cancelled
// Extended to cover legacy mock statuses for backward compat
const PO_STATE_CFG: Record<string, { label: string; color: string }> = {
  draft:               { label: "Draft",              color: "text-muted-foreground bg-muted" },
  pending_approval:    { label: "Pending Approval",   color: "text-yellow-700 bg-yellow-100" },
  approved:            { label: "Approved",           color: "text-blue-700 bg-blue-100" },
  sent:                { label: "Sent to Supplier",   color: "text-indigo-700 bg-indigo-100" },
  sent_to_supplier:    { label: "Sent to Supplier",   color: "text-indigo-700 bg-indigo-100" },
  acknowledged:        { label: "Acknowledged",       color: "text-blue-700 bg-blue-100" },
  partially_received:  { label: "Partial Receipt",    color: "text-orange-700 bg-orange-100" },
  received:            { label: "Fully Received",     color: "text-green-700 bg-green-100" },
  fully_received:      { label: "Fully Received",     color: "text-green-700 bg-green-100" },
  invoiced:            { label: "Invoiced",           color: "text-purple-700 bg-purple-100" },
  paid:                { label: "Paid",               color: "text-green-700 bg-green-100" },
  cancelled:           { label: "Cancelled",          color: "text-muted-foreground/70 bg-muted" },
  disputed:            { label: "Disputed",           color: "text-red-700 bg-red-100" },
};

const PRIORITY_COLOR: Record<POPriority, string> = {
  routine:   "text-green-700 bg-green-100",
  urgent:    "text-orange-700 bg-orange-100",
  emergency: "text-red-700 bg-red-100",
};

const INV_STATUS_CFG: Record<string, { label: string; color: string; bar: string }> = {
  in_stock:     { label: "In Stock",     color: "text-green-700 bg-green-100",  bar: "bg-green-500" },
  low_stock:    { label: "Low Stock",    color: "text-yellow-700 bg-yellow-100",bar: "bg-yellow-500" },
  out_of_stock: { label: "Out of Stock", color: "text-red-700 bg-red-100",      bar: "bg-red-500" },
  on_order:     { label: "On Order",     color: "text-blue-700 bg-blue-100",    bar: "bg-blue-500" },
};


export default function ProcurementPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const visibleTabs = PROC_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [expandedPR, setExpandedPR] = useState<string | null>(null);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  const { data: prData, isLoading: prLoading, refetch: refetchPRs } = trpc.procurement.purchaseRequests.list.useQuery({}, mergeTrpcQueryOpts("procurement.purchaseRequests.list", { refetchOnWindowFocus: false },));
  const { data: poData, isLoading: poLoading, refetch: refetchPOs } = trpc.procurement.purchaseOrders.list.useQuery(undefined, mergeTrpcQueryOpts("procurement.purchaseOrders.list", { refetchOnWindowFocus: false },));
  const { data: vendorsData } = trpc.procurement.vendors.list.useQuery(undefined, mergeTrpcQueryOpts("procurement.vendors.list", { refetchOnWindowFocus: false },));
  const { data: invData, isLoading: invLoading, refetch: refetchInv } = trpc.inventory.list.useQuery({}, mergeTrpcQueryOpts("inventory.list", { enabled: tab === "inventory" || tab === "catalog" }));
  const { data: policiesData, refetch: refetchPolicies } = trpc.inventory.listPolicies.useQuery(undefined, mergeTrpcQueryOpts("inventory.listPolicies", { enabled: tab === "reorder" }));
  
  const { data: legalEntityOptions } = trpc.procurement.legalEntityOptions.useQuery(
    undefined,
    mergeTrpcQueryOpts("procurement.legalEntityOptions", { refetchOnWindowFocus: false }),
  );

  const approvePR  = trpc.procurement.purchaseRequests.approve.useMutation({ onSuccess: () => refetchPRs(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const rejectPR   = trpc.procurement.purchaseRequests.reject.useMutation({ onSuccess: () => refetchPRs(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const createPOFromPR   = trpc.procurement.purchaseOrders.createFromPR.useMutation({ onSuccess: () => { refetchPRs(); refetchPOs(); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const createDirectPO = trpc.procurement.purchaseOrders.create.useMutation({ onSuccess: () => { refetchPOs(); setShowNewPO(false); toast.success("Purchase Order created"); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  
  const createInventoryItem = trpc.inventory.create.useMutation({ onSuccess: () => { refetchInv(); setShowNewItem(false); toast.success("Item added to catalog"); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const createPolicy = trpc.inventory.createPolicy.useMutation({ onSuccess: () => { refetchPolicies(); setShowNewPolicy(false); toast.success("Reorder policy created"); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const recordIntake = trpc.inventory.intake.useMutation({ onSuccess: () => { refetchInv(); setShowIntake(false); toast.success("Stock intake recorded"); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });

  const [rejectingPR, setRejectingPR]  = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [creatingPO, setCreatingPO]    = useState<string | null>(null);
  const [poVendorId, setPOVendorId]    = useState("");
  const [poLegalEntityId, setPoLegalEntityId] = useState("");

  const [showNewPR, setShowNewPR] = useState(false);
  const [showNewPO, setShowNewPO] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [showIntake, setShowIntake] = useState(false);

  const [prForm, setPrForm] = useState({ title: "", justification: "", priority: "medium", department: "", itemDesc: "", itemQty: "1", itemPrice: "" });
  const [poForm, setPoForm] = useState({ vendorId: "", notes: "", expectedDelivery: "", items: [{ desc: "", qty: "1", price: "" }] });
  const [invForm, setInvForm] = useState({ partNumber: "", name: "", description: "", category: "spare", unit: "each", qty: "0", minQty: "5", unitCost: "" });
  const [policyForm, setPolicyForm] = useState({ itemId: "", thresholdQty: "5", reorderQty: "20", isAutomated: false });
  const [intakeForm, setIntakeForm] = useState({ itemId: "", qty: "1", reference: "", notes: "" });

  const [prMsg, setPrMsg] = useState<string | null>(null);

  const createPR = trpc.procurement.purchaseRequests.create.useMutation({
    onSuccess: (pr) => {
      setPrMsg(`Requisition ${pr.number} created`);
      setShowNewPR(false);
      setPrForm({ title: "", justification: "", priority: "medium", department: "", itemDesc: "", itemQty: "1", itemPrice: "" });
      refetchPRs();
      setTimeout(() => setPrMsg(null), 4000);
    },
    onError: (err: any) => toast.error(err?.message ?? "Something went wrong"),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requisitions = (prData ?? []) as any[];

  const sendPO   = trpc.procurement.purchaseOrders.send.useMutation({ onSuccess: () => refetchPOs(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const receivePO = trpc.procurement.purchaseOrders.markReceived.useMutation({ onSuccess: () => refetchPOs(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });

  if (!can("procurement", "read")) return <AccessDenied module="Procurement" />;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchaseOrders = (poData ?? []) as any[];

  // DB: totalAmount is a decimal string; status uses DB enum values
  const totalPOValue = purchaseOrders.reduce((s, po) => s + Number(po.totalAmount ?? 0), 0);
  const pendingApproval = purchaseOrders.filter((po) =>
    po.status === "draft" || po.status === "sent"
  ).length;
  const lowStock = 0;
  // DB PR statuses: "draft" | "pending" | "approved" | "rejected" | "ordered" | "received" | "closed"
  const openPRs = requisitions.filter((r) => !["received","closed","rejected"].includes(r.status ?? "")).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Supply Chain & Procurement"
        subtitle="Requisitions · Purchase Orders · Goods Receipt · Inventory"
        icon={ShoppingCart}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCSV(purchaseOrders.map((p: any) => ({
                PO_Number: p.poNumber ?? p.number,
                Legal_entity: p.legalEntityCode ?? "",
                Vendor: p.vendorName ?? p.vendorId ?? "",
                Status: p.status,
                Total: p.totalAmount ?? "",
                Tax: p.gstAmount ?? "",
                Created: new Date(p.createdAt).toLocaleDateString("en-IN"),
              })), "purchase_orders")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 text-muted-foreground"
            >
              <Download className="w-4 h-4" /> Export
            </button>
            <PermissionGate module="procurement" action="write">
              <button
                onClick={() => setShowNewPR((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-primary/20 bg-primary/5 text-primary text-sm font-medium rounded-lg hover:bg-primary/10"
              >
                <Plus className="w-4 h-4" /> {showNewPR ? "Cancel" : "New Requisition"}
              </button>
            </PermissionGate>
            <PermissionGate module="purchase_orders" action="write">
              <button
                onClick={() => setShowNewPO((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 shadow-sm"
              >
                <Plus className="w-4 h-4" /> {showNewPO ? "Cancel" : "New Purchase Order"}
              </button>
            </PermissionGate>
          </div>
        }
      />

      {prMsg && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium animate-in fade-in slide-in-from-top-4">
          {prMsg}
        </div>
      )}

      {showNewPR && (
        <div className="bg-card border border-primary/20 rounded-xl p-6 shadow-sm animate-in zoom-in-95 duration-200">
          <h3 className="text-sm font-bold text-foreground mb-4">New Purchase Requisition</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Title *</label>
              <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="What do you need?" value={prForm.title} onChange={(e) => setPrForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Priority</label>
              <select className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={prForm.priority} onChange={(e) => setPrForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Department</label>
              <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="IT / HR / Finance…" value={prForm.department} onChange={(e) => setPrForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Justification</label>
              <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="Business reason…" value={prForm.justification} onChange={(e) => setPrForm((f) => ({ ...f, justification: e.target.value }))} />
            </div>
            <div className="md:col-span-3 border-t border-border pt-4 mt-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Item Details</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Description *</label>
                  <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="Item name" value={prForm.itemDesc} onChange={(e) => setPrForm((f) => ({ ...f, itemDesc: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Qty</label>
                  <input type="number" min="1" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={prForm.itemQty} onChange={(e) => setPrForm((f) => ({ ...f, itemQty: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Unit Price (₹)</label>
                  <input type="number" min="0" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="0.00" value={prForm.itemPrice} onChange={(e) => setPrForm((f) => ({ ...f, itemPrice: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowNewPR(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-all">Cancel</button>
            <button
              disabled={!prForm.title || !prForm.itemDesc || createPR.isPending}
              onClick={() => createPR.mutate({ title: prForm.title, justification: prForm.justification || undefined, priority: prForm.priority as any, department: prForm.department || undefined, items: [{ description: prForm.itemDesc, quantity: parseInt(prForm.itemQty) || 1, unitPrice: parseFloat(prForm.itemPrice) || 0 }] })}
              className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md"
            >
              {createPR.isPending ? "Submitting…" : "Submit Requisition"}
            </button>
          </div>
        </div>
      )}

      {showNewPO && (
        <div className="bg-card border border-primary/20 rounded-xl p-6 shadow-md animate-in zoom-in-95 duration-200">
          <h3 className="text-sm font-bold text-foreground mb-4">Direct Purchase Order</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Vendor *</label>
              <select 
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                value={poForm.vendorId} 
                onChange={(e) => setPoForm((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">Select Vendor</option>
                {((vendorsData as any[]) ?? []).map((v: any) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Expected Delivery</label>
              <input 
                type="date" 
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 outline-none" 
                value={poForm.expectedDelivery} 
                onChange={(e) => setPoForm((f) => ({ ...f, expectedDelivery: e.target.value }))} 
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Item Details</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input 
                  className="md:col-span-1 text-sm border border-border rounded-lg px-3 py-2 bg-background" 
                  placeholder="Description" 
                  value={poForm.items[0]?.desc} 
                  onChange={(e) => {
                    const newItems = [...poForm.items];
                    newItems[0]!.desc = e.target.value;
                    setPoForm({...poForm, items: newItems});
                  }}
                />
                <input 
                  type="number" 
                  className="text-sm border border-border rounded-lg px-3 py-2 bg-background" 
                  placeholder="Qty" 
                  value={poForm.items[0]?.qty}
                  onChange={(e) => {
                    const newItems = [...poForm.items];
                    newItems[0]!.qty = e.target.value;
                    setPoForm({...poForm, items: newItems});
                  }}
                />
                <input 
                  type="number" 
                  className="text-sm border border-border rounded-lg px-3 py-2 bg-background" 
                  placeholder="Price" 
                  value={poForm.items[0]?.price}
                  onChange={(e) => {
                    const newItems = [...poForm.items];
                    newItems[0]!.price = e.target.value;
                    setPoForm({...poForm, items: newItems});
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowNewPO(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-all">Cancel</button>
            <button
              disabled={!poForm.vendorId || !poForm.items[0]?.desc || createDirectPO.isPending}
              onClick={() => {
                const total = Number(poForm.items[0]!.qty) * Number(poForm.items[0]!.price);
                createDirectPO.mutate({
                  vendorId: poForm.vendorId,
                  totalAmount: total,
                  notes: "Direct PO",
                  expectedDelivery: poForm.expectedDelivery ? new Date(poForm.expectedDelivery) : undefined,
                  items: [{ description: poForm.items[0]!.desc, quantity: Number(poForm.items[0]!.qty), unitPrice: Number(poForm.items[0]!.price) }]
                });
              }}
              className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 shadow-md"
            >
              {createDirectPO.isPending ? "Creating…" : "Create Purchase Order"}
            </button>
          </div>
        </div>
      )}

      <DetailGrid
        items={[
          { label: "Open Purchase Orders", value: purchaseOrders.filter(po => !["received","invoiced","paid","cancelled"].includes(po.status ?? "")).length, icon: Package, className: "text-blue-700" },
          { label: "Total PO Value", value: `₹${(totalPOValue / 1000).toFixed(0)}K`, icon: ShoppingCart },
          { label: "Pending Approval", value: pendingApproval, icon: Clock, className: pendingApproval > 0 ? "text-orange-700" : "text-green-700" },
          { label: "Open Requisitions", value: openPRs, icon: FileText, className: "text-blue-700" },
          { label: "Low Stock Items", value: lowStock, icon: AlertTriangle, className: lowStock > 0 ? "text-red-700" : "text-green-700" },
        ]}
      />

      {lowStock > 0 && (
        <div className="px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3 text-sm text-orange-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <strong>{lowStock} inventory items</strong> are low stock or out of stock.
          </div>
        </div>
      )}

      <div className="flex border-b border-border gap-6">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "pb-3 text-sm font-bold uppercase tracking-widest border-b-2 transition-all",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-b overflow-hidden">
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Spend by Category (MTD)</div>
              <div className="p-3 space-y-2">
                {[
                  { cat: "Hardware / Servers",    value: 55500 },
                  { cat: "Software / Licenses",   value: 108120 },
                  { cat: "Hardware / Power",       value: 8400 },
                  { cat: "Network / Wireless",     value: 28800 },
                  { cat: "Software / Security",    value: 62000 },
                  { cat: "Office / Facilities",    value: 21110 },
                ].map((row) => {
                  const max = 108120;
                  return (
                    <div key={row.cat} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground w-36 flex-shrink-0 truncate">{row.cat}</span>
                      <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(row.value / max) * 100}%` }} />
                      </div>
                      <span className="text-foreground/80 font-mono w-16 text-right">₹${(row.value / 100000).toFixed(0)}L</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border border-border rounded overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Approval Pipeline Status</div>
              <div className="p-3 space-y-2">
                {[
                  { label: "Draft Requisitions",      count: requisitions.filter(r => r.status === "draft").length,                                    color: "bg-slate-400" },
                  { label: "Awaiting Approval",       count: requisitions.filter(r => r.status === "pending").length,                                  color: "bg-yellow-400" },
                  { label: "Approved → PO Creation",  count: requisitions.filter(r => r.status === "approved").length,                                  color: "bg-blue-500" },
                  { label: "PO Raised",               count: purchaseOrders.filter(po => ["sent","acknowledged"].includes(po.status ?? "")).length,      color: "bg-indigo-500" },
                  { label: "Awaiting Delivery",       count: purchaseOrders.filter(po => ["sent","partially_received"].includes(po.status ?? "")).length, color: "bg-orange-400" },
                  { label: "Fulfilled",               count: purchaseOrders.filter(po => ["received","invoiced","paid"].includes(po.status ?? "")).length, color: "bg-green-500" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${row.color}`} />
                    <span className="text-muted-foreground flex-1">{row.label}</span>
                    <span className="font-bold text-foreground">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border rounded overflow-hidden col-span-2">
              <div className="px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pending Actions</div>
              <div className="divide-y divide-border">
                {/* DB doesn't return approvalChain in the flat PO list; show POs in draft/sent status as needing action */}
                {purchaseOrders.filter(po => po.status === "draft" || po.status === "sent").map((po) => (
                  <div key={po.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-orange-50/30">
                    <div className="flex items-center gap-3">
                      <span className="text-orange-500"><Clock className="w-4 h-4" /></span>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-[11px] text-primary">{po.poNumber ?? po.id}</span>
                          <span className={`status-badge ${PRIORITY_COLOR["routine"]}`}>routine</span>
                        </div>
                        <p className="text-[12px] text-foreground">{po.notes ?? "Purchase Order"}</p>
                        <p className="text-[11px] text-muted-foreground">Status: <strong>{po.status}</strong></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-muted-foreground">₹${Number(po.totalAmount ?? 0).toLocaleString("en-IN")}</span>
                      <PermissionGate module="purchase_orders" action="approve">
                        <button
                          disabled={approvePR.isPending}
                          onClick={() => approvePR.mutate({ id: po.id })}
                          className="px-2 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200 disabled:opacity-50"
                        >{approvePR.isPending ? "…" : "Approve"}</button>
                        <button
                          disabled={rejectPR.isPending}
                          onClick={() => rejectPR.mutate({ id: po.id })}
                          className="px-2 py-1 bg-red-100 text-red-700 text-[11px] rounded hover:bg-red-200 disabled:opacity-50"
                        >{rejectPR.isPending ? "…" : "Reject"}</button>
                      </PermissionGate>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* REQUISITIONS */}
        {tab === "requisitions" && (
          prLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading requisitions…</span>
            </div>
          ) : requisitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <FileText className="w-5 h-5 opacity-30" />
              <span className="text-xs">No purchase requisitions found.</span>
            </div>
          ) : (
            <div>
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th className="w-4" />
                    <th>PR Number</th>
                    <th>Title</th>
                    <th>Requested By</th>
                    <th>Category</th>
                    <th className="text-center">Items</th>
                    <th>Estimate</th>
                    <th>Priority</th>
                    <th>State</th>
                    <th>Needed By</th>
                    <th>Budget Code</th>
                    <th>Linked PO</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map((pr) => {
                    // DB fields: number, title, requesterId, totalAmount (string), status, priority, department, budgetCode
                    const prState = (pr.status ?? "draft") as PRState;
                    const prPriority = (pr.priority ?? "routine") as POPriority;
                    const sCfg = PR_STATE_CFG[prState] ?? PR_STATE_CFG.draft!;
                    const isExpanded = expandedPR === pr.id;
                    return (
                      <Fragment key={pr.id}>
                        <tr className={cn("hover:bg-muted/10 transition-colors cursor-pointer group", isExpanded ? "bg-blue-50/40" : "")}
                          onClick={() => router.push(`/app/procurement/requisitions/${pr.id}`)}>
                          <td className="p-0"><div className={`priority-bar ${prPriority === "emergency" ? "bg-red-600" : prPriority === "urgent" ? "bg-orange-500" : "bg-green-500"}`} /></td>
                          <td className="font-mono text-[11px] text-primary group-hover:underline">{pr.number ?? pr.id}</td>
                          <td className="max-w-xs"><span className="truncate block font-medium text-foreground">{pr.title ?? "—"}</span></td>
                          <td className="text-muted-foreground">{pr.requesterId ? `…${pr.requesterId.slice(-6)}` : "—"}</td>
                          <td><span className="status-badge text-muted-foreground bg-muted">{pr.department ?? "—"}</span></td>
                          <td className="text-center text-muted-foreground">—</td>
                          <td className="font-mono text-[11px] text-foreground/80 font-bold">₹${Number(pr.totalAmount ?? 0).toLocaleString("en-IN")}</td>
                          <td><span className={`status-badge capitalize ${PRIORITY_COLOR[prPriority]}`}>{prPriority}</span></td>
                          <td><span className={`status-badge ${sCfg?.color ?? ""}`}>{sCfg?.label ?? prState}</span></td>
                          <td className="text-[11px] text-muted-foreground">—</td>
                          <td className="font-mono text-[10px] text-muted-foreground/70">{pr.budgetCode ?? "—"}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {prState === "approved"
                              ? <button onClick={() => { setExpandedPR(pr.id); setCreatingPO(pr.id); }} className="text-[11px] text-primary hover:underline font-bold">+ PO</button>
                              : <button onClick={() => router.push(`/app/procurement/requisitions/${pr.id}`)} className="text-[11px] text-primary hover:underline font-bold">Details</button>
                            }
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${pr.id}-exp`}>
                            <td />
                            <td colSpan={11} className="px-4 py-3 bg-blue-50/50">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Business Justification</p>
                                  <p className="text-[12px] text-foreground/80 leading-relaxed">{pr.justification ?? "—"}</p>
                                  {pr.currentApproverId && (
                                    <p className="text-[11px] text-muted-foreground mt-2">
                                      Approver: <strong>{`…${pr.currentApproverId.slice(-6)}`}</strong>
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2">
                                  <div className="text-[11px] text-muted-foreground">
                                    <span className="text-muted-foreground/70">Department:</span> {pr.department ?? "—"}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    <span className="text-muted-foreground/70">Budget Code:</span> <code className="font-mono">{pr.budgetCode ?? "—"}</code>
                                  </div>
                                  <div className="flex gap-2 mt-2">
                                    <PermissionGate module="procurement" action="approve">
                                      {prState === "pending" && (
                                        <>
                                          <button
                                            disabled={approvePR.isPending}
                                            onClick={() => approvePR.mutate({ id: pr.id })}
                                            className="px-3 py-1 bg-green-100 text-green-700 text-[11px] rounded hover:bg-green-200 disabled:opacity-50"
                                          >{approvePR.isPending ? "…" : "Approve"}</button>
                                          <button
                                            onClick={() => setRejectingPR(rejectingPR === pr.id ? null : pr.id)}
                                            className="px-3 py-1 bg-red-100 text-red-700 text-[11px] rounded hover:bg-red-200"
                                          >{rejectingPR === pr.id ? "Cancel" : "Reject"}</button>
                                        </>
                                      )}
                                    </PermissionGate>
                                    {prState === "approved" && (
                                      <button
                                        onClick={() => setCreatingPO(creatingPO === pr.id ? null : pr.id)}
                                        className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
                                      >
                                        <Plus className="w-3 h-3 inline mr-1" />{creatingPO === pr.id ? "Cancel" : "Create Purchase Order"}
                                      </button>
                                    )}
                                  </div>
                                  {rejectingPR === pr.id && (
                                    <div className="flex items-end gap-2 mt-2">
                                      <input className="border border-border rounded px-2 py-1 text-[11px] flex-1" placeholder="Rejection reason (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                                      <button
                                        disabled={rejectPR.isPending}
                                        onClick={() => rejectPR.mutate({ id: pr.id, reason: rejectReason || undefined })}
                                        className="px-2 py-1 bg-red-600 text-white text-[11px] rounded hover:bg-red-700 disabled:opacity-50"
                                      >{rejectPR.isPending ? "…" : "Confirm Reject"}</button>
                                    </div>
                                  )}
                                  {creatingPO === pr.id && (
                                    <div className="flex flex-col gap-2 mt-2">
                                      <div className="flex flex-wrap items-end gap-2">
                                        <select className="border border-border rounded px-2 py-1 text-[11px]" value={poVendorId} onChange={(e) => setPOVendorId(e.target.value)}>
                                          <option value="">Select Vendor *</option>
                                          {((vendorsData as any[]) ?? []).map((v: any) => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                          ))}
                                        </select>
                                        <select
                                          className="border border-border rounded px-2 py-1 text-[11px] max-w-[14rem]"
                                          value={poLegalEntityId}
                                          onChange={(e) => setPoLegalEntityId(e.target.value)}
                                          title="Optional legal entity for this PO"
                                        >
                                          <option value="">Legal entity (optional)</option>
                                          {(legalEntityOptions ?? []).map((e: { id: string; code: string; name: string }) => (
                                            <option key={e.id} value={e.id}>{e.code} — {e.name}</option>
                                          ))}
                                        </select>
                                        <button
                                          disabled={!poVendorId || createPOFromPR.isPending}
                                          onClick={() =>
                                            createPOFromPR.mutate({
                                              prId: pr.id,
                                              vendorId: poVendorId,
                                              legalEntityId: poLegalEntityId || undefined,
                                            })}
                                          className="px-2 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
                                        >
                                          {createPOFromPR.isPending ? "…" : "Create PO"}
                                        </button>
                                        {createPOFromPR.isError && <span className="text-[11px] text-red-600">{(createPOFromPR.error as any)?.message}</span>}
                                      </div>
                                      <p className="text-[10px] text-muted-foreground">
                                        Manage entities under{" "}
                                        <Link href="/app/admin" className="text-primary hover:underline">Admin → Legal entities</Link>.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* PURCHASE ORDERS */}
        {tab === "orders" && (
          poLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Loading purchase orders…</span>
            </div>
          ) : purchaseOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground">
              <Package className="w-5 h-5 opacity-30" />
              <span className="text-xs">No purchase orders found.</span>
            </div>
          ) : (
          <div>
            {purchaseOrders.map((po) => {
              // DB fields: poNumber, vendorId, totalAmount (decimal str), status, currency, notes, createdAt, expectedDelivery
              const poState = (po.status ?? "draft") as POState;
              const sCfg = PO_STATE_CFG[poState] ?? PO_STATE_CFG.draft!;
              const isExpanded = expandedPO === po.id;
              const deliveryDate = po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().split("T")[0] : "—";
              const isLate = po.expectedDelivery && new Date(po.expectedDelivery) < new Date() && !["received","invoiced","paid","cancelled"].includes(po.status ?? "");

              return (
                <div key={po.id} className="border-b border-border last:border-0">
                  <div
                    className={cn("flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 group", isExpanded ? "bg-blue-50/30" : "")}
                    onClick={() => router.push(`/app/procurement/orders/${po.id}`)}
                  >
                    <div className="w-1 self-stretch rounded-full flex-shrink-0 bg-green-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-[11px] text-primary group-hover:underline">{po.poNumber ?? po.id}</span>
                            <span className={`status-badge ${sCfg?.color ?? ""}`}>{sCfg?.label ?? poState}</span>
                            {isLate && <span className="status-badge text-red-700 bg-red-100 font-bold">⚠ Overdue</span>}
                          </div>
                          <p className="text-[13px] font-bold text-foreground">{po.notes ?? "Purchase Order"}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Vendor: <strong>{po.vendorName || `ID: …${po.vendorId?.slice(-8)}`}</strong>
                            {po.legalEntityCode ? (
                              <> · Legal entity: <strong className="font-mono">{po.legalEntityCode}</strong></>
                            ) : null}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[15px] font-black text-foreground font-mono">{po.currency ?? "INR"} {Number(po.totalAmount ?? 0).toLocaleString("en-IN")}</div>
                          <div className={`text-[11px] mt-0.5 ${isLate ? "text-red-600 font-semibold" : "text-muted-foreground/70"}`}>Due: {deliveryDate}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-4 bg-muted/20 border-t border-dashed border-slate-200">
                      <div className="grid grid-cols-3 gap-4 mt-3 mb-4">
                        {[
                          { label: "PO Number",    value: po.poNumber ?? po.id },
                          { label: "Vendor ID",    value: po.vendorId ?? "—" },
                          { label: "Legal entity", value: po.legalEntityCode ? `${po.legalEntityCode} (${po.legalEntityName ?? "—"})` : "—" },
                          { label: "Currency",     value: po.currency ?? "INR" },
                          { label: "Total Amount", value: `${po.currency ?? "INR"} ${Number(po.totalAmount ?? 0).toLocaleString("en-IN")}` },
                          { label: "Created",      value: po.createdAt ? new Date(po.createdAt).toISOString().split("T")[0] : "—" },
                          { label: "Expected",     value: deliveryDate },
                        ].map((f) => (
                          <div key={f.label} className="text-[11px]">
                            <span className="text-muted-foreground/70">{f.label}: </span>
                            <span className="text-foreground/80 font-medium">{f.value}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[12px] text-muted-foreground italic mb-3">Line items not available in list view.</p>
                      <div className="flex gap-2">
                        {(poState === "sent" || poState === "partially_received") && (
                          <button
                            disabled={receivePO.isPending}
                            onClick={() => receivePO.mutate({ id: po.id })}
                            className="px-3 py-1 bg-blue-100 text-blue-700 text-[11px] rounded hover:bg-blue-200 disabled:opacity-50"
                          >
                            <Package className="w-3 h-3 inline mr-1" />{receivePO.isPending ? "…" : "Record Goods Receipt"}
                          </button>
                        )}
                        {poState === "draft" && (
                          <button
                            disabled={sendPO.isPending}
                            onClick={() => sendPO.mutate({ id: po.id })}
                            className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
                          >
                            <Send className="w-3 h-3 inline mr-1" />{sendPO.isPending ? "Sending…" : "Send to Supplier"}
                          </button>
                        )}
                        <button
                          onClick={() => { window.print(); }}
                          className="px-3 py-1 border border-border text-[11px] rounded hover:bg-muted/30 text-muted-foreground"
                        >
                          <FileText className="w-3 h-3 inline mr-1" />Print PO
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )
        )}

        {/* GOODS RECEIPT */}
        {tab === "receiving" && (
          <div className="p-4">
            <div className="text-[11px] text-muted-foreground mb-3">Record goods receipt against open POs. Partial receipt supported.</div>
            <table className="ent-table w-full">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Description</th>
                  <th>Vendor</th>
                  <th>Expected</th>
                  <th>State</th>
                  <th>Line Items</th>
                  <th>Received %</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.filter(po => ["sent","partially_received","received"].includes(po.status ?? "")).map((po) => {
                  // DB: no lineItems in list view — derive received % from status
                  const poStatus = po.status ?? "draft";
                  const pct = poStatus === "received" ? 100 : poStatus === "partially_received" ? 50 : 0;
                  const sCfg = PO_STATE_CFG[poStatus] ?? PO_STATE_CFG.draft!;
                  const deliveryDate = po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().split("T")[0] : "—";
                  return (
                    <tr key={po.id}>
                      <td className="font-mono text-[11px] text-primary">{po.poNumber ?? po.id}</td>
                      <td className="font-medium text-foreground">{po.notes ?? "—"}</td>
                      <td className="text-muted-foreground">{po.vendorId ? `…${po.vendorId.slice(-8)}` : "—"}</td>
                      <td className="text-muted-foreground text-[11px]">{deliveryDate}</td>
                      <td><span className={`status-badge ${sCfg?.color ?? ""}`}>{sCfg?.label ?? poStatus}</span></td>
                      <td className="text-center text-muted-foreground">—</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : pct > 0 ? "bg-blue-400" : "bg-border"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td>
                        {poStatus !== "received" && (
                          <PermissionGate module="procurement" action="write">
                            <button
                              disabled={receivePO.isPending}
                              onClick={() => receivePO.mutate({ id: po.id })}
                              className="px-2 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
                            >
                              <Package className="w-3 h-3 inline mr-1" />{receivePO.isPending ? "…" : "Record Receipt"}
                            </button>
                          </PermissionGate>
                        )}
                        {poStatus === "received" && <span className="text-green-600 text-[11px]">✓ Complete</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* INVENTORY */}
        {tab === "inventory" && (
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Current Stock Levels</div>
              <button onClick={() => setShowNewItem(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] font-bold rounded hover:bg-primary/90">
                <Plus className="w-3 h-3" /> New Inventory Item
              </button>
            </div>
            {invLoading ? (
              <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto opacity-20" /></div>
            ) : (invData?.items.length ?? 0) === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs italic">No inventory items found.</div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Part #</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>In Stock</th>
                    <th>Min Qty</th>
                    <th>Unit Cost</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(invData?.items ?? []).map((item) => {
                    const isLow = item.qty <= item.minQty;
                    const status = item.qty === 0 ? "out_of_stock" : isLow ? "low_stock" : "in_stock";
                    const cfg = INV_STATUS_CFG[status]!;
                    return (
                      <tr key={item.id}>
                        <td className="font-mono text-[11px] text-primary">{item.partNumber}</td>
                        <td className="font-bold text-foreground">{item.name}</td>
                        <td><span className="status-badge text-muted-foreground bg-muted">{item.category}</span></td>
                        <td className="text-muted-foreground">{item.location ?? "—"}</td>
                        <td className="font-bold">{item.qty} {item.unit}</td>
                        <td className="text-muted-foreground">{item.minQty}</td>
                        <td className="font-mono text-[11px]">₹{Number(item.unitCost ?? 0).toLocaleString("en-IN")}</td>
                        <td><span className={`status-badge ${cfg.color}`}>{cfg.label}</span></td>
                        <td>
                          <button onClick={() => { setIntakeForm({...intakeForm, itemId: item.id}); setShowIntake(true); }} className="text-primary hover:underline text-[11px] font-bold">Add Stock</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* PARTS CATALOG */}
        {tab === "catalog" && (
          <div className="p-4">
             <div className="flex justify-between items-center mb-4">
              <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Approved Parts Catalog</div>
              <button onClick={() => setShowNewItem(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] font-bold rounded hover:bg-primary/90">
                <Plus className="w-3 h-3" /> Add Part to Catalog
              </button>
            </div>
            <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Part #</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Unit Cost</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {(invData?.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="font-mono text-[11px] text-primary">{item.partNumber}</td>
                      <td className="font-bold text-foreground">{item.name}</td>
                      <td><span className="status-badge text-muted-foreground bg-muted">{item.category}</span></td>
                      <td className="font-mono text-[11px]">₹{Number(item.unitCost ?? 0).toLocaleString("en-IN")}</td>
                      <td className="text-muted-foreground max-w-xs truncate">{item.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        )}

        {/* REORDER POLICIES */}
        {tab === "reorder" && (
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Automated Reorder Rules</div>
              <button onClick={() => setShowNewPolicy(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] font-bold rounded hover:bg-primary/90">
                <Plus className="w-3 h-3" /> New Reorder Policy
              </button>
            </div>
            {(!policiesData || policiesData.length === 0) ? (
              <div className="p-12 text-center border border-dashed border-border rounded">
                <AlertTriangle className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No reorder policies configured yet.</p>
                <button onClick={() => setShowNewPolicy(true)} className="mt-3 text-primary text-xs font-bold hover:underline">Set up your first rule →</button>
              </div>
            ) : (
              <table className="ent-table w-full">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Threshold</th>
                    <th>Reorder Qty</th>
                    <th>Automation</th>
                    <th>Last Check</th>
                  </tr>
                </thead>
                <tbody>
                  {policiesData.map((p) => {
                    const item = invData?.items.find(it => it.id === p.itemId);
                    return (
                      <tr key={p.id}>
                        <td className="font-bold">{item?.name ?? "Unknown Item"}</td>
                        <td>Below {p.thresholdQty} units</td>
                        <td>Order {p.reorderQty} units</td>
                        <td>
                          <span className={`status-badge ${p.isAutomated ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                            {p.isAutomated ? "Auto-Raise PO" : "Manual Trigger"}
                          </span>
                        </td>
                        <td className="text-[11px] text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* MODALS */}
        {showNewItem && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="text-lg font-bold text-foreground mb-4">Add Inventory Item / Part</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Part Number *</label>
                    <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={invForm.partNumber} onChange={e => setInvForm({...invForm, partNumber: e.target.value})} placeholder="e.g. SRV-FAN-120" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Item Name *</label>
                    <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={invForm.name} onChange={e => setInvForm({...invForm, name: e.target.value})} placeholder="e.g. 120mm Server Chassis Fan" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Category</label>
                    <select className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={invForm.category} onChange={e => setInvForm({...invForm, category: e.target.value})}>
                      <option value="spare">Spare Parts</option>
                      <option value="it_hardware">IT Hardware</option>
                      <option value="consumable">Consumables</option>
                      <option value="asset">Fixed Asset</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Unit</label>
                    <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={invForm.unit} onChange={e => setInvForm({...invForm, unit: e.target.value})} placeholder="each / box / kg" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Current Stock</label>
                    <input type="number" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={invForm.qty} onChange={e => setInvForm({...invForm, qty: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Min Qty (Safety)</label>
                    <input type="number" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={invForm.minQty} onChange={e => setInvForm({...invForm, minQty: e.target.value})} />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                  <button onClick={() => setShowNewItem(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                  <button 
                    disabled={!invForm.partNumber || !invForm.name || createInventoryItem.isPending}
                    onClick={() => createInventoryItem.mutate({
                      ...invForm,
                      qty: parseInt(invForm.qty) || 0,
                      minQty: parseInt(invForm.minQty) || 5,
                    })}
                    className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 shadow-lg disabled:opacity-50"
                  >
                    {createInventoryItem.isPending ? "Saving…" : "Save Item"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showNewPolicy && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="text-lg font-bold text-foreground mb-4">Create Reorder Policy</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Select Item *</label>
                    <select className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={policyForm.itemId} onChange={e => setPolicyForm({...policyForm, itemId: e.target.value})}>
                      <option value="">Choose item…</option>
                      {(invData?.items ?? []).map(it => (
                        <option key={it.id} value={it.id}>{it.name} ({it.partNumber})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Low Stock Threshold</label>
                      <input type="number" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={policyForm.thresholdQty} onChange={e => setPolicyForm({...policyForm, thresholdQty: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Reorder Quantity</label>
                      <input type="number" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={policyForm.reorderQty} onChange={e => setPolicyForm({...policyForm, reorderQty: e.target.value})} />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/30">
                    <input type="checkbox" checked={policyForm.isAutomated} onChange={e => setPolicyForm({...policyForm, isAutomated: e.target.checked})} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Auto-raise Purchase Order</p>
                      <p className="text-[10px] text-muted-foreground">Automatically create a draft PO when stock hits threshold</p>
                    </div>
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                  <button onClick={() => setShowNewPolicy(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg">Cancel</button>
                  <button 
                    disabled={!policyForm.itemId || createPolicy.isPending}
                    onClick={() => createPolicy.mutate({
                      itemId: policyForm.itemId,
                      thresholdQty: parseInt(policyForm.thresholdQty) || 5,
                      reorderQty: parseInt(policyForm.reorderQty) || 20,
                      isAutomated: policyForm.isAutomated,
                    })}
                    className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg shadow-lg"
                  >
                    {createPolicy.isPending ? "Saving…" : "Save Policy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showIntake && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6">
                <h3 className="text-lg font-bold text-foreground mb-4">Stock Intake / Goods Receipt</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Quantity to Add *</label>
                    <input type="number" min="1" className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background font-bold text-lg" value={intakeForm.qty} onChange={e => setIntakeForm({...intakeForm, qty: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Reference (PO / Invoice #)</label>
                    <input className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background" value={intakeForm.reference} onChange={e => setIntakeForm({...intakeForm, reference: e.target.value})} placeholder="e.g. PO-12345" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Notes</label>
                    <textarea className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background h-20 resize-none" value={intakeForm.notes} onChange={e => setIntakeForm({...intakeForm, notes: e.target.value})} placeholder="Reason for intake..." />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                  <button onClick={() => setShowIntake(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg">Cancel</button>
                  <button 
                    disabled={!intakeForm.qty || recordIntake.isPending}
                    onClick={() => recordIntake.mutate({
                      itemId: intakeForm.itemId,
                      qty: parseInt(intakeForm.qty) || 1,
                      reference: intakeForm.reference || undefined,
                      notes: intakeForm.notes || undefined,
                    })}
                    className="px-6 py-2 bg-green-600 text-white text-sm font-bold rounded-lg shadow-lg"
                  >
                    {recordIntake.isPending ? "Saving…" : "Add to Stock"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
