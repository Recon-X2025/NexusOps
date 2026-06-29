#!/usr/bin/env node
/* Audit helper: find tab identifiers that are referenced as a tab-state value
 * (e.g. a union member or setActiveTab("x") / setTab("x")) but have NO matching
 * conditional render block ( <state> === "x" ). Read-only analysis. */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "apps/web/src/app");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith("page.tsx") || e.name.endsWith("-client.tsx")) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const findings = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");

  // Identify the tab state variable names used in === comparisons.
  // Collect identifiers that appear as  <stateVar> === "value"
  const renderRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*===\s*["']([^"']+)["']/g;
  const stateVars = new Map(); // varName -> Set(values with render block)
  let m;
  while ((m = renderRe.exec(src))) {
    const [, varName, val] = m;
    if (!/tab|view|section|panel|step|mode/i.test(varName)) continue;
    if (!stateVars.has(varName)) stateVars.set(varName, new Set());
    stateVars.get(varName).add(val);
  }
  if (stateVars.size === 0) continue;

  // For each candidate state var, collect the values it is *set to* or declared with.
  for (const [varName, rendered] of stateVars) {
    const setterBase = varName.charAt(0).toUpperCase() + varName.slice(1);
    // setX("value")
    const setterRe = new RegExp(`set${setterBase}\\(\\s*["']([^"']+)["']`, "g");
    // useState<"a" | "b" | "c">  — capture union near the var declaration
    const declRe = new RegExp(`${varName}[^\\n]*useState<([^>]+)>`);
    const referenced = new Set();
    let s;
    while ((s = setterRe.exec(src))) referenced.add(s[1]);
    const decl = src.match(declRe);
    if (decl) {
      const union = decl[1];
      const lits = union.match(/["']([^"']+)["']/g) || [];
      for (const lit of lits) referenced.add(lit.replace(/["']/g, ""));
    }
    // Missing = referenced (as a real tab value) but never rendered
    const missing = [...referenced].filter((v) => !rendered.has(v));
    if (missing.length > 0) {
      findings.push({
        file: file.replace(ROOT + "/", ""),
        varName,
        rendered: [...rendered],
        referenced: [...referenced],
        missing,
      });
    }
  }
}

if (findings.length === 0) {
  console.log("NO placeholder tabs found (every referenced tab value has a render block).");
} else {
  console.log(`POTENTIAL placeholder tabs: ${findings.length} finding(s)\n`);
  for (const f of findings) {
    console.log(`• ${f.file}  [${f.varName}]`);
    console.log(`    referenced: ${f.referenced.join(", ")}`);
    console.log(`    rendered:   ${f.rendered.join(", ")}`);
    console.log(`    MISSING:    ${f.missing.join(", ")}`);
    console.log("");
  }
}
