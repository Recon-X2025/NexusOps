/**
 * The CSV contact importer cannot produce an account-less contact.
 *
 * `ContactIngestSchema` had no account field, so `ingest.importContacts` wrote
 * every row with `account_id = NULL`. Such a contact shows on the Contacts tab
 * but on NO account page, because the account screen finds its people through
 * `contacts.list({ accountId })`, which cannot return a null-account row.
 *
 * The other two write paths already refused to do this — `contacts.create`
 * requires a uuid `accountId`, `lead-convert` always resolves one — so the
 * importer was the last way in. It now takes an account NAME (a spreadsheet
 * author has names, not uuids), resolves it, and REJECTS a row it cannot match,
 * naming the row and the reason rather than failing the whole file.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { ingestRouter } from "../routers/ingest";
import { crmAccounts, crmContacts, eq, and, isNull } from "@coheronconnect/db";

describe("ingest.importContacts — every contact lands on an account", () => {
  let orgId: string;
  let caller: ReturnType<typeof ingestRouter.createCaller>;
  let accountId: string;
  const ACCOUNT = "Acme Manufacturing";

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = ingestRouter.createCaller(createMockContext(seeded.adminId!, orgId));
    const [a] = await testDb().insert(crmAccounts)
      .values({ orgId, name: ACCOUNT } as never).returning();
    accountId = a!.id;
  });

  const orphans = () => testDb().select().from(crmContacts)
    .where(and(eq(crmContacts.orgId, orgId), isNull(crmContacts.accountId)));

  it("REFUSES a row with no account at all — the input schema requires one", async () => {
    await expect(
      caller.importContacts([{ firstName: "No", lastName: "Account" } as never]),
    ).rejects.toThrow(/accountName|required/i);
    expect(await orphans()).toHaveLength(0);
  });

  it("imports a row whose account name matches, and attaches it", async () => {
    const res = await caller.importContacts([
      { firstName: "Priya", lastName: "Sharma", accountName: ACCOUNT },
    ]);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(0);
    const [c] = await testDb().select().from(crmContacts).where(eq(crmContacts.orgId, orgId));
    expect(c!.accountId).toBe(accountId);
  });

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    const res = await caller.importContacts([
      { firstName: "Case", lastName: "Insensitive", accountName: "  acme MANUFACTURING  " },
    ]);
    expect(res.imported).toBe(1);
    const [c] = await testDb().select().from(crmContacts).where(eq(crmContacts.orgId, orgId));
    expect(c!.accountId).toBe(accountId);
  });

  it("REJECTS an unknown account by row, and still imports the good rows", async () => {
    // The batch must survive one bad row — the statutory generators in this
    // codebase name the record that failed and write the rest.
    const res = await caller.importContacts([
      { firstName: "Priya", lastName: "Sharma", accountName: ACCOUNT },
      { firstName: "Ghost", lastName: "Contact", accountName: "Nonesuch Industries" },
    ]);
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(1);
    // Row 1 is the CSV header, so the second data row reads as row 3.
    expect(res.errors[0]!.row).toBe(3);
    expect(res.errors[0]!.accountName).toBe("Nonesuch Industries");
    expect(res.errors[0]!.reason).toMatch(/no active account named/i);
    expect(await orphans()).toHaveLength(0);
  });

  it("REJECTS an AMBIGUOUS account name rather than guessing", async () => {
    // There is no unique index on (org_id, name), so duplicates are possible.
    await testDb().insert(crmAccounts).values({ orgId, name: ACCOUNT } as never);
    const res = await caller.importContacts([
      { firstName: "Ambi", lastName: "Guous", accountName: ACCOUNT },
    ]);
    expect(res.imported).toBe(0);
    expect(res.errors[0]!.reason).toMatch(/2 active accounts are named/i);
    expect(await orphans()).toHaveLength(0);
  });

  it("does NOT match an ARCHIVED account", async () => {
    await testDb().update(crmAccounts).set({ archived: true }).where(eq(crmAccounts.id, accountId));
    const res = await caller.importContacts([
      { firstName: "Arch", lastName: "Ived", accountName: ACCOUNT },
    ]);
    expect(res.imported).toBe(0);
    expect(res.errors[0]!.reason).toMatch(/no active account named/i);
    expect(await orphans()).toHaveLength(0);
  });
});
