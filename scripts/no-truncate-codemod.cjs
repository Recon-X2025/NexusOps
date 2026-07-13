#!/usr/bin/env node
/*
 * No-truncate migration codemod.
 *
 * Removes text-clipping utilities so nothing is clipped anywhere in the app:
 *   - `truncate`            (overflow:hidden + text-overflow:ellipsis + nowrap)
 *   - `line-clamp-<n>`      (multi-line ellipsis clamp)
 *   - `text-ellipsis`       (ellipsis without the truncate shorthand)
 *   - `overflow-ellipsis`   (legacy alias)
 *
 * Only these exact class tokens are removed. An optional Tailwind variant
 * prefix chain (e.g. `md:`, `hover:`, `dark:md:`) may precede the class and is
 * removed along with it. Matching is bounded by className-safe delimiters so we
 * never touch substrings inside other identifiers (e.g. `truncated`,
 * `js-truncate`, `line-clamp-none` is left as-is on purpose since it disables
 * clamping).
 *
 * Removed tokens leave clean single-spaced className strings (collapsing the
 * whitespace they leave behind, and trimming leading/trailing space inside the
 * quotes).
 *
 * Usage: no-truncate-codemod.cjs <dir...>
 *   e.g. no-truncate-codemod.cjs apps/web/src
 */
const fs = require("fs");
const path = require("path");

const roots = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (roots.length === 0) {
  console.error("usage: no-truncate-codemod.cjs <dir...>");
  process.exit(1);
}

// Exact clipping class tokens to strip. `line-clamp-<n>` is matched with a
// numeric group; `line-clamp-none` is intentionally NOT matched (it disables
// clamping, i.e. it already prevents clipping).
const SIMPLE = ["truncate", "text-ellipsis", "overflow-ellipsis"];

// A class token is delimited by whitespace or the string boundary. We match an
// optional variant-prefix chain, then the token, then require a following
// whitespace or end. We operate on the *inside* of className string literals
// only, to avoid touching arbitrary code.
const VARIANT = String.raw`(?:[a-z][a-z0-9-]*:)*`;
const tokenAlternation = `(?:${SIMPLE.join("|")}|line-clamp-\\d+)`;

// Matches a leading-or-mid class token (with optional preceding whitespace).
// We consume one side of whitespace so removing the token doesn't leave a
// double space.
const RE = new RegExp(String.raw`(^|\s)${VARIANT}${tokenAlternation}(?=\s|$)`, "g");

// className="..." or className={cn("...","...")} etc. We rewrite the contents
// of every single- or double-quoted string literal in the file that looks like
// a class list (contains at least one of the target tokens). Bounding to quoted
// strings keeps us from editing unrelated code.
const STRING_LITERAL = /(["'])((?:\\.|(?!\1).)*)\1/g;

function stripFromClassList(list) {
  let out = list.replace(RE, (_m, lead) => (lead === "" ? "" : " "));
  // Collapse any doubled spaces introduced and trim edges.
  out = out.replace(/\s{2,}/g, " ").replace(/^\s+|\s+$/g, "");
  return out;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\.(tsx?|jsx?)$/.test(entry.name)) {
      // Skip test/spec files: they contain non-className strings (e.g.
      // describe("truncate", …)) that must not be rewritten.
      out.push(p);
    }
  }
  return out;
}

// Quick file-level guard so we only touch files that actually contain a token.
// Bounded on the left by a class-delimiter (whitespace or a string quote) so we
// skip files where the word only appears as a substring/identifier. The precise
// per-string RE below does the real, correct stripping.
const HAS_TOKEN = new RegExp(`(?:^|[\\s"'\`])${VARIANT}${tokenAlternation}(?=[\\s"'\`]|$)`);

let filesChanged = 0;
let totalSubs = 0;
for (const root of roots) {
  const files = walk(root, []);
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!HAS_TOKEN.test(src)) continue;
    let subs = 0;
    const next = src.replace(STRING_LITERAL, (whole, quote, body) => {
      if (!RE.test(body)) {
        RE.lastIndex = 0;
        return whole;
      }
      RE.lastIndex = 0;
      const stripped = stripFromClassList(body);
      if (stripped === body) return whole;
      subs++;
      return quote + stripped + quote;
    });
    if (subs > 0) {
      fs.writeFileSync(file, next);
      filesChanged++;
      totalSubs += subs;
      console.log(`${subs.toString().padStart(4)}  ${path.relative(process.cwd(), file)}`);
    }
  }
}
console.log(`\n[no-truncate] ${totalSubs} class-lists rewritten across ${filesChanged} files`);
