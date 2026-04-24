"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import {
  ChevronRight, Flame, Clock, Lock, Globe, Edit2, Check, X,
  AlertTriangle, MessageSquare, Activity, Paperclip, User,
  Tag, RefreshCw, CheckCircle2, XCircle, ArrowUpCircle,
  Printer, Copy, MoreHorizontal, Star, Eye, CalendarDays, Sparkles, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_COLORS: Record<string, string> = {
  incident: "text-red-700 bg-red-100",
  request:  "text-blue-700 bg-blue-100",
  problem:  "text-purple-700 bg-purple-100",
  change:   "text-cyan-700 bg-cyan-100",
};

const URGENCY_COLORS: Record<string, { bar: string; text: string; badge: string }> = {
  high:   { bar: "bg-red-600",    text: "text-red-700",    badge: "bg-red-100 text-red-700" },
  medium: { bar: "bg-yellow-500", text: "text-yellow-600", badge: "bg-yellow-100 text-yellow-700" },
  low:    { bar: "bg-green-500",  text: "text-green-700",  badge: "bg-green-100 text-green-700" },
};

const IMPACT_LABEL: Record<string, string> = {
  high: "High Impact", medium: "Medium Impact", low: "Low Impact",
};

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  created:       CheckCircle2,
  updated:       Edit2,
  comment_added: MessageSquare,
  note_added:    Lock,
  assigned:      User,
  bulk_updated:  RefreshCw,
};

