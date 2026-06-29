import { getDb } from "./index.js";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  try {
    await db.execute(sql`ALTER TABLE crm_activities ADD COLUMN archived BOOLEAN DEFAULT false NOT NULL;`);
    console.log("Added archived column.");
  } catch (e) {
    console.log((e as Error).message);
  }
  try {
    await db.execute(sql`ALTER TABLE crm_activities ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;`);
    console.log("Added updated_at column.");
  } catch (e) {
    console.log((e as Error).message);
  }
  process.exit(0);
}

main();
