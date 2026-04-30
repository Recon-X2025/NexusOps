import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgresql://coheronconnect:coheronconnect@localhost:5434/coheronconnect",
  },
  verbose: true,
  strict: true,
} satisfies Config;
