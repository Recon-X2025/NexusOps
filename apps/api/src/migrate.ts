/**
 * Standalone migration runner.
 * Called at container start before the API process to apply any pending
 * Drizzle migrations.  Uses drizzle-orm's JS migrator — no drizzle-kit CLI
 * required at runtime.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

async function run() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");

  // Single connection — migrations are not performance-sensitive.
  const client = postgres(url, { max: 1 });
  const db     = drizzle(client);

  // Migration SQL files live at packages/db/drizzle/ relative to /app.
  // __dirname resolves to /app/apps/api/dist, so go 3 levels up.
  const migrationsFolder = resolve(__dirname, "../../../packages/db/drizzle");

  console.log("[MIGRATE] folder:", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("[MIGRATE] done.");

  await client.end();
}

run().catch((err) => {
  console.error("[MIGRATE] failed:", err);
  process.exit(1);
});
