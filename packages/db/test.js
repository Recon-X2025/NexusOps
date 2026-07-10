const postgres = require('postgres');
const sql = postgres('postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect');
async function run() {
  const res = await sql`SELECT * FROM facility_requests`;
  console.log(res);
  process.exit(0);
}
run().catch(console.error);
