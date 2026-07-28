import { describe, it, expect } from "vitest";
import { breachNotifySweep } from "./lib/dpdp-sweeps";
import { EmailDispatcher, setNotificationDispatcher, getNotificationDispatcher } from "./lib/notification-dispatcher";
import { getDb, dpdpNotificationArtifacts, dpdpBreachIncidents, organizations, eq } from "@coheronconnect/db";

describe("DPDP F-D2 Verification", () => {
  it("should use EmailDispatcher and create sent artifacts", async () => {
    // Ensure EmailDispatcher is set
    setNotificationDispatcher(new EmailDispatcher());
    expect(getNotificationDispatcher().constructor.name).toBe("EmailDispatcher");

    // Mock SMTP so it thinks it succeeded
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "2525";
    
    const db = getDb();
    
    // Seed an organization
    const orgs = await db.insert(organizations).values({
      name: "Test Org F-D2",
      slug: `test-org-fd2-${Date.now()}`,
    }).returning({ id: organizations.id });
    const orgId = orgs[0].id;
    
    // Seed a detected breach that is overdue for notification
    await db.insert(dpdpBreachIncidents).values({
      orgId,
      reference: `BR-${Date.now()}`,
      title: "Test Breach F-D2",
      severity: "high",
      status: "detected",
      notifyDueAt: new Date(Date.now() - 1000 * 60 * 60), // Due 1 hour ago
    });
    
    // Run sweep
    const result = await breachNotifySweep(db, orgId, { now: Date.now() });
    console.log("Sweep processed:", result.processedCount, "breaches");
    
    const artifacts = await db.select()
      .from(dpdpNotificationArtifacts)
      .where(eq(dpdpNotificationArtifacts.orgId, orgId));
      
    // Log them so they appear in vitest output
    console.log("Found notification artifacts:");
    artifacts.forEach(a => {
      console.log(`Artifact ID ${a.id}: status=${a.status}, audience=${a.audience}, channel=${a.channel}`);
    });
    
    // Validate the artifacts are sent emails
    expect(artifacts.length).toBeGreaterThan(0);
    const emailArtifacts = artifacts.filter(a => a.channel === "email" || a.channel === "board");
    expect(emailArtifacts.length).toBeGreaterThan(0);
    emailArtifacts.forEach(a => {
      expect(a.status).toBe("sent");
    });
  });
});
