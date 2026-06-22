import { seed } from "@coheronconnect/db/seed";

console.log("🚀 Starting database seed from API...");
seed()
  .then(() => {
    console.log("✅ Seed completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
