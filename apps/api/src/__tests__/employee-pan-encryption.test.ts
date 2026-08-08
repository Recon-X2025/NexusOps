/**
 * Employee PAN is stored ENCRYPTED at rest (DPDP).
 * ─────────────────────────────────────────────────────────────────────────────
 * hr.employees.create/update used to write `pan` in plaintext (and never stamped the match
 * hash / masked display), while vendors and the org record encrypted via panColumns(). This
 * pins the fix: a PAN written through create OR update is stored as a `v2:` KMS envelope with a
 * peppered match-hash + masked display — never plaintext. A malformed PAN degrades to
 * encrypted-raw (no throw, no plaintext). And a legacy plaintext PAN still reads back through
 * decryptPan (the regression that protects existing rows until a backfill).
 */

// The local KMS provider derives its KEK from APP_SECRET; PAN encryption needs it. Set a
// test-only value before anything encrypts (mirrors pan-encryption-at-rest / mfa tests).
process.env["APP_SECRET"] = process.env["APP_SECRET"] ?? "test-app-secret-for-pan-do-not-use-in-prod";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
// Import ./helpers BEFORE the router barrel — it initialises the module graph in an order that
// avoids a router circular-init (mirrors the other router-caller tests, e.g. approval-concurrency).
import { makeContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { hrRouter } from "../routers/hr";
import { decryptPan, panColumnsTolerant } from "../lib/pan";
import { employees, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("employee PAN encryption at rest", () => {
  let orgId: string;
  let caller: ReturnType<typeof hrRouter.createCaller>;

  async function storedRow(id: string) {
    const [row] = await testDb().select().from(employees).where(eq(employees.id, id));
    return row!;
  }

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId: adminId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    caller = hrRouter.createCaller(makeContext(adminId, orgId));
  });
  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  it("create with a valid PAN stores ciphertext + hash + mask, no plaintext, and round-trips", async () => {
    const emp = await caller.employees.create({
      userName: "Asha Rao",
      userEmail: `asha-${nanoid(6)}@qa.coheronconnect.io`,
      state: "Karnataka",
      pan: "ABCDE1234F",
    });
    const row = await storedRow(emp.id);

    expect(row.pan).toMatch(/^v2:/); // KMS envelope, not plaintext
    expect(row.pan).not.toContain("ABCDE1234F");
    expect(row.panMaskedHash).toBeTruthy();
    expect(row.panMaskedDisplay).toContain("234F"); // last 4 shown
    expect(row.panMaskedDisplay).not.toContain("ABCDE"); // first 6 masked
    expect(await decryptPan(row.pan)).toBe("ABCDE1234F"); // decrypts back
  });

  it("update with a new PAN re-encrypts (never plaintext) and re-stamps the mask", async () => {
    const emp = await caller.employees.create({
      userName: "Ben Kurian",
      userEmail: `ben-${nanoid(6)}@qa.coheronconnect.io`,
      state: "Karnataka",
      pan: "ABCDE1234F",
    });
    await caller.employees.update({ id: emp.id, pan: "MNOPQ4321R" });
    const row = await storedRow(emp.id);

    expect(row.pan).toMatch(/^v2:/);
    expect(row.pan).not.toContain("MNOPQ4321R");
    expect(await decryptPan(row.pan)).toBe("MNOPQ4321R");
    expect(row.panMaskedHash).toBeTruthy();
    expect(row.panMaskedDisplay).toContain("321R"); // last 4 shown, first 6 masked
  });

  it("a malformed PAN is REJECTED by create (single-record edge validates, unlike the importer)", async () => {
    await expect(
      caller.employees.create({
        userName: "Cy Malformed",
        userEmail: `cy-${nanoid(6)}@qa.coheronconnect.io`,
        state: "Karnataka",
        pan: "NOTAPAN", // fails the PAN format rule
      }),
    ).rejects.toThrow(/PAN must be in the format/i);
  });

  it("a malformed PAN is REJECTED by update", async () => {
    const emp = await caller.employees.create({
      userName: "Del Ok",
      userEmail: `del-${nanoid(6)}@qa.coheronconnect.io`,
      state: "Karnataka",
      pan: "ABCDE1234F",
    });
    await expect(caller.employees.update({ id: emp.id, pan: "12345678901" })).rejects.toThrow(
      /PAN must be in the format/i,
    );
  });

  it("saving the edit dialog unchanged does NOT alter the stored PAN (double-encryption closed)", async () => {
    const emp = await caller.employees.create({
      userName: "Eve Stable",
      userEmail: `eve-${nanoid(6)}@qa.coheronconnect.io`,
      state: "Karnataka",
      pan: "ABCDE1234F",
    });
    const before = (await storedRow(emp.id)).pan;

    // The edit dialog now sends the PAN only when the admin types a new one; an unchanged save
    // omits it. Assert an update WITHOUT pan leaves the stored ciphertext byte-for-byte identical.
    await caller.employees.update({ id: emp.id, title: "Analyst" });
    const after = (await storedRow(emp.id)).pan;

    expect(after).toBe(before); // not re-encrypted
    expect(await decryptPan(after)).toBe("ABCDE1234F"); // still recovers the original PAN
  });

  it("panColumnsTolerant leaves an already-encrypted envelope untouched (never re-encrypts)", async () => {
    const envelope = (await panColumnsTolerant("ABCDE1234F")).pan!; // a real v2: envelope
    expect(envelope).toMatch(/^v2:/);
    const result = await panColumnsTolerant(envelope);
    expect(result).toEqual({}); // no columns written — the guard treats it as "no change"
  });

  it("the directory (list) never ships the raw envelope — only the masked display", async () => {
    const emp = await caller.employees.create({
      userName: "Fay Masked",
      userEmail: `fay-${nanoid(6)}@qa.coheronconnect.io`,
      state: "Karnataka",
      pan: "ABCDE1234F",
    });
    const list = await caller.employees.list({});
    const row = list.find((r) => r.id === emp.id)!;
    expect(row.pan).toBeNull(); // ciphertext stripped
    expect(row.panMaskedDisplay).toContain("234F"); // the safe display value is present
  });

  it("a legacy plaintext PAN still reads correctly through decryptPan (existing-data regression)", async () => {
    // A bare, non-envelope PAN (how rows were stored before the fix) passes through unchanged.
    expect(await decryptPan("ABCDE1234F")).toBe("ABCDE1234F");
  });
});
