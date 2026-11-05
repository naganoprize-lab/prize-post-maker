import { defineConfig } from "vitest/config";
export default defineConfig({
  clearScreen: false,
  test: { include: ["tests/**/*.test.ts"] },
});
