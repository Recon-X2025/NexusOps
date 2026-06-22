/**
 * OLTP / data-store deployment mode for CoheronConnect.
 *
 * - **postgres** — PostgreSQL only (Drizzle). `MONGODB_URI` is ignored (warn if set).
 * - **hybrid** — PostgreSQL + MongoDB both required and connected at startup.
 * - **mongo** — MongoDB required at startup; PostgreSQL (`DATABASE_URL`) still required
 *   today because sessions, tickets, and most routers use Drizzle until migrated.
 */
export type DatabaseOltpProvider = "postgres" | "hybrid" | "mongo";

const RAW_TO_PROVIDER: Record<string, DatabaseOltpProvider> = {
  postgres: "postgres",
  postgresql: "postgres",
  sql: "postgres",
  hybrid: "hybrid",
  dual: "hybrid",
  both: "hybrid",
  postgres_mongo: "hybrid",
  "postgres+mongo": "hybrid",
  mongo: "mongo",
  mongodb: "mongo",
};

/**
 * Reads `DATABASE_PROVIDER` or `DATABASE_OLTP_PROVIDER` (first wins).
 * Defaults to `postgres`. Unknown values log a warning and fall back to `postgres`.
 */
export function getDatabaseOltpProvider(): DatabaseOltpProvider {
  const raw = (process.env.DATABASE_PROVIDER ?? process.env.DATABASE_OLTP_PROVIDER ?? "postgres").trim().toLowerCase();
  const mapped = RAW_TO_PROVIDER[raw];
  if (mapped) return mapped;
  if (raw.length > 0) {
    console.warn(
      `[database-provider] Unknown DATABASE_PROVIDER="${raw}" — defaulting to postgres. ` +
        "Use: postgres | hybrid | mongo (aliases: postgresql, dual, postgres+mongo, mongodb).",
    );
  }
  return "postgres";
}

export function isPostgresOnlyProvider(p: DatabaseOltpProvider): boolean {
  return p === "postgres";
}

export function providerRequiresMongo(p: DatabaseOltpProvider): boolean {
  return p === "hybrid" || p === "mongo";
}

export function providerRequiresPostgresUrl(p: DatabaseOltpProvider): boolean {
  // All current modes need Drizzle until OLTP is ported off Postgres.
  return true;
}

/**
 * Validates env for the selected provider. Call once at API startup.
 * @throws Error if required variables are missing.
 */
export function validateDatabaseEnvAtStartup(provider: DatabaseOltpProvider): void {
  const pg = process.env.DATABASE_URL?.trim();
  const mg = process.env.MONGODB_URI?.trim();

  if (provider === "postgres") {
    if (!pg) {
      throw new Error("DATABASE_PROVIDER=postgres requires DATABASE_URL");
    }
    if (mg) {
      console.warn(
        "[database-provider] MONGODB_URI is set but ignored when DATABASE_PROVIDER=postgres. " +
          "Use DATABASE_PROVIDER=hybrid or mongo to connect MongoDB.",
      );
    }
    return;
  }

  if (provider === "hybrid") {
    if (!pg) {
      throw new Error("DATABASE_PROVIDER=hybrid requires DATABASE_URL (PostgreSQL / Drizzle)");
    }
    if (!mg) {
      throw new Error("DATABASE_PROVIDER=hybrid requires MONGODB_URI");
    }
    return;
  }

  // mongo
  if (!mg) {
    throw new Error("DATABASE_PROVIDER=mongo requires MONGODB_URI");
  }
  if (!pg) {
    throw new Error(
      "DATABASE_PROVIDER=mongo still requires DATABASE_URL: Drizzle-backed OLTP (auth, sessions, tickets, …) " +
        "runs on PostgreSQL until those modules are migrated. Use DATABASE_PROVIDER=hybrid for the same wiring with explicit naming.",
    );
  }
}
