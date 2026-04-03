#!/usr/bin/env node
/**
 * Chaos test runner — launches Playwright + API abuser simultaneously,
 * waits for both, then collects all results into a single output directory.
 */

import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

const RESULTS_DIR = path.join(__dirname, "results");
fs.mkdirSync(RESULTS_DIR, { recursive: true });

const startTime = Date.now();

function log(msg: string): void {
  process.stdout.write(`[runner] ${msg}\n`);
}

function spawnWithLog(
  label:   string,
  cmd:     string,
  args:    string[],
  cwd:     string,
  logFile: string,
): Promise<{ code: number; label: string }> {
  return new Promise((resolve) => {
    log(`→ Starting ${label}: ${cmd} ${args.join(" ")}`);

    const out = fs.createWriteStream(logFile);
    const p: ChildProcess = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env:   { ...process.env, FORCE_COLOR: "1" },
    });

    p.stdout?.pipe(out);
    p.stderr?.pipe(out);

    // Also stream to main stdout with label prefix
    p.stdout?.on("data", (d: Buffer) => {
      process.stdout.write(d.toString().split("\n").map((l) => `[${label}] ${l}`).join("\n") + "\n");
    });
    p.stderr?.on("data", (d: Buffer) => {
      process.stderr.write(d.toString().split("\n").map((l) => `[${label}:ERR] ${l}`).join("\n") + "\n");
    });

    p.on("close", (code) => {
      log(`✓ ${label} finished (exit ${code ?? "?"})`);
      out.end();
      resolve({ code: code ?? 1, label });
    });

    p.on("error", (e) => {
      log(`✗ ${label} error: ${e.message}`);
      out.end();
      resolve({ code: 1, label });
    });
  });
}

async function main(): Promise<void> {
  const chaosDir = __dirname;

  log("══════════════════════════════════════════════");
  log("  NexusOps FULL SYSTEM DESTRUCTIVE TEST");
  log("  Playwright (UI) + API Chaos — SIMULTANEOUS");
  log(`  Start: ${new Date().toISOString()}`);
  log("══════════════════════════════════════════════");

  const [pwResult, apiResult] = await Promise.all([
    spawnWithLog(
      "playwright",
      "npx",
      ["playwright", "test", "--config", "playwright.config.ts", "--workers", "20"],
      chaosDir,
      path.join(RESULTS_DIR, "playwright.log"),
    ),
    spawnWithLog(
      "api-chaos",
      "npx",
      ["tsx", "api-chaos.ts"],
      chaosDir,
      path.join(RESULTS_DIR, "api-chaos.log"),
    ),
  ]);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  log("\n══════════════════════════════════════════════");
  log(`  RUN COMPLETE — elapsed: ${elapsed}s`);
  log(`  Playwright exit: ${pwResult.code}`);
  log(`  API chaos exit:  ${apiResult.code}`);
  log("══════════════════════════════════════════════");
  log(`  Results in: ${RESULTS_DIR}`);

  // Collect worker JSONs into summary
  const workerFiles = fs.readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith("worker-") && f.endsWith(".json"));

  const workerReports = workerFiles.map((f) =>
    JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf-8")),
  );

  const apiResults = fs.existsSync(path.join(RESULTS_DIR, "api-chaos-results.json"))
    ? JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, "api-chaos-results.json"), "utf-8"))
    : null;

  fs.writeFileSync(
    path.join(RESULTS_DIR, "combined-summary.json"),
    JSON.stringify({ elapsed_s: parseInt(elapsed), playwright: { exit: pwResult.code, workers: workerReports }, api: apiResults }, null, 2),
  );

  log("  combined-summary.json written.");
}

main().catch((e: unknown) => {
  console.error("RUNNER FATAL:", (e as Error).message);
  process.exit(1);
});
