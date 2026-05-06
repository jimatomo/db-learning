import { defineConfig, devices } from "@playwright/test";

const skipWebServer = !!process.env.PLAYWRIGHT_SKIP_WEBSERVER;
const start =
  "bun run --cwd apps/web build && mkdir -p data && LESSON=c DATABASE_PATH=./data/e2e.db bun apps/server/scripts/seed.ts && NODE_ENV=production PORT=4173 LESSON=c DATABASE_PATH=./data/e2e.db bun apps/server/src/index.ts";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: start,
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
