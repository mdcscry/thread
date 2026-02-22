import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://localhost:3000';

// Helper to wait for page to be ready
async function waitForApp(page) {
  await page.waitForLoadState('networkidle');
}

// Helper to login
async function login(page, email = 'you@localhost', password = 'thread123') {
  await page.goto(BASE_URL);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Login")');
  await expect(page.locator('.logo')).toContainText('THREAD', { timeout: 10000 });
}

test.describe('THREAD Core Functionality', () => {
  
  // === AUTHENTICATION ===
  
  test('1. Login with email/password works', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('input[type="email"]', 'you@localhost');
    await page.fill('input[type="password"]', 'thread123');
    await page.click('button:has-text("Login")');
    
    // Should be logged in - logo should show THREAD
    await expect(page.locator('.logo')).toContainText('THREAD', { timeout: 10000 });
  });

  test('2. Login shows error with wrong password', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('input[type="email"]', 'you@localhost');
    await page.fill('input[type="password"]', 'wrong');
    await page.click('button:has-text("Login")');
    
    await expect(page.locator('text=Invalid')).toBeVisible();
  });

  test('3. Can switch to API key login', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('text=API Key');
    await expect(page.locator('input[placeholder="thread_sk_..."]')).toBeVisible();
  });

  // === NAVIGATION ===

  test('4. All nav tabs are accessible', async ({ page }) => {
    await login(page);
    
    // Click each nav item
    const navItems = ['👗', '✨', '📷', '✈️', '👥', '📥', '⚙️'];
    for (const nav of navItems) {
      await page.click(`a:has-text("${nav}")`);
      await page.waitForTimeout(300);
    }
  });

  // === WARDROBE ===

  test('5. Wardrobe page displays', async ({ page }) => {
    await login(page);
    await expect(page.locator('h1:has-text("Wardrobe")')).toBeVisible();
  });

  test('6. Category tabs exist', async ({ page }) => {
    await login(page);
    
    await expect(page.locator('button:has-text("All")')).toBeVisible();
    await expect(page.locator('button:has-text("Knitwear")')).toBeVisible();
    await expect(page.locator('button:has-text("Bottom")')).toBeVisible();
  });

  test('7. Can filter by category', async ({ page }) => {
    await login(page);
    
    // Click Knitwear
    await page.click('button:has-text("Knitwear")');
    await page.waitForTimeout(500);
    
    // Should still be on wardrobe page
    await expect(page.locator('h1:has-text("Wardrobe")')).toBeVisible();
  });

  test('8. Search or filter exists', async ({ page }) => {
    await login(page);
    // Search or filter input exists
    const hasSearch = await page.locator('input').count() > 0;
    expect(hasSearch).toBe(true);
  });

  // === PROFILES ===

  test('9. Profiles page loads with users', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("👥")');
    
    await expect(page.locator('h1:has-text("Profiles")')).toBeVisible();
    // Should have at least 2 user cards
    const cardCount = await page.locator('.card').count();
    expect(cardCount).toBeGreaterThanOrEqual(2);
  });

  test('10. Can select a user profile', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("👥")');
    
    // Click on a profile card
    await page.locator('.card').first().click();
    await page.waitForTimeout(500);
    
    // Should still show profiles
    await expect(page.locator('h1:has-text("Profiles")')).toBeVisible();
  });

  // === SETTINGS ===

  test('11. Settings page loads', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("⚙️")');
    
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
  });

  test('12. QR code section exists', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("⚙️")');
    
    await expect(page.locator('text=Connect Your Phone')).toBeVisible();
  });

  // === OUTFITS ===

  test('13. Outfit Studio page loads', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("✨")');
    
    await expect(page.locator('h1:has-text("Outfit Studio")')).toBeVisible();
  });

  test('14. Can enter outfit prompt', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("✨")');
    
    await expect(page.locator('textarea')).toBeVisible();
    await page.fill('textarea', 'Casual weekend outfit');
    await expect(page.locator('textarea')).toHaveValue('Casual weekend outfit');
  });

  // === CAMERA / UPLOAD ===

  test('15. Camera page has upload option', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("📷")');
    
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-testid="choose-photos-btn"]')).toBeVisible();
  });

  // === INGESTION ===

  test('16. Ingestion page loads', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("📥")');
    
    await expect(page.locator('h1:has-text("Import")')).toBeVisible();
  });

  test('17. Ollama status check exists', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("📥")');
    
    await expect(page.locator('text=Ollama ready')).toBeVisible();
  });

  // === VACATION ===

  test('18. Vacation page loads', async ({ page }) => {
    await login(page);
    await page.click('a:has-text("✈️")');
    
    await expect(page.locator('h1:has-text("Vacation")')).toBeVisible();
    await expect(page.locator('text=Plan Your Trip')).toBeVisible();
  });

  // === API BACKEND ===

  test('19. API returns items', async ({ page }) => {
    await login(page);
    
    const response = await page.request.get(`${BASE_URL}/api/v1/items`, {
      headers: { Authorization: `Bearer thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934` }
    });
    
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('20. API returns users', async ({ page }) => {
    await login(page);
    
    const response = await page.request.get(`${BASE_URL}/api/v1/users`, {
      headers: { Authorization: `Bearer thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934` }
    });
    
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.length).toBeGreaterThan(0);
  });

  test('21. Weather API works', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/v1/weather`);
    
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.temp_f).toBeDefined();
  });
});
