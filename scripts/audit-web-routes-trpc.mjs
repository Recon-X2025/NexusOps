#!/usr/bin/env node
/**
 * System audit: Next.js app routes (page.tsx) + tRPC useQuery RBAC hygiene.
 *
 * Usage: node scripts/audit-web-routes-trpc.mjs
 *   --json     machine-readable summary on stdout
 *   --strict   only print findings (unguarded queries on RBAC pages)
 *
 * "Unguarded" = trpc.*.useQuery( / useInfiniteQuery( whose argument list
 * does not contain `enabled:`, `skipToken`, or `mergeTrpcQueryOpts(` (heuristic).
 * Excludes auth.me.
 * False positives possible (e.g. enabled in a variable); false negatives if
 * generic calls break the paren walker.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEB_APP = join(ROOT, "apps/web/src/app");

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has("--json");
const STRICT = args.has("--strict");

function walkPages(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walkPages(p, acc);
    } else if (ent.name === "page.tsx") {
      acc.push(p);
    }
  }
  return acc;
}

/** Next route path from .../src/app/foo/bar/page.tsx → /foo/bar */
function fileToRoute(file) {
  const rel = relative(join(ROOT, "apps/web/src/app"), file).replace(/\\/g, "/");
  const segs = rel.replace(/\/page\.tsx$/, "").split("/").filter(Boolean);
  if (segs.length === 0) return "/";
  return "/" + segs.join("/");
}

/** Extract balanced (...) starting at openParenIndex (must point at '('). */
function extractParenGroup(src, openParenIndex) {
  let depth = 0;
  let i = openParenIndex;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(openParenIndex + 1, i);
    }
  }
  return null;
}

const RE_USE_QUERY = /trpc((?:\.\w+)+)\.(useQuery|useInfiniteQuery)\s*\(/g;

function analyzeFile(absPath) {
  const text = readFileSync(absPath, "utf8");
  const route = fileToRoute(absPath);
  const usesRBAC = /\buseRBAC\s*\(/.test(text);
  const queries = [];
  RE_USE_QUERY.lastIndex = 0;
  let m;
  while ((m = RE_USE_QUERY.exec(text)) !== null) {
    const chain = m[1].replace(/^\./, "");
    const kind = m[2];
    const openIdx = m.index + m[0].length - 1;
    const inner = extractParenGroup(text, openIdx);
    if (inner == null) continue;
    const path = chain.replace(/^\./, "").replace(/\.$/, "");
    const procedure = path.split(".").filter(Boolean);
    const pathStr = procedure.join(".");
    const isAuthMe = pathStr === "auth.me";
    const hasEnabled = /\benabled\s*:/.test(inner);
    const hasSkipToken = /\bskipToken\b/.test(inner);
    const hasMergeTrpc = /mergeTrpcQueryOpts\s*\(/.test(inner);
    queries.push({
      path: pathStr,
      kind,
      guarded: hasEnabled || hasSkipToken || hasMergeTrpc,
      skipAudit: isAuthMe,
    });
  }
  const unguardedOnRbac =
    usesRBAC &&
    queries.some((q) => !q.skipAudit && !q.guarded);
  return { route, rel: relative(ROOT, absPath).replace(/\\/g, "/"), usesRBAC, queries, unguardedOnRbac };
}

function main() {
  const files = walkPages(WEB_APP);
  const rows = files.map((f) => analyzeFile(f)).sort((a, b) => a.route.localeCompare(b.route));

  const stats = {
    pageFiles: rows.length,
    routes: rows.map((r) => r.route),
    rbacPages: rows.filter((r) => r.usesRBAC).length,
    rbacPagesWithAnyUnguardedQuery: rows.filter((r) => r.unguardedOnRbac).length,
    totalTrpcQueries: rows.reduce((n, r) => n + r.queries.length, 0),
    unguardedQueryCount: rows.reduce(
      (n, r) => n + r.queries.filter((q) => !q.skipAudit && !q.guarded).length,
      0,
    ),
  };

  const findings = rows.filter((r) => r.unguardedOnRbac);

  if (JSON_OUT) {
    console.log(JSON.stringify({ stats, findings: findings.map((f) => ({ route: f.route, file: f.rel, queries: f.queries })) }, null, 2));
    return;
  }

  if (!STRICT) {
    console.log("NexusOps web route + tRPC audit");
    console.log("===========================");
    console.log(`page.tsx files: ${stats.pageFiles}`);
    console.log(`pages using useRBAC(): ${stats.rbacPages}`);
    console.log(`tRPC useQuery/useInfiniteQuery calls (incl. auth.me): ${stats.totalTrpcQueries}`);
    console.log(`unguarded calls (no enabled:/skipToken/mergeTrpcQueryOpts in args, excl. auth.me): ${stats.unguardedQueryCount}`);
    console.log(`RBAC pages with ≥1 unguarded query (heuristic): ${stats.rbacPagesWithAnyUnguardedQuery}`);
    console.log("");
  }

  if (findings.length === 0) {
    console.log(STRICT ? "" : "No RBAC pages with unguarded queries detected by this heuristic.");
  } else {
    console.log(STRICT ? "" : "Review (add enabled: can(...) when API permission differs within page):\n");
    for (const f of findings) {
      const bad = f.queries.filter((q) => !q.skipAudit && !q.guarded).map((q) => q.path);
      console.log(`${f.route}`);
      console.log(`  file: ${f.rel}`);
      console.log(`  unguarded: ${bad.join(", ")}`);
    }
  }

  if (!STRICT && !JSON_OUT) {
    console.log("\nAlso run: pnpm check:trpc-parity  &&  pnpm --filter @nexusops/web build");
  }
}

main();
