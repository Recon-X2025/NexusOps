"use client";

/**
 * ExecutivePeriodPicker — drop-in replacement for the old `<select>`
 * based time-range picker. Opens a popover with two panes:
 *
 *   - left:  preset list grouped by horizon (Recent, Year ranges, …)
 *   - right: a two-month calendar that supports range selection
 *
 * The component still surfaces a single `value` string so existing
 * callers (`HubCommandCenter`, `WorkbenchReportsTab`,
 * `CommandCenterShell`, the Command Center page) don't have to manage
 * two state slots. Custom ranges round-trip through
 * `custom:YYYY-MM-DD:YYYY-MM-DD` ids that
 * `resolveExecutiveQuickRange` knows how to expand.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  customRangeDisplay,
  customRangeId,
  EXECUTIVE_QUICK_RANGES,
  executiveQuickRangeSelectGroups,
  executiveRangeDisplay,
  isCustomRangeId,
  resolveExecutiveQuickRange,
} from "@/lib/executive-quick-ranges";
import { cn } from "@/lib/utils";

interface PickerProps {
  value: string;
  onChange: (id: string) => void;
  id?: string;
  className?: string;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function ExecutivePeriodPicker({ value, onChange, id, className }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Resolve the current value to dates so the calendar opens already
  // pointing at the user's selected window.
  const resolved = useMemo(() => resolveExecutiveQuickRange(value), [value]);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(resolved.fromDate));

  useEffect(() => {
    if (!open) return;
    setViewMonth(startOfMonth(resolved.fromDate));
    if (isCustomRangeId(value)) {
      setDraftStart(startOfDay(resolved.fromDate));
      setDraftEnd(startOfDay(resolved.toDate));
    } else {
      setDraftStart(null);
      setDraftEnd(null);
    }
    setHover(null);
  }, [open, value, resolved.fromDate, resolved.toDate]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const groups = executiveQuickRangeSelectGroups();
  const display = executiveRangeDisplay(value);

  function pickPreset(presetId: string) {
    onChange(presetId);
    setOpen(false);
  }

  function pickDay(day: Date) {
    const d = startOfDay(day);
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(d);
      setDraftEnd(null);
      setHover(null);
      return;
    }
    let from = draftStart;
    let to = d;
    if (isBefore(to, from)) [from, to] = [to, from];
    setDraftStart(from);
    setDraftEnd(to);
    onChange(customRangeId(from, to));
    setOpen(false);
  }

  // Two-month layout: left = current viewMonth, right = next month.
  const months = [viewMonth, addMonths(viewMonth, 1)];

  return (
    <div ref={wrapRef} className={cn("relative inline-flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[11px] text-[#001B3D]/70 dark:text-slate-400", className)}>
      <span className="whitespace-nowrap font-medium">Time range</span>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1.5 min-w-0 w-full sm:w-auto sm:max-w-[280px] rounded-lg border border-[#001B3D]/15 dark:border-slate-600 bg-white dark:bg-slate-900 text-[#001B3D] dark:text-slate-100 text-xs py-1.5 px-2.5 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate font-medium">{display}</span>
        <ChevronRight className={cn("h-3 w-3 shrink-0 opacity-50 transition-transform", open && "rotate-90")} aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Pick a time range"
          className="absolute right-0 top-[calc(100%+6px)] z-50 flex flex-col md:flex-row rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
          style={{ minWidth: 320 }}
        >
          <div className="md:w-[180px] max-h-[360px] md:max-h-[460px] overflow-y-auto border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 py-2">
            {groups.map((g) => (
              <div key={g.group} className="px-2 mb-1.5 last:mb-0">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500 px-1.5 mb-0.5">
                  {g.group}
                </div>
                <ul>
                  {g.options.map((o) => {
                    const active = !isCustomRangeId(value) && o.id === value;
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => pickPreset(o.id)}
                          className={cn(
                            "w-full text-left px-2 py-1 rounded text-[11px] font-medium",
                            active
                              ? "bg-blue-600 text-white"
                              : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
                          )}
                        >
                          {o.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="p-3 md:p-3.5 flex flex-col gap-2.5 max-w-[640px]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {format(months[0]!, "MMMM yyyy")}
                <span className="hidden md:inline">{" · "}{format(months[1]!, "MMMM yyyy")}</span>
              </div>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:gap-4">
              {months.map((monthAnchor, idx) => (
                <CalendarMonth
                  key={idx}
                  month={monthAnchor}
                  draftStart={draftStart}
                  draftEnd={draftEnd}
                  hover={hover}
                  onHover={setHover}
                  onPick={pickDay}
                  hideOnSmall={idx === 1}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="tabular-nums">
                {draftStart && draftEnd
                  ? customRangeDisplay(draftStart, draftEnd)
                  : draftStart
                  ? `${format(draftStart, "MMM d, yyyy")} → pick end`
                  : "Click a day to start a range"}
              </span>
              {draftStart || draftEnd ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraftStart(null);
                    setDraftEnd(null);
                    setHover(null);
                  }}
                  className="rounded px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarMonth({
  month,
  draftStart,
  draftEnd,
  hover,
  onHover,
  onPick,
  hideOnSmall,
}: {
  month: Date;
  draftStart: Date | null;
  draftEnd: Date | null;
  hover: Date | null;
  onHover: (d: Date | null) => void;
  onPick: (d: Date) => void;
  hideOnSmall?: boolean;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const previewEnd = !draftEnd && draftStart && hover ? hover : draftEnd;
  const rangeFrom =
    draftStart && previewEnd
      ? isBefore(draftStart, previewEnd)
        ? draftStart
        : previewEnd
      : draftStart;
  const rangeTo =
    draftStart && previewEnd
      ? isAfter(previewEnd, draftStart)
        ? previewEnd
        : draftStart
      : null;

  return (
    <div className={cn("flex flex-col gap-1", hideOnSmall && "hidden md:flex")}>
      <div className="grid grid-cols-7 text-[10px] font-semibold text-slate-400 dark:text-slate-500 px-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="h-6 flex items-center justify-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((d) => {
          const inMonth = isSameMonth(d, monthStart);
          const isStart = draftStart ? isSameDay(d, draftStart) : false;
          const isEnd = draftEnd ? isSameDay(d, draftEnd) : false;
          const inRange =
            rangeFrom && rangeTo
              ? !isBefore(d, rangeFrom) && !isAfter(d, rangeTo)
              : false;
          const isToday = isSameDay(d, new Date());
          return (
            <button
              key={d.toISOString()}
              type="button"
              onMouseEnter={() => draftStart && !draftEnd && onHover(d)}
              onMouseLeave={() => draftStart && !draftEnd && onHover(null)}
              onClick={() => onPick(d)}
              className={cn(
                "h-7 w-7 text-[11px] tabular-nums rounded-md inline-flex items-center justify-center transition-colors",
                inMonth ? "text-slate-700 dark:text-slate-200" : "text-slate-300 dark:text-slate-600",
                inRange && !isStart && !isEnd && "bg-blue-50 dark:bg-blue-900/30",
                (isStart || isEnd) && "bg-blue-600 text-white hover:bg-blue-600",
                !inRange && !isStart && !isEnd && "hover:bg-slate-100 dark:hover:bg-slate-800",
                isToday && !isStart && !isEnd && "ring-1 ring-blue-400/60",
              )}
              aria-label={format(d, "EEEE, MMMM d, yyyy")}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-slate-400 dark:text-slate-500 px-1">
        {format(monthStart, "MMM yyyy")}
      </div>
    </div>
  );
}

// Reference touched to silence unused export warnings if a downstream
// caller imports the constant for types.
export { EXECUTIVE_QUICK_RANGES };
