// Handle HTTPS cert issues - MUST be before any imports
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 180000, // 3 min - accounts for AI analysis
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'https://localhost:8080',
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
