#!/usr/bin/env node
/**
 * Responsive table sweep (presentation-only).
 *
 * Wraps raw `<table className="w-full ...">` elements that are NOT already
 * inside a horizontal-scroll container in a `<div className="overflow-x-auto">`
 * so wide data tables scroll on phones instead of breaking the layout.
 *
 * Tables using the shared `ent-table` class are handled in CSS (globals.css)
 * and are skipped here. Only `w-full` raw tables are considered.
 *
 * Strategy (conservative, line-based):
 *   - find a line whose trimmed content STARTS with `<table className="w-full`
 *   - skip if either of the 2 preceding non-blank lines already opens an
 *     overflow-x-auto / overflow-auto container
 *   - find the matching `</table>` by scanning forward at the same nesting
 *   - wrap the [<table> .. </table>] block in a div, preserving indentation
 *
 * Dry-run by default. Pass --write to apply.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const WRITE = process.argv.includes("--write");
const ROOT = "apps/web/src/app/app";

const files = execSync(
  `grep -rl '<table className="w-full' --include=page.tsx ${ROOT}`,
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

let wrapped = 0;
const report = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  const result = [];
  let fileWraps = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isTableOpen =
      trimmed.startsWith('<table className="w-full') &&
      !trimmed.includes("ent-table");

    if (!isTableOpen) {
      result.push(line);
      continue;
    }

    // Look back up to 2 non-blank already-emitted lines for an existing wrapper.
    let already = false;
    for (let k = result.length - 1, seen = 0; k >= 0 && seen < 2; k--) {
      if (result[k].trim() === "") continue;
      seen++;
      if (/overflow-x-auto|overflow-auto/.test(result[k])) {
        already = true;
        break;
      }
    }
    if (already) {
      result.push(line);
      continue;
    }

    // Find matching </table> by depth counting on <table ...> / </table>.
    let depth = 0;
    let end = -1;
    for (let j = i; j < lines.length; j++) {
      const opens = (lines[j].match(/<table\b/g) || []).length;
      const closes = (lines[j].match(/<\/table>/g) || []).length;
      depth += opens - closes;
      if (depth === 0) {
        end = j;
        break;
      }
    }
    if (end === -1) {
      // Couldn't safely find the close — leave untouched.
      result.push(line);
      continue;
    }

    const indent = line.match(/^\s*/)[0];
    result.push(`${indent}<div className="overflow-x-auto">`);
    for (let j = i; j <= end; j++) result.push("  " + lines[j]);
    result.push(`${indent}</div>`);
    fileWraps++;
    wrapped++;
    i = end; // skip past the wrapped block
  }

  if (fileWraps > 0) {
    report.push({ file: file.replace(`${ROOT}/`, ""), wraps: fileWraps });
    if (WRITE) writeFileSync(file, result.join("\n"));
  }
}

console.log(
  `${WRITE ? "APPLIED" : "DRY-RUN"} — ${report.length} files, ${wrapped} tables wrapped`,
);
for (const r of report.sort((a, b) => b.wraps - a.wraps)) {
  console.log(`  ${String(r.wraps).padStart(2)}  ${r.file}`);
}
