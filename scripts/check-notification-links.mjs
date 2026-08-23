#!/usr/bin/env node
/**
 * Every link a notification emits must land on a page that exists.
 *
 * A notification is a promise with a destination attached. When the route does
 * not exist the notification still arrives, still reads urgently, and 404s on
 * click — invisible to every other gate, because the link is a string. The
 * typechecker cannot see it; nothing navigates there in tests.
 *
 * Found the hard way: the audit-chain integrity alert — "audit entries were
 * deleted or altered, investigate immediately" — linked to /app/admin/audit-log,
 * which did not exist. Same class as the five broken metric drill-throughs.
 *
 * Templates are checked structurally. `/app/tickets/${id}` becomes
 * `/app/tickets/:seg` and matches the real route `/app/tickets/[id]`, so
 * interpolation is fine; what is checked is the SHAPE of the path.
 *
 *   node scripts/check-notification-links.mjs
 *
 * Exit 0 = all resolve, 1 = at least one does not, 2 = the check is untrustworthy.
 *
 * THE CONTROL. A checker that discovers no emitters reports success and proves
 * nothing. Below MIN_LINKS, or with zero routes found, it exits 2 and calls
 * itself broken instead of clean.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APIDIR = join(ROOT, "apps/api/src");
const APPDIR = join(ROOT, "apps/web/src/app");
const MIN_LINKS = 15;   // 23 exist today

function walk(dir, hit) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, hit);
    else hit(p, e.name);
  }
}

// ── every literal link: emitted from the API ─────────────────────────────────
const links = [];
walk(APIDIR, (p, name) => {
  if (!name.endsWith(".ts") || name.includes(".test.")) return;
  const src = readFileSync(p, "utf8");
  src.split("\n").forEach((line, i) => {
    const m = line.match(/\blink:\s*[`"']([^`"']*)[`"']/);
    if (!m) return;
    const raw = m[1];
    if (!raw || raw.startsWith("${")) return;   // fully dynamic; nothing to check
    links.push({ file: relative(ROOT, p), line: i + 1, raw });
  });
});

// ── real routes ──────────────────────────────────────────────────────────────
const routes = [];
walk(APPDIR, (p, name) => {
  if (name === "page.tsx") routes.push("/" + relative(APPDIR, dirname(p)).split(/[\\/]/).join("/"));
});

/** `/app/tickets/${t.id}` → ["app","tickets",":seg"] */
const shape = (raw) =>
  raw.replace(/\$\{[^}]*\}/g, ":seg").split("?")[0].split("#")[0]
     .replace(/\/+$/, "").split("/").filter(Boolean);

const resolves = (raw) => {
  const s = shape(raw);
  return routes.some((r) => {
    const rp = r.split("/").filter(Boolean);
    if (rp.length !== s.length) return false;
    return rp.every((seg, i) => seg.startsWith("[") || s[i] === ":seg" || seg === s[i]);
  });
};

console.log(`notification link check\n${"=".repeat(52)}`);
console.log(`links discovered : ${links.length}`);
console.log(`app routes found : ${routes.length}`);

if (links.length < MIN_LINKS || routes.length === 0) {
  console.error(
    `\nFAIL: discovered ${links.length} links and ${routes.length} routes. That is not a` +
    `\nclean result, it is a broken check — the parse or the paths moved. Exiting 2.`,
  );
  process.exit(2);
}

const broken = links.filter((l) => !resolves(l.raw));
console.log(`resolve to a page: ${links.length - broken.length}\n`);

if (broken.length === 0) {
  console.log("RESULT: every notification link lands on a real page.");
  process.exit(0);
}
console.error(`RESULT: ${broken.length} notification link(s) point at a page that does not exist.\n`);
for (const b of broken) console.error(`  ${b.raw.padEnd(46)} ${b.file}:${b.line}`);
console.error("\nA notification that 404s on click is worse than no notification:");
console.error("it asserts something exists and then denies it.");
process.exit(1);
