import { getDb, sql } from "./index";

async function main() {
  const db = getDb();
  console.log("=== LISTING ALL ORGANIZATIONS ===");
  const orgs = await db.execute(sql`
    SELECT id, name, onboarding_step, onboarding_completed_at
    FROM organizations
  `);
  console.log(JSON.stringify(orgs, null, 2));
  process.exit(0);
}

main().catch(console.error);
