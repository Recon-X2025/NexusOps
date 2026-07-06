/**
 * CSAT loop on ticket resolve (SMB deal-blocker Story 4 / backlog P1-10).
 *
 * Covers the extracted trigger service (`services/csat.ts`) and the aggregation
 * that surfaces the score on dashboards/reports. The trigger is best-effort and
 * config-driven; these tests pin its invariants:
 *
 *   • resolving a ticket for a requester creates exactly one invite + in-app notification;
 *   • a second resolve of the SAME ticket creates no second invite (one-per-resolution);
 *   • the suppression window blocks a second invite for the same requester within N hours;
 *   • config `enabled=false` ⇒ no invite;
 *   • config `channel=in_app` ⇒ invite created but no email dispatched;
 *   • a ticket with no requester ⇒ no invite;
 *   • submit records a response + flips the invite (mirrors the public HTTP handler);
 *   • CSAT aggregation is org-scoped AND type-filtered (D1 cross-tenant regression guard).
 *
 * Tables touched (survey_invites, survey_responses, surveys, csat_settings,
 * notifications) are cleared per-test for the seeded org via cleanupOrg + explicit
 * deletes, matching the shared-DB singleFork posture.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { initTestEnvironment, seedFullOrg, testDb, makeContext, cleanupOrg } from "./helpers";
import { appRouter } from "../routers";
import { triggerCsatForResolvedTicket } from "../services/csat";
import {
  surveys,
  surveyInvites,
  surveyResponses,
  csatSettings,
  notifications,
} from "@coheronconnect/db";

// Spy on the notification service while preserving its real implementation, so the
// in-app row still lands but we can assert the email channel argument (2nd param).
const sendNotificationSpy = vi.fn();
vi.mock("../services/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/notifications")>();
  return {
    ...actual,
    sendNotification: async (
      payload: Parameters<typeof actual.sendNotification>[0],
      emailTo?: string,
    ) => {
      sendNotificationSpy(payload, emailTo);
      return actual.sendNotification(payload, emailTo);
    },
  };
});

describe("CSAT loop on ticket resolve (P1-10)", () => {
  let seeded: Awaited<ReturnType<typeof seedFullOrg>>;
  let orgId: string;
  let adminId: string;
  let requesterId: string;

  beforeEach(async () => {
    await initTestEnvironment();
    sendNotificationSpy.mockClear();
    seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
    requesterId = seeded.requesterId;
  });

  afterEach(async () => {
    // survey_* + csat_settings + notifications aren't in cleanupOrg's explicit list;
    // org CASCADE covers them, but clear notifications first to keep the shared DB tidy.
    const db = testDb();
    await db.delete(notifications).where(eq(notifications.orgId, orgId));
    await db.delete(csatSettings).where(eq(csatSettings.orgId, orgId));
    await cleanupOrg(orgId);
  });

  function caller(userId = adminId) {
    return appRouter.createCaller(makeContext(userId, orgId));
  }

  /** Create a ticket owned by `requesterId` and resolve it via the router. */
  async function createAndResolveTicket(title = "Printer down") {
    // Create as the requester so tickets.requesterId = requesterId (create sets it from ctx.user).
    const reqCaller = caller(requesterId);
    const ticket = (await reqCaller.tickets.create({
      title,
      type: "incident",
      priorityId: seeded.p1Id!,
    })) as { id: string; number: string };

    // Resolve as admin.
    await caller(adminId).tickets.update({
      id: ticket.id,
      data: { statusId: seeded.statusResolvedId! },
    });
    return ticket;
  }

  async function invitesForOrg() {
    return testDb()
      .select()
      .from(surveyInvites)
      .where(eq(surveyInvites.orgId, orgId));
  }

  it("resolving a ticket creates exactly one invite + an in-app notification", async () => {
    const ticket = await createAndResolveTicket();

    const invites = await invitesForOrg();
    expect(invites.length).toBe(1);
    expect(invites[0]!.ticketId).toBe(ticket.id);
    expect(invites[0]!.requesterId).toBe(requesterId);
    expect(invites[0]!.status).toBe("sent");

    // A CSAT survey was auto-created and is active.
    const [csat] = await testDb()
      .select()
      .from(surveys)
      .where(and(eq(surveys.orgId, orgId), eq(surveys.type, "csat")));
    expect(csat).toBeTruthy();
    expect(csat!.status).toBe("active");

    // In-app notification landed for the requester.
    const notes = await testDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, requesterId)));
    expect(notes.some((n) => n.title.includes(ticket.number))).toBe(true);
  });

  it("does not create a second invite when the same ticket is resolved again", async () => {
    const ticket = await createAndResolveTicket();
    expect((await invitesForOrg()).length).toBe(1);

    // Re-open then re-resolve the same ticket.
    await caller(adminId).tickets.update({
      id: ticket.id,
      data: { statusId: seeded.statusOpenId! },
    });
    await caller(adminId).tickets.update({
      id: ticket.id,
      data: { statusId: seeded.statusResolvedId! },
    });

    // Still one invite (one-response-per-ticket invariant).
    expect((await invitesForOrg()).length).toBe(1);
  });

  it("suppression window blocks a second invite for the same requester", async () => {
    // Default window is 24h; first resolve surveys the requester.
    await createAndResolveTicket("Ticket A");
    expect((await invitesForOrg()).length).toBe(1);

    // Resolve a DIFFERENT ticket for the same requester within the window → suppressed.
    await createAndResolveTicket("Ticket B");
    expect((await invitesForOrg()).length).toBe(1);
  });

  it("suppressionWindowHours=0 disables the window (per-ticket invites still fire)", async () => {
    await caller(adminId).surveys.updateCsatSettings({ suppressionWindowHours: 0 });

    await createAndResolveTicket("Ticket A");
    await createAndResolveTicket("Ticket B");

    // Two distinct tickets, no suppression window ⇒ two invites.
    expect((await invitesForOrg()).length).toBe(2);
  });

  it("config enabled=false suppresses the invite entirely", async () => {
    await caller(adminId).surveys.updateCsatSettings({ enabled: false });
    await createAndResolveTicket();
    expect((await invitesForOrg()).length).toBe(0);
  });

  it("channel=in_app creates an invite but passes no email address", async () => {
    await caller(adminId).surveys.updateCsatSettings({ channel: "in_app" });

    await createAndResolveTicket();

    expect((await invitesForOrg()).length).toBe(1);
    // Notification fired, but with no email address (in_app only).
    const csatCall = sendNotificationSpy.mock.calls.find(([p]) =>
      String(p?.title ?? "").startsWith("Rate your ticket experience"),
    );
    expect(csatCall).toBeTruthy();
    expect(csatCall![1]).toBeUndefined();
  });

  it("channel=both passes the requester's email address", async () => {
    await caller(adminId).surveys.updateCsatSettings({ channel: "both" });

    await createAndResolveTicket();

    const csatCall = sendNotificationSpy.mock.calls.find(([p]) =>
      String(p?.title ?? "").startsWith("Rate your ticket experience"),
    );
    expect(csatCall).toBeTruthy();
    expect(typeof csatCall![1]).toBe("string");
    expect(csatCall![1]).toContain("@");
  });

  it("no requester ⇒ no invite (service returns no_requester)", async () => {
    const res = await triggerCsatForResolvedTicket(testDb(), {
      orgId,
      createdById: adminId,
      ticket: { id: randomUUID(), number: "TKT-999", title: "Orphan", requesterId: null },
    });
    expect(res.triggered).toBe(false);
    expect(res.reason).toBe("no_requester");
    expect((await invitesForOrg()).length).toBe(0);
  });

  it("submitting a response records it and flips the invite (mirrors public handler)", async () => {
    await createAndResolveTicket();
    const [invite] = await invitesForOrg();
    expect(invite).toBeTruthy();

    // Simulate the public POST /public/surveys/:token/submit DB effects.
    const db = testDb();
    await db.transaction(async (tx) => {
      await tx.insert(surveyResponses).values({
        surveyId: invite!.surveyId,
        respondentId: invite!.requesterId,
        score: "5",
        comments: "Great",
        answers: {},
      });
      await tx
        .update(surveyInvites)
        .set({ status: "submitted", submittedAt: new Date() })
        .where(eq(surveyInvites.id, invite!.id));
    });

    const [refreshed] = await db
      .select()
      .from(surveyInvites)
      .where(eq(surveyInvites.id, invite!.id));
    expect(refreshed!.status).toBe("submitted");

    const responses = await db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.surveyId, invite!.surveyId));
    expect(responses.length).toBe(1);
    expect(Number(responses[0]!.score)).toBe(5);
  });

  it("dashboard + report CSAT is org-scoped and type-filtered (D1 regression guard)", async () => {
    // Requester's ticket → CSAT invite; submit a score of 5.
    await createAndResolveTicket();
    const [invite] = await invitesForOrg();
    const db = testDb();
    await db.insert(surveyResponses).values({
      surveyId: invite!.surveyId,
      respondentId: requesterId,
      score: "5",
      comments: null,
      answers: {},
    });

    // Seed a NON-csat survey response in the same org with a wildly different score.
    // A type-filtered aggregation must ignore it.
    const [nps] = await db
      .insert(surveys)
      .values({ orgId, title: "NPS", type: "nps", status: "active", questions: [], createdById: adminId })
      .returning();
    await db.insert(surveyResponses).values({
      surveyId: nps!.id,
      respondentId: requesterId,
      score: "1",
      comments: null,
      answers: {},
    });

    // Seed a SECOND org with a csat response — must not leak into org one's figure.
    const other = await seedFullOrg();
    const [otherCsat] = await db
      .insert(surveys)
      .values({ orgId: other.orgId, title: "CSAT", type: "csat", status: "active", questions: [], createdById: other.adminId })
      .returning();
    await db.insert(surveyResponses).values({
      surveyId: otherCsat!.id,
      respondentId: other.requesterId,
      score: "1",
      comments: null,
      answers: {},
    });

    try {
      const metrics = await caller(adminId).dashboard.getMetrics();
      // Only this org's single csat score of 5 should count.
      expect(metrics.csatResponses).toBe(1);
      expect(metrics.csatScore).toBe(5);

      const overview = await caller(adminId).reports.executiveOverview({ days: 30 });
      expect(overview.csatScore).toBe("5.0/5");
    } finally {
      await db.delete(notifications).where(eq(notifications.orgId, other.orgId));
      await db.delete(csatSettings).where(eq(csatSettings.orgId, other.orgId));
      await cleanupOrg(other.orgId);
    }
  });
});
