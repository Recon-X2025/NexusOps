import { type Command } from "commander";
import chalk from "chalk";
import { Pool } from "pg";
import * as net from "node:net";
import { DATABASE_URL, REDIS_URL, API_URL } from "../lib/env.js";

interface CheckResult {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function checkPostgres(): Promise<CheckResult> {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { name: "postgres", ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      name: "postgres",
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err),
    };
  } finally {
    await pool.end();
  }
}

async function checkRedis(url: string): Promise<CheckResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname || "localhost";
      const port = parseInt(parsed.port || "6379", 10);
      const socket = net.createConnection({ host, port });
      socket.setTimeout(3000);
      socket.once("connect", () => {
        socket.destroy();
        resolve({ name: "redis", ok: true, latencyMs: Date.now() - start });
      });
      socket.once("error", (err) => {
        resolve({
          name: "redis",
          ok: false,
          latencyMs: Date.now() - start,
          error: err.message,
        });
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve({
          name: "redis",
          ok: false,
          latencyMs: Date.now() - start,
          error: "Connection timed out",
        });
      });
    } catch (err) {
      resolve({
        name: "redis",
        ok: false,
        latencyMs: Date.now() - start,
        error: String(err),
      });
    }
  });
}

async function checkApi(baseUrl: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return {
      name: "api",
      ok: res.ok,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name: "api",
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}

export function registerCommand(program: Command): void {
  program
    .command("health")
    .description("Check system health (DB, Redis, API)")
    .option("--json", "Output results as JSON")
    .action(async (opts: { json?: boolean }) => {
      const checks: Promise<CheckResult>[] = [checkPostgres()];

      if (REDIS_URL) checks.push(checkRedis(REDIS_URL));
      if (API_URL) checks.push(checkApi(API_URL));

      const results = await Promise.all(checks);

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        for (const r of results) {
          const icon = r.ok ? chalk.green("✅") : chalk.red("❌");
          const latency = chalk.gray(`${r.latencyMs}ms`);
          const label = chalk.bold(r.name.padEnd(10));
          const detail = r.error ? chalk.red(` — ${r.error}`) : "";
          console.log(`${icon}  ${label} ${latency}${detail}`);
        }
      }

      const allOk = results.every((r) => r.ok);
      process.exit(allOk ? 0 : 1);
    });
}
