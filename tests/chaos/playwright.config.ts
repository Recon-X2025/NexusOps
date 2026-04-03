import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 20,
  retries: 0,
  timeout: 60_000,
  fullyParallel: true,
  reporter: [
    ["list"],
    ["json", { outputFile: "results/playwright-results.json" }],
  ],
  use: {
    headless: true,
    baseURL: "http://139.84.154.78",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    // Capture console errors and failed requests
    video: "off",
    screenshot: "only-on-failure",
    // Slow network emulation to simulate throttled conditions
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chaos-chromium",
      use: {
        browserName: "chromium",
        launchOptions: { args: ["--disable-web-security", "--no-sandbox"] },
      },
    },
  ],
  outputDir: "results/artifacts",
});
