import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/schema/index.ts", "src/seed.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: false,
  sourcemap: true,
  external: ["postgres", "drizzle-orm", "mongodb", "dotenv", "pg", "@faker-js/faker", "bcryptjs"],
});
