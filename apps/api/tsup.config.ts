import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: true,
    target: "node20",
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
    external: ["@nexusops/db", "fastify", "@fastify/*", "ioredis", "bullmq", "bcryptjs", "jsonwebtoken", "nanoid", "meilisearch", "@anthropic-ai/sdk"],
  },
]);
