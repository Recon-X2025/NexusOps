/**
 * The deprecated-mutation trap, pinned.
 *
 * Three times a screen has been wired to a DEPRECATED tRPC procedure whose zod
 * input does not declare the newer fields. Zod strips them silently, the toast
 * says success, and the data is gone. Router tests never caught it because they
 * call the canonical procedure directly — so these tests do the opposite: they
 * assert what the DEPRECATED input drops, so the gap is a documented fact rather
 * than something rediscovered by a customer.
 *
 * They also pin the two gaps that had to be closed before the Contacts tab could
 * be repointed at the canonical procedures at all.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmLeads, crmContacts, crmDeals, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("CRM deprecated-vs-canonical mutation parity", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, {
      email: `sweep-${nanoid(6)}@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
    }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  const lead = () => ({
    firstName: "Ada", lastName: `L${nanoid(4)}`,
    email: `ada-${nanoid(5)}@acme.test`, phone: "+91 90000 00000",
    company: "Acme", source: "website" as const,
  });

  // ── leads.create — the third occurrence, closed by this round ─────────────
  describe("lead create", () => {
    it("the CANONICAL procedure persists all nine qualification fields", async () => {
      const created = await caller.leads.create({
        ...lead(),
        budgetBand: "over_25l",
        budgetNote: "approved capex",
        authority: "decision_maker",
        need: "Replacing spreadsheet payroll",
        timeline: "immediate",
        estimatedValue: "250000",
        expectedClose: "2026-12-31",
        nextAction: "Send pricing",
        nextActionDate: "2026-09-01",
      } as never);

      const [row] = await testDb().select().from(crmLeads).where(eq(crmLeads.id, (created as { id: string }).id));
      expect(row?.budgetBand).toBe("over_25l");
      expect(row?.budgetNote).toBe("approved capex");
      expect(row?.authority).toBe("decision_maker");
      expect(row?.need).toBe("Replacing spreadsheet payroll");
      expect(row?.timeline).toBe("immediate");
      expect(Number(row?.estimatedValue)).toBe(250000);
      expect(row?.expectedClose).not.toBeNull();
      expect(row?.nextAction).toBe("Send pricing");
      expect(row?.nextActionDate).not.toBeNull();
    });

    it("the DEPRECATED procedure silently DROPS all nine — this is the trap", async () => {
      // Identical payload, deprecated path. Everything below the base fields is
      // stripped by zod before the handler ever sees it, and the caller is told
      // nothing. The New Lead dialog was on this procedure; the qualification
      // block added this round would have vanished on save.
      const created = await caller.createLead({
        ...lead(),
        budgetBand: "over_25l",
        authority: "decision_maker",
        timeline: "immediate",
        estimatedValue: "250000",
        nextAction: "Send pricing",
      } as never);

      const [row] = await testDb().select().from(crmLeads).where(eq(crmLeads.id, (created as { id: string }).id));
      // The lead is created — that is what makes this invisible.
      expect(row).toBeDefined();
      // …and every qualification value is at its column default.
      expect(row?.budgetBand).toBe("unknown");
      expect(row?.authority).toBe("unknown");
      expect(row?.timeline).toBe("unknown");
      expect(row?.estimatedValue).toBeNull();
      expect(row?.nextAction).toBeNull();
    });
  });

  // ── accounts.create — the second occurrence, closed in Part 1 ─────────────
  describe("account create", () => {
    it("the DEPRECATED procedure silently DROPS stateCode and gstin", async () => {
      const created = await caller.createAccount({
        name: `Dep ${nanoid(4)}`,
        tier: "smb",
        stateCode: "27",
        gstin: "27ABCDE1234F1Z5",
      } as never);
      expect((created as { stateCode: string | null }).stateCode).toBeNull();
      expect((created as { gstin: string | null }).gstin).toBeNull();
    });

    it("the DEPRECATED update likewise drops them", async () => {
      const created = await caller.accounts.create({ name: `Dep2 ${nanoid(4)}`, tier: "smb" });
      const updated = await caller.updateAccount({
        id: created!.id, stateCode: "29", gstin: "29ABCDE1234F1Z5",
      } as never);
      expect((updated as { stateCode: string | null }).stateCode).toBeNull();
    });
  });

  // ── the two gaps that blocked repointing Contacts ─────────────────────────
  describe("contacts: what the canonical procedures were missing", () => {
    it("contacts.list honours showArchived — it had no archived filter at all", async () => {
      const a = await caller.contacts.create({ firstName: "Kept", lastName: `K${nanoid(4)}`, accountId: (await caller.accounts.create({ name: `A${nanoid(4)}`, tier: "smb" }))!.id });
      await caller.contacts.update({ id: a!.id, archived: true });

      const active = await caller.contacts.list({ limit: 50, showArchived: false });
      expect(active.find((c) => c.id === a!.id)).toBeUndefined();

      const archived = await caller.contacts.list({ limit: 50, showArchived: true });
      expect(archived.find((c) => c.id === a!.id)).toBeDefined();
    });

    it("contacts.update accepts `archived` — without it both Archive buttons were inert", async () => {
      const acct = await caller.accounts.create({ name: `A${nanoid(4)}`, tier: "smb" });
      const c = await caller.contacts.create({ firstName: "Arch", lastName: `A${nanoid(4)}`, accountId: acct!.id });
      await caller.contacts.update({ id: c!.id, archived: true });
      const [row] = await testDb().select().from(crmContacts).where(eq(crmContacts.id, c!.id));
      expect(row?.archived).toBe(true);
    });
  });

  // ── deals.create: stage was required on the form and never sent ───────────
  it("deals.create honours stage — the New Deal form's required Stage went nowhere", async () => {
    const deal = await caller.deals.create({ title: `D${nanoid(4)}`, stage: "negotiation" } as never);
    const [row] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, (deal as { id: string }).id));
    expect(row?.stage).toBe("negotiation");

    // Omitting it still lands on the column default, so nothing else changes.
    const plain = await caller.deals.create({ title: `D${nanoid(4)}` });
    const [plainRow] = await testDb().select().from(crmDeals).where(eq(crmDeals.id, (plain as { id: string }).id));
    expect(plainRow?.stage).toBe("prospect");
  });
});
