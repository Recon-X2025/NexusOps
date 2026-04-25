"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";
import { ChevronRight, Flame, Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

export default function MajorIncidentWarRoomPage() {
  const params = useParams();
  const ticketId = typeof params.ticketId === "string" ? params.ticketId : "";
  const { can, mergeTrpcQueryOpts } = useRBAC();

  const detailQuery = trpc.tickets.get.useQuery(
    { id: ticketId },
    mergeTrpcQueryOpts("tickets.get", {
      enabled: Boolean(ticketId) && can("incidents", "read"),
      refetchOnWindowFocus: true,
    }),
  );

  const commsQuery = trpc.tickets.majorIncidentComms.list.useQuery(
    { ticketId },
    mergeTrpcQueryOpts("tickets.majorIncidentComms.list", {
      enabled: Boolean(ticketId) && can("incidents", "read"),
      refetchInterval: 15_000,
    }),
  );

  if (!can("incidents", "read")) {
    return <AccessDenied module="IT Services" />;
  }

  const ticket = detailQuery.data?.ticket as
    | {
        id: string;
        number: string;
        title: string;
        isMajorIncident?: boolean;
        updatedAt?: string;
      }
    | undefined;

  const comms = (commsQuery.data ?? []) as { id: string; body: string; createdAt: string }[];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-background">
      <nav className="flex items-center gap-1 border-b border-border px-4 py-2 text-[11px] text-muted-foreground/70 shrink-0">
        <Link href="/app/it-services" className="hover:text-primary">
          IT Services
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/app/it-services/major-incidents" className="hover:text-primary">
          Major incidents
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-muted-foreground">War room</span>
      </nav>

      <header className="flex items-start gap-3 border-b border-border bg-red-50/80 dark:bg-red-950/20 px-4 py-4 shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
          <Flame className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {detailQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading incident…
            </div>
          )}
          {detailQuery.isError && (
            <p className="text-sm text-destructive">Could not load this ticket.</p>
          )}
          {ticket && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/tickets/${ticket.id}`}
                  className="font-mono text-[12px] text-primary hover:underline"
                >
                  {ticket.number}
                </Link>
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800 dark:bg-red-900/50 dark:text-red-100">
                  Major incident
                </span>
              </div>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{ticket.title}</h1>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Read-focused war-room view. Edit the record in the{" "}
                <Link href={`/app/tickets/${ticket.id}`} className="text-primary hover:underline">
                  ticket workspace
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-0 md:flex-row md:gap-0 overflow-hidden">
        <section className="flex flex-1 flex-col border-b border-border md:border-b-0 md:border-r min-h-[40vh] md:min-h-0">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
            Comms log
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {commsQuery.isLoading && (
              <div className="flex justify-center py-8 text-muted-foreground gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading comms…
              </div>
            )}
            {!commsQuery.isLoading && comms.length === 0 && (
              <p className="text-sm text-muted-foreground">No comms yet. Append from the ticket detail.</p>
            )}
            {comms.map((c) => (
              <article
                key={c.id}
                className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-snug"
              >
                <p className="whitespace-pre-wrap text-foreground/90">{c.body}</p>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {formatRelativeTime(c.createdAt)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <aside className="w-full md:w-80 shrink-0 border-t border-border md:border-t-0 bg-muted/10">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
            Hierarchy
          </div>
          <div className="p-4 text-[12px] space-y-3">
            {detailQuery.isLoading && <p className="text-muted-foreground">…</p>}
            {ticket && detailQuery.data && (
              <>
                {(detailQuery.data as { parentTicket?: { id: string; number: string; title: string } | null })
                  .parentTicket && (
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Parent</p>
                    <Link
                      href={`/app/it-services/major-incidents/war-room/${(detailQuery.data as { parentTicket: { id: string } }).parentTicket.id}`}
                      className="font-medium text-primary hover:underline block truncate"
                    >
                      {(detailQuery.data as { parentTicket: { number: string; title: string } }).parentTicket.number}{" "}
                      — {(detailQuery.data as { parentTicket: { title: string } }).parentTicket.title}
                    </Link>
                  </div>
                )}
                {Array.isArray((detailQuery.data as { childTickets?: { id: string; number: string; title: string }[] }).childTickets) &&
                  (detailQuery.data as { childTickets: { id: string; number: string; title: string }[] }).childTickets
                    .length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Children</p>
                      <ul className="space-y-1.5">
                        {(detailQuery.data as { childTickets: { id: string; number: string; title: string }[] }).childTickets.map(
                          (ch) => (
                            <li key={ch.id}>
                              <Link
                                href={`/app/it-services/major-incidents/war-room/${ch.id}`}
                                className="text-primary hover:underline block truncate"
                              >
                                {ch.number} — {ch.title}
                              </Link>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                {!(
                  (detailQuery.data as { parentTicket?: unknown }).parentTicket ||
                  ((detailQuery.data as { childTickets?: unknown[] }).childTickets?.length ?? 0) > 0
                ) && <p className="text-muted-foreground">No parent/child links on this record.</p>}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
