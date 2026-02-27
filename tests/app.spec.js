import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://localhost:3000';

test.describe('THREAD App', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
  });

  test.describe('Authentication', () => {
    test('login with email/password', async ({ page }) => {
      await page.goto(BASE_URL);
      
      // Should show login form
      await expect(page.locator('h1:has-text("THREAD")')).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      
      // Login
      await page.fill('input[type="email"]', 'you@local.test');
      await page.fill('input[type="password"]', 'thread123');
      await page.click('button:has-text("Login")');
      
      // Should be logged in - check for wardrobe elements
      await expect(page.locator('.logo:has-text("THREAD")')).toBeVisible({ timeout: 10000 });
    });

    test('login shows error with wrong password', async ({ page }) => {
      await page.goto(BASE_URL);
      
      await page.fill('input[type="email"]', 'you@local.test');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button:has-text("Login")');
      
      // Should show error
      await expect(page.locator('text=Invalid')).toBeVisible();
    });
  });

  test.describe('Wardrobe', () => {
    test.beforeEach(async ({ page }) => {
      // Login first
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', 'you@local.test');
      await page.fill('input[type="password"]', 'thread123');
      await page.click('button:has-text("Login")');
      await expect(page.locator('.logo:has-text("THREAD")')).toBeVisible({ timeout: 10000 });
    });

    test('shows wardrobe page', async ({ page }) => {
      await expect(page.locator('h1:has-text("Your Wardrobe")')).toBeVisible();
    });

    test('category tabs exist', async ({ page }) => {
      // Should have category tabs
      await expect(page.locator('button:has-text("All")')).toBeVisible();
      await expect(page.locator('button:has-text("Knitwear")')).toBeVisible();
      await expect(page.locator('button:has-text("Bottom")')).toBeVisible();
    });

    test('can click category tabs', async ({ page }) => {
      // Click Knitwear tab
      await page.click('button:has-text("Knitwear")');
      
      // Button should be active
      await expect(page.locator('button.tab.active:has-text("Knitwear"), button.active:has-text("Knitwear")')).toBeVisible();
    });

    test('items display or empty state', async ({ page }) => {
      await page.waitForTimeout(1000);
      
      // Either items exist or empty state
      const hasItems = await page.locator('.item-card').count() > 0;
      const hasEmpty = await page.locator('.empty-state').count() > 0;
      
      expect(hasItems || hasEmpty).toBe(true);
    });
  });

  test.describe('Profiles', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', 'you@local.test');
      await page.fill('input[type="password"]', 'thread123');
      await page.click('button:has-text("Login")');
      await expect(page.locator('.logo:has-text("THREAD")')).toBeVisible({ timeout: 10000 });
    });

    test('profiles page loads', async ({ page }) => {
      // Navigate to profiles
      await page.click('a:has-text("👥")');
      
      await expect(page.locator('h1:has-text("Profiles")')).toBeVisible();
    });

    test('shows both users', async ({ page }) => {
      await page.click('a:has-text("👥")');
      
      // Should show both users
      await expect(page.locator('.card').first()).toBeVisible();
    });

    test('can click on user profile', async ({ page }) => {
      await page.click('a:has-text("👥")');
      
      // Click on first profile card
      await page.locator('.card').first().click();
      
      // Page should still be functional
      await expect(page.locator('h1:has-text("Profiles")')).toBeVisible();
    });
  });

  test.describe('Settings', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', 'you@local.test');
      await page.fill('input[type="password"]', 'thread123');
      await page.click('button:has-text("Login")');
      await expect(page.locator('.logo:has-text("THREAD")')).toBeVisible({ timeout: 10000 });
    });

    test('settings page loads', async ({ page }) => {
      await page.click('a:has-text("⚙️")');
      
      await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    });

    test('shows QR code section', async ({ page }) => {
      await page.click('a:has-text("⚙️")');
      
      await expect(page.locator('text=Connect Your Phone')).toBeVisible();
    });
  });

  test.describe('Outfits', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', 'you@local.test');
      await page.fill('input[type="password"]', 'thread123');
      await page.click('button:has-text("Login")');
      await expect(page.locator('.logo:has-text("THREAD")')).toBeVisible({ timeout: 10000 });
    });

    test('outfits page loads', async ({ page }) => {
      await page.click('a:has-text("✨")');
      
      await expect(page.locator('h1:has-text("Outfit Studio")')).toBeVisible();
    });
  });

  test.describe('Camera/Upload', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(BASE_URL);
      await page.fill('input[type="email"]', 'you@local.test');
      await page.fill('input[type="password"]', 'thread123');
      await page.click('button:has-text("Login")');
      await expect(page.locator('.logo:has-text("THREAD")')).toBeVisible({ timeout: 10000 });
    });

    test('camera page has upload option', async ({ page }) => {
      await page.click('a:has-text("📷")');
      
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('[data-testid="choose-photos-btn"]')).toBeVisible();
    });
  });
});
