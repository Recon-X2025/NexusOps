/**
 * CRM → Accounts: the list showed SEVEN columns that could never show anything,
 * and the create form collected four fields while the two that drive tax on every
 * quote — `stateCode` and `gstin` — had no way in at all.
 *
 * This suite covers the half a Playwright spec cannot reach cheaply:
 *
 *  1. An account created through `accounts.create` PERSISTS stateCode + gstin.
 *     They are new to that input; the deprecated `createAccount` never accepted
 *     them, so a form pointed at the old procedure would have had both silently
 *     stripped by zod while the toast said "Account created".
 *  2. The three union territories whose names DIVERGE between the two state
 *     vocabularies in this repo each resolve to a GST CODE and not to null. The
 *     account form sources its options from GSTIN_STATE_CODES for exactly this
 *     reason; had it used INDIAN_STATES (realigned to the professional-tax
 *     vocabulary in Round 6) the buyer state would resolve to null and every
 *     quote for that customer would silently bill intra-state CGST/SGST.
 *  3. Open Opps and Total Revenue equal the underlying deals — they are real
 *     aggregates now, not fields nothing computes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockContext, seedTestOrg, seedUser, testDb, cleanupOrg } from "./helpers";
import { crmRouter } from "../routers/crm";
import { crmAccounts, crmDeals, eq } from "@coheronconnect/db";
import { normaliseStateToCode, GSTIN_STATE_CODES } from "@coheronconnect/payroll-math";
import { nanoid } from "nanoid";

describe("CRM accounts — form / list / schema parity", () => {
  let orgId: string;
  let userId: string;
  let caller: ReturnType<typeof crmRouter.createCaller>;

  beforeEach(async () => {
    ({ orgId } = await seedTestOrg());
    ({ userId } = await seedUser(orgId, {
      email: `acct-${nanoid(6)}@qa.coheronconnect.io`,
      role: "admin",
      matrixRole: "admin",
    }));
    caller = crmRouter.createCaller(createMockContext(userId, orgId));
  });

  afterEach(async () => {
    await cleanupOrg(orgId);
  });

  // ── 1 · the two new fields actually land in the row ────────────────────────
  describe("create persists place of supply", () => {
    it("stores stateCode and gstin on the account row", async () => {
      const created = await caller.accounts.create({
        name: `Buyer ${nanoid(4)}`,
        industry: "Technology",
        tier: "smb",
        website: "https://buyer.test",
        stateCode: "27",
        gstin: "27ABCDE1234F1Z5",
      });

      // Not just echoed by the procedure — read back from the table.
      const [row] = await testDb().select().from(crmAccounts).where(eq(crmAccounts.id, created!.id));
      expect(row?.stateCode).toBe("27");
      expect(row?.gstin).toBe("27ABCDE1234F1Z5");
    });

    it("an account created WITHOUT a state keeps a null state — it is not defaulted", async () => {
      // The silent case: an absent state is a legitimate unknown that logs
      // nothing anywhere. It must stay null so the quote editor can say so,
      // rather than being quietly filled with the org's own state.
      const created = await caller.accounts.create({
        name: `Stateless ${nanoid(4)}`,
        tier: "smb",
      });
      const [row] = await testDb().select().from(crmAccounts).where(eq(crmAccounts.id, created!.id));
      expect(row?.stateCode).toBeNull();
    });

    it("update can set the state on an account created before the field existed", async () => {
      const created = await caller.accounts.create({ name: `Legacy ${nanoid(4)}`, tier: "smb" });
      await caller.accounts.update({ id: created!.id, stateCode: "29", gstin: "29ABCDE1234F1Z5" });
      const [row] = await testDb().select().from(crmAccounts).where(eq(crmAccounts.id, created!.id));
      expect(row?.stateCode).toBe("29");
      expect(row?.gstin).toBe("29ABCDE1234F1Z5");
    });
  });

  // ── 2 · the state-vocabulary trap ─────────────────────────────────────────
  describe("state vocabulary", () => {
    // The three whose NAMES differ between GSTIN_STATE_CODES and the
    // professional-tax list the employee dropdown uses.
    const DIVERGENT_UTS: Array<[string, string]> = [
      ["01", "Jammu & Kashmir"],
      ["26", "Dadra & Nagar Haveli and Daman & Diu"],
      ["35", "Andaman & Nicobar"],
    ];

    it.each(DIVERGENT_UTS)("%s (%s) resolves to a code, not null", async (code, name) => {
      // The form stores the CODE; normaliseStateToCode passes a known code through.
      expect(normaliseStateToCode(code)).toBe(code);
      // And the NAME the form displays is the one this normaliser recognises.
      expect(GSTIN_STATE_CODES[code]).toBe(name);
      expect(normaliseStateToCode(name)).toBe(code);
    });

    it("the PT-vocabulary spelling of the same UT does NOT resolve — which is why the form must not use that list", () => {
      // "Jammu and Kashmir" is how `professional_tax_slabs.state_name` spells it.
      // normaliseStateToCode does a lowercased EXACT match with no &/and handling,
      // so this returns null: an unknown buyer state, and a silently wrong split.
      expect(normaliseStateToCode("Jammu and Kashmir")).toBeNull();
    });

    it("every option the account form offers round-trips through the normaliser", async () => {
      // Guard against the option list and the normaliser drifting apart later.
      for (const [code, name] of Object.entries(GSTIN_STATE_CODES)) {
        expect(normaliseStateToCode(code), `code ${code}`).toBe(code);
        expect(normaliseStateToCode(name), `name ${name}`).toBe(code);
      }
    });
  });

  // ── 3 · Open Opps / Total Revenue are real aggregates ─────────────────────
  describe("list aggregates", () => {
    it("Open Opps counts non-closed deals and Total Revenue sums closed-won", async () => {
      const acct = await caller.accounts.create({ name: `Agg ${nanoid(4)}`, tier: "smb" });
      const other = await caller.accounts.create({ name: `Other ${nanoid(4)}`, tier: "smb" });

      await testDb().insert(crmDeals).values([
        { orgId, title: "Open A", accountId: acct!.id, ownerId: userId, stage: "proposal", value: "100000" },
        { orgId, title: "Open B", accountId: acct!.id, ownerId: userId, stage: "negotiation", value: "50000" },
        { orgId, title: "Won", accountId: acct!.id, ownerId: userId, stage: "closed_won", value: "250000" },
        { orgId, title: "Won 2", accountId: acct!.id, ownerId: userId, stage: "closed_won", value: "150000" },
        { orgId, title: "Lost", accountId: acct!.id, ownerId: userId, stage: "closed_lost", value: "999999" },
        // Belongs to a DIFFERENT account — must not leak into this row's figures.
        { orgId, title: "Elsewhere", accountId: other!.id, ownerId: userId, stage: "proposal", value: "777" },
      ]);

      const rows = await caller.accounts.list({ limit: 50, showArchived: false });
      const row = rows.find((r) => r.id === acct!.id) as { openOpps: number; totalRevenue: string };
      expect(row).toBeDefined();

      // Two open (proposal + negotiation). closed_won and closed_lost are not open.
      expect(Number(row.openOpps)).toBe(2);
      // Closed-won only: 250000 + 150000. The lost deal contributes nothing.
      expect(Number(row.totalRevenue)).toBe(400000);

      const otherRow = rows.find((r) => r.id === other!.id) as { openOpps: number; totalRevenue: string };
      expect(Number(otherRow.openOpps)).toBe(1);
      expect(Number(otherRow.totalRevenue)).toBe(0);
    });

    it("an account with no deals reports zero, not undefined", async () => {
      // The column used to render `undefined` — the aggregate must produce a
      // number for every row, including rows the grouped query never matched.
      const acct = await caller.accounts.create({ name: `Empty ${nanoid(4)}`, tier: "smb" });
      const rows = await caller.accounts.list({ limit: 50, showArchived: false });
      const row = rows.find((r) => r.id === acct!.id) as { openOpps: number; totalRevenue: string };
      expect(row.openOpps).toBe(0);
      expect(Number(row.totalRevenue)).toBe(0);
    });
  });
});
