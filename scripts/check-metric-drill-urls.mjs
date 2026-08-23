#!/usr/bin/env node
/**
 * Every metric's drill-through must land on a page that exists.
 *
 * A metric is a number with a promise attached: click it and see the detail.
 * When the target route does not exist the number still renders, so the break is
 * invisible until someone clicks — and it is invisible to every other gate.
 * Typecheck cannot see it: the target is a string. Tests do not see it: nothing
 * navigates there. The layer survey of 2026-08-23 found five of thirty pointing
 * at /app/accounting and /app/finance, neither of which exists; the real
 * accounting pages sit a level deeper.
 *
 * This spans two packages — metric definitions in packages/metrics, routes in
 * apps/web — so it is a repo-level check rather than a package test, matching
 * scripts/check-cross-tenant-fks.mjs.
 *
 *   node scripts/check-metric-drill-urls.mjs
 *
 * Exit 0 = every target resolves, 1 = at least one does not, 2 = untrustworthy.
 *
 * THE CONTROL. A checker that finds no metrics reports success and proves
 * nothing. If fewer than MIN_METRICS are discovered, or no app routes are found,
 * this exits 2 and calls itself broken rather than clean.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRIB = join(ROOT, "packages/metrics/src/contributions");
const APPDIR = join(ROOT, "apps/web/src/app");
const MIN_METRICS = 20;   // 30 exist today; a large drop means the parse broke

function walk(dir, hit) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, hit);
    else hit(p, e.name);
  }
}

// ── metric definitions ───────────────────────────────────────────────────────
const metrics = [];
for (const f of readdirSync(CONTRIB)) {
  if (!f.endsWith(".ts") || f.startsWith("_") || f === "index.ts") continue;
  const src = readFileSync(join(CONTRIB, f), "utf8");
  const ids = [...src.matchAll(/\bid:\s*["'`]([\w.\-]+)["'`]/g)];
  ids.forEach((m, i) => {
    const end = i + 1 < ids.length ? ids[i + 1].index : src.length;
    const block = src.slice(m.index, end);
    const lit = block.match(/drillUrl:\s*["'`]([^"'`]+)["'`]/);
    const dyn = /drillUrl:\s*\(/.test(block);
    metrics.push({ file: f, id: m[1], url: lit ? lit[1] : null, dynamic: dyn });
  });
}

// ── real routes ──────────────────────────────────────────────────────────────
const routes = new Set();
walk(APPDIR, (p, name) => {
  if (name === "page.tsx") routes.add("/" + relative(APPDIR, dirname(p)).split(/[\\/]/).join("/"));
});

const resolves = (url) => {
  const base = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  if (routes.has(base)) return true;
  const bp = base.split("/");
  return [...routes].some((r) => {
    const rp = r.split("/");
    return rp.length === bp.length && rp.every((seg, i) => seg.startsWith("[") || seg === bp[i]);
  });
};

console.log(`metric drill-through check\n${"=".repeat(52)}`);
console.log(`metrics discovered : ${metrics.length}`);
console.log(`app routes found   : ${routes.size}`);

if (metrics.length < MIN_METRICS || routes.size === 0) {
  console.error(
    `\nFAIL: discovered ${metrics.length} metrics and ${routes.size} routes. That is` +
    `\nnot a clean result, it is a broken check — the parse or the paths moved.` +
    `\nExiting 2.`,
  );
  process.exit(2);
}

const linked = metrics.filter((m) => m.url);
const broken = linked.filter((m) => !resolves(m.url));
console.log(`with a fixed target: ${linked.length}`);
console.log(`computed at runtime: ${metrics.filter((m) => m.dynamic && !m.url).length}  (not checkable here)\n`);

if (broken.length === 0) {
  console.log("RESULT: every drill-through target resolves to a real page.");
  process.exit(0);
}
console.error(`RESULT: ${broken.length} metric(s) link to a page that does not exist.\n`);
for (const b of broken) console.error(`  ${b.id.padEnd(32)} → ${b.url}   [${b.file}]`);
console.error("\nPoint each at the page that answers ITS question — not a shared index.");
process.exit(1);
