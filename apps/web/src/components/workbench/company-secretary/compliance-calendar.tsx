"use client";

/**
 * Primary visual: compliance calendar (next 60 days, week-of-year strip).
 *
 * Q1: CS sees statutory deadlines and board events on a single timeline so
 *     a missed filing becomes visually unmissable.
 * Q2: 60-DAY ROLLING CALENDAR (week strip with deadline markers). Distinct
 *     from Change & Release's 14-day grid (different cadence, regulatory
 *     marker shapes, days-to-deadline emphasis).
 * Q3: Pulls from `secretarialFilings`, `boardMeetings`, `boardResolutions`.
 * Q4: Push filings due ≤14 days; draft board pack for next meeting.
 */

import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";
import { formatDate } from "../shared/format";

export interface FilingMarker {
  id: string;
  formNumber: string;
  title: string;
  authority: string;
  category: string;
  status: string;
  dueDate: string;
  daysToDeadline: number;
}

export interface MeetingMarker {
  id: string;
  number: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  venue: string | null;
}

const STATUS_TONE: Record<string, string> = {
  upcoming: "bg-violet-500",
  in_progress: "bg-amber-500",
  delayed: "bg-orange-500",
  overdue: "bg-rose-600",
};

export function ComplianceCalendar({
  filings,
  meetings,
  state,
}: {
  filings: FilingMarker[] | null;
  meetings: MeetingMarker[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Compliance calendar"
      hint="Next 60 days · statutory filings + board events"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.violet, "bg-violet-400/70")}
    >
      {state !== "ok" || (!filings?.length && !meetings?.length) ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No filings or board events scheduled in the next 60 days." : undefined}
        />
      ) : (
        <Timeline filings={filings ?? []} meetings={meetings ?? []} />
      )}
    </WorkbenchSection>
  );
}

function Timeline({ filings, meetings }: { filings: FilingMarker[]; meetings: MeetingMarker[] }) {
  const totalDays = 60;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = today.getTime() + totalDays * 24 * 60 * 60 * 1000;

  type Marker = { id: string; label: string; sub: string; daysFromNow: number; tone: string; kind: "filing" | "meeting" };
  const markers: Marker[] = [];
  for (const f of filings) {
    const d = new Date(f.dueDate).getTime();
    if (d > horizon) continue;
    markers.push({
      id: `f-${f.id}`,
      label: f.formNumber,
      sub: `${f.authority} · ${f.daysToDeadline}d`,
      daysFromNow: Math.max(0, Math.floor((d - today.getTime()) / (24 * 60 * 60 * 1000))),
      tone: STATUS_TONE[f.status] ?? "bg-violet-500",
      kind: "filing",
    });
  }
  for (const m of meetings) {
    const d = new Date(m.scheduledAt).getTime();
    if (d > horizon) continue;
    markers.push({
      id: `m-${m.id}`,
      label: m.number,
      sub: `${m.type} · ${formatDate(m.scheduledAt)}`,
      daysFromNow: Math.max(0, Math.floor((d - today.getTime()) / (24 * 60 * 60 * 1000))),
      tone: "bg-indigo-500",
      kind: "meeting",
    });
  }
  markers.sort((a, b) => a.daysFromNow - b.daysFromNow);

  const weeks = Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => i);

  return (
    <div>
      <div className="relative h-2 rounded bg-slate-100 dark:bg-slate-800 mb-1">
        {weeks.map((i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-slate-200 dark:border-slate-700"
            style={{ left: `${(i / weeks.length) * 100}%` }}
          />
        ))}
        {markers.map((m) => (
          <span
            key={m.id}
            className={cn("absolute top-1/2 -translate-y-1/2 h-3 w-1.5 rounded-sm", m.tone)}
            style={{ left: `${(m.daysFromNow / totalDays) * 100}%` }}
            title={`${m.label} · ${m.sub}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        <span>Today</span>
        <span>+30d</span>
        <span>+60d</span>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
        {markers.slice(0, 12).map((m) => (
          <li key={m.id} className="flex items-center gap-2">
            <span className={cn("inline-block h-2 w-2 rounded-sm", m.tone)} />
            <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{m.label}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{m.sub}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
