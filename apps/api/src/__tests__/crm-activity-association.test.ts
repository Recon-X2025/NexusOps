/**
 * An activity must hang off something — and a LEAD counts.
 *
 * `crm_activities.leadId` shipped in Round 9a with an FK, an index, a filter on
 * `activities.list` and an aggregate on `leads.list` feeding the Leads screen's
 * "Last Activity" column. Nothing in the product could write it: `grep -rn
 * "leadId" apps/web/src` returned ZERO results. A real aggregate with no producer
 * — the column could only ever render "—".
 *
 * The Log Activity dialog was the reason. It offered Account, Contact and Deal,
 * marked Account and Contact REQUIRED, and disabled Save without both. A lead has
 * no account until it converts, so an activity against a lead was unreachable by
 * construction.
 *
 * Meanwhile the procedure required NOTHING, so the Dashboard's "+ New" button
 * created rows attached to nothing at all. These tests pin both ends: at least one
 * association is required, and a lead satisfies it on its own.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmActivities, crmDeals, eq } from "@coheronconnect/db";
import { nanoid } from "nanoid";

describe("CRM activity associations", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, {
      email: `act-${nanoid(6)}@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
    }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  const leadBase = () => ({
    firstName: "Ada",
    lastName: `L${nanoid(4)}`,
    email: `ada-${nanoid(5)}@acme.test`,
    phone: "+91 90000 00000",
    company: "Acme",
    source: "website" as const,
  });

  // ── the rule ──────────────────────────────────────────────────────────────
  describe("at least one association", () => {
    it("REFUSES an activity attached to nothing", async () => {
      // The exact payload the Dashboard "+ New" button used to send.
      await expect(
        caller.activities.create({ type: "call", subject: "Quick activity log", description: "" } as never),
      ).rejects.toThrow(/at least one of: lead, deal, account or contact/i);
    });

    it("REFUSES it on the deprecated flat path too, so the hole did not just move", async () => {
      await expect(
        caller.createActivity({ type: "call", subject: "Quick activity log" } as never),
      ).rejects.toThrow(/at least one of: lead, deal, account or contact/i);
    });

    it("a LEAD alone is enough — no account, no contact", async () => {
      // This is the case the old form made impossible. A lead has no account
      // until it converts, so requiring one is requiring the unobtainable.
      const lead = await caller.leads.create(leadBase() as never);
      const leadId = (lead as { id: string }).id;

      const created = await caller.activities.create({
        leadId, type: "call", subject: "Discovery call", completedAt: new Date(),
      } as never);

      // Read the ROW back, not the return value — a mutation that echoes its input
      // proves nothing about what was stored.
      const [row] = await testDb().select().from(crmActivities)
        .where(eq(crmActivities.id, (created as { id: string }).id));
      expect(row?.leadId).toBe(leadId);
      expect(row?.accountId).toBeNull();
      expect(row?.contactId).toBeNull();
      expect(row?.subject).toBe("Discovery call");
    });

    it("a deal alone, an account alone and a contact alone each satisfy the rule", async () => {
      const acct = await caller.accounts.create({ name: `A${nanoid(4)}`, tier: "smb" });
      const contact = await caller.contacts.create({
        firstName: "Bob", lastName: `B${nanoid(4)}`, accountId: acct!.id,
      });
      const [deal] = await testDb().insert(crmDeals)
        .values({ orgId, title: `D${nanoid(4)}`, ownerId: userId }).returning();

      await expect(caller.activities.create({ dealId: deal!.id, subject: "d" } as never)).resolves.toBeDefined();
      await expect(caller.activities.create({ accountId: acct!.id, subject: "a" } as never)).resolves.toBeDefined();
      await expect(caller.activities.create({ contactId: contact!.id, subject: "c" } as never)).resolves.toBeDefined();
    });
  });

  // ── the loop the Leads screen depends on ─────────────────────────────────
  describe("a lead activity closes the Last Activity loop", () => {
    it("appears on the lead AND as its lastActivityAt", async () => {
      const lead = await caller.leads.create(leadBase() as never);
      const leadId = (lead as { id: string }).id;
      const when = new Date("2026-08-10T09:30:00Z");

      await caller.activities.create({
        leadId, type: "call", subject: "Intro call", completedAt: when,
      } as never);

      // On the lead's own timeline…
      const listed = (await caller.activities.list({ leadId } as never)) as { subject: string }[];
      expect(listed).toHaveLength(1);
      expect(listed[0]!.subject).toBe("Intro call");

      // …and in the aggregate the Leads list column reads.
      const rows = (await caller.leads.list({} as never)) as { id: string; lastActivityAt: Date | null }[];
      const row = rows.find((r) => r.id === leadId);
      expect(row?.lastActivityAt).toBeTruthy();
      expect(new Date(row!.lastActivityAt!).toISOString()).toBe(when.toISOString());
    });

    it("an activity with a scheduled date but no completion does NOT become the last activity", async () => {
      // The aggregate reads completedAt. A future follow-up is not a past contact.
      const lead = await caller.leads.create(leadBase() as never);
      const leadId = (lead as { id: string }).id;

      await caller.activities.create({
        leadId, type: "follow_up", subject: "Send pricing", scheduledAt: new Date("2026-09-01T10:00:00Z"),
      } as never);

      const rows = (await caller.leads.list({} as never)) as { id: string; lastActivityAt: Date | null }[];
      expect(rows.find((r) => r.id === leadId)?.lastActivityAt).toBeNull();
    });

    it("a lead activity does not leak onto a deal, or a deal activity onto the lead", async () => {
      const lead = await caller.leads.create(leadBase() as never);
      const leadId = (lead as { id: string }).id;
      const [deal] = await testDb().insert(crmDeals)
        .values({ orgId, title: `D${nanoid(4)}`, ownerId: userId }).returning();

      await caller.activities.create({ leadId, subject: "lead call", completedAt: new Date() } as never);
      await caller.activities.create({ dealId: deal!.id, subject: "deal note", completedAt: new Date() } as never);

      const onLead = (await caller.activities.list({ leadId } as never)) as { subject: string }[];
      const onDeal = (await caller.activities.list({ dealId: deal!.id } as never)) as { subject: string }[];
      expect(onLead.map((a) => a.subject)).toEqual(["lead call"]);
      expect(onDeal.map((a) => a.subject)).toEqual(["deal note"]);
    });
  });
});
