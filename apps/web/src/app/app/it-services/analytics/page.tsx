"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRBAC, AccessDenied } from "@/lib/rbac-context";

export default function ITSMServiceDeskAnalyticsPage() {
  const { can, mergeTrpcQueryOpts } = useRBAC();
  const [days, setDays] = useState(30);
  const [whatIfRspMin, setWhatIfRspMin] = useState(60);
  const [whatIfResMin, setWhatIfResMin] = useState(480);

  const { data, isLoading } = trpc.reports.itsmServiceDeskPack.useQuery({ days }, mergeTrpcQueryOpts("reports.itsmServiceDeskPack", { refetchOnWindowFocus: false, staleTime: 60_000 },));

  const { data: whatIf } = trpc.reports.slaWhatIf.useQuery({ responseMinutes: whatIfRspMin, resolveMinutes: whatIfResMin }, mergeTrpcQueryOpts("reports.slaWhatIf", { refetchOnWindowFocus: false, staleTime: 30_000 },));

  if (!can("reports", "read")) {
    return <AccessDenied module="ITSM analytics" />;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href="/app/it-services"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            IT Services
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Period</span>
          <select
            className="rounded border border-border bg-background px-2 py-1 text-[11px]"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">ITSM service desk</h1>
          <p className="text-[11px] text-muted-foreground">
            Canned metrics aligned to the ITSM upgrade plan — SLA, backlog ageing, reopens, and volume.
          </p>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 py-12 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading metrics…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            title="SLA compliance"
            value={`${data.slaCompliancePct}%`}
            hint={`${data.ticketsCreated} tickets created in window · ${data.slaBreaches} breached`}
          />
          <MetricCard
            title="Reopen rate"
            value={`${data.reopenRatePct}%`}
            hint={`${data.reopenCount} of ${data.resolvedCount} resolved tickets had reopen activity`}
          />
          <MetricCard
            title="Handoffs breached (open)"
            value={String(data.openHandoffsBreached)}
            hint="OLA-style handoffs past due and not yet met"
          />
          <MetricCard
            title="Major incidents (open)"
            value={String(data.majorIncidentsOpen)}
            hint="Tickets flagged major in open or in-progress status"
          />
          <div className="sm:col-span-2 rounded-lg border border-border bg-card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Intake channel mix
            </h2>
            {data.intakeChannelMix.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">No tickets in this period.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[12px]">
                {data.intakeChannelMix.map((row: { channel: string; count: number }) => (
                  <li key={row.channel} className="flex justify-between gap-2 border-b border-border/60 py-1 last:border-0">
                    <span className="capitalize text-foreground/80">{row.channel}</span>
                    <span className="shrink-0 text-muted-foreground">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sm:col-span-2 rounded-lg border border-border bg-card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              SLA what-if (org calendar)
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              If a ticket started now, when would response and resolve targets land after weekend and holiday skips?
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3 text-[11px]">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">Response (min)</span>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  className="w-24 rounded border border-border bg-background px-2 py-1"
                  value={whatIfRspMin}
                  onChange={(e) => setWhatIfRspMin(Number(e.target.value) || 1)}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">Resolve (min)</span>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  className="w-24 rounded border border-border bg-background px-2 py-1"
                  value={whatIfResMin}
                  onChange={(e) => setWhatIfResMin(Number(e.target.value) || 1)}
                />
              </label>
            </div>
            {whatIf ? (
              <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
                <div className="rounded border border-border/60 bg-muted/10 px-3 py-2">
                  <dt className="text-[10px] font-medium uppercase text-muted-foreground">Response due</dt>
                  <dd className="mt-0.5 font-mono text-[11px] text-foreground">{new Date(whatIf.responseDueAt).toLocaleString()}</dd>
                </div>
                <div className="rounded border border-border/60 bg-muted/10 px-3 py-2">
                  <dt className="text-[10px] font-medium uppercase text-muted-foreground">Resolve due</dt>
                  <dd className="mt-0.5 font-mono text-[11px] text-foreground">
                    {whatIf.resolveDueAt ? new Date(whatIf.resolveDueAt).toLocaleString() : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">Computing…</p>
            )}
          </div>
          <div className="sm:col-span-2 rounded-lg border border-border bg-card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Open backlog by age
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <AgeCell label="0–1 d" value={data.backlogAgeing.d0_1} />
              <AgeCell label="2–7 d" value={data.backlogAgeing.d2_7} />
              <AgeCell label="8–30 d" value={data.backlogAgeing.d8_30} />
              <AgeCell label="30+ d" value={data.backlogAgeing.d30p} />
            </div>
          </div>
          <div className="sm:col-span-2 rounded-lg border border-border bg-card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Volume by category
            </h2>
            {data.volumeByCategory.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">No tickets in this period.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[12px]">
                {data.volumeByCategory.map((row: { category: string; count: number; pct: number }) => (
                  <li key={row.category} className="flex justify-between gap-2 border-b border-border/60 py-1 last:border-0">
                    <span className="text-foreground/80">{row.category}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {row.count} <span className="text-[10px]">({row.pct}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{hint}</p>
    </div>
  );
}

function AgeCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-muted/20 px-3 py-2 text-center">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
