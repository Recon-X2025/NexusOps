import { config } from "dotenv";
config({ path: "../../.env" });
import { getDb, sql } from "@coheronconnect/db";

const DEFAULT_ROLES = [
  {
    id: "super_admin",
    name: "Super Admin",
    description: "Full root access across all platform modules, operator management, and tenant controls.",
    badgeCls: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
    isSystem: true,
    capabilities: {
      tenantsView: true,
      tenantsManage: true,
      tenantsSuspend: true,
      wizardOverride: true,
      operatorsManage: true,
      auditView: true,
      financeView: true,
      financeManage: true,
      workflowsView: true,
      systemHealth: true,
      complianceView: true,
      complianceManage: true,
    },
  },
  {
    id: "operations_staff",
    name: "Operations Staff",
    description: "Manages tenant onboarding wizard steps, flags, and workflow lifecycle operations.",
    badgeCls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    isSystem: true,
    capabilities: {
      tenantsView: true,
      tenantsManage: true,
      tenantsSuspend: false,
      wizardOverride: true,
      operatorsManage: false,
      auditView: true,
      financeView: true,
      financeManage: false,
      workflowsView: true,
      systemHealth: true,
      complianceView: true,
      complianceManage: false,
    },
  },
  {
    id: "support_staff",
    name: "Support Staff",
    description: "Read-only tenant inspection, ticket reviews, and customer onboarding verification.",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    isSystem: true,
    capabilities: {
      tenantsView: true,
      tenantsManage: false,
      tenantsSuspend: false,
      wizardOverride: false,
      operatorsManage: false,
      auditView: true,
      financeView: false,
      financeManage: false,
      workflowsView: false,
      systemHealth: true,
      complianceView: false,
      complianceManage: false,
    },
  },
  {
    id: "auditor",
    name: "Compliance Auditor",
    description: "Read-only access to audit logs, compliance evidence, security records, and export reports.",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    isSystem: true,
    capabilities: {
      tenantsView: true,
      tenantsManage: false,
      tenantsSuspend: false,
      wizardOverride: false,
      operatorsManage: false,
      auditView: true,
      financeView: true,
      financeManage: false,
      workflowsView: false,
      systemHealth: false,
      complianceView: true,
      complianceManage: false,
    },
  },
];

async function main() {
  const db = getDb();
  console.log("Setting up super_admin_roles table in PostgreSQL...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS super_admin_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      badge_cls TEXT NOT NULL DEFAULT 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300',
      is_system BOOLEAN NOT NULL DEFAULT false,
      capabilities JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  for (const role of DEFAULT_ROLES) {
    const existing = await db.execute(sql`
      SELECT id FROM super_admin_roles WHERE id = ${role.id};
    `);
    const rows = (existing as any).rows ?? (Array.isArray(existing) ? existing : []);
    if (rows.length === 0) {
      await db.execute(sql`
        INSERT INTO super_admin_roles (id, name, description, badge_cls, is_system, capabilities)
        VALUES (
          ${role.id},
          ${role.name},
          ${role.description},
          ${role.badgeCls},
          ${role.isSystem},
          ${JSON.stringify(role.capabilities)}::jsonb
        );
      `);
      console.log(`Seeded system role: ${role.name} (${role.id})`);
    } else {
      console.log(`System role already exists: ${role.id}`);
    }
  }

  console.log("super_admin_roles setup complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