function FieldRow({
  label,
  children,
  editing,
  onEdit,
}: {
  label: string;
  children: React.ReactNode;
  editing?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="group flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="field-label w-32 flex-shrink-0 mt-0.5">{label}</span>
      <span className="field-value flex-1 min-w-0">{children}</span>
      {onEdit && !editing && (
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/70 hover:text-primary transition-opacity"
          title="Edit field"
        >
          <Edit2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function ActivityIcon({ action }: { action: string }) {
  const Icon = ACTIVITY_ICON[action] ?? Activity;
  return <Icon className="w-3.5 h-3.5" />;
}

function formatDt(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("en-IN", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function relativeTime(d: string | Date) {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, can, mergeTrpcQueryOpts } = useRBAC();
  const [activeTab, setActiveTab] = useState<"notes" | "activity" | "related">("notes");
  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Action panel state
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [showResolvePanel, setShowResolvePanel] = useState(false);
  const [showClosePanel, setShowClosePanel] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [watching, setWatching] = useState(false);

  const { data, isLoading, refetch } = trpc.tickets.get.useQuery({ id }, mergeTrpcQueryOpts("tickets.get", undefined));
  const { data: statusCounts } = trpc.tickets.statusCounts.useQuery(undefined, mergeTrpcQueryOpts("tickets.statusCounts", {
    refetchOnWindowFocus: false,
  }));

  const toggleWatch = trpc.tickets.toggleWatch.useMutation({
    onSuccess: (res) => { setWatching(res.watching); toast.success(res.watching ? "Added to watchlist" : "Removed from watchlist"); },
    onError: (e) => toast.error(e?.message ?? "Failed to update watchlist"),
  });

  const addComment = trpc.tickets.addComment.useMutation({
    onSuccess: () => { setCommentBody(""); refetch(); },
    onError: (e) => toast.error(e?.message ?? "Something went wrong"),
  });
  const updateTicket = trpc.tickets.update.useMutation({
    onSuccess: () => { setEditingField(null); setShowResolvePanel(false); setShowClosePanel(false); refetch(); toast.success("Ticket updated"); },
    onError: (e) => toast.error(e?.message ?? "Something went wrong"),
  });
  const assignTicket = trpc.tickets.assign.useMutation({
    onSuccess: () => { setShowAssignPanel(false); setAssigneeId(""); refetch(); toast.success("Ticket assigned"); },
    onError: (e) => toast.error(e?.message ?? "Something went wrong"),
  });

  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState<"blocks" | "blocked_by" | "duplicate" | "related">("related");
  const addRelation = trpc.tickets.addRelation.useMutation({
    onSuccess: () => { setRelationTargetId(""); refetch(); toast.success("Ticket linked"); },
    onError: (e) => toast.error(e?.message ?? "Could not add link"),
  });
  const removeRelation = trpc.tickets.removeRelation.useMutation({
    onSuccess: () => { refetch(); toast.success("Link removed"); },
    onError: (e) => toast.error(e?.message ?? "Could not remove link"),
  });
  const linkKnowledgeArticle = trpc.tickets.linkKnowledgeArticle.useMutation({
    onSuccess: () => { refetch(); toast.success("Article linked to ticket"); },
    onError: (e) => toast.error(e?.message ?? "Could not link article"),
  });
  const unlinkKnowledgeArticle = trpc.tickets.unlinkKnowledgeArticle.useMutation({
    onSuccess: () => { refetch(); toast.success("Article unlinked"); },
    onError: (e) => toast.error(e?.message ?? "Could not unlink article"),
  });

  const { data: usersData } = trpc.auth.listUsers.useQuery(undefined, mergeTrpcQueryOpts("auth.listUsers", {
    enabled: showAssignPanel,
    staleTime: 5 * 60_000,
  }));

  const { data: ciOptions } = trpc.assets.cmdb.list.useQuery(undefined, mergeTrpcQueryOpts("assets.cmdb.list", {
    enabled: can("cmdb", "read"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  }));
  const { data: knownErrorOptions } = trpc.changes.listKnownErrors.useQuery(undefined, mergeTrpcQueryOpts("changes.listKnownErrors", {
    enabled: can("problems", "read"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  }));

  // Related records — loaded lazily when tab is activated
  const relatedEnabled = activeTab === "related";
  const { data: relatedProblems } = trpc.changes.listProblems.useQuery({ limit: 10 }, mergeTrpcQueryOpts("changes.listProblems", { enabled: relatedEnabled, staleTime: 60_000 }));
  const { data: relatedChangesData } = trpc.changes.list.useQuery({ limit: 10 }, mergeTrpcQueryOpts("changes.list", { enabled: relatedEnabled, staleTime: 60_000 }));
  const relatedChanges = relatedChangesData?.items;

  // AI assistance — lazy queries enabled only when user explicitly requests
  const [aiEnabled, setAiEnabled] = useState(false);
  const { data: aiSummary, isFetching: summaryLoading } = trpc.ai.summarizeTicket.useQuery({ ticketId: id }, mergeTrpcQueryOpts("ai.summarizeTicket", { enabled: aiEnabled, retry: false, staleTime: 5 * 60_000 }));
  const { data: aiSuggestion, isFetching: suggestionLoading } = trpc.ai.suggestResolution.useQuery({ ticketId: id }, mergeTrpcQueryOpts("ai.suggestResolution", { enabled: aiEnabled, retry: false, staleTime: 5 * 60_000 }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60 text-[12px] text-muted-foreground/70">
        Loading ticket...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-60 text-[12px] text-red-500">
        Ticket not found.
      </div>
    );
  }

  const {
    ticket,
    comments: rawComments,
    activityLog: rawActivityLog,
    relations: rawRelations,
    suggestedKbArticles: rawSuggestedKb,
    linkedKbArticles: rawLinkedKb,
  } = data as typeof data & {
    relations?: Array<{
      id: string;
      type: string;
      direction: "outgoing" | "incoming";
      relatedTicketId: string;
      relatedNumber: string;
      relatedTitle: string;
    }>;
    suggestedKbArticles?: Array<{ id: string; title: string; viewCount: number; helpfulCount: number }>;
    linkedKbArticles?: Array<{ id: string; title: string; viewCount: number; helpfulCount: number }>;
  };
  const suggestedKbArticles = rawSuggestedKb ?? [];
  const linkedKbArticles = rawLinkedKb ?? [];
  const configurationItem = (data as any).configurationItem as
    | { id: string; name: string; ciType: string; status: string }
    | null
    | undefined;
  const knownErrorLinked = (data as any).knownError as { id: string; title: string } | null | undefined;
  const ciDownstreamCount = Number((data as any).ciDownstreamCount ?? 0);
  const relations = rawRelations ?? [];
  const comments: any[] = rawComments ?? [];
  const activityLog: any[] = rawActivityLog ?? [];
  const urgency = (ticket.urgency ?? "medium") as "high" | "medium" | "low";
  const impact  = (ticket.impact  ?? "medium") as "high" | "medium" | "low";
  const uCfg = URGENCY_COLORS[urgency];
  const typeBadge = TYPE_COLORS[ticket.type ?? "incident"];

  // Terminal state — lock all write actions
  const TERMINAL_STATUS_NAMES = ["closed", "resolved", "cancelled", "done"];
  const currentStatusName = (statusCounts?.find((s: any) => s.statusId === ticket.statusId)?.name ?? "").toLowerCase();
  const isTerminal = TERMINAL_STATUS_NAMES.some((t) => currentStatusName.includes(t)) || !!ticket.closedAt || !!ticket.resolvedAt;
  const terminalLabel = ticket.closedAt ? "Closed" : ticket.resolvedAt ? "Resolved" : currentStatusName ? currentStatusName.charAt(0).toUpperCase() + currentStatusName.slice(1) : "Closed";

  const slaOverdueMs =
    ticket.slaResolveDueAt
      ? Date.now() - new Date(ticket.slaResolveDueAt).getTime()
      : -1;
  const slaOverdue = slaOverdueMs > 0;
  const slaOverdueHrs = Math.floor(slaOverdueMs / 3600000);

  return (
    <div className="flex flex-col gap-3">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/tickets" className="hover:text-primary">
          Incidents
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-muted-foreground font-medium">{ticket.number}</span>
      </nav>

      {/* SLA breach banner — hidden when ticket is already terminal */}
      {ticket.slaBreached && !isTerminal && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-red-700 text-[12px]">
          <Flame className="w-4 h-4 flex-shrink-0" />
          <strong>SLA Breached</strong>
          {slaOverdue && (
            <span> — Overdue by {slaOverdueHrs > 0 ? `${slaOverdueHrs}h` : "<1h"}.</span>
          )}
          <span className="ml-1">Immediate escalation required.</span>
          <button
            onClick={() => updateTicket.mutate({ id, data: { tags: [...(ticket.tags ?? []), "escalated"] } })}
            disabled={updateTicket.isPending}
            className="ml-auto flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-[11px] font-medium hover:bg-red-700 disabled:opacity-50">
            <ArrowUpCircle className="w-3 h-3" /> Escalate
          </button>
        </div>
      )}

      {/* Terminal state banner */}
      {isTerminal && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded text-muted-foreground text-[12px]">
          <Lock className="w-4 h-4 flex-shrink-0 text-muted-foreground/60" />
          <span className="font-semibold text-foreground/70">{terminalLabel}</span>
          <span className="text-muted-foreground/70">— This ticket is {terminalLabel.toLowerCase()}. All write actions are disabled.</span>
          {(ticket.closedAt || ticket.resolvedAt) && (
            <span className="ml-auto text-[11px] text-muted-foreground/60">{formatDt((ticket.closedAt ?? ticket.resolvedAt) as string)}</span>
          )}
        </div>
      )}

      {/* Record header */}
      <div className="bg-card border border-border rounded">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-border">
          <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${uCfg?.bar ?? "bg-border"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1.5 mb-1">
                  <span className="text-[11px] font-mono text-muted-foreground">{ticket.number}</span>
                  <span className={`status-badge ${typeBadge} capitalize`}>{ticket.type}</span>
                  <span className={`status-badge capitalize ${uCfg?.badge ?? "bg-muted text-muted-foreground"}`}>
                    {urgency} urgency
                  </span>
                  <span className="status-badge bg-muted text-muted-foreground capitalize">
                    {IMPACT_LABEL[impact]}
                  </span>
                  {ticket.slaBreached && (
                    <span className="status-badge text-red-700 bg-red-100 font-semibold">
                      <Flame className="w-2.5 h-2.5 inline mr-0.5" />SLA Breached
                    </span>
                  )}
                  {ticket.tags?.map((t: string) => (
                    <span key={t} className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded">
                      {t}
                    </span>
                  ))}
                </div>

                {/* Editable title */}
                {editingField === "title" ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editValues.title ?? ticket.title}
                      onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                      className="flex-1 text-sm font-semibold border-b border-primary outline-none bg-transparent text-foreground"
                    />
                    <button
                      onClick={() =>
                        updateTicket.mutate({ id: ticket.id, data: { title: editValues.title } })
                      }
                      className="text-green-600"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingField(null)} className="text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <h2
                    className={`text-sm font-semibold text-foreground group flex items-start gap-1 ${!isTerminal ? "cursor-pointer hover:text-primary" : "cursor-default"}`}
                    onClick={isTerminal ? undefined : () => {
                      setEditingField("title");
                      setEditValues((v) => ({ ...v, title: ticket.title }));
                    }}
                  >
                    {ticket.title}
                    {!isTerminal && <Edit2 className="w-3 h-3 mt-0.5 opacity-0 group-hover:opacity-60 flex-shrink-0" />}
                  </h2>
                )}
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  disabled={isTerminal}
                  onClick={() => { if (!isTerminal) { setEditingField("title"); setEditValues((v) => ({ ...v, title: ticket.title })); } }}
                  className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                <button
                  disabled={isTerminal || !can("incidents", "assign")}
                  onClick={() => setShowAssignPanel((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-border rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <User className="w-3 h-3" /> Assign
                </button>
                <button
                  disabled={isTerminal || !can("incidents", "write") || updateTicket.isPending}
                  onClick={() => setShowResolvePanel((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-green-300 rounded hover:bg-green-50 text-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-3 h-3" /> {updateTicket.isPending ? "…" : "Resolve"}
                </button>
                <button
                  disabled={isTerminal || !can("incidents", "write") || updateTicket.isPending}
                  onClick={() => setShowClosePanel((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 text-[11px] border border-slate-300 rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-3 h-3" /> {updateTicket.isPending ? "…" : "Close"}
                </button>
                <div className="relative">
                <button
                  onClick={() => setShowMoreActions((v) => !v)}
                  className="p-1.5 border border-border rounded hover:bg-muted/30 text-muted-foreground"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {showMoreActions && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-card border border-border rounded shadow-lg py-1">
                    <button onClick={() => { setShowMoreActions(false); setActiveTab("related"); }} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/40">View Related Items</button>
                    <button onClick={() => { setShowMoreActions(false); router.push(`/app/problems`); }} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/40">Create Problem</button>
                    <button onClick={() => { setShowMoreActions(false); router.push(`/app/changes/new?source=ticket&ticket=${id}`); }} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/40">Create Change</button>
                    <button onClick={() => { setShowMoreActions(false); toggleWatch.mutate({ ticketId: id }); }} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/40">{watching ? "Unwatch" : "Watch"}</button>
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Assign inline panel ── */}
        {showAssignPanel && (
          <div className="mx-4 mb-0 px-4 py-3 bg-blue-50 border-x border-b border-blue-200 rounded-b flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-blue-800 font-medium whitespace-nowrap">Assign to:</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="flex-1 min-w-[160px] rounded border border-blue-300 bg-white px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:border-blue-500"
            >
              <option value="">— select agent —</option>
              <option value={currentUser.id}>Me ({currentUser.name})</option>
              {usersData
                ?.filter((u: any) => u.id !== currentUser.id)
                .map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
            </select>
            <button
              disabled={assignTicket.isPending || !assigneeId}
              onClick={() => assignTicket.mutate({ id, assigneeId })}
              className="px-3 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {assignTicket.isPending ? "…" : "Assign"}
            </button>
            <button
              disabled={assignTicket.isPending}
              onClick={() => assignTicket.mutate({ id, assigneeId: null })}
              className="px-3 py-1 rounded border border-blue-300 text-blue-700 text-[11px] hover:bg-blue-100 disabled:opacity-50"
            >
              Unassign
            </button>
            <button onClick={() => { setShowAssignPanel(false); setAssigneeId(""); }} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">✕ Cancel</button>
          </div>
        )}

        {/* ── Resolve inline panel ── */}
        {showResolvePanel && (
          <div className="mx-4 mb-0 px-4 py-3 bg-green-50 border-x border-b border-green-200 rounded-b flex items-center gap-3">
            <span className="text-[11px] text-green-800 font-medium">Resolution note (optional):</span>
            <input
              className="flex-1 max-w-xs text-xs border border-green-300 rounded px-2 py-1 bg-white"
              placeholder="Briefly describe how this was resolved…"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
            />
            <button
              disabled={updateTicket.isPending}
              onClick={() => {
                const resolvedStatus = statusCounts?.find((st: { name: string; statusId: string }) => st.name.toLowerCase() === "resolved");
                if (!resolvedStatus) { toast.error("No 'Resolved' status configured — check Admin → SLA Definitions"); return; }
                updateTicket.mutate({ id, data: { statusId: resolvedStatus.statusId } });
              }}
              className="px-3 py-1 rounded bg-green-600 text-white text-[11px] font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {updateTicket.isPending ? "…" : "✓ Mark Resolved"}
            </button>
            <button onClick={() => setShowResolvePanel(false)} className="text-[11px] text-muted-foreground hover:text-foreground">✕ Cancel</button>
          </div>
        )}

        {/* ── Close inline panel ── */}
        {showClosePanel && (
          <div className="mx-4 mb-0 px-4 py-3 bg-slate-50 border-x border-b border-slate-200 rounded-b flex items-center gap-3">
            <span className="text-[11px] text-slate-700 font-medium">Close this ticket?</span>
            <button
              disabled={updateTicket.isPending}
              onClick={() => {
                const closedStatus = statusCounts?.find((st: { name: string; statusId: string }) => ["closed", "done"].includes(st.name.toLowerCase()));
                if (!closedStatus) { toast.error("No 'Closed' status configured — check Admin → SLA Definitions"); return; }
                updateTicket.mutate({ id, data: { statusId: closedStatus.statusId } });
              }}
              className="px-3 py-1 rounded bg-slate-700 text-white text-[11px] font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {updateTicket.isPending ? "…" : "✕ Close Ticket"}
            </button>
            <button onClick={() => setShowClosePanel(false)} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-3">
        {/* Left — tabs */}
        <div className="flex-1 min-w-0 flex flex-col gap-0">
          <div className="flex border-b border-border bg-card rounded-t border-x border-t">
            {(["notes", "activity", "related"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                data-testid={`ticket-tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors capitalize
                  ${activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground/80"
                  }`}
              >
                {tab === "notes"
                  ? `Notes & Comments (${comments.length})`
                  : tab === "activity"
                    ? `Activity Log (${activityLog.length})`
                    : "Related Records"}
              </button>
            ))}
          </div>

          <div className="bg-card border-x border-b border-border rounded-b">
            {/* Notes tab */}
            {activeTab === "notes" && (
              <div className="p-4 space-y-4">
                {(can("knowledge", "read") || linkedKbArticles.length > 0) && (
                  <div className="border border-border rounded" data-testid="ticket-knowledge-panel">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Knowledge
                      </span>
                      <Link href="/app/knowledge" className="text-[11px] text-primary hover:underline">
                        Browse KB →
                      </Link>
                    </div>
                    <div className="p-3 space-y-3 text-[12px]">
                      {linkedKbArticles.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">Linked</div>
                          <ul className="space-y-1.5">
                            {linkedKbArticles.map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2">
                                <Link
                                  href={`/app/knowledge/${a.id}`}
                                  className="text-primary hover:underline truncate min-w-0"
                                >
                                  {a.title}
                                </Link>
                                {!isTerminal && can("incidents", "write") && (
                                  <button
                                    type="button"
                                    className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                                    disabled={unlinkKnowledgeArticle.isPending}
                                    onClick={() =>
                                      unlinkKnowledgeArticle.mutate({ ticketId: ticket.id, articleId: a.id })
                                    }
                                  >
                                    Remove
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {can("knowledge", "read") && suggestedKbArticles.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground mb-1">Suggested</div>
                          <ul className="space-y-1.5">
                            {suggestedKbArticles.map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2">
                                <Link
                                  href={`/app/knowledge/${a.id}`}
                                  className="text-foreground/80 hover:underline truncate min-w-0"
                                >
                                  {a.title}
                                </Link>
                                {!isTerminal && can("incidents", "write") && (
                                  <button
                                    type="button"
                                    className="shrink-0 text-[10px] font-medium text-primary hover:underline"
                                    disabled={linkKnowledgeArticle.isPending}
                                    onClick={() =>
                                      linkKnowledgeArticle.mutate({ ticketId: ticket.id, articleId: a.id })
                                    }
                                  >
                                    Link
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {linkedKbArticles.length === 0 &&
                        (!can("knowledge", "read") || suggestedKbArticles.length === 0) && (
                          <p className="text-[11px] text-muted-foreground/70 italic">
                            {can("knowledge", "read")
                              ? "No KB matches this ticket title yet. Publish articles or link them from the knowledge base."
                              : "No articles linked to this ticket."}
                          </p>
                        )}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="p-3 bg-muted/30 border border-border rounded">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Description</div>
                  <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                    {ticket.description ?? "No description provided."}
                  </p>
                </div>

                {/* Comment composer */}
                <div className={`border border-border rounded ${isTerminal ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                    <button
                      disabled={isTerminal}
                      onClick={() => setIsInternal(false)}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded disabled:cursor-not-allowed ${!isInternal ? "bg-blue-100 text-blue-700 font-medium" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      <Globe className="w-3 h-3" /> Customer Reply
                    </button>
                    <button
                      disabled={isTerminal}
                      onClick={() => setIsInternal(true)}
                      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded disabled:cursor-not-allowed ${isInternal ? "bg-yellow-100 text-yellow-700 font-medium" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      <Lock className="w-3 h-3" /> Work Note (Internal)
                    </button>
                    <span className="ml-auto text-[10px] text-muted-foreground/60">
                      {isTerminal ? "Commenting disabled on closed tickets" : <>Posting as <span className="font-medium text-foreground/70">{currentUser.name}</span></>}
                    </span>
                  </div>
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    disabled={isTerminal}
                    rows={3}
                    placeholder={isTerminal ? "This ticket is closed — comments are disabled." : isInternal ? "Add internal work note (not visible to requester)..." : "Reply to requester..."}
                    className="w-full px-3 py-2 text-[12px] text-foreground/80 resize-none outline-none disabled:bg-muted/30 disabled:cursor-not-allowed"
                  />
                  <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <label className={`p-1 text-muted-foreground/70 ${!isTerminal ? "hover:text-muted-foreground cursor-pointer" : "cursor-not-allowed opacity-40"}`} title="Attach file">
                        <Paperclip className="w-3.5 h-3.5" />
                        {!isTerminal && <input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) toast.info(`Attachment "${f.name}" noted — file uploads will be stored once cloud storage is configured.`); e.target.value = ""; }} />}
                      </label>
                      <span className="text-[11px] text-muted-foreground/70">
                        {isTerminal
                          ? "Ticket is closed"
                          : isInternal
                          ? "Internal note — not visible to requester"
                          : "This message will be sent to the requester"}
                      </span>
                    </div>
                    <button
                      disabled={isTerminal || !commentBody.trim() || addComment.isPending}
                      onClick={() =>
                        addComment.mutate({
                          ticketId: ticket.id,
                          body: commentBody,
                          isInternal,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-[11px] rounded hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {addComment.isPending ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>

                {/* Comments */}
                <div className="space-y-3">
                  {comments.map((comment: any) => {
                    const authorInitials = comment.authorName
                      ? comment.authorName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                      : "?";
                    const authorDisplay = comment.authorName ?? "Agent";
                    return (
                    <div
                      key={comment.id}
                      className={`rounded border p-3 ${
                        comment.isInternal
                          ? "bg-yellow-50 border-yellow-200"
                          : "bg-card border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-semibold">
                            {authorInitials}
                          </span>
                          <span className="text-[12px] font-semibold text-foreground/80">{authorDisplay}</span>
                          {comment.isInternal && (
                            <span className="status-badge text-yellow-700 bg-yellow-100">
                              <Lock className="w-2.5 h-2.5 inline mr-0.5" /> Work Note
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground/70">
                          {relativeTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-[12px] text-foreground/80 whitespace-pre-wrap">{comment.body}</p>
                    </div>
                    );
                  })}
                  {comments.length === 0 && (
                    <p className="text-center text-[12px] text-muted-foreground/70 py-4">No comments yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Activity Log */}
            {activeTab === "activity" && (
              <div className="p-4">
                <div className="space-y-0">
                  {activityLog.map((entry: any, i: number) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
                            ${entry.action === "created" ? "bg-green-100 text-green-600"
                              : entry.action.includes("comment") ? "bg-blue-100 text-blue-600"
                              : entry.action.includes("note") ? "bg-yellow-100 text-yellow-600"
                              : "bg-muted text-muted-foreground"
                            }`}
                        >
                          <ActivityIcon action={entry.action} />
                        </div>
                        {i < activityLog.length - 1 && (
                          <div className="w-px flex-1 bg-border my-1" />
                        )}
                      </div>
                      <div className="pb-4 min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12px] font-medium text-foreground/80 capitalize">
                            {entry.action.replace(/_/g, " ")}
                          </span>
                          <span className="text-[11px] text-muted-foreground/70">
                            by {entry.userName ?? "System"} · {relativeTime(entry.createdAt)}
                          </span>
                        </div>
                        {entry.changes && Object.keys(entry.changes).length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {Object.entries(entry.changes).map(([field, change]: [string, any]) => (
                              <div key={field} className="text-[11px] text-muted-foreground">
                                <span className="font-medium text-muted-foreground">{field}</span>
                                {" changed"}
                                {change.from != null && (
                                  <span>
                                    {" from "}
                                    <span className="line-through text-muted-foreground/70">
                                      {String(change.from)}
                                    </span>
                                  </span>
                                )}
                                {change.to != null && (
                                  <span>
                                    {" to "}
                                    <span className="font-medium text-foreground/80">
                                      {String(change.to)}
                                    </span>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {activityLog.length === 0 && (
                    <p className="text-center text-[12px] text-muted-foreground/70 py-4">No activity yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Related */}
            {activeTab === "related" && (
              <div className="p-4 space-y-3" data-testid="ticket-related-panel">
                {/* Linked tickets (ticket_relations) */}
                <div className="border border-border rounded" data-testid="ticket-linked-tickets">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border">
                    <span className="text-[11px] font-semibold text-muted-foreground">Linked tickets</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {relations.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground/70 italic" data-testid="ticket-linked-empty">
                        No ticket-to-ticket links yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border rounded border border-border" data-testid="ticket-linked-list">
                        {relations.map((r) => (
                          <li key={r.id} data-testid="ticket-linked-row" className="flex items-center justify-between gap-2 px-2 py-1.5 text-[12px]">
                            <div className="min-w-0">
                              <Link href={`/app/tickets/${r.relatedTicketId}`} className="font-mono text-primary hover:underline">
                                {r.relatedNumber || r.relatedTicketId.slice(0, 8)}
                              </Link>
                              <span className="text-muted-foreground/70 mx-1">·</span>
                              <span className="text-muted-foreground capitalize">{r.type.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-muted-foreground/60 ml-1">({r.direction})</span>
                              {r.relatedTitle ? (
                                <p className="truncate text-foreground/80 text-[11px] mt-0.5">{r.relatedTitle}</p>
                              ) : null}
                            </div>
                            {can("incidents", "write") && !isTerminal ? (
                              <button
                                type="button"
                                data-testid="ticket-relation-remove"
                                className="text-[11px] text-red-600 hover:underline flex-shrink-0"
                                onClick={() => removeRelation.mutate({ relationId: r.id, ticketId: id })}
                              >
                                Remove
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {can("incidents", "write") && !isTerminal ? (
                      <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-border mt-2">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-muted-foreground">Target ticket ID</label>
                          <input
                            data-testid="ticket-relation-target-id"
                            value={relationTargetId}
                            onChange={(e) => setRelationTargetId(e.target.value.trim())}
                            placeholder="UUID of other ticket"
                            className="text-[12px] border border-border rounded px-2 py-1 w-64 font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-muted-foreground">Relation</label>
                          <select
                            data-testid="ticket-relation-type"
                            value={relationType}
                            onChange={(e) => setRelationType(e.target.value as typeof relationType)}
                            className="text-[12px] border border-border rounded px-2 py-1"
                          >
                            <option value="related">Related</option>
                            <option value="blocks">Blocks</option>
                            <option value="blocked_by">Blocked by</option>
                            <option value="duplicate">Duplicate</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          data-testid="ticket-relation-add"
                          disabled={addRelation.isPending || relationTargetId.length < 32}
                          onClick={() =>
                            addRelation.mutate({
                              ticketId: id,
                              targetTicketId: relationTargetId,
                              type: relationType,
                            })
                          }
                          className="text-[12px] px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
                        >
                          Add link
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Linked Problems */}
                <div className="border border-border rounded">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">Linked Problem Records</span>
                    <Link href="/app/problems" className="text-[11px] text-primary hover:underline">View All →</Link>
                  </div>
                  {!relatedProblems || (relatedProblems as any[]).length === 0 ? (
                    <div className="p-3 text-[12px] text-muted-foreground/70 italic">No problem records found</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(relatedProblems as any[]).slice(0, 5).map((p: any) => (
                        <Link key={p.id} href={`/app/problems/${p.id}`}
                          className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-primary">{p.number ?? p.id.slice(0,8)}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                p.status === "known_error" ? "bg-red-100 text-red-700" :
                                p.status === "root_cause_analysis" ? "bg-orange-100 text-orange-700" :
                                p.status === "resolved" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                              }`}>{p.status?.replace(/_/g," ") ?? "new"}</span>
                            </div>
                            <p className="text-[12px] text-foreground/80 mt-0.5 truncate max-w-xs">{p.title}</p>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${
                            p.priority === "critical" || p.priority === "1_critical" ? "bg-red-100 text-red-700" :
                            p.priority === "high" || p.priority === "2_high" ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                          }`}>{p.priority?.replace(/_/g," ") ?? "low"}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Linked Changes */}
                <div className="border border-border rounded">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">Change Requests</span>
                    <Link href="/app/changes" className="text-[11px] text-primary hover:underline">View All →</Link>
                  </div>
                  {!relatedChanges || (relatedChanges as any[]).length === 0 ? (
                    <div className="p-3 text-[12px] text-muted-foreground/70 italic">No change requests found</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(relatedChanges as any[]).slice(0, 5).map((c: any) => (
                        <Link key={c.id} href={`/app/changes/${c.id}`}
                          className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-primary">{(c as any).number ?? c.id.slice(0,8)}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                c.status === "approved" ? "bg-green-100 text-green-700" :
                                c.status === "implementation" ? "bg-orange-100 text-orange-700" :
                                c.status === "complete" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                              }`}>{c.status?.replace(/_/g," ") ?? "draft"}</span>
                            </div>
                            <p className="text-[12px] text-foreground/80 mt-0.5 truncate max-w-xs">{c.title}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground/70 capitalize">{c.type ?? "normal"}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-64 flex-shrink-0 space-y-3">
          {/* Status & Priority */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Incident Details
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Number">{ticket.number}</FieldRow>
              <FieldRow label="Type">
                <span className={`status-badge capitalize ${TYPE_COLORS[ticket.type] ?? ""}`}>
                  {ticket.type}
                </span>
              </FieldRow>
              <FieldRow label="Status">
                {!isTerminal && can("incidents", "write") && statusCounts && statusCounts.length > 0 ? (
                  <select
                    data-testid="ticket-status-select"
                    disabled={updateTicket.isPending}
                    className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                    value={ticket.statusId ?? ""}
                    onChange={(e) =>
                      updateTicket.mutate({
                        id,
                        data: { statusId: e.target.value },
                      })
                    }
                  >
                    {(statusCounts as { statusId: string; name: string }[]).map((st) => (
                      <option key={st.statusId} value={st.statusId}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {(statusCounts as { statusId: string; name: string }[] | undefined)?.find(
                      (s) => s.statusId === ticket.statusId,
                    )?.name ?? "—"}
                  </span>
                )}
              </FieldRow>
              {(ticket as any).isMajorIncident && (
                <FieldRow label="Major">
                  <span className="text-[10px] font-semibold uppercase text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                    Major incident
                  </span>
                </FieldRow>
              )}
              <FieldRow label="Urgency">
                <span className={`text-[11px] font-semibold capitalize ${uCfg?.text ?? ""}`}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${uCfg?.bar}`} />
                  {urgency}
                </span>
              </FieldRow>
              <FieldRow label="Impact">
                <span className="text-[11px] text-muted-foreground capitalize">{IMPACT_LABEL[impact]}</span>
              </FieldRow>
            </div>
          </div>

          {/* Assignment */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Assignment
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Assigned to">
                {ticket.assigneeId ? (
                  <span className="flex items-center gap-1">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-semibold">
                      TS
                    </span>
                    <span className="text-foreground/80">Tech Support</span>
                  </span>
                ) : (
                  <span className="text-red-500 text-[11px] font-medium">⚠ Unassigned</span>
                )}
              </FieldRow>
              <FieldRow label="Team">
                <span className="text-muted-foreground">{ticket.teamId ? "Service Desk" : "—"}</span>
              </FieldRow>
              <FieldRow label="Requester">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <span className="w-5 h-5 rounded-full bg-border text-muted-foreground text-[9px] flex items-center justify-center font-semibold">
                    SU
                  </span>
                  System Admin
                </span>
              </FieldRow>
            </div>
          </div>

          {/* SLA */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                SLA & Dates
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Response Due">
                {ticket.slaResponseDueAt ? (
                  <span
                    className={
                      new Date(ticket.slaResponseDueAt) < new Date()
                        ? "text-red-600 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {formatDt(ticket.slaResponseDueAt)}
                  </span>
                ) : "—"}
              </FieldRow>
              <FieldRow label="Resolve Due">
                {ticket.slaResolveDueAt ? (
                  <span
                    className={
                      new Date(ticket.slaResolveDueAt) < new Date()
                        ? "text-red-600 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {formatDt(ticket.slaResolveDueAt)}
                  </span>
                ) : "—"}
              </FieldRow>
              <FieldRow label="Opened">{formatDt(ticket.createdAt)}</FieldRow>
              <FieldRow label="Updated">{formatDt(ticket.updatedAt)}</FieldRow>
              {ticket.resolvedAt && (
                <FieldRow label="Resolved">{formatDt(ticket.resolvedAt)}</FieldRow>
              )}
              {ticket.closedAt && (
                <FieldRow label="Closed">{formatDt(ticket.closedAt)}</FieldRow>
              )}
              {ticket.dueDate && (
                <FieldRow label="Due Date">{formatDt(ticket.dueDate)}</FieldRow>
              )}
            </div>
          </div>

          {/* Classification */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Classification
              </span>
            </div>
            <div className="px-3 py-1">
              <FieldRow label="Category">
                <span className="text-muted-foreground">{ticket.categoryId ?? "—"}</span>
              </FieldRow>
              <FieldRow label="Tags">
                {ticket.tags?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {ticket.tags.map((t: string) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </FieldRow>
              <FieldRow label="Intake">
                {!isTerminal && can("incidents", "write") ? (
                  <select
                    disabled={updateTicket.isPending}
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] capitalize"
                    value={(ticket as any).intakeChannel ?? "portal"}
                    onChange={(e) =>
                      updateTicket.mutate({
                        id: ticket.id,
                        data: { intakeChannel: e.target.value as "portal" | "email" | "api" | "chat" },
                      })
                    }
                  >
                    {(["portal", "email", "api", "chat"] as const).map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="capitalize text-muted-foreground">{(ticket as any).intakeChannel ?? "portal"}</span>
                )}
              </FieldRow>
            </div>
          </div>

          {(can("cmdb", "read") || can("problems", "read") || can("incidents", "write")) && (
            <div className="bg-card border border-border rounded">
              <div className="px-3 py-2 border-b border-border bg-muted/30">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Service linkage
                </span>
                <p className="text-[9px] text-muted-foreground/80 mt-0.5">CMDB, known errors, major flag (Phases B/C)</p>
              </div>
              <div className="px-3 py-2 space-y-2 text-[11px]">
                {can("cmdb", "read") && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">Configuration item</label>
                    <select
                      disabled={isTerminal || !can("incidents", "write") || updateTicket.isPending}
                      className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
                      value={(ticket as any).configurationItemId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateTicket.mutate({
                          id: ticket.id,
                          data: { configurationItemId: v ? v : null },
                        });
                      }}
                    >
                      <option value="">— None —</option>
                      {(ciOptions as any[] | undefined)?.map((ci: any) => (
                        <option key={ci.id} value={ci.id}>
                          {ci.name} ({ci.ciType})
                        </option>
                      ))}
                    </select>
                    {configurationItem && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Linked: <span className="font-medium text-foreground">{configurationItem.name}</span>
                        {ciDownstreamCount > 0 ? ` · ${ciDownstreamCount} downstream CI(s)` : null}{" "}
                        <Link href="/app/cmdb" className="text-primary hover:underline">
                          CMDB
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                {can("problems", "read") && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">Known error</label>
                    <select
                      disabled={isTerminal || !can("incidents", "write") || updateTicket.isPending}
                      className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px]"
                      value={(ticket as any).knownErrorId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateTicket.mutate({
                          id: ticket.id,
                          data: { knownErrorId: v ? v : null },
                        });
                      }}
                    >
                      <option value="">— None —</option>
                      {(knownErrorOptions as any[] | undefined)?.map((ke: any) => (
                        <option key={ke.id} value={ke.id}>
                          {ke.title}
                        </option>
                      ))}
                    </select>
                    {knownErrorLinked && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground truncate" title={knownErrorLinked.title}>
                        {knownErrorLinked.title}
                      </p>
                    )}
                  </div>
                )}
                {can("incidents", "write") && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isTerminal || updateTicket.isPending}
                      checked={!!(ticket as any).isMajorIncident}
                      onChange={(e) =>
                        updateTicket.mutate({
                          id: ticket.id,
                          data: { isMajorIncident: e.target.checked },
                        })
                      }
                    />
                    <span>Major incident (C1)</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* AI Insights */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Sparkles className="h-3 w-3 text-indigo-500" />
                AI Insights
              </span>
              {!aiEnabled && (
                <button
                  onClick={() => setAiEnabled(true)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Analyse
                </button>
              )}
            </div>
            <div className="px-3 py-2 text-[11px] text-muted-foreground space-y-2">
              {!aiEnabled && (
                <p className="text-muted-foreground/60 italic">Click Analyse for AI-powered summary and resolution suggestions.</p>
              )}
              {aiEnabled && (summaryLoading || suggestionLoading) && (
                <div className="flex items-center gap-1.5 py-1">
                  <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                  <span className="text-indigo-600">Analysing…</span>
                </div>
              )}
              {aiEnabled && aiSummary && (
                <div>
                  <p className="font-semibold text-foreground/80 mb-0.5">Summary</p>
                  <p className="leading-relaxed">{aiSummary.summary}</p>
                  {aiSummary.keyPoints.length > 0 && (
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {aiSummary.keyPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {aiEnabled && aiSuggestion && (
                <div className="mt-2 border-t border-border pt-2">
                  <p className="font-semibold text-foreground/80 mb-0.5 flex items-center gap-1">
                    Suggested Resolution
                    <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-mono ${aiSuggestion.confidence === "high" ? "bg-green-100 text-green-700" : aiSuggestion.confidence === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-muted text-muted-foreground"}`}>
                      {aiSuggestion.confidence}
                    </span>
                  </p>
                  <p className="leading-relaxed">{aiSuggestion.suggestion}</p>
                </div>
              )}
              {aiEnabled && !summaryLoading && !suggestionLoading && !aiSummary && !aiSuggestion && (
                <p className="text-muted-foreground/60 italic">AI analysis not available for this ticket.</p>
              )}
            </div>
          </div>

          {/* Watchers */}
          <div className="bg-card border border-border rounded">
            <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Watchers
              </span>
              <button
                onClick={() => toggleWatch.mutate({ ticketId: ticket.id })}
                disabled={toggleWatch.isPending}
                className={`text-[11px] hover:underline disabled:opacity-50 ${watching ? "text-muted-foreground" : "text-primary"}`}
              >
                {toggleWatch.isPending ? "…" : watching ? "− Unwatch" : "+ Watch"}
              </button>
            </div>
            <div className="px-3 py-3">
              <div className="flex -space-x-1">
                {["SA", "JC", "TO"].map((init) => (
                  <span
                    key={init}
                    className="w-6 h-6 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-semibold border-2 border-white"
                    title={init}
                  >
                    {init}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-1">3 watchers</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
