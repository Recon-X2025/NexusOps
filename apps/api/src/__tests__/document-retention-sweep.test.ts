/**
 * The retention sweeper's org scoping (isolation sweep, 2026-08-22).
 *
 * `runRetentionSweep` joins documents → document_retention_policies on
 * `retentionPolicyId` alone. The FK does not constrain same-org, so a document
 * holding another tenant's policy id inherited that tenant's `durationDays` and
 * `legalHold`. `documents.retention.assign` validates org and closes the only
 * reachable way in, but existing rows and any future writer are unaffected —
 * hence the predicate belongs on the join.
 *
 * The decisive case is a SHORTER foreign policy: org B's 1-day policy against
 * org A's 30-day-old soft-deleted document. Unscoped, the join matches and the
 * document is hard-deleted 60 days early. Scoped, no policy matches, the 90-day
 * default applies, and the document survives.
 *
 * NOTE: S3 is not configured in this environment, so `deleteObject` throws. The
 * sweeper catches that, logs, and deletes the DB row anyway — so the row's
 * survival is a genuine assertion about retention, not about the object store.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initTestEnvironment, seedFullOrg, cleanupOrg, testDb } from "./helpers";
import { documents, documentRetentionPolicies, eq } from "@coheronconnect/db";
import { runRetentionSweep } from "../workflows/documentRetentionWorkflow";

const DAY = 86_400_000;

describe.sequential("retention sweeper is org-scoped", () => {
  let orgA: Awaited<ReturnType<typeof seedFullOrg>>;
  let orgB: Awaited<ReturnType<typeof seedFullOrg>>;

  beforeAll(async () => {
    await initTestEnvironment();
    orgA = await seedFullOrg();
    orgB = await seedFullOrg();
  });

  afterAll(async () => {
    await cleanupOrg(orgA.orgId);
    await cleanupOrg(orgB.orgId);
  });

  it("does not apply another org's shorter policy to a document", async () => {
    const [foreignPolicy] = await testDb()
      .insert(documentRetentionPolicies)
      .values({
        orgId: orgB.orgId,
        name: `org-b-aggressive-${Date.now()}`,
        durationDays: 1,
        legalHold: false,
      })
      .returning();

    // Org A's document, soft-deleted 30 days ago, wrongly holding B's policy id.
    const [doc] = await testDb()
      .insert(documents)
      .values({
        orgId: orgA.orgId,
        name: "org-a-should-survive.txt",
        mimeType: "text/plain",
        sizeBytes: 10,
        storageKey: `test/${orgA.orgId}/org-a-should-survive.txt`,
        sha256: "2".repeat(64),
        retentionPolicyId: foreignPolicy!.id,
        deletedAt: new Date(Date.now() - 30 * DAY),
      })
      .returning();

    await runRetentionSweep(testDb() as never);

    // 30 days < the 90-day default ⇒ still there. Under B's 1-day policy it
    // would have been purged.
    const [still] = await testDb().select().from(documents).where(eq(documents.id, doc!.id));
    expect(still).toBeDefined();
    expect(still!.id).toBe(doc!.id);
  });

  it("still applies the org's OWN policy", async () => {
    const [ownPolicy] = await testDb()
      .insert(documentRetentionPolicies)
      .values({
        orgId: orgA.orgId,
        name: `org-a-aggressive-${Date.now()}`,
        durationDays: 1,
        legalHold: false,
      })
      .returning();

    const [doc] = await testDb()
      .insert(documents)
      .values({
        orgId: orgA.orgId,
        name: "org-a-should-purge.txt",
        mimeType: "text/plain",
        sizeBytes: 10,
        storageKey: `test/${orgA.orgId}/org-a-should-purge.txt`,
        sha256: "3".repeat(64),
        retentionPolicyId: ownPolicy!.id,
        deletedAt: new Date(Date.now() - 30 * DAY),
      })
      .returning();

    await runRetentionSweep(testDb() as never);

    // Guards the opposite error: an org predicate that matched nothing at all
    // would make the sweeper inert and this test would fail.
    const [gone] = await testDb().select().from(documents).where(eq(documents.id, doc!.id));
    expect(gone).toBeUndefined();
  });
});
