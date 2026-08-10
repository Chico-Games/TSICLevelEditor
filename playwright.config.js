// Playwright Configuration
// Enables screenshots, videos, and trace for test analysis

const { defineConfig, devices } = require('@playwright/test');

// Deliberately NOT 8000: the Unreal Editor binds an HTTP server to 127.0.0.1:8000,
// and with reuseExistingServer the whole suite silently ran against its 404 page
// (221 tests "executing" with no app loaded). Keep this port unusual, and keep the
// tests pointed at baseURL rather than a hardcoded localhost URL.
const PORT = Number(process.env.LEVEL_EDITOR_TEST_PORT) || 8931;
const BASE_URL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Test execution settings. Files run in parallel (each test gets its own page and
  // the app keeps no cross-page state); tests within a file stay sequential.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],

  // Shared settings for all tests
  use: {
    // Base URL for tests
    baseURL: BASE_URL,

    // Artifacts only for failures. Recording video + trace + a screenshot for all ~230
    // tests at 1920x1080 dominated the run (roughly a minute per test) and produced
    // hundreds of megabytes nobody looked at.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Viewport size
    viewport: { width: 1920, height: 1080 },
  },

  // Web server configuration - starts a local server for tests
  webServer: {
    command: `npx http-server . -a 127.0.0.1 -p ${PORT} --silent`,
    // Match on the app's own URL, not just "something is listening on the port" —
    // a foreign server answering 200 on / would otherwise be reused silently.
    url: `${BASE_URL}/index.html`,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
