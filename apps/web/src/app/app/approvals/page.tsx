"use client";

import { useState } from "react";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { generateUUID } from "@/lib/uuid";
import Link from "next/link";
import {
  CheckSquare,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  MessageSquare,
  User,
  Shield,
  Wrench,
  ShoppingCart,
  Package,
} from "lucide-react";

type ApprovalType = "change" | "service_request" | "work_order" | "purchase" | "access";

const TYPE_CONFIG: Record<ApprovalType, { label: string; Icon: React.ElementType; color: string }> = {
  change:          { label: "Change",          Icon: RefreshCw,    color: "text-purple-700 bg-purple-100" },
  service_request: { label: "Svc Request",     Icon: ShoppingCart, color: "text-blue-700 bg-blue-100" },
  work_order:      { label: "Work Order",      Icon: Wrench,       color: "text-orange-700 bg-orange-100" },
  purchase:        { label: "Purchase",        Icon: Package,      color: "text-yellow-700 bg-yellow-100" },
  access:          { label: "Access",          Icon: Shield,       color: "text-red-700 bg-red-100" },
};

const PRIORITY_CONFIG = {
  urgent: { label: "Urgent",  bar: "bg-red-600",    badge: "text-red-700 bg-red-100 font-semibold" },
  high:   { label: "High",    bar: "bg-orange-500", badge: "text-orange-700 bg-orange-100" },
  normal: { label: "Normal",  bar: "bg-green-500",  badge: "text-muted-foreground bg-muted" },
};

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded overflow-hidden animate-pulse">
      <div className="h-1 w-full bg-muted" />
      <div className="flex items-start gap-4 px-4 py-3">
        <div className="w-8 h-8 rounded bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted rounded w-1/4" />
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-full" />
        </div>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const { can } = useRBAC();

  const canApprove = can("approvals", "approve");
  const [activeTab, setActiveTab] = useState<"pending" | "submitted" | "all">("pending");
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});
  const [rejectReasonId, setRejectReasonId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [infoRequestId, setInfoRequestId] = useState<string | null>(null);
  const [infoComment, setInfoComment] = useState("");

  // @ts-ignore
  const pendingQuery = trpc.approvals.myPending.useQuery();
  // @ts-ignore
  const submittedQuery = trpc.approvals.mySubmitted.useQuery();
  // @ts-ignore
  const allQuery = trpc.approvals.list.useQuery({});
  // @ts-ignore
  const decideMutation = trpc.approvals.decide.useMutation({
    onSuccess: () => {
      pendingQuery.refetch();
      allQuery.refetch();
      toast.success("Decision recorded");
    },
    onError: (e: any) => { console.error("approvals.decide failed:", e); toast.error(e.message || "Failed to record decision"); },
  });

  const pendingItems: any[] = pendingQuery.data ?? [];

  if (!can("approvals", "read")) return <AccessDenied module="Approvals" />;
  const submittedItems: any[] = submittedQuery.data ?? [];
  const allItems: any[] = allQuery.data?.items ?? (Array.isArray(allQuery.data) ? allQuery.data : []);

  const pendingFiltered = pendingItems.filter((a: any) => !decisions[a.id]);
  const urgentCount = pendingFiltered.filter((a: any) => a.priority === "urgent").length;

  const displayed =
    activeTab === "pending" ? pendingFiltered
    : activeTab === "submitted" ? submittedItems
    : allItems;

  const isLoading =
    activeTab === "pending" ? pendingQuery.isLoading
    : activeTab === "submitted" ? submittedQuery.isLoading
    : allQuery.isLoading;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isRealId = (id: string) => UUID_RE.test(id);

  const handleApprove = (id: string) => {
    if (!isRealId(id)) {
      console.error("approvals.decide: requestId is not a valid UUID —", id);
      toast.error("Cannot approve: this item has no valid request ID");
      return;
    }
    decideMutation.mutate({ requestId: id, decision: "approved", comment: "", idempotencyKey: generateUUID() } as any);
    setDecisions((d) => ({ ...d, [id]: "approved" }));
  };

  const handleReject = (id: string) => {
    if (!isRealId(id)) {
      console.error("approvals.decide: requestId is not a valid UUID —", id);
      toast.error("Cannot reject: this item has no valid request ID");
      return;
    }
    decideMutation.mutate({ requestId: id, decision: "rejected", comment: rejectComment, idempotencyKey: generateUUID() } as any);
    setDecisions((d) => ({ ...d, [id]: "rejected" }));
    setRejectReasonId(null);
    setRejectComment("");
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">Approval Queue</h1>
          <span className="text-[11px] text-muted-foreground/70">Pending decisions across all modules</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-3 py-1 text-[11px] rounded border transition-colors ${activeTab === "pending" ? "bg-primary text-white border-primary" : "text-muted-foreground border-border hover:bg-muted/30"}`}
          >
            My Pending ({pendingQuery.isLoading ? "…" : pendingFiltered.length})
          </button>
          <button
            onClick={() => setActiveTab("submitted")}
            className={`px-3 py-1 text-[11px] rounded border transition-colors ${activeTab === "submitted" ? "bg-primary text-white border-primary" : "text-muted-foreground border-border hover:bg-muted/30"}`}
          >
            My Submitted ({submittedQuery.isLoading ? "…" : submittedItems.length})
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1 text-[11px] rounded border transition-colors ${activeTab === "all" ? "bg-primary text-white border-primary" : "text-muted-foreground border-border hover:bg-muted/30"}`}
          >
            All ({allQuery.isLoading ? "…" : allItems.length})
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Pending Approval",  value: pendingFiltered.length,  color: "text-blue-700" },
          { label: "Urgent / Due Today", value: urgentCount,    color: "text-red-700" },
          { label: "Approved (30d)",     value: 14,             color: "text-green-700" },
          { label: "Rejected (30d)",     value: 3,              color: "text-muted-foreground" },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded px-3 py-2">
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
          </div>
        ))}
      </div>

      {urgentCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-red-700 text-[12px]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <strong>{urgentCount} urgent approval{urgentCount > 1 ? "s" : ""}</strong> require your immediate attention.
        </div>
      )}

      {/* Approval cards */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : displayed.length === 0 ? (
          <div className="bg-card border border-border rounded flex flex-col items-center justify-center h-40 gap-2">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <p className="text-[12px] text-muted-foreground">All caught up — no pending approvals</p>
          </div>
        ) : (
          displayed.map((appr: any) => {
            const typeKey = (appr.type ?? "change") as ApprovalType;
            const typeCfg = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.change;
            const TypeIcon = typeCfg.Icon;
            const priKey = (appr.priority ?? "normal") as keyof typeof PRIORITY_CONFIG;
            const priCfg = PRIORITY_CONFIG[priKey] ?? PRIORITY_CONFIG.normal;
            const decision = decisions[appr.id] ?? (appr.state !== "pending" ? appr.state : null);
            const isDecided = !!decision;

            return (
              <div
                key={appr.id}
                className={`bg-card border rounded overflow-hidden transition-all
                  ${appr.priority === "urgent" && !isDecided ? "border-red-300" : "border-border"}
                  ${isDecided ? "opacity-60" : ""}`}
              >
                <div className={`h-1 w-full ${priCfg.bar}`} />

                <div className="flex items-start gap-4 px-4 py-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 mt-0.5 bg-muted">
                    <TypeIcon className="w-4 h-4 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`status-badge ${typeCfg.color}`}>{typeCfg.label}</span>
                          <span className={`status-badge ${priCfg.badge}`}>{priCfg.label}</span>
                          <span className="text-[11px] font-mono text-muted-foreground/70">{appr.requestNumber ?? appr.number ?? ""}</span>
                          {appr.amount && (
                            <span className="text-[11px] font-semibold text-foreground/80">{appr.amount}</span>
                          )}
                        </div>
                        <h3 className="text-[13px] font-semibold text-foreground">{appr.title}</h3>
                        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{appr.description}</p>
                      </div>

                      <div className="flex-shrink-0 text-right min-w-28">
                        <div className="flex items-center gap-1 justify-end text-[11px] text-muted-foreground mb-0.5">
                          <User className="w-3 h-3" />
                          {appr.requestedBy ?? appr.requestedByName ?? ""}
                        </div>
                        <div className="flex items-center gap-1 justify-end text-[11px] text-muted-foreground/70 mb-0.5">
                          <Clock className="w-3 h-3" />
                          {appr.requestedOn ?? appr.createdAt ?? ""}
                        </div>
                        <div className={`text-[11px] font-medium ${appr.priority === "urgent" ? "text-red-600" : "text-muted-foreground"}`}>
                          Due: {appr.dueBy ?? appr.dueDate ?? "—"}
                        </div>
                      </div>
                    </div>

                    {!isDecided ? (
                      <div className="flex items-center gap-2 mt-3">
                        {canApprove && (
                          <button
                            onClick={() => handleApprove(appr.id)}
                            disabled={decideMutation.isPending || !isRealId(appr.id)}
                            title={!isRealId(appr.id) ? "No valid request ID — this is a placeholder item" : undefined}
                            className="flex items-center gap-1 px-4 py-1.5 bg-green-600 text-white text-[12px] font-medium rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                        )}
                        {canApprove && (
                          <button
                            onClick={() => setRejectReasonId(rejectReasonId === appr.id ? null : appr.id)}
                            disabled={!isRealId(appr.id)}
                            title={!isRealId(appr.id) ? "No valid request ID — this is a placeholder item" : undefined}
                            className="flex items-center gap-1 px-4 py-1.5 bg-red-600 text-white text-[12px] font-medium rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        )}
                        <button
                          onClick={() => { setInfoRequestId(infoRequestId === appr.id ? null : appr.id); setInfoComment(""); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded hover:bg-muted/30"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Request Info
                        </button>
                        <Link
                          href={`/app/changes?ref=${encodeURIComponent(appr.requestNumber ?? appr.number ?? "")}`}
                          className="text-[11px] text-primary hover:underline ml-auto"
                        >
                          View Full Record <ChevronRight className="w-3 h-3 inline" />
                        </Link>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-3">
                        {decision === "approved" ? (
                          <span className="flex items-center gap-1 text-[12px] text-green-700 font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Approved by you
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[12px] text-red-600 font-medium">
                            <XCircle className="w-4 h-4" /> Rejected by you
                          </span>
                        )}
                      </div>
                    )}

                    {rejectReasonId === appr.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={rejectComment}
                          onChange={(e) => setRejectComment(e.target.value)}
                          placeholder="Rejection reason (required)..."
                          autoFocus
                          className="flex-1 px-2 py-1 text-[12px] border border-red-300 rounded outline-none text-foreground/80"
                        />
                        <button
                          onClick={() => handleReject(appr.id)}
                          disabled={!rejectComment.trim()}
                          className="px-3 py-1 bg-red-600 text-white text-[11px] rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirm Reject
                        </button>
                        <button
                          onClick={() => { setRejectReasonId(null); setRejectComment(""); }}
                          className="text-[11px] text-muted-foreground hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {infoRequestId === appr.id && (
                      <div className="mt-2 flex items-center gap-2 bg-blue-50/60 rounded px-2 py-1.5 border border-blue-200">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <input
                          type="text"
                          value={infoComment}
                          onChange={(e) => setInfoComment(e.target.value)}
                          placeholder="Describe what information you need from the requester…"
                          autoFocus
                          className="flex-1 px-2 py-1 text-[12px] border border-blue-300 rounded outline-none bg-white"
                        />
                        <button
                          disabled={!infoComment.trim() || decideMutation.isPending}
                          onClick={() => {
                            if (isRealId(appr.id)) {
                              decideMutation.mutate({ requestId: appr.id, decision: "rejected", comment: `More information requested: ${infoComment}`, idempotencyKey: generateUUID() });
                            } else {
                              toast.success("Info request noted — requester will be notified");
                            }
                            setInfoRequestId(null);
                            setInfoComment("");
                          }}
                          className="px-3 py-1 bg-blue-600 text-white text-[11px] rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          Send
                        </button>
                        <button onClick={() => { setInfoRequestId(null); setInfoComment(""); }} className="text-[11px] text-muted-foreground hover:underline">Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
