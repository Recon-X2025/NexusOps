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

const DEMO_ORG_SLUG = "coheron-demo";
const NOW = new Date();
const d = (days: number) => new Date(NOW.getTime() + days * 86400000);

async function seed() {
  const db = getDb();
  console.log("🌱 Seeding NexusOps database...");

  // ── Organization ───────────────────────────────────────────────────────────
  const [org] = await db.insert(organizations).values({
    name: "Coheron Demo", slug: DEMO_ORG_SLUG, plan: "professional", primaryColor: "#6366f1",
  }).onConflictDoNothing().returning();

  const isNew = !!org;
  let seedOrg = org;
  if (!seedOrg) {
    // Org exists — fetch it and only update passwords
    const { eq: eqOp } = await import("drizzle-orm");
    const [existing] = await db.select().from(organizations).where(eqOp(organizations.slug, DEMO_ORG_SLUG));
    seedOrg = existing!;
    console.log(`ℹ️  Org already exists: ${seedOrg.name} (${seedOrg.id})`);
  } else {
    console.log(`✅ Organization: ${seedOrg.name} (${seedOrg.id})`);
  }
  const orgId = seedOrg.id;

  // ── Users ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("demo1234!", 12);

  const userSeed = [
    { email: "admin@coheron.com", name: "Alex Chen", role: "owner" as const },
    { email: "agent1@coheron.com", name: "Jordan Smith", role: "member" as const },
    { email: "agent2@coheron.com", name: "Sam Rivera", role: "member" as const },
    { email: "hr@coheron.com", name: "Morgan Lee", role: "member" as const },
    { email: "finance@coheron.com", name: "Taylor Kim", role: "member" as const },
    { email: "employee@coheron.com", name: "Casey Brown", role: "member" as const },
    { email: "viewer@coheron.com", name: "Robin White", role: "viewer" as const },
  ];

  const matrixRoles: Record<string, string> = {
    // ITSM agents: agent1 is a general ITIL analyst, agent2 is a field technician
    "agent1@coheron.com":   "itil",
    "agent2@coheron.com":   "operator_field",
    // Domain managers — all members receive "requester" as base + this additive role
    // Resulting effective roles: ["requester", "<matrix_role>"]
    "hr@coheron.com":       "hr_manager",
    "finance@coheron.com":  "finance_manager",
    // employee@coheron.com → no matrix_role → stays as plain ["requester"]
    // viewer@coheron.com   → DB role "viewer" → ["requester", "report_viewer"]
  };

  await db.insert(users).values(
    userSeed.map((u) => ({
      ...u,
      orgId,
      status: "active" as const,
      passwordHash,
      matrixRole: matrixRoles[u.email] ?? null,
    })),
  ).onConflictDoNothing();

  // Also update password hashes for existing users (idempotent re-seed)
  const { eq: eqOp2 } = await import("drizzle-orm");
  for (const u of userSeed) {
    await db.update(users).set({ passwordHash, status: "active" }).where(
      eqOp2(users.email, u.email)
    );
  }

  const allUsers = await db.select().from(users).where(
    (await import("drizzle-orm")).eq(users.orgId, orgId)
  );
  const createdUsers = allUsers;

  const admin = allUsers.find((u) => u.email === "admin@coheron.com") ?? allUsers[0]!;
  const agent1 = allUsers.find((u) => u.email === "agent1@coheron.com") ?? allUsers[1]!;
  const agent2 = allUsers.find((u) => u.email === "agent2@coheron.com") ?? allUsers[2]!;
  console.log(`✅ Users: ${createdUsers.length} (passwords updated)`);

  // If org already existed, skip module data — it was seeded in a previous run.
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
  // Fetch all permissions (may already exist from a previous seed run)
  const allPerms = await db.select().from(permissions);

  const defaultRoles = [
    { name: "Admin", description: "Full system access", isSystem: true },
    { name: "Agent", description: "Service desk agent", isSystem: true },
    { name: "Employee", description: "Self-service access", isSystem: true },
    { name: "Viewer", description: "Read-only", isSystem: true },
  ];
  await db.insert(roles).values(defaultRoles.map((r) => ({ ...r, orgId }))).onConflictDoNothing();
  const allRoles = await db.select().from(roles).where((await import("drizzle-orm")).eq(roles.orgId, orgId));
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
    { orgId: orgId, name: "IT Support", color: "#6366f1", icon: "monitor", sortOrder: 0 },
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
    { orgId: orgId, name: "Open", color: "#6366f1", category: "open", sortOrder: 0 },
    { orgId: orgId, name: "In Progress", color: "#f59e0b", category: "in_progress", sortOrder: 1 },
    { orgId: orgId, name: "Resolved", color: "#10b981", category: "resolved", sortOrder: 2 },
    { orgId: orgId, name: "Closed", color: "#6b7280", category: "closed", sortOrder: 3 },
  ]).returning();

  const openStatus = statuses[0]!;
  const inProgressStatus = statuses[1]!;
  const critPrio = prios[0]!;
  const highPrio = prios[1]!;
  const medPrio = prios[2]!;

  // ── Tickets (20) ───────────────────────────────────────────────────────────
  await db.insert(tickets).values([
    { orgId: orgId, number: "INC-0001", title: "Email server is down", type: "incident", requesterId: agent1.id, assigneeId: agent2.id, statusId: openStatus.id, priorityId: critPrio.id, categoryId: cats[0]!.id, slaBreached: false },
    { orgId: orgId, number: "INC-0002", title: "VPN connectivity issues", type: "incident", requesterId: admin.id, assigneeId: agent1.id, statusId: inProgressStatus.id, priorityId: highPrio.id, categoryId: cats[0]!.id, slaBreached: false },
    { orgId: orgId, number: "INC-0003", title: "Password reset request", type: "request", requesterId: agent2.id, statusId: openStatus.id, priorityId: medPrio.id, categoryId: cats[0]!.id, slaBreached: false },
    { orgId: orgId, number: "INC-0004", title: "Database performance degradation", type: "problem", requesterId: admin.id, assigneeId: agent2.id, statusId: inProgressStatus.id, priorityId: critPrio.id, categoryId: cats[4]!.id, slaBreached: true },
    { orgId: orgId, number: "INC-0005", title: "New laptop setup request", type: "request", requesterId: agent1.id, statusId: openStatus.id, priorityId: medPrio.id, categoryId: cats[0]!.id, slaBreached: false },
    { orgId: orgId, number: "INC-0006", title: "Printer not working on 3rd floor", type: "incident", requesterId: agent2.id, statusId: openStatus.id, priorityId: medPrio.id, categoryId: cats[2]!.id, slaBreached: false },
    { orgId: orgId, number: "INC-0007", title: "Suspicious login attempt detected", type: "incident", requesterId: admin.id, assigneeId: agent1.id, statusId: inProgressStatus.id, priorityId: critPrio.id, categoryId: cats[4]!.id, slaBreached: true },
    { orgId: orgId, number: "INC-0008", title: "Software license renewal needed", type: "request", requesterId: agent1.id, statusId: openStatus.id, priorityId: highPrio.id, categoryId: cats[3]!.id, slaBreached: false },
    { orgId: orgId, number: "INC-0009", title: "Network switch failure", type: "incident", requesterId: agent2.id, assigneeId: agent1.id, statusId: inProgressStatus.id, priorityId: highPrio.id, categoryId: cats[0]!.id, slaBreached: false },
    { orgId: orgId, number: "INC-0010", title: "HR system access issue", type: "request", requesterId: admin.id, statusId: openStatus.id, priorityId: medPrio.id, categoryId: cats[1]!.id, slaBreached: false },
  ]);
  console.log(`✅ Tickets created: 10`);

  // ── Asset Types & Assets ───────────────────────────────────────────────────
  await db.insert(assetTypes).values([
    { orgId: orgId, name: "Laptop", icon: "laptop", fieldsSchema: [] },
    { orgId: orgId, name: "Server", icon: "server", fieldsSchema: [] },
    { orgId: orgId, name: "Network", icon: "wifi", fieldsSchema: [] },
  ]).onConflictDoNothing();
  const assetTypeData = await db.select().from(assetTypes).where(eq(assetTypes.orgId, orgId));

  await db.insert(assets).values([
    { orgId: orgId, assetTag: "AST-0001", name: "MacBook Pro 16 - Alex Chen", typeId: assetTypeData[0]!.id, status: "deployed", ownerId: admin.id, purchaseCost: "2499.00" },
    { orgId: orgId, assetTag: "AST-0002", name: "MacBook Pro 14 - Jordan Smith", typeId: assetTypeData[0]!.id, status: "deployed", ownerId: agent1.id, purchaseCost: "1999.00" },
    { orgId: orgId, assetTag: "AST-0003", name: "Dell PowerEdge R750 - prod-db-01", typeId: assetTypeData[1]!.id, status: "deployed", purchaseCost: "12500.00" },
    { orgId: orgId, assetTag: "AST-0004", name: "Cisco Catalyst 9300 - core-sw-01", typeId: assetTypeData[2]!.id, status: "deployed", purchaseCost: "8000.00" },
    { orgId: orgId, assetTag: "AST-0005", name: "Lenovo ThinkPad X1 - Casey Brown", typeId: assetTypeData[0]!.id, status: "deployed", purchaseCost: "1599.00" },
  ]);
  console.log(`✅ Assets created: 5`);

  // ── Change Requests ────────────────────────────────────────────────────────
  await db.insert(changeRequests).values([
    { orgId: orgId, number: "CHG-0001", title: "Upgrade PostgreSQL to v17", type: "normal", risk: "medium", status: "cab_review", requesterId: admin.id, assigneeId: agent1.id, scheduledStart: d(7), scheduledEnd: d(8), rollbackPlan: "Restore from backup" },
    { orgId: orgId, number: "CHG-0002", title: "Deploy new firewall rules", type: "emergency", risk: "high", status: "approved", requesterId: agent1.id, assigneeId: agent2.id },
    { orgId: orgId, number: "CHG-0003", title: "Office 365 tenant migration", type: "normal", risk: "high", status: "draft", requesterId: admin.id, scheduledStart: d(30) },
    { orgId: orgId, number: "CHG-0004", title: "SSL certificate renewal", type: "standard", risk: "low", status: "completed", requesterId: agent2.id },
    { orgId: orgId, number: "CHG-0005", title: "Kubernetes cluster upgrade to 1.31", type: "normal", risk: "medium", status: "scheduled", requesterId: admin.id, scheduledStart: d(14) },
  ]);
  console.log(`✅ Change requests: 5`);

  // ── Problems ───────────────────────────────────────────────────────────────
  await db.insert(problems).values([
    { orgId: orgId, number: "PRB-0001", title: "Recurring email server crashes", status: "investigation", priority: "critical", assigneeId: agent1.id },
    { orgId: orgId, number: "PRB-0002", title: "Database connection pool exhaustion", status: "root_cause_identified", priority: "high", assigneeId: agent2.id, rootCause: "Missing connection timeout configuration" },
    { orgId: orgId, number: "PRB-0003", title: "VPN performance degradation under load", status: "known_error", priority: "medium", workaround: "Restart VPN service every 24h" },
  ]);
  console.log(`✅ Problems: 3`);

  // ── Security Incidents ─────────────────────────────────────────────────────
  await db.insert(securityIncidents).values([
    { orgId: orgId, number: "SEC-0001", title: "Phishing campaign targeting finance team", severity: "high", status: "triage", assigneeId: admin.id, reporterId: agent1.id, attackVector: "Email", mitreTechniques: ["T1566.001"] },
    { orgId: orgId, number: "SEC-0002", title: "Unauthorized API access attempt", severity: "medium", status: "containment", assigneeId: agent2.id, reporterId: admin.id, attackVector: "API", affectedSystems: ["api-gateway-01"] },
    { orgId: orgId, number: "SEC-0003", title: "Malware detected on endpoint", severity: "critical", status: "eradication", assigneeId: agent1.id, reporterId: admin.id, attackVector: "USB", mitreTechniques: ["T1091"] },
  ]);

  await db.insert(vulnerabilities).values([
    { orgId: orgId, cveId: "CVE-2024-1234", title: "OpenSSL Memory Corruption", severity: "critical", cvssScore: "9.8", status: "open", assigneeId: agent1.id },
    { orgId: orgId, title: "Outdated Apache version (2.4.51)", severity: "high", status: "in_progress", assigneeId: agent2.id },
    { orgId: orgId, cveId: "CVE-2024-5678", title: "Log4j RCE Variant", severity: "critical", cvssScore: "10.0", status: "remediated", remediatedAt: d(-5) },
  ]);
  console.log(`✅ Security data: 3 incidents, 3 vulns`);

  // ── GRC Risks ──────────────────────────────────────────────────────────────
  await db.insert(risks).values([
    { orgId: orgId, number: "RK-0001", title: "Single point of failure in primary database", category: "technology", likelihood: 3, impact: 5, riskScore: 15, status: "mitigating", treatment: "mitigate", ownerId: admin.id },
    { orgId: orgId, number: "RK-0002", title: "GDPR compliance gap in data retention", category: "compliance", likelihood: 4, impact: 4, riskScore: 16, status: "identified", treatment: "mitigate", ownerId: agent1.id },
    { orgId: orgId, number: "RK-0003", title: "Key vendor dependency risk - cloud provider", category: "operational", likelihood: 2, impact: 5, riskScore: 10, status: "accepted", treatment: "accept", ownerId: admin.id },
    { orgId: orgId, number: "RK-0004", title: "Insider threat from privileged accounts", category: "strategic", likelihood: 2, impact: 4, riskScore: 8, status: "mitigating", treatment: "mitigate", ownerId: agent2.id },
    { orgId: orgId, number: "RK-0005", title: "Ransomware attack on OT systems", category: "technology", likelihood: 3, impact: 5, riskScore: 15, status: "identified", treatment: "transfer", ownerId: admin.id },
  ]);
  console.log(`✅ GRC risks: 5`);

  // ── Financial ──────────────────────────────────────────────────────────────
  await db.insert(budgetLines).values([
    { orgId: orgId, category: "Infrastructure", department: "IT", fiscalYear: 2025, budgeted: "500000", committed: "320000", actual: "298000", forecast: "420000" },
    { orgId: orgId, category: "Software Licenses", department: "IT", fiscalYear: 2025, budgeted: "150000", committed: "120000", actual: "118000", forecast: "145000" },
    { orgId: orgId, category: "Personnel", department: "Engineering", fiscalYear: 2025, budgeted: "2000000", committed: "1850000", actual: "1720000", forecast: "1950000" },
    { orgId: orgId, category: "Marketing", department: "Marketing", fiscalYear: 2025, budgeted: "300000", committed: "200000", actual: "185000", forecast: "270000" },
    { orgId: orgId, category: "Professional Services", department: "Legal", fiscalYear: 2025, budgeted: "80000", committed: "60000", actual: "52000", forecast: "75000" },
  ]);
  console.log(`✅ Budget lines: 5`);

  // ── Contracts ──────────────────────────────────────────────────────────────
  await db.insert(contracts).values([
    { orgId: orgId, contractNumber: "CNTR-0001", title: "AWS Enterprise Agreement", counterparty: "Amazon Web Services", type: "vendor", status: "active", value: "240000", startDate: d(-365), endDate: d(365), autoRenew: true, internalOwnerId: admin.id },
    { orgId: orgId, contractNumber: "CNTR-0002", title: "Microsoft 365 E5 License", counterparty: "Microsoft Corporation", type: "license", status: "active", value: "85000", startDate: d(-180), endDate: d(185), autoRenew: true, internalOwnerId: admin.id },
    { orgId: orgId, contractNumber: "CNTR-0003", title: "ACME Corp MSA", counterparty: "ACME Corporation", type: "msa", status: "active", value: "120000", startDate: d(-90), endDate: d(275), autoRenew: false, internalOwnerId: agent1.id },
    { orgId: orgId, contractNumber: "CNTR-0004", title: "Salesforce CRM - NDA", counterparty: "Salesforce Inc", type: "nda", status: "expiring_soon", value: "0", startDate: d(-730), endDate: d(15), autoRenew: false, internalOwnerId: admin.id },
    { orgId: orgId, contractNumber: "CNTR-0005", title: "Zendesk SaaS Agreement", counterparty: "Zendesk Inc", type: "sla_support", status: "under_review", value: "24000", startDate: d(-30), endDate: d(335), autoRenew: true, internalOwnerId: agent1.id },
  ]);
  console.log(`✅ Contracts: 5`);

  // ── Projects ───────────────────────────────────────────────────────────────
  const projectData = await db.insert(projects).values([
    { orgId: orgId, number: "PRJ-0001", name: "ERP System Modernisation", status: "active", health: "amber", budgetTotal: "1200000", budgetSpent: "680000", startDate: d(-90), endDate: d(180), ownerId: admin.id, department: "IT" },
    { orgId: orgId, number: "PRJ-0002", name: "Zero Trust Security Implementation", status: "active", health: "green", budgetTotal: "350000", budgetSpent: "120000", startDate: d(-30), endDate: d(240), ownerId: agent1.id, department: "Security" },
    { orgId: orgId, number: "PRJ-0003", name: "HR Digital Transformation", status: "planning", health: "green", budgetTotal: "500000", budgetSpent: "0", startDate: d(30), endDate: d(365), ownerId: admin.id, department: "HR" },
  ]).returning();

  await db.insert(projectTasks).values([
    { projectId: projectData[0]!.id, title: "Vendor evaluation", status: "done", priority: "high", assigneeId: admin.id },
    { projectId: projectData[0]!.id, title: "Data migration strategy", status: "in_progress", priority: "critical", assigneeId: agent1.id },
    { projectId: projectData[0]!.id, title: "UAT planning", status: "todo", priority: "medium", assigneeId: agent2.id },
    { projectId: projectData[1]!.id, title: "Identity provider integration", status: "in_progress", priority: "high", assigneeId: agent1.id },
    { projectId: projectData[1]!.id, title: "Micro-segmentation design", status: "todo", priority: "high", assigneeId: admin.id },
  ]);
  console.log(`✅ Projects: 3 with tasks`);

  // ── CRM ────────────────────────────────────────────────────────────────────
  const crmAccountData = await db.insert(crmAccounts).values([
    { orgId: orgId, name: "Techwave Solutions", industry: "Technology", tier: "enterprise", healthScore: 85, annualRevenue: "45000000", ownerId: admin.id },
    { orgId: orgId, name: "Global Retail Group", industry: "Retail", tier: "mid_market", healthScore: 72, annualRevenue: "12000000", ownerId: agent1.id },
    { orgId: orgId, name: "FinServ Partners", industry: "Financial Services", tier: "enterprise", healthScore: 90, annualRevenue: "80000000", ownerId: admin.id },
  ]).returning();

  const dealData = await db.insert(crmDeals).values([
    { orgId: orgId, title: "Techwave Enterprise License", accountId: crmAccountData[0]!.id, stage: "negotiation", value: "250000", probability: 75, weightedValue: "187500", expectedClose: d(30), ownerId: admin.id },
    { orgId: orgId, title: "Global Retail Implementation", accountId: crmAccountData[1]!.id, stage: "proposal", value: "180000", probability: 50, weightedValue: "90000", expectedClose: d(45), ownerId: agent1.id },
    { orgId: orgId, title: "FinServ Platform Expansion", accountId: crmAccountData[2]!.id, stage: "verbal_commit", value: "420000", probability: 90, weightedValue: "378000", expectedClose: d(14), ownerId: admin.id },
    { orgId: orgId, title: "StartupXYZ Pilot", accountId: crmAccountData[0]!.id, stage: "prospect", value: "25000", probability: 10, weightedValue: "2500", expectedClose: d(90), ownerId: agent2.id },
    { orgId: orgId, title: "Healthcare Corp Renewal", accountId: crmAccountData[2]!.id, stage: "closed_won", value: "120000", probability: 100, weightedValue: "120000", closedAt: d(-7), ownerId: admin.id },
  ]).returning();

  await db.insert(crmLeads).values([
    { orgId: orgId, firstName: "Jennifer", lastName: "Walsh", email: "j.walsh@infratech.com", company: "InfraTech", source: "referral", score: 85, status: "qualified", ownerId: admin.id },
    { orgId: orgId, firstName: "Marcus", lastName: "Okonjo", email: "m.okonjo@cloudco.io", company: "CloudCo", source: "website", score: 62, status: "contacted", ownerId: agent1.id },
    { orgId: orgId, firstName: "Sofia", lastName: "Reyes", email: "sofia@dataplex.net", company: "DataPlex", source: "event", score: 91, status: "qualified", ownerId: admin.id },
  ]);
  console.log(`✅ CRM: 3 accounts, 5 deals, 3 leads`);

  // ── Legal ──────────────────────────────────────────────────────────────────
  await db.insert(legalMatters).values([
    { orgId: orgId, matterNumber: "MAT-0001", title: "Employment dispute - Q3 2024", type: "employment", status: "active", assignedTo: admin.id, confidential: true, estimatedCost: "45000" },
    { orgId: orgId, matterNumber: "MAT-0002", title: "GDPR data breach notification", type: "data_privacy", status: "active", assignedTo: admin.id, confidential: false, estimatedCost: "25000" },
    { orgId: orgId, matterNumber: "MAT-0003", title: "Trademark registration - NexusOps mark", type: "ip", status: "intake", assignedTo: agent1.id, confidential: false, estimatedCost: "8000" },
  ]);
  console.log(`✅ Legal matters: 3`);

  // ── DevOps ─────────────────────────────────────────────────────────────────
  const pipelineData = await db.insert(pipelineRuns).values([
    { orgId: orgId, pipelineName: "nexusops-api", trigger: "push", branch: "main", commitSha: "a3f9b2c", status: "success", durationSeconds: 342, completedAt: d(-0.1) },
    { orgId: orgId, pipelineName: "nexusops-web", trigger: "push", branch: "main", commitSha: "d8e1f4a", status: "success", durationSeconds: 428, completedAt: d(-0.2) },
    { orgId: orgId, pipelineName: "nexusops-api", trigger: "push", branch: "feature/crm", commitSha: "b2c7d9e", status: "failed", durationSeconds: 121, completedAt: d(-0.5) },
    { orgId: orgId, pipelineName: "nexusops-web", trigger: "scheduled", branch: "main", commitSha: "e4f1a8b", status: "running" },
  ]).returning();

  await db.insert(deployments).values([
    { orgId: orgId, appName: "nexusops-api", environment: "production", version: "v2.4.1", status: "success", deployedById: admin.id, pipelineRunId: pipelineData[0]!.id, durationSeconds: 180 },
    { orgId: orgId, appName: "nexusops-web", environment: "production", version: "v2.4.1", status: "success", deployedById: admin.id, pipelineRunId: pipelineData[1]!.id, durationSeconds: 95 },
    { orgId: orgId, appName: "nexusops-api", environment: "staging", version: "v2.5.0-rc1", status: "in_progress", deployedById: agent1.id },
  ]);
  console.log(`✅ DevOps: 4 pipelines, 3 deployments`);

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
  await db.insert(kbArticles).values([
    { orgId: orgId, title: "How to reset your VPN password", content: "## VPN Password Reset\n\nFollow these steps...", category: "IT Support", status: "published", authorId: agent1.id, viewCount: 342, helpfulCount: 98 },
    { orgId: orgId, title: "Requesting new software access", content: "## Software Access Request\n\nUse the Service Catalog to...", category: "IT Support", status: "published", authorId: agent2.id, viewCount: 289, helpfulCount: 74 },
    { orgId: orgId, title: "Expense reporting guidelines", content: "## Expense Policy\n\nAll expenses must be submitted within...", category: "Finance", status: "published", authorId: admin.id, viewCount: 156, helpfulCount: 62 },
    { orgId: orgId, title: "How to book a meeting room", content: "## Room Booking\n\nUse the Facilities portal to...", category: "Facilities", status: "published", authorId: agent1.id, viewCount: 201, helpfulCount: 55 },
    { orgId: orgId, title: "IT Security best practices", content: "## Security Guidelines\n\nAlways use strong passwords...", category: "Security", status: "published", authorId: admin.id, viewCount: 412, helpfulCount: 188 },
  ]);
  console.log(`✅ KB articles: 5`);

  // ── Procurement ────────────────────────────────────────────────────────────
  const vendorData = await db.insert(vendors).values([
    { orgId: orgId, name: "Dell Technologies", contactEmail: "sales@dell.com", status: "active", rating: "4.5", paymentTerms: "Net 30" },
    { orgId: orgId, name: "AWS Marketplace", contactEmail: "aws@amazon.com", status: "active", rating: "4.8", paymentTerms: "Monthly" },
    { orgId: orgId, name: "Office Supplies Co", contactEmail: "orders@officesupplies.com", status: "active", rating: "3.9", paymentTerms: "Net 15" },
  ]).returning();

  await db.insert(purchaseRequests).values([
    { orgId: orgId, number: "PR-0001", title: "15x Laptop replacement", requesterId: admin.id, totalAmount: "37500", status: "approved", priority: "high", department: "IT" },
    { orgId: orgId, number: "PR-0002", title: "Network switches Q1", requesterId: agent1.id, totalAmount: "24000", status: "pending_approval", priority: "medium", department: "IT" },
    { orgId: orgId, number: "PR-0003", title: "Office supplies restock", requesterId: agent2.id, totalAmount: "1200", status: "ordered", priority: "low", department: "Operations" },
  ]);
  console.log(`✅ Procurement: 3 vendors, 3 PRs`);

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
  await db.insert(applications).values([
    { orgId: orgId, name: "Salesforce CRM", category: "CRM", lifecycle: "sustaining", healthScore: 85, annualCost: "120000", usersCount: 250, cloudReadiness: "cloud_native", techDebtScore: 15, ownerId: admin.id, vendor: "Salesforce" },
    { orgId: orgId, name: "Legacy ERP (SAP R/3)", category: "ERP", lifecycle: "harvesting", healthScore: 45, annualCost: "350000", usersCount: 180, cloudReadiness: "rearchitect", techDebtScore: 78, ownerId: agent1.id, vendor: "SAP" },
    { orgId: orgId, name: "Jira Software", category: "Project Management", lifecycle: "investing", healthScore: 92, annualCost: "45000", usersCount: 120, cloudReadiness: "cloud_native", techDebtScore: 5, ownerId: agent2.id, vendor: "Atlassian" },
    { orgId: orgId, name: "Custom HR Portal", category: "HR", lifecycle: "retiring", healthScore: 30, annualCost: "80000", usersCount: 450, cloudReadiness: "lift_shift", techDebtScore: 87, ownerId: admin.id, vendor: "Internal" },
  ]);
  console.log(`✅ APM applications: 4`);

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
