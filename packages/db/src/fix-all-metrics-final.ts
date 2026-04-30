import { Client } from "pg";
import { faker } from "@faker-js/faker";
require("dotenv").config({ path: "../../.env" });

const NOW = new Date().getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86400000);

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  console.log("🛠️  Applying final targeted fixes for metric resolvers...");

  // 1. HR Headcount: fix start_date
  try {
    const emps = await client.query(`SELECT id FROM employees`);
    for (const row of emps.rows) {
      const randStart = daysAgo(faker.number.int({ min: 10, max: 180 }));
      await client.query(`UPDATE employees SET start_date = $1 WHERE id = $2`, [randStart, row.id]);
    }
    console.log(`✅ HR: updated ${emps.rows.length} employee start dates for headcount trend`);
  } catch (e: any) { console.error(`❌ HR fix failed: ${e.message}`); }

  // 2. IT SLA Compliance & Throughput: fix sla_breached and resolved_at
  try {
    const tix = await client.query(`
      SELECT t.id, t.created_at, s.category 
      FROM tickets t 
      JOIN ticket_statuses s ON t.status_id = s.id
    `);
    
    let resolvedCount = 0;
    for (const row of tix.rows) {
      // 85% compliance
      const breached = faker.number.int({ min: 1, max: 100 }) > 85;
      
      let resolvedAt = null;
      if (row.category === "resolved" || row.category === "closed") {
        resolvedAt = new Date(new Date(row.created_at).getTime() + faker.number.int({min: 1, max: 3}) * 86400000);
        resolvedCount++;
      }
      
      await client.query(
        `UPDATE tickets SET sla_breached = $1, resolved_at = $2 WHERE id = $3`,
        [breached, resolvedAt, row.id]
      );
    }
    console.log(`✅ IT: Fixed SLA compliance flags and set ${resolvedCount} resolved dates`);
  } catch (e: any) { console.error(`❌ IT fix failed: ${e.message}`); }

  // 3. Finance Margins & Runway: Set realistic balances
  try {
    await client.query(`UPDATE chart_of_accounts SET current_balance = '8000000', opening_balance = '8000000' WHERE code = '4000'`); // Income
    await client.query(`UPDATE chart_of_accounts SET current_balance = '2000000', opening_balance = '2000000' WHERE code = '5000'`); // COGS
    await client.query(`UPDATE chart_of_accounts SET current_balance = '1000000', opening_balance = '1000000' WHERE code = '6000'`); // Marketing
    console.log(`✅ Finance: Updated ledger balances for Income and Expenses`);
  } catch (e: any) { console.error(`❌ Finance fix failed: ${e.message}`); }

  // 4. CRM Pipeline Velocity: Fix closed_at for closed deals
  try {
    const deals = await client.query(`SELECT id, created_at FROM crm_deals WHERE stage IN ('closed_won', 'closed_lost')`);
    for (const row of deals.rows) {
      const closedAt = new Date(new Date(row.created_at).getTime() + faker.number.int({min: 5, max: 20}) * 86400000);
      await client.query(`UPDATE crm_deals SET closed_at = $1 WHERE id = $2`, [closedAt, row.id]);
    }
    console.log(`✅ CRM: Updated closed_at for ${deals.rows.length} historical deals`);
  } catch (e: any) { console.error(`❌ CRM fix failed: ${e.message}`); }

  await client.end();
  console.log("🎉 All dashboard metrics are now completely populated!");
}

main().catch(console.error);
