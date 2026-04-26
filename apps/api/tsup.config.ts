import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: true,
    target: "node20",
    // Bundle internal workspace packages so Docker runner doesn't need their node_modules
    noExternal: ["@nexusops/db", "@nexusops/types", "@nexusops/metrics", "@nexusops/config"],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  },
  {
    entry: ["src/migrate.ts"],
    format: ["esm"],
    dts: false,
    clean: false,
    sourcemap: false,
    target: "node20",
    // Bundle drizzle-orm and postgres into migrate.mjs so it is self-contained
    noExternal: ["drizzle-orm", "postgres"],
  },
  {
    entry: ["src/types.ts"],
    format: ["esm", "cjs"],
    dts: { only: true },
    outDir: "dist",
    sourcemap: false,
    external: ["@nexusops/db", "fastify", "@fastify/*", "ioredis", "bullmq", "bcryptjs", "jsonwebtoken", "nanoid", "meilisearch", "@anthropic-ai/sdk"],
  },
]);
