const postgres = require('postgres');
const sql = postgres('postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect');
async function run() {
  console.log('connected');
  try { await sql`CREATE TYPE facility_request_status AS ENUM('open', 'in_progress', 'done')`; } catch(e){}
  await sql`ALTER TABLE facility_requests ADD COLUMN IF NOT EXISTS status facility_request_status NOT NULL DEFAULT 'open'`;
  console.log('done');
  process.exit(0);
}
run().catch(console.error);
