import postgres from "postgres";

const sql = postgres("postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect");

async function run() {
  await sql`ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "phone" text;`;
  await sql`ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "title" text;`;
  await sql`ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;`;
  console.log("Done");
  process.exit(0);
}

run().catch(console.error);
