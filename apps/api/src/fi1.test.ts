import { describe, it, expect } from "vitest";
import { getDb, itomEvents, tickets, itomCorrelationPolicies, organizations, users, eq, and, desc } from "@coheronconnect/db";
import { appRouter } from "./routers";

describe("ITSM F-I1: Duplicate incidents on repeating alert", () => {
  it("should dedup active events and allow new events after resolution", async () => {
    const db = getDb();
    
    // 1. Seed org
    const orgs = await db.insert(organizations).values({
      name: "Test Org F-I1",
      slug: `test-org-fi1-${Date.now()}`,
    }).returning({ id: organizations.id });
    const orgId = orgs[0].id;

    // Seed admin user
    const insertedUsers = await db.insert(users).values({
      name: "Admin",
      email: `admin-${Date.now()}@example.com`,
      orgId,
      role: "admin",
    }).returning({ id: users.id });
    const userId = insertedUsers[0].id;
    
    // 2. Create correlation policy
    await db.insert(itomCorrelationPolicies).values({
      orgId,
      name: "Critical Disk Usage",
      condition: "severity = critical",
      action: "create_incident",
      active: true,
    });

    // Create tRPC caller for events.ingest
    const caller = appRouter.createCaller({ 
      db, 
      org: { id: orgId, name: "Test Org", slug: "test" } as any, 
      user: { id: userId, role: "admin" } as any,
      session: { user: { id: userId } } as any, 
      req: null as any, 
      res: null as any,
      requestId: "test-req",
      ipAddress: "127.0.0.1",
      sessionId: "test-session",
    } as any);

    // 3. Ingest first critical event
    const node = `db-prod-01-${Date.now()}`;
    const metric = "disk_usage";
    
    await caller.events.ingest({
      node,
      metric,
      severity: "critical",
    });
    
    // Verify Event #1 & Incident #1 created
    let events = await db.select().from(itomEvents).where(and(eq(itomEvents.orgId, orgId), eq(itomEvents.node, node)));
    expect(events.length).toBe(1);
    expect(events[0].state).toBe("in_progress");
    expect(events[0].count).toBe(1);
    expect(events[0].linkedIncidentId).toBeDefined();
    
    const incident1Id = events[0].linkedIncidentId;
    let incident1 = await db.select().from(tickets).where(eq(tickets.id, incident1Id!));
    expect(incident1.length).toBe(1);

    // 4. Ingest identical event (flapping)
    await caller.events.ingest({
      node,
      metric,
      severity: "critical",
    });

    // Verify exactly one event, count=2
    events = await db.select().from(itomEvents).where(and(eq(itomEvents.orgId, orgId), eq(itomEvents.node, node)));
    expect(events.length).toBe(1);
    expect(events[0].count).toBe(2);
    expect(events[0].linkedIncidentId).toBe(incident1Id);

    // Verify exactly one incident still
    const allIncidents = await db.select().from(tickets).where(eq(tickets.orgId, orgId));
    expect(allIncidents.length).toBe(1);

    // 5. Resolve incident / Close event
    await db.update(itomEvents).set({ state: "resolved" }).where(eq(itomEvents.id, events[0].id));
    
    // 6. Ingest identical event 3 hours later
    await caller.events.ingest({
      node,
      metric,
      severity: "critical",
    });

    // Verify new event and new incident created
    events = await db.select().from(itomEvents).where(and(eq(itomEvents.orgId, orgId), eq(itomEvents.node, node))).orderBy(desc(itomEvents.createdAt));
    expect(events.length).toBe(2);
    expect(events[0].state).toBe("in_progress");
    expect(events[0].count).toBe(1);
    expect(events[0].linkedIncidentId).toBeDefined();
    expect(events[0].linkedIncidentId).not.toBe(incident1Id);
    
    const allIncidentsAfter = await db.select().from(tickets).where(eq(tickets.orgId, orgId));
    expect(allIncidentsAfter.length).toBe(2);
    
    console.log("F-I1 Verification Complete!");
    console.log("1. Original incident created.");
    console.log("2. Flapping event successfully deduplicated, count bumped to 2. No second incident.");
    console.log("3. Event resolved.");
    console.log("4. New event created new incident as expected.");
  });
});
