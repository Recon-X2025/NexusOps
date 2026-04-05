import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";

function findEnvFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const envPath = findEnvFile();
if (envPath) {
  dotenv.config({ path: envPath });
}

export const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/nexusops";

export const REDIS_URL = process.env.REDIS_URL || "";

export const API_URL = process.env.API_URL || "http://localhost:3000";
