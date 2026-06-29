import { getDb } from "./index";
import { sql } from "drizzle-orm";

async function run() {
  const db = getDb();
  await db.execute(sql`ALTER TABLE "crm_contacts" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;`);
  console.log("Done");
  process.exit(0);
}

run().catch(console.error);
