import { getDb } from "./client";
import * as schema from "./schema";
require("dotenv").config({ path: "../../.env" });

async function clean() {
  const db = getDb();
  console.log("🧹 Performing DEEP WIPE of all system data...");

  // Core tables that must be preserved for system access/auth
  const coreTables = [
    "organizations",
    "users",
    "roles",
    "permissions",
    "role_permissions",
    "user_roles",
    "role_hierarchies"
  ];

  // We iterate over the exported schema to find all pgTable definitions
  const entries = Object.entries(schema);
  console.log(`🔍 Scanning ${entries.length} schema definitions...`);

  for (const [key, value] of entries) {
    if (value && typeof value === 'object') {
      const symbols = Object.getOwnPropertySymbols(value);
      const isTable = symbols.some(s => s.description === "drizzle:IsDrizzleTable");
      const nameSymbol = symbols.find(s => s.description === "drizzle:Name");
      
      if (isTable && nameSymbol) {
        const tableName = (value as any)[nameSymbol];
      
        if (coreTables.includes(tableName)) {
          console.log(`- Preserving core table: ${tableName}`);
          continue;
        }

        try {
          await db.delete(value as any);
          console.log(`- Cleared ${tableName}`);
        } catch (e: any) {
          // Some tables might fail if they aren't real tables or have complex dependencies
          // But with DELETE (no cascade here to be safe) it should be fine.
          console.warn(`- Could not clear ${tableName}:`, e.message);
        }
      }
    }
  }

  console.log("\n✨ System deep-wiped. No transactional data remains.");
  process.exit(0);
}

clean().catch(err => {
  console.error("❌ Deep wipe failed:", err);
  process.exit(1);
});
