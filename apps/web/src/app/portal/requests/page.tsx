"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/utils";
import {
  ClipboardList,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  PlusCircle,
} from "lucide-react";
import Link from "next/link";

const STATUS_STYLE: Record<
  string,
  { dot: string; pill: string; label: string }
> = {
  open: {
    dot: "bg-blue-500",
    pill: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Open",
  },
  in_progress: {
    dot: "bg-yellow-500",
    pill: "bg-yellow-50 text-yellow-700 border-yellow-200",
    label: "In Progress",
  },
  pending: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Pending",
  },
  resolved: {
    dot: "bg-green-500",
    pill: "bg-green-50 text-green-700 border-green-200",
    label: "Resolved",
  },
  closed: {
    dot: "bg-gray-400",
    pill: "bg-gray-100 text-gray-600 border-gray-200",
    label: "Closed",
  },
};

function matchStatusStyle(name: string) {
  const lower = name.toLowerCase();
  for (const [key, style] of Object.entries(STATUS_STYLE)) {
    if (lower.includes(key.replace("_", " ")) || lower.includes(key)) {
      return style;
    }
  }
  return STATUS_STYLE["open"]!;
}

export default function MyRequestsPage() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: statusData } = trpc.tickets.statusCounts.useQuery(
    undefined,
    mergeTrpcQueryOpts("tickets.statusCounts", { refetchOnWindowFocus: false }),
  );

  const { data, isLoading, isError, refetch } = trpc.tickets.list.useQuery(
    {
      type: "request",
      ticketScope: "mine",
      limit: 100,
      orderBy: "createdAt",
      order: "desc",
    },
    mergeTrpcQueryOpts("tickets.list", { refetchOnWindowFocus: false }),
  );

  const updateTicket = trpc.tickets.update.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled.");
      setCancellingId(null);
      refetch();
      utils.tickets.list.invalidate();
    },
    onError: (err) => {
      toast.error(err?.message ?? "Failed to cancel request.");
      setCancellingId(null);
    },
  });

  const statusMap = new Map<string, { name: string; color: string | null }>(
    (statusData ?? []).map((s: any) => [s.statusId, { name: s.name as string, color: s.color as string | null }]),
  );

  const closedStatusId = (statusData ?? []).find((s: any) =>
    s.name.toLowerCase().includes("closed"),
  )?.statusId;

  const myTickets = data?.items ?? [];

  function handleCancel(ticketId: string) {
    if (!closedStatusId) {
      toast.error("Unable to cancel — status configuration not found.");
      return;
    }
    setCancellingId(ticketId);
    updateTicket.mutate({ id: ticketId, data: { statusId: closedStatusId } });
  }

  function isOpenStatus(statusId: string) {
    const s = statusMap.get(statusId);
    if (!s) return false;
    const lower = s.name.toLowerCase();
    return (
      lower.includes("open") ||
      lower.includes("in progress") ||
      lower.includes("in_progress") ||
      lower.includes("pending")
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">My Requests</h1>
          <p className="text-xs text-gray-500">
            {isLoading ? "Loading…" : `${myTickets.length} request${myTickets.length !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <Link
          href="/portal/request/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          New Request
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Unable to load requests. Please refresh and try again.
        </div>
      )}

      {!isLoading && !isError && myTickets.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <ClipboardList className="h-10 w-10 text-gray-300" />
          <div>
            <p className="text-sm font-medium text-gray-600">No requests yet</p>
            <p className="text-xs text-gray-400">Submit a request and track it here.</p>
          </div>
          <Link
            href="/portal/request/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Submit First Request
          </Link>
        </div>
      )}

      {!isLoading && !isError && myTickets.length > 0 && (
        <div className="flex flex-col gap-2">
          {myTickets.map((ticket: any) => {
            const status = statusMap.get(ticket.statusId);
            const style = (status
              ? matchStatusStyle(status.name)
              : STATUS_STYLE["open"])!;
            const isOpen = isOpenStatus(ticket.statusId);
            const isExpanded = expandedId === ticket.id;

            return (
              <div
                key={ticket.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                {/* Row header */}
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : ticket.id)
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.dot}`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-gray-400">
                        {ticket.number}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-800">
                        {ticket.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                      <span>Submitted {formatRelativeTime(ticket.createdAt)}</span>
                      {ticket.slaBreached && (
                        <span className="rounded-full bg-red-100 px-1.5 text-red-600">
                          SLA Breached
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.pill}`}
                    >
                      {status?.name ?? style.label}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    {ticket.tags && ticket.tags.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {ticket.tags.map((tag: any) => (
                          <span
                            key={tag}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-gray-500">
                      {(ticket as any).description
                        ? (ticket as any).description
                        : "No description provided."}
                    </p>

                    <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
                      {ticket.assigneeName && (
                        <span>Assigned to: <strong className="text-gray-600">{ticket.assigneeName}</strong></span>
                      )}
                      {ticket.resolvedAt && (
                        <span>Resolved {formatRelativeTime(ticket.resolvedAt)}</span>
                      )}
                    </div>

                    {isOpen && (
                      <button
                        onClick={() => handleCancel(ticket.id)}
                        disabled={cancellingId === ticket.id}
                        className="mt-3 flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        {cancellingId === ticket.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        Cancel Request
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
