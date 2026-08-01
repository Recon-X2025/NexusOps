/**
 * R-3 — A DPDP notice never resolves to a platform address, and never claims a
 * legal duty was discharged (Phase 1 ratchet, root cause #1).
 *
 * This is the ratchet under the single most dangerous root cause: software that
 * manufactures false proof a *legal duty* was performed. Under India's DPDP Act,
 * notifying the Data Protection Board or the affected data principals is the
 * TENANT's legal act — never the platform's. The software's only honest job is to
 * prepare the notice and hand it to the tenant's own compliance contact.
 *
 * What the code does today (the behaviour this ratchet pins as wrong):
 *   • The breach sweep (apps/api/src/lib/dpdp-sweeps.ts:164-188) dispatches notices
 *     with the symbolic audiences "data_protection_board" and "affected_principals";
 *     the DSR-overdue sweep (:109-120) uses "privacy_officer".
 *   • The default active dispatcher is the EmailDispatcher
 *     (notification-dispatcher.ts:131), which REWRITES each of those three symbolic
 *     audiences into one of CoheronConnect's OWN inboxes (:94-100):
 *         data_protection_board → dpb-india@coheronconnect.coheron.com
 *         affected_principals    → privacy@coheronconnect.coheron.com
 *         privacy_officer        → privacy@coheronconnect.coheron.com
 *     So a notice addressed "to the Data Protection Board" is actually sent to a
 *     platform inbox.
 *   • On a successful send it stamps the artifact status:"sent" (:108-112), which
 *     reads as "a statutory duty was discharged." The software cannot know that.
 *
 * How this test observes the REAL runtime behaviour (so it can't pass vacuously):
 * with no SMTP host configured (the test env), `sendEmail` logs
 * `[EMAIL] Would send to <addr>: <subject>` instead of delivering. We spy on
 * console.info and read that line to capture the ACTUAL address the live
 * EmailDispatcher resolved and reached the transport with — the same technique the
 * escalation-email suite uses (notify-activity-email.test.ts). We drive the real
 * `getNotificationDispatcher()` (the EmailDispatcher), not a stub.
 *
 * The three assertions (each written so it would fail if inverted):
 *   1. Recipient is never a platform/regulator address. For all three audiences,
 *      the address the dispatcher reaches must NOT be one of CoheronConnect's own
 *      inboxes and must NOT be a hardcoded board/regulator address.
 *   2. Clean refusal when the tenant contact is unset. With no tenant DPDP contact
 *      configured (every org's state today — the field does not yet exist), the
 *      path must refuse and record NOTHING as delivered; it must not silently fall
 *      back to a default. Today it falls back to the platform inbox and records a
 *      row, so this fails.
 *   3. No duty-discharged wording. No artifact may carry a `sent` status; the only
 *      honest states are "logged"/"failed" (mail to the tenant contact left the
 *      building or did not), with no statutory-fulfilment meaning. Today the
 *      EmailDispatcher sets status:"sent", so this fails.
 *
 * NOTE (expected RED until Phase 2): all three assertions are written to fail
 * against the current code. That red is the proof the ratchet works; A3 turns it
 * green by adding the per-tenant contact, deleting the platform addresses, and
 * removing the `sent` state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createMockContext, seedFullOrg, testDb, cleanupOrg } from "./helpers";
import { complianceRouter } from "../routers/compliance";
import { dpdpNotificationArtifacts } from "@coheronconnect/db";
import {
  dsrOverdueSweep,
  breachNotifySweep,
} from "../lib/dpdp-sweeps";

/**
 * The platform inboxes the current EmailDispatcher substitutes in
 * (notification-dispatcher.ts:94-100). No DPDP notice may ever resolve to one of
 * these — they are CoheronConnect's own addresses, not the tenant's contact and
 * not the actual regulator. Listed here so the assertion names the offender.
 */
const FORBIDDEN_PLATFORM_ADDRESSES = [
  "privacy@coheronconnect.coheron.com",
  "dpb-india@coheronconnect.coheron.com",
];

/** Capture the `[EMAIL] Would send to <addr>: <subject>` lines the no-SMTP path logs. */
function emailedAddresses(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .map((c) => String(c[0] ?? ""))
    .filter((line) => line.startsWith("[EMAIL] Would send to "))
    .map((line) => line.slice("[EMAIL] Would send to ".length).split(":")[0]!.trim());
}

