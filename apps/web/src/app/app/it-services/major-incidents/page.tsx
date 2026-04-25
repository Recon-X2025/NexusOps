"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { Flame, Loader2, ChevronRight } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

export default function MajorIncidentsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();

  const { data, isLoading, isError, refetch } = trpc.tickets.list.useQuery({
      type: "incident",
      isMajorIncident: true,
      limit: 50,
      orderBy: "updatedAt",
      order: "desc",
    }, mergeTrpcQueryOpts("tickets.list", { enabled: can("incidents", "read"), refetchOnWindowFocus: false },));

  if (!can("incidents", "read")) {
    return <AccessDenied module="IT Services" />;
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <nav className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
        <Link href="/app/it-services" className="hover:text-primary">
          IT Services
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">Major incidents</span>
      </nav>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
          <Flame className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Major incidents</h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Incidents flagged as major for war-room coordination. Toggle the flag on a ticket under{" "}
            <span className="font-medium text-foreground/80">Service linkage</span> on the ticket record.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => refetch()}
          className="text-[11px] rounded border border-border px-2 py-1 hover:bg-muted/40"
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground gap-2 rounded-lg border border-border bg-card">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Could not load major incidents.
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No major incidents right now.
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {(items as {
            id: string;
            number: string;
            title: string;
            updatedAt: string;
            parentTicketId?: string | null;
          }[]).map((t) => (
            <li key={t.id} className="border-b border-border last:border-0">
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/tickets/${t.id}`}
                      className="font-mono text-[11px] text-primary hover:underline"
                    >
                      {t.number}
                    </Link>
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800">
                      Major
                    </span>
                    {t.parentTicketId ? (
                      <Link
                        href={`/app/tickets/${t.parentTicketId}`}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Parent →
                      </Link>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/80">Top-level</span>
                    )}
                  </div>
                  <Link
                    href={`/app/tickets/${t.id}`}
                    className="mt-0.5 block truncate text-[13px] font-medium text-foreground/90 hover:text-primary"
                  >
                    {t.title}
                  </Link>
                </div>
                <Link
                  href={`/app/tickets/${t.id}`}
                  className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {formatRelativeTime(t.updatedAt)}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
