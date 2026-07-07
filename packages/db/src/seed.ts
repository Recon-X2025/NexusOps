/**
 * Seed the CoheronConnect database with the base CoheronConnect HQ organization.
 *
 * This seed is intentionally minimal: it provisions the org, the named login
 * users, RBAC, and the small config/lookup tables (ticket categories/priorities/
 * statuses, asset types, chart of accounts, CRM pipeline stages, service catalog)
 * that the app needs to render and that E2E login relies on. It does NOT create
 * bulk demo records (tickets, deals, assets, etc.) — those are generated on demand
 * by the product, not baked into the seed.
 */


import { getDb } from "./client";
import {
  organizations, users, roles, permissions, rolePermissions, userRoles,
  ticketCategories, ticketPriorities, ticketStatuses, assetTypes,
  crmPipelineStages, chartOfAccounts, catalogItems,
} from "./schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const BASE_ORG_SLUG = "coheron-demo";

export async function seed() {
  const db = getDb();
  console.log("🌱 Seeding CoheronConnect database (base org + users + RBAC + config)...");

  // ── Organization ───────────────────────────────────────────────────────────
  const [org] = await db.insert(organizations).values({
    name: "CoheronConnect HQ", slug: BASE_ORG_SLUG, plan: "professional", primaryColor: "#00BCFF",
  }).onConflictDoNothing().returning();

  const isNew = !!org;
  let seedOrg = org;
  if (!seedOrg) {
    // Org exists — fetch it and only update passwords
    const [existing] = await db.select().from(organizations).where(eq(organizations.slug, BASE_ORG_SLUG));
    seedOrg = existing!;
    console.log(`ℹ️  Org already exists: ${seedOrg.name} (${seedOrg.id})`);
  } else {
    console.log(`✅ Organization: ${seedOrg.name} (${seedOrg.id})`);
  }
  const orgId = seedOrg.id;

  // ── Users ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("demo1234!", 12);

  // Named users required for login and specific matrix roles.
  const coreUserSeed = [
    { email: "admin@coheron.com", name: "Administrator", role: "owner" as const },
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

  await db.insert(users).values(
    coreUserSeed.map((u) => ({
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

  const admin = allUsers.find((u) => u.email === "admin@coheron.com") ?? allUsers[0]!;
  const agent1 = allUsers.find((u) => u.email === "agent1@coheron.com") ?? allUsers[1]!;
  const agent2 = allUsers.find((u) => u.email === "agent2@coheron.com") ?? allUsers[2]!;
  console.log(`✅ Users: ${allUsers.length} (passwords updated)`);

  if (!isNew && process.env.FORCE_SEED !== "true") {
    console.log("ℹ️  Skipping config seed (org already exists). Run against a fresh DB to re-seed everything.");
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
  await db.insert(ticketCategories).values([
    { orgId: orgId, name: "IT Support", color: "#00BCFF", icon: "monitor", sortOrder: 0 },
    { orgId: orgId, name: "HR", color: "#ec4899", icon: "users", sortOrder: 1 },
    { orgId: orgId, name: "Facilities", color: "#f59e0b", icon: "building", sortOrder: 2 },
    { orgId: orgId, name: "Finance", color: "#10b981", icon: "dollar-sign", sortOrder: 3 },
    { orgId: orgId, name: "Security", color: "#ef4444", icon: "shield", sortOrder: 4 },
  ]).onConflictDoNothing();

  await db.insert(ticketPriorities).values([
    { orgId: orgId, name: "Critical", color: "#ef4444", slaResponseMinutes: 30, slaResolveMinutes: 240, sortOrder: 0 },
    { orgId: orgId, name: "High", color: "#f97316", slaResponseMinutes: 60, slaResolveMinutes: 480, sortOrder: 1 },
    { orgId: orgId, name: "Medium", color: "#f59e0b", slaResponseMinutes: 240, slaResolveMinutes: 1440, sortOrder: 2 },
    { orgId: orgId, name: "Low", color: "#6b7280", slaResponseMinutes: 480, slaResolveMinutes: 4320, sortOrder: 3 },
  ]).onConflictDoNothing();

  await db.insert(ticketStatuses).values([
    { orgId: orgId, name: "Open", color: "#00BCFF", category: "open", sortOrder: 0 },
    { orgId: orgId, name: "In Progress", color: "#f59e0b", category: "in_progress", sortOrder: 1 },
    { orgId: orgId, name: "Pending", color: "#94a3b8", category: "pending", sortOrder: 2 },
    { orgId: orgId, name: "Resolved", color: "#00C971", category: "resolved", sortOrder: 3 },
    { orgId: orgId, name: "Closed", color: "#6b7280", category: "closed", sortOrder: 4 },
  ]).onConflictDoNothing();
  console.log(`✅ Ticket config: categories, priorities, statuses`);

  // ── Asset Types ────────────────────────────────────────────────────────────
  await db.insert(assetTypes).values([
    { orgId: orgId, name: "Laptop", icon: "laptop", fieldsSchema: [] },
    { orgId: orgId, name: "Server", icon: "server", fieldsSchema: [] },
    { orgId: orgId, name: "Network", icon: "wifi", fieldsSchema: [] },
  ]).onConflictDoNothing();
  console.log(`✅ Asset types: 3`);

  // ── Chart of Accounts ──────────────────────────────────────────────────────
  // Standard India COA so finance pages (reconciliation, ledger, journal) have
  // bank/cash accounts on a fresh DB. Mirrors INDIA_COA_SEED in the API router.
  const coaSeed: { code: string; name: string; type: "asset" | "liability" | "equity" | "income" | "expense" | "contra_asset"; subType: string; isSystem: boolean; parentCode: string | null }[] = [
    { code: "1000", name: "Assets", type: "asset", subType: "other_asset", isSystem: true, parentCode: null },
    { code: "1100", name: "Current Assets", type: "asset", subType: "other_current_asset", isSystem: true, parentCode: "1000" },
    { code: "1110", name: "Cash and Cash Equivalents", type: "asset", subType: "cash", isSystem: true, parentCode: "1100" },
    { code: "1120", name: "Bank Accounts", type: "asset", subType: "bank", isSystem: false, parentCode: "1100" },
    { code: "1130", name: "Accounts Receivable (Trade)", type: "asset", subType: "accounts_receivable", isSystem: true, parentCode: "1100" },
    { code: "1140", name: "GST Input Tax Credit (ITC)", type: "asset", subType: "other_current_asset", isSystem: true, parentCode: "1100" },
    { code: "1200", name: "Fixed Assets", type: "asset", subType: "fixed_asset", isSystem: false, parentCode: "1000" },
    { code: "2000", name: "Liabilities", type: "liability", subType: "other_current_liability", isSystem: true, parentCode: null },
    { code: "2100", name: "Current Liabilities", type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2000" },
    { code: "2110", name: "Accounts Payable (Trade)", type: "liability", subType: "accounts_payable", isSystem: true, parentCode: "2100" },
    { code: "2120", name: "GST Payable", type: "liability", subType: "other_current_liability", isSystem: true, parentCode: "2100" },
    { code: "3000", name: "Equity", type: "equity", subType: "owners_equity", isSystem: true, parentCode: null },
    { code: "3100", name: "Share Capital", type: "equity", subType: "share_capital", isSystem: false, parentCode: "3000" },
    { code: "3200", name: "Retained Earnings", type: "equity", subType: "retained_earnings", isSystem: true, parentCode: "3000" },
    { code: "4000", name: "Income", type: "income", subType: "income", isSystem: true, parentCode: null },
    { code: "4100", name: "Revenue from Operations", type: "income", subType: "income", isSystem: true, parentCode: "4000" },
    { code: "5000", name: "Expenses", type: "expense", subType: "expense", isSystem: true, parentCode: null },
    { code: "5100", name: "Cost of Revenue", type: "expense", subType: "cost_of_goods_sold", isSystem: false, parentCode: "5000" },
    { code: "5300", name: "Office & Admin Expenses", type: "expense", subType: "expense", isSystem: false, parentCode: "5000" },
  ];
  const coaCodeToId = new Map<string, string>();
  for (const acct of coaSeed) {
    const parentId = acct.parentCode ? coaCodeToId.get(acct.parentCode) : undefined;
    const [inserted] = await db.insert(chartOfAccounts).values({
      orgId,
      code: acct.code,
      name: acct.name,
      type: acct.type,
      subType: acct.subType as never,
      parentId,
      isSystem: acct.isSystem,
      openingBalance: "0",
      currentBalance: "0",
    }).onConflictDoNothing().returning();
    if (inserted) coaCodeToId.set(acct.code, inserted.id);
  }
  console.log(`✅ Chart of accounts: ${coaCodeToId.size}`);

  // ── CRM Pipeline Stages ──────────────────────────────────────────────────────
  await db.insert(crmPipelineStages).values([
    { orgId, key: "prospect" as const,      label: "Prospect",      color: "text-muted-foreground bg-muted", rank: 0, active: true },
    { orgId, key: "qualification" as const, label: "Qualification", color: "text-blue-700 bg-blue-100",      rank: 1, active: true },
    { orgId, key: "proposal" as const,      label: "Proposal",      color: "text-indigo-700 bg-indigo-100",  rank: 2, active: true },
    { orgId, key: "negotiation" as const,   label: "Negotiation",   color: "text-purple-700 bg-purple-100",  rank: 3, active: true },
    { orgId, key: "verbal_commit" as const, label: "Verbal Commit", color: "text-orange-700 bg-orange-100",  rank: 4, active: true },
    { orgId, key: "closed_won" as const,    label: "Closed Won",    color: "text-green-700 bg-green-100",     rank: 5, active: false },
    { orgId, key: "closed_lost" as const,   label: "Closed Lost",   color: "text-red-700 bg-red-100",         rank: 6, active: false },
  ]).onConflictDoNothing();
  console.log(`✅ CRM pipeline stages: 7`);

  // ── Service Catalog ────────────────────────────────────────────────────────
  await db.insert(catalogItems).values([
    { orgId: orgId, name: "New Laptop Request", description: "Request a new laptop for business use", category: "Hardware", approvalRequired: true, fulfillmentGroup: "IT Hardware", slaDays: 5, sortOrder: 1 },
    { orgId: orgId, name: "Software Access Request", description: "Request access to business software", category: "Software", approvalRequired: true, fulfillmentGroup: "IT Software", slaDays: 3, sortOrder: 2 },
    { orgId: orgId, name: "VPN Account Setup", description: "Set up VPN access for remote work", category: "Network", approvalRequired: false, fulfillmentGroup: "IT Network", slaDays: 1, sortOrder: 3 },
    { orgId: orgId, name: "Desk Booking", description: "Book a hot desk or office space", category: "Facilities", approvalRequired: false, fulfillmentGroup: "Facilities", slaDays: 1, sortOrder: 4 },
    { orgId: orgId, name: "Training Course Enrollment", description: "Enroll in corporate training", category: "Learning", approvalRequired: true, fulfillmentGroup: "HR", slaDays: 7, sortOrder: 5 },
  ]).onConflictDoNothing();
  console.log(`✅ Catalog items: 5`);

  console.log("\n🎉 Base seed complete!");
  console.log(`   Organization:  ${seedOrg.name}`);
  console.log(`   Admin login:   admin@coheron.com / demo1234!`);
  console.log(`   Agent login:   agent1@coheron.com / demo1234!`);
  console.log(`   Org slug:      ${seedOrg.slug}`);

}

if (process.argv[1] && (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"))) {
  seed()
    .then(() => {
      console.log("✅ Seed execution completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Seed failed:", err);
      process.exit(1);
    });
}
