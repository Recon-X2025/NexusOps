import { config } from "dotenv";
config({ path: "../../.env" });
import { getDb, eq, desc } from "@coheronconnect/db";
import { superAdminAuditLogs } from "@coheronconnect/db/schema";
async function run() {
  const db = getDb();
  const { desc } = await import("@coheronconnect/db");
  const { organizations } = await import("@coheronconnect/db/schema");
  const logs = await db
    .select({
      id: superAdminAuditLogs.id,
      actorEmail: superAdminAuditLogs.actorEmail,
      orgId: superAdminAuditLogs.orgId,
      orgName: organizations.name,
      action: superAdminAuditLogs.action,
      beforeJson: superAdminAuditLogs.beforeJson,
      afterJson: superAdminAuditLogs.afterJson,
      createdAt: superAdminAuditLogs.createdAt,
    })
    .from(superAdminAuditLogs)
    .orderBy(desc(superAdminAuditLogs.createdAt))
    .leftJoin(organizations, eq(superAdminAuditLogs.orgId, organizations.id))
    .limit(1);
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}
run();
