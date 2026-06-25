import postgres from "postgres";

const sql = postgres("postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect");

async function run() {
  await sql`ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL;`;
  await sql`ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;`;
  console.log("Done");
  process.exit(0);
}

run().catch(console.error);
