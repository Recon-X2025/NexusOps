/**
 * COA — SYSTEM accounts cannot be renamed or deactivated (MINOR-BATCH / Step 4).
 * System accounts (GST/TDS ITC, roll-up parents) are resolved BY CODE for automated postings and
 * carry history; coa.update must refuse editing them. Non-system accounts stay editable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { seedTestOrg, seedUser, testDb, cleanupOrg, createMockContext } from "./helpers";
import { chartOfAccounts, eq } from "@coheronconnect/db";
import { accountingRouter } from "../routers/accounting";

describe("COA — system-account edit protection", () => {
  let orgId: string;
  let caller: ReturnType<typeof accountingRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    const { userId } = await seedUser(orgId, { role: "admin", matrixRole: "admin" });
    caller = accountingRouter.createCaller(createMockContext(userId, orgId));
  });
  afterEach(async () => { await cleanupOrg(orgId); });

  async function seedAccount(code: string, name: string, isSystem: boolean) {
    const [a] = await testDb().insert(chartOfAccounts).values({
      orgId, code, name, type: "asset" as any, subType: "other_current_asset" as any, isSystem, isActive: true,
    }).returning();
    return a!;
  }

  it("refuses to rename a SYSTEM account (posting resolves it by code; rename would mislead history)", async () => {
    const sys = await seedAccount("1142", "CGST ITC", true);
    await expect(caller.coa.update({ id: sys.id, name: "Renamed" })).rejects.toThrow(/system account|cannot be renamed/i);
    const [after] = await testDb().select().from(chartOfAccounts).where(eq(chartOfAccounts.id, sys.id));
    expect(after!.name).toBe("CGST ITC"); // unchanged — the posting-by-code account is intact
  });

  it("refuses to deactivate a SYSTEM account", async () => {
    const sys = await seedAccount("1143", "SGST ITC", true);
    await expect(caller.coa.update({ id: sys.id, isActive: false })).rejects.toThrow(/system account/i);
    const [after] = await testDb().select().from(chartOfAccounts).where(eq(chartOfAccounts.id, sys.id));
    expect(after!.isActive).toBe(true);
  });

  it("still allows renaming a NON-system account", async () => {
    const acct = await seedAccount("4100", "Consulting Revenue", false);
    const updated = await caller.coa.update({ id: acct.id, name: "Advisory Revenue" });
    expect(updated.name).toBe("Advisory Revenue");
  });
});
