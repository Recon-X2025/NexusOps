"use client";

import { useState } from "react";
import Link from "next/link";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Flame,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  CheckSquare,
  Square,
  Download,
  MoreHorizontal,
  Circle,
  Clock,
  User,
  Tag,
  LayoutDashboard,
  List,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Activity,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { STALE_TIME } from "@/components/providers/trpc-provider";
import { formatRelativeTime, cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  incident: "bg-red-500",
  request:  "bg-blue-500",
  problem:  "bg-purple-500",
  change:   "bg-cyan-500",
};

type SortField = "number" | "title" | "priority" | "status" | "type" | "createdAt";
type SortDir = "asc" | "desc";

const PRIORITY_META: Record<string, { label: string; color: string; bg: string; bar: string; order: number }> = {
  Critical: { label: "Critical", color: "#dc2626", bg: "#fef2f2", bar: "#dc2626", order: 0 },
  High:     { label: "High",     color: "#ea580c", bg: "#fff7ed", bar: "#ea580c", order: 1 },
  Medium:   { label: "Medium",   color: "#d97706", bg: "#fffbeb", bar: "#d97706", order: 2 },
  Low:      { label: "Low",      color: "#16a34a", bg: "#f0fdf4", bar: "#16a34a", order: 3 },
};

const TYPE_META: Record<string, { label: string; color: string }> = {
  incident: { label: "Incident",  color: "#dc2626" },
  request:  { label: "Request",   color: "#0356ca" },
  problem:  { label: "Problem",   color: "#7c3aed" },
  change:   { label: "Change",    color: "#0891b2" },
};

const STATUS_COLORS: Record<string, string> = {
  open:        "#0356ca",
  in_progress: "#7c3aed",
  pending:     "#d97706",
  resolved:    "#16a34a",
  closed:      "#6b7280",
};

function SortIcon({ field, sort }: { field: SortField; sort: { field: SortField; dir: SortDir } }) {
  if (sort.field !== field) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
  return sort.dir === "asc"
    ? <ChevronUp className="h-3 w-3 text-primary" />
    : <ChevronDown className="h-3 w-3 text-primary" />;
}

type TicketRow = {
  id: string;
  number: string;
  title: string;
  type: string;
  assigneeId: string | null;
  slaBreached: boolean;
  tags: string[];
  createdAt: Date;
  dueDate: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
};

