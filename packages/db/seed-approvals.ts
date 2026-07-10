import { getDb } from "./src";
import { approvalRequests, orgs, users } from "./src/schema";
import { eq } from "drizzle-orm";

async function seed() {
  const db = getDb();
  const [org] = await db.select().from(orgs).limit(1);
  if (!org) {
    console.log("No org found");
    return;
  }

  const [user] = await db.select().from(users).limit(1);
  if (!user) {
    console.log("No user found");
    return;
  }

  console.log(`Seeding approvals for org ${org.id} and user ${user.id}`);

  await db.insert(approvalRequests).values([
    {
      orgId: org.id,
      requesterId: user.id,
      approverId: user.id,
      status: "pending",
      title: "Server Procurement - DB Cluster",
      description: "Requesting $5,000 for new database cluster nodes.",
      priority: "high",
      type: "purchase",
      amount: "$5,000.00",
      number: "REQ-001001",
      createdAt: new Date(),
    },
    {
      orgId: org.id,
      requesterId: user.id,
      approverId: user.id,
      status: "pending",
      title: "Emergency Security Patch Deployment",
      description: "Critical CVE requires immediate patching of production servers.",
      priority: "urgent",
      type: "change",
      number: "CHG-00204",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
      createdAt: new Date(),
    },
    {
      orgId: org.id,
      requesterId: user.id,
      approverId: user.id,
      status: "approved",
      title: "Access to AWS Production",
      description: "Need read-only access to investigate production logs.",
      priority: "normal",
      type: "access",
      number: "ACC-0912",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
    {
      orgId: org.id,
      requesterId: user.id,
      approverId: user.id,
      status: "rejected",
      title: "Software License for Figma",
      description: "Requesting Figma Enterprise license.",
      priority: "normal",
      type: "service_request",
      number: "SR-8100",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    }
  ]);

  console.log("Done seeding approvals.");
  process.exit(0);
}

seed().catch(console.error);
