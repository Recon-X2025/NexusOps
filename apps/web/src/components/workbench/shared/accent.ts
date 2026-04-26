/**
 * Workbench accent tokens.
 *
 * Mirrors the executive dashboard's `ACCENT_BAR` map but kept local so
 * workbenches don't pull from a private (non-exported) constant in the
 * dashboard module. Keys match `WorkbenchAccent` in `@nexusops/types`.
 */
export const ACCENT_BAR: Record<string, string> = {
  blue: "bg-blue-600",
  emerald: "bg-emerald-600",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-600",
  cyan: "bg-cyan-600",
  orange: "bg-orange-500",
  slate: "bg-slate-600",
  indigo: "bg-indigo-600",
  teal: "bg-teal-600",
};

/** Subtle ring/border tint per accent — used on the primary visual leading edge. */
export const ACCENT_BORDER: Record<string, string> = {
  blue: "border-blue-500/40 dark:border-blue-400/40",
  emerald: "border-emerald-500/40 dark:border-emerald-400/40",
  amber: "border-amber-500/40 dark:border-amber-400/40",
  rose: "border-rose-500/40 dark:border-rose-400/40",
  violet: "border-violet-500/40 dark:border-violet-400/40",
  cyan: "border-cyan-500/40 dark:border-cyan-400/40",
  orange: "border-orange-500/40 dark:border-orange-400/40",
  slate: "border-slate-500/40 dark:border-slate-400/40",
  indigo: "border-indigo-500/40 dark:border-indigo-400/40",
  teal: "border-teal-500/40 dark:border-teal-400/40",
};

/** Severity → text & background tokens for action queue badges. */
export const SEVERITY_TONE = {
  info: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  watch: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  breach: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
} as const;
