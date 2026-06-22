"use client";

/**
 * Primary visual: account portfolio grid.
 *
 * Q1: CSM scans the book of business by ARR × health, sorts by renewal
 *     window — without juggling the CRM and contracts modules.
 * Q2: PORTFOLIO CARD GRID where card emphasis encodes ARR and health.
 *     Distinct from any list/table/calendar visual.
 * Q3: Pulls from `crmAccounts` (cards) and `contracts` (renewal tail),
 *     with derived `healthHistogram` summary.
 * Q4: Reach out to detractors; warm renewals < 60 days.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ACCENT_BORDER } from "../shared/accent";
import { WorkbenchSection, WorkbenchEmpty } from "../shared/workbench-section";

export interface AccountCard {
  id: string;
  name: string;
  industry: string | null;
  tier: string;
  healthScore: number | null;
  annualRevenue: string | null;
  ownerName: string | null;
}

function healthTone(score: number | null): { ring: string; dot: string } {
  const s = score ?? 50;
  if (s < 40) return { ring: "ring-rose-300 dark:ring-rose-800/60", dot: "bg-rose-500" };
  if (s < 60) return { ring: "ring-amber-300 dark:ring-amber-800/60", dot: "bg-amber-500" };
  if (s < 80) return { ring: "ring-emerald-300 dark:ring-emerald-800/60", dot: "bg-emerald-500" };
  return { ring: "ring-emerald-400 dark:ring-emerald-700/80", dot: "bg-emerald-600" };
}

function arrEmphasis(annualRevenue: string | null): string {
  const v = Number(annualRevenue ?? "0");
  if (v >= 500_000) return "md:col-span-2 md:row-span-2";
  if (v >= 100_000) return "md:col-span-2";
  return "";
}

export function AccountPortfolio({
  accounts,
  state,
}: {
  accounts: AccountCard[] | null;
  state: "loading" | "ok" | "no_data" | "error";
}) {
  return (
    <WorkbenchSection
      title="Account portfolio"
      hint="Cards sized by ARR · ring colored by health · sorted by lowest health first"
      accentEdgeClassName={cn("border-l", ACCENT_BORDER.amber, "bg-amber-500/70")}
    >
      {state !== "ok" || !accounts ? (
        <WorkbenchEmpty
          state={state === "ok" ? "no_data" : state}
          message={state === "no_data" ? "No accounts in your portfolio." : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 auto-rows-[6.5rem]">
          {accounts.slice(0, 16).map((a) => {
            const tone = healthTone(a.healthScore);
            return (
              <Link
                key={a.id}
                href={`/app/crm/accounts/${a.id}`}
                className={cn(
                  "rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 hover:border-amber-300 dark:hover:border-amber-700 transition-colors flex flex-col justify-between ring-2 ring-inset",
                  tone.ring,
                  arrEmphasis(a.annualRevenue),
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#001B3D] dark:text-slate-100 truncate">{a.name}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">
                      {a.tier} · {a.industry ?? "—"}
                    </div>
                  </div>
                  <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{a.ownerName ?? "Unowned"}</span>
                  <span className="text-[11px] tabular-nums font-medium text-slate-700 dark:text-slate-200">
                    H {a.healthScore ?? "?"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </WorkbenchSection>
  );
}
