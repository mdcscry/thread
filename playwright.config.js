// Handle HTTPS cert issues - MUST be before any imports
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js', // Only run Playwright specs, not Vitest tests
  timeout: 180000, // 3 min - accounts for AI analysis
  retries: 0,
  workers: 1,
  globalSetup: './tests/playwright-global-setup.js',
  globalTeardown: './tests/playwright-global-teardown.js',
  use: {
    baseURL: 'https://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
