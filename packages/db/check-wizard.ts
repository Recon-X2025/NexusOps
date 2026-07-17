import { Client } from 'pg';

async function run() {
  const client = new Client({ connectionString: 'postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect' });
  await client.connect();

  const orgsResult = await client.query(`
    SELECT 
      id, name, created_at, updated_at,
      industry, company_size, city, state, website, support_email,
      pan, tan, epf_code, primary_state_code,
      sla_p1_hours, sla_p2_hours, sla_p3_hours, sla_p4_hours
    FROM organizations
    ORDER BY created_at DESC
    LIMIT 3;
  `);

  console.log("=== ORGANIZATIONS ===");
  console.dir(orgsResult.rows, { depth: null });

  const orgIds = orgsResult.rows.map(r => r.id);
  if (orgIds.length > 0) {
    const idsList = orgIds.map(id => `'${id}'`).join(',');
    
    try {
      const gstinResult = await client.query(`SELECT org_id, gstin FROM gstin_registry WHERE org_id IN (${idsList});`);
      console.log("\n=== GSTIN ===");
      console.dir(gstinResult.rows, { depth: null });
    } catch(e) { console.log("gstin_registry query failed: ", e.message); }

    try {
      const cinResult = await client.query(`SELECT org_id, cin FROM legal_entities WHERE org_id IN (${idsList});`);
      console.log("\n=== CIN ===");
      console.dir(cinResult.rows, { depth: null });
    } catch(e) { console.log("legal_entities query failed: ", e.message); }
  }

  await client.end();
}

run().catch(console.error);
