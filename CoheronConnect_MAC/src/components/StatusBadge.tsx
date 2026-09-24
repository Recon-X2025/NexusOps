import type { ReactNode } from 'react';
import { CheckCircle2, Clock, AlertTriangle, CircleDashed } from 'lucide-react';
import type { OnboardingStatus } from '../lib/types';

export function StatusBadge({ status }: { status: OnboardingStatus }) {
  const map: Record<OnboardingStatus, { label: string; cls: string; icon: ReactNode }> = {
    complete: {
      label: 'Complete',
      cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/30',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    in_progress: {
      label: 'In progress',
      cls: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-400/30',
      icon: <Clock className="h-3 w-3" />,
    },
    stalled: {
      label: 'Stalled',
      cls: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/30',
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    not_started: {
      label: 'Not started',
      cls: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-500/30',
      icon: <CircleDashed className="h-3 w-3" />,
    },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const color = value >= 100 ? 'bg-emerald-500' : value >= 50 ? 'bg-brand-blue' : value > 0 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{value}%</span>
    </div>
  );
}
