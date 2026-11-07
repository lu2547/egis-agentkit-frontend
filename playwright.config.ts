import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:5187",
    viewport: { width: 1500, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
  webServer: [
    {
      command: "node tests/browser/api-server.mjs",
      url: "http://127.0.0.1:38194/__test/health",
      reuseExistingServer: false,
    },
    {
      command: "APP_API_URL=http://127.0.0.1:38194 npm run dev -- --port 5187",
      url: "http://127.0.0.1:5187",
      reuseExistingServer: false,
    },
  ],
});
