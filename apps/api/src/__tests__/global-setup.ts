/**
 * Runs once before Vitest workers start. Applies versioned SQL migrations to the
 * test database so Layer 1 and other tests see a real schema (not only dotenv).
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup(): Promise<void> {
  if (process.env["VITEST_SKIP_GLOBAL_MIGRATE"] === "1") {
    return;
  }

  config({ path: resolve(__dirname, "../../../../.env.test") });

  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.warn(
      "[vitest global-setup] DATABASE_URL missing — load .env.test or use `dotenv -e .env.test -- vitest`. Skipping migrations.",
    );
    return;
  }

  execSync("pnpm --filter @nexusops/db db:migrate", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
