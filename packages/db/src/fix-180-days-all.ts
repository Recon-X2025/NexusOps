import { Client } from "pg";
import { faker } from "@faker-js/faker";
require("dotenv").config({ path: "../../.env" });

const NOW = new Date().getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86400000);

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  console.log("🛠️  Fixing 180-day data distribution across all modules...");

  const tables = [
    "change_requests", "problems", "security_incidents", "vulnerabilities",
    "risks", "contracts", "projects", "crm_accounts", "crm_deals", "crm_leads",
    "legal_matters", "pipeline_runs", "deployments", "kb_articles",
    "purchase_requests", "tickets", "budget_lines"
  ];

  for (const table of tables) {
    try {
      const res = await client.query(`SELECT id FROM ${table}`);
      let count = 0;
      for (const row of res.rows) {
        const randDate = daysAgo(faker.number.int({ min: 1, max: 180 }));
        await client.query(`UPDATE ${table} SET created_at = $1 WHERE id = $2`, [randDate, row.id]);
        count++;
      }
      console.log(`✅ ${table}: updated ${count} records with 180-day dates`);
    } catch (e) {
      console.log(`⚠️  Skipped ${table}: ${e.message}`);
    }
  }

  // Also fix specific dates
  try {
    const deals = await client.query(`SELECT id FROM crm_deals`);
    for (const row of deals.rows) {
      const closeDate = daysAgo(faker.number.int({ min: -30, max: 180 }));
      await client.query(`UPDATE crm_deals SET expected_close = $1 WHERE id = $2`, [closeDate, row.id]);
    }
  } catch (e) {}

  // CSM Cases
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS csm_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    
    const orgRes = await client.query(`SELECT id FROM organizations LIMIT 1`);
    if (orgRes.rows.length > 0) {
      const orgId = orgRes.rows[0].id;
      for (let i = 0; i < 50; i++) {
        const created = daysAgo(faker.number.int({ min: 1, max: 180 }));
        const status = faker.helpers.arrayElement(["open", "in_progress", "resolved", "closed"]);
        const updated = status === "resolved" ? new Date(created.getTime() + faker.number.int({min: 1, max: 5})*86400000) : created;
        await client.query(`INSERT INTO csm_cases (org_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4)`, [orgId, status, created, updated]);
      }
      console.log(`✅ csm_cases: created table and seeded 50 records`);
    }
  } catch (e) {
    console.error(`❌ CSM cases failed: ${e.message}`);
  }

  // Survey Responses
  try {
    const surveyRes = await client.query(`SELECT id, org_id FROM surveys WHERE type = 'csat' LIMIT 1`);
    if (surveyRes.rows.length > 0) {
      const surveyId = surveyRes.rows[0].id;
      for (let i = 0; i < 150; i++) {
        const submitted = daysAgo(faker.number.int({ min: 1, max: 180 }));
        const score = faker.number.int({ min: 1, max: 5 });
        await client.query(`
          INSERT INTO survey_responses (survey_id, score, submitted_at)
          VALUES ($1, $2, $3)
        `, [surveyId, score, submitted]);
      }
      console.log(`✅ survey_responses: seeded 150 records for CSAT`);
    } else {
      console.log(`⚠️  No CSAT survey found to seed responses`);
    }
  } catch (e) {
    console.error(`❌ Survey responses failed: ${e.message}`);
  }

  await client.end();
  console.log("🎉 All 180-day historical data fixes applied!");
}

main().catch(console.error);
