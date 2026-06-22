"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";
import {
  Clock, CheckCircle2, FileText, User,
  CalendarDays, Tag, AlertTriangle, Coins,
  Activity, XCircle, ArrowRight, Plus,
  ClipboardList, ShoppingCart, MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timeline } from "@/components/ui/timeline";

const PR_STATE_CFG: Record<string, { label: string; color: string; icon: any }> = {
  draft:           { label: "Draft",            color: "text-muted-foreground bg-muted", icon: FileText },
  pending:         { label: "Pending Approval", color: "text-yellow-700 bg-yellow-100", icon: Clock },
  submitted:       { label: "Submitted",        color: "text-blue-700 bg-blue-100", icon: Activity },
  pending_approval:{ label: "Pending Approval", color: "text-yellow-700 bg-yellow-100", icon: Clock },
  approved:        { label: "Approved",         color: "text-green-700 bg-green-100", icon: CheckCircle2 },
  rejected:        { label: "Rejected",         color: "text-red-700 bg-red-100", icon: XCircle },
  ordered:         { label: "PO Raised",        color: "text-indigo-700 bg-indigo-100", icon: ShoppingCart },
  received:        { label: "Received",         color: "text-green-700 bg-green-100", icon: CheckCircle2 },
  closed:          { label: "Closed",           color: "text-muted-foreground/70 bg-muted", icon: XCircle },
};

const PRIORITY_COLOR: Record<string, string> = {
  low:       "text-slate-700 bg-slate-100",
  medium:    "text-blue-700 bg-blue-100",
  high:      "text-orange-700 bg-orange-100",
  critical:  "text-red-700 bg-red-100",
};

function formatDt(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("en-IN", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [activeTab, setActiveTab] = useState<"items" | "activity" | "approval">("items");

  const prQuery = trpc.procurement.purchaseRequests.get.useQuery({ id }, mergeTrpcQueryOpts("procurement.purchaseRequests.get", undefined));
  
  const approvePR = trpc.procurement.purchaseRequests.approve.useMutation({
    onSuccess: () => { void prQuery.refetch(); toast.success("Requisition approved"); },
    onError: (e) => toast.error(e?.message ?? "Failed to approve requisition"),
  });

  const rejectPR = trpc.procurement.purchaseRequests.reject.useMutation({
    onSuccess: () => { void prQuery.refetch(); toast.success("Requisition rejected"); },
    onError: (e) => toast.error(e?.message ?? "Failed to reject requisition"),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={prQuery}
        resourceName="Purchase Requisition"
        backHref="/app/procurement?tab=requisitions"
      >
        {(data) => {
          const pr = data as any;
          const status = pr.status as string;
          const sCfg = PR_STATE_CFG[status] ?? PR_STATE_CFG.draft;
          const priority = pr.priority || "medium";

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={pr.number || `PR-${id.slice(0, 8)}`}
                subtitle={pr.title || "Requisition Detail"}
                icon={ClipboardList}
                backHref="/app/procurement?tab=requisitions"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", sCfg.color)}>
                      {sCfg.label}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", PRIORITY_COLOR[priority])}>
                      {priority}
                    </span>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <PermissionGate module="procurement" action="approve">
                      {status === "pending" && (
                        <>
                          <button
                            onClick={() => rejectPR.mutate({ id })}
                            className="flex items-center gap-1.5 px-4 py-1.5 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition-all"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                          <button
                            onClick={() => approvePR.mutate({ id })}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-md"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve
                          </button>
                        </>
                      )}
                    </PermissionGate>
                    {status === "approved" && (
                      <button
                        onClick={() => router.push(`/app/procurement?tab=requisitions&action=createPO&id=${id}`)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-md"
                      >
                        <Plus className="w-4 h-4" /> Create PO
                      </button>
                    )}
                  </div>
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Justification Card */}
                  <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                      <MessageSquare className="w-3 h-3" /> Business Justification
                    </h3>
                    <p className="text-base text-foreground leading-relaxed italic">
                      &quot;{pr.justification || "No justification provided."}&quot;
                    </p>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-border gap-6">
                    {(["items", "activity", "approval"] as const).map((tab) => (
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
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Estimate</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(pr.items ?? []).map((item: any, i: number) => (
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
                            <td colSpan={3} className="px-4 py-4 text-sm text-right uppercase tracking-widest">Estimated Grand Total</td>
                            <td className="px-4 py-4 text-lg text-right font-mono text-primary">
                              ₹{Number(pr.totalAmount).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {activeTab === "activity" && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <Timeline
                        items={(pr.activityLog ?? []).map((l: any) => ({
                          id: l.id,
                          title: l.description,
                          timestamp: l.createdAt,
                          icon: ClipboardList,
                          type: "info",
                          description: l.authorName
                        }))}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <DetailGrid
                    title="Request Info"
                    icon={Tag}
                    items={[
                      { label: "Requester", value: pr.requesterName || `ID: …${pr.requesterId?.slice(-6)}`, icon: User },
                      { label: "Department", value: pr.department || "—", icon: Activity },
                      { label: "Budget Code", value: pr.budgetCode || "—", icon: Coins },
                      { label: "Created At", value: formatDt(pr.createdAt), icon: CalendarDays },
                      { label: "Current Approver", value: pr.currentApproverName || "—", icon: Clock },
                    ]}
                  />

                  {pr.purchaseOrderId && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col gap-2">
                      <h4 className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">Fulfillment PO</h4>
                      <Link href={`/app/procurement/orders/${pr.purchaseOrderId}`} className="text-sm font-bold text-indigo-900 hover:underline flex items-center justify-between group">
                        <span className="flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-indigo-600" />
                          View Linked PO
                        </span>
                        <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
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
