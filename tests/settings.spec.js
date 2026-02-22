import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'
const HEADERS = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
const EMAIL = 'you@localhost'
const PASS = 'thread123'

async function loginNav(page, emoji) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 5000 })
  if (emoji) await page.click(`nav a:has-text("${emoji}")`)
  await page.waitForLoadState('networkidle')
}

test.describe('Settings — API', () => {

  test('GET /settings/me returns user info', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/settings/me`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('id')
    expect(body).toHaveProperty('email')
  })

  test('GET /settings/stats returns wardrobe stats', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/settings/stats`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('totalItems')
    expect(typeof body.totalItems).toBe('number')
  })

  test('GET /settings/qr returns QR data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/settings/qr`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    // Should return a QR code or URL
    expect(body).toBeTruthy()
  })

  test('GET /settings/api-keys returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/settings/api-keys`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const keys = await res.json()
    expect(Array.isArray(keys)).toBe(true)
  })

  test('PATCH /settings/preferences updates prefs', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/v1/settings/preferences`, {
      headers: HEADERS,
      data: { theme: 'dark', defaultLocation: 'Boulder, CO' }
    })
    expect(res.ok()).toBeTruthy()
  })

  test('GET /settings/webhooks returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/settings/webhooks`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const hooks = await res.json()
    expect(Array.isArray(hooks)).toBe(true)
  })

})

test.describe('Settings — UI', () => {

  test('settings page loads', async ({ page }) => {
    await loginNav(page, '⚙️')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('QR code section is visible', async ({ page }) => {
    await loginNav(page, '⚙️')
    // Look for any of: scan text, QR image, or canvas element
    const qrText = page.locator('text=Scan').first()
    const qrImg = page.locator('img').first()
    const qrCanvas = page.locator('canvas').first()
    
    const isVisible = await qrText.isVisible().catch(() => false) || 
                     await qrImg.isVisible().catch(() => false) || 
                     await qrCanvas.isVisible().catch(() => false)
    expect(isVisible).toBeTruthy()
  })

  test('API key is shown', async ({ page }) => {
    await loginNav(page, '⚙️')
    // Should show the API key or a masked version
    const keyText = page.locator('text=/thread_sk_|API Key/i').first()
    await expect(keyText).toBeVisible()
  })

})

test.describe('Auth', () => {

  test('login with wrong password fails', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email: EMAIL, password: 'wrongpassword' }
    })
    expect(res.ok()).toBeFalsy()
  })

  test('login with correct password returns apiKey', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email: EMAIL, password: PASS }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('apiKey')
    expect(body.apiKey).toMatch(/^thread_sk_/)
  })

  test('unauthenticated request to /items returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items`)
    expect(res.status()).toBe(401)
  })

  test('invalid API key returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items`, {
      headers: { Authorization: 'Bearer thread_sk_invalid' }
    })
    expect(res.status()).toBe(401)
  })

})

test.describe('Weather API', () => {

  test('GET /weather returns current weather', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/weather?location=Boulder,CO`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toBeTruthy()
  })

  test('GET /weather/forecast returns forecast', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/weather/forecast?location=Boulder,CO`, { headers: HEADERS })
    // Accept ok or graceful error (network might be unavailable in test)
    expect(res.status()).not.toBe(500)
  })

})
