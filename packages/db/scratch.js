const postgres = require('postgres');
const sql = postgres('postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect');
async function run() {
  console.log('connected');
  await sql`ALTER TABLE facility_requests DROP COLUMN IF EXISTS priority`;
  await sql`ALTER TABLE facility_requests DROP COLUMN IF EXISTS assignee_id`;
  await sql`ALTER TABLE facility_requests ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES facility_spaces(id) ON DELETE SET NULL`;
  
  try { await sql`ALTER TYPE facility_request_status RENAME TO facility_request_status_old`; } catch(e){}
  try { await sql`CREATE TYPE facility_request_status AS ENUM('open', 'in_progress', 'done')`; } catch(e){}
  try { await sql`ALTER TABLE facility_requests ALTER COLUMN status TYPE facility_request_status USING 'open'::facility_request_status`; } catch(e){}
  try { await sql`ALTER TABLE facility_requests ALTER COLUMN status SET DEFAULT 'open'::facility_request_status`; } catch(e){}
  try { await sql`DROP TYPE facility_request_status_old CASCADE`; } catch(e){}
  
  console.log('done');
  process.exit(0);
}
run().catch(console.error);
