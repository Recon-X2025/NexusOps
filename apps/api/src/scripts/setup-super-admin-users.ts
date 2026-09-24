import { config } from "dotenv";
config({ path: "../../.env" });
import { getDb, sql } from "@coheronconnect/db";
import bcrypt from "bcrypt";

async function main() {
  const db = getDb();
  console.log("Setting up super_admin_users table...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS super_admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operations_staff',
      status TEXT NOT NULL DEFAULT 'active',
      phone TEXT,
      last_login_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS super_admin_users_role_idx ON super_admin_users(role);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS super_admin_users_status_idx ON super_admin_users(status);`);

  const defaultEmail = process.env["MAC_OPERATOR_EMAIL"] ?? "admin@coheron.tech";
  const defaultPassword = process.env["MAC_OPERATOR_PASSWORD"] ?? "mac-local-dev-password";

  const existing = await db.execute(sql`SELECT id, email FROM super_admin_users WHERE email = ${defaultEmail};`);
  const rows = (existing as any).rows ?? (Array.isArray(existing) ? existing : []);
  if (rows.length === 0) {
    const hash = await bcrypt.hash(defaultPassword, 10);
    await db.execute(sql`
      INSERT INTO super_admin_users (email, name, password_hash, role, status)
      VALUES (${defaultEmail}, 'Platform Super Admin', ${hash}, 'super_admin', 'active');
    `);
    console.log(`Successfully seeded default super admin: ${defaultEmail}`);
  } else {
    console.log(`Default super admin already exists: ${defaultEmail}`);
  }

  console.log("super_admin_users ready!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
