"use client";

import { cn } from "@/lib/utils";

const R = 36;
const C = 2 * Math.PI * R;

export function ScoreRing({
  score,
  state,
  size = 72,
}: {
  score: number;
  state: "healthy" | "watch" | "stressed";
  size?: number;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const offset = C - (pct / 100) * C;
  const stroke =
    state === "healthy" ? "#15803d" : state === "watch" ? "#b45309" : "#b91c1c";
  const label = `Composite health score ${score} out of 100, posture ${state}`;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="8" className="text-[#D3D1C7] dark:text-slate-700" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeDasharray={C}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums",
          "text-[#001B3D] dark:text-slate-100",
        )}
      >
        {score}
      </div>
    </div>
  );
}
