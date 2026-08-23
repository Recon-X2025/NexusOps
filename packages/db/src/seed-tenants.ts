/**
 * Two parallel, realistically-shaped tenants — built from the ground up.
 *
 * WHY THIS EXISTS. Isolation defects are invisible on a single-tenant database:
 * a cross-tenant foreign key cannot be expressed when there is only one tenant,
 * so `scripts/check-cross-tenant-fks.mjs` returns a clean result that proves
 * nothing. Every isolation finding this repo has recorded needed two tenants to
 * demonstrate. This seed provides them permanently.
 *
 * NOT a return of the removed `coheron-demo` bulk seed. CLAUDE.md forbids that
 * one, and rightly: it manufactured 100 employees of fictional operating data
 * that then flowed into executive dashboards as if it were real. This seed
 * builds STRUCTURE — organisations, roles, logins, an employee hierarchy,
 * configuration — and deliberately no operating data. Nothing here should ever
 * reach a metric.
 *
 * ORDER IS GROUND-UP AND DELIBERATE. Each layer only references the one below,
 * so a partial run leaves a coherent tenant rather than dangling references:
 *
 *   1  organisation
 *   2  permissions          (global table, shared across tenants)
 *   3  roles + grants       (per tenant)
 *   4  logins               (one per matrix role, so every role is reachable)
 *   5  employees            (a real reporting tree — see MANAGER HIERARCHY)
 *   6  role assignments
 *   7  ticket configuration
 *   8  approval chains      (populated, with real approvers)
 *
 * MANAGER HIERARCHY. `employees.manager_id` is an unconstrained uuid column —
 * no foreign key — and on a fresh database no employee has one set. That makes
 * "route approvals up the line of command" impossible to build or test. This
 * seed therefore constructs a genuine three-level tree: individual contributors
 * report to functional managers, managers report to the two department heads,
 * and both heads report to the chief executive.
 *
 * IDEMPOTENT AND NON-DESTRUCTIVE. Re-running skips a tenant that already
 * exists. It never deletes. The two tenants are intended to persist.
 *
 *   pnpm --filter @coheronconnect/db db:seed:tenants
 */
import { getDb } from "./client";
import {
  organizations, users, roles, permissions, rolePermissions, userRoles,
  employees, ticketCategories, ticketPriorities, ticketStatuses,
  approvalChains,
} from "./schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { assertSeedAllowed } from "./seed-guard";

/** Shared across both tenants so a tester can log into either without notes. */
const PASSWORD = "demo1234!";

/**
 * Every matrix role the product recognises. One login each, per tenant, so no
 * role is unreachable when testing a permission boundary.
 */
const MATRIX_ROLES = [
  "admin", "approver", "catalog_admin", "change_manager", "cmdb_admin",
  "company_secretary", "field_service", "finance_manager", "grc_analyst",
  "hr_analyst", "hr_manager", "itil", "itil_admin", "itil_manager",
  "legal_counsel", "manager_ops", "operator_field", "privacy_officer",
  "problem_manager", "procurement_admin", "procurement_analyst",
  "project_manager", "report_viewer", "requester", "security_admin",
  "security_analyst", "vendor_manager",
] as const;

/** Which department each role sits in — drives the reporting tree in layer 5. */
const ROLE_DEPARTMENT: Record<string, "operations" | "corporate"> = {
  admin: "corporate", approver: "corporate", catalog_admin: "operations",
  change_manager: "operations", cmdb_admin: "operations",
  company_secretary: "corporate", field_service: "operations",
  finance_manager: "corporate", grc_analyst: "corporate",
  hr_analyst: "corporate", hr_manager: "corporate", itil: "operations",
  itil_admin: "operations", itil_manager: "operations",
  legal_counsel: "corporate", manager_ops: "operations",
  operator_field: "operations", privacy_officer: "corporate",
  problem_manager: "operations", procurement_admin: "corporate",
  procurement_analyst: "corporate", project_manager: "operations",
  report_viewer: "operations", requester: "operations",
  security_admin: "operations", security_analyst: "operations",
  vendor_manager: "corporate",
};

/** The two roles that head a department — everyone else in it reports to them. */
const DEPARTMENT_HEAD: Record<string, string> = {
  operations: "manager_ops",
  corporate: "finance_manager",
};

