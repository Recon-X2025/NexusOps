/**
 * Phase A1 — org-level SLA calendar hints via `organizations.settings` JSON.
 * Keys: `slaSkipWeekends` (boolean, default true), `slaHolidayDates` (string[] "YYYY-MM-DD" UTC dates).
 */

export type OrgSlaCalendarSettings = {
  slaSkipWeekends: boolean;
  slaHolidayDates: string[];
};

export function parseOrgSlaCalendarSettings(raw: unknown): OrgSlaCalendarSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { slaSkipWeekends: true, slaHolidayDates: [] };
  }
  const o = raw as Record<string, unknown>;
  const dates = Array.isArray(o.slaHolidayDates)
    ? o.slaHolidayDates.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x))
    : [];
  return {
    slaSkipWeekends: o.slaSkipWeekends !== false,
    slaHolidayDates: dates,
  };
}

function utcYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * If the instant falls on a skipped weekend day or org holiday (UTC date), roll forward day-by-day until clear.
 */
export function adjustSlaDeadlineForBusinessCalendar(
  deadline: Date,
  settings: OrgSlaCalendarSettings,
): Date {
  let d = new Date(deadline.getTime());
  const holidays = new Set(settings.slaHolidayDates);
  for (let guard = 0; guard < 366; guard++) {
    const dow = d.getUTCDay();
    const weekend = settings.slaSkipWeekends && (dow === 0 || dow === 6);
    const hol = holidays.has(utcYmd(d));
    if (!weekend && !hol) return d;
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return deadline;
}
