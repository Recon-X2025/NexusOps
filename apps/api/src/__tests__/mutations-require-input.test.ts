/**
 * Enforces that every tRPC `.mutation(...)` under src/routers declares a Zod
 * `.input(...)` validator in its procedure chain (Phase 1 / Item 1).
 *
 * Mutations that intentionally take no arguments must still declare an explicit
 * empty schema `.input(z.object({}))`, so "takes no input" is a deliberate,
 * reviewable contract rather than an accidental omission that silently accepts
 * arbitrary client payloads.
 *
 * The scan is text-based but robust: for each `.mutation(` it walks backwards to
 * the start of the procedure chain and checks whether an `.input(` appears in
 * between. Comments and strings are stripped first to avoid false matches.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTERS_DIR = join(__dirname, "../routers");

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

/** Strip line/block comments and string/template literals, preserving offsets. */
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
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (c === "`") { state = "code"; }
    out += c === "\n" ? "\n" : " "; i += 1; continue;
  }
  return out;
}

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}

describe("Item 1: every router mutation declares a Zod .input(...)", () => {
  const files = collectTsFiles(ROUTERS_DIR);

  it("finds router source files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no mutation lacking an .input() validator", () => {
    const violations: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, "utf8");
      const code = stripCommentsAndStrings(raw);

      // Find each `.mutation(` occurrence.
      const mutRe = /\.mutation\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = mutRe.exec(code)) !== null) {
        const mutIdx = m.index;

        // Walk backwards to the start of this procedure's chain. A chain begins
        // at a property key `name:` or an opening brace/paren/comma that
        // precedes the procedure builder. We approximate the chain start as the
        // nearest preceding boundary among: `,` `{` `(` at depth 0 relative to
        // the segment, or the previous `.query(`/`.mutation(`/`.subscription(`.
        const before = code.slice(0, mutIdx);

        // Nearest previous chain terminator (end of a sibling procedure) marks
        // a safe lower bound so we don't borrow an .input() from a sibling.
        const prevTerminator = Math.max(
          before.lastIndexOf(".query("),
          before.lastIndexOf(".mutation("),
          before.lastIndexOf(".subscription("),
        );

        // Property-key boundary: the last `<ident>:` that starts a router entry.
        // Search after prevTerminator to stay within this entry.
        const searchFrom = prevTerminator >= 0 ? prevTerminator : 0;
        const segment = before.slice(searchFrom);

        const hasInput = /\.input\s*\(/.test(segment);
        if (!hasInput) {
          const rel = relative(ROUTERS_DIR, file);
          const ln = lineOf(code, mutIdx);
          // Pull the property name for a friendlier message.
          const keyMatch = segment.match(/(\w+)\s*:\s*[A-Za-z_$][\w$]*Procedure/);
          const name = keyMatch ? keyMatch[1] : "<unknown>";
          violations.push(`${rel}:${ln}: mutation \`${name}\` has no .input()`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} mutation(s) without a Zod .input() validator.\n` +
          `Add .input(z.object({ ... })), or .input(z.object({})) if it genuinely ` +
          `takes no arguments.\n\n` +
          violations.join("\n"),
      );
    }

    expect(violations).toEqual([]);
  });
});
