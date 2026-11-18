const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

const PORT = process.env.PORT || 3000;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(__dirname, ".playwright-browsers");
const startCommand = process.platform === "win32"
  ? `set BROWSER=none&& set PORT=${PORT}&& npm.cmd start`
  : `BROWSER=none PORT=${PORT} npm start`;

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // CRA's dev server compiles the bundle on the first request; a cold parallel
  // run can miss a tight timeout once. Retry absorbs that, CI retries twice.
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: startCommand,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "warmup",
      testMatch: /warmup\.setup\.js/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["warmup"],
      testIgnore: /warmup\.setup\.js/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
      dependencies: ["warmup"],
      testIgnore: /warmup\.setup\.js/,
    },
  ],
});
