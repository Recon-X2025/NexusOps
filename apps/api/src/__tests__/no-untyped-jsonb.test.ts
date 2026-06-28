/**
 * Untyped-JSONB ratchet guard for the Drizzle schema layer (Phase 2 gate).
 *
 * Phase 2 ("Data model to A") typed every `jsonb(...)` column in
 * `packages/db/src/schema` with an explicit `.$type<...>()` so JSON blobs are
 * no longer opaque `unknown` at every read/write site. The canonical org blob
 * (`organizations.settings`) is `OrgSettings`; genuinely open-ended columns are
 * still explicitly typed (e.g. `.$type<Record<string, unknown>>()`) and
 * documented — "open" is a deliberate, visible choice, not an accident.
 *
 * This test locks that in: it fails the build the moment a new `jsonb("col")`
 * column is declared without a `.$type<...>()` qualifier. The baseline is zero.
 * If an untyped jsonb is ever genuinely required, append the marker
 * `// jsonb-type-allow: <reason>` to the line with the `jsonb(` call and the
 * guard will skip it — forcing the justification into the diff for review.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(__dirname, "../../../../packages/db/src/schema");

const ALLOW_MARKER = "jsonb-type-allow";

/** Collect every non-declaration .ts file directly under the schema dir. */
function collectSchemaFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts"))
    .map((e) => join(dir, e.name));
}

/**
 * Walk the Drizzle column builder chain that begins at the `jsonb(` whose
 * opening paren is at `startParenIdx`. Returns the full chain text spanning
 * `jsonb(...) .method(...) .$type<...>() ...` up to (but excluding) the
 * terminating `,` / `}` / newline-boundary at chain depth 0.
 *
 * Bracket-aware so commas/braces inside `(...)`, `<...>`, `{...}`, `[...]`
 * don't end the chain prematurely.
 */
function extractChain(src: string, jsonbIdx: number): string {
  let i = jsonbIdx;
  let round = 0;
  let angle = 0;
  let curly = 0;
  let square = 0;
  const n = src.length;
  // Advance to the first '(' after `jsonb`.
  while (i < n && src[i] !== "(") i++;
  const start = jsonbIdx;
  for (; i < n; i++) {
    const c = src[i];
    if (c === "(") round++;
    else if (c === ")") round--;
    else if (c === "<") angle++;
    else if (c === ">") angle--;
    else if (c === "{") curly++;
    else if (c === "}") {
      if (curly === 0 && round === 0 && angle === 0 && square === 0) break; // end of table object
      curly--;
    } else if (c === "[") square++;
    else if (c === "]") square--;
    else if (c === "," && round === 0 && angle === 0 && curly === 0 && square === 0) {
      break; // end of this column property
    }
  }
  return src.slice(start, i);
}

describe("untyped-jsonb guard: every schema jsonb column is `.$type<...>()`-typed", () => {
  const files = collectSchemaFiles(SCHEMA_DIR);

  it("finds schema source files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("contains zero untyped jsonb() column declarations", () => {
    const violations: string[] = [];
    const jsonbCall = /\bjsonb\s*\(/g;

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      let m: RegExpExecArray | null;
      jsonbCall.lastIndex = 0;
      while ((m = jsonbCall.exec(src)) !== null) {
        const idx = m.index;
        // Line number of this jsonb( call (for the allow-marker + report).
        const lineNo = src.slice(0, idx).split("\n").length;
        const declLine = lines[lineNo - 1] ?? "";
        if (declLine.includes(ALLOW_MARKER)) continue;

        const chain = extractChain(src, idx);
        if (!chain.includes(".$type<")) {
          const rel = relative(SCHEMA_DIR, file);
          violations.push(`${rel}:${lineNo}: ${declLine.trim()}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} untyped jsonb() column(s) in packages/db/src/schema.\n` +
          `Add an explicit \`.$type<Shape>()\` (or \`.$type<Record<string, unknown>>()\` for a ` +
          `deliberately open blob, with a comment), or — if truly unavoidable — append ` +
          `\`// ${ALLOW_MARKER}: <reason>\` to the jsonb( line.\n\n` +
          violations.join("\n"),
      );
    }

    expect(violations).toEqual([]);
  });
});
