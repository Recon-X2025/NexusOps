#!/usr/bin/env node
/**
 * Reads product-scorecard JSON data and writes a CSV with weighted scores per ICP profile.
 * Usage: node scripts/product-scorecard-compute.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "product-scorecard", "data");
const outDir = join(root, "product-scorecard", "out");

const modulesDoc = JSON.parse(readFileSync(join(dataDir, "modules.json"), "utf8"));
const weightsDoc = JSON.parse(readFileSync(join(dataDir, "weight-profiles.json"), "utf8"));
const dimensionsDoc = JSON.parse(readFileSync(join(dataDir, "dimensions.json"), "utf8"));

const DIM_KEYS = dimensionsDoc.dimensions.map((d) => d.key);

function weightedScore(scores, weights) {
  let s = 0;
  for (const k of DIM_KEYS) {
    const w = weights[k];
    const v = scores[k];
    if (w == null || v == null) throw new Error(`Missing weight or score for ${k}`);
    s += w * v;
  }
  return Math.round(s * 1000) / 1000;
}

function csvEscape(s) {
  if (s == null) return "";
  const t = String(s);
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

mkdirSync(outDir, { recursive: true });

const profiles = weightsDoc.profiles;
const rows = [];

const header = [
  "module_key",
  "module_name",
  "specialist_owner",
  ...DIM_KEYS,
  ...profiles.map((p) => `weighted_${p.id}`),
  "evidence_refs",
  "notes",
];

for (const m of modulesDoc.modules) {
  const wParts = [];
  for (const p of profiles) {
    wParts.push(weightedScore(m.scores, p.weights).toFixed(3));
  }
  rows.push([
    m.module_key,
    m.module_name,
    m.specialist_owner,
    ...DIM_KEYS.map((k) => m.scores[k]),
    ...wParts,
    (m.evidence_refs || []).join("; "),
    m.notes || "",
  ]);
}

const csv = [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
const outPath = join(outDir, "module-scorecard.csv");
writeFileSync(outPath, csv, "utf8");

const summaryLines = [
  `NexusOps module scorecard (0–3 per dimension; weighted columns are 0–3 scale)`,
  `Source: product-scorecard/data/*.json → ${outPath.replace(root + "/", "")}`,
  ``,
  `Profile summaries (mean weighted score across modules):`,
];

for (const p of profiles) {
  const col = `weighted_${p.id}`;
  const idx = header.indexOf(col);
  const vals = rows.map((r) => parseFloat(r[idx], 10));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  summaryLines.push(`  ${p.label}: mean = ${mean.toFixed(3)} (${p.id})`);
}

summaryLines.push(``, `Rows: ${rows.length} modules`);
writeFileSync(join(outDir, "summary.txt"), summaryLines.join("\n"), "utf8");

console.log(summaryLines.join("\n"));
console.log(`\nWrote: ${outPath}`);
