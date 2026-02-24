import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'

test('profiles page loads', async ({ page }) => {
  await page.goto(BASE, { ignoreHTTPSErrors: true })
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded')
  
  // Get page content for debugging
  const buttons = await page.locator('button').allTextContents()
  console.log('Buttons found:', buttons)
  
  // Click the API Key tab - it might be labeled differently
  const apiKeyBtn = page.locator('button', { hasText: 'API Key' })
  if (await apiKeyBtn.isVisible().catch(() => false)) {
    await apiKeyBtn.click()
    await page.waitForSelector('input[type="text"]', { timeout: 5000 })
    await page.fill('input[type="text"]', API_KEY)
  } else {
    // Try filling API key directly
    await page.fill('input[type="text"], input[placeholder*="API" i]', API_KEY)
  }
  
  await page.click('button:has-text("Save"), button:has-text("Login")')
  
  // Wait for nav
  await page.waitForSelector('nav', { timeout: 15000 })
  
  // Click profiles
  await page.click('nav a:has-text("👤")')
  await page.waitForLoadState('networkidle')
  
  // Check heading
  await expect(page.locator('h1')).toContainText('Profile')
})
