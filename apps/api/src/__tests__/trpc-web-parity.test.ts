/**
 * Ensures every tRPC path invoked from apps/web exists on appRouter.
 *
 * Prevents production-only failures like "No procedure found on path 'x.y'"
 * when the UI is shipped with calls the API router never defined (or when
 * deploy uses mismatched web/api images).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";

const __dirname = dirname(fileURLToPath(import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      out.push(...collectSourceFiles(p));
    } else if (/\.(tsx|ts)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const TRPC_PREFIX = String.raw`(?:\(trpc as any\)|trpc)`;

/** trpc.foo.bar.useQuery / (trpc as any).hr.leave.list.useMutation / … */
const RE_TRPC =
  new RegExp(
    `${TRPC_PREFIX}\\.((?:[a-zA-Z][a-zA-Z0-9_]*\\.)+)(useQuery|useMutation|useInfiniteQuery|useSubscription)\\b`,
    "g",
  );

/** utils.foo.bar.invalidate / fetch / prefetch / setData */
const RE_UTILS =
  /utils\.((?:[a-zA-Z][a-zA-Z0-9_]*\.)+)(invalidate|fetch|prefetch|setData)\b/g;

/**
 * Optional-chaining style: (trpc as any).financial?.listInvoices?.invalidate
 * → procedure path financial.listInvoices
 */
const RE_TRPC_OPTIONAL =
  new RegExp(
    `${TRPC_PREFIX}((?:\\.[a-zA-Z][a-zA-Z0-9_]*|\\?\\.\\s*[a-zA-Z][a-zA-Z0-9_]*)+)\\.(invalidate|fetch|prefetch|setData)\\b`,
    "g",
  );

function normalizeOptionalTrpcPath(raw: string): string {
  return raw
    .replace(/^\./, "")
    .replace(/\?\.\s*/g, ".")
    .replace(/\.$/, "");
}

function procedurePathsInSource(content: string): Set<string> {
  const paths = new Set<string>();
  for (const re of [RE_TRPC, RE_UTILS]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      paths.add(m[1].replace(/\.$/, ""));
    }
  }
  RE_TRPC_OPTIONAL.lastIndex = 0;
  let om: RegExpExecArray | null;
  while ((om = RE_TRPC_OPTIONAL.exec(content)) !== null) {
    paths.add(normalizeOptionalTrpcPath(om[1]));
  }
  return paths;
}

describe("tRPC web ↔ API procedure parity", () => {
  it("every trpc/utils procedure path used under apps/web exists on appRouter", () => {
    const webSrc = join(__dirname, "../../../web/src");
    const files = collectSourceFiles(webSrc);
    const used = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const p of procedurePathsInSource(text)) {
        used.add(p);
      }
    }

    const defined = new Set(Object.keys(appRouter._def.procedures));
    const missing = [...used].filter((p) => !defined.has(p)).sort();

    expect(
      missing,
      `Web calls undefined tRPC procedures (add to API or fix web):\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("apps/web must not use (trpc as any) — use typed trpc and trpc.useUtils() for invalidation", () => {
    const webSrc = join(__dirname, "../../../web/src");
    const files = collectSourceFiles(webSrc);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (text.includes("(trpc as any)")) offenders.push(file);
    }
    expect(
      offenders,
      `Remove (trpc as any) and use the AppRouter-typed client (parity + refactors):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
