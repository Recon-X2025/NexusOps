"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { FilePicker } from "@/components/dms/FilePicker";
import { PermissionGate } from "@/lib/rbac-context";
import {
  ChevronRight, Flame, Clock, Lock, Globe, Edit2, Check, X, Search,
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
  const { currentUser, can, mergeTrpcQueryOpts, isAdmin } = useRBAC();
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
  const [relationTargetId, setRelationTargetId] = useState("");

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

  const addRelation = trpc.tickets.addRelation.useMutation({
    onSuccess: () => { setRelationTargetId(""); void ticketQuery.refetch(); toast.success("Relation added"); },
    onError: (e) => toast.error(e?.message ?? "Failed to add relation"),
  });

  const removeRelation = trpc.tickets.removeRelation.useMutation({
    onSuccess: () => { void ticketQuery.refetch(); toast.success("Relation removed"); },
    onError: (e) => toast.error(e?.message ?? "Failed to remove relation"),
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
            relations: rawRelations,
          } = data as any;

          const relations = rawRelations ?? [];

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
                  <div className="flex items-center gap-2 relative">
                    <button
                      disabled={isTerminal && !isAdmin()}
                      onClick={() => { setEditingField("title"); setEditValues({ title: ticket.title }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
                    >
                      <Edit2 className="w-4 h-4" /> Edit
                    </button>
                    
                    {!isTerminal && (
                      <div className="relative">
                        <button
                          disabled={isTerminal}
                          onClick={() => setShowAssignPanel(!showAssignPanel)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-40",
                            showAssignPanel && "bg-muted border-primary/50"
                          )}
                        >
                          <User className="w-4 h-4" /> Assign
                        </button>
                        
                        {showAssignPanel && (
                          <div className="absolute top-10 right-0 z-50 w-64 bg-card border border-border rounded-xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assign to Agent</span>
                              <button onClick={() => setShowAssignPanel(false)}><X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></button>
                            </div>
                            <div className="space-y-2">
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                <input 
                                  autoFocus
                                  placeholder="Search agents..."
                                  className="w-full pl-7 pr-3 py-1.5 text-xs bg-muted/30 border border-border rounded-lg outline-none focus:border-primary"
                                  onChange={(e) => setAssigneeId(e.target.value)} // Local search could go here
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-1 py-1">
                                {usersData?.map((user: any) => (
                                  <button
                                    key={user.id}
                                    onClick={() => assignTicket.mutate({ id, assigneeId: user.id })}
                                    className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-muted flex items-center gap-2 transition-colors"
                                  >
                                    <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                                      {user.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 truncate">
                                      <div className="font-medium">{user.name}</div>
                                      <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                                    </div>
                                    {ticket.assigneeId === user.id && <Check className="w-3 h-3 text-primary" />}
                                  </button>
                                ))}
                                {assignTicket.isPending && (
                                  <div className="flex items-center justify-center py-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => assignTicket.mutate({ id, assigneeId: null })}
                                className="w-full py-1.5 text-[10px] font-bold uppercase text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-dashed border-red-200"
                              >
                                Unassign Ticket
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!isTerminal && (
                      <button
                        onClick={() => setShowResolvePanel(true)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-500/20"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Resolve
                      </button>
                    )}
                  </div>
                }
              />

              {/* Edit Title Inline */}
              {editingField === "title" && (
                <div className="flex items-center gap-3 p-4 bg-muted/30 border border-primary/30 rounded-xl animate-in slide-in-from-top-2 duration-200">
                  <input
                    autoFocus
                    value={editValues.title}
                    onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateTicket.mutate({ id, data: { title: editValues.title } });
                      if (e.key === "Escape") setEditingField(null);
                    }}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateTicket.mutate({ id, data: { title: editValues.title } })}
                      className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingField(null)}
                      className="p-2 bg-background border border-border rounded-lg hover:bg-muted"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Resolve Modal Overlay */}
              {showResolvePanel && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
                  <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <h3 className="text-lg font-bold">Resolve Ticket</h3>
                      </div>
                      <button onClick={() => setShowResolvePanel(false)} className="text-muted-foreground hover:text-foreground">
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Provide a resolution note before closing this ticket. This will be visible to the requester.
                      </p>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">Resolution Note *</label>
                        <textarea
                          autoFocus
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                          placeholder="What was the solution?"
                          className="w-full min-h-[120px] p-3 text-sm bg-muted/20 border border-border rounded-xl outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/20 transition-all resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button 
                        onClick={() => setShowResolvePanel(false)}
                        className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={!resolveNote.trim() || updateTicket.isPending}
                        onClick={() => {
                          const statusId = statusCounts?.find(s => s.name.toLowerCase() === "resolved")?.statusId;
                          updateTicket.mutate({ 
                            id, 
                            data: { 
                              statusId,
                              resolvedAt: new Date().toISOString()
                            } as any,
                            comment: resolveNote
                          } as any);
                        }}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 shadow-lg shadow-green-500/20 disabled:opacity-50"
                      >
                        {updateTicket.isPending ? "Resolving..." : "Confirm Resolution"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                  <div className="flex overflow-x-auto border-b border-border gap-6">
                    {(["notes", "activity", "related"] as const).map((tab) => (
                      <button
                        key={tab}
                        data-testid={`ticket-tab-${tab}`}
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
                      {(!isTerminal || isAdmin()) && (
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
                          subtitle: `${l.authorName || "System"}${l.changes ? ` - Changes: ${JSON.stringify(l.changes)}` : ""}`
                        }))}
                      />
                    </div>
                  )}

                  {activeTab === "related" && (
                    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left-4 duration-300" data-testid="ticket-related-panel">
                      <div className="bg-card border border-border rounded-xl p-5">
                        <h3 className="text-sm font-bold text-foreground mb-4">Linked Tickets</h3>
                        
                        <div className="flex gap-3 mb-6">
                          <input
                            data-testid="ticket-relation-target-id"
                            placeholder="Enter ticket UUID to link..."
                            value={relationTargetId}
                            onChange={(e) => setRelationTargetId(e.target.value)}
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary"
                          />
                          <button
                            data-testid="ticket-relation-add"
                            disabled={!relationTargetId.trim() || addRelation.isPending}
                            onClick={() => {
                              addRelation.mutate({ 
                                ticketId: id, 
                                targetTicketId: relationTargetId.trim(),
                                type: "related"
                              });
                            }}
                            className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                          >
                            {addRelation.isPending ? "Linking..." : "Link Ticket"}
                          </button>
                        </div>

                        {relations.length === 0 ? (
                          <div className="p-12 text-center text-sm text-muted-foreground italic" data-testid="ticket-linked-empty">
                            No linked tickets.
                          </div>
                        ) : (
                          <div className="space-y-2" data-testid="ticket-linked-list">
                            {relations.map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
                                <div className="flex items-center gap-2">
                                  <Link href={`/app/tickets/${r.relatedTicketId}`} className="text-xs font-bold text-primary hover:underline">
                                    {r.relatedNumber}
                                  </Link>
                                  <span className="text-xs text-foreground/80">— {r.relatedTitle}</span>
                                </div>
                                <button
                                  data-testid="ticket-relation-remove"
                                  disabled={removeRelation.isPending}
                                  onClick={() => {
                                    removeRelation.mutate({ 
                                      relationId: r.id, 
                                      ticketId: id 
                                    });
                                  }}
                                  className="text-xs font-bold text-red-600 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

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
                      {
                        label: "Status",
                        icon: Activity,
                        value: (
                          <select
                            data-testid="ticket-status-select"
                            value={ticket.statusId}
                            disabled={(isTerminal && !isAdmin()) || updateTicket.isPending}
                            onChange={(e) => {
                              updateTicket.mutate({
                                id,
                                data: { statusId: e.target.value } as any
                              });
                            }}
                            className="bg-transparent border border-border rounded px-1.5 py-0.5 text-xs font-semibold outline-none capitalize focus:border-primary"
                          >
                            {statusCounts?.map((s: any) => (
                              <option key={s.statusId} value={s.statusId} className="bg-card text-foreground">
                                {s.name}
                              </option>
                            ))}
                          </select>
                        )
                      },
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

                  {/* Similar Tickets (embedding-based) */}
                  <SimilarTicketsPanel ticketId={id} />
                </div>
              </div>
            </div>
          );
        }}
      </ResourceView>
    </div>
  );
}

/**
 * Surfaces tickets the platform considers similar to this one, using the
 * stored embedding vectors (tickets.findSimilar). Helps agents spot prior
 * resolutions and avoid duplicate work. Shows an "indexing" state while the
 * source ticket's embedding is still being computed.
 */
function SimilarTicketsPanel({ ticketId }: { ticketId: string }) {
  const { data, isLoading } = trpc.tickets.findSimilar.useQuery(
    { ticketId, limit: 5 },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );

  return (
    <div className="bg-card border border-border rounded-xl p-5" data-testid="similar-tickets-panel">
      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
        <Copy className="w-3.5 h-3.5" /> Similar Tickets
      </h3>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding matches…
        </div>
      ) : !data?.ready ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          This ticket is still being indexed for similarity. Check back shortly.
        </p>
      ) : data.results.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          No similar tickets found yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="similar-tickets-list">
          {data.results.map((t) => (
            <li key={t.id}>
              <Link
                href={`/app/tickets/${t.id}`}
                className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">{t.number}</span>
                    {t.hasResolution && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[8px] font-bold uppercase rounded">
                        Resolved
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate mt-0.5">{t.title}</p>
                </div>
                <span className="text-[10px] font-bold text-primary whitespace-nowrap shrink-0">
                  {Math.round(t.score * 100)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
            {list.map((d: any) => (
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
