/**
 * ITOM suppression + correlation engine (Sprint 3.4b).
 *
 * Fires the "stored-but-never-evaluated" ITOM automation loop: the ingest
 * endpoint dedups events and runs suppression + correlation; the periodic
 * sweeper (sweepCorrelation) catches events that arrived before their policy.
 *
 * Invariants asserted:
 *   • ingest dedups: a repeat (node,metric) bumps count on ONE row;
 *   • an active suppression rule flips a matching event to 'suppressed';
 *   • a create_incident policy creates exactly one linked incident and is
 *     idempotent on a re-sweep;
 *   • a non-matching policy creates no incident;
 *   • suppression short-circuits correlation.
 *
 * The sweep is global; each test seeds a fresh org and clears ITOM tables.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { seedFullOrg, testDb, makeContext } from "./helpers";
import { appRouter } from "../routers";
import {
  itomEvents,
  itomSuppressionRules,
  itomCorrelationPolicies,
  tickets,
} from "@coheronconnect/db";
import { sweepCorrelation } from "../workflows/correlationWorkflow";

describe("ITOM correlation engine (Sprint 3.4b)", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    await testDb().execute(sql`DELETE FROM itom_events`);
    await testDb().execute(sql`DELETE FROM itom_suppression_rules`);
    await testDb().execute(sql`DELETE FROM itom_correlation_policies`);
    const seeded = await seedFullOrg();
    orgId = seeded.orgId;
    adminId = seeded.adminId;
  });

  function caller() {
    return appRouter.createCaller(makeContext(adminId, orgId));
  }

  async function eventsForOrg() {
    return testDb().select().from(itomEvents).where(eq(itomEvents.orgId, orgId));
  }

  async function incidentsForOrg() {
    return testDb()
      .select()
      .from(tickets)
      .where(and(eq(tickets.orgId, orgId), eq(tickets.type, "incident")));
  }

  it("dedups repeat events on the same (node, metric)", async () => {
    const c = caller();
    const r1 = await c.events.ingest({ node: "db-01", metric: "cpu_load", severity: "warning" });
    expect(r1.count).toBe(1);
    expect(r1.deduped).toBe(false);

    const r2 = await c.events.ingest({ node: "db-01", metric: "cpu_load", severity: "critical" });
    expect(r2.count).toBe(2);
    expect(r2.deduped).toBe(true);
    expect(r2.eventId).toBe(r1.eventId);

    const rows = await eventsForOrg();
    expect(rows.length).toBe(1);
    expect(rows[0]!.count).toBe(2);
  });

  it("suppresses a matching event via an active suppression rule", async () => {
    await testDb().insert(itomSuppressionRules).values({
      orgId,
      name: "Mute web-01 cpu",
      condition: "node = web-01 AND metric = cpu_load",
      active: true,
    });

    const r = await caller().events.ingest({ node: "web-01", metric: "cpu_load", severity: "critical" });
    expect(r.suppressed).toBe(true);
    expect(r.incidentId).toBeNull();

    const rows = await eventsForOrg();
    expect(rows[0]!.state).toBe("suppressed");
    // Suppression short-circuits correlation → no incident.
    expect((await incidentsForOrg()).length).toBe(0);
  });

  it("expired suppression rule does not suppress", async () => {
    await testDb().insert(itomSuppressionRules).values({
      orgId,
      name: "Expired mute",
      condition: "node = web-01",
      active: true,
      suppressUntil: new Date(Date.now() - 60_000),
    });

    const r = await caller().events.ingest({ node: "web-01", metric: "cpu_load", severity: "warning" });
    expect(r.suppressed).toBe(false);
    const rows = await eventsForOrg();
    expect(rows[0]!.state).toBe("open");
  });

  it("create_incident policy creates exactly one linked incident and is idempotent", async () => {
    await testDb().insert(itomCorrelationPolicies).values({
      orgId,
      name: "Critical → incident",
      condition: "severity = critical",
      action: "create_incident",
      active: true,
    });

    const r = await caller().events.ingest({ node: "db-01", metric: "disk_usage", severity: "critical" });
    expect(r.suppressed).toBe(false);
    expect(r.incidentId).toBeTruthy();

    const incidents = await incidentsForOrg();
    expect(incidents.length).toBe(1);
    expect(incidents[0]!.id).toBe(r.incidentId);

    const [ev] = await eventsForOrg();
    expect(ev!.linkedIncidentId).toBe(r.incidentId);
    expect(ev!.state).toBe("in_progress");

    // Re-sweeping must NOT create a second incident (event already linked, and
    // the sweep only claims linked_incident_id IS NULL anyway).
    const sweep = await sweepCorrelation(testDb());
    expect(sweep.incidentsCreated).toBe(0);
    expect((await incidentsForOrg()).length).toBe(1);
  });

  it("non-matching policy creates no incident", async () => {
    await testDb().insert(itomCorrelationPolicies).values({
      orgId,
      name: "Only criticals",
      condition: "severity = critical",
      action: "create_incident",
      active: true,
    });

    const r = await caller().events.ingest({ node: "db-01", metric: "mem", severity: "info" });
    expect(r.incidentId).toBeNull();
    expect((await incidentsForOrg()).length).toBe(0);
  });

  it("sweeper picks up an event whose policy was added after arrival", async () => {
    // Event arrives with no policy → stays open, unlinked.
    const r = await caller().events.ingest({ node: "cache-01", metric: "evictions", severity: "critical" });
    expect(r.incidentId).toBeNull();
    expect((await incidentsForOrg()).length).toBe(0);

    // Policy added later.
    await testDb().insert(itomCorrelationPolicies).values({
      orgId,
      name: "Critical → incident",
      condition: "severity = critical",
      action: "create_incident",
      active: true,
    });

    const sweep = await sweepCorrelation(testDb());
    expect(sweep.incidentsCreated).toBe(1);

    const incidents = await incidentsForOrg();
    expect(incidents.length).toBe(1);
    const [ev] = await eventsForOrg();
    expect(ev!.linkedIncidentId).toBe(incidents[0]!.id);
  });

  it("malformed policy condition is skipped, not crashing the sweep", async () => {
    await testDb().insert(itomCorrelationPolicies).values({
      orgId,
      name: "Broken",
      condition: "this is not a valid condition",
      action: "create_incident",
      active: true,
    });

    // Should not throw; no incident created.
    const r = await caller().events.ingest({ node: "x", metric: "y", severity: "critical" });
    expect(r.incidentId).toBeNull();
    expect((await incidentsForOrg()).length).toBe(0);
  });
});
