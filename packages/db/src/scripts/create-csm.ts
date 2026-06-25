import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import "dotenv/config";
import { sql } from "drizzle-orm";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL is not set");

const client = postgres(DB_URL, { max: 1 });
const db = drizzle(client);

async function main() {
  console.log("Creating csm_cases table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "csm_cases" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "org_id" uuid NOT NULL,
      "number" text NOT NULL,
      "title" text NOT NULL,
      "description" text,
      "priority" text DEFAULT 'medium' NOT NULL,
      "status" text DEFAULT 'new' NOT NULL,
      "account_id" uuid,
      "contact_id" uuid,
      "requester_id" uuid,
      "assignee_id" uuid,
      "resolution" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  console.log("Table created!");
  process.exit(0);
}

main().catch(console.error);
