import { defineConfig } from "@playwright/test";

// e2e runs against a throwaway Postgres (see e2e/README.md), never .env's
// database: the URL is forced here for both the test process and the Next server.
const TEST_DB = "postgresql://postgres:e2e@127.0.0.1:15432/gcode_e2e";
process.env.DATABASE_URL = TEST_DB;
process.env.DIRECT_URL = TEST_DB;

export default defineConfig({
  testDir: "./e2e",
  workers: 1, // every spec resets the same database
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npx next dev -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: TEST_DB, DIRECT_URL: TEST_DB, NODE_ENV: "development" },
  },
});
