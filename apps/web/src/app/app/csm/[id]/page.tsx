"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users, ArrowLeft, ChevronRight, MessageSquare, Phone, Mail,
  Star, AlertTriangle, Send, CheckCircle2, Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, PermissionGate } from "@/lib/rbac-context";

const CASE_STATE: Record<string, string> = {
  new:               "text-blue-700 bg-blue-100",
  in_progress:       "text-orange-700 bg-orange-100",
  awaiting_customer: "text-yellow-700 bg-yellow-100",
  pending:           "text-muted-foreground bg-muted",
  resolved:          "text-green-700 bg-green-100",
  closed:            "text-muted-foreground bg-muted",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-700 bg-red-100",
  high:     "text-orange-700 bg-orange-100",
  medium:   "text-yellow-700 bg-yellow-100",
  low:      "text-green-700 bg-green-100",
};

const TERMINAL_STATES = ["resolved", "closed"];

export default function CSMCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useRBAC();
  const utils = trpc.useUtils();

  // @ts-ignore
  const { data: caseData, isLoading } = trpc.csm.cases.get.useQuery({ id });

  const [comment, setComment] = useState("");
  const [newStatus, setNewStatus] = useState("");

  // @ts-ignore
  const updateCase = trpc.csm.cases.update.useMutation({
    onSuccess: () => {
      toast.success("Case updated");
      setNewStatus("");
      // @ts-ignore
      void utils.csm.cases.get.invalidate({ id });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update case"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Loading case…</span>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <Users className="w-8 h-8 opacity-30" />
        <span className="text-sm">Case not found</span>
        <button onClick={() => router.push("/app/csm")} className="text-xs text-primary hover:underline">
          Back to CSM
        </button>
      </div>
    );
  }

  const c = caseData as any;
  const rawStatus = c.status ?? "new";
  const isTerminal = TERMINAL_STATES.includes(rawStatus);
  const stateColor = CASE_STATE[rawStatus] ?? CASE_STATE.new!;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={() => router.push("/app/csm")}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> CSM
        </button>
        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground font-mono">{c.number ?? id.slice(-8).toUpperCase()}</span>
      </div>

      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-4 border-b border-border">
          <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${c.priority === "critical" ? "bg-red-600" : c.priority === "high" ? "bg-orange-500" : "bg-yellow-400"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-[11px] text-primary">{c.number}</span>
              <span className={`status-badge capitalize ${stateColor}`}>{rawStatus.replace(/_/g, " ")}</span>
              <span className={`status-badge capitalize ${PRIORITY_COLOR[c.priority] ?? ""}`}>{c.priority}</span>
            </div>
            <h1 className="text-[15px] font-bold text-foreground">{c.title}</h1>
            {c.description && <p className="text-[12px] text-muted-foreground mt-1">{c.description}</p>}
          </div>
          {!isTerminal && can("csm", "write") && (
            <div className="flex items-center gap-2">
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                className="text-xs border border-border rounded px-2 py-1 bg-background">
                <option value="">Update Status…</option>
                <option value="in_progress">In Progress</option>
                <option value="awaiting_customer">Awaiting Customer</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              {newStatus && (
                <button
                  onClick={() => updateCase.mutate({ id, status: newStatus })}
                  disabled={updateCase.isPending}
                  className="px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50">
                  {updateCase.isPending ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          )}
        </div>

        {isTerminal && (
          <div className="px-4 py-2 bg-muted/40 border-b border-dashed border-border text-[11px] text-muted-foreground/70">
            This case is {rawStatus}. No further updates can be made.
          </div>
        )}

        <div className="grid grid-cols-4 gap-0 divide-x divide-border">
          {[
            { label: "Account", value: c.accountId ? `Account …${c.accountId.slice(-6)}` : "—", icon: Users },
            { label: "Contact", value: c.contactId ? `Contact …${c.contactId.slice(-6)}` : "—", icon: Mail },
            { label: "Opened", value: c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-GB") : "—", icon: Clock },
            { label: "Assignee", value: c.assigneeId ? `…${c.assigneeId.slice(-6)}` : "Unassigned", icon: CheckCircle2 },
          ].map((f, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <f.icon className="w-3 h-3 text-muted-foreground/60" />
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">{f.label}</span>
              </div>
              <div className="text-[12px] font-semibold text-foreground">{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {c.resolution && (
        <div className="bg-green-50 border border-green-200 rounded px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />
            <span className="text-[12px] font-semibold text-green-800">Resolution</span>
          </div>
          <p className="text-[12px] text-green-700">{c.resolution}</p>
        </div>
      )}

      {!isTerminal && can("csm", "write") && (
        <div className="bg-card border border-border rounded px-4 py-3">
          <h3 className="text-[12px] font-semibold text-foreground/80 mb-2">Add Resolution / Update</h3>
          <textarea
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background h-20 resize-none"
            placeholder="Describe the resolution or update…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2 mt-2">
            <button
              disabled={!comment.trim() || updateCase.isPending}
              onClick={() => {
                updateCase.mutate({ id, resolution: comment });
                setComment("");
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-50">
              <Send className="w-3 h-3" /> {updateCase.isPending ? "Saving…" : "Save Update"}
            </button>
            <button
              disabled={!comment.trim() || updateCase.isPending}
              onClick={() => {
                updateCase.mutate({ id, status: "resolved", resolution: comment });
                setComment("");
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-700 text-white text-[11px] rounded hover:bg-green-800 disabled:opacity-50">
              <CheckCircle2 className="w-3 h-3" /> Resolve Case
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
