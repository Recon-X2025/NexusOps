import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
  action,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  action?: ReactNode;
}) {
  const content = actions ?? action;
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {content && <div className="flex items-center gap-2">{content}</div>}
    </div>
  );
}
