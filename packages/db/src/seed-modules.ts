/**
 * Seed cross-module demo data for NexusOps using Faker.js
 * Assumes the base org, users, and ticket config already exist.
 * Run this AFTER the main seed.ts if org already exists.
 */
import { getDb } from "./client";
import {
  organizations, users,
  changeRequests, problems, risks, securityIncidents, vulnerabilities,
  contracts, projects, projectTasks,
  crmAccounts, crmDeals, crmLeads,
  legalMatters, pipelineRuns, deployments, surveys, budgetLines,
  kbArticles, vendors, purchaseRequests, oncallSchedules, catalogItems,
  buildings, rooms, applications,
  eq, and, count,
} from "./schema";
import { faker } from "@faker-js/faker";

faker.seed(54321);

const DEMO_ORG_SLUG = "coheron-demo";
const NOW = new Date();
const d = (days: number) => new Date(NOW.getTime() + days * 86400000);

function cntFrom(rows: { cnt: unknown }[]): number {
  return Number(rows[0]?.cnt ?? 0);
}

async function seedModules() {
  const db = getDb();
  console.log("🌱 Seeding dynamic module data for NexusOps...\n");

  // ── Get existing org & users ───────────────────────────────────────────────
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (!org) { console.error("❌ Org not found. Run seed.ts first."); process.exit(1); }

  const allUsers = await db.select().from(users).where(eq(users.orgId, org.id));
  const admin = allUsers.find((u) => u.role === "owner") ?? allUsers[0]!;
  const agents = allUsers.filter((u) => u.role === "member");
  const agent1 = agents[0] ?? admin;
  const agent2 = agents[1] ?? admin;
  console.log(`✅ Using org: ${org.name}, ${allUsers.length} users`);

  // ── Change Requests (20 Generated) ──────────────────────────────────────────
  const chgCnt = cntFrom(await db.select({ cnt: count() }).from(changeRequests).where(eq(changeRequests.orgId, org.id)));
  if (chgCnt === 0) {
    const changeSeeds = Array.from({ length: 20 }).map((_, i) => ({
      orgId: org.id,
      number: `CHG-${String(i + 1).padStart(4, "0")}`,
      title: `${faker.hacker.verb()} ${faker.hacker.adjective()} ${faker.hacker.noun()}`,
      type: faker.helpers.arrayElement(["normal", "standard", "emergency"]),
      risk: faker.helpers.arrayElement(["low", "medium", "high"]),
      status: faker.helpers.arrayElement(["draft", "cab_review", "approved", "scheduled", "implementing", "completed"]),
      requesterId: faker.helpers.arrayElement(allUsers).id,
      assigneeId: faker.datatype.boolean() ? faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]) : undefined,
      scheduledStart: faker.datatype.boolean() ? d(faker.number.int({ min: -5, max: 30 })) : undefined,
      scheduledEnd: faker.datatype.boolean() ? d(faker.number.int({ min: 31, max: 60 })) : undefined,
      rollbackPlan: faker.datatype.boolean() ? "Restore from backup" : null,
    }));
    await db.insert(changeRequests).values(changeSeeds);
    console.log(`✅ Change requests: ${changeSeeds.length}`);
  } else {
    console.log(`ℹ️  Change requests already exist (${String(chgCnt)}), skipping`);
  }

  // ── Problems (15 Generated) ───────────────────────────────────────────────
  const prbCnt = cntFrom(await db.select({ cnt: count() }).from(problems).where(eq(problems.orgId, org.id)));
  if (prbCnt === 0) {
    const problemSeeds = Array.from({ length: 15 }).map((_, i) => ({
      orgId: org.id,
      number: `PRB-${String(i + 1).padStart(4, "0")}`,
      title: `Recurring ${faker.hacker.adjective()} ${faker.hacker.noun()} failures`,
      status: faker.helpers.arrayElement(["investigation", "root_cause_identified", "known_error", "resolved"]),
      priority: faker.helpers.arrayElement(["low", "medium", "high", "critical"]),
      assigneeId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
      rootCause: faker.datatype.boolean() ? faker.company.catchPhrase() : null,
      workaround: faker.datatype.boolean() ? "Restart the service" : null,
    }));
    await db.insert(problems).values(problemSeeds);
    console.log(`✅ Problems: ${problemSeeds.length}`);
  }

  // ── Security ───────────────────────────────────────────────────────────────
  const secCnt = cntFrom(await db.select({ cnt: count() }).from(securityIncidents).where(eq(securityIncidents.orgId, org.id)));
  if (secCnt === 0) {
    const secIncidents = Array.from({ length: 20 }).map((_, i) => ({
      orgId: org.id,
      number: `SEC-${String(i + 1).padStart(4, "0")}`,
      title: `${faker.hacker.ingverb()} attempt on ${faker.hacker.noun()}`,
      severity: faker.helpers.arrayElement(["low", "medium", "high", "critical"]),
      status: faker.helpers.arrayElement(["triage", "containment", "eradication", "recovery", "closed"]),
      assigneeId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
      reporterId: faker.helpers.arrayElement(allUsers).id,
      attackVector: faker.helpers.arrayElement(["Email", "API", "Web", "USB", "Insider"]),
    }));
    await db.insert(securityIncidents).values(secIncidents);

    const vulns = Array.from({ length: 20 }).map((_, i) => ({
      orgId: org.id,
      cveId: `CVE-202${faker.number.int({ min: 0, max: 4 })}-${faker.number.int({ min: 1000, max: 9999 })}`,
      title: `${faker.hacker.noun()} Vulnerability`,
      severity: faker.helpers.arrayElement(["low", "medium", "high", "critical"]),
      cvssScore: faker.finance.amount({ min: 4, max: 10, dec: 1 }),
      status: faker.helpers.arrayElement(["open", "in_progress", "remediated", "accepted"]),
      assigneeId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
      remediatedAt: faker.datatype.boolean() ? d(faker.number.int({ min: -30, max: -1 })) : null,
    }));
    await db.insert(vulnerabilities).values(vulns);
    console.log(`✅ Security: ${secIncidents.length} incidents, ${vulns.length} vulns`);
  }

  // ── GRC Risks ──────────────────────────────────────────────────────────────
  const rskCnt = cntFrom(await db.select({ cnt: count() }).from(risks).where(eq(risks.orgId, org.id)));
  if (rskCnt === 0) {
    const risksSeeds = Array.from({ length: 20 }).map((_, i) => {
      const likelihood = faker.number.int({ min: 1, max: 5 });
      const impact = faker.number.int({ min: 1, max: 5 });
      return {
        orgId: org.id,
        number: `RK-${String(i + 1).padStart(4, "0")}`,
        title: `Risk of ${faker.hacker.ingverb()} ${faker.hacker.noun()}`,
        category: faker.helpers.arrayElement(["technology", "compliance", "operational", "strategic"]),
        likelihood,
        impact,
        riskScore: likelihood * impact,
        status: faker.helpers.arrayElement(["identified", "assessed", "mitigating", "accepted", "closed"]),
        treatment: faker.helpers.arrayElement(["mitigate", "accept", "transfer", "avoid"]),
        ownerId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
      };
    });
    await db.insert(risks).values(risksSeeds);
    console.log(`✅ GRC risks: ${risksSeeds.length}`);
  }

  // ── Budget Lines ───────────────────────────────────────────────────────────
  const budgCnt = cntFrom(await db.select({ cnt: count() }).from(budgetLines).where(eq(budgetLines.orgId, org.id)));
  if (budgCnt === 0) {
    const budgetSeeds = Array.from({ length: 10 }).map(() => {
      const budgeted = faker.number.int({ min: 50000, max: 2000000 });
      const committed = faker.number.int({ min: 10000, max: budgeted });
      const actual = faker.number.int({ min: 10000, max: committed });
      return {
        orgId: org.id,
        category: faker.helpers.arrayElement(["Infrastructure", "Software Licenses", "Personnel", "Marketing", "Professional Services", "Facilities"]),
        department: faker.helpers.arrayElement(["IT", "Engineering", "Marketing", "Legal", "Sales", "HR"]),
        fiscalYear: 2025,
        budgeted: String(budgeted),
        committed: String(committed),
        actual: String(actual),
        forecast: String(faker.number.int({ min: actual, max: budgeted * 1.2 })),
      };
    });
    await db.insert(budgetLines).values(budgetSeeds);
    console.log(`✅ Budget lines: ${budgetSeeds.length}`);
  }

  // ── Contracts ──────────────────────────────────────────────────────────────
  const cntrCnt = cntFrom(await db.select({ cnt: count() }).from(contracts).where(eq(contracts.orgId, org.id)));
  if (cntrCnt === 0) {
    const contractSeeds = Array.from({ length: 15 }).map((_, i) => ({
      orgId: org.id,
      contractNumber: `CNTR-${String(i + 1).padStart(4, "0")}`,
      title: `${faker.company.name()} Agreement`,
      counterparty: faker.company.name(),
      type: faker.helpers.arrayElement(["vendor", "license", "msa", "nda", "sla_support"]),
      status: faker.helpers.arrayElement(["draft", "under_review", "active", "expiring_soon", "expired", "terminated"]),
      value: faker.finance.amount({ min: 0, max: 500000, dec: 0 }),
      startDate: d(faker.number.int({ min: -500, max: 0 })),
      endDate: d(faker.number.int({ min: 10, max: 1000 })),
      autoRenew: faker.datatype.boolean(),
      internalOwnerId: faker.helpers.arrayElement(allUsers).id,
    }));
    await db.insert(contracts).values(contractSeeds);
    console.log(`✅ Contracts: ${contractSeeds.length}`);
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  const prjCnt = cntFrom(await db.select({ cnt: count() }).from(projects).where(eq(projects.orgId, org.id)));
  if (prjCnt === 0) {
    const projectData = await db.insert(projects).values(
      Array.from({ length: 10 }).map((_, i) => ({
        orgId: org.id,
        number: `PRJ-${String(i + 1).padStart(4, "0")}`,
        name: `${faker.company.catchPhrase()} Initiative`,
        status: faker.helpers.arrayElement(["planning", "active", "on_hold", "completed", "cancelled"]),
        health: faker.helpers.arrayElement(["green", "amber", "red"]),
        budgetTotal: faker.finance.amount({ min: 50000, max: 2000000, dec: 0 }),
        budgetSpent: faker.finance.amount({ min: 0, max: 1000000, dec: 0 }),
        startDate: d(faker.number.int({ min: -90, max: 30 })),
        endDate: d(faker.number.int({ min: 31, max: 365 })),
        ownerId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
        department: faker.helpers.arrayElement(["IT", "Security", "HR", "Finance", "Sales"]),
      }))
    ).returning();

    const taskSeeds = projectData.flatMap(p => 
      Array.from({ length: faker.number.int({ min: 3, max: 8 }) }).map(() => ({
        projectId: p.id,
        title: `${faker.hacker.verb()} ${faker.hacker.noun()}`,
        status: faker.helpers.arrayElement(["todo", "in_progress", "in_review", "done"]),
        priority: faker.helpers.arrayElement(["low", "medium", "high", "critical"]),
        assigneeId: faker.helpers.arrayElement(allUsers).id,
      }))
    );
    await db.insert(projectTasks).values(taskSeeds);
    console.log(`✅ Projects: ${projectData.length} with ${taskSeeds.length} tasks`);
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  const crmCnt = cntFrom(await db.select({ cnt: count() }).from(crmAccounts).where(eq(crmAccounts.orgId, org.id)));
  if (crmCnt === 0) {
    const crmAccountData = await db.insert(crmAccounts).values(
      Array.from({ length: 15 }).map(() => ({
        orgId: org.id,
        name: faker.company.name(),
        industry: faker.helpers.arrayElement(["Technology", "Retail", "Financial Services", "Healthcare", "Manufacturing"]),
        tier: faker.helpers.arrayElement(["enterprise", "mid_market", "smb"]),
        healthScore: faker.number.int({ min: 10, max: 100 }),
        annualRevenue: faker.finance.amount({ min: 1000000, max: 1000000000, dec: 0 }),
        ownerId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
      }))
    ).returning();

    const dealData = await db.insert(crmDeals).values(
      Array.from({ length: 30 }).map(() => {
        const value = faker.number.int({ min: 5000, max: 500000 });
        const prob = faker.number.int({ min: 0, max: 100 });
        return {
          orgId: org.id,
          title: `${faker.company.catchPhraseAdjective()} Expansion`,
          accountId: faker.helpers.arrayElement(crmAccountData).id,
          stage: faker.helpers.arrayElement(["prospect", "qualification", "proposal", "negotiation", "verbal_commit", "closed_won", "closed_lost"]),
          value: String(value),
          probability: prob,
          weightedValue: String((value * prob) / 100),
          expectedClose: d(faker.number.int({ min: -30, max: 120 })),
          ownerId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
        };
      })
    ).returning();

    await db.insert(crmLeads).values(
      Array.from({ length: 25 }).map(() => ({
        orgId: org.id,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        company: faker.company.name(),
        source: faker.helpers.arrayElement(["website", "referral", "event", "cold_outreach", "partner"]),
        score: faker.number.int({ min: 0, max: 100 }),
        status: faker.helpers.arrayElement(["new", "contacted", "qualified", "disqualified", "converted"]),
        ownerId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
      }))
    );
    console.log(`✅ CRM: ${crmAccountData.length} accounts, ${dealData.length} deals`);
  }

  // ── Legal ──────────────────────────────────────────────────────────────────
  const legCnt = cntFrom(await db.select({ cnt: count() }).from(legalMatters).where(eq(legalMatters.orgId, org.id)));
  if (legCnt === 0) {
    await db.insert(legalMatters).values(
      Array.from({ length: 10 }).map((_, i) => ({
        orgId: org.id,
        matterNumber: `MAT-${String(i + 1).padStart(4, "0")}`,
        title: `${faker.company.name()} Dispute`,
        type: faker.helpers.arrayElement(["litigation", "employment", "ip", "data_privacy", "corporate", "commercial"]),
        status: faker.helpers.arrayElement(["intake", "active", "discovery", "pre_trial", "closed", "settled"]),
        assignedTo: faker.helpers.arrayElement([admin.id, agent1.id]),
        confidential: faker.datatype.boolean(),
        estimatedCost: faker.finance.amount({ min: 5000, max: 100000, dec: 0 }),
      }))
    );
    console.log("✅ Legal matters: 10");
  }

  // ── DevOps ─────────────────────────────────────────────────────────────────
  const devCnt = cntFrom(await db.select({ cnt: count() }).from(pipelineRuns).where(eq(pipelineRuns.orgId, org.id)));
  if (devCnt === 0) {
    const pipelineData = await db.insert(pipelineRuns).values(
      Array.from({ length: 20 }).map(() => ({
        orgId: org.id,
        pipelineName: faker.helpers.arrayElement(["nexusops-api", "nexusops-web", "nexusops-worker"]),
        trigger: faker.helpers.arrayElement(["push", "pr", "scheduled", "manual"]),
        branch: faker.helpers.arrayElement(["main", "feature/auth", "fix/bug"]),
        commitSha: faker.git.commitSha().substring(0, 7),
        status: faker.helpers.arrayElement(["success", "failed", "running", "cancelled"]),
        durationSeconds: faker.number.int({ min: 30, max: 600 }),
        completedAt: faker.datatype.boolean() ? d(faker.number.float({ min: -5, max: 0 })) : null,
      }))
    ).returning();

    await db.insert(deployments).values(
      Array.from({ length: 15 }).map(() => ({
        orgId: org.id,
        appName: faker.helpers.arrayElement(["nexusops-api", "nexusops-web", "nexusops-worker"]),
        environment: faker.helpers.arrayElement(["dev", "qa", "staging", "production"]),
        version: `v${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 9 })}.${faker.number.int({ min: 0, max: 9 })}`,
        status: faker.helpers.arrayElement(["pending", "in_progress", "success", "failed", "rolled_back"]),
        deployedById: faker.helpers.arrayElement(allUsers).id,
        pipelineRunId: faker.datatype.boolean() ? faker.helpers.arrayElement(pipelineData).id : null,
        durationSeconds: faker.number.int({ min: 10, max: 300 }),
      }))
    );
    console.log(`✅ DevOps: ${pipelineData.length} pipelines, 15 deployments`);
  }

  // ── Surveys ────────────────────────────────────────────────────────────────
  const srvCnt = cntFrom(await db.select({ cnt: count() }).from(surveys).where(eq(surveys.orgId, org.id)));
  if (srvCnt === 0) {
    await db.insert(surveys).values([
      { orgId: org.id, title: "Q4 Employee Pulse", type: "employee_pulse", status: "active", createdById: admin.id,
        questions: [{ id: "q1", type: "rating", question: "How satisfied are you with your work environment?", required: true }, { id: "q2", type: "nps", question: "How likely to recommend us as employer?", required: true }]
      },
      { orgId: org.id, title: "IT Service Desk CSAT", type: "csat", status: "active", createdById: agent1.id,
        questions: [{ id: "q1", type: "rating", question: "How satisfied with resolution?", required: true }, { id: "q2", type: "yes_no", question: "Resolved on first contact?", required: true }]
      },
    ]);
    console.log("✅ Surveys: 2");
  }

  // ── Knowledge Base ─────────────────────────────────────────────────────────
  const kbCnt = cntFrom(await db.select({ cnt: count() }).from(kbArticles).where(eq(kbArticles.orgId, org.id)));
  if (kbCnt === 0) {
    await db.insert(kbArticles).values(
      Array.from({ length: 15 }).map(() => ({
        orgId: org.id,
        title: `How to ${faker.hacker.verb()} your ${faker.hacker.noun()}`,
        content: `## ${faker.hacker.ingverb()}\n\n${faker.lorem.paragraphs(3)}`,
        categoryId: null,
        status: faker.helpers.arrayElement(["draft", "published", "archived"]),
        authorId: faker.helpers.arrayElement(allUsers).id,
        viewCount: faker.number.int({ min: 0, max: 1000 }),
        helpfulCount: faker.number.int({ min: 0, max: 500 }),
      }))
    );
    console.log("✅ KB articles: 15");
  }

  // ── On-Call ────────────────────────────────────────────────────────────────
  const ocCnt = cntFrom(await db.select({ cnt: count() }).from(oncallSchedules).where(eq(oncallSchedules.orgId, org.id)));
  if (ocCnt === 0) {
    await db.insert(oncallSchedules).values([{
      orgId: org.id, name: "IT Primary On-Call", team: "IT Operations", rotationType: "weekly",
      members: [
        { userId: agent1.id, name: agent1.name, phone: "+1-555-0101", email: agent1.email },
        { userId: agent2.id, name: agent2.name, phone: "+1-555-0102", email: agent2.email },
      ],
      escalationChain: [{ level: 1, userId: agent1.id, delayMinutes: 0 }, { level: 2, userId: admin.id, delayMinutes: 15 }]
    }]);
    console.log("✅ On-call schedule: 1");
  }

  // ── Catalog ────────────────────────────────────────────────────────────────
  const catCnt = cntFrom(await db.select({ cnt: count() }).from(catalogItems).where(eq(catalogItems.orgId, org.id)));
  if (catCnt === 0) {
    await db.insert(catalogItems).values([
      { orgId: org.id, name: "New Laptop Request", description: "Request a business laptop", category: "Hardware", approvalRequired: true, fulfillmentGroup: "IT Hardware", slaDays: 5, sortOrder: 1 },
      { orgId: org.id, name: "Software Access Request", description: "Request software access", category: "Software", approvalRequired: true, fulfillmentGroup: "IT Software", slaDays: 3, sortOrder: 2 },
      { orgId: org.id, name: "VPN Account Setup", description: "Set up VPN access", category: "Network", approvalRequired: false, fulfillmentGroup: "IT Network", slaDays: 1, sortOrder: 3 },
      { orgId: org.id, name: "Desk Booking", description: "Book a hot desk", category: "Facilities", approvalRequired: false, fulfillmentGroup: "Facilities", slaDays: 1, sortOrder: 4 },
      { orgId: org.id, name: "Training Enrollment", description: "Enroll in corporate training", category: "Learning", approvalRequired: true, fulfillmentGroup: "HR", slaDays: 7, sortOrder: 5 },
    ]);
    console.log("✅ Catalog items: 5");
  }

  // ── Facilities ─────────────────────────────────────────────────────────────
  const bldCnt = cntFrom(await db.select({ cnt: count() }).from(buildings).where(eq(buildings.orgId, org.id)));
  if (bldCnt === 0) {
    const buildingData = await db.insert(buildings).values([
      { orgId: org.id, name: "HQ - London", address: "1 Silicon Road, London EC1A 1BB", floors: 10, capacity: 500, status: "active" },
      { orgId: org.id, name: "NY Office", address: "123 Fifth Ave, New York NY 10011", floors: 4, capacity: 150, status: "active" },
    ]).returning();
    await db.insert(rooms).values([
      { buildingId: buildingData[0]!.id, name: "Boardroom A", floor: 8, capacity: 20, bookable: true, equipment: ["projector", "whiteboard", "video_conferencing"] },
      { buildingId: buildingData[0]!.id, name: "Meeting Room 401", floor: 4, capacity: 8, bookable: true, equipment: ["tv_screen", "whiteboard"] },
      { buildingId: buildingData[1]!.id, name: "NY Conference 1", floor: 2, capacity: 12, bookable: true, equipment: ["projector"] },
    ]);
    console.log("✅ Facilities: 2 buildings, 3 rooms");
  }

  // ── APM ─────────────────────────────────────────────────────────────────────
  const apmCnt = cntFrom(await db.select({ cnt: count() }).from(applications).where(eq(applications.orgId, org.id)));
  if (apmCnt === 0) {
    await db.insert(applications).values(
      Array.from({ length: 15 }).map(() => ({
        orgId: org.id,
        name: `${faker.company.name()} System`,
        category: faker.helpers.arrayElement(["CRM", "ERP", "Project Management", "HR", "Finance", "Internal Tool"]),
        lifecycle: faker.helpers.arrayElement(["evaluating", "investing", "sustaining", "harvesting", "retiring"]),
        healthScore: faker.number.int({ min: 20, max: 100 }),
        annualCost: faker.finance.amount({ min: 10000, max: 500000, dec: 0 }),
        usersCount: faker.number.int({ min: 10, max: 5000 }),
        cloudReadiness: faker.helpers.arrayElement(["cloud_native", "lift_shift", "replatform", "rearchitect", "retire"]),
        techDebtScore: faker.number.int({ min: 0, max: 100 }),
        ownerId: faker.helpers.arrayElement(allUsers).id,
        vendor: faker.company.name(),
      }))
    );
    console.log("✅ APM applications: 15");
  }

  // ── Vendors (extra check) ──────────────────────────────────────────────────
  const vndCnt = cntFrom(await db.select({ cnt: count() }).from(vendors).where(eq(vendors.orgId, org.id)));
  if (vndCnt === 0) {
    const vendorData = await db.insert(vendors).values(
      Array.from({ length: 10 }).map(() => ({
        orgId: org.id,
        name: faker.company.name(),
        contactEmail: faker.internet.email(),
        status: faker.helpers.arrayElement(["active", "inactive", "under_review", "blacklisted"]),
        rating: faker.finance.amount({ min: 1, max: 5, dec: 1 }),
        paymentTerms: faker.helpers.arrayElement(["Net 15", "Net 30", "Net 60", "Due on receipt"]),
      }))
    ).returning();

    await db.insert(purchaseRequests).values(
      Array.from({ length: 15 }).map((_, i) => ({
        orgId: org.id,
        number: `PR-${String(i + 1).padStart(4, "0")}`,
        title: `${faker.number.int({ min: 1, max: 50 })}x ${faker.commerce.product()}`,
        requesterId: faker.helpers.arrayElement(allUsers).id,
        totalAmount: faker.finance.amount({ min: 100, max: 50000, dec: 0 }),
        status: faker.helpers.arrayElement(["draft", "pending", "approved", "rejected", "ordered", "received"]),
        priority: faker.helpers.arrayElement(["low", "medium", "high"]),
        department: faker.helpers.arrayElement(["IT", "HR", "Sales", "Marketing", "Operations"]),
      }))
    );
    console.log(`✅ Vendors: ${vendorData.length}, PRs: 15`);
  }

  console.log("\n🎉 Module seed complete!");
  console.log(`   Admin: admin@coheron.com / demo1234!`);
  process.exit(0);
}

seedModules().catch((err) => {
  console.error("❌ Module seed failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
