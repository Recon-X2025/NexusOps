import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import "dotenv/config";
import { sql } from "drizzle-orm";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL is not set");

const client = postgres(DB_URL, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Adding number column to surveys table...");
  try {
    await db.execute(sql`
      ALTER TABLE surveys ADD COLUMN IF NOT EXISTS "number" text NOT NULL DEFAULT 'SURV-000';
    `);
    console.log("Column added!");
  } catch (err: any) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}

main().catch(console.error);
