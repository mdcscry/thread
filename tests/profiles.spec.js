import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'
const EMAIL = 'you@localhost'
const PASS = 'thread123'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'

// Helper: login, then click a nav icon to go to a page
async function loginAndNav(page, navEmoji) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 5000 })
  await page.click(`nav a:has-text("${navEmoji}")`)
  await page.waitForLoadState('networkidle')
}

test.describe('Profiles — Name & Gender', () => {

  test('profiles page loads with users', async ({ page }) => {
    await loginAndNav(page, '👥')
    await expect(page.locator('h1')).toContainText('Profiles')
    await expect(page.locator('.card').first()).toBeVisible()
  })

  test('edit button appears on profile cards', async ({ page }) => {
    await loginAndNav(page, '👥')
    await expect(page.locator('button:has-text("Edit")').first()).toBeVisible()
  })

  test('clicking Edit shows name input and gender select', async ({ page }) => {
    await loginAndNav(page, '👥')
    await page.locator('button:has-text("Edit")').first().click()
    await expect(page.locator('input[placeholder*="name" i]').first()).toBeVisible()
    await expect(page.locator('select').first()).toBeVisible()
  })

  test('can update name and it shows on card', async ({ page }) => {
    await loginAndNav(page, '👥')
    await page.locator('button:has-text("Edit")').first().click()

    const nameInput = page.locator('input[placeholder*="name" i]').first()
    await nameInput.fill('Matte D')
    await page.locator('button:has-text("Save")').first().click()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.card').first()).toContainText('Matte D')

    // Restore
    await page.locator('button:has-text("Edit")').first().click()
    await page.locator('input[placeholder*="name" i]').first().fill('User One')
    await page.locator('button:has-text("Save")').first().click()
  })

  test('can select gender and it shows on card', async ({ page }) => {
    await loginAndNav(page, '👥')
    await page.locator('button:has-text("Edit")').first().click()

    await page.locator('select').first().selectOption('man')
    await page.locator('button:has-text("Save")').first().click()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.card').first()).toContainText('Man')
  })

  test('cancel restores view without saving', async ({ page }) => {
    await loginAndNav(page, '👥')
    await page.locator('button:has-text("Edit")').first().click()
    await page.locator('input[placeholder*="name" i]').first().fill('SHOULD NOT SAVE')
    await page.locator('button:has-text("Cancel")').click()
    // Edit button should be back
    await expect(page.locator('button:has-text("Edit")').first()).toBeVisible()
    // Card should not have the unsaved value
    await expect(page.locator('.card').first()).not.toContainText('SHOULD NOT SAVE')
  })

  test('gender persists via API', async ({ request }) => {
    const patch = await request.patch(`${BASE}/api/v1/users/1`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { gender: 'woman' }
    })
    expect(patch.ok()).toBeTruthy()

    const get = await request.get(`${BASE}/api/v1/users/1`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
    const user = await get.json()
    expect(user.gender).toBe('woman')

    // Restore
    await request.patch(`${BASE}/api/v1/users/1`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { gender: 'man' }
    })
  })

  test('name persists via API', async ({ request }) => {
    const patch = await request.patch(`${BASE}/api/v1/users/1`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { name: 'API Name Test' }
    })
    expect(patch.ok()).toBeTruthy()

    const get = await request.get(`${BASE}/api/v1/users/1`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
    const user = await get.json()
    expect(user.name).toBe('API Name Test')

    // Restore
    await request.patch(`${BASE}/api/v1/users/1`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { name: 'User One' }
    })
  })

})
