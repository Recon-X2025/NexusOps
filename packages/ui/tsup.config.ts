import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: false,
  sourcemap: true,
  external: ["react", "react-dom"],
});