describe("R-3: DPDP notices go to the tenant's contact, never a platform address, and never claim a duty was discharged", () => {
  let caller: any;
  let orgId: string;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = complianceRouter.createCaller(createMockContext(seeded.adminId, orgId));
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(async () => {
    infoSpy.mockRestore();
    await cleanupOrg(orgId);
  });

  /** Seed an overdue breach so breachNotifySweep dispatches board + principal notices. */
  async function seedOverdueBreach() {
    await caller.breach.create({
      title: "Overdue breach",
      severity: "high",
      detectedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      notificationWindowHours: 72,
    });
  }

  /** Seed an overdue DSR so dsrOverdueSweep dispatches a privacy_officer alert. */
  async function seedOverdueDsr() {
    await caller.dsr.create({
      requestType: "access",
      principalName: "Asha Rao",
      principalEmail: "asha@example.com",
      responseWindowDays: 30,
      receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  it("board + principal notices never reach a CoheronConnect platform inbox", async () => {
    const db = testDb();
    await seedOverdueBreach();

    await breachNotifySweep(db, orgId);

    const reached = emailedAddresses(infoSpy);
    const platformHits = reached.filter((addr) =>
      FORBIDDEN_PLATFORM_ADDRESSES.includes(addr),
    );

    expect(
      platformHits,
      `A DPDP breach notice (board / affected-principal audience) was delivered to ` +
        `a CoheronConnect platform inbox. Notices must go only to the tenant's own ` +
        `configured DPDP contact, never a platform or regulator address.\n` +
        `  Addresses the dispatcher reached: [${reached.join(", ")}]`,
    ).toEqual([]);
  });

  it("the privacy_officer (DSR) alert never reaches a CoheronConnect platform inbox", async () => {
    const db = testDb();
    await seedOverdueDsr();

    await dsrOverdueSweep(db, orgId);

    const reached = emailedAddresses(infoSpy);
    const platformHits = reached.filter((addr) =>
      FORBIDDEN_PLATFORM_ADDRESSES.includes(addr),
    );

    expect(
      platformHits,
      `A DPDP DSR-overdue alert (privacy_officer audience) was delivered to a ` +
        `CoheronConnect platform inbox. It must go only to the tenant's own ` +
        `configured DPDP contact, never a platform address.\n` +
        `  Addresses the dispatcher reached: [${reached.join(", ")}]`,
    ).toEqual([]);
  });

  it("with no tenant DPDP contact configured, the path refuses cleanly and records nothing as delivered", async () => {
    const db = testDb();
    // Every org today has no tenant DPDP contact (the field does not yet exist).
    // In that state the sweeps must record NOTHING as delivered — no artifact, and
    // certainly no mail reaching the transport. Today they fall back to the
    // platform inbox and write artifacts, so both checks below fail.
    await seedOverdueBreach();
    await seedOverdueDsr();

    await breachNotifySweep(db, orgId);
    await dsrOverdueSweep(db, orgId);

    // (a) nothing left the building
    const reached = emailedAddresses(infoSpy);
    // (b) no artifact was recorded as delivered
    const artifacts = await db
      .select()
      .from(dpdpNotificationArtifacts)
      .where(eq(dpdpNotificationArtifacts.orgId, orgId));

    expect(
      { reachedTransport: reached, artifactsWritten: artifacts.length },
      `With no tenant DPDP contact configured, the notice path must refuse cleanly ` +
        `and record nothing as delivered — never fall back to a default/platform ` +
        `address. Instead it reached the transport and/or wrote delivery artifacts.\n` +
        `  Addresses reached: [${reached.join(", ")}]; artifacts written: ${artifacts.length}`,
    ).toEqual({ reachedTransport: [], artifactsWritten: 0 });
  });

  it("no DPDP notification artifact is ever stamped 'sent' (no duty-discharged claim)", async () => {
    const db = testDb();
    await seedOverdueBreach();
    await seedOverdueDsr();

    await breachNotifySweep(db, orgId);
    await dsrOverdueSweep(db, orgId);

    const sent = await db
      .select()
      .from(dpdpNotificationArtifacts)
      .where(
        and(
          eq(dpdpNotificationArtifacts.orgId, orgId),
          eq(dpdpNotificationArtifacts.status, "sent"),
        ),
      );

    expect(
      sent.map((a) => `${a.channel}/${a.audience}`),
      `A DPDP notification artifact was stamped status:"sent", which reads as a ` +
        `discharged statutory duty. The software cannot know a legal duty was ` +
        `performed; the only honest states are "logged"/"failed" (delivery to the ` +
        `tenant contact left the building or did not).`,
    ).toEqual([]);
  });
});