export default function TicketsPage() {
  const { can } = useRBAC();
  if (!can("incidents", "read") && !can("requests", "read")) {
    return <AccessDenied module="Service Desk" />;
  }
  const [view, setView] = useState<"overview" | "queue">("queue");
  const [search, setSearch] = useState("");
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: "createdAt", dir: "desc" });

  const { data: statusCounts } = trpc.tickets.statusCounts.useQuery(undefined, { staleTime: STALE_TIME.LIVE });
  const { data, isLoading, refetch } = trpc.tickets.list.useQuery({
    search: search || undefined,
    statusId: selectedStatusId ?? undefined,
    limit: 50,
  }, { staleTime: STALE_TIME.LIVE });

  const tickets: TicketRow[] = (data?.items as TicketRow[] | undefined) ?? [];
  const total = data?.items?.length ?? 0;

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === tickets.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(tickets.map((t) => t.id)));
    }
  };

  const handleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  };

  const statusTabs = [
    { id: null, label: "All", count: total },
    ...(statusCounts?.map((s) => ({ id: s.statusId, label: s.name, count: s.count, color: s.color })) ?? []),
  ];

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col gap-0 rounded border border-border bg-card overflow-hidden">

      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-[#f7f8fa] dark:bg-card flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Service Desk</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-mono text-muted-foreground">
            {total}
          </span>
          {selectedRows.size > 0 && (
            <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[0.65rem] font-medium">
              {selectedRows.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* View toggle */}
          <div className="flex items-center rounded border border-border overflow-hidden">
            <button
              onClick={() => setView("overview")}
              className={cn("flex items-center gap-1 px-2 py-1 text-xs transition-colors", view === "overview" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent")}
            >
              <LayoutDashboard className="h-3 w-3" />
              Overview
            </button>
            <button
              onClick={() => setView("queue")}
              className={cn("flex items-center gap-1 px-2 py-1 text-xs transition-colors", view === "queue" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-accent")}
            >
              <List className="h-3 w-3" />
              Queue
            </button>
          </div>
          <div className="h-4 w-px bg-border" />
          {view === "queue" && selectedRows.size > 0 && (
            <>
              <button className="rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-accent transition-colors">
                Assign
              </button>
              <button className="rounded border border-border bg-card px-2 py-1 text-xs font-medium hover:bg-accent transition-colors">
                Close
              </button>
              <div className="h-4 w-px bg-border mx-0.5" />
            </>
          )}
          {view === "queue" && (
            <>
              <button className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Filter className="h-3 w-3" />
                Filters
              </button>
              <button className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <Download className="h-3 w-3" />
                Export
              </button>
            </>
          )}
          <button
            onClick={() => refetch()}
            className="rounded border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          {can("incidents", "write") && (
            <Link
              href="/app/tickets/new"
              className="flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New Ticket
            </Link>
          )}
        </div>
      </div>

      {/* ─── Overview panel ───────────────────────────────────────── */}
      {view === "overview" && (
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
          {/* KPIs computed from live data */}
          {(() => {
            const allTickets: TicketRow[] = (data?.items as TicketRow[] | undefined) ?? [];
            const openStatuses = (statusCounts ?? []).filter(s =>
              !["resolved","closed","done"].includes((s.name ?? "").toLowerCase())
            );
            const totalOpen = openStatuses.reduce((sum, s) => sum + Number(s.count ?? 0), 0);
            const unassigned = allTickets.filter(t => !t.assigneeId).length;
            const breached = allTickets.filter(t => t.slaBreached).length;
            const slaCompliance = allTickets.length > 0
              ? Math.round(((allTickets.length - breached) / allTickets.length) * 100)
              : 100;
            const resolvedToday = allTickets.filter(t => {
              if (!t.resolvedAt) return false;
              const d = new Date(t.resolvedAt);
              const now = new Date();
              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
            }).length;
            const resolvedWithMttr = allTickets.filter(t => t.resolvedAt && t.createdAt);
            const avgMttrH = resolvedWithMttr.length > 0
              ? (resolvedWithMttr.reduce((s, t) => s + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()), 0) / resolvedWithMttr.length / 3600000).toFixed(1)
              : "—";

            const liveKpis = [
              { label: "Total Open",       value: String(totalOpen),            color: "text-blue-700",   bg: "bg-blue-50",   icon: Circle },
              { label: "SLA Breached",      value: String(breached),             color: "text-red-700",    bg: "bg-red-50",    icon: AlertTriangle },
              { label: "Resolved Today",    value: String(resolvedToday),         color: "text-green-700",  bg: "bg-green-50",  icon: CheckCircle2 },
              { label: "SLA Compliance",    value: `${slaCompliance}%`,           color: "text-green-700",  bg: "bg-green-50",  icon: Shield },
              { label: "Avg MTTR",          value: avgMttrH === "—" ? "—" : `${avgMttrH}h`, color: "text-orange-700", bg: "bg-orange-50", icon: Clock },
              { label: "Unassigned",        value: String(unassigned),            color: "text-yellow-700", bg: "bg-yellow-50", icon: User },
            ];

            // Type breakdown from live data
            const typeCounts: Record<string, number> = {};
            for (const t of allTickets) {
              typeCounts[t.type] = (typeCounts[t.type] ?? 0) + 1;
            }
            const typeBreakdown = Object.entries(typeCounts).map(([type, count]) => ({
              label: TYPE_META[type]?.label ?? type,
              count,
              color: TYPE_COLORS[type] ?? "bg-gray-400",
            }));
            const typeTotal = typeBreakdown.reduce((s, t) => s + t.count, 0);

            // Recent activity = last 6 updated tickets
            const recentActivity = [...allTickets]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .slice(0, 6);

            return (
              <>
                <div className="grid grid-cols-6 gap-2">
                  {liveKpis.map((k) => {
                    const Icon = k.icon;
                    return (
                      <div key={k.label} className={`${k.bg} border border-border rounded p-3 hover:shadow-sm transition-shadow`}>
                        <div className="flex items-start justify-between">
                          <Icon className="w-4 h-4 text-muted-foreground/70" />
                        </div>
                        <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{k.label}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Status breakdown */}
                  <div className="bg-card border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">By Status</span>
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      {(statusCounts ?? []).map((s) => {
                        const maxCount = Math.max(...(statusCounts ?? []).map(sc => Number(sc.count ?? 0)), 1);
                        return (
                          <div key={s.statusId} className="flex items-center gap-2">
                            <span className="text-[11px] text-foreground/80 w-20 truncate">{s.name}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Number(s.count ?? 0) / maxCount * 100)}%` }} />
                            </div>
                            <span className="text-[11px] font-bold text-foreground w-6 text-right">{s.count}</span>
                          </div>
                        );
                      })}
                      {!statusCounts?.length && <p className="text-[11px] text-muted-foreground/60">No status data yet</p>}
                    </div>
                  </div>

                  {/* Type breakdown */}
                  <div className="bg-card border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">By Type</span>
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      {typeBreakdown.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/60">No tickets yet</p>
                      ) : typeBreakdown.map((t) => (
                        <div key={t.label} className="flex items-center gap-2">
                          <span className="text-[11px] text-foreground/80 w-16">{t.label}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${t.color}`} style={{ width: `${typeTotal > 0 ? Math.round(t.count / typeTotal * 100) : 0}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-foreground w-6 text-right">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent activity */}
                  <div className="bg-card border border-border rounded overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">Recent Activity</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {recentActivity.length === 0 ? (
                        <div className="px-3 py-4 text-[11px] text-muted-foreground/60">No recent tickets</div>
                      ) : recentActivity.map((t) => (
                        <div key={t.id} className="flex items-start gap-2 px-3 py-1.5">
                          <span className="font-mono text-[9px] text-muted-foreground/70 flex-shrink-0 mt-0.5">
                            {new Date(t.updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                          </span>
                          <p className="text-[10px] text-foreground/80 leading-snug">
                            <span className="font-mono text-primary">{t.number}</span>
                            {" — "}{t.title}
                            {t.slaBreached && <span className="text-red-500 ml-1">⚠ SLA</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          <div className="flex items-center justify-center">
            <button
              onClick={() => setView("queue")}
              className="flex items-center gap-1.5 px-4 py-2 rounded border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <List className="h-3.5 w-3.5" />
              View Ticket Queue
            </button>
          </div>
        </div>
      )}

      {/* ─── Queue view (status tabs + table + status bar) ───────── */}
      {view === "queue" && <>

      {/* ─── Status tabs + Search ──────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-3 py-0 bg-card dark:bg-card flex-shrink-0">
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-thin">
          {statusTabs.map((tab) => (
            <button
              key={tab.id ?? "all"}
              onClick={() => setSelectedStatusId(tab.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                selectedStatusId === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {"color" in tab && tab.color && (
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: tab.color }} />
              )}
              {tab.label}
              <span className={cn(
                "rounded px-1 py-0.5 text-[0.6rem] font-mono",
                selectedStatusId === tab.id
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative ml-3 flex-shrink-0">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded border border-border bg-background py-1 pl-6 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* ─── Table ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="ent-table">
            <thead className="sticky top-0 z-10">
              <tr>
                {/* Checkbox */}
                <th className="w-8 px-3">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                    {selectedRows.size === tickets.length && tickets.length > 0
                      ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      : <Square className="h-3.5 w-3.5" />
                    }
                  </button>
                </th>
                {/* Priority bar space */}
                <th className="w-1 p-0" />
                <th
                  className="sortable w-20"
                  onClick={() => handleSort("number")}
                >
                  <div className="flex items-center gap-1">
                    Number <SortIcon field="number" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable"
                  onClick={() => handleSort("title")}
                >
                  <div className="flex items-center gap-1">
                    Title / Description <SortIcon field="title" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable w-20"
                  onClick={() => handleSort("type")}
                >
                  <div className="flex items-center gap-1">
                    Type <SortIcon field="type" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable w-24"
                  onClick={() => handleSort("priority")}
                >
                  <div className="flex items-center gap-1">
                    Priority <SortIcon field="priority" sort={sort} />
                  </div>
                </th>
                <th
                  className="sortable w-28"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    Status <SortIcon field="status" sort={sort} />
                  </div>
                </th>
                <th className="w-24">Assignee</th>
                <th className="w-20">SLA</th>
                <th
                  className="sortable w-28"
                  onClick={() => handleSort("createdAt")}
                >
                  <div className="flex items-center gap-1">
                    Created <SortIcon field="createdAt" sort={sort} />
                  </div>
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center">
                    <Circle className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs font-medium text-muted-foreground">No tickets found</p>
                    <p className="text-[0.65rem] text-muted-foreground/60 mt-1">
                      {search ? "Try adjusting your search" : "Create your first ticket to get started"}
                    </p>
                    {!search && (
                      <Link
                        href="/app/tickets/new"
                        className="mt-3 inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                      >
                        <Plus className="h-3 w-3" /> New Ticket
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const isSelected = selectedRows.has(ticket.id);
                  const typeMeta = TYPE_META[ticket.type] ?? { label: ticket.type, color: "#6b7280" };

                  return (
                    <tr
                      key={ticket.id}
                      className={cn(isSelected && "selected")}
                      onClick={() => toggleRow(ticket.id)}
                    >
                      {/* Checkbox */}
                      <td className="w-8" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleRow(ticket.id)} className="text-muted-foreground hover:text-primary">
                          {isSelected
                            ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                            : <Square className="h-3.5 w-3.5" />
                          }
                        </button>
                      </td>

                      {/* Priority color bar */}
                      <td className="w-1 p-0">
                        <div
                          className={`w-1 h-full min-h-[2rem] ${ticket.slaBreached ? "bg-destructive" : "bg-border"}`}
                        />
                      </td>

                      {/* Number */}
                      <td>
                        <Link
                          href={`/app/tickets/${ticket.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mono text-[0.65rem] text-muted-foreground hover:text-primary font-medium"
                        >
                          {ticket.number}
                        </Link>
                      </td>

                      {/* Title */}
                      <td className="max-w-xs" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/app/tickets/${ticket.id}`}
                          className="block font-medium text-foreground hover:text-primary leading-snug line-clamp-1"
                        >
                          {ticket.slaBreached && (
                            <Flame className="inline h-3 w-3 text-red-500 mr-1 flex-shrink-0" />
                          )}
                          {ticket.title}
                        </Link>
                        {ticket.tags && ticket.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Tag className="h-2.5 w-2.5 text-muted-foreground/50" />
                            {ticket.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="rounded bg-muted px-1 py-0.5 text-[0.55rem] text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: typeMeta.color + "18",
                            color: typeMeta.color,
                          }}
                        >
                          {typeMeta.label}
                        </span>
                      </td>

                      {/* Priority */}
                      <td>
                        <span className="text-xs text-muted-foreground">—</span>
                      </td>

                      {/* Status */}
                      <td>
                        <span className="status-badge bg-muted text-muted-foreground capitalize">
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          Open
                        </span>
                      </td>

                      {/* Assignee */}
                      <td>
                        {ticket.assigneeId ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[0.55rem] font-bold text-violet-700 dark:bg-violet-900 dark:text-violet-300 flex-shrink-0">
                              A
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[4rem]">Agent</span>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground/60 italic">
                            <User className="h-3 w-3" /> Unassigned
                          </span>
                        )}
                      </td>

                      {/* SLA */}
                      <td>
                        {ticket.slaBreached ? (
                          <span className="sla-breached">
                            <Flame className="h-2.5 w-2.5" /> Breached
                          </span>
                        ) : ticket.dueDate ? (
                          <span className="sla-ok">
                            <Clock className="h-2.5 w-2.5" /> On track
                          </span>
                        ) : (
                          <span className="text-[0.65rem] text-muted-foreground/40">—</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(ticket.createdAt)}
                      </td>

                      {/* Actions */}
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="rounded p-1 text-muted-foreground opacity-0 hover:opacity-100 hover:bg-accent transition group-hover:opacity-100">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Status bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 bg-[#f7f8fa] dark:bg-card flex-shrink-0">
        <p className="text-[0.65rem] text-muted-foreground">
          Showing {tickets.length} of {total} records
          {selectedRows.size > 0 && ` · ${selectedRows.size} selected`}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">
          NexusOps ITSM · Coheron Platform
        </p>
      </div>

      </>}
    </div>
  );
}
