"use client";

/**
 * Period selector shared by the Balance Sheet and the Profit & Loss screens.
 *
 * ONE component, not a copy per screen. Two screens that pick a period two
 * slightly different ways is how a balance sheet and a P&L end up describing
 * different months while looking like a matched pair — and divergent copy-paste
 * is this codebase's recurring defect (see the deprecated-twin rule in
 * CLAUDE.md).
 *
 * The vocabulary is the one finance already has: `YYYY-MM` calendar months with
 * UTC boundaries, the same keys `financial.periodClose.setClosedPeriods`
 * stores. Where the selected month is closed, that is surfaced as a factual
 * badge — a statement over a closed month is a perfectly normal thing to read,
 * it just tells you the books are no longer moving underneath it.
 */

import { Lock, CalendarRange } from "lucide-react";
import { monthLabel } from "@/lib/format-money";

export function StatementPeriodPicker({
  month,
  onMonthChange,
  isClosed,
  asAtNote,
  testId,
}: {
  month: string;
  onMonthChange: (m: string) => void;
  isClosed: boolean;
  /** Right-hand caption saying exactly what the chosen month means on THIS statement. */
  asAtNote: string;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 bg-card border border-border p-4 rounded-xl">
      <div className="space-y-1.5">
        <label
          htmlFor={`${testId}-input`}
          className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest"
        >
          Period
        </label>
        <input
          id={`${testId}-input`}
          data-testid={testId}
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          className="px-3 py-2 bg-muted/50 border border-border rounded-lg text-body-sm focus:ring-1 focus:ring-primary outline-none"
        />
      </div>

      <div className="flex items-center gap-2 pb-2">
        {isClosed && (
          <span
            data-testid={`${testId}-closed`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider"
          >
            <Lock className="w-3 h-3" />
            Period closed
          </span>
        )}
      </div>

      <p className="flex items-center gap-1.5 pb-2 text-caption text-muted-foreground ml-auto">
        <CalendarRange className="w-3.5 h-3.5 shrink-0" />
        {monthLabel(month)} — {asAtNote}
      </p>
    </div>
  );
}
