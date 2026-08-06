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
  TrendingDown, TrendingUp, ShoppingCart, FileMinus, X
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  InvoiceLineItemsEditor,
  emptyLine,
  toLinePayload,
  type InvoiceLineRow,
} from "@/components/financial/InvoiceLineItemsEditor";
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

  // Credit / debit note form state. Reuses the M-07 InvoiceLineItemsEditor so the
  // note's line arithmetic (per-line rounding, derived header, ₹0.01 guard) is
  // identical to invoices — one editor, no drift.
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteType, setNoteType] = useState<"credit_note" | "debit_note">("credit_note");
  const [noteNumber, setNoteNumber] = useState("");
  const [noteReason, setNoteReason] = useState("");
  const [noteRows, setNoteRows] = useState<InvoiceLineRow[]>([emptyLine()]);

  const createNote = trpc.financial.createCreditDebitNote.useMutation({
    onSuccess: (n: any) => {
      toast.success(`${noteType === "credit_note" ? "Credit" : "Debit"} note created`);
      // Time-barred credit note auto-switched to financial-only — explain what changed.
      if (n?.financialNoteNotice) toast.warning(n.financialNoteNotice, { duration: 12000 });
      setShowNoteForm(false);
      setNoteNumber(""); setNoteReason(""); setNoteRows([emptyLine()]);
      if (n?.id) router.push(`/app/financial/invoices/${n.id}`);
    },
    onError: (e) => toast.error(e?.message ?? "Failed to create note"),
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
                    <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-body-sm font-medium hover:bg-muted/50 transition-all">
                      <Printer className="w-4 h-4" /> Print
                    </button>
                    {status === "pending" && (
                      <PermissionGate module="financial" action="write">
                        <button
                          onClick={() => approveInvoice.mutate({ id })}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-body-sm font-medium hover:bg-indigo-700 transition-colors shadow-md"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve Payment
                        </button>
                      </PermissionGate>
                    )}
                    {(status === "approved" || (status === "pending" && direction === "receivable")) && (
                      <PermissionGate module="financial" action="write">
                        <button
                          onClick={() => markPaid.mutate({ id, paymentMethod: direction === "payable" ? "bank_transfer" : "collection" })}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-body-sm font-medium hover:bg-green-700 transition-colors shadow-md"
                        >
                          <Wallet className="w-4 h-4" /> {direction === "payable" ? "Mark Paid" : "Mark Collected"}
                        </button>
                      </PermissionGate>
                    )}
                    {direction === "receivable" && (inv.invoiceType ?? "tax_invoice") === "tax_invoice" && (
                      <PermissionGate module="financial" action="write">
                        <button
                          onClick={() => setShowNoteForm(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-body-sm font-medium hover:bg-muted/50 transition-all"
                        >
                          <FileMinus className="w-4 h-4" /> Credit / Debit Note
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
                      <h2 className="text-h1 font-black text-foreground font-mono">
                        ₹{Number(inv.amount || inv.totalAmount).toLocaleString("en-IN")}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Due Date</p>
                      <p className={cn("text-h4 font-bold font-mono", status === "overdue" ? "text-red-600" : "text-foreground")}>
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
                          "pb-3 text-body-sm font-bold uppercase tracking-widest border-b-2 transition-all",
                          activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {activeTab === "details" && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          title="Totals"
                          items={[
                            { label: "Taxable Value", value: `₹${Number(inv.taxableValue || inv.amount || 0).toLocaleString("en-IN")}`, icon: Coins },
                            { label: "Tax Amount", value: `₹${Number(inv.totalTaxAmount || 0).toLocaleString("en-IN")}`, icon: Coins },
                            { label: "Total Amount", value: `₹${Number(inv.amount || inv.totalAmount).toLocaleString("en-IN")}`, icon: Wallet },
                            { label: "PO Reference", value: inv.poId || "Direct Invoice", icon: ShoppingCart },
                          ]}
                        />
                      </div>

                      {/* Line items only render when the invoice was created with them.
                          Legacy single-amount invoices carry none, so this block is skipped
                          and the header Totals above remain the sole breakdown. */}
                      {Array.isArray(inv.lineItems) && inv.lineItems.length > 0 && (
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                          <div className="px-4 py-3 border-b border-border">
                            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Line Items ({inv.lineItems.length})</h4>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-caption">
                              <thead>
                                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                                  <th className="text-left font-medium px-4 py-2">#</th>
                                  <th className="text-left font-medium px-4 py-2">Description</th>
                                  <th className="text-left font-medium px-4 py-2">HSN/SAC</th>
                                  <th className="text-right font-medium px-4 py-2">Qty</th>
                                  <th className="text-right font-medium px-4 py-2">Taxable ₹</th>
                                  <th className="text-right font-medium px-4 py-2">GST %</th>
                                  <th className="text-right font-medium px-4 py-2">CGST</th>
                                  <th className="text-right font-medium px-4 py-2">SGST</th>
                                  <th className="text-right font-medium px-4 py-2">IGST</th>
                                  <th className="text-right font-medium px-4 py-2">Line total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inv.lineItems.map((ln: any) => (
                                  <tr key={ln.id} className="border-b border-border/60 last:border-0">
                                    <td className="px-4 py-2 text-muted-foreground">{ln.lineItemNumber}</td>
                                    <td className="px-4 py-2 font-medium">{ln.description}</td>
                                    <td className="px-4 py-2 font-mono text-muted-foreground">{ln.hsnSacCode || "—"}</td>
                                    <td className="px-4 py-2 text-right font-mono">{Number(ln.quantity).toLocaleString("en-IN")}</td>
                                    <td className="px-4 py-2 text-right font-mono">₹{Number(ln.taxableValue).toLocaleString("en-IN")}</td>
                                    <td className="px-4 py-2 text-right font-mono">{Number(ln.gstRate)}%</td>
                                    <td className="px-4 py-2 text-right font-mono">₹{Number(ln.cgstAmount).toLocaleString("en-IN")}</td>
                                    <td className="px-4 py-2 text-right font-mono">₹{Number(ln.sgstAmount).toLocaleString("en-IN")}</td>
                                    <td className="px-4 py-2 text-right font-mono">₹{Number(ln.igstAmount).toLocaleString("en-IN")}</td>
                                    <td className="px-4 py-2 text-right font-mono font-bold">₹{Number(ln.lineTotal).toLocaleString("en-IN")}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
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
                          <p className="text-body-sm font-bold text-foreground">
                            {status === "paid"
                              ? (direction === "payable" ? "Payment completed" : "Amount collected")
                              : status === "approved"
                              ? "Approved — awaiting payment"
                              : "Payment not yet initiated"}
                          </p>
                          <p className="text-caption text-muted-foreground">
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
                              <p className="text-body-sm font-bold text-foreground">
                                {direction === "payable" ? "Record this payment" : "Record collection"}
                              </p>
                              <p className="text-caption text-muted-foreground">
                                {status === "pending"
                                  ? "Approve the invoice first, then mark it as paid."
                                  : "Mark this invoice as settled once funds have moved."}
                              </p>
                            </div>
                            {status === "pending" ? (
                              <button
                                onClick={() => approveInvoice.mutate({ id })}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-body-sm font-medium hover:bg-indigo-700 transition-colors shadow-md"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Approve
                              </button>
                            ) : (
                              <button
                                onClick={() => markPaid.mutate({ id, paymentMethod: direction === "payable" ? "bank_transfer" : "collection" })}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-body-sm font-medium hover:bg-green-700 transition-colors shadow-md"
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
                      <div className="flex justify-between text-caption">
                        <span className="text-muted-foreground">Budget Code</span>
                        <span className="font-mono font-bold">{inv.budgetCode || "UNALLOCATED"}</span>
                      </div>
                      <div className="flex justify-between text-caption">
                        <span className="text-muted-foreground">Cost Center</span>
                        <span className="font-bold">{inv.costCenter || "Default"}</span>
                      </div>
                    </div>
                  </div>

                  {inv.poId && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-2">
                      <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Linked Purchase Order</h4>
                      <Link href={`/app/procurement/orders/${inv.poId}`} className="text-body-sm font-bold text-blue-900 hover:underline flex items-center justify-between group">
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

              {/* Credit / debit note dialog — reuses the M-07 InvoiceLineItemsEditor. */}
              {showNoteForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div className="flex items-center justify-between p-5 pb-3 border-b border-border shrink-0">
                      <h3 className="text-[13px] font-semibold">Raise a credit / debit note</h3>
                      <button type="button" onClick={() => setShowNoteForm(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-3">
                      <p className="text-[11px] text-muted-foreground">
                        Against invoice <span className="font-mono">{inv.invoiceNumber}</span> dated {formatDt(inv.createdAt)}.
                        The note inherits the buyer, place of supply and tax split; its GST is computed from the lines below.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-muted-foreground">Type</label>
                          <select
                            value={noteType}
                            onChange={(e) => setNoteType(e.target.value as "credit_note" | "debit_note")}
                            className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                          >
                            <option value="credit_note">Credit note</option>
                            <option value="debit_note">Debit note</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">Note number *</label>
                          <input
                            value={noteNumber}
                            onChange={(e) => setNoteNumber(e.target.value)}
                            placeholder="CN-2026-0001"
                            className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Reason</label>
                        <input
                          value={noteReason}
                          onChange={(e) => setNoteReason(e.target.value)}
                          placeholder="e.g. post-sale discount, rate correction, sales return"
                          className="w-full mt-0.5 text-caption border border-border rounded px-2 py-1.5 bg-background"
                        />
                      </div>
                      <InvoiceLineItemsEditor
                        rows={noteRows}
                        onChange={setNoteRows}
                        isInterstate={Boolean(inv.isInterstate)}
                      />
                    </div>
                    <div className="flex gap-2 justify-end p-5 pt-3 border-t border-border shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowNoteForm(false)}
                        className="px-3 py-1.5 rounded border border-border text-[11px] hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={createNote.isPending || !noteNumber.trim() || toLinePayload(noteRows).length === 0}
                        onClick={() =>
                          createNote.mutate({
                            originalInvoiceId: id,
                            noteType,
                            noteNumber: noteNumber.trim(),
                            reason: noteReason.trim() || undefined,
                            lines: toLinePayload(noteRows),
                          })
                        }
                        className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {createNote.isPending ? "Creating…" : `Create ${noteType === "credit_note" ? "credit" : "debit"} note`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}
