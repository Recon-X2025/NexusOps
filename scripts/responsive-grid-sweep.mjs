#!/usr/bin/env node
/**
 * Responsive grid sweep (presentation-only).
 *
 * Converts hardcoded multi-column Tailwind grids in web app pages to
 * responsive variants so cards/stat tiles stack on phones and expand on
 * desktop. Only rewrites a `grid-cols-N` token when:
 *   - it is part of a `grid grid-cols-N` utility group, AND
 *   - that same className has NO existing responsive companion
 *     (sm:/md:/lg:/xl:grid-cols-*), so we never fight an intentional choice.
 *
 * Mapping (base → responsive):
 *   grid-cols-3 → grid-cols-1 md:grid-cols-3
 *   grid-cols-4 → grid-cols-2 lg:grid-cols-4
 *   grid-cols-5 → grid-cols-2 md:grid-cols-3 lg:grid-cols-5
 *   grid-cols-6 → grid-cols-2 md:grid-cols-3 lg:grid-cols-6
 *
 * grid-cols-7+ is left untouched (calendar/day grids must not collapse).
 *
 * Dry-run by default. Pass --write to apply.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const WRITE = process.argv.includes("--write");
const ROOT = "apps/web/src/app/app";

const MAP = {
  3: "grid-cols-1 md:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
};

const files = execSync(`grep -rl "grid-cols-[3-9]" --include=page.tsx ${ROOT}`, {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

let totalEdits = 0;
const report = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Match a full className="..." attribute string so we can scope the
  // "has a responsive companion?" check to the SAME element.
  const out = src.replace(/className="([^"]*)"/g, (full, cls) => {
    // Must contain `grid` and a bare grid-cols-{3..6}.
    if (!/\bgrid\b/.test(cls)) return full;
    const bare = cls.match(/(?<![:-])\bgrid-cols-([3-6])\b/);
    if (!bare) return full;
    // Skip if a responsive grid-cols already present on this element.
    if (/(sm|md|lg|xl):grid-cols-/.test(cls)) return full;
    const n = Number(bare[1]);
    const replacement = MAP[n];
    if (!replacement) return full;
    const newCls = cls.replace(/\bgrid-cols-([3-6])\b/, replacement);
    totalEdits++;
    return `className="${newCls}"`;
  });

  if (out !== src) {
    const count = (src.match(/(?<![:-])\bgrid-cols-([3-6])\b/g) || []).length;
    report.push({ file: file.replace(`${ROOT}/`, ""), changed: count });
    if (WRITE) writeFileSync(file, out);
  }
}

console.log(`${WRITE ? "APPLIED" : "DRY-RUN"} — ${report.length} files, ${totalEdits} grid rewrites`);
for (const r of report.sort((a, b) => b.changed - a.changed)) {
  console.log(`  ${String(r.changed).padStart(2)}  ${r.file}`);
}
