/**
 * Route-integrity guard — every internal /app/... link must resolve to a real route file.
 * ─────────────────────────────────────────────────────────────────────────────
 * A read-only sweep (2026-08-08) found seven dead internal links — a link offering a page that
 * does not exist. The dead links were symptoms; the real defect was that NOTHING checked that
 * internal links resolve, so they accumulated undetected (`route-permissions.test.ts` proves RBAC
 * gating, not that a link's *target* exists).
 *
 * This test walks the web app's source, extracts every internal `/app/...` link target from
 *   - JSX `href=` (covers <a href> and <Link href>),
 *   - object `href:` config (the sidebar / command-palette / quick-action nav is config-driven),
 *   - `router.push("/app/...")` with a literal or template-literal path,
 * and asserts a matching route file (`.../page.tsx`) exists on disk. Dynamic segments are matched
 * against `[param]` route dirs, so `/app/financial/invoices/${id}` resolves to
 * `app/financial/invoices/[id]/page.tsx`. It is a STATIC source check — it never runs the app.
 *
 * When it fails it names the file, the line and the missing target, so the failure points at the
 * exact broken link. It fails the build the moment someone adds a link to a page that doesn't exist.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // apps/web/src/lib/__tests__
const WEB_SRC = path.resolve(HERE, "../.."); // apps/web/src
const APP_ROOT = path.join(WEB_SRC, "app"); // Next.js app dir; URL /app maps to app/app

/**
 * Links that genuinely cannot be resolved statically. Every entry REQUIRES a reason. Keep this
 * empty if you can — a real dead link belongs fixed, not excluded.
 */
const EXCLUSIONS: ReadonlyArray<{ file: string; target: string; reason: string }> = [
  {
    file: "components/layout/app-header.tsx",
    target: "/app/${firstPageSlug}",
    reason:
      "Breadcrumb whose slug is segments[1] of the CURRENT pathname and is only rendered when " +
      "SLUG_TO_SECTION[slug] is set — so it always points at the page you are already on (a real " +
      "route by construction). The slug is a runtime value from the URL, not resolvable to a file statically.",
  },
];

/** Recursively collect .ts/.tsx source files, skipping build output and this guard itself. */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && entry.name !== "route-integrity.test.ts") acc.push(full);
  }
  return acc;
}

// href="/app/..." | href={`/app/...`} | href: "/app/..." | router.push("/app/...")
// Group 1 = the opening quote/backtick delimiter; group 2 = the /app path up to the matching delimiter.
const LINK_RE = /(?:href\s*=\s*\{?\s*|href\s*:\s*|router\.push\(\s*)(["'`])(\/app(?:(?!\1).)*)\1/g;

interface FoundLink {
  file: string; // web/src-relative
  line: number;
  target: string; // raw, e.g. /app/financial/invoices/${inv.id}
}

function extractLinks(text: string, relFile: string): FoundLink[] {
  const found: FoundLink[] = [];
  text.split("\n").forEach((line, i) => {
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(line)) !== null) {
      found.push({ file: relFile, line: i + 1, target: m[2]! });
    }
  });
  return found;
}

const DYNAMIC_DIR = /^\[[^.].*\]$/; // [id], [ticketId] … but not a [...catchAll]

/** Resolve a /app/... URL path to a route dir on disk and check it has a page.tsx. */
function routeExists(rawTarget: string): boolean {
  const clean = rawTarget.split("?")[0]!.split("#")[0]!.replace(/\/+$/, "");
  const segments = clean.split("/").filter(Boolean); // ['app', 'financial', 'invoices', '${x}']
  let dir = APP_ROOT; // URL segment 'app' descends into app/app
  for (const seg of segments) {
    const isDynamic = seg.includes("${");
    let childDirs: string[];
    try {
      childDirs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return false;
    }
    if (isDynamic) {
      // A ${…} segment must land on a dynamic route dir.
      const param = childDirs.find((c) => DYNAMIC_DIR.test(c));
      if (!param) return false;
      dir = path.join(dir, param);
    } else if (childDirs.includes(seg)) {
      dir = path.join(dir, seg); // exact literal segment
    } else {
      // A literal that is really a concrete id value for a dynamic route (rare in links).
      const param = childDirs.find((c) => DYNAMIC_DIR.test(c));
      if (!param) return false;
      dir = path.join(dir, param);
    }
  }
  return fs.existsSync(path.join(dir, "page.tsx"));
}

function isExcluded(link: FoundLink): boolean {
  return EXCLUSIONS.some((e) => e.file === link.file && e.target === link.target);
}

describe("route integrity — every internal /app/... link resolves to a real route", () => {
  const links = collectSourceFiles(WEB_SRC).flatMap((abs) =>
    extractLinks(fs.readFileSync(abs, "utf8"), path.relative(WEB_SRC, abs)),
  );

  it("finds internal links to scan (guard against a broken extractor)", () => {
    // If this drops to ~0 the regex/paths broke and the test would pass vacuously.
    expect(links.length).toBeGreaterThan(100);
  });

  it("has no internal link whose target route file is missing", () => {
    const dead = links.filter((l) => !routeExists(l.target) && !isExcluded(l));
    const report = dead.map((d) => `  ${d.file}:${d.line}  →  ${d.target}`).join("\n");
    expect(dead, `\nDead internal /app links (target page.tsx missing):\n${report}\n`).toEqual([]);
  });

  it("has no stale exclusions (every exclusion must match a real, currently-dead link)", () => {
    const stale = EXCLUSIONS.filter(
      (e) => !links.some((l) => l.file === e.file && l.target === e.target && !routeExists(l.target)),
    );
    const report = stale.map((e) => `  ${e.file}  →  ${e.target}`).join("\n");
    expect(stale, `\nStale route-integrity exclusions (remove them):\n${report}\n`).toEqual([]);
  });
});
