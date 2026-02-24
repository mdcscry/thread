import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'

// Helper: navigate to signup page
async function goToSignup(page) {
  await page.goto(BASE)
  // Click sign up link/button (might be on login page or landing)
  await page.click('text=Sign Up, a:has-text("Sign Up"), button:has-text("Sign Up")')
  await page.waitForLoadState('networkidle')
}

test.describe('Sign Up Page', () => {
  test('signup page loads with form fields', async ({ page }) => {
    await goToSignup(page)
    
    // Check form fields exist
    await expect(page.locator('input[name="firstName"], input[placeholder*="first" i]')).toBeVisible()
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible()
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible()
  })

  test('shows validation error for mismatched passwords', async ({ page }) => {
    await goToSignup(page)
    
    await page.fill('input[name="firstName"]', 'John')
    await page.fill('input[name="email"]', 'john@example.com')
    await page.fill('input[name="password"]', 'password123')
    await page.fill('input[name="confirmPassword"]', 'differentpassword')
    await page.click('button:has-text("Sign Up"), button:has-text("Register")')
    
    // Should show error
    await expect(page.locator('text=match, text=confirm')).toBeVisible()
  })

  test('shows validation error for weak password', async ({ page }) => {
    await goToSignup(page)
    
    await page.fill('input[name="firstName"]', 'John')
    await page.fill('input[name="email"]', 'john@example.com')
    await page.fill('input[name="password"]', 'short')
    await page.fill('input[name="confirmPassword"]', 'short')
    await page.click('button:has-text("Sign Up"), button:has-text("Register")')
    
    // Should show password error
    await expect(page.locator('text=password, text=8')).toBeVisible()
  })

  test('can register with valid credentials', async ({ page }) => {
    const uniqueEmail = `test${Date.now()}@example.com`
    
    await goToSignup(page)
    
    await page.fill('input[name="firstName"]', 'TestUser')
    await page.fill('input[name="email"]', uniqueEmail)
    await page.fill('input[name="password"]', 'password123')
    await page.fill('input[name="confirmPassword"]', 'password123')
    await page.click('button:has-text("Sign Up"), button:has-text("Register")')
    
    // Should redirect to wardrobe or show success
    await page.waitForURL(/.*(wardrobe|success).*/, { timeout: 5000 }).catch(() => {})
    // Either logged in or success message
    const url = page.url()
    expect(url).toContain('wardrobe') 
  })
})

test.describe('Profile Page - Expanded Fields', () => {
  const EMAIL = 'you@localhost'
  const PASS = 'thread123'
  
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
    await page.fill('input[type="password"]', PASS)
    await page.click('button:has-text("Login")')
    await page.waitForSelector('nav', { timeout: 5000 })
    await page.click('nav a:has-text("👤")')  // Profile nav
    await page.waitForLoadState('networkidle')
  })

  test('profile page has style presentation dropdown', async ({ page }) => {
    await expect(page.locator('select[name="stylePresentation"], :text("Style")')).toBeVisible()
  })

  test('profile page has gender identity dropdown', async ({ page }) => {
    await expect(page.locator('select[name="genderIdentity"], :text("Gender")')).toBeVisible()
  })

  test('profile page has build section with height', async ({ page }) => {
    await expect(page.locator('input[name="heightValue"], :text("Height")')).toBeVisible()
  })

  test('profile page has body description textarea', async ({ page }) => {
    await expect(page.locator('textarea[name="bodyDescription"], input[placeholder*="build" i]')).toBeVisible()
  })

  test('profile page has fit preferences', async ({ page }) => {
    await expect(page.locator('text=Fit, text=Relaxed, text=Regular, text=Fitted')).toBeVisible()
  })

  test('profile page has use cases checkboxes', async ({ page }) => {
    await expect(page.locator('text=Everyday, text=Work, text=Formal, text=Active')).toBeVisible()
  })
})
