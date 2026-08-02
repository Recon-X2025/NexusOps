/**
 * Audit-chain head-anchor + scheduled verifier tests (B5 / H-1 + H-2).
 *
 * Two mechanisms are covered:
 *   1. The head anchor (`audit_chain_anchors`): `appendAuditEntry` advances a
 *      per-org anchor recording where the head SHOULD be, so `verifyAuditChain`
 *      can detect TAIL TRUNCATION (deleting the newest entries leaves a shorter
 *      but internally-consistent chain that re-derivation alone cannot catch).
 *   2. The scheduled sweep (`sweepAuditChainVerification`): re-derives every
 *      anchored org, latches a broken chain's anchor to 'broken', writes a
 *      chained audit row, and notifies the org's owners/admins — exactly once
 *      per newly-detected break (the anchor status is the notify-once latch).
 *
 * Assertions are scoped to the org each test seeds (its own anchor + its own
 * notifications), never global counts, because the sweep runs DB-wide over a
 * shared single-fork test DB with thousands of pre-existing anchors.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { seedFullOrg, testDb } from "./helpers";
import { appendAuditEntry, verifyAuditChain } from "../lib/audit-hash";
import { sweepAuditChainVerification } from "../workflows/auditVerifyWorkflow";
import {
  auditLogs,
  auditChainAnchors,
  notifications,
  eq,
  and,
  gt,
} from "@coheronconnect/db";

describe("B5: audit-chain head anchor", () => {
  let orgId: string;
  let userId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    userId = seeded.adminId;
  });

  async function append(action: string, resourceId: string) {
    return appendAuditEntry(testDb(), {
      orgId,
      userId,
      action,
      resourceType: "test",
      resourceId,
      changes: { action },
    });
  }

  it("appendAuditEntry advances the org's head anchor to the latest seq/hash", async () => {
    await append("create", "r1");
    await append("update", "r2");
    const last = await append("delete", "r3");

    const [anchor] = await testDb()
      .select()
      .from(auditChainAnchors)
      .where(eq(auditChainAnchors.orgId, orgId));

    expect(anchor).toBeDefined();
    expect(anchor.maxSeq).toBe(3);
    expect(anchor.headHash).toBe(last.entryHash);
    expect(anchor.status).toBe("ok");
  });

  it("verifyAuditChain flags tail truncation via the anchor (R-5 mechanism)", async () => {
    await append("create", "r1");
    await append("update", "r2");
    await append("read", "r3");
    await append("update", "r4");
    await append("delete", "r5");

    expect((await verifyAuditChain(testDb(), orgId)).ok).toBe(true);

    // Delete seqs 4,5 off the END — remaining 1,2,3 is still contiguous + valid.
    await testDb()
      .delete(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), gt(auditLogs.seq, 3)));

    const after = await verifyAuditChain(testDb(), orgId);
    expect(after.ok).toBe(false);
    expect(after.entries).toBe(3);
    expect(after.reason).toMatch(/tail truncated/i);
  });

  it("an org with no anchor row is judged on re-derivation alone (legacy chains stay green)", async () => {
    await append("create", "r1");
    await append("update", "r2");

    // Simulate a legacy pre-anchor org: remove the anchor but keep a valid chain.
    await testDb()
      .delete(auditChainAnchors)
      .where(eq(auditChainAnchors.orgId, orgId));

    const verdict = await verifyAuditChain(testDb(), orgId);
    expect(verdict.ok).toBe(true);
    expect(verdict.entries).toBe(2);
  });
});

describe("B5: scheduled audit-chain verifier sweep", () => {
  let orgId: string;
  let userId: string;
  let adminId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    userId = seeded.adminId;
    adminId = seeded.adminId;
  });

  async function append(action: string, resourceId: string) {
    return appendAuditEntry(testDb(), {
      orgId,
      userId,
      action,
      resourceType: "test",
      resourceId,
      changes: { action },
    });
  }

  it("leaves a clean chain's anchor untouched and does not notify", async () => {
    await append("create", "r1");
    await append("update", "r2");

    await sweepAuditChainVerification(testDb());

    const [anchor] = await testDb()
      .select()
      .from(auditChainAnchors)
      .where(eq(auditChainAnchors.orgId, orgId));
    expect(anchor.status).toBe("ok");

    const notes = await testDb()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.sourceType, "audit_chain"),
        ),
      );
    expect(notes.length).toBe(0);
  });

  it("latches a truncated chain to 'broken', audits it, and notifies admins once", async () => {
    await append("create", "r1");
    await append("update", "r2");
    await append("read", "r3");

    // Truncate seq 3 off the end.
    await testDb()
      .delete(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), gt(auditLogs.seq, 2)));

    // First sweep: detects the break, latches the anchor, notifies.
    const first = await sweepAuditChainVerification(testDb());
    expect(first.newlyBroken).toBeGreaterThanOrEqual(1);

    const [anchor] = await testDb()
      .select()
      .from(auditChainAnchors)
      .where(eq(auditChainAnchors.orgId, orgId));
    expect(anchor.status).toBe("broken");

    // A chained audit row records the failure.
    const failRows = await testDb()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.orgId, orgId),
          eq(auditLogs.action, "audit.chain.verification_failed"),
        ),
      );
    expect(failRows.length).toBe(1);

    // The admin (owner/admin role) was notified exactly once.
    const notesAfterFirst = await testDb()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.userId, adminId),
          eq(notifications.sourceType, "audit_chain"),
        ),
      );
    expect(notesAfterFirst.length).toBe(1);

    // Second sweep: anchor already 'broken' → no new notification, no re-latch.
    const second = await sweepAuditChainVerification(testDb());
    // This org contributes to `broken` but not to `newlyBroken` on the 2nd tick.
    expect(second.broken).toBeGreaterThanOrEqual(1);

    const notesAfterSecond = await testDb()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.userId, adminId),
          eq(notifications.sourceType, "audit_chain"),
        ),
      );
    expect(notesAfterSecond.length).toBe(1);
  });
});
