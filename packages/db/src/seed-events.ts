import { faker } from "@faker-js/faker";
import { itomEvents, itomSuppressionRules, itomCorrelationPolicies, organizations, users, tickets } from "./schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

export async function seedEvents(db: NodePgDatabase<typeof schema>) {
  console.log("🌱 Seeding IT Operations (Events, Rules, Policies)...");

  const orgs = await db.select().from(organizations).limit(1);
  if (orgs.length === 0) return;
  const orgId = orgs[0]!.id;

  const adminUser = await db.select().from(users).where(eq(users.email, "admin@coheron.com")).limit(1);
  const createdBy = adminUser[0]?.id;

  const allTickets = await db.select().from(tickets).where(eq(tickets.orgId, orgId)).limit(10);

  // 1. Suppression Rules
  await db.insert(itomSuppressionRules).values([
    {
      orgId,
      name: "Ignore Debug Logs",
      condition: "source = 'debug' AND severity = 'info'",
      active: true,
      createdBy,
    },
    {
      orgId,
      name: "Maintenance Window - DB cluster",
      condition: "node LIKE 'db-%' AND state = 'maintenance'",
      suppressUntil: new Date(Date.now() + 86400000),
      active: true,
      createdBy,
    },
  ]);

  // 2. Correlation Policies
  await db.insert(itomCorrelationPolicies).values([
    {
      orgId,
      name: "High CPU Alert Grouping",
      condition: "metric = 'cpu_usage' AND count > 5",
      action: "create_incident",
      active: true,
    },
    {
      orgId,
      name: "Flapping Service Suppression",
      condition: "state = 'flapping' AND count > 10",
      action: "suppress",
      active: true,
    },
  ]);

  // 3. Events
  const eventNodes = ["web-server-01", "db-cluster-prod", "api-gateway-01", "redis-cache-01", "lb-primary"];
  const metrics = ["cpu_usage", "memory_leak", "disk_full", "high_latency", "service_down", "ssl_expiry"];

  const sampleEvents = [];
  for (let i = 0; i < 20; i++) {
    const severity = faker.helpers.arrayElement(["critical", "major", "minor", "warning", "info", "clear"]);
    const state = faker.helpers.arrayElement(["open", "in_progress", "resolved", "suppressed", "flapping"]);
    const node = faker.helpers.arrayElement(eventNodes);
    const metric = faker.helpers.arrayElement(metrics);

    sampleEvents.push({
      orgId,
      node,
      metric,
      severity,
      state,
      value: `${faker.number.int({ min: 80, max: 100 })}%`,
      threshold: "90%",
      source: faker.helpers.arrayElement(["Nagios", "Prometheus", "Datadog", "AWS CloudWatch"]),
      count: faker.number.int({ min: 1, max: 100 }),
      aiRootCause: severity === "critical" ? `Detected anomalous ${metric} pattern on ${node} following a code deployment.` : null,
      linkedIncidentId: (severity === "critical" || severity === "major") && allTickets.length > 0 ? faker.helpers.arrayElement(allTickets).id : null,
      firstOccurrence: faker.date.recent({ days: 7 }),
      lastOccurrence: new Date(),
    });
  }

  await db.insert(itomEvents).values(sampleEvents);

  console.log("✅ IT Operations seeding complete.");
}
