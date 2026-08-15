/**
 * Regression guard — the automatic deploy path must never seed.
 *
 * scripts/vultr-remote-deploy.sh is the script the CI "Deploy to Vultr" job runs
 * on every push to main. It used to end with:
 *
 *   echo "── seed (best-effort; API already runs migrate on start) ──"
 *   "${EXEC[@]}" exec -T api node -e "try{require('./dist/seed.js')}catch(e){…}" 2>/dev/null || true
 *
 * That never fired only because tsup emits ESM (dist/seed.mjs) and the line asked
 * for dist/seed.js — a one-character accident standing between a routine deploy
 * and packages/db/src/seed.ts resetting every existing org owner's password to the
 * demo password published in this repository.
 *
 * The line is deleted. This test fails if any seed invocation returns to that
 * script, whatever spelling it comes back in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT_PATH = resolve(__dirname, "../../../../scripts/vultr-remote-deploy.sh");

/** Comment lines are allowed to say "seed" — the deliberate-absence note does. */
function executableLines(source: string): { lineNo: number; text: string }[] {
  return source
    .split("\n")
    .map((text, i) => ({ lineNo: i + 1, text }))
    .filter(({ text }) => text.trim() !== "" && !text.trim().startsWith("#"));
}

describe("vultr-remote-deploy.sh — no seed on the deploy path", () => {
  const source = readFileSync(SCRIPT_PATH, "utf8");

  it("reads the deploy script (guards against a rename silently passing this test)", () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain("prune_old_images");
  });

  it.each([
    ["seed", /\bseed\b/i],
    ["seed.js", /seed\.js/i],
    ["seed.mjs", /seed\.mjs/i],
    ["db:seed", /db:seed/i],
    ["seedModules", /seedModules/],
    ["seedSmbAnalytics", /seedSmbAnalytics/],
  ])("contains no invocation of %s", (_label, pattern) => {
    const offenders = executableLines(source).filter(({ text }) => pattern.test(text));
    expect(
      offenders,
      `Seeding must not run on the deploy path. Offending line(s):\n` +
        offenders.map(({ lineNo, text }) => `  ${lineNo}: ${text.trim()}`).join("\n"),
    ).toEqual([]);
  });

  it("still records why the step is absent, so it is not re-added as an oversight", () => {
    expect(source).toMatch(/NO SEED STEP HERE, DELIBERATELY/);
  });
});
