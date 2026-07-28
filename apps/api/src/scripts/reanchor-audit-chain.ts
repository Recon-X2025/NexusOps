import { getDb, auditLogs, eq, isNotNull, asc, and } from "@coheronconnect/db";
import { computeEntryHash } from "../lib/audit-hash";

/**
 * Re-anchors the audit chain for a given organization.
 * Used to repair gaps in the `seq` numbers and hash linkages.
 * 
 * Usage: npm run tsx src/scripts/reanchor-audit-chain.ts <orgId>
 */
async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Usage: tsx reanchor-audit-chain.ts <orgId>");
    process.exit(1);
  }

  const db = getDb();
  console.log(`Re-anchoring chain for org ${orgId}...`);

  // Fetch all chained rows in their original sequential order based on seq
  // Even if there is a gap, their relative order defines their true sequence
  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.orgId, orgId), isNotNull(auditLogs.seq)))
    .orderBy(asc(auditLogs.seq));

  if (rows.length === 0) {
    console.log("No chained audit entries found for this org.");
    process.exit(0);
  }

  console.log(`Found ${rows.length} chained entries. Re-anchoring in a transaction...`);

  let expectedSeq = 1;
  let prevHash: string | null = null;
  let updatedCount = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const newHash = computeEntryHash(prevHash, expectedSeq, {
        orgId: row.orgId,
        userId: row.userId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        changes: row.changes,
      });

      // Only update if something actually needs fixing to minimize DB churn
      if (row.seq !== expectedSeq || row.prevHash !== prevHash || row.entryHash !== newHash) {
        await tx
          .update(auditLogs)
          .set({
            seq: expectedSeq,
            prevHash: prevHash,
            entryHash: newHash,
          })
          .where(eq(auditLogs.id, row.id));
        updatedCount++;
      }

      prevHash = newHash;
      expectedSeq++;
    }
  });

  console.log(`Chain re-anchored successfully! Repaired ${updatedCount} out of ${rows.length} entries.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error re-anchoring chain:", err);
  process.exit(1);
});
