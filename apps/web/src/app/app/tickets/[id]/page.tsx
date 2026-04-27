"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { FilePicker } from "@/components/dms/FilePicker";
import { PermissionGate } from "@/components/auth/PermissionGate";
import {
  ChevronRight, Flame, Clock, Lock, Globe, Edit2, Check, X,
  AlertTriangle, MessageSquare, Activity, Paperclip, User, Megaphone,
  Tag, RefreshCw, CheckCircle2, XCircle, ArrowUpCircle,
  Printer, Copy, MoreHorizontal, Star, Eye, CalendarDays, Sparkles, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ResourceView } from "@/components/ui/resource-view";
import { DetailGrid } from "@/components/ui/detail-grid";
import { Timeline } from "@/components/ui/timeline";

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
  const [warRoomBody, setWarRoomBody] = useState("");
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

  const ticketQuery = trpc.tickets.get.useQuery({ id }, mergeTrpcQueryOpts("tickets.get", undefined));

  const isMajorIncidentTicket = !!(ticketQuery.data?.ticket as { isMajorIncident?: boolean } | undefined)?.isMajorIncident;
  const commsListQuery = trpc.tickets.majorIncidentComms.list.useQuery(
    { ticketId: id },
    mergeTrpcQueryOpts("tickets.majorIncidentComms.list", {
      enabled: Boolean(id) && !!ticketQuery.data && isMajorIncidentTicket,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    }),
  );
  
  const appendMajorComms = trpc.tickets.majorIncidentComms.append.useMutation({
    onSuccess: () => {
      setWarRoomBody("");
      void commsListQuery.refetch();
      toast.success("Posted to war room log");
    },
    onError: (e) => toast.error(e?.message ?? "Could not post"),
  });

  const { data: statusCounts } = trpc.tickets.statusCounts.useQuery(undefined, mergeTrpcQueryOpts("tickets.statusCounts", {
    refetchOnWindowFocus: false,
  }));
  const { data: pauseCatalog } = trpc.tickets.slaPauseReasonsCatalog.get.useQuery(
    undefined,
    mergeTrpcQueryOpts("tickets.slaPauseReasonsCatalog.get", {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }),
  );

  const [pauseHoldPick, setPauseHoldPick] = useState<{ statusId: string } | null>(null);
  const [pauseReasonChoice, setPauseReasonChoice] = useState("");

  useEffect(() => {
    if (pauseHoldPick) setPauseReasonChoice("");
  }, [pauseHoldPick]);

  const toggleWatch = trpc.tickets.toggleWatch.useMutation({
    onSuccess: (res) => { setWatching(res.watching); toast.success(res.watching ? "Added to watchlist" : "Removed from watchlist"); },
    onError: (e) => toast.error(e?.message ?? "Failed to update watchlist"),
  });

  const addComment = trpc.tickets.addComment.useMutation({
    onSuccess: () => { setCommentBody(""); void ticketQuery.refetch(); },
    onError: (e) => toast.error(e?.message ?? "Something went wrong"),
  });
  const updateTicket = trpc.tickets.update.useMutation({
    onSuccess: () => { setEditingField(null); setShowResolvePanel(false); setShowClosePanel(false); void ticketQuery.refetch(); toast.success("Ticket updated"); },
    onError: (e) => toast.error(e?.message ?? "Something went wrong"),
  });
  const assignTicket = trpc.tickets.assign.useMutation({
    onSuccess: () => { setShowAssignPanel(false); setAssigneeId(""); void ticketQuery.refetch(); toast.success("Ticket assigned"); },
    onError: (e) => toast.error(e?.message ?? "Something went wrong"),
  });

  const { data: usersData } = trpc.auth.listUsers.useQuery(undefined, mergeTrpcQueryOpts("auth.listUsers", {
    enabled: showAssignPanel,
    staleTime: 5 * 60_000,
  }));

  // Related records
  const relatedEnabled = activeTab === "related";
  const { data: relatedProblems } = trpc.changes.listProblems.useQuery({ limit: 10 }, mergeTrpcQueryOpts("changes.listProblems", { enabled: relatedEnabled, staleTime: 60_000 }));
  const { data: relatedChangesData } = trpc.changes.list.useQuery({ limit: 10 }, mergeTrpcQueryOpts("changes.list", { enabled: relatedEnabled, staleTime: 60_000 }));

  const linkKnowledgeArticle = trpc.tickets.linkKnowledgeArticle.useMutation({
    onSuccess: () => { void ticketQuery.refetch(); toast.success("Article linked"); },
    onError: (e) => toast.error(e?.message ?? "Could not link"),
  });
  const unlinkKnowledgeArticle = trpc.tickets.unlinkKnowledgeArticle.useMutation({
    onSuccess: () => { void ticketQuery.refetch(); toast.success("Article unlinked"); },
    onError: (e) => toast.error(e?.message ?? "Could not unlink"),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <ResourceView
        query={ticketQuery}
        resourceName="Ticket"
        backHref="/app/tickets"
      >
        {(data) => {
          const {
            ticket,
            comments: rawComments,
            activityLog: rawActivityLog,
            suggestedKbArticles: rawSuggestedKb,
            linkedKbArticles: rawLinkedKb,
          } = data as any;

          const comments = rawComments ?? [];
          const activityLog = rawActivityLog ?? [];
          const suggestedKbArticles = rawSuggestedKb ?? [];
          const linkedKbArticles = rawLinkedKb ?? [];

          const urgency = (ticket.urgency ?? "medium") as "high" | "medium" | "low";
          const uCfg = URGENCY_COLORS[urgency];
          const typeBadge = TYPE_COLORS[ticket.type ?? "incident"];

          const TERMINAL_STATUS_NAMES = ["closed", "resolved", "cancelled", "done"];
          const currentStatusName = (statusCounts?.find((s: any) => s.statusId === ticket.statusId)?.name ?? "").toLowerCase();
          const isTerminal = TERMINAL_STATUS_NAMES.some((t) => currentStatusName.includes(t)) || !!ticket.closedAt || !!ticket.resolvedAt;

          return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <PageHeader
                title={ticket.title}
                subtitle={`${ticket.number} · ${ticket.type}`}
                icon={Activity}
                backHref="/app/tickets"
                badge={
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", typeBadge)}>
                      {ticket.type}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", uCfg?.badge)}>
                      {urgency} urgency
                    </span>
                    {ticket.slaBreached && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-100 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> SLA Breached
                      </span>
                    )}
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    <button
                      disabled={isTerminal}
                      onClick={() => { setEditingField("title"); setEditValues({ title: ticket.title }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
                    >
                      <Edit2 className="w-4 h-4" /> Edit
                    </button>
                    <button
                      disabled={isTerminal}
                      onClick={() => setShowAssignPanel(!showAssignPanel)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
                    >
                      <User className="w-4 h-4" /> Assign
                    </button>
                    {!isTerminal && (
                      <button
                        onClick={() => setShowResolvePanel(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Resolve
                      </button>
                    )}
                  </div>
                }
              />

              {ticket.slaBreached && !isTerminal && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
                  <Flame className="w-5 h-5 flex-shrink-0" />
                  <div className="flex-1">
                    <strong className="font-bold">SLA Breach Detected</strong>
                    <span className="ml-2">Immediate escalation required. Ticket is overdue.</span>
                  </div>
                  <button
                    onClick={() => updateTicket.mutate({ id, data: { tags: [...(ticket.tags ?? []), "escalated"] } })}
                    className="px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-all shadow-sm"
                  >
                    Escalate Now
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-6">
                  {/* Tabs */}
                  <div className="flex border-b border-border gap-6">
                    {(["notes", "activity", "related"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "pb-3 text-sm font-bold uppercase tracking-widest border-b-2 transition-all",
                          activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {tab === "notes" ? `Notes (${comments.length})` : tab === "activity" ? "Activity" : "Related"}
                      </button>
                    ))}
                  </div>

                  {activeTab === "notes" && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
                      {/* Description Card */}
                      <div className="bg-card border border-border rounded-xl p-5">
                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Description</h3>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {ticket.description || "No description provided."}
                        </p>
                      </div>

                      {/* Knowledge Suggestion */}
                      {suggestedKbArticles.length > 0 && (
                        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5">
                          <h3 className="text-[10px] font-bold text-blue-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> AI Suggested Knowledge
                          </h3>
                          <div className="flex flex-col gap-2">
                            {suggestedKbArticles.map((a: any) => (
                              <div key={a.id} className="flex items-center justify-between gap-4 bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                                <Link href={`/app/knowledge/${a.id}`} className="text-sm font-bold text-blue-700 hover:underline truncate">
                                  {a.title}
                                </Link>
                                <button
                                  onClick={() => linkKnowledgeArticle.mutate({ ticketId: id, articleId: a.id })}
                                  className="text-xs font-bold text-primary hover:underline whitespace-nowrap"
                                >
                                  Link to Ticket
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Comments Feed */}
                      <div className="flex flex-col gap-4">
                        {comments.map((c: any) => (
                          <div key={c.id} className={cn("flex flex-col gap-2 p-4 rounded-xl border", c.isInternal ? "bg-amber-50/30 border-amber-100" : "bg-card border-border")}>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                                  {c.authorName?.charAt(0) ?? "A"}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold">{c.authorName ?? "Agent"}</span>
                                  <span className="text-[10px] text-muted-foreground">{relativeTime(c.createdAt)}</span>
                                </div>
                              </div>
                              {c.isInternal && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold uppercase rounded">Internal Note</span>}
                            </div>
                            <p className="text-sm text-foreground/80 pl-10 whitespace-pre-wrap">{c.body}</p>
                          </div>
                        ))}
                      </div>

                      {/* Comment Composer */}
                      {!isTerminal && (
                        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                          <div className="flex items-center gap-4 border-b border-border pb-2">
                            <button
                              onClick={() => setIsInternal(false)}
                              className={cn("text-xs font-bold uppercase tracking-widest pb-1 transition-all", !isInternal ? "text-primary border-b-2 border-primary" : "text-muted-foreground")}
                            >
                              Public Reply
                            </button>
                            <button
                              onClick={() => setIsInternal(true)}
                              className={cn("text-xs font-bold uppercase tracking-widest pb-1 transition-all", isInternal ? "text-amber-600 border-b-2 border-amber-600" : "text-muted-foreground")}
                            >
                              Internal Note
                            </button>
                          </div>
                          <textarea
                            value={commentBody}
                            onChange={(e) => setCommentBody(e.target.value)}
                            placeholder={isInternal ? "Add a private note for staff..." : "Reply to the customer..."}
                            className="w-full text-sm bg-transparent outline-none min-h-[100px] resize-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              disabled={!commentBody.trim() || addComment.isPending}
                              onClick={() => addComment.mutate({ ticketId: id, body: commentBody, isInternal })}
                              className={cn(
                                "px-6 py-2 rounded-lg text-xs font-bold text-white transition-all",
                                isInternal ? "bg-amber-600 hover:bg-amber-700" : "bg-primary hover:bg-primary/90",
                                "disabled:opacity-50"
                              )}
                            >
                              {addComment.isPending ? "Sending..." : "Send Message"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "activity" && (
                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <Timeline
                        items={activityLog.map((l: any) => ({
                          id: l.id,
                          title: l.description,
                          timestamp: l.createdAt,
                          icon: ACTIVITY_ICON[l.action] ?? Activity,
                          type: l.action === "comment_added" ? "success" : "info",
                          description: l.authorName
                        }))}
                      />
                    </div>
                  )}

                  {activeTab === "related" && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className="bg-card border border-border rounded-xl p-5">
                        <h3 className="text-sm font-bold text-foreground mb-4">Linked Problems</h3>
                        <div className="p-12 text-center text-sm text-muted-foreground italic">No linked problems found.</div>
                      </div>
                      <div className="bg-card border border-border rounded-xl p-5">
                        <h3 className="text-sm font-bold text-foreground mb-4">Linked Changes</h3>
                        <div className="p-12 text-center text-sm text-muted-foreground italic">No linked changes found.</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  {/* Details Sidebar */}
                  <DetailGrid
                    title="Properties"
                    icon={Tag}
                    items={[
                      { label: "Urgency", value: urgency, icon: Clock, className: cn("capitalize font-bold", uCfg?.text) },
                      { label: "Impact", value: (ticket as any).impact ?? "medium", icon: AlertTriangle, className: "capitalize" },
                      { label: "Status", value: currentStatusName, icon: Activity, className: "capitalize font-bold" },
                      { label: "Created", value: formatDt(ticket.createdAt), icon: CalendarDays },
                      { label: "Assignee", value: ticket.assigneeName ?? "Unassigned", icon: User },
                    ]}
                  />

                  {/* Major Incident Card */}
                  {isMajorIncidentTicket && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-widest">
                        <Megaphone className="w-4 h-4" /> Major Incident
                      </div>
                      <p className="text-[11px] text-red-700 leading-relaxed">
                        This incident has been flagged as high-impact. War room communications are active.
                      </p>
                      <button
                        onClick={() => void commsListQuery.refetch()}
                        className="w-full py-2 bg-red-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-red-700 transition-all"
                      >
                        View War Room
                      </button>
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

function TicketAttachments({ ticketId, disabled }: { ticketId: string; disabled: boolean }) {
  const docs = trpc.documents.list.useQuery({
    sourceType: "ticket",
    sourceId: ticketId,
    limit: 25,
  });
  const utils = trpc.useUtils();

  const list = docs.data ?? [];
  if (list.length === 0 && disabled) return null;

  return (
    <div className="border border-border rounded">
      <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Attachments {list.length > 0 ? `(${list.length})` : ""}
        </span>
      </div>
      <div className="p-3 space-y-2">
        {list.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/70">
            No attachments yet — use the paperclip below to add files.
          </div>
        ) : (
          <ul className="space-y-1">
            {list.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 text-[11px] border border-border rounded px-2 py-1 bg-background"
              >
                <Paperclip className="w-3 h-3 text-muted-foreground/70" />
                <span className="truncate flex-1 text-foreground/80">{d.name}</span>
                <span className="text-muted-foreground/60">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
                {d.scanStatus === "infected" ? (
                  <span className="text-red-600 font-medium">INFECTED</span>
                ) : d.scanStatus === "pending" ? (
                  <span className="text-amber-600">scanning…</span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await utils.documents.getDownloadUrl.fetch({ id: d.id, ttlSeconds: 300 });
                      window.open(r.url, "_blank", "noopener");
                    }}
                    className="text-blue-700 hover:underline"
                  >
                    Download
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
