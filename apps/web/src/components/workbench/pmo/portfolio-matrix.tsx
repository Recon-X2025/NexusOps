"use client";

/**
 * Primary visual: 2×2 portfolio matrix (impact × confidence).
 *
 * Q1: PMO sees which projects need air cover (high impact, low confidence)
 *     instantly — without exporting the projects table to CSV.
 * Q2: SCATTER ON A 2×2 GRID with health-pill points. Distinct from any
 *     other workbench's primary visual.
 * Q3: Pulls from `projects` (matrix), `projectMilestones` (risks),
 *     `projectDependencies` (graph).
 * Q4: Address red projects + overdue milestones first.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";

export interface PortfolioPoint {
  id: string;
  number: string;
  name: string;
  health: string;
  status: string;
  impact: number;
  confidence: number;
  ownerName: string | null;
}

const HEALTH_TONE: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

export function PortfolioMatrix({
  points,
  state,
}: {
  points: PortfolioPoint[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Portfolio matrix"
      hint="Impact (horizontal) × confidence (vertical) · point color = health"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.blue, "bg-blue-400/70")}
    >
      {state !== "ok" || !points ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No active projects in the portfolio." : undefined}
        />
      ) : (
        <Plot points={points} />
      )}
    </WorkbenchSection>
  );
}

function Plot({ points }: { points: PortfolioPoint[] }) {
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 md:col-span-8">
        <div className="relative aspect-[4/3] rounded-md border border-slate-200 dark:border-slate-700/70 bg-slate-50/60 dark:bg-slate-900/40">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200 dark:bg-slate-700" />
          <span className="absolute top-1 left-1.5 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Hi confidence · Lo impact
          </span>
          <span className="absolute top-1 right-1.5 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Hi confidence · Hi impact
          </span>
          <span className="absolute bottom-1 left-1.5 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Lo confidence · Lo impact
          </span>
          <span className="absolute bottom-1 right-1.5 text-[10px] uppercase tracking-wider text-rose-500">
            Lo confidence · Hi impact
          </span>
          {points.map((p) => {
            const left = `${Math.max(2, Math.min(98, p.impact * 100))}%`;
            const top = `${Math.max(2, Math.min(98, (1 - p.confidence) * 100))}%`;
            return (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left, top }}
                title={`${p.number} — ${p.name}`}
              >
                <span className={cn("block h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900", HEALTH_TONE[p.health] ?? "bg-slate-500")} />
                <span className="absolute left-3 top-1.5 ml-1 hidden whitespace-nowrap rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 shadow-sm group-hover:block">
                  {p.number}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="col-span-12 md:col-span-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
          Legend / red list
        </div>
        <ul className="text-xs space-y-1">
          {points
            .filter((p) => p.health === "red")
            .slice(0, 6)
            .map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className={cn("inline-block h-2 w-2 rounded-full", HEALTH_TONE.red)} />
                <Link href={`/app/projects/${p.id}`} className="text-blue-700 dark:text-blue-300 hover:underline truncate">
                  {p.number} — {p.name}
                </Link>
              </li>
            ))}
          {points.filter((p) => p.health === "red").length === 0 ? (
            <li className="text-slate-500 dark:text-slate-400">No red projects.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
