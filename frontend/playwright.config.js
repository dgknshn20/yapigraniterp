const { defineConfig } = require('@playwright/test');

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const webServer = process.env.E2E_BASE_URL
  ? undefined
  : {
      command: 'npm start',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    };

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
