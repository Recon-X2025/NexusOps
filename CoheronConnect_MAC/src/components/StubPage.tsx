import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { PageHeader } from './PageHeader';

export function StubPage({ title, subtitle, message }: { title: string; subtitle?: string; message?: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-800/50">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
          <Inbox className="h-7 w-7" />
        </div>
        <h3 className="font-heading text-lg font-semibold text-slate-700 dark:text-slate-200">Nothing here yet</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {message ?? 'This module has not been built out. Check back after the next platform release.'}
        </p>
      </div>
    </div>
  );
}

export function StubPageWithIcon({ title, subtitle, message, icon }: { title: string; subtitle?: string; message?: string; icon: ReactNode }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-800/50">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
          {icon}
        </div>
        <h3 className="font-heading text-lg font-semibold text-slate-700 dark:text-slate-200">Nothing here yet</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {message ?? 'This module has not been built out. Check back after the next platform release.'}
        </p>
      </div>
    </div>
  );
}
