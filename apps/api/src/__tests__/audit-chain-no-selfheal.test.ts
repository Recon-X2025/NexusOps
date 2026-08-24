/**
 * BLOCKER regression: a normal audit append after a tail truncation must NOT
 * silently heal the chain.
 *
 * The anchor (the independent high-water mark verifyAuditChain compares against)
 * was updated with `maxSeq: seq` unconditionally. So after someone deletes the
 * most recent rows, the next ordinary write derives a LOWER seq from the
 * truncated head and regressed the anchor to match — verification then saw a
 * shorter-but-consistent chain and reported ok, hiding the tamper.
 *
 * Fix: the anchor is monotonic (GREATEST) and flips to 'broken' when a seq lands
 * at or below the recorded head. This test would pass pre-fix at the "detected
 * immediately after deletion" step but FAIL at the "still detected after the next
 * append" step.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { seedFullOrg, testDb } from "./helpers";
import { appendAuditEntry, verifyAuditChain } from "../lib/audit-hash";
import { auditLogs, auditChainAnchors, eq, and, gt } from "@coheronconnect/db";

describe("audit chain does not self-heal after tail truncation (BLOCKER regression)", () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    userId = seeded.adminId;
  });

  const append = (action: string, resourceId: string) =>
    appendAuditEntry(testDb(), { orgId, userId, action, resourceType: "test", resourceId, changes: { action } });

  it("a normal append after a tail deletion must not restore the anchor", async () => {
    const db = testDb();
    for (const [a, r] of [["create", "r1"], ["update", "r2"], ["read", "r3"], ["update", "r4"], ["delete", "r5"]]) {
      await append(a!, r!);
    }
    expect((await verifyAuditChain(db, orgId)).ok).toBe(true);

    // Truncate the tail: delete seq 4 and 5. The anchor still records maxSeq 5.
    await db.delete(auditLogs).where(and(eq(auditLogs.orgId, orgId), gt(auditLogs.seq, 3)));
    expect((await verifyAuditChain(db, orgId)).ok).toBe(false); // detected immediately

    // The exploit: a normal write lands at seq 4 and (pre-fix) regressed the
    // anchor to 4 — healing the break so verification went green again.
    const appended = await append("update", "r6");
    expect(appended.seq).toBe(4);

    const after = await verifyAuditChain(db, orgId);
    expect(after.ok, "the follow-up append silently healed the truncated chain").toBe(false);

    const [anchor] = await db
      .select({ maxSeq: auditChainAnchors.maxSeq, status: auditChainAnchors.status })
      .from(auditChainAnchors)
      .where(eq(auditChainAnchors.orgId, orgId));
    expect(anchor!.maxSeq).toBe(5); // never regressed below the true head
    expect(anchor!.status).toBe("broken"); // and the break is recorded, not erased
  });
});
