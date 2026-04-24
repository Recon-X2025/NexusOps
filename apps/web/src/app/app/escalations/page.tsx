"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "@/lib/trpc";

type TicketListItem = inferRouterOutputs<AppRouter>["tickets"]["list"]["items"][number];
import {
  Zap,
  Flame,
  AlertTriangle,
  Clock,
  ArrowUpCircle,
  RefreshCw,
  Phone,
  Mail,
  User,
  ChevronRight,
  Filter,
} from "lucide-react";

function ageLabel(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function overdueLabel(dueAt: Date | string) {
  const ms = Date.now() - new Date(dueAt).getTime();
  if (ms < 0) return null;
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `Overdue ${mins}m`;
  if (hrs < 24) return `Overdue ${hrs}h ${mins % 60}m`;
  return `Overdue ${Math.floor(hrs / 24)}d`;
}

export default function EscalationQueuePage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const router = useRouter();
  const [filter, setFilter] = useState<"breached" | "approaching" | "all">("breached");

  const { data: allTickets, isLoading, refetch } = trpc.tickets.list.useQuery({
    slaBreached: filter === "breached" ? true : undefined,
    limit: 100,
  }, mergeTrpcQueryOpts("tickets.list", undefined));

  const { data: statusCounts } = trpc.tickets.statusCounts.useQuery(undefined, mergeTrpcQueryOpts("tickets.statusCounts", undefined));

  const TERMINAL_STATUS_NAMES = ["closed", "resolved", "cancelled", "done"];
  const isTicketTerminal = (t: TicketListItem) => {
    const statusName = (statusCounts?.find((s: any) => s.statusId === (t as any).statusId)?.name ?? "").toLowerCase();
    return TERMINAL_STATUS_NAMES.some((n) => statusName.includes(n)) || !!(t as any).closedAt || !!(t as any).resolvedAt;
  };

  const bulkUpdate = trpc.tickets.bulkUpdate.useMutation({
    onSuccess: () => { refetch(); toast.success("Ticket escalated"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to escalate"),
  });

  if (!can("escalations", "read")) return <AccessDenied module="Escalation Queue" />;

  const tickets: TicketListItem[] = allTickets?.items ?? [];

  // Simulate "approaching SLA" filter — tickets with slaResolveDueAt within 1 hour
  const displayed =
    filter === "approaching"
      ? tickets.filter((t: TicketListItem) => {
          if (!t.slaResolveDueAt) return false;
          const remaining = new Date(t.slaResolveDueAt).getTime() - Date.now();
          return remaining > 0 && remaining < 3600000;
        })
      : tickets;

  const breachedCount = tickets.filter((t: TicketListItem) => t.slaBreached).length;
  const approachingCount = tickets.filter((t: TicketListItem) => {
    if (!t.slaResolveDueAt) return false;
    const remaining = new Date(t.slaResolveDueAt).getTime() - Date.now();
    return remaining > 0 && remaining < 3600000;
  }).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-red-500" />
          <h1 className="text-sm font-semibold text-foreground">Escalation Queue</h1>
          <span className="text-[11px] text-muted-foreground/70">SLA Breached & At-Risk Incidents</span>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground border border-border rounded hover:bg-muted/30"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Escalation matrix */}
      <div className="bg-card border border-border rounded">
        <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Escalation Matrix
          </span>
        </div>
        <table className="ent-table w-full">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Breach Threshold</th>
              <th>Escalate To</th>
              <th>Required Action</th>
            </tr>
          </thead>
          <tbody>
            {[
              { priority: "P1 – Critical", breach: "< 15 min",  escalateTo: "VP of IT / On-Call Manager",  action: "Page immediately" },
              { priority: "P2 – High",     breach: "< 30 min",  escalateTo: "IT Manager",                  action: "Phone call" },
              { priority: "P3 – Moderate", breach: "< 2 hrs",   escalateTo: "Team Lead",                   action: "Email + Slack" },
              { priority: "P4 – Low",      breach: "< 24 hrs",  escalateTo: "Supervisor",                  action: "Email" },
            ].map((row) => (
              <tr key={row.priority}>
                <td className="font-medium">{row.priority}</td>
                <td className="text-muted-foreground">{row.breach}</td>
                <td className="text-muted-foreground">{row.escalateTo}</td>
                <td>
                  <span className="status-badge text-red-700 bg-red-100">{row.action}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* KPI tabs */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            key: "breached" as const,
            label: "SLA Breached",
            count: breachedCount,
            color: "border-red-500 bg-red-50",
            countColor: "text-red-700",
            icon: Flame,
          },
          {
            key: "approaching" as const,
            label: "Approaching Breach",
            count: approachingCount,
            color: "border-yellow-500 bg-yellow-50",
            countColor: "text-yellow-700",
            icon: Clock,
          },
          {
            key: "all" as const,
            label: "All Open",
            count: tickets.length,
            color: "border-blue-500 bg-blue-50",
            countColor: "text-blue-700",
            icon: Zap,
          },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <button
              key={k.key}
              onClick={() => setFilter(k.key)}
              className={`flex items-center gap-3 p-3 rounded border-2 transition-all text-left
                ${filter === k.key ? k.color + " border-opacity-100" : "bg-card border-border hover:border-slate-300"}`}
            >
              <Icon className={`w-5 h-5 ${filter === k.key ? k.countColor : "text-muted-foreground/70"}`} />
              <div>
                <div className={`text-xl font-bold ${filter === k.key ? k.countColor : "text-foreground/80"}`}>
                  {k.count}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Queue table */}
      <div className="bg-card border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            {filter === "breached" && <><Flame className="w-3 h-3 text-red-500" /> SLA Breached Tickets</>}
            {filter === "approaching" && <><Clock className="w-3 h-3 text-yellow-500" /> Approaching SLA Breach</>}
            {filter === "all" && <><Zap className="w-3 h-3 text-blue-500" /> All Open Tickets</>}
          </span>
          <span className="text-[11px] text-muted-foreground">{displayed.length} records</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-[12px] text-muted-foreground/70">
            Loading escalation queue...
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[12px] text-green-600">
            <CheckCircle className="w-4 h-4 mr-2" />
            No tickets in this category
          </div>
        ) : (
          <table className="ent-table w-full">
            <thead>
              <tr>
                <th className="w-4" />
                <th>Ticket #</th>
                <th>Title</th>
                <th>Type</th>
                <th>Age</th>
                <th>SLA Status</th>
                <th>Assignee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((ticket: TicketListItem) => {
                const overdue = ticket.slaResolveDueAt
                  ? overdueLabel(ticket.slaResolveDueAt)
                  : null;
                return (
                  <tr key={ticket.id} className={ticket.slaBreached ? "bg-red-50/40" : ""}>
                    <td className="p-0 w-1">
                      <div className={`priority-bar ${ticket.slaBreached ? "bg-red-600" : "bg-yellow-500"}`} />
                    </td>
                    <td>
                      <Link href={`/app/tickets/${ticket.id}`} className="text-primary hover:underline font-medium">
                        {ticket.number}
                      </Link>
                    </td>
                    <td className="max-w-xs">
                      <Link href={`/app/tickets/${ticket.id}`} className="text-foreground hover:underline truncate block">
                        {ticket.title}
                      </Link>
                    </td>
                    <td>
                      <span className="status-badge text-muted-foreground bg-muted capitalize">
                        {ticket.type}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{ageLabel(ticket.createdAt)}</td>
                    <td>
                      {ticket.slaBreached ? (
                        <span className="status-badge text-red-700 bg-red-100 font-semibold">
                          <Flame className="w-3 h-3 inline mr-0.5" />
                          {overdue ?? "Breached"}
                        </span>
                      ) : (
                        <span className="status-badge text-yellow-700 bg-yellow-100">
                          <Clock className="w-3 h-3 inline mr-0.5" />
                          {overdue ?? "At Risk"}
                        </span>
                      )}
                    </td>
                    <td>
                      {ticket.assigneeId ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <span className="w-5 h-5 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-semibold">
                            TS
                          </span>
                          Assigned
                        </span>
                      ) : (
                        <span className="text-red-600 text-[11px] font-medium">⚠ Unassigned</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const terminal = isTicketTerminal(ticket);
                          return (
                            <>
                              <button
                                disabled={terminal || bulkUpdate.isPending}
                                onClick={() => {
                                  bulkUpdate.mutate({ ids: [ticket.id], data: {} });
                                }}
                                className={`flex items-center gap-0.5 text-[11px] ${terminal ? "text-muted-foreground/40 cursor-not-allowed" : "text-primary hover:underline"}`}
                                title={terminal ? "Cannot escalate a closed ticket" : "Escalate"}
                              >
                                <ArrowUpCircle className="w-3 h-3" /> Escalate
                              </button>
                              <button
                                disabled={terminal}
                                onClick={() => !terminal && router.push(`/app/tickets/${ticket.id}`)}
                                className={`flex items-center gap-0.5 text-[11px] ${terminal ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:underline"}`}
                                title={terminal ? "Cannot reassign a closed ticket" : "Reassign"}
                              >
                                <User className="w-3 h-3" /> Reassign
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
