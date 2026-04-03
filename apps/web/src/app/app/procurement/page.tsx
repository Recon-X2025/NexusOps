"use client";

import { useState, useEffect } from "react";
import {
  ShoppingCart, Plus, Download, CheckCircle2,
  XCircle, Clock, AlertTriangle, Package,
  FileText, Send, Loader2,
} from "lucide-react";
import { useRBAC, PermissionGate, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { downloadCSV } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
  const { can } = useRBAC();
  const router = useRouter();
  const visibleTabs = PROC_TABS.filter((t) => can(t.module, t.action));
  const [tab, setTab] = useState(visibleTabs[0]?.key ?? "dashboard");
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [expandedPR, setExpandedPR] = useState<string | null>(null);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.key === tab)) setTab(visibleTabs[0]?.key ?? "");
  }, [visibleTabs, tab]);


  // Correct tRPC paths: procurement.purchaseRequests.list / purchaseOrders.list / vendors.list
  const { data: prData, isLoading: prLoading, refetch: refetchPRs } = trpc.procurement.purchaseRequests.list.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );
  const { data: poData, isLoading: poLoading, refetch: refetchPOs } = trpc.procurement.purchaseOrders.list.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );
  const { data: vendorsData } = trpc.procurement.vendors.list.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  );

  const approvePR  = trpc.procurement.purchaseRequests.approve.useMutation({ onSuccess: () => refetchPRs(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const rejectPR   = trpc.procurement.purchaseRequests.reject.useMutation({ onSuccess: () => refetchPRs(), onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const createPO   = trpc.procurement.purchaseOrders.createFromPR.useMutation({ onSuccess: () => { refetchPRs(); refetchPOs(); }, onError: (err: any) => toast.error(err?.message ?? "Something went wrong") });
  const [rejectingPR, setRejectingPR]  = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [creatingPO, setCreatingPO]    = useState<string | null>(null);
  const [poVendorId, setPOVendorId]    = useState("");

  const [showNewPR, setShowNewPR] = useState(false);
  const [prForm, setPrForm] = useState({ title: "", justification: "", priority: "medium", department: "", itemDesc: "", itemQty: "1", itemPrice: "" });
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Supply Chain & Procurement</h1>
          <span className="text-[11px] text-muted-foreground/70">Requisitions · Purchase Orders · Goods Receipt · Inventory</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV(purchaseOrders.map((p: any) => ({ PO_Number: p.number, Vendor: p.vendorName ?? p.vendorId ?? "", Status: p.status, Total: p.totalAmount ?? "", Tax: p.gstAmount ?? "", Created: new Date(p.createdAt).toLocaleDateString("en-IN") })), "purchase_orders")}
            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <PermissionGate module="procurement" action="write">
            <button
              onClick={() => setShowNewPR((v) => !v)}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90"
            >
              <Plus className="w-3 h-3" /> {showNewPR ? "Cancel" : "New Requisition"}
            </button>
          </PermissionGate>
        </div>
      </div>

      {prMsg && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 rounded text-[12px] text-green-700 font-medium">{prMsg}</div>
      )}
      {showNewPR && (
        <div className="bg-card border border-primary/30 rounded p-4">
          <h3 className="text-[12px] font-semibold text-foreground mb-3">New Purchase Requisition</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Title *</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="What do you need?" value={prForm.title} onChange={(e) => setPrForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Priority</label>
              <select className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={prForm.priority} onChange={(e) => setPrForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Department</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="IT / HR / Finance…" value={prForm.department} onChange={(e) => setPrForm((f) => ({ ...f, department: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Justification</label>
              <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Business reason…" value={prForm.justification} onChange={(e) => setPrForm((f) => ({ ...f, justification: e.target.value }))} />
            </div>
            <div className="col-span-3 border-t border-border pt-3">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">Item (at least 1 required)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-[11px] text-muted-foreground">Description *</label>
                  <input className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="Item name" value={prForm.itemDesc} onChange={(e) => setPrForm((f) => ({ ...f, itemDesc: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Qty</label>
                  <input type="number" min="1" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" value={prForm.itemQty} onChange={(e) => setPrForm((f) => ({ ...f, itemQty: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">Unit Price (₹)</label>
                  <input type="number" min="0" className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background" placeholder="0.00" value={prForm.itemPrice} onChange={(e) => setPrForm((f) => ({ ...f, itemPrice: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              disabled={!prForm.title || !prForm.itemDesc || createPR.isPending}
              onClick={() => createPR.mutate({ title: prForm.title, justification: prForm.justification || undefined, priority: prForm.priority as any, department: prForm.department || undefined, items: [{ description: prForm.itemDesc, quantity: parseInt(prForm.itemQty) || 1, unitPrice: parseFloat(prForm.itemPrice) || 0 }] })}
              className="px-4 py-1.5 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {createPR.isPending ? "Submitting…" : "Submit Requisition"}
            </button>
            <button onClick={() => setShowNewPR(false)} className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent">Cancel</button>
            {createPR.isError && <span className="text-[11px] text-red-600">{(createPR.error as any)?.message}</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Open Purchase Orders",    value: purchaseOrders.filter(po => !["received","invoiced","paid","cancelled"].includes(po.status ?? "")).length, color: "text-blue-700" },
          { label: "Total PO Value",           value: `₹${(totalPOValue / 1000).toFixed(0)}K`,  color: "text-foreground/80" },
          { label: "Pending Approval",          value: pendingApproval,    color: pendingApproval > 0 ? "text-orange-700" : "text-green-700" },
          { label: "Open Requisitions",         value: openPRs,             color: "text-blue-700" },
          { label: "Low/Out of Stock Items",    value: lowStock,            color: lowStock > 0 ? "text-red-700" : "text-green-700" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {lowStock > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded px-3 py-2 flex items-center gap-2 text-[12px] text-orange-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>{lowStock} inventory items</strong> are low stock or out of stock.
        </div>
      )}

      <div className="flex border-b border-border bg-card rounded-t overflow-x-auto">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[11px] font-medium border-b-2 whitespace-nowrap transition-colors
              ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground/80"}`}>
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
                      <>
                        <tr key={pr.id} className={`cursor-pointer ${isExpanded ? "bg-blue-50/40" : ""}`}
                          onClick={() => setExpandedPR(isExpanded ? null : pr.id)}>
                          <td className="p-0"><div className={`priority-bar ${prPriority === "emergency" ? "bg-red-600" : prPriority === "urgent" ? "bg-orange-500" : "bg-green-500"}`} /></td>
                          <td className="font-mono text-[11px] text-primary">{pr.number ?? pr.id}</td>
                          <td className="max-w-xs"><span className="truncate block font-medium text-foreground">{pr.title ?? "—"}</span></td>
                          <td className="text-muted-foreground">{pr.requesterId ? `…${pr.requesterId.slice(-6)}` : "—"}</td>
                          <td><span className="status-badge text-muted-foreground bg-muted">{pr.department ?? "—"}</span></td>
                          <td className="text-center text-muted-foreground">—</td>
                          <td className="font-mono text-[11px] text-foreground/80">₹${Number(pr.totalAmount ?? 0).toLocaleString("en-IN")}</td>
                          <td><span className={`status-badge capitalize ${PRIORITY_COLOR[prPriority]}`}>{prPriority}</span></td>
                          <td><span className={`status-badge ${sCfg?.color ?? ""}`}>{sCfg?.label ?? prState}</span></td>
                          <td className="text-[11px] text-muted-foreground">—</td>
                          <td className="font-mono text-[10px] text-muted-foreground/70">{pr.budgetCode ?? "—"}</td>
                          <td>
                            {prState === "approved"
                              ? <button onClick={() => setTab("purchase-orders")} className="text-[11px] text-primary hover:underline">+ Create PO</button>
                              : "—"
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
                                    <div className="flex items-end gap-2 mt-2">
                                      <select className="border border-border rounded px-2 py-1 text-[11px]" value={poVendorId} onChange={e => setPOVendorId(e.target.value)}>
                                        <option value="">Select Vendor *</option>
                                        {((vendorsData as any)?.items ?? []).map((v: any) => (
                                          <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                      </select>
                                      <button
                                        disabled={!poVendorId || createPO.isPending}
                                        onClick={() => createPO.mutate({ prId: pr.id, vendorId: poVendorId })}
                                        className="px-2 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50"
                                      >{createPO.isPending ? "…" : "Create PO"}</button>
                                      {createPO.isError && <span className="text-[11px] text-red-600">{(createPO.error as any)?.message}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-blue-50/30" : ""}`}
                    onClick={() => setExpandedPO(isExpanded ? null : po.id)}
                  >
                    <div className="w-1 self-stretch rounded-full flex-shrink-0 bg-green-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-[11px] text-primary">{po.poNumber ?? po.id}</span>
                            <span className={`status-badge ${sCfg?.color ?? ""}`}>{sCfg?.label ?? poState}</span>
                            {isLate && <span className="status-badge text-red-700 bg-red-100 font-bold">⚠ Overdue</span>}
                          </div>
                          <p className="text-[13px] font-semibold text-foreground">{po.notes ?? "Purchase Order"}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Vendor ID: <strong>{po.vendorId ? `…${po.vendorId.slice(-8)}` : "—"}</strong></p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-[15px] font-bold text-foreground">{po.currency ?? "INR"} {Number(po.totalAmount ?? 0).toLocaleString("en-IN")}</div>
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
          <div className="p-8 text-center">
            <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">No inventory items found</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Add parts and stock items to the inventory to track availability and reorder levels</p>
          </div>
        )}

        {/* PARTS CATALOG */}
        {tab === "catalog" && (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">No catalog items configured yet</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Add approved parts with preferred suppliers and pricing to the catalog</p>
          </div>
        )}

        {/* REORDER POLICIES */}
        {tab === "reorder" && (
          <div className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground/50">No reorder policies configured yet</p>
            <p className="text-[11px] text-muted-foreground/40 mt-1">Set up automated reorder rules to maintain optimal stock levels</p>
          </div>
        )}
      </div>
    </div>
  );
}
