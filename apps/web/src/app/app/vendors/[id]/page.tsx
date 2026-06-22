"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2, ArrowLeft, ChevronRight, Star, TrendingUp,
  Mail, Phone, MapPin, DollarSign, Edit2, Save, X, FileText,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";

const TIER_COLOR: Record<string, string> = {
  Strategic: "text-purple-700 bg-purple-100",
  Critical:  "text-red-700 bg-red-100",
  Preferred: "text-blue-700 bg-blue-100",
  Managed:   "text-muted-foreground bg-muted",
};

const STATUS_COLOR: Record<string, string> = {
  active:           "text-green-700 bg-green-100",
  under_review:     "text-yellow-700 bg-yellow-100",
  at_risk:          "text-red-700 bg-red-100",
  inactive:         "text-muted-foreground bg-muted",
  renewal_due:      "text-orange-700 bg-orange-100",
  pending_decision: "text-yellow-700 bg-yellow-100",
};

function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold ${value >= 90 ? "text-green-700" : value >= 70 ? "text-yellow-600" : "text-red-600"}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${value >= 90 ? "bg-green-500" : value >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();

  const { data: vendor, isLoading } = trpc.vendors.get.useQuery({ id }, mergeTrpcQueryOpts("vendors.get", undefined));
  const { data: perf } = trpc.vendors.performance.useQuery({ vendorId: id }, mergeTrpcQueryOpts("vendors.performance", { enabled: !!id }));

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", contactEmail: "", contactPhone: "", address: "", paymentTerms: "", notes: "" });

  const update = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Vendor updated");
      setEditing(false);
      void utils.vendors.get.invalidate({ id });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update vendor"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Loading vendor…</span>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <Building2 className="w-8 h-8 opacity-30" />
        <span className="text-sm">Vendor not found</span>
        <button onClick={() => router.push("/app/vendors")} className="text-xs text-primary hover:underline">Back to Vendors</button>
      </div>
    );
  }

  const v = vendor as any;
  const perfData = perf as any;
  const score = Number(v.performanceScore ?? v.rating ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/app/vendors")}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Vendors
        </button>
        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground font-mono">{v.name}</span>
      </div>

      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {v.tier && <span className={`status-badge ${TIER_COLOR[v.tier] ?? ""}`}>{v.tier}</span>}
              {v.status && <span className={`status-badge capitalize ${STATUS_COLOR[v.status] ?? ""}`}>{v.status.replace(/_/g, " ")}</span>}
            </div>
            <h1 className="text-[15px] font-bold text-foreground">{v.name}</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">{v.category ?? "Technology Vendor"}</p>
          </div>
          <PermissionGate module="procurement" action="write">
            <button
              onClick={() => {
                setEditForm({ name: v.name ?? "", contactEmail: v.contactEmail ?? "", contactPhone: v.contactPhone ?? "", address: v.address ?? "", paymentTerms: v.paymentTerms ?? "", notes: v.notes ?? "" });
                setEditing(!editing);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90">
              <Edit2 className="w-3 h-3" /> {editing ? "Cancel" : "Edit"}
            </button>
          </PermissionGate>
        </div>

        {editing ? (
          <div className="px-4 py-4 border-b border-border space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Vendor Name", key: "name" },
                { label: "Contact Email", key: "contactEmail" },
                { label: "Contact Phone", key: "contactPhone" },
                { label: "Payment Terms", key: "paymentTerms" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-[11px] text-muted-foreground">{f.label}</label>
                  <input
                    className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background"
                    value={(editForm as any)[f.key]}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Address</label>
                <input
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background"
                  value={editForm.address}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-muted-foreground">Notes</label>
                <textarea
                  className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1 bg-background h-16 resize-none"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => update.mutate({ id, ...editForm })}
                disabled={update.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded disabled:opacity-50">
                <Save className="w-3 h-3" /> {update.isPending ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-2 py-1.5 border border-border text-[11px] rounded hover:bg-accent">
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0 divide-x divide-border">
            {[
              { label: "Contact Email",  value: v.contactEmail ?? "—",   icon: Mail },
              { label: "Phone",          value: v.contactPhone ?? "—",   icon: Phone },
              { label: "Address",        value: v.address ?? "—",         icon: MapPin },
              { label: "Payment Terms",  value: v.paymentTerms ?? "—",   icon: DollarSign },
              { label: "Performance",    value: score > 0 ? `${score}%` : "—", icon: TrendingUp },
              { label: "Vendor Since",   value: v.createdAt ? new Date(v.createdAt).toLocaleDateString("en-GB") : "—", icon: FileText },
            ].map((f, i) => (
              <div key={i} className={`px-4 py-3 ${i >= 3 ? "border-t border-border" : ""}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <f.icon className="w-3 h-3 text-muted-foreground/60" />
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">{f.label}</span>
                </div>
                <div className="text-[12px] font-semibold text-foreground">{f.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(perfData || score > 0) && (
        <div className="bg-card border border-border rounded px-4 py-4">
          <h3 className="text-[12px] font-semibold text-foreground/80 mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" /> Vendor Performance Scorecard
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <ScoreBar value={perfData?.deliveryScore ?? score} label="Delivery Performance" />
            <ScoreBar value={perfData?.qualityScore ?? Math.max(0, score - 5)} label="Quality Score" />
            <ScoreBar value={perfData?.slaComplianceScore ?? score} label="SLA Compliance" />
            <ScoreBar value={perfData?.responsiveness ?? Math.max(0, score - 3)} label="Responsiveness" />
          </div>
          {perfData?.totalOrders !== undefined && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-border">
              {[
                { label: "Total Orders", value: perfData.totalOrders ?? 0 },
                { label: "On-Time Delivery", value: `${perfData.onTimeRate ?? 0}%` },
                { label: "Avg Lead Time", value: `${perfData.avgLeadTimeDays ?? "—"} days` },
              ].map((k) => (
                <div key={k.label} className="bg-muted/30 rounded px-3 py-2 text-center">
                  <div className="text-[14px] font-bold text-foreground">{k.value}</div>
                  <div className="text-[10px] text-muted-foreground/70 uppercase">{k.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {v.notes && (
        <div className="bg-card border border-border rounded px-4 py-3">
          <h3 className="text-[12px] font-semibold text-foreground/80 mb-2">Notes</h3>
          <p className="text-[12px] text-muted-foreground">{v.notes}</p>
        </div>
      )}
    </div>
  );
}
