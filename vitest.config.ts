import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Argon2id at production parameters (64 MiB, t=3) takes a moment under WASM.
    testTimeout: 60_000,
  },
});
