"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";
import {
  Clock, CheckCircle2, FileText, User,
  CalendarDays, Tag, AlertTriangle, Coins,
  Activity, XCircle, ArrowRight, Printer,
  Receipt, Wallet, Landmark, ArrowUpCircle,
  TrendingDown, TrendingUp, ShoppingCart
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timeline } from "@/components/ui/timeline";

const INV_STATUS_CFG: Record<string, { label: string; color: string; icon: any }> = {
  paid:     { label: "Paid",       color: "text-green-700 bg-green-100", icon: CheckCircle2 },
  pending:  { label: "Pending",    color: "text-blue-700 bg-blue-100", icon: Clock },
  approved: { label: "Approved",   color: "text-indigo-700 bg-indigo-100", icon: CheckCircle2 },
  overdue:  { label: "Overdue",    color: "text-red-700 bg-red-100", icon: AlertTriangle },
  disputed: { label: "Disputed",   color: "text-orange-700 bg-orange-100", icon: AlertTriangle },
  cancelled:{ label: "Cancelled",  color: "text-muted-foreground/70 bg-muted", icon: XCircle },
};

function formatDt(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("en-IN", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [activeTab, setActiveTab] = useState<"details" | "activity" | "payment">("details");

  const invoiceQuery = trpc.financial.getInvoice.useQuery({ id }, mergeTrpcQueryOpts("financial.getInvoice", undefined));
  
  const approveInvoice = trpc.financial.approveInvoice.useMutation({
    onSuccess: () => { void invoiceQuery.refetch(); toast.success("Invoice approved for payment"); },
    onError: (e) => toast.error(e?.message ?? "Failed to approve invoice"),
  });

  const markPaid = trpc.financial.markPaid.useMutation({
    onSuccess: () => { void invoiceQuery.refetch(); toast.success("Invoice marked as paid"); },
    onError: (e) => toast.error(e?.message ?? "Failed to mark as paid"),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={invoiceQuery}
        resourceName="Invoice"
        backHref="/app/financial?tab=invoices"
      >
        {(data) => {
          const inv = data as any;
          const status = inv.status as string;
          const sCfg = INV_STATUS_CFG[status] ?? INV_STATUS_CFG.pending;
          const direction = inv.direction || "payable";

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={inv.invoiceNumber || `INV-${id.slice(0, 8)}`}
                subtitle={`${direction === "payable" ? "Payable to" : "Receivable from"} ${inv.vendorName || "Vendor"}`}
                icon={Receipt}
                backHref="/app/financial?tab=invoices"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", sCfg.color)}>
                      {sCfg.label}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1", 
                      direction === "payable" ? "text-red-700 bg-red-50" : "text-green-700 bg-green-50"
                    )}>
                      {direction === "payable" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {direction.toUpperCase()}
                    </span>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 transition-all">
                      <Printer className="w-4 h-4" /> Print
                    </button>
                    {status === "pending" && (
                      <PermissionGate module="financial" action="write">
                        <button
                          onClick={() => approveInvoice.mutate({ id })}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-md"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve Payment
                        </button>
                      </PermissionGate>
                    )}
                    {(status === "approved" || (status === "pending" && direction === "receivable")) && (
                      <PermissionGate module="financial" action="write">
                        <button
                          onClick={() => markPaid.mutate({ id, paymentMethod: direction === "payable" ? "bank_transfer" : "collection" })}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-md"
                        >
                          <Wallet className="w-4 h-4" /> {direction === "payable" ? "Mark Paid" : "Mark Collected"}
                        </button>
                      </PermissionGate>
                    )}
                  </div>
                }
              />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Amount Hero Card */}
                  <div className="bg-card border border-border rounded-xl p-8 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Amount Due</p>
                      <h2 className="text-4xl font-black text-foreground font-mono">
                        ₹{Number(inv.amount || inv.totalAmount).toLocaleString("en-IN")}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Due Date</p>
                      <p className={cn("text-xl font-bold font-mono", status === "overdue" ? "text-red-600" : "text-foreground")}>
                        {formatDt(inv.dueDate)}
                      </p>
                    </div>
                  </div>

                  <div className="flex border-b border-border gap-6">
                    {(["details", "activity", "payment"] as const).map((tab) => (
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

                  {activeTab === "details" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
                      <DetailGrid
                        title="Invoice Header"
                        items={[
                          { label: "Vendor", value: inv.vendorName || "—", icon: User },
                          { label: "Invoice Date", value: formatDt(inv.createdAt), icon: CalendarDays },
                          { label: "Reference", value: inv.invoiceNumber || "—", icon: FileText },
                          { label: "Legal Entity", value: inv.legalEntityCode || "—", icon: Landmark },
                        ]}
                      />
                      <DetailGrid
                        title="Line Items"
                        items={[
                          { label: "Taxable Value", value: `₹${Number(inv.taxableValue || inv.amount || 0).toLocaleString("en-IN")}`, icon: Coins },
                          { label: "Tax Amount", value: `₹${Number(inv.totalTaxAmount || 0).toLocaleString("en-IN")}`, icon: Coins },
                          { label: "Total Amount", value: `₹${Number(inv.amount || inv.totalAmount).toLocaleString("en-IN")}`, icon: Wallet },
                          { label: "PO Reference", value: inv.poId || "Direct Invoice", icon: ShoppingCart },
                        ]}
                      />
                    </div>
                  )}

                  {activeTab === "activity" && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <Timeline
                        items={(inv.activityLog ?? []).map((l: any) => ({
                          id: l.id,
                          title: l.description,
                          timestamp: l.createdAt,
                          icon: Receipt,
                          subtitle: l.authorName
                        }))}
                      />
                    </div>
                  )}

                  {activeTab === "payment" && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className={cn(
                        "rounded-xl border p-5 flex items-center gap-4",
                        status === "paid" ? "bg-green-50 border-green-200" : "bg-muted/30 border-border"
                      )}>
                        {status === "paid"
                          ? <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
                          : <Clock className="w-8 h-8 text-muted-foreground shrink-0" />}
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            {status === "paid"
                              ? (direction === "payable" ? "Payment completed" : "Amount collected")
                              : status === "approved"
                              ? "Approved — awaiting payment"
                              : "Payment not yet initiated"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {inv.paidAt
                              ? `Settled on ${formatDt(inv.paidAt)}`
                              : inv.dueDate
                              ? `Due ${formatDt(inv.dueDate)}`
                              : "No due date set"}
                          </p>
                        </div>
                      </div>

                      <DetailGrid
                        title="Payment Details"
                        items={[
                          { label: "Status", value: sCfg.label, icon: sCfg.icon },
                          { label: "Payment Method", value: inv.paymentMethod ? String(inv.paymentMethod).replace(/_/g, " ") : "—", icon: Wallet },
                          { label: "Paid / Settled On", value: formatDt(inv.paidAt), icon: CalendarDays },
                          { label: "Due Date", value: formatDt(inv.dueDate), icon: Clock },
                        ]}
                      />

                      <DetailGrid
                        title="Amount Breakdown"
                        items={[
                          { label: "Taxable Value", value: `₹${Number(inv.taxableValue || inv.amount || 0).toLocaleString("en-IN")}`, icon: Coins },
                          { label: "CGST", value: `₹${Number(inv.cgstAmount || 0).toLocaleString("en-IN")}`, icon: ArrowUpCircle },
                          { label: "SGST", value: `₹${Number(inv.sgstAmount || 0).toLocaleString("en-IN")}`, icon: ArrowUpCircle },
                          { label: "IGST", value: `₹${Number(inv.igstAmount || 0).toLocaleString("en-IN")}`, icon: ArrowUpCircle },
                          { label: "Total Tax", value: `₹${Number(inv.totalTaxAmount || 0).toLocaleString("en-IN")}`, icon: Coins },
                          { label: "e-Invoice Status", value: inv.eInvoiceStatus || "Not generated", icon: FileText },
                        ]}
                      />

                      {status !== "paid" && (
                        <PermissionGate module="financial" action="write">
                          <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-foreground">
                                {direction === "payable" ? "Record this payment" : "Record collection"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {status === "pending"
                                  ? "Approve the invoice first, then mark it as paid."
                                  : "Mark this invoice as settled once funds have moved."}
                              </p>
                            </div>
                            {status === "pending" ? (
                              <button
                                onClick={() => approveInvoice.mutate({ id })}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-md"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Approve
                              </button>
                            ) : (
                              <button
                                onClick={() => markPaid.mutate({ id, paymentMethod: direction === "payable" ? "bank_transfer" : "collection" })}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-md"
                              >
                                <Wallet className="w-4 h-4" /> {direction === "payable" ? "Mark Paid" : "Mark Collected"}
                              </button>
                            )}
                          </div>
                        </PermissionGate>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <div className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col gap-4">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Accounting Context</h4>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Budget Code</span>
                        <span className="font-mono font-bold">{inv.budgetCode || "UNALLOCATED"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Cost Center</span>
                        <span className="font-bold">{inv.costCenter || "Default"}</span>
                      </div>
                    </div>
                  </div>

                  {inv.poId && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-2">
                      <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Linked Purchase Order</h4>
                      <Link href={`/app/procurement/orders/${inv.poId}`} className="text-sm font-bold text-blue-900 hover:underline flex items-center justify-between group">
                        <span className="flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-blue-600" />
                          View PO Detail
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
