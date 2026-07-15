import { config } from "dotenv";
config({ path: "../../.env" });
import { getDb, eq, desc } from "@coheronconnect/db";
import { superAdminAuditLogs } from "@coheronconnect/db/schema";
async function run() {
  const db = getDb();
  const logs = await db
    .select()
    .from(superAdminAuditLogs)
    .orderBy(desc(superAdminAuditLogs.createdAt))
    .limit(1);
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}
run();
