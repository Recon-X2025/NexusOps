#!/usr/bin/env node
/**
 * Coverage-floor gate (Phase 3, Stage E).
 *
 * Reads apps/api/coverage/coverage-summary.json (produced by the vitest
 * `json-summary` reporter) and fails the build if any top-level metric drops
 * below the documented floor. The floor is a *ratchet*: it starts at the
 * Stage-A baseline and should only ever be raised, never lowered, as coverage
 * improves. Lowering it requires an explicit, reviewed edit here.
 *
 * Run:  node scripts/coverage-floor.mjs
 * (Generate the summary first:  cd apps/api && npx vitest run --coverage)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUMMARY_PATH = join(
  __dirname,
  "../apps/api/coverage/coverage-summary.json",
);

/**
 * Ratchet floor. Measured at Phase 3 Stage E under THIS coverage config
 * (`vitest run --coverage`, v8, json-summary), which is the reproducible
 * baseline the gate enforces:
 *   statements 46.14 / branches 54.75 / functions 37.59 / lines 46.14
 *
 * Note on functions: the Stage-A hand baseline reported 38.75% (155/400), but
 * the new cascade/money-invariant test files import additional modules, so v8
 * now instruments 415 functions instead of 400. Covered functions rose
 * (155→156) and every other metric rose too — the function *percentage* only
 * dipped because the denominator grew (+15 newly-instrumented functions). The
 * floor below is set against the real, reproducible current measurement.
 *
 * Floors sit marginally under the measured values to absorb v8 run-to-run
 * jitter while still catching real regressions. Raise them as coverage climbs.
 */
const FLOOR = {
  statements: 45.9,
  branches: 54.4,
  functions: 37.4,
  lines: 45.9,
};

function main() {
  console.log("🔍 Verifying coverage floor...");

  let summary;
  try {
    summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
  } catch {
    console.error(`❌ Failed to read coverage summary at ${SUMMARY_PATH}`);
    console.error("   Generate it first: cd apps/api && npx vitest run --coverage");
    process.exit(1);
  }

  const total = summary.total;
  if (!total) {
    console.error("❌ coverage-summary.json has no `total` block.");
    process.exit(1);
  }

  let failed = 0;
  for (const metric of Object.keys(FLOOR)) {
    const actual = total[metric]?.pct;
    const floor = FLOOR[metric];
    if (typeof actual !== "number") {
      console.error(`❌ Missing metric "${metric}" in coverage summary.`);
      failed++;
      continue;
    }
    if (actual < floor) {
      console.error(
        `❌ ${metric}: ${actual.toFixed(2)}% is below floor ${floor.toFixed(2)}%`,
      );
      failed++;
    } else {
      console.log(
        `   ✅ ${metric}: ${actual.toFixed(2)}% (floor ${floor.toFixed(2)}%)`,
      );
    }
  }

  if (failed > 0) {
    console.error(
      `\n${failed} metric(s) below floor. Add tests or — only if intentional — lower the floor in scripts/coverage-floor.mjs.`,
    );
    process.exit(1);
  }

  console.log("✅ Coverage floor satisfied.");
}

main();
