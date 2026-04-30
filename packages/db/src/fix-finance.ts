require("dotenv").config({ path: "../../.env" });
import { getDb } from "./client";
import { chartOfAccounts, invoices, eq, sql } from "./schema";

async function main() {
  const db = getDb();
  
  // 1. Fix expense balances
  await db.update(chartOfAccounts)
    .set({ currentBalance: "450000" })
    .where(eq(chartOfAccounts.type, "expense"));
    
  console.log("✅ Updated expense balances");

  // 2. Fix AR invoices
  const now = new Date();
  const past65 = new Date(now.getTime() - 65 * 86400000);
  
  await db.update(invoices)
    .set({ 
      invoiceFlow: "receivable", 
      status: "overdue",
      dueDate: past65
    })
    .where(sql`id IN (SELECT id FROM invoices LIMIT 15)`);
    
  console.log("✅ Updated AR invoices");
}

main().catch(console.error).finally(() => process.exit(0));
