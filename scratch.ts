import { getDb } from "./packages/db/src/client";
import { sql } from "drizzle-orm";
require("dotenv").config({ path: "../../.env" });

async function run() {
  const db = getDb();
  await db.execute(sql`DROP TABLE IF EXISTS secretarial_filings CASCADE;`);
  await db.execute(sql`DROP TYPE IF EXISTS secretarial_filing_status CASCADE;`);
  console.log("Done");
  process.exit(0);
}
run();
