/**
 * Graceful degradation when object storage is not provisioned.
 *
 * Some deployments run with no object store (no S3_BUCKET). The storage-backed
 * paths must then REFUSE cleanly rather than 500 — and, for documents, must not
 * create a half-written row before the (failing) putObject. Generated PDFs stream
 * on demand and are unaffected; only the DMS/upload paths are gated.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { documents, eq } from "@coheronconnect/db";
import { initTestEnvironment, seedFullOrg, authedCaller, createSession, cleanupOrg, testDb } from "./helpers";

describe("storage-off graceful degradation", () => {
  let orgCtx: Awaited<ReturnType<typeof seedFullOrg>>;
  let adminToken: string;
  const savedBucket = process.env["S3_BUCKET"];

  beforeAll(async () => {
    await initTestEnvironment();
    delete process.env["S3_BUCKET"]; // force the "no object storage" state
    orgCtx = await seedFullOrg();
    adminToken = await createSession(orgCtx.adminId);
  });

  afterAll(async () => {
    if (savedBucket === undefined) delete process.env["S3_BUCKET"];
    else process.env["S3_BUCKET"] = savedBucket;
    await cleanupOrg(orgCtx.orgId);
  });

  it("documents.upload refuses cleanly and writes NO row when storage is unconfigured", async () => {
    const caller = await authedCaller(adminToken);
    const before = await testDb().select().from(documents).where(eq(documents.orgId, orgCtx.orgId));

    await expect(
      caller.documents.upload({
        name: "contract.pdf",
        mimeType: "application/pdf",
        contentBase64: Buffer.from("hello").toString("base64"),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    // The key point: no orphaned document row (upload used to insert before putObject).
    const after = await testDb().select().from(documents).where(eq(documents.orgId, orgCtx.orgId));
    expect(after.length).toBe(before.length);
  });
});
