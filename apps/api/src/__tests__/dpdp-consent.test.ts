/**
 * DPDP consent ledger tests (Sprint 1.2).
 *
 * compliance.consent implements DPDP Act 2023 §6: grant / withdraw / renew /
 * expire consent per (Data Principal, purpose), with an append-only ledger so
 * every movement is auditable. §6(4) — withdrawal must be as easy as the grant.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { complianceRouter } from "../routers/compliance";
import { dpdpConsentRecords, eq } from "@coheronconnect/db";

describe("DPDP consent ledger (Sprint 1.2)", () => {
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = complianceRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  const grant = (over: Record<string, unknown> = {}) =>
    caller.consent.grant({
      principalRef: "asha@example.com",
      principalName: "Asha Rao",
      purpose: "marketing_emails",
      channel: "signup_form",
      ...over,
    });

  it("grants consent and seeds a 'granted' ledger event", async () => {
    const c = await grant();
    expect(c.status).toBe("granted");
    expect(c.version).toBe(1);
    const full = await caller.consent.get({ id: c.id });
    expect(full.events).toHaveLength(1);
    expect(full.events[0].eventType).toBe("granted");
    expect(full.events[0].toStatus).toBe("granted");
  });

  it("re-granting the same (principal, purpose) renews in place (version bump, no duplicate row)", async () => {
    const first = await grant();
    const second = await grant({ channel: "preference_center" });
    expect(second.id).toBe(first.id); // same record
    expect(second.version).toBe(2);
    expect(second.status).toBe("granted");

    // exactly one record for this (principal, purpose)
    const list = await caller.consent.list({ principalRef: "asha@example.com" });
    expect(list.filter((r: any) => r.purpose === "marketing_emails")).toHaveLength(1);

    // ledger now has granted + renewed
    const full = await caller.consent.get({ id: first.id });
    const types = full.events.map((e: any) => e.eventType);
    expect(types).toEqual(["granted", "renewed"]);
  });

  it("withdraws consent and records a 'withdrawn' event; double-withdraw is blocked", async () => {
    const c = await grant();
    const w = await caller.consent.withdraw({ id: c.id, reason: "no longer interested" });
    expect(w.status).toBe("withdrawn");
    expect(w.withdrawnAt).not.toBeNull();

    const full = await caller.consent.get({ id: c.id });
    const last = full.events[full.events.length - 1];
    expect(last.eventType).toBe("withdrawn");
    expect(last.reason).toBe("no longer interested");

    await expect(caller.consent.withdraw({ id: c.id })).rejects.toThrow(/already withdrawn/i);
  });

  it("re-granting after withdrawal reactivates and clears withdrawnAt", async () => {
    const c = await grant();
    await caller.consent.withdraw({ id: c.id });
    const regranted = await grant({ channel: "re_optin" });
    expect(regranted.id).toBe(c.id);
    expect(regranted.status).toBe("granted");
    expect(regranted.withdrawnAt).toBeNull();
    expect(regranted.version).toBe(2);

    const full = await caller.consent.get({ id: c.id });
    const types = full.events.map((e: any) => e.eventType);
    expect(types).toEqual(["granted", "withdrawn", "renewed"]);
  });

  it("expireLapsed flips past-expiry granted consents to expired (idempotent)", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const expiring = await grant({ purpose: "analytics", expiresAt: past });
    await grant({ purpose: "product_updates", expiresAt: future });

    const first = await caller.consent.expireLapsed();
    expect(first.expired).toBe(1);

    const full = await caller.consent.get({ id: expiring.id });
    expect(full.status).toBe("expired");
    expect(full.events.map((e: any) => e.eventType)).toContain("expired");

    // idempotent — a second sweep expires nothing more
    const second = await caller.consent.expireLapsed();
    expect(second.expired).toBe(0);
  });

  it("filters by status and is tenant-isolated", async () => {
    const granted = await grant({ purpose: "p_granted" });
    const toWithdraw = await grant({ purpose: "p_withdrawn" });
    await caller.consent.withdraw({ id: toWithdraw.id });

    const grantedList = await caller.consent.list({ status: "granted" });
    expect(grantedList.some((r: any) => r.id === granted.id)).toBe(true);
    expect(grantedList.some((r: any) => r.id === toWithdraw.id)).toBe(false);

    // another org sees nothing and cannot read this record
    const other = await seedFullOrg();
    const foreign = complianceRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    const foreignList = await foreign.consent.list();
    expect(foreignList.find((r: any) => r.id === granted.id)).toBeUndefined();
    await expect(foreign.consent.get({ id: granted.id })).rejects.toThrow(/not found/i);
    await expect(foreign.consent.withdraw({ id: granted.id })).rejects.toThrow(/not found/i);

    const db = testDb();
    const [row] = await db
      .select()
      .from(dpdpConsentRecords)
      .where(eq(dpdpConsentRecords.id, granted.id));
    expect(row!.status).toBe("granted");
  });

  it("denies consent access to a member without the compliance module", async () => {
    const seeded = await seedFullOrg();
    const memberCtx = createMockContext(seeded.requesterId, seeded.orgId, {
      user: {
        id: seeded.requesterId,
        orgId: seeded.orgId,
        email: "member@coheronconnect.io",
        name: "Member",
        role: "member",
        matrixRole: null,
        status: "active",
      },
    } as any);
    const member = complianceRouter.createCaller(memberCtx);
    await expect(member.consent.list()).rejects.toThrow(/(FORBIDDEN|Permission denied)/i);
  });
});
