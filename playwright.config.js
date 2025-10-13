// Playwright Configuration
// Enables screenshots, videos, and trace for test analysis

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Test execution settings
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],

  // Shared settings for all tests
  use: {
    // Base URL for tests
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on',

    // Screenshot on failure
    screenshot: 'on',

    // Video on failure
    video: 'on',

    // Viewport size
    viewport: { width: 1920, height: 1080 },
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Take screenshot after each action
        screenshot: 'on',
        // Record video for all tests
        video: 'on',
        // Enable trace
        trace: 'on',
      },
    },
  ],
});
