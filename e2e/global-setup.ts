import { execSync } from "child_process";

export default async function globalSetup() {
  console.log("🌱 Seeding test database for E2E tests...");

  const testDbUrl =
    process.env.DATABASE_URL ||
    "postgresql://nexusops_test:nexusops_test@localhost:5433/nexusops_test";

  // Migrations only (no `db:push`): `push` can prompt interactively on drift
  // (e.g. rename vs create), which hangs Playwright globalSetup in CI/local.
  execSync("pnpm --filter @nexusops/db db:migrate", {
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
    },
    stdio: "inherit",
  });

  try {
    execSync("pnpm --filter @nexusops/db db:seed", {
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
      },
      stdio: "inherit",
    });
  } catch {
    // Seed may not exist yet — migrate is sufficient for schema
    console.warn("⚠️  db:seed not found or failed — schema only mode");
  }

  console.log("✅ Seed complete");
}