interface TenantSpec {
  slug: string;
  name: string;
  /** Distinct domains so a cross-tenant mix-up is obvious in any output. */
  domain: string;
  ceoName: string;
}

const TENANTS: TenantSpec[] = [
  { slug: "meridian-textiles", name: "Meridian Textiles Pvt Ltd", domain: "meridian.test", ceoName: "Asha Meridian" },
  { slug: "calibre-analytics", name: "Calibre Analytics LLP",     domain: "calibre.test", ceoName: "Rohan Calibre" },
];

function titleise(role: string): string {
  return role.split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

async function seedTenant(spec: TenantSpec, passwordHash: string): Promise<void> {
  const db = getDb();

  // ── 1. organisation ───────────────────────────────────────────────────────
  const existing = await db.select().from(organizations).where(eq(organizations.slug, spec.slug));
  if (existing.length > 0) {
    console.log(`↩︎  ${spec.slug} already exists — skipping (this seed never deletes)`);
    return;
  }
  const [org] = await db.insert(organizations).values({
    name: spec.name,
    slug: spec.slug,
  }).returning();
  const orgId = org!.id;
  console.log(`\n🏢 ${spec.name}  (${orgId})`);

  // ── 2. permissions — GLOBAL, shared by every tenant ───────────────────────
  const resources = ["tickets","assets","cmdb","workflows","hr","procurement","reports","settings","users","integrations","financial","changes","security","grc","contracts","projects","crm","legal","devops","surveys","approvals"];
  const actions = ["create","read","update","delete","manage"] as const;
  await db.insert(permissions)
    .values(resources.flatMap((r) => actions.map((a) => ({ resource: r, action: a }))))
    .onConflictDoNothing();
  const allPerms = await db.select().from(permissions);

  // ── 3. roles + grants (per tenant) ────────────────────────────────────────
  await db.insert(roles).values([
    { orgId, name: "Admin",    description: "Full access",        isSystem: true },
    { orgId, name: "Manager",  description: "Departmental lead",  isSystem: true },
    { orgId, name: "Employee", description: "Self-service",       isSystem: true },
  ]).onConflictDoNothing();
  const orgRoles = await db.select().from(roles).where(eq(roles.orgId, orgId));
  const adminRole = orgRoles.find((r) => r.name === "Admin")!;
  const managerRole = orgRoles.find((r) => r.name === "Manager")!;
  const employeeRole = orgRoles.find((r) => r.name === "Employee")!;
  if (allPerms.length > 0) {
    await db.insert(rolePermissions)
      .values(allPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })))
      .onConflictDoNothing();
    await db.insert(rolePermissions)
      .values(allPerms.filter((p) => p.action === "read").map((p) => ({ roleId: employeeRole.id, permissionId: p.id })))
      .onConflictDoNothing();
  }
  console.log(`   roles: ${orgRoles.length}  ·  permissions granted`);

  // ── 4. logins — one per matrix role, plus the chief executive ─────────────
  const ceoEmail = `ceo@${spec.domain}`;
  const [ceo] = await db.insert(users).values({
    orgId, email: ceoEmail, name: spec.ceoName,
    role: "owner", matrixRole: "admin", passwordHash, status: "active",
  }).returning();

  const roleUsers: Record<string, string> = {};
  for (const mr of MATRIX_ROLES) {
    const [u] = await db.insert(users).values({
      orgId,
      email: `${mr.replace(/_/g, ".")}@${spec.domain}`,
      name: `${titleise(mr)} — ${spec.name.split(" ")[0]}`,
      role: mr === "admin" ? "admin" : "member",
      matrixRole: mr,
      passwordHash,
      status: "active",
    }).returning();
    roleUsers[mr] = u!.id;
  }
  console.log(`   logins: ${MATRIX_ROLES.length + 1}  (password for all: ${PASSWORD})`);

  // ── 5. employees + the reporting tree ─────────────────────────────────────
  // Ground-up: the CEO exists first with no manager, then the two department
  // heads report to the CEO, then everyone else reports to their head.
  const [ceoEmp] = await db.insert(employees).values({
    orgId, userId: ceo!.id, employeeId: "EMP-0001",
    department: "executive", status: "active",
  }).returning();

  const headEmpIds: Record<string, string> = {};
  let seq = 2;
  for (const [dept, headRole] of Object.entries(DEPARTMENT_HEAD)) {
    const [e] = await db.insert(employees).values({
      orgId, userId: roleUsers[headRole]!,
      employeeId: `EMP-${String(seq++).padStart(4, "0")}`,
      department: dept, status: "active", managerId: ceoEmp!.id,
    }).returning();
    headEmpIds[dept] = e!.id;
  }

  let icCount = 0;
  for (const mr of MATRIX_ROLES) {
    if (Object.values(DEPARTMENT_HEAD).includes(mr)) continue; // already placed
    const dept = ROLE_DEPARTMENT[mr] ?? "operations";
    await db.insert(employees).values({
      orgId, userId: roleUsers[mr]!,
      employeeId: `EMP-${String(seq++).padStart(4, "0")}`,
      department: dept, status: "active", managerId: headEmpIds[dept]!,
    });
    icCount++;
  }
  console.log(`   employees: ${icCount + 3}  ·  hierarchy: ${icCount} → 2 heads → 1 CEO`);

  // ── 6. role assignments ───────────────────────────────────────────────────
  await db.insert(userRoles).values([
    { userId: ceo!.id, roleId: adminRole.id },
    { userId: roleUsers["admin"]!, roleId: adminRole.id },
    { userId: roleUsers["manager_ops"]!, roleId: managerRole.id },
    { userId: roleUsers["finance_manager"]!, roleId: managerRole.id },
  ]).onConflictDoNothing();

  // ── 7. ticket configuration ───────────────────────────────────────────────
  await db.insert(ticketPriorities).values([
    { orgId, name: "P1 - Critical", color: "#ef4444", slaResponseMinutes: 15,  slaResolveMinutes: 240,  sortOrder: 1 },
    { orgId, name: "P2 - High",     color: "#f97316", slaResponseMinutes: 60,  slaResolveMinutes: 480,  sortOrder: 2 },
    { orgId, name: "P3 - Medium",   color: "#eab308", slaResponseMinutes: 240, slaResolveMinutes: 1440, sortOrder: 3 },
  ]);
  await db.insert(ticketStatuses).values([
    { orgId, name: "Open",        category: "open",        color: "#6366f1", sortOrder: 1 },
    { orgId, name: "In Progress", category: "in_progress", color: "#f97316", sortOrder: 2 },
    { orgId, name: "Resolved",    category: "resolved",    color: "#22c55e", sortOrder: 3 },
  ]);
  await db.insert(ticketCategories).values([
    { orgId, name: "Hardware", sortOrder: 1 },
    { orgId, name: "Software", sortOrder: 2 },
  ]);

  // ── 8. approval chains — POPULATED, unlike the hollow ones on dev ─────────
  // Money paths route to a named approver; everything else routes to the
  // department head. Both are real user ids in THIS org, so nothing here can
  // route across tenants.
  const financeApprover = roleUsers["finance_manager"]!;
  const opsApprover = roleUsers["manager_ops"]!;
  await db.insert(approvalChains).values([
    { orgId, entityType: "purchase_request", name: "Purchase requests — finance",  isActive: true, rules: [{ approvers: [financeApprover], threshold: 0 }] },
    { orgId, entityType: "expense_claim",    name: "Expense claims — finance",     isActive: true, rules: [{ approvers: [financeApprover], threshold: 0 }] },
    { orgId, entityType: "contract",         name: "Contracts — legal then finance", isActive: true, rules: [{ approvers: [roleUsers["legal_counsel"]!], threshold: 0 }, { approvers: [financeApprover], threshold: 0 }] },
    { orgId, entityType: "change_request",   name: "Change requests — operations", isActive: true, rules: [{ approvers: [opsApprover], threshold: 0 }] },
  ] as never);
  console.log(`   approval chains: 4, all populated`);
}

export async function seedTenants(): Promise<void> {
  assertSeedAllowed("db:seed:tenants");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  console.log("🌱 Seeding two parallel tenants (structure only — no operating data)");
  for (const spec of TENANTS) await seedTenant(spec, passwordHash);
  console.log("\n✅ Done. Both tenants persist; re-running skips what exists.\n");
}

seedTenants()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ seed:tenants failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
