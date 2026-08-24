/**
 * Guard: every `href` a workbench payload emits must resolve to a real Next
 * route. Twelve of twenty drill links were pointing at routes that do not exist
 * (`/app/finance/invoices/:id` when the route is `/app/financial/invoices/:id`,
 * `/app/security/incidents/:id` when incidents render at `/app/security/:id`,
 * etc.), so clicking an action-queue item 404'd. Nothing caught it because no
 * test cross-checked the emitted links against the route manifest.
 *
 * This walks the web app-router tree, builds the set of real route templates,
 * extracts every `/app/...` href literal from the workbench payload sources,
 * and asserts each one matches a template. It is a pure file-read test — no DB.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const WEB_APP_DIR = join(REPO, "apps", "web", "src", "app", "app");
const PAYLOAD_DIR = join(HERE, "..", "services", "workbench-payloads");

interface Seg {
  dyn: boolean;
  lit: string;
}

/** Every route template under /app, e.g. "/app/security/[id]" -> segments. */
function collectRoutes(): { path: string; segs: Seg[] }[] {
  const out: { path: string; segs: Seg[] }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      walk(full);
    }
    if (existsSync(join(dir, "page.tsx"))) {
      const rel = relative(WEB_APP_DIR, dir);
      const parts = rel === "" ? [] : rel.split(/[/\\]/);
      const segs: Seg[] = ["app", ...parts].map((p) => ({
        dyn: p.startsWith("[") && p.endsWith("]"),
        lit: p,
      }));
      out.push({ path: "/" + ["app", ...parts].join("/"), segs });
    }
  };
  walk(WEB_APP_DIR);
  return out;
}

/** Split an href into segments; `${...}` interpolations become dynamic. */
function hrefSegs(href: string): Seg[] {
  return href
    .replace(/^\//, "")
    .split("/")
    .map((p) => ({ dyn: p.includes("${"), lit: p }));
}

function matches(href: Seg[], route: Seg[]): boolean {
  if (href.length !== route.length) return false;
  return route.every((r, i) => {
    const h = href[i]!;
    if (r.dyn) return true; // a [param] slot accepts any value
    if (h.dyn) return false; // an interpolated slot needs a [param] route
    return r.lit === h.lit;
  });
}

function extractHrefs(src: string): string[] {
  const hrefs: string[] = [];
  const re = /href:\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const raw = m[1]!.slice(1, -1); // strip quote/backtick
    if (raw.startsWith("/app")) hrefs.push(raw);
  }
  return hrefs;
}

describe("workbench drill links resolve to real routes", () => {
  const routes = collectRoutes();

  it("finds the web app-router tree and some routes", () => {
    expect(existsSync(WEB_APP_DIR), `web app dir missing at ${WEB_APP_DIR}`).toBe(true);
    expect(routes.length).toBeGreaterThan(20);
  });

  const files = readdirSync(PAYLOAD_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  for (const file of files) {
    const src = readFileSync(join(PAYLOAD_DIR, file), "utf8");
    const hrefs = extractHrefs(src);
    if (hrefs.length === 0) continue;

    it(`${file}: every emitted href matches a route`, () => {
      for (const href of hrefs) {
        const hs = hrefSegs(href);
        const ok = routes.some((r) => matches(hs, r.segs));
        expect(ok, `${file} emits "${href}" which matches no /app route`).toBe(true);
      }
    });
  }
});
