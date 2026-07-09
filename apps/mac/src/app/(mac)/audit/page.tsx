"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getAuditLog, verifyAuditChain } from "@/lib/mac-api";
import type { AuditEntry, ChainVerification } from "@/lib/mac-api";

const ACTION_TYPES = [
  "all",
  "operator_login",
  "org_created",
  "org_suspended",
  "org_resumed",
  "sessions_revoked",
  "user_impersonated",
  "feature_flag_set",
  "feature_flag_bulk_set",
  "billing_updated",
  "deploy_triggered",
  "legal_recorded",
];

const ACTION_STYLES: Record<string, string> = {
  operator_login: "bg-slate-100 text-slate-600",
  org_created: "bg-emerald-50 text-emerald-700",
  org_suspended: "bg-red-50 text-red-700",
  org_resumed: "bg-blue-50 text-blue-700",
  sessions_revoked: "bg-orange-50 text-orange-700",
  user_impersonated: "bg-amber-50 text-amber-700",
  feature_flag_set: "bg-violet-50 text-violet-700",
  feature_flag_bulk_set: "bg-purple-50 text-purple-700",
  billing_updated: "bg-teal-50 text-teal-700",
  deploy_triggered: "bg-indigo-50 text-indigo-700",
  legal_recorded: "bg-cyan-50 text-cyan-700",
};

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) return "—";
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");
}

const PER_PAGE = 50;

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState<ChainVerification | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAuditLog({
        page,
        action: actionFilter,
        search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        setChain(await verifyAuditChain());
      } catch {
        /* integrity badge is best-effort */
      }
    })();
  }, []);

  const totalPages = Math.ceil(total / PER_PAGE) || 1;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Audit Log</h1>
          <p className="text-sm text-slate-500">MAC operator actions across the platform</p>
        </div>
        {chain && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              chain.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {chain.ok ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            {chain.ok
              ? `Chain verified · ${chain.entries} entries`
              : `Tamper detected at seq ${chain.brokenAtSeq}`}
          </span>
        )}
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
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                  No audit entries match your filters.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
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
                  <td className="px-4 py-3 text-slate-600">{entry.targetOrg ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDetails(entry.details)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{entry.ipAddress ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">
            {total} {total === 1 ? "entry" : "entries"} · Page {page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
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
