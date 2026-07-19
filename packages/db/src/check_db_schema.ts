import { getDb, sql } from "./index";

async function main() {
  const db = getDb();

  console.log("=== CHECKING COLUMNS FOR organizations ===");
  const colRes = await db.execute(sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'organizations'
    AND column_name IN ('onboarding_step', 'onboarding_completed_at', 'onboarding_completed_by', 'onboarding_last_edited_by')
  `);
  console.log(JSON.stringify(colRes, null, 2));

  console.log("=== CHECKING INDEXES ON gstin_registry ===");
  const indexRes = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'gstin_registry'
  `);
  console.log(JSON.stringify(indexRes, null, 2));

  console.log("=== CHECKING TARGET ORG 9b6473e5-bec5-4d4c-b7e2-0bee3d65db9c ===");
  const orgRes = await db.execute(sql`
    SELECT id, name, onboarding_step, onboarding_completed_at
    FROM organizations
    WHERE id = '9b6473e5-bec5-4d4c-b7e2-0bee3d65db9c'
  `);
  console.log(JSON.stringify(orgRes, null, 2));

  process.exit(0);
}

main().catch(console.error);
