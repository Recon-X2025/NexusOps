/**
 * DPDP automation-loop tests (Phase 1 — sweeps + dispatcher + erasure).
 *
 * These exercise the reusable core the scheduled worker calls:
 *   - dsrOverdueSweep      — internal alert per open+overdue DSR, deduped.
 *   - breachNotifySweep    — board + principal notices per unnotified overdue breach.
 *   - consentExpirySweep   — lapse "granted" consents past expiresAt.
 *   - LogOnlyDispatcher    — persists a notification artifact, no external send.
 *   - executeErasureForDsr — dry-run by default (flag-off), destructive when forced.
 *
 * All run against the real test Postgres via the standard API harness. Each
 * test seeds a fresh org, so cross-test isolation holds under the shared DB.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockContext, seedFullOrg, testDb } from "./helpers";
import { complianceRouter } from "../routers/compliance";
import {
  dpdpDataSubjectRequests,
  dpdpConsentRecords,
  dpdpNotificationArtifacts,
  and,
  eq,
} from "@coheronconnect/db";
import {
  dsrOverdueSweep,
  breachNotifySweep,
  consentExpirySweep,
  runDpdpSweepsForOrg,
} from "../lib/dpdp-sweeps";
import { LogOnlyDispatcher, EmailDispatcher, getNotificationDispatcher } from "../lib/notification-dispatcher";
import { executeErasureForDsr } from "../lib/dpdp-erasure";

describe("DPDP automation loop (Phase 1)", () => {
  let caller: any;
  let orgId: string;

  beforeEach(async () => {
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    caller = complianceRouter.createCaller(createMockContext(seeded.adminId, orgId));
  });

  // ── NotificationDispatcher (B2) ───────────────────────────────────────────
  describe("LogOnlyDispatcher", () => {
    it("persists a 'logged' artifact and returns its id", async () => {
      const db = testDb();
      const dispatcher = new LogOnlyDispatcher();
      const res = await dispatcher.dispatch(db, {
        orgId,
        channel: "internal",
        audience: "privacy_officer",
        subject: "Test notice",
        body: "Body text",
        relatedType: "dsr",
        relatedId: crypto.randomUUID(),
      });
      expect(res.status).toBe("logged");
      expect(res.artifactId).toBeTruthy();

      const [row] = await db
        .select()
        .from(dpdpNotificationArtifacts)
        .where(eq(dpdpNotificationArtifacts.id, res.artifactId));
      expect(row!.subject).toBe("Test notice");
      expect(row!.status).toBe("logged");
    });

    it("the default active dispatcher is an EmailDispatcher", () => {
      expect(getNotificationDispatcher()).toBeInstanceOf(EmailDispatcher);
    });
  });

  // ── DSR overdue sweep ─────────────────────────────────────────────────────
  describe("dsrOverdueSweep", () => {
    const mkDsr = (over: Record<string, unknown> = {}) =>
      caller.dsr.create({
        requestType: "access",
        principalName: "Asha Rao",
        principalEmail: "asha@example.com",
        responseWindowDays: 30,
        ...over,
      });

    it("dispatches an internal alert per open + overdue DSR and dedupes on re-run", async () => {
      const db = testDb();
      // overdue: received 40d ago, 30d window → due 10d ago
      await mkDsr({
        principalName: "Overdue P",
        receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      });
      // not overdue
      await mkDsr({ principalName: "Fresh P" });

      const first = await dsrOverdueSweep(db, orgId);
      expect(first.eligible).toBe(1);
      expect(first.dispatched).toBe(1);

      // one internal artifact was written
      const arts = await db
        .select()
        .from(dpdpNotificationArtifacts)
        .where(
          and(
            eq(dpdpNotificationArtifacts.orgId, orgId),
            eq(dpdpNotificationArtifacts.relatedType, "dsr"),
          ),
        );
      expect(arts).toHaveLength(1);
      expect(arts[0]!.channel).toBe("internal");

      // second run within the dedupe window dispatches nothing new
      const second = await dsrOverdueSweep(db, orgId);
      expect(second.eligible).toBe(1);
      expect(second.dispatched).toBe(0);
    });

    it("does not alert a closed DSR even if its clock elapsed", async () => {
      const db = testDb();
      const d = await mkDsr({
        principalName: "Closed P",
        receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await caller.dsr.transition({ id: d.id, toStatus: "in_progress" });
      await caller.dsr.transition({ id: d.id, toStatus: "fulfilled" });
      await caller.dsr.transition({ id: d.id, toStatus: "closed" });

      const res = await dsrOverdueSweep(db, orgId);
      expect(res.eligible).toBe(0);
      expect(res.dispatched).toBe(0);
    });
  });

  // ── Breach notify sweep ───────────────────────────────────────────────────
  describe("breachNotifySweep", () => {
    const mkBreach = (over: Record<string, unknown> = {}) =>
      caller.breach.create({ title: "Exposed export", severity: "high", ...over });

    it("dispatches board + principal notices for an unnotified overdue breach, deduped", async () => {
      const db = testDb();
      // overdue: detected 4d ago, 72h window → due ~1d ago, principals not notified
      await mkBreach({
        title: "Overdue breach",
        detectedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        notificationWindowHours: 72,
      });

      const first = await breachNotifySweep(db, orgId);
      expect(first.eligible).toBe(1);
      expect(first.dispatched).toBe(2); // board + principal

      const arts = await db
        .select()
        .from(dpdpNotificationArtifacts)
        .where(
          and(
            eq(dpdpNotificationArtifacts.orgId, orgId),
            eq(dpdpNotificationArtifacts.relatedType, "breach"),
          ),
        );
      const channels = arts.map((a) => a.channel).sort();
      expect(channels).toEqual(["board", "principal"]);

      const second = await breachNotifySweep(db, orgId);
      expect(second.dispatched).toBe(0);
    });

    it("skips a breach whose principals were already notified", async () => {
      const db = testDb();
      const b = await mkBreach({
        title: "Notified breach",
        detectedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        notificationWindowHours: 72,
      });
      await caller.breach.notify({ id: b.id, audience: "both" });

      const res = await breachNotifySweep(db, orgId);
      expect(res.eligible).toBe(0);
      expect(res.dispatched).toBe(0);
    });
  });

  // ── Consent expiry sweep ──────────────────────────────────────────────────
  describe("consentExpirySweep", () => {
    it("expires granted consents past expiresAt and records an 'expired' event", async () => {
      const db = testDb();
      const past = new Date(Date.now() - 60 * 1000).toISOString();
      const c = await caller.consent.grant({
        principalRef: "asha@example.com",
        purpose: "marketing_emails",
        expiresAt: past,
      });
      // a still-valid one
      await caller.consent.grant({
        principalRef: "ravi@example.com",
        purpose: "marketing_emails",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      const res = await consentExpirySweep(db, orgId);
      expect(res.expired).toBe(1);

      const [row] = await db
        .select()
        .from(dpdpConsentRecords)
        .where(eq(dpdpConsentRecords.id, c.id));
      expect(row!.status).toBe("expired");

      const full = await caller.consent.get({ id: c.id });
      const types = full.events.map((e: any) => e.eventType);
      expect(types).toContain("expired");

      // idempotent: a second sweep expires nothing
      const again = await consentExpirySweep(db, orgId);
      expect(again.expired).toBe(0);
    });
  });

  // ── runDpdpSweepsForOrg composite ─────────────────────────────────────────
  it("runDpdpSweepsForOrg runs all three sweeps and is org-scoped", async () => {
    const db = testDb();
    // seed an overdue DSR in THIS org
    await caller.dsr.create({
      requestType: "access",
      principalName: "Overdue P",
      principalEmail: "asha@example.com",
      responseWindowDays: 30,
      receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    });
    // a second org with its own overdue DSR must not be touched
    const other = await seedFullOrg();
    const otherCaller = complianceRouter.createCaller(
      createMockContext(other.adminId, other.orgId),
    );
    await otherCaller.dsr.create({
      requestType: "access",
      principalName: "Other Overdue",
      principalEmail: "other@example.com",
      responseWindowDays: 30,
      receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await runDpdpSweepsForOrg(db, orgId);
    expect(res.dsr.eligible).toBe(1);
    expect(res.dsr.dispatched).toBe(1);

    // only THIS org's artifact exists
    const arts = await db
      .select()
      .from(dpdpNotificationArtifacts)
      .where(eq(dpdpNotificationArtifacts.orgId, orgId));
    expect(arts).toHaveLength(1);
  });

  // ── Erasure executor (flag-off default) ───────────────────────────────────
  describe("executeErasureForDsr", () => {
    const mkErasure = () =>
      caller.dsr.create({
        requestType: "erasure",
        principalName: "Asha Rao",
        principalEmail: "asha@example.com",
        responseWindowDays: 30,
      });

    it("dry-runs by default: mutates nothing, stamps no evidence", async () => {
      const db = testDb();
      const d = await mkErasure();
      const res = await executeErasureForDsr(db, orgId, d.id);
      expect(res.executed).toBe(false);
      expect(res.summary).toMatch(/DRY-RUN/i);

      const [row] = await db
        .select()
        .from(dpdpDataSubjectRequests)
        .where(eq(dpdpDataSubjectRequests.id, d.id));
      expect(row!.erasureExecutedAt).toBeNull();
      // principal fields untouched in dry-run
      expect(row!.principalName).toBe("Asha Rao");
    });

    it("when forced, anonymises the DSR's principal fields and stamps evidence", async () => {
      const db = testDb();
      const d = await mkErasure();
      const res = await executeErasureForDsr(db, orgId, d.id, { force: true });
      expect(res.executed).toBe(true);

      const [row] = await db
        .select()
        .from(dpdpDataSubjectRequests)
        .where(eq(dpdpDataSubjectRequests.id, d.id));
      expect(row!.erasureExecutedAt).not.toBeNull();
      expect(row!.erasureSummary).toBeTruthy();
      expect(row!.principalName).toBe("[erased]");
      expect(row!.principalEmail).toBe("[erased]");
    });

    it("refuses to run on a non-erasure DSR", async () => {
      const db = testDb();
      const d = await caller.dsr.create({
        requestType: "access",
        principalName: "Asha Rao",
        principalEmail: "asha@example.com",
        responseWindowDays: 30,
      });
      await expect(executeErasureForDsr(db, orgId, d.id, { force: true })).rejects.toThrow(
        /not 'erasure'/i,
      );
    });

    it("transition to 'fulfilled' on an erasure DSR records an [erasure] note event", async () => {
      const d = await mkErasure();
      await caller.dsr.transition({ id: d.id, toStatus: "in_progress" });
      await caller.dsr.transition({ id: d.id, toStatus: "fulfilled" });
      const full = await caller.dsr.get({ id: d.id });
      const notes = full.events.filter((e: any) => e.eventType === "note");
      expect(notes.some((n: any) => /\[erasure\]/i.test(n.note ?? ""))).toBe(true);
    });
  });
});
