#!/usr/bin/env node
/**
 * Wraps trpc.*.useQuery / useInfiniteQuery second-arg options with
 * mergeTrpcQueryOpts("<procedure.path>", opts) and adds mergeTrpcQueryOpts
 * to every useRBAC() destructure in the file.
 *
 * Run from repo root: node scripts/codemod-trpc-merge-query-opts.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEB_SRC = join(ROOT, "apps/web/src");

const SKIP_FILES = new Set([
  "lib/rbac-context.tsx",
  "lib/trpc-procedure-rbac.generated.ts",
  "lib/trpc.ts",
  "components/providers/trpc-provider.tsx",
]);

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p, acc);
    } else if (/\.(tsx|ts)$/.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

/** Extract inside `(...)` starting at openParenIdx pointing at `(`. */
function extractParenBody(str, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < str.length; i++) {
    const c = str[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return str.slice(openParenIdx + 1, i);
    }
  }
  return null;
}

function splitFirstArg(inner) {
  let dP = 0,
    dB = 0,
    dS = 0,
    strQ = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (strQ) {
      if (c === "\\" && strQ !== "`") {
        i++;
        continue;
      }
      if (c === strQ) strQ = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      strQ = c;
      continue;
    }
    if (c === "/" && inner[i + 1] === "/") {
      while (i < inner.length && inner[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && inner[i + 1] === "*") {
      i += 2;
      while (i < inner.length - 1 && !(inner[i] === "*" && inner[i + 1] === "/")) i++;
      i++;
      continue;
    }
    if (c === "(") dP++;
    else if (c === ")") dP--;
    else if (c === "{") dB++;
    else if (c === "}") dB--;
    else if (c === "[") dS++;
    else if (c === "]") dS--;
    else if (c === "," && dP === 0 && dB === 0 && dS === 0) {
      return { input: inner.slice(0, i).trim(), opts: inner.slice(i + 1).trim() };
    }
  }
  return { input: inner.trim(), opts: null };
}

function addMergeToUseRBAC(content) {
  return content.replace(/const\s*\{\s*([^}]*?)\s*\}\s*=\s*useRBAC\(\)/g, (full, inner) => {
    if (inner.includes("mergeTrpcQueryOpts")) return full;
    const t = inner.trim();
    if (!t) return `const { mergeTrpcQueryOpts } = useRBAC()`;
    return `const { ${t}, mergeTrpcQueryOpts } = useRBAC()`;
  });
}

function transformTrpcUseQueries(content) {
  const re = /trpc((?:\.\w+)+)\.(useQuery|useInfiniteQuery)\s*\(/g;
  let out = "";
  let lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    out += content.slice(lastIndex, m.index);
    const openParen = m.index + m[0].length - 1;
    const inner = extractParenBody(content, openParen);
    if (inner == null) {
      out += m[0];
      lastIndex = m.index + m[0].length;
      continue;
    }
    const closeIdx = openParen + 1 + inner.length;
    const fullCallEnd = closeIdx + 1;

    const procPath = m[1].startsWith(".") ? m[1].slice(1) : m[1];

    const trimmedInner = inner.trim();
    if (/^skipToken\b/.test(trimmedInner)) {
      out += content.slice(m.index, fullCallEnd);
      lastIndex = fullCallEnd;
      continue;
    }
    if (/\bmergeTrpcQueryOpts\s*\(/.test(inner)) {
      out += content.slice(m.index, fullCallEnd);
      lastIndex = fullCallEnd;
      continue;
    }

    let { input, opts } = splitFirstArg(inner);
    if (input === "") input = "undefined";
    const optsExpr = opts == null || opts === "" ? "undefined" : opts;
    const newCall = `trpc${m[1]}.${m[2]}(${input}, mergeTrpcQueryOpts("${procPath}", ${optsExpr}))`;
    out += newCall;
    lastIndex = fullCallEnd;
  }
  out += content.slice(lastIndex);
  return out;
}

function processFile(absPath) {
  const rel = relative(WEB_SRC, absPath).replace(/\\/g, "/");
  if (SKIP_FILES.has(rel)) return false;
  let text = readFileSync(absPath, "utf8");
  if (!/trpc\.\w/.test(text)) return false;
  if (!/\.(useQuery|useInfiniteQuery)\s*\(/.test(text)) return false;
  if (!/\buseRBAC\s*\(/.test(text)) {
    console.warn("skip (no useRBAC):", relative(ROOT, absPath));
    return false;
  }

  const next = transformTrpcUseQueries(addMergeToUseRBAC(text));
  if (next === text) return false;
  writeFileSync(absPath, next, "utf8");
  return true;
}

let changed = 0;
for (const f of walk(WEB_SRC)) {
  if (processFile(f)) {
    changed++;
    console.log("updated", relative(ROOT, f));
  }
}
console.log(`Done. ${changed} files modified.`);
