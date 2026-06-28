/**
 * `any`-ratchet guard for the tRPC router layer.
 *
 * Phase 1 / Item 3c eliminated every `any` escape hatch from `src/routers`
 * (enum-filter casts, payload casts, and dynamic update accumulators) by
 * tightening Zod inputs and typing update payloads as `Partial<$inferInsert>`.
 *
 * This test locks that in: it fails the build the moment a new `any` type is
 * (re)introduced under `src/routers`. The baseline is zero. If a genuinely
 * unavoidable `any` is ever needed, annotate that exact line with the marker
 * `// any-ratchet-allow` and document why — the guard will skip it and the
 * reviewer is forced to see the justification in the diff.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTERS_DIR = join(__dirname, "../routers");

/** Recursively collect every .ts file under a directory. */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      out.push(...collectTsFiles(p));
    } else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Remove line comments, block comments, and string/template literals so the
 * `any` matcher can't trip on prose like "any authenticated user" or on
 * string contents. Replaces stripped spans with spaces to preserve offsets.
 */
function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  type State = "code" | "line" | "block" | "single" | "double" | "template";
  let state: State = "code";

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (state === "code") {
      if (c === "/" && next === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && next === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { state = "single"; out += " "; i += 1; continue; }
      if (c === '"') { state = "double"; out += " "; i += 1; continue; }
      if (c === "`") { state = "template"; out += " "; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += "\n"; } else { out += " "; }
      i += 1; continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") { state = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i += 1; continue;
    }
    if (state === "single" || state === "double") {
      const quote = state === "single" ? "'" : '"';
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === quote) { state = "code"; }
      out += c === "\n" ? "\n" : " "; i += 1; continue;
    }
    // template literal
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (c === "`") { state = "code"; }
    out += c === "\n" ? "\n" : " "; i += 1; continue;
  }
  return out;
}

/** Patterns that denote a TypeScript `any` type usage. */
const ANY_PATTERNS: RegExp[] = [
  /\bas\s+any\b/, // `x as any`
  /:\s*any\b/, // `: any` annotation
  /\bany\[\]/, // `any[]`
  /Record<[^>]*\bany\b[^>]*>/, // `Record<string, any>`
  /<\s*any\s*>/, // `<any>` generic arg
  /\bArray<\s*any\s*>/, // `Array<any>`
];

const ALLOW_MARKER = "any-ratchet-allow";

describe("any-ratchet guard: src/routers stays free of `any`", () => {
  const files = collectTsFiles(ROUTERS_DIR);

  it("finds router source files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("contains zero unannotated `any` type usages", () => {
    const violations: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, "utf8");
      const cleaned = stripCommentsAndStrings(raw);
      const rawLines = raw.split("\n");
      const cleanLines = cleaned.split("\n");

      for (let idx = 0; idx < cleanLines.length; idx++) {
        const line = cleanLines[idx]!;
        if (!ANY_PATTERNS.some((re) => re.test(line))) continue;
        // Allow an explicit, documented escape hatch on the same line.
        if (rawLines[idx]!.includes(ALLOW_MARKER)) continue;
        const rel = relative(ROUTERS_DIR, file);
        violations.push(`${rel}:${idx + 1}: ${rawLines[idx]!.trim()}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} disallowed \`any\` usage(s) in src/routers.\n` +
          `Tighten the type (e.g. z.enum(<pgEnum>.enumValues), Partial<$inferInsert>) ` +
          `or, if truly unavoidable, append \`// ${ALLOW_MARKER}: <reason>\` to the line.\n\n` +
          violations.join("\n"),
      );
    }

    expect(violations).toEqual([]);
  });
});
