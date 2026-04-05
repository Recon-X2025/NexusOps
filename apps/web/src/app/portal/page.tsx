"use client";

import Link from "next/link";
import { useRBAC } from "@/lib/rbac-context";
import { trpc } from "@/lib/trpc";
import { PlusCircle, Search, Package, ClipboardList, Loader2, AlertCircle } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

const QUICK_ACTIONS = [
  {
    href: "/portal/request/new",
    icon: PlusCircle,
    label: "Submit a Request",
    description: "Report an issue or request IT help",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    iconColor: "text-blue-600",
  },
  {
    href: "/portal/requests",
    icon: ClipboardList,
    label: "Check Request Status",
    description: "View updates on your open requests",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    iconColor: "text-purple-600",
  },
  {
    href: "/portal/knowledge",
    icon: Search,
    label: "Search Knowledge Base",
    description: "Find answers to common questions",
    color: "bg-green-50 text-green-700 border-green-200",
    iconColor: "text-green-600",
  },
  {
    href: "/portal/assets",
    icon: Package,
    label: "View My Assets",
    description: "See equipment assigned to you",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    iconColor: "text-orange-600",
  },
];

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  open:        { label: "Open",        dot: "bg-blue-500" },
  in_progress: { label: "In Progress", dot: "bg-yellow-500" },
  pending:     { label: "Pending",     dot: "bg-amber-500" },
  resolved:    { label: "Resolved",    dot: "bg-green-500" },
  closed:      { label: "Closed",      dot: "bg-gray-400" },
};

export default function PortalHomePage() {
  const { currentUser } = useRBAC();

  const { data: statusData } = trpc.tickets.statusCounts.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data, isLoading, isError } = trpc.tickets.list.useQuery(
    { type: "request", limit: 50, orderBy: "createdAt", order: "desc" },
    { refetchOnWindowFocus: false },
  );

  const statusMap = new Map(
    (statusData ?? []).map((s) => [s.statusId, { name: s.name, color: s.color }]),
  );

  const myTickets = (data?.items ?? []).filter(
    (t) => t.requesterId === currentUser.id,
  );
  const recentTickets = myTickets.slice(0, 3);

  const firstName = currentUser.name.split(" ")[0] ?? currentUser.name;

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome banner */}
      <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
        <h1 className="text-xl font-bold">Welcome back, {firstName} 👋</h1>
        <p className="mt-1 text-sm text-blue-100">
          How can we help you today? Use the options below to get started.
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs text-blue-200">
          <span>
            <span className="font-semibold text-white">
              {myTickets.filter((t) => {
                const s = statusMap.get(t.statusId);
                return !s?.name?.toLowerCase().includes("closed") && !s?.name?.toLowerCase().includes("resolved");
              }).length}
            </span>{" "}
            open requests
          </span>
          <span>
            <span className="font-semibold text-white">
              {myTickets.filter((t) => {
                const s = statusMap.get(t.statusId);
                return s?.name?.toLowerCase().includes("resolved");
              }).length}
            </span>{" "}
            resolved
          </span>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map(({ href, icon: Icon, label, description, color, iconColor }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col gap-2 rounded-xl border p-4 transition-shadow hover:shadow-md ${color}`}
            >
              <Icon className={`h-6 w-6 ${iconColor}`} />
              <div>
                <p className="text-xs font-semibold leading-tight">{label}</p>
                <p className="mt-0.5 text-[11px] opacity-70">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent requests */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Recent Requests</h2>
          <Link href="/portal/requests" className="text-xs text-blue-600 hover:underline">
            View all →
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Unable to load recent requests. Please try again later.
          </div>
        )}

        {!isLoading && !isError && recentTickets.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No requests yet</p>
            <p className="text-xs text-gray-400">
              Submit your first request to get started.
            </p>
            <Link
              href="/portal/request/new"
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Request
            </Link>
          </div>
        )}

        {!isLoading && !isError && recentTickets.length > 0 && (
          <div className="flex flex-col gap-2">
            {recentTickets.map((ticket) => {
              const status = statusMap.get(ticket.statusId);
              const statusName = status?.name?.toLowerCase() ?? "open";
              const meta =
                STATUS_LABELS[statusName] ??
                STATUS_LABELS[
                  Object.keys(STATUS_LABELS).find((k) => statusName.includes(k)) ?? "open"
                ] ??
                STATUS_LABELS.open;
              return (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-gray-400">{ticket.number}</span>
                      <span className="truncate text-sm font-medium text-gray-800">{ticket.title}</span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {formatRelativeTime(ticket.createdAt)}
                    </span>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                    <span className="text-xs text-gray-600">{status?.name ?? "Open"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
