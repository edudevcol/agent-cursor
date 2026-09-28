import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false, // maps would duplicate the embedded avatar images (~800 KB) for no benefit
  target: "es2020",
  platform: "node",
});
