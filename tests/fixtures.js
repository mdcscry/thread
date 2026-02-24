import { test as base } from '@playwright/test';

// Custom fixture to handle HTTPS issues with API requests
export const test = base.extend({
  request: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({
      baseURL: 'https://localhost:3000',
      ignoreHTTPSErrors: true,
    });
    await use(request);
    await request.dispose();
  },
});
