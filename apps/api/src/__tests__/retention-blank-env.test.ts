/**
 * HIGH regression: a blank/malformed RETENTION_DEFAULT_DAYS must not trigger
 * immediate permanent deletion of soft-deleted documents.
 *
 * The sweep computed `Number(process.env.RETENTION_DEFAULT_DAYS ?? 90)`. A blank
 * env var ("") is not nullish, so `?? 90` never fired and Number("") is 0 (a
 * malformed value is NaN). With days = 0, `ageMs < days*…` is always false, so
 * every soft-deleted document was hard-deleted immediately. Fix: validate the env
 * once (finite & > 0, else 90) and skip any non-positive window.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { initTestEnvironment, testDb, seedTestOrg } from "./helpers";
import { runRetentionSweep } from "../workflows/documentRetentionWorkflow";
import { documents, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

const ENV_KEY = "RETENTION_DEFAULT_DAYS";
let saved: string | undefined;

beforeAll(async () => {
  await initTestEnvironment();
});
afterEach(() => {
  if (saved === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = saved;
});

describe("retention sweep tolerates a blank RETENTION_DEFAULT_DAYS (HIGH regression)", () => {
  it("does not purge a recently soft-deleted doc when the env default is blank", async () => {
    saved = process.env[ENV_KEY];
    process.env[ENV_KEY] = ""; // pre-fix: Number("") = 0 → immediate purge

    const db = testDb();
    const { orgId } = await seedTestOrg();
    const [doc] = await db
      .insert(documents)
      .values({
        orgId,
        name: `doc-${nanoid(5)}`,
        mimeType: "text/plain",
        sizeBytes: 10,
        storageKey: `k/${nanoid(8)}`,
        sha256: "0".repeat(64),
        deletedAt: new Date(Date.now() - 1 * 86_400_000), // soft-deleted 1 day ago
      })
      .returning();

    const res = await runRetentionSweep(db);
    expect(res.examined).toBeGreaterThan(0); // our doc is a candidate

    const [still] = await db
      .select({ id: documents.id, deletedAt: documents.deletedAt })
      .from(documents)
      .where(eq(documents.id, doc!.id));

    // Pre-fix (days=0): purged. Post-fix (default 90): 1 day < 90 → skipped.
    expect(still, "a 1-day-old soft-deleted doc was hard-deleted under a blank env var").toBeDefined();
    expect(still!.deletedAt).not.toBeNull();
  });
});
