import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: false,
  sourcemap: true,
  external: ["@coheronconnect/db", "drizzle-orm"],
});
