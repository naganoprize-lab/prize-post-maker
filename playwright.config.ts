import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:1420",
    headless: true,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 1420 --strictPort",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
});
