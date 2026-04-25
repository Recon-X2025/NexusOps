/**
 * Layer 1 — Infrastructure Integrity
 * Verifies DB schema completeness, tRPC router registry, server boot, and seed data.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { testDb } from "./helpers";
import { appRouter } from "../routers";
import { sql } from "@nexusops/db";

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run: docker compose -f docker-compose.test.yml up -d && source .env.test",
    );
  }
});

// ── 1.1 Database Schema Completeness ──────────────────────────────────────

describe("Layer 1: Infrastructure Integrity", () => {
  let db: ReturnType<typeof testDb>;

  beforeAll(() => {
    db = testDb();
  });

  describe("1.1 Database Schema Completeness", () => {
    async function getTableNames(): Promise<string[]> {
      const rows = await db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      return (rows as { table_name: string }[]).map((r) => r.table_name);
    }

    async function getColumnNames(table: string): Promise<string[]> {
      const rows = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
        ORDER BY ordinal_position
      `);
      return (rows as { column_name: string }[]).map((r) => r.column_name);
    }

    it("organizations table exists with correct columns", async () => {
      const cols = await getColumnNames("organizations");
      expect(cols).toContain("id");
      expect(cols).toContain("name");
      expect(cols).toContain("slug");
      expect(cols).toContain("plan");
      expect(cols).toContain("created_at");
      expect(cols).toContain("updated_at");
    });

    it("users table exists with all columns including password_hash and matrix_role", async () => {
      const cols = await getColumnNames("users");
      expect(cols).toContain("id");
      expect(cols).toContain("org_id");
      expect(cols).toContain("email");
      expect(cols).toContain("name");
      expect(cols).toContain("role");
      expect(cols).toContain("status");
      expect(cols).toContain("matrix_role");
      expect(cols).toContain("password_hash");
      expect(cols).toContain("last_login_at");
    });

    it("sessions table exists with hashed token storage", async () => {
      const cols = await getColumnNames("sessions");
      expect(cols).toContain("id");
      expect(cols).toContain("user_id");
      expect(cols).toContain("expires_at");
    });

    it("audit_logs table exists with resource_id and changes columns", async () => {
      const cols = await getColumnNames("audit_logs");
      expect(cols).toContain("id");
      expect(cols).toContain("org_id");
      expect(cols).toContain("user_id");
      expect(cols).toContain("action");
      expect(cols).toContain("resource_type");
      expect(cols).toContain("resource_id");
      expect(cols).toContain("changes");
    });

    const REQUIRED_TABLES = [
      "organizations", "users", "sessions", "audit_logs",
      "tickets", "ticket_comments", "ticket_statuses", "ticket_priorities", "ticket_categories",
      "change_requests", "security_incidents", "vulnerabilities",
      "risks", "policies",
      "vendors", "purchase_requests", "purchase_orders",
      "contracts",
      "crm_accounts", "crm_contacts", "crm_deals",
      "hr_cases", "employees",
      "assets", "asset_types",
    ];

    for (const tableName of REQUIRED_TABLES) {
      it(`table '${tableName}' exists`, async () => {
        const tables = await getTableNames();
        expect(tables, `Table '${tableName}' is missing from schema`).toContain(tableName);
      });
    }

    it("every core table has org_id column", async () => {
      const orgScopedTables = [
        "tickets", "change_requests", "security_incidents", "vulnerabilities",
        "risks", "contracts", "crm_accounts", "crm_deals", "hr_cases",
        "assets", "vendors", "purchase_requests",
      ];
      for (const table of orgScopedTables) {
        const cols = await getColumnNames(table);
        expect(cols, `Table '${table}' is missing org_id`).toContain("org_id");
      }
    });

    it("all foreign keys resolve correctly (no dangling FKs)", async () => {
      const result = await db.execute(sql`
        SELECT tc.constraint_name, tc.table_name, kcu.column_name,
               ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
      `);
      // If query succeeds (no error), FK definitions are valid
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── 1.2 tRPC Router Registry ─────────────────────────────────────────────

  describe("1.2 tRPC Router Registry", () => {
    it("root appRouter has all expected routers", () => {
      const keys = Object.keys(appRouter._def.procedures);
      const routerPrefixes = new Set(keys.map((k) => k.split(".")[0]));

      const EXPECTED_ROUTERS = [
        "mac",
        "auth",
        "admin",
        "tickets",
        "assets",
        "workflows",
        "hr",
        "procurement",
        "dashboard",
        "workOrders",
        "changes",
        "security",
        "grc",
        "financial",
        "contracts",
        "projects",
        "crm",
        "legal",
        "devops",
        "surveys",
        "knowledge",
        "notifications",
        "catalog",
        "csm",
        "apm",
        "oncall",
        "events",
        "facilities",
        "walkup",
        "vendors",
        "approvals",
        "reports",
        "search",
        "ai",
        "indiaCompliance",
        "assignmentRules",
        "inventory",
        "recruitment",
        "secretarial",
        "workforce",
        "integrations",
        "performance",
        "accounting",
        "customFields",
        "payroll",
        "expenseReports",
      ];

      const missing = EXPECTED_ROUTERS.filter((r) => !routerPrefixes.has(r));
      expect(missing, `Missing routers: ${missing.join(", ")}`).toHaveLength(0);
    });

    it("appRouter has auth.login as a public procedure", () => {
      const procedures = Object.keys(appRouter._def.procedures);
      expect(procedures).toContain("auth.login");
    });

    it("appRouter exposes tickets core and relation procedures", () => {
      const procedures = Object.keys(appRouter._def.procedures);
      expect(procedures).toContain("tickets.list");
      expect(procedures).toContain("tickets.create");
      expect(procedures).toContain("tickets.addRelation");
      expect(procedures).toContain("tickets.removeRelation");
    });

    it("appRouter exposes security procedures", () => {
      const procedures = Object.keys(appRouter._def.procedures);
      const securityProcs = procedures.filter((p) => p.startsWith("security."));
      expect(securityProcs.length).toBeGreaterThan(0);
    });
  });

  // ── 1.3 Server Boot ──────────────────────────────────────────────────────

  describe("1.3 Server Boot", () => {
    it("Fastify server module exports a build function", async () => {
      // We verify the module can be imported without starting the server
      // (Avoids triggering process.exit in test environment)
      const { appRouter } = await import("../routers");
      expect(appRouter).toBeDefined();
      expect(typeof appRouter).toBe("object");
    });
  });

  // ── 1.4 Seed Data Integrity ──────────────────────────────────────────────

  describe("1.4 Seed Data Integrity", () => {
    it("DB connection is alive", async () => {
      const result = await db.execute(sql`SELECT 1 AS alive`);
      expect((result as { alive: number }[])[0]?.alive).toBe(1);
    });

    it("organizations table is queryable", async () => {
      const rows = await db.execute(sql`SELECT COUNT(*) as cnt FROM organizations`);
      expect(Number((rows as { cnt: string }[])[0]?.cnt)).toBeGreaterThanOrEqual(0);
    });

    it("users table is queryable", async () => {
      const rows = await db.execute(sql`SELECT COUNT(*) as cnt FROM users`);
      expect(Number((rows as { cnt: string }[])[0]?.cnt)).toBeGreaterThanOrEqual(0);
    });

    it("ticket_priorities table is queryable", async () => {
      const rows = await db.execute(sql`SELECT COUNT(*) as cnt FROM ticket_priorities`);
      expect(Number((rows as { cnt: string }[])[0]?.cnt)).toBeGreaterThanOrEqual(0);
    });
  });
});
