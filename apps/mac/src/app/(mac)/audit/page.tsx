"use client";

import { useState } from "react";
import {
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { format } from "date-fns";

interface AuditEntry {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  targetOrg: string;
  details: string;
  ipAddress: string;
}

const ACTION_TYPES = [
  "all",
  "org_created",
  "org_suspended",
  "org_resumed",
  "user_impersonated",
  "sessions_revoked",
  "operator_login",
];

const MOCK_AUDIT: AuditEntry[] = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 60000).toISOString(),
    operator: "operator@coheron.com",
    action: "operator_login",
    targetOrg: "—",
    details: "MAC operator authenticated",
    ipAddress: "10.0.0.1",
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    operator: "operator@coheron.com",
    action: "org_created",
    targetOrg: "Acme Corp",
    details: 'Created org "Acme Corp" with plan: enterprise',
    ipAddress: "10.0.0.1",
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    operator: "operator@coheron.com",
    action: "org_suspended",
    targetOrg: "Inactive Ltd",
    details: 'Suspended org "Inactive Ltd" due to non-payment',
    ipAddress: "10.0.0.2",
  },
];

const ACTION_STYLES: Record<string, string> = {
  org_created: "bg-emerald-50 text-emerald-700",
  org_suspended: "bg-red-50 text-red-700",
  org_resumed: "bg-blue-50 text-blue-700",
  user_impersonated: "bg-amber-50 text-amber-700",
  sessions_revoked: "bg-orange-50 text-orange-700",
  operator_login: "bg-slate-100 text-slate-600",
};

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const PER_PAGE = 25;

  const filtered = MOCK_AUDIT.filter((entry) => {
    if (search && !entry.operator.includes(search) && !entry.targetOrg.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (actionFilter !== "all" && entry.action !== actionFilter) return false;
    if (dateFrom && new Date(entry.timestamp) < new Date(dateFrom)) return false;
    if (dateTo && new Date(entry.timestamp) > new Date(dateTo)) return false;
    return true;
  });

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Audit Log</h1>
        <p className="text-sm text-slate-500">MAC operator actions across the platform</p>
      </div>

      {/* Note */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Connected to MAC audit backend. Displaying demo data — live audit events are loaded from the{" "}
          <code className="rounded bg-blue-100 px-1 py-0.5 font-mono text-xs">/mac/audit</code> endpoint in production.
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search operator or org…"
            className="rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-64"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>{t === "all" ? "All actions" : t.replace(/_/g, " ")}</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Operator</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Target Org</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Details</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                  No audit entries match your filters.
                </td>
              </tr>
            ) : (
              paginated.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {format(new Date(entry.timestamp), "dd MMM HH:mm:ss")}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{entry.operator}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[entry.action] ?? "bg-slate-100 text-slate-600"}`}>
                      {entry.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{entry.targetOrg}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{entry.details}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{entry.ipAddress}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · Page {page} of {totalPages || 1}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
