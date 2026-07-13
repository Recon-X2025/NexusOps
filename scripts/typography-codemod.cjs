#!/usr/bin/env node
/*
 * Typography migration codemod.
 *
 * Two modes:
 *   --mode=px      : rewrite standard text-* size classes to explicit px
 *                    arbitrary values (used for packages/ui, which must render
 *                    identically regardless of which app config compiles it,
 *                    and independent of root font-size).
 *   --mode=token   : rewrite standard text-* size classes to the named type
 *                    scale tokens (used for apps/web call sites).
 *
 * Only the exact size utilities are touched. Arbitrary values like text-[10px]
 * are left as-is. Matching is bounded by className-safe delimiters so we never
 * touch substrings inside other identifiers.
 */
const fs = require("fs");
const path = require("path");

const mode = (process.argv.find((a) => a.startsWith("--mode=")) || "").split("=")[1];
const roots = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!mode || roots.length === 0) {
  console.error("usage: typography-codemod.cjs --mode=px|token <dir...>");
  process.exit(1);
}

// Standard Tailwind size class -> replacement, per mode.
const PX = {
  "text-xs": "text-[12px]",
  "text-sm": "text-[14px]",
  "text-base": "text-[16px]",
  "text-lg": "text-[18px]",
  "text-xl": "text-[20px]",
  "text-2xl": "text-[24px]",
  "text-3xl": "text-[30px]",
  "text-4xl": "text-[36px]",
  "text-5xl": "text-[48px]",
};
const TOKEN = {
  "text-xs": "text-caption",
  "text-sm": "text-body-sm",
  "text-base": "text-body",
  "text-lg": "text-body-lg",
  "text-xl": "text-h4",
  "text-2xl": "text-h3",
  "text-3xl": "text-h2",
  "text-4xl": "text-h1",
  "text-5xl": "text-display",
};
const MAP = mode === "px" ? PX : TOKEN;

// Order longest-first so text-2xl matches before text-xl-style prefixes can't
// partially collide (they can't due to boundaries, but keep deterministic).
const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);

// A class token in JSX is delimited by a non-class char on both sides:
// whitespace, quotes, backtick, or the string boundary. We use lookbehind/ahead
// on [\s"'`] to avoid matching e.g. `group-text-sm` or `text-smart`.
// An optional Tailwind variant prefix chain (e.g. `md:`, `hover:`, `file:`,
// `dark:md:`) may precede the size class; it is captured and preserved.
const patterns = keys.map((k) => ({
  k,
  re: new RegExp(
    `(?<=[\\s"'\`])((?:[a-z][a-z0-9-]*:)*)${k.replace(/[-[\]]/g, "\\$&")}(?=[\\s"'\`])`,
    "g",
  ),
  to: MAP[k],
}));

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

let filesChanged = 0;
let totalSubs = 0;
for (const root of roots) {
  const files = walk(root, []);
  for (const file of files) {
    let src = fs.readFileSync(file, "utf8");
    let subs = 0;
    for (const { re, to } of patterns) {
      src = src.replace(re, (_m, prefix) => {
        subs++;
        return (prefix || "") + to;
      });
    }
    if (subs > 0) {
      fs.writeFileSync(file, src);
      filesChanged++;
      totalSubs += subs;
      console.log(`${subs.toString().padStart(4)}  ${path.relative(process.cwd(), file)}`);
    }
  }
}
console.log(`\n[${mode}] ${totalSubs} substitutions across ${filesChanged} files`);
