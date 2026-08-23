/**
 * Document permissions — WIRING-01 item W3.
 *
 * `document_acls` was written by grantAcl and read NOWHERE. A restriction was
 * recorded and never enforced, so the grant screen asserted a control that did
 * not exist. These are the rules the owner specified, each tested:
 *
 *   1. no rules  → unrestricted, unchanged behaviour
 *   2. org owner → always in, and the bypass is audited
 *   3. uploader  → keeps their own document unless explicitly denied
 *   4. grant     → by user / role / team / everyone-in-org
 *   5. deny beats grant; owner beats deny
 *   6. a rule outside its window does not apply in either direction
 *   7. visibility is not access — restricted documents stay in the listing
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initTestEnvironment, seedFullOrg, seedUser, authedCaller, createSession, cleanupOrg, testDb } from "./helpers";
import { documents, documentAcls, auditLogs, eq, and } from "@coheronconnect/db";

describe.sequential("document permissions", () => {
  let org: Awaited<ReturnType<typeof seedFullOrg>>;
  // NOTE ON FIXTURES. Every documents.* procedure is gated on the `settings`
  // module, and of 27 roles only `admin` carries it. So every participant here
  // must be an admin — which is itself the limitation recorded in WIRING-01:
  // per-document grants to non-admins are unreachable until that gate is
  // relaxed. What IS testable today is the rule between administrators.
  let owner: Awaited<ReturnType<typeof authedCaller>>;   // role = owner
  let alice: Awaited<ReturnType<typeof authedCaller>>;   // admin
  let bob: Awaited<ReturnType<typeof authedCaller>>;     // admin
  let ownerId = "", aliceId = "", bobId = "";

  async function makeDoc(ownerId: string | null, name: string): Promise<string> {
    const [d] = await testDb().insert(documents).values({
      orgId: org.orgId, name, mimeType: "text/plain", sizeBytes: 3,
      storageKey: `t/${org.orgId}/${name}`, sha256: "0".repeat(64), ownerId,
    }).returning();
    return d!.id;
  }
  const rule = (documentId: string, extra: Record<string, unknown>) =>
    testDb().insert(documentAcls).values({
      documentId, principalType: "user", permission: "read", ...extra,
    } as never);

  beforeAll(async () => {
    await initTestEnvironment();
    org = await seedFullOrg();
    const o = await seedUser(org.orgId, { role: "owner", matrixRole: "admin", email: `owner-${Date.now()}@qa.test` });
    const a = await seedUser(org.orgId, { role: "admin", matrixRole: "admin", email: `alice-${Date.now()}@qa.test` });
    const b = await seedUser(org.orgId, { role: "admin", matrixRole: "admin", email: `bob-${Date.now()}@qa.test` });
    ownerId = o.userId; aliceId = a.userId; bobId = b.userId;
    owner = await authedCaller(await createSession(ownerId));
    alice = await authedCaller(await createSession(aliceId));
    bob   = await authedCaller(await createSession(bobId));
  });
  afterAll(async () => { await cleanupOrg(org.orgId); });

  it("1 — a document with no rules is open, as before", async () => {
    const id = await makeDoc(null, "unrestricted.txt");
    const d = (await alice.documents.get({ id })) as { id: string };
    expect(d.id).toBe(id);
  });

  it("4 + 7 — a restricted document refuses the unlisted, but still appears in the list", async () => {
    const id = await makeDoc(null, "restricted.txt");
    await rule(id, { principalId: bobId });                 // hr may read

    await expect(alice.documents.get({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const forHr = (await bob.documents.get({ id })) as { id: string };
    expect(forHr.id).toBe(id);

    // visibility is not access
    const listed = (await alice.documents.list({})) as Array<{ id: string; restricted: boolean; canOpen: boolean }>;
    const row = listed.find((r) => r.id === id);
    expect(row).toBeDefined();
    expect(row!.restricted).toBe(true);
    expect(row!.canOpen).toBe(false);
  });

  it("3 — the uploader keeps their own document", async () => {
    const id = await makeDoc(aliceId, "mine.txt");
    await rule(id, { principalId: bobId });                 // agent not listed
    const d = (await alice.documents.get({ id })) as { id: string };
    expect(d.id).toBe(id);
  });

  it("3 + 5 — an explicit deny removes the uploader's access", async () => {
    const id = await makeDoc(aliceId, "taken-away.txt");
    await rule(id, { principalId: bobId });
    await rule(id, { principalId: aliceId, isDeny: true });
    await expect(alice.documents.get({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("5 — deny beats a grant to the same person", async () => {
    const id = await makeDoc(null, "both.txt");
    await rule(id, { principalId: aliceId });
    await rule(id, { principalId: aliceId, isDeny: true });
    await expect(alice.documents.get({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("2 — the org owner gets in past a deny, and the bypass is audited", async () => {
    const id = await makeDoc(null, "owner-breakglass.txt");
    await rule(id, { principalId: ownerId, isDeny: true });
    const d = (await owner.documents.get({ id })) as { id: string };
    expect(d.id).toBe(id);

    const marks = await testDb().select().from(auditLogs).where(
      and(eq(auditLogs.orgId, org.orgId), eq(auditLogs.action, "document.access.owner_bypass")),
    );
    expect(marks.some((m) => m.resourceId === id)).toBe(true);
  });

  it("6 — a rule that starts in the future does not apply yet", async () => {
    const id = await makeDoc(null, "future.txt");
    const nextMonth = new Date(Date.now() + 30 * 864e5);
    await rule(id, { principalId: bobId, effectiveFrom: nextMonth });
    // the only rule is not in effect, so the document is not yet restricted
    const d = (await alice.documents.get({ id })) as { id: string };
    expect(d.id).toBe(id);
  });

  it("6 — an expired rule does not apply either", async () => {
    const id = await makeDoc(null, "expired.txt");
    await rule(id, { principalId: bobId, expiresAt: new Date(Date.now() - 864e5) });
    const d = (await alice.documents.get({ id })) as { id: string };
    expect(d.id).toBe(id);
  });

  it("the download URL is gated too, not just the detail view", async () => {
    const id = await makeDoc(null, "bytes.txt");
    await rule(id, { principalId: bobId });
    await expect(alice.documents.getDownloadUrl({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a window that ends before it starts is refused, not silently stored", async () => {
    const id = await makeDoc(null, "bad-window.txt");
    await expect(owner.documents.grantAcl({
      documentId: id, principalType: "user", principalId: bobId, permission: "read",
      effectiveFrom: new Date(Date.now() + 864e5).toISOString(),
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
