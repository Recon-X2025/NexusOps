"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

const DISMISS_KEY = "cc.onboardingChecklist.dismissed";

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First-run "getting started" checklist shown on the Command Center for new
 * orgs. Progress is derived server-side from live data (onboarding.getChecklist).
 * The widget hides itself once every item is complete, or when the user dismisses
 * it (remembered locally). It never blocks the dashboard.
 */
export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState<boolean>(isDismissed);
  const q = trpc.onboarding.getChecklist.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  // Hide while loading, on error, once fully complete, or when dismissed.
  if (dismissed || q.isLoading || q.isError || !q.data || q.data.allComplete) {
    return null;
  }

  const { items, completed, total } = q.data;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-body-sm font-semibold text-slate-900 dark:text-slate-100">
            Get your workspace ready
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-400">
            {completed} of {total} done — finish these to get the most out of the pilot.
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss getting-started checklist"
          className="rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                item.done
                  ? "border-transparent bg-transparent"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700"
              }`}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              <span className="flex-1">
                <span
                  className={`block text-[13px] font-medium ${
                    item.done
                      ? "text-slate-500 line-through dark:text-slate-500"
                      : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {item.title}
                </span>
                {!item.done && (
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {item.description}
                  </span>
                )}
              </span>
              {!item.done && (
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
