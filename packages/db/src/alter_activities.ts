import { db } from "./index.js";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`ALTER TABLE crm_activities ADD COLUMN archived BOOLEAN DEFAULT false NOT NULL;`);
    console.log("Added archived column.");
  } catch(e) {
    console.log(e.message);
  }
  try {
    await db.execute(sql`ALTER TABLE crm_activities ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;`);
    console.log("Added updated_at column.");
  } catch(e) {
    console.log(e.message);
  }
  process.exit(0);
}

main();
