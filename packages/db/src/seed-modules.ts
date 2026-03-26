/**
 * Seed cross-module demo data for NexusOps.
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

const DEMO_ORG_SLUG = "coheron-demo";
const NOW = new Date();
const d = (days: number) => new Date(NOW.getTime() + days * 86400000);

async function seedModules() {
  const db = getDb();
  console.log("🌱 Seeding module data for NexusOps...\n");

  // ── Get existing org & users ───────────────────────────────────────────────
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (!org) { console.error("❌ Org not found. Run seed.ts first."); process.exit(1); }

  const allUsers = await db.select().from(users).where(eq(users.orgId, org.id));
  const admin = allUsers.find((u) => u.role === "owner") ?? allUsers[0]!;
  const agents = allUsers.filter((u) => u.role === "member");
  const agent1 = agents[0] ?? admin;
  const agent2 = agents[1] ?? admin;
  console.log(`✅ Using org: ${org.name}, ${allUsers.length} users`);

  // ── Change Requests ────────────────────────────────────────────────────────
  const [{ cnt: chgCnt }] = await db.select({ cnt: count() }).from(changeRequests).where(eq(changeRequests.orgId, org.id));
  if (Number(chgCnt) === 0) {
    await db.insert(changeRequests).values([
      { orgId: org.id, number: "CHG-0001", title: "Upgrade PostgreSQL to v17", type: "normal", risk: "medium", status: "cab_review", requesterId: admin.id, assigneeId: agent1.id, scheduledStart: d(7), scheduledEnd: d(8), rollbackPlan: "Restore from nightly backup" },
      { orgId: org.id, number: "CHG-0002", title: "Deploy new firewall rules", type: "emergency", risk: "high", status: "approved", requesterId: agent1.id, assigneeId: agent2.id },
      { orgId: org.id, number: "CHG-0003", title: "Office 365 tenant migration", type: "normal", risk: "high", status: "draft", requesterId: admin.id, scheduledStart: d(30) },
      { orgId: org.id, number: "CHG-0004", title: "SSL certificate renewal", type: "standard", risk: "low", status: "completed", requesterId: agent2.id },
      { orgId: org.id, number: "CHG-0005", title: "Kubernetes cluster upgrade", type: "normal", risk: "medium", status: "scheduled", requesterId: admin.id, scheduledStart: d(14) },
    ]);
    console.log("✅ Change requests: 5");
  } else {
    console.log(`ℹ️  Change requests already exist (${chgCnt}), skipping`);
  }

  // ── Problems ───────────────────────────────────────────────────────────────
  const [{ cnt: prbCnt }] = await db.select({ cnt: count() }).from(problems).where(eq(problems.orgId, org.id));
  if (Number(prbCnt) === 0) {
    await db.insert(problems).values([
      { orgId: org.id, number: "PRB-0001", title: "Recurring email server crashes", status: "investigation", priority: "critical", assigneeId: agent1.id },
      { orgId: org.id, number: "PRB-0002", title: "DB connection pool exhaustion", status: "root_cause_identified", priority: "high", assigneeId: agent2.id, rootCause: "Missing connection timeout" },
      { orgId: org.id, number: "PRB-0003", title: "VPN performance under load", status: "known_error", priority: "medium", workaround: "Restart VPN service daily" },
    ]);
    console.log("✅ Problems: 3");
  }

  // ── Security ───────────────────────────────────────────────────────────────
  const [{ cnt: secCnt }] = await db.select({ cnt: count() }).from(securityIncidents).where(eq(securityIncidents.orgId, org.id));
  if (Number(secCnt) === 0) {
    await db.insert(securityIncidents).values([
      { orgId: org.id, number: "SEC-0001", title: "Phishing campaign targeting finance", severity: "high", status: "triage", assigneeId: admin.id, reporterId: agent1.id, attackVector: "Email", mitreTechniques: ["T1566.001"] },
      { orgId: org.id, number: "SEC-0002", title: "Unauthorized API access attempt", severity: "medium", status: "containment", assigneeId: agent2.id, reporterId: admin.id, attackVector: "API" },
      { orgId: org.id, number: "SEC-0003", title: "Malware detected on endpoint", severity: "critical", status: "eradication", assigneeId: agent1.id, reporterId: admin.id, attackVector: "USB", mitreTechniques: ["T1091"] },
    ]);
    await db.insert(vulnerabilities).values([
      { orgId: org.id, cveId: "CVE-2024-1234", title: "OpenSSL Memory Corruption", severity: "critical", cvssScore: "9.8", status: "open", assigneeId: agent1.id },
      { orgId: org.id, title: "Outdated Apache version 2.4.51", severity: "high", status: "in_progress", assigneeId: agent2.id },
      { orgId: org.id, cveId: "CVE-2024-5678", title: "Log4j RCE Variant", severity: "critical", cvssScore: "10.0", status: "remediated", remediatedAt: d(-5) },
    ]);
    console.log("✅ Security: 3 incidents, 3 vulns");
  }

  // ── GRC Risks ──────────────────────────────────────────────────────────────
  const [{ cnt: rskCnt }] = await db.select({ cnt: count() }).from(risks).where(eq(risks.orgId, org.id));
  if (Number(rskCnt) === 0) {
    await db.insert(risks).values([
      { orgId: org.id, number: "RK-0001", title: "SPOF in primary database", category: "technology", likelihood: 3, impact: 5, riskScore: 15, status: "mitigating", treatment: "mitigate", ownerId: admin.id },
      { orgId: org.id, number: "RK-0002", title: "GDPR compliance gap", category: "compliance", likelihood: 4, impact: 4, riskScore: 16, status: "identified", treatment: "mitigate", ownerId: agent1.id },
      { orgId: org.id, number: "RK-0003", title: "Key vendor dependency", category: "operational", likelihood: 2, impact: 5, riskScore: 10, status: "accepted", treatment: "accept", ownerId: admin.id },
      { orgId: org.id, number: "RK-0004", title: "Insider threat - privileged accounts", category: "strategic", likelihood: 2, impact: 4, riskScore: 8, status: "mitigating", treatment: "mitigate", ownerId: agent2.id },
      { orgId: org.id, number: "RK-0005", title: "Ransomware on OT systems", category: "technology", likelihood: 3, impact: 5, riskScore: 15, status: "identified", treatment: "transfer", ownerId: admin.id },
    ]);
    console.log("✅ GRC risks: 5");
  }

  // ── Budget Lines ───────────────────────────────────────────────────────────
  const [{ cnt: budgCnt }] = await db.select({ cnt: count() }).from(budgetLines).where(eq(budgetLines.orgId, org.id));
  if (Number(budgCnt) === 0) {
    await db.insert(budgetLines).values([
      { orgId: org.id, category: "Infrastructure", department: "IT", fiscalYear: 2025, budgeted: "500000", committed: "320000", actual: "298000", forecast: "420000" },
      { orgId: org.id, category: "Software Licenses", department: "IT", fiscalYear: 2025, budgeted: "150000", committed: "120000", actual: "118000", forecast: "145000" },
      { orgId: org.id, category: "Personnel", department: "Engineering", fiscalYear: 2025, budgeted: "2000000", committed: "1850000", actual: "1720000", forecast: "1950000" },
      { orgId: org.id, category: "Marketing", department: "Marketing", fiscalYear: 2025, budgeted: "300000", committed: "200000", actual: "185000", forecast: "270000" },
      { orgId: org.id, category: "Professional Services", department: "Legal", fiscalYear: 2025, budgeted: "80000", committed: "60000", actual: "52000", forecast: "75000" },
    ]);
    console.log("✅ Budget lines: 5");
  }

  // ── Contracts ──────────────────────────────────────────────────────────────
  const [{ cnt: cntrCnt }] = await db.select({ cnt: count() }).from(contracts).where(eq(contracts.orgId, org.id));
  if (Number(cntrCnt) === 0) {
    await db.insert(contracts).values([
      { orgId: org.id, contractNumber: "CNTR-0001", title: "AWS Enterprise Agreement", counterparty: "Amazon Web Services", type: "vendor", status: "active", value: "240000", startDate: d(-365), endDate: d(365), autoRenew: true, internalOwnerId: admin.id },
      { orgId: org.id, contractNumber: "CNTR-0002", title: "Microsoft 365 E5 License", counterparty: "Microsoft Corporation", type: "license", status: "active", value: "85000", startDate: d(-180), endDate: d(185), autoRenew: true, internalOwnerId: admin.id },
      { orgId: org.id, contractNumber: "CNTR-0003", title: "ACME Corp MSA", counterparty: "ACME Corporation", type: "msa", status: "active", value: "120000", startDate: d(-90), endDate: d(275), autoRenew: false, internalOwnerId: agent1.id },
      { orgId: org.id, contractNumber: "CNTR-0004", title: "Salesforce CRM - NDA", counterparty: "Salesforce Inc", type: "nda", status: "expiring_soon", value: "0", startDate: d(-730), endDate: d(15), autoRenew: false, internalOwnerId: admin.id },
      { orgId: org.id, contractNumber: "CNTR-0005", title: "Zendesk SaaS Agreement", counterparty: "Zendesk Inc", type: "sla_support", status: "under_review", value: "24000", startDate: d(-30), endDate: d(335), autoRenew: true, internalOwnerId: agent1.id },
    ]);
    console.log("✅ Contracts: 5");
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  const [{ cnt: prjCnt }] = await db.select({ cnt: count() }).from(projects).where(eq(projects.orgId, org.id));
  if (Number(prjCnt) === 0) {
    const projectData = await db.insert(projects).values([
      { orgId: org.id, number: "PRJ-0001", name: "ERP Modernisation", status: "active", health: "amber", budgetTotal: "1200000", budgetSpent: "680000", startDate: d(-90), endDate: d(180), ownerId: admin.id, department: "IT" },
      { orgId: org.id, number: "PRJ-0002", name: "Zero Trust Security", status: "active", health: "green", budgetTotal: "350000", budgetSpent: "120000", startDate: d(-30), endDate: d(240), ownerId: agent1.id, department: "Security" },
      { orgId: org.id, number: "PRJ-0003", name: "HR Digital Transformation", status: "planning", health: "green", budgetTotal: "500000", budgetSpent: "0", startDate: d(30), endDate: d(365), ownerId: admin.id, department: "HR" },
    ]).returning();
    await db.insert(projectTasks).values([
      { projectId: projectData[0]!.id, title: "Vendor evaluation", status: "done", priority: "high", assigneeId: admin.id },
      { projectId: projectData[0]!.id, title: "Data migration strategy", status: "in_progress", priority: "critical", assigneeId: agent1.id },
      { projectId: projectData[1]!.id, title: "Identity provider integration", status: "in_progress", priority: "high", assigneeId: agent1.id },
    ]);
    console.log("✅ Projects: 3 with tasks");
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  const [{ cnt: crmCnt }] = await db.select({ cnt: count() }).from(crmAccounts).where(eq(crmAccounts.orgId, org.id));
  if (Number(crmCnt) === 0) {
    const crmAccountData = await db.insert(crmAccounts).values([
      { orgId: org.id, name: "Techwave Solutions", industry: "Technology", tier: "enterprise", healthScore: 85, annualRevenue: "45000000", ownerId: admin.id },
      { orgId: org.id, name: "Global Retail Group", industry: "Retail", tier: "mid_market", healthScore: 72, annualRevenue: "12000000", ownerId: agent1.id },
      { orgId: org.id, name: "FinServ Partners", industry: "Financial Services", tier: "enterprise", healthScore: 90, annualRevenue: "80000000", ownerId: admin.id },
    ]).returning();
    await db.insert(crmDeals).values([
      { orgId: org.id, title: "Techwave Enterprise License", accountId: crmAccountData[0]!.id, stage: "negotiation", value: "250000", probability: 75, weightedValue: "187500", expectedClose: d(30), ownerId: admin.id },
      { orgId: org.id, title: "Global Retail Implementation", accountId: crmAccountData[1]!.id, stage: "proposal", value: "180000", probability: 50, weightedValue: "90000", expectedClose: d(45), ownerId: agent1.id },
      { orgId: org.id, title: "FinServ Platform Expansion", accountId: crmAccountData[2]!.id, stage: "verbal_commit", value: "420000", probability: 90, weightedValue: "378000", expectedClose: d(14), ownerId: admin.id },
      { orgId: org.id, title: "Healthcare Corp Renewal", accountId: crmAccountData[2]!.id, stage: "closed_won", value: "120000", probability: 100, weightedValue: "120000", closedAt: d(-7), ownerId: admin.id },
    ]);
    await db.insert(crmLeads).values([
      { orgId: org.id, firstName: "Jennifer", lastName: "Walsh", email: "j.walsh@infratech.com", company: "InfraTech", source: "referral", score: 85, status: "qualified", ownerId: admin.id },
      { orgId: org.id, firstName: "Marcus", lastName: "Okonjo", email: "m.okonjo@cloudco.io", company: "CloudCo", source: "website", score: 62, status: "contacted", ownerId: agent1.id },
      { orgId: org.id, firstName: "Sofia", lastName: "Reyes", email: "sofia@dataplex.net", company: "DataPlex", source: "event", score: 91, status: "qualified", ownerId: admin.id },
    ]);
    console.log("✅ CRM: 3 accounts, 4 deals, 3 leads");
  }

  // ── Legal ──────────────────────────────────────────────────────────────────
  const [{ cnt: legCnt }] = await db.select({ cnt: count() }).from(legalMatters).where(eq(legalMatters.orgId, org.id));
  if (Number(legCnt) === 0) {
    await db.insert(legalMatters).values([
      { orgId: org.id, matterNumber: "MAT-0001", title: "Employment dispute - Q3 2024", type: "employment", status: "active", assignedTo: admin.id, confidential: true, estimatedCost: "45000" },
      { orgId: org.id, matterNumber: "MAT-0002", title: "GDPR data breach notification", type: "data_privacy", status: "active", assignedTo: admin.id, confidential: false, estimatedCost: "25000" },
      { orgId: org.id, matterNumber: "MAT-0003", title: "Trademark registration", type: "ip", status: "intake", assignedTo: agent1.id, confidential: false, estimatedCost: "8000" },
    ]);
    console.log("✅ Legal: 3 matters");
  }

  // ── DevOps ─────────────────────────────────────────────────────────────────
  const [{ cnt: devCnt }] = await db.select({ cnt: count() }).from(pipelineRuns).where(eq(pipelineRuns.orgId, org.id));
  if (Number(devCnt) === 0) {
    const pipelineData = await db.insert(pipelineRuns).values([
      { orgId: org.id, pipelineName: "nexusops-api", trigger: "push", branch: "main", commitSha: "a3f9b2c", status: "success", durationSeconds: 342, completedAt: d(-0.1) },
      { orgId: org.id, pipelineName: "nexusops-web", trigger: "push", branch: "main", commitSha: "d8e1f4a", status: "success", durationSeconds: 428, completedAt: d(-0.2) },
      { orgId: org.id, pipelineName: "nexusops-api", trigger: "push", branch: "feature/crm", commitSha: "b2c7d9e", status: "failed", durationSeconds: 121, completedAt: d(-0.5) },
    ]).returning();
    await db.insert(deployments).values([
      { orgId: org.id, appName: "nexusops-api", environment: "production", version: "v2.4.1", status: "success", deployedById: admin.id, pipelineRunId: pipelineData[0]!.id, durationSeconds: 180 },
      { orgId: org.id, appName: "nexusops-web", environment: "production", version: "v2.4.1", status: "success", deployedById: admin.id, pipelineRunId: pipelineData[1]!.id, durationSeconds: 95 },
      { orgId: org.id, appName: "nexusops-api", environment: "staging", version: "v2.5.0-rc1", status: "in_progress", deployedById: agent1.id },
    ]);
    console.log("✅ DevOps: 3 pipelines, 3 deployments");
  }

  // ── Surveys ────────────────────────────────────────────────────────────────
  const [{ cnt: srvCnt }] = await db.select({ cnt: count() }).from(surveys).where(eq(surveys.orgId, org.id));
  if (Number(srvCnt) === 0) {
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
  const [{ cnt: kbCnt }] = await db.select({ cnt: count() }).from(kbArticles).where(eq(kbArticles.orgId, org.id));
  if (Number(kbCnt) === 0) {
    await db.insert(kbArticles).values([
      { orgId: org.id, title: "How to reset your VPN password", content: "Follow these steps to reset your VPN credentials...", category: "IT Support", status: "published", authorId: agent1.id, viewCount: 342, helpfulCount: 98 },
      { orgId: org.id, title: "Requesting new software access", content: "Use the Service Catalog to submit software access requests...", category: "IT Support", status: "published", authorId: agent2.id, viewCount: 289, helpfulCount: 74 },
      { orgId: org.id, title: "Expense reporting guidelines", content: "All expenses must be submitted within 30 days...", category: "Finance", status: "published", authorId: admin.id, viewCount: 156, helpfulCount: 62 },
      { orgId: org.id, title: "IT Security best practices", content: "Always use strong passwords and enable MFA...", category: "Security", status: "published", authorId: admin.id, viewCount: 412, helpfulCount: 188 },
      { orgId: org.id, title: "How to book a meeting room", content: "Use the Facilities portal to reserve rooms...", category: "Facilities", status: "published", authorId: agent1.id, viewCount: 201, helpfulCount: 55 },
    ]);
    console.log("✅ KB articles: 5");
  }

  // ── On-Call ────────────────────────────────────────────────────────────────
  const [{ cnt: ocCnt }] = await db.select({ cnt: count() }).from(oncallSchedules).where(eq(oncallSchedules.orgId, org.id));
  if (Number(ocCnt) === 0) {
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
  const [{ cnt: catCnt }] = await db.select({ cnt: count() }).from(catalogItems).where(eq(catalogItems.orgId, org.id));
  if (Number(catCnt) === 0) {
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
  const [{ cnt: bldCnt }] = await db.select({ cnt: count() }).from(buildings).where(eq(buildings.orgId, org.id));
  if (Number(bldCnt) === 0) {
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
  const [{ cnt: apmCnt }] = await db.select({ cnt: count() }).from(applications).where(eq(applications.orgId, org.id));
  if (Number(apmCnt) === 0) {
    await db.insert(applications).values([
      { orgId: org.id, name: "Salesforce CRM", category: "CRM", lifecycle: "sustaining", healthScore: 85, annualCost: "120000", usersCount: 250, cloudReadiness: "cloud_native", techDebtScore: 15, ownerId: admin.id, vendor: "Salesforce" },
      { orgId: org.id, name: "Legacy ERP (SAP R/3)", category: "ERP", lifecycle: "harvesting", healthScore: 45, annualCost: "350000", usersCount: 180, cloudReadiness: "rearchitect", techDebtScore: 78, ownerId: agent1.id, vendor: "SAP" },
      { orgId: org.id, name: "Jira Software", category: "Project Mgmt", lifecycle: "investing", healthScore: 92, annualCost: "45000", usersCount: 120, cloudReadiness: "cloud_native", techDebtScore: 5, ownerId: agent2.id, vendor: "Atlassian" },
      { orgId: org.id, name: "Custom HR Portal", category: "HR", lifecycle: "retiring", healthScore: 30, annualCost: "80000", usersCount: 450, cloudReadiness: "lift_shift", techDebtScore: 87, ownerId: admin.id, vendor: "Internal" },
    ]);
    console.log("✅ APM applications: 4");
  }

  // ── Vendors (extra check) ──────────────────────────────────────────────────
  const [{ cnt: vndCnt }] = await db.select({ cnt: count() }).from(vendors).where(eq(vendors.orgId, org.id));
  if (Number(vndCnt) === 0) {
    await db.insert(vendors).values([
      { orgId: org.id, name: "Dell Technologies", contactEmail: "sales@dell.com", status: "active", rating: "4.5", paymentTerms: "Net 30" },
      { orgId: org.id, name: "AWS Marketplace", contactEmail: "aws@amazon.com", status: "active", rating: "4.8", paymentTerms: "Monthly" },
      { orgId: org.id, name: "Office Supplies Co", contactEmail: "orders@officesupplies.com", status: "active", rating: "3.9", paymentTerms: "Net 15" },
    ]);
    await db.insert(purchaseRequests).values([
      { orgId: org.id, number: "PR-0001", title: "15x Laptop replacement", requesterId: admin.id, totalAmount: "37500", status: "approved", priority: "high", department: "IT" },
      { orgId: org.id, number: "PR-0002", title: "Network switches Q1", requesterId: agent1.id, totalAmount: "24000", status: "pending", priority: "medium", department: "IT" },
    ]);
    console.log("✅ Vendors: 3, PRs: 2");
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
