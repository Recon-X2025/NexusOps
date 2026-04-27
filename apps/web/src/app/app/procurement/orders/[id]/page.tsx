"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import {
  ChevronRight, Clock, Lock, CheckCircle2,
  Package, FileText, Send, Printer, User,
  CalendarDays, Tag, AlertTriangle, Coins,
  Activity, ArrowUpCircle, XCircle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timeline } from "@/components/ui/timeline";

const PO_STATE_CFG: Record<string, { label: string; color: string; icon: any }> = {
  draft:               { label: "Draft",              color: "text-muted-foreground bg-muted", icon: Edit2 },
  pending_approval:    { label: "Pending Approval",   color: "text-yellow-700 bg-yellow-100", icon: Clock },
  approved:            { label: "Approved",           color: "text-blue-700 bg-blue-100", icon: CheckCircle2 },
  sent:                { label: "Sent to Supplier",   color: "text-indigo-700 bg-indigo-100", icon: Send },
  sent_to_supplier:    { label: "Sent to Supplier",   color: "text-indigo-700 bg-indigo-100", icon: Send },
  acknowledged:        { label: "Acknowledged",       color: "text-blue-700 bg-blue-100", icon: CheckCircle2 },
  partially_received:  { label: "Partial Receipt",    color: "text-orange-700 bg-orange-100", icon: Package },
  received:            { label: "Fully Received",     color: "text-green-700 bg-green-100", icon: Package },
  fully_received:      { label: "Fully Received",     color: "text-green-700 bg-green-100", icon: Package },
  invoiced:            { label: "Invoiced",           color: "text-purple-700 bg-purple-100", icon: FileText },
  paid:                { label: "Paid",               color: "text-green-700 bg-green-100", icon: Coins },
  cancelled:           { label: "Cancelled",          color: "text-muted-foreground/70 bg-muted", icon: XCircle },
  disputed:            { label: "Disputed",           color: "text-red-700 bg-red-100", icon: AlertTriangle },
};

import { Edit2 } from "lucide-react";

function formatDt(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("en-IN", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [activeTab, setActiveTab] = useState<"items" | "activity" | "documents">("items");

  const poQuery = trpc.procurement.purchaseOrders.get.useQuery({ id }, mergeTrpcQueryOpts("procurement.purchaseOrders.get", undefined));
  
  const sendPO = trpc.procurement.purchaseOrders.send.useMutation({
    onSuccess: () => { void poQuery.refetch(); toast.success("PO sent to supplier"); },
    onError: (e) => toast.error(e?.message ?? "Failed to send PO"),
  });

  const receivePO = trpc.procurement.purchaseOrders.markReceived.useMutation({
    onSuccess: () => { void poQuery.refetch(); toast.success("Goods receipt recorded"); },
    onError: (e) => toast.error(e?.message ?? "Failed to record receipt"),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={poQuery}
        resourceName="Purchase Order"
        backHref="/app/procurement?tab=orders"
      >
        {(data) => {
          const po = data as any;
          const status = po.status as string;
          const sCfg = PO_STATE_CFG[status] ?? PO_STATE_CFG.draft;
          const isLate = po.expectedDelivery && new Date(po.expectedDelivery) < new Date() && !["received","invoiced","paid","cancelled"].includes(status);

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={po.poNumber || `PO-${id.slice(0, 8)}`}
                subtitle={po.notes || "Purchase Order Detail"}
                icon={Package}
                backHref="/app/procurement?tab=orders"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", sCfg.color)}>
                      {sCfg.label}
                    </span>
                    {isLate && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-100 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Overdue
                      </span>
                    )}
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 transition-all"
                    >
                      <Printer className="w-4 h-4" /> Print
                    </button>
                    {status === "draft" && (
                      <button
                        onClick={() => sendPO.mutate({ id })}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-md"
                      >
                        <Send className="w-4 h-4" /> Send to Supplier
                      </button>
                    )}
                    {(status === "sent" || status === "partially_received") && (
                      <button
                        onClick={() => receivePO.mutate({ id })}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-md"
                      >
                        <Package className="w-4 h-4" /> Record Receipt
                      </button>
                    )}
                  </div>
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Tabs */}
                  <div className="flex border-b border-border gap-6">
                    {(["items", "activity", "documents"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "pb-3 text-sm font-bold uppercase tracking-widest border-b-2 transition-all",
                          activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {activeTab === "items" && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border">
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Description</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Qty</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Unit Price</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(po.items ?? []).map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-foreground">{item.description}</td>
                              <td className="px-4 py-3 text-sm text-right font-mono">{item.quantity}</td>
                              <td className="px-4 py-3 text-sm text-right font-mono">₹{Number(item.unitPrice).toLocaleString("en-IN")}</td>
                              <td className="px-4 py-3 text-sm text-right font-bold font-mono">₹{(Number(item.unitPrice) * item.quantity).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/10 font-bold border-t border-border">
                            <td colSpan={3} className="px-4 py-4 text-sm text-right uppercase tracking-widest">Grand Total</td>
                            <td className="px-4 py-4 text-lg text-right font-mono text-primary">
                              ₹{Number(po.totalAmount).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {activeTab === "activity" && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <Timeline
                        items={(po.activityLog ?? []).map((l: any) => ({
                          id: l.id,
                          title: l.description,
                          timestamp: l.createdAt,
                          icon: Package,
                          type: "info",
                          description: l.authorName
                        }))}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <DetailGrid
                    title="Order Info"
                    icon={Tag}
                    items={[
                      { label: "Vendor", value: po.vendorName || `ID: …${po.vendorId?.slice(-6)}`, icon: User },
                      { label: "Legal Entity", value: po.legalEntityCode || "—", icon: Activity },
                      { label: "Currency", value: po.currency || "INR", icon: Coins },
                      { label: "Created", value: formatDt(po.createdAt), icon: CalendarDays },
                      { label: "Expected By", value: po.expectedDelivery ? formatDt(po.expectedDelivery) : "—", icon: Clock, className: isLate ? "text-red-600 font-bold" : "" },
                    ]}
                  />

                  {po.requisitionId && (
                    <div className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col gap-2">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Linked Requisition</h4>
                      <Link href={`/app/procurement/requisitions/${po.requisitionId}`} className="text-sm font-bold text-primary hover:underline flex items-center gap-2">
                        <FileText className="w-4 h-4" /> View Requisition
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}
