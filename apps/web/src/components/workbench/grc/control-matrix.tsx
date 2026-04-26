"use client";

/**
 * Primary visual: control coverage matrix.
 *
 * Q1: Analysts spot coverage gaps and weak effectiveness ratings without
 *     filtering through a flat controls list.
 * Q2: 2-D MATRIX (category × effectiveness). Distinct from any other
 *     workbench's primary visual.
 * Q3: Pulls from `riskControls` (matrix + age) and `auditFindings` (action queue).
 * Q4: Chase stale evidence; close high-severity findings.
 */

import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";

export interface MatrixCell {
  category: string;
  effectiveness: string;
  count: number;
}

const EFFECTIVENESS_ORDER = ["effective", "partially_effective", "ineffective", "not_tested"] as const;

const EFFECTIVENESS_LABEL: Record<string, string> = {
  effective: "Effective",
  partially_effective: "Partial",
  ineffective: "Ineffective",
  not_tested: "Not tested",
};

function tone(effectiveness: string, count: number): string {
  if (count === 0) return "bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500";
  switch (effectiveness) {
    case "effective":
      return "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-200/60 dark:border-emerald-800/60";
    case "partially_effective":
      return "bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border-amber-200/60 dark:border-amber-800/60";
    case "ineffective":
      return "bg-rose-50 dark:bg-rose-900/30 text-rose-900 dark:text-rose-100 border-rose-200/60 dark:border-rose-800/60";
    case "not_tested":
    default:
      return "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200/60 dark:border-slate-700/60";
  }
}

export function ControlMatrix({
  cells,
  state,
}: {
  cells: MatrixCell[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Control coverage matrix"
      hint="Categories × effectiveness rating · counts of controls"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.indigo, "bg-indigo-500/70")}
    >
      {state !== "ok" || !cells ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No controls defined yet." : undefined}
        />
      ) : (
        <MatrixGrid cells={cells} />
      )}
    </WorkbenchSection>
  );
}

function MatrixGrid({ cells }: { cells: MatrixCell[] }) {
  const categories = Array.from(new Set(cells.map((c) => c.category))).sort();
  const grid = new Map<string, number>();
  for (const c of cells) grid.set(`${c.category}::${c.effectiveness}`, c.count);

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Category
            </th>
            {EFFECTIVENESS_ORDER.map((e) => (
              <th
                key={e}
                className="px-2 py-1.5 text-center text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {EFFECTIVENESS_LABEL[e]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat}>
              <th className="px-2 py-1.5 text-left font-medium text-slate-700 dark:text-slate-200 align-middle whitespace-nowrap">
                {cat}
              </th>
              {EFFECTIVENESS_ORDER.map((e) => {
                const count = grid.get(`${cat}::${e}`) ?? 0;
                return (
                  <td key={e} className="px-1 py-1">
                    <div
                      className={cn(
                        "rounded border px-2 py-2 text-center font-semibold tabular-nums",
                        tone(e, count),
                      )}
                      title={`${cat} · ${EFFECTIVENESS_LABEL[e]}`}
                    >
                      {count || "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
