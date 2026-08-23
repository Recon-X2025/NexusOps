"use client";

/**
 * Audit log.
 *
 * This page exists because a notification pointed at it and it did not exist.
 * The background sweep that verifies the tamper-evident audit chain notifies
 * owners on failure — "audit entries were deleted or altered, investigate
 * immediately" — and linked to /app/admin/audit-log, which 404'd. The alert
 * was real; the destination was missing.
 *
 * So chain integrity is the first thing on the page, not a footnote: someone
 * arriving from that notification needs the answer above the fold. The entry
 * list follows, filterable, because "what changed" is the next question.
 */

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

const PAGE_SIZE = 50;

function fmt(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");

  const enabled = can("admin", "read");

  const chainQ = trpc.admin.auditLog.verifyChain.useQuery(
    undefined,
    mergeTrpcQueryOpts("admin.auditLog.verifyChain", { enabled }),
  );
  const listQ = trpc.admin.auditLog.list.useQuery(
    {
      page,
      limit: PAGE_SIZE,
      ...(action ? { action } : {}),
      ...(resourceType ? { resourceType } : {}),
    },
    mergeTrpcQueryOpts("admin.auditLog.list", { enabled }),
  );

  if (!enabled) return <AccessDenied module="admin" />;

  const chain = chainQ.data;
  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Administration
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded change, and whether the record itself can be trusted.
        </p>
      </header>

      {/* ── Chain integrity — first, because that is why people arrive ── */}
      <section
        className="rounded-lg border p-4"
        aria-live="polite"
        data-testid="audit-chain-status"
      >
        {chainQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking chain integrity…</p>
        ) : chainQ.isError ? (
          <p className="text-sm text-muted-foreground">
            Chain integrity could not be checked. The entries below are still shown.
          </p>
        ) : chain?.ok ? (
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">Chain verified</p>
              <p className="text-sm text-muted-foreground">
                All {chain.entries.toLocaleString()} chained entries re-derive to their
                stored hashes. No entry has been altered or removed.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-medium text-red-700 dark:text-red-400">
                Chain verification failed
              </p>
              <p className="text-sm text-muted-foreground">
                {chain?.reason ?? "The audit chain does not re-derive."}
                {chain?.brokenAtSeq != null && (
                  <> First mismatch at entry #{chain.brokenAtSeq}.</>
                )}{" "}
                This means audit entries were altered or deleted. The log below cannot be
                relied on from that point forward.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Filters ── */}
      <section className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Action</span>
          <input
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            placeholder="e.g. update"
            className="h-9 w-48 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Resource type</span>
          <input
            value={resourceType}
            onChange={(e) => { setResourceType(e.target.value); setPage(1); }}
            placeholder="e.g. ticket"
            className="h-9 w-48 rounded-md border bg-background px-3 text-sm"
          />
        </label>
        <span className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
        </span>
      </section>

      {/* ── Entries ── */}
      <section className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Resource</th>
              <th className="px-3 py-2 font-medium">From</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                No entries match these filters.
              </td></tr>
            ) : (
              items.map((e) => (
                <tr key={e.id} className="border-b last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{fmt(e.createdAt)}</td>
                  <td className="px-3 py-2">
                    {e.userName ?? "System"}
                    {e.userEmail && (
                      <span className="block text-xs text-muted-foreground">{e.userEmail}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{e.action}</td>
                  <td className="px-3 py-2">
                    {e.resourceType ?? "—"}
                    {e.resourceId && (
                      <span className="block font-mono text-xs text-muted-foreground">{e.resourceId}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                    {e.ipAddress ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
