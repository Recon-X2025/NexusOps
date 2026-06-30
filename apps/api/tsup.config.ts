import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/seed.ts", "src/migrate.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    sourcemap: true,
    target: "node20",
    // Bundle internal workspace packages so Docker runner doesn't need their node_modules
    noExternal: ["@coheronconnect/db", "@coheronconnect/types", "@coheronconnect/metrics", "@coheronconnect/config", "@coheronconnect/payroll-math", "drizzle-orm", "postgres"],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  },
  {
    entry: ["src/types.ts"],
    format: ["esm", "cjs"],
    dts: { only: true },
    outDir: "dist",
    sourcemap: false,
    external: ["@coheronconnect/db", "fastify", "@fastify/*", "ioredis", "bullmq", "bcryptjs", "jsonwebtoken", "nanoid", "meilisearch", "@anthropic-ai/sdk"],
  },
]);
