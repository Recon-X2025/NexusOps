/**
 * Seed the NexusOps database with the Coheron Demo organization.
 * Creates all demo data needed for every module to render real content.
 */
import { getDb } from "./client";
import {
  organizations, users, roles, permissions, rolePermissions, userRoles,
  ticketCategories, ticketPriorities, ticketStatuses, assetTypes, tickets, assets, ciItems,
  changeRequests, changeApprovals, problems, risks, securityIncidents, vulnerabilities,
  contracts, contractObligations, projects, projectMilestones, projectTasks,
  crmAccounts, crmContacts, crmDeals, crmLeads, crmActivities,
  legalMatters, legalRequests, investigations,
  pipelineRuns, deployments, surveys, surveyResponses,
  budgetLines, chargebacks, kbArticles,
  vendors, purchaseRequests, purchaseOrders,
  oncallSchedules, catalogItems,
  buildings, rooms, facilityRequests,
  applications,
} from "./schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { faker } from "@faker-js/faker";

// Use a static seed for reproducible demo data
faker.seed(12345);

const DEMO_ORG_SLUG = "coheron-demo";
const NOW = new Date();
const d = (days: number) => new Date(NOW.getTime() + days * 86400000);

async function seed() {
  const db = getDb();
  console.log("🌱 Seeding NexusOps database with dynamic Faker data...");

  // ── Organization ───────────────────────────────────────────────────────────
  const [org] = await db.insert(organizations).values({
    name: "Coheron Demo", slug: DEMO_ORG_SLUG, plan: "professional", primaryColor: "#00BCFF",
  }).onConflictDoNothing().returning();

  const isNew = !!org;
  let seedOrg = org;
  if (!seedOrg) {
    // Org exists — fetch it and only update passwords
    const [existing] = await db.select().from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
    seedOrg = existing!;
    console.log(`ℹ️  Org already exists: ${seedOrg.name} (${seedOrg.id})`);
  } else {
    console.log(`✅ Organization: ${seedOrg.name} (${seedOrg.id})`);
  }
  const orgId = seedOrg.id;

  // ── Users ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("demo1234!", 12);

  // Core users required for demo login and specific matrix roles
  const coreUserSeed = [
    { email: "admin@coheron.com", name: "Alex Chen", role: "owner" as const },
    { email: "agent1@coheron.com", name: "Jordan Smith", role: "member" as const },
    { email: "agent2@coheron.com", name: "Sam Rivera", role: "member" as const },
    { email: "hr@coheron.com", name: "Morgan Lee", role: "member" as const },
    { email: "finance@coheron.com", name: "Taylor Kim", role: "member" as const },
    { email: "legal@coheron.com", name: "Riley Patel", role: "member" as const },
    { email: "secretary@coheron.com", name: "Priya Nair", role: "member" as const },
    { email: "employee@coheron.com", name: "Casey Brown", role: "member" as const },
    { email: "viewer@coheron.com", name: "Robin White", role: "viewer" as const },
  ];

  const matrixRoles: Record<string, string> = {
    "agent1@coheron.com":   "itil",
    "agent2@coheron.com":   "operator_field",
    "hr@coheron.com":       "hr_manager",
    "finance@coheron.com":  "finance_manager",
    "legal@coheron.com":    "legal_counsel",
    "secretary@coheron.com": "company_secretary",
  };

  // Generate 40 additional fake users
  const fakeUsers = Array.from({ length: 40 }).map(() => ({
    email: faker.internet.email().toLowerCase(),
    name: faker.person.fullName(),
    role: "member" as const,
  }));

  const userSeed = [...coreUserSeed, ...fakeUsers];

  await db.insert(users).values(
    userSeed.map((u) => ({
      ...u,
      orgId,
      status: "active" as const,
      passwordHash,
      matrixRole: matrixRoles[u.email] ?? null,
    })),
  ).onConflictDoNothing();

  // Also update password hashes for existing core users
  for (const u of coreUserSeed) {
    await db.update(users).set({ passwordHash, status: "active" }).where(eq(users.email, u.email));
  }

  const allUsers = await db.select().from(users).where(eq(users.orgId, orgId));
  const createdUsers = allUsers;

  const admin = allUsers.find((u) => u.email === "admin@coheron.com") ?? allUsers[0]!;
  const agent1 = allUsers.find((u) => u.email === "agent1@coheron.com") ?? allUsers[1]!;
  const agent2 = allUsers.find((u) => u.email === "agent2@coheron.com") ?? allUsers[2]!;
  console.log(`✅ Users: ${createdUsers.length} (passwords updated)`);

  if (!isNew) {
    console.log("ℹ️  Skipping module data seed (org already exists). Run against a fresh DB to re-seed everything.");
    console.log("🌱 Seed complete (password update only).");
    return;
  }

  // ── Permissions & Roles ────────────────────────────────────────────────────
  const resources = ["tickets","assets","cmdb","workflows","hr","procurement","reports","settings","users","integrations","financial","changes","security","grc","contracts","projects","crm","legal","devops","surveys"];
  const actions = ["create","read","update","delete","manage"] as const;
  const permissionValues = resources.flatMap((r) => actions.map((a) => ({ resource: r, action: a })));
  await db.insert(permissions).values(permissionValues).onConflictDoNothing();
  const allPerms = await db.select().from(permissions);

  const defaultRoles = [
    { name: "Admin", description: "Full system access", isSystem: true },
    { name: "Agent", description: "Service desk agent", isSystem: true },
    { name: "Employee", description: "Self-service access", isSystem: true },
    { name: "Viewer", description: "Read-only", isSystem: true },
  ];
  await db.insert(roles).values(defaultRoles.map((r) => ({ ...r, orgId }))).onConflictDoNothing();
  const allRoles = await db.select().from(roles).where(eq(roles.orgId, orgId));
  const adminRole = allRoles.find((r) => r.name === "Admin")!;
  const agentRole = allRoles.find((r) => r.name === "Agent")!;

  if (allPerms.length > 0 && adminRole) {
    await db.insert(rolePermissions).values(allPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id }))).onConflictDoNothing();
    const agentPerms = allPerms.filter((p) => ["create","read","update"].includes(p.action) && !["settings","users"].includes(p.resource));
    if (agentPerms.length > 0 && agentRole) {
      await db.insert(rolePermissions).values(agentPerms.map((p) => ({ roleId: agentRole.id, permissionId: p.id }))).onConflictDoNothing();
    }
  }

  await db.insert(userRoles).values([
    { userId: admin.id, roleId: adminRole.id },
    { userId: agent1.id, roleId: agentRole.id },
    { userId: agent2.id, roleId: agentRole.id },
  ]).onConflictDoNothing();
  console.log(`✅ RBAC configured`);

  // ── Ticket Config ──────────────────────────────────────────────────────────
  const cats = await db.insert(ticketCategories).values([
    { orgId: orgId, name: "IT Support", color: "#00BCFF", icon: "monitor", sortOrder: 0 },
    { orgId: orgId, name: "HR", color: "#ec4899", icon: "users", sortOrder: 1 },
    { orgId: orgId, name: "Facilities", color: "#f59e0b", icon: "building", sortOrder: 2 },
    { orgId: orgId, name: "Finance", color: "#10b981", icon: "dollar-sign", sortOrder: 3 },
    { orgId: orgId, name: "Security", color: "#ef4444", icon: "shield", sortOrder: 4 },
  ]).returning();

  const prios = await db.insert(ticketPriorities).values([
    { orgId: orgId, name: "Critical", color: "#ef4444", slaResponseMinutes: 30, slaResolveMinutes: 240, sortOrder: 0 },
    { orgId: orgId, name: "High", color: "#f97316", slaResponseMinutes: 60, slaResolveMinutes: 480, sortOrder: 1 },
    { orgId: orgId, name: "Medium", color: "#f59e0b", slaResponseMinutes: 240, slaResolveMinutes: 1440, sortOrder: 2 },
    { orgId: orgId, name: "Low", color: "#6b7280", slaResponseMinutes: 480, slaResolveMinutes: 4320, sortOrder: 3 },
  ]).returning();

  const statuses = await db.insert(ticketStatuses).values([
    { orgId: orgId, name: "Open", color: "#00BCFF", category: "open", sortOrder: 0 },
    { orgId: orgId, name: "In Progress", color: "#f59e0b", category: "in_progress", sortOrder: 1 },
    { orgId: orgId, name: "Pending", color: "#94a3b8", category: "pending", sortOrder: 2 },
    { orgId: orgId, name: "Resolved", color: "#00C971", category: "resolved", sortOrder: 3 },
    { orgId: orgId, name: "Closed", color: "#6b7280", category: "closed", sortOrder: 4 },
  ]).returning();

  // ── Tickets (100 Generated) ─────────────────────────────────────────────────
  const minutesAgo = (mins: number) => new Date(NOW.getTime() - mins * 60_000);
  const dueFromCreated = (created: Date, mins: number | null | undefined) =>
    mins != null && mins > 0 ? new Date(created.getTime() + mins * 60_000) : null;

  const ticketTypes = ["incident", "request", "problem", "change"] as const;
  const IT_ISSUES = [
    "VPN connectivity issues", "Email server is down", "Password reset request",
    "Database performance degradation", "New laptop setup request",
    "Printer not working on 3rd floor", "Suspicious login attempt detected",
    "Software license renewal needed", "Network switch failure", "HR system access issue",
    "Monitor flickering constantly", "Mouse tracking poorly", "Wifi drops intermittently",
    "Cannot access shared drive", "Blue screen of death on boot",
  ];

  const ticketSeeds = Array.from({ length: 100 }).map((_, i) => {
    const type = faker.helpers.arrayElement(ticketTypes);
    const category = faker.helpers.arrayElement(cats);
    const priority = faker.helpers.arrayElement(prios);
    const status = faker.helpers.arrayElement(statuses);
    
    // Some tickets assigned, some not. Assign to agents/admins
    const isAssigned = status.category !== "open" || faker.datatype.boolean();
    const assignee = isAssigned ? faker.helpers.arrayElement([admin, agent1, agent2]) : undefined;
    
    // Requesters can be anyone
    const requester = faker.helpers.arrayElement(allUsers);
    const ageMins = faker.number.int({ min: 5, max: 60 * 24 * 7 }); // Up to 7 days old
    
    const createdAt = minutesAgo(ageMins);
    const slaResponseDueAt = dueFromCreated(createdAt, priority.slaResponseMinutes);
    const slaResolveDueAt  = dueFromCreated(createdAt, priority.slaResolveMinutes);
    const slaBreached = !!slaResolveDueAt && slaResolveDueAt.getTime() < NOW.getTime();

    return {
      orgId,
      number: `INC-${String(i + 1).padStart(4, "0")}`,
      title: faker.helpers.arrayElement(IT_ISSUES) + (faker.datatype.boolean() ? ` - ${faker.company.buzzPhrase()}` : ""),
      type,
      requesterId: requester.id,
      assigneeId: assignee?.id,
      statusId: status.id,
      priorityId: priority.id,
      categoryId: category.id,
      createdAt,
      updatedAt: createdAt,
      slaResponseDueAt: slaResponseDueAt ?? undefined,
      slaResolveDueAt:  slaResolveDueAt  ?? undefined,
      slaBreached,
    };
  });

  await db.insert(tickets).values(ticketSeeds);
  console.log(`✅ Tickets created: ${ticketSeeds.length}`);

  // ── Asset Types & Assets (50 Generated) ────────────────────────────────────
  await db.insert(assetTypes).values([
    { orgId: orgId, name: "Laptop", icon: "laptop", fieldsSchema: [] },
    { orgId: orgId, name: "Server", icon: "server", fieldsSchema: [] },
    { orgId: orgId, name: "Network", icon: "wifi", fieldsSchema: [] },
  ]).onConflictDoNothing();
  const assetTypeData = await db.select().from(assetTypes).where(eq(assetTypes.orgId, orgId));

  const assetModels = {
    Laptop: ["MacBook Pro 16", "MacBook Pro 14", "Lenovo ThinkPad X1", "Dell XPS 15"],
    Server: ["Dell PowerEdge R750", "HPE ProLiant DL380", "Cisco UCS C220"],
    Network: ["Cisco Catalyst 9300", "Juniper EX4300", "Aruba 2930F"],
  };

  const assetSeeds = Array.from({ length: 50 }).map((_, i) => {
    const type = faker.helpers.arrayElement(assetTypeData);
    const modelOptions = assetModels[type.name as keyof typeof assetModels] || ["Generic Device"];
    const model = faker.helpers.arrayElement(modelOptions);
    const owner = faker.datatype.boolean({ probability: 0.7 }) ? faker.helpers.arrayElement(allUsers) : undefined;
    
    return {
      orgId,
      assetTag: `AST-${String(i + 1).padStart(4, "0")}`,
      name: `${model}${owner ? ` - ${owner.name}` : ""}`,
      typeId: type.id,
      status: faker.helpers.arrayElement(["deployed", "in_stock", "retired", "maintenance"]),
      ownerId: owner?.id,
      purchaseCost: faker.finance.amount({ min: 500, max: 15000, dec: 2 }),
    };
  });

  await db.insert(assets).values(assetSeeds);
  console.log(`✅ Assets created: ${assetSeeds.length}`);

  // ── Change Requests (20 Generated) ──────────────────────────────────────────
  const changeSeeds = Array.from({ length: 20 }).map((_, i) => {
    return {
      orgId,
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
    };
  });
  await db.insert(changeRequests).values(changeSeeds);
  console.log(`✅ Change requests: ${changeSeeds.length}`);

  // ── Problems (15 Generated) ───────────────────────────────────────────────
  const problemSeeds = Array.from({ length: 15 }).map((_, i) => {
    return {
      orgId,
      number: `PRB-${String(i + 1).padStart(4, "0")}`,
      title: `Recurring ${faker.hacker.adjective()} ${faker.hacker.noun()} failures`,
      status: faker.helpers.arrayElement(["investigation", "root_cause_identified", "known_error", "resolved"]),
      priority: faker.helpers.arrayElement(["low", "medium", "high", "critical"]),
      assigneeId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
      rootCause: faker.datatype.boolean() ? faker.company.catchPhrase() : null,
      workaround: faker.datatype.boolean() ? "Restart the service" : null,
    };
  });
  await db.insert(problems).values(problemSeeds);
  console.log(`✅ Problems: ${problemSeeds.length}`);

  // ── Security Incidents & Vulns (20 Generated) ──────────────────────────────
  const secIncidents = Array.from({ length: 20 }).map((_, i) => ({
    orgId,
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
    orgId,
    cveId: `CVE-202${faker.number.int({ min: 0, max: 4 })}-${faker.number.int({ min: 1000, max: 9999 })}`,
    title: `${faker.hacker.noun()} Vulnerability`,
    severity: faker.helpers.arrayElement(["low", "medium", "high", "critical"]),
    cvssScore: faker.finance.amount({ min: 4, max: 10, dec: 1 }),
    status: faker.helpers.arrayElement(["open", "in_progress", "remediated", "accepted"]),
    assigneeId: faker.helpers.arrayElement([admin.id, agent1.id, agent2.id]),
    remediatedAt: faker.datatype.boolean() ? d(faker.number.int({ min: -30, max: -1 })) : null,
  }));
  await db.insert(vulnerabilities).values(vulns);
  console.log(`✅ Security data: ${secIncidents.length} incidents, ${vulns.length} vulns`);

  // ── GRC Risks (20 Generated) ──────────────────────────────────────────────
  const risksSeeds = Array.from({ length: 20 }).map((_, i) => {
    const likelihood = faker.number.int({ min: 1, max: 5 });
    const impact = faker.number.int({ min: 1, max: 5 });
    return {
      orgId,
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

  // ── Financial ──────────────────────────────────────────────────────────────
  const budgetSeeds = Array.from({ length: 10 }).map(() => {
    const budgeted = faker.number.int({ min: 50000, max: 2000000 });
    const committed = faker.number.int({ min: 10000, max: budgeted });
    const actual = faker.number.int({ min: 10000, max: committed });
    return {
      orgId,
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

  // ── Contracts ──────────────────────────────────────────────────────────────
  const contractSeeds = Array.from({ length: 15 }).map((_, i) => ({
    orgId,
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

  // ── Projects ───────────────────────────────────────────────────────────────
  const projectData = await db.insert(projects).values(
    Array.from({ length: 10 }).map((_, i) => ({
      orgId,
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

  // ── CRM ────────────────────────────────────────────────────────────────────
  const crmAccountData = await db.insert(crmAccounts).values(
    Array.from({ length: 15 }).map(() => ({
      orgId,
      name: faker.company.name(),
      industry: faker.helpers.arrayElement(["Technology", "Retail", "Financial Services", "Healthcare", "Manufacturing"]),
      tier: faker.helpers.arrayElement(["smb", "mid_market", "enterprise"]),
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
        orgId,
        title: `${faker.company.catchPhraseAdjective()} License Expansion`,
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
      orgId,
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

  // ── Legal ──────────────────────────────────────────────────────────────────
  await db.insert(legalMatters).values(
    Array.from({ length: 10 }).map((_, i) => ({
      orgId,
      matterNumber: `MAT-${String(i + 1).padStart(4, "0")}`,
      title: `${faker.company.name()} Dispute`,
      type: faker.helpers.arrayElement(["litigation", "employment", "ip", "data_privacy", "corporate", "commercial"]),
      status: faker.helpers.arrayElement(["intake", "active", "discovery", "pre_trial", "closed", "settled"]),
      assignedTo: faker.helpers.arrayElement([admin.id, agent1.id]),
      confidential: faker.datatype.boolean(),
      estimatedCost: faker.finance.amount({ min: 5000, max: 100000, dec: 0 }),
    }))
  );
  console.log(`✅ Legal matters: 10`);

  // ── DevOps ─────────────────────────────────────────────────────────────────
  const pipelineData = await db.insert(pipelineRuns).values(
    Array.from({ length: 20 }).map(() => ({
      orgId,
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
      orgId,
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

  // ── Surveys ────────────────────────────────────────────────────────────────
  await db.insert(surveys).values([
    { orgId: orgId, title: "Q4 Employee Pulse", type: "employee_pulse", status: "active", createdById: admin.id,
      questions: [
        { id: "q1", type: "rating", question: "How satisfied are you with your work environment?", required: true },
        { id: "q2", type: "nps", question: "How likely are you to recommend NexusOps as an employer?", required: true },
        { id: "q3", type: "text", question: "What one thing would improve your experience?", required: false },
      ]
    },
    { orgId: orgId, title: "IT Service Desk CSAT", type: "csat", status: "active", createdById: agent1.id,
      questions: [
        { id: "q1", type: "rating", question: "How satisfied were you with the resolution of your ticket?", required: true },
        { id: "q2", type: "yes_no", question: "Was your issue resolved on the first contact?", required: true },
      ]
    },
  ]);
  console.log(`✅ Surveys: 2`);

  // ── Knowledge Base ─────────────────────────────────────────────────────────
  await db.insert(kbArticles).values(
    Array.from({ length: 15 }).map(() => ({
      orgId,
      title: `How to ${faker.hacker.verb()} your ${faker.hacker.noun()}`,
      content: `## ${faker.hacker.ingverb()}\n\n${faker.lorem.paragraphs(3)}`,
      categoryId: null,
      status: faker.helpers.arrayElement(["draft", "published", "archived"]),
      authorId: faker.helpers.arrayElement(allUsers).id,
      viewCount: faker.number.int({ min: 0, max: 1000 }),
      helpfulCount: faker.number.int({ min: 0, max: 500 }),
    }))
  );
  console.log(`✅ KB articles: 15`);

  // ── Procurement ────────────────────────────────────────────────────────────
  const vendorData = await db.insert(vendors).values(
    Array.from({ length: 10 }).map(() => ({
      orgId,
      name: faker.company.name(),
      contactEmail: faker.internet.email(),
      status: faker.helpers.arrayElement(["active", "inactive", "under_review", "blacklisted"]),
      rating: faker.finance.amount({ min: 1, max: 5, dec: 1 }),
      paymentTerms: faker.helpers.arrayElement(["Net 15", "Net 30", "Net 60", "Due on receipt"]),
    }))
  ).returning();

  await db.insert(purchaseRequests).values(
    Array.from({ length: 15 }).map((_, i) => ({
      orgId,
      number: `PR-${String(i + 1).padStart(4, "0")}`,
      title: `${faker.number.int({ min: 1, max: 50 })}x ${faker.commerce.product()}`,
      requesterId: faker.helpers.arrayElement(allUsers).id,
      totalAmount: faker.finance.amount({ min: 100, max: 50000, dec: 0 }),
      status: faker.helpers.arrayElement(["draft", "pending", "approved", "rejected", "ordered", "received"]),
      priority: faker.helpers.arrayElement(["low", "medium", "high"]),
      department: faker.helpers.arrayElement(["IT", "HR", "Sales", "Marketing", "Operations"]),
    }))
  );
  console.log(`✅ Procurement: ${vendorData.length} vendors, 15 PRs`);

  // ── On-Call Schedule ───────────────────────────────────────────────────────
  await db.insert(oncallSchedules).values([
    { orgId: orgId, name: "IT Primary On-Call", team: "IT Operations", rotationType: "weekly",
      members: [
        { userId: agent1.id, name: "Jordan Smith", phone: "+1-555-0101", email: "agent1@coheron.com" },
        { userId: agent2.id, name: "Sam Rivera", phone: "+1-555-0102", email: "agent2@coheron.com" },
      ],
      escalationChain: [{ level: 1, userId: agent1.id, delayMinutes: 0 }, { level: 2, userId: admin.id, delayMinutes: 15 }]
    },
  ]);
  console.log(`✅ On-call schedule created`);

  // ── Service Catalog ────────────────────────────────────────────────────────
  await db.insert(catalogItems).values([
    { orgId: orgId, name: "New Laptop Request", description: "Request a new laptop for business use", category: "Hardware", approvalRequired: true, fulfillmentGroup: "IT Hardware", slaDays: 5, sortOrder: 1 },
    { orgId: orgId, name: "Software Access Request", description: "Request access to business software", category: "Software", approvalRequired: true, fulfillmentGroup: "IT Software", slaDays: 3, sortOrder: 2 },
    { orgId: orgId, name: "VPN Account Setup", description: "Set up VPN access for remote work", category: "Network", approvalRequired: false, fulfillmentGroup: "IT Network", slaDays: 1, sortOrder: 3 },
    { orgId: orgId, name: "Desk Booking", description: "Book a hot desk or office space", category: "Facilities", approvalRequired: false, fulfillmentGroup: "Facilities", slaDays: 1, sortOrder: 4 },
    { orgId: orgId, name: "Training Course Enrollment", description: "Enroll in corporate training", category: "Learning", approvalRequired: true, fulfillmentGroup: "HR", slaDays: 7, sortOrder: 5 },
  ]);
  console.log(`✅ Catalog items: 5`);

  // ── Facilities ─────────────────────────────────────────────────────────────
  const buildingData = await db.insert(buildings).values([
    { orgId: orgId, name: "HQ - London", address: "1 Silicon Road, London EC1A 1BB", floors: 10, capacity: 500, status: "active" },
    { orgId: orgId, name: "NY Office", address: "123 Fifth Ave, New York NY 10011", floors: 4, capacity: 150, status: "active" },
  ]).returning();

  await db.insert(rooms).values([
    { buildingId: buildingData[0]!.id, name: "Boardroom A", floor: 8, capacity: 20, bookable: true, equipment: ["projector", "whiteboard", "video_conferencing"] },
    { buildingId: buildingData[0]!.id, name: "Meeting Room 401", floor: 4, capacity: 8, bookable: true, equipment: ["tv_screen", "whiteboard"] },
    { buildingId: buildingData[1]!.id, name: "NY Conference Room 1", floor: 2, capacity: 12, bookable: true, equipment: ["projector"] },
  ]);
  console.log(`✅ Facilities: 2 buildings, 3 rooms`);

  // ── APM ─────────────────────────────────────────────────────────────────────
  await db.insert(applications).values(
    Array.from({ length: 15 }).map(() => ({
      orgId,
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
  console.log(`✅ APM applications: 15`);

  console.log("\n🎉 Full seed complete!");
  console.log(`   Organization:  ${org.name}`);
  console.log(`   Admin login:   admin@coheron.com / demo1234!`);
  console.log(`   Agent login:   agent1@coheron.com / demo1234!`);
  console.log(`   Org slug:      ${org.slug}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  console.error(err.stack);
  process.exit(1);
});
