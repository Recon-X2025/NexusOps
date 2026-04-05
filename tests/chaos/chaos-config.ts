/**
 * NexusOps chaos / system-validation — environment and safety configuration.
 *
 * Database URL: `CHAOS_DATABASE_URL` or `DATABASE_URL` (either works; chaos-specific wins if both set).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_BASE = "http://139.84.154.78";
/** Default includes Playwright project key so parallel projects do not fight one org row. */
const DEFAULT_ORG_SLUG_PREFIX = "nexusops-chaos-validation";
const DEFAULT_SEED_PASSWORD = "ChaosValidation!9";

function parseEnvLine(key: string, line: string): string | undefined {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`);
  const m = line.match(re);
  if (!m) return undefined;
  let v = m[1]!.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

function loadEnvFiles(): void {
  const roots = [path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../..")];
  const keys = ["CHAOS_BASE_URL", "CHAOS_DATABASE_URL", "DATABASE_URL", "CHAOS_ORG_SLUG"] as const;
  for (const root of roots) {
    for (const name of [".env", ".env.local", ".env.production"]) {
      const p = path.join(root, name);
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, "utf8");
      for (const line of text.split("\n")) {
        for (const key of keys) {
          if (process.env[key]) continue;
          const val = parseEnvLine(key, line);
          if (val) process.env[key] = val;
        }
        for (const flag of ["CHAOS_SKIP_SEED", "CHAOS_SKIP_DB_ASSERT", "CHAOS_ALLOW_DB_MISMATCH"] as const) {
          if (process.env[flag]) continue;
          const val = parseEnvLine(flag, line);
          if (val) process.env[flag] = val;
        }
        if (!process.env["CHAOS_LOGIN_EMAIL"]) {
          const v = parseEnvLine("CHAOS_LOGIN_EMAIL", line);
          if (v) process.env["CHAOS_LOGIN_EMAIL"] = v;
        }
        if (!process.env["CHAOS_LOGIN_PASSWORD"]) {
          const v = parseEnvLine("CHAOS_LOGIN_PASSWORD", line);
          if (v) process.env["CHAOS_LOGIN_PASSWORD"] = v;
        }
      }
    }
  }
}

function isTruthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

function isRemoteHttpBase(base: string): boolean {
  try {
    const h = new URL(base).hostname.toLowerCase();
    return h !== "localhost" && h !== "127.0.0.1";
  } catch {
    return true;
  }
}

function isLocalDatabaseHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr.replace(/^postgresql:/i, "http:"));
    const h = (u.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
  } catch {
    return /localhost|127\.0\.0\.1/i.test(urlStr);
  }
}

export interface ChaosConfig {
  baseUrl: string;
  /** Resolved DB URL for Drizzle (CHAOS_DATABASE_URL ?? DATABASE_URL). */
  databaseUrl?: string;
  skipSeed: boolean;
  skipDbAssert: boolean;
  allowDbMismatch: boolean;
  orgSlug: string;
  seededAdminEmail: string;
  seededAdminPassword: string;
  loginEmail: string;
  loginPassword: string;
}

/**
 * Priority: env vars (after .env load). See spec header for full list.
 */
export function getChaosConfig(projectKey: string): ChaosConfig {
  loadEnvFiles();

  const baseUrl = (process.env["CHAOS_BASE_URL"] ?? DEFAULT_BASE).replace(/\/$/, "");
  const databaseUrl =
    process.env["CHAOS_DATABASE_URL"]?.trim() || process.env["DATABASE_URL"]?.trim() || undefined;
  const skipSeed = isTruthy(process.env["CHAOS_SKIP_SEED"]);
  const skipDbAssert = isTruthy(process.env["CHAOS_SKIP_DB_ASSERT"]);
  const allowDbMismatch = isTruthy(process.env["CHAOS_ALLOW_DB_MISMATCH"]);
  const orgSlug =
    process.env["CHAOS_ORG_SLUG"]?.trim() ||
    `${DEFAULT_ORG_SLUG_PREFIX}-${projectKey.replace(/-+/g, "-").slice(0, 40)}`;
  const seededAdminPassword =
    process.env["CHAOS_ADMIN_PASSWORD"]?.trim() || process.env["CHAOS_SEED_PASSWORD"]?.trim() || DEFAULT_SEED_PASSWORD;
  const seededAdminEmail = `chaos.admin+${projectKey}@nexusops.test`;

  const loginEmail = skipSeed
    ? (process.env["CHAOS_LOGIN_EMAIL"] ?? process.env["CHAOS_ADMIN_EMAIL"] ?? "").trim()
    : seededAdminEmail;
  const loginPassword = skipSeed
    ? (process.env["CHAOS_LOGIN_PASSWORD"] ?? process.env["CHAOS_ADMIN_PASSWORD"] ?? "").trim()
    : seededAdminPassword;

  return {
    baseUrl,
    databaseUrl,
    skipSeed,
    skipDbAssert,
    allowDbMismatch,
    orgSlug,
    seededAdminEmail,
    seededAdminPassword,
    loginEmail,
    loginPassword,
  };
}

/**
 * Safety: remote UI + local DATABASE_URL (or CHAOS_DATABASE_URL) without explicit opt-in.
 */
export function assertDatabaseUrlMatchesBase(config: ChaosConfig): void {
  if (config.skipSeed) return;
  if (!config.databaseUrl) return;
  if (!isRemoteHttpBase(config.baseUrl)) return;
  if (!isLocalDatabaseHost(config.databaseUrl)) return;
  if (config.allowDbMismatch) return;

  throw new Error(
    [
      "Chaos safety check failed: CHAOS_BASE_URL points at a remote host but DATABASE_URL / CHAOS_DATABASE_URL looks local.",
      "The API behind the remote UI will not see rows seeded into your local Postgres.",
      "Fix: set CHAOS_DATABASE_URL to the deployment Postgres (tunnel OK), or CHAOS_SKIP_SEED=1 with CHAOS_LOGIN_EMAIL/PASSWORD, or set CHAOS_ALLOW_DB_MISMATCH=1.",
    ].join("\n"),
  );
}

/** Ensure @nexusops/db getDb() uses the intended URL for this process. */
export function applyDatabaseUrlForDrizzle(url: string): void {
  process.env["DATABASE_URL"] = url;
}
