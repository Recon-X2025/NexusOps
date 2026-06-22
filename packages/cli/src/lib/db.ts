import { Pool } from "pg";
import { DATABASE_URL } from "./env.js";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}
