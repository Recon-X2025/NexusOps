import { type Command } from "commander";
import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { DATABASE_URL } from "../lib/env.js";

function parseDbUrl(url: string): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, ""),
    user: parsed.username || "postgres",
    password: decodeURIComponent(parsed.password || ""),
  };
}

function defaultOutputPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `./backup-${date}.sql`;
}

export function registerCommand(program: Command): void {
  program
    .command("backup")
    .description("Backup PostgreSQL database to a SQL file")
    .option("--output <path>", "Output file path", defaultOutputPath())
    .option("--compress", "Compress output with gzip")
    .action(async (opts: { output: string; compress?: boolean }) => {
      const spinner = ora("Backing up database…").start();

      try {
        const db = parseDbUrl(DATABASE_URL);
        const outputFile = opts.compress
          ? opts.output.replace(/\.sql$/, "") + ".sql.gz"
          : opts.output;
        const outputDir = path.dirname(path.resolve(outputFile));
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const pgDumpArgs = [
          "-h", db.host,
          "-p", db.port,
          "-U", db.user,
          "-d", db.database,
          "--no-password",
        ];

        const env = { ...process.env, PGPASSWORD: db.password };

        if (opts.compress) {
          // pg_dump | gzip > outputFile
          const pgDump = spawn("pg_dump", pgDumpArgs, { env });
          const gzip = spawn("gzip", ["-c"], { env: process.env });
          const out = fs.createWriteStream(outputFile);

          pgDump.stdout.pipe(gzip.stdin);
          gzip.stdout.pipe(out);

          await new Promise<void>((resolve, reject) => {
            let pgDumpErr = "";
            pgDump.stderr.on("data", (d: Buffer) => {
              pgDumpErr += d.toString();
            });
            pgDump.on("close", (code) => {
              if (code !== 0) reject(new Error(`pg_dump exited with code ${code}: ${pgDumpErr}`));
            });
            out.on("finish", resolve);
            out.on("error", reject);
          });
        } else {
          execSync(`pg_dump ${pgDumpArgs.join(" ")} -f "${outputFile}"`, {
            env,
            stdio: ["ignore", "ignore", "pipe"],
          });
        }

        const stats = fs.statSync(outputFile);
        const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
        spinner.succeed(
          chalk.green(`Backup saved to ${outputFile} (${sizeMb} MB)`)
        );
        process.exit(0);
      } catch (err) {
        spinner.fail(chalk.red("Backup failed."));
        console.error(chalk.red(String(err)));
        process.exit(1);
      }
    });
}
