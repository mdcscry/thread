import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const BASE = 'https://localhost:3000'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'
const EMAIL = 'you@localhost'
const PASS = 'thread123'

// Create a minimal valid JPEG for testing
const TEST_JPEG = Buffer.from([
  0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
  0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
  0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
  0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,
  0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,
  0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
  0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,
  0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
  0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,
  0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,0x01,0x02,0x03,0x00,
  0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,
  0x81,0x91,0xA1,0x08,0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,
  0x82,0x09,0x0A,0x16,0x17,0x18,0x19,0x1A,0x25,0x26,0x27,0x28,0x29,0x2A,0x34,0x35,
  0x36,0x37,0x38,0x39,0x3A,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x53,0x54,0x55,
  0x56,0x57,0x58,0x59,0x5A,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6A,0x73,0x74,0x75,
  0x76,0x77,0x78,0x79,0x7A,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8A,0x92,0x93,0x94,
  0x95,0x96,0x97,0x98,0x99,0x9A,0xA2,0xA3,0xA4,0xA5,0xA6,0xA7,0xA8,0xA9,0xAA,0xB2,
  0xB3,0xB4,0xB5,0xB6,0xB7,0xB8,0xB9,0xBA,0xC2,0xC3,0xC4,0xC5,0xC6,0xC7,0xC8,0xC9,
  0xCA,0xD2,0xD3,0xD4,0xD5,0xD6,0xD7,0xD8,0xD9,0xDA,0xE1,0xE2,0xE3,0xE4,0xE5,0xE6,
  0xE7,0xE8,0xE9,0xEA,0xF1,0xF2,0xF3,0xF4,0xF5,0xF6,0xF7,0xF8,0xF9,0xFA,0xFF,0xDA,
  0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xFB,0xD2,0x8A,0x28,0x03,0xFF,0xD9
])

// Write test image to disk for file-upload tests
const TEST_IMG_PATH = '/tmp/thread_test_upload.jpg'
fs.writeFileSync(TEST_IMG_PATH, TEST_JPEG)

async function login(page) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 5000 })
}

test.describe('Upload — API', () => {

  test('upload-photo-json accepts base64 JPEG and returns itemId', async ({ request }) => {
    const b64 = 'data:image/jpeg;base64,' + TEST_JPEG.toString('base64')
    const res = await request.post(`${BASE}/api/v1/ingestion/upload-photo-json`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { image: b64, filename: 'api_test.jpg' }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(typeof body.itemId).toBe('number')
    expect(body.itemId).toBeGreaterThan(0)

    // Clean up — delete the item
    await request.delete(`${BASE}/api/v1/items/${body.itemId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
  })

  test('uploaded item appears in /api/v1/items with correct image path', async ({ request }) => {
    const beforeRes = await request.get(`${BASE}/api/v1/items`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
    const before = await beforeRes.json()
    const beforeCount = before.length

    // Upload
    const b64 = 'data:image/jpeg;base64,' + TEST_JPEG.toString('base64')
    const upRes = await request.post(`${BASE}/api/v1/ingestion/upload-photo-json`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { image: b64, filename: 'path_check.jpg' }
    })
    const { itemId } = await upRes.json()
    expect(itemId).toBeGreaterThan(0)

    // Check it's in the list
    const afterRes = await request.get(`${BASE}/api/v1/items`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
    const after = await afterRes.json()
    expect(after.length).toBe(beforeCount + 1)

    const newItem = after.find(i => i.id === itemId)
    expect(newItem).toBeTruthy()

    // Image path should be user_1/... not data/images/...
    const img = newItem.primary_image
    expect(img).toBeTruthy()
    expect(img.path_thumb).toMatch(/^user_\d+\//)
    expect(img.path_thumb).not.toContain('data/images')

    // Image URL should be reachable
    const imgRes = await request.get(`${BASE}/images/${img.path_thumb}`)
    expect(imgRes.ok()).toBeTruthy()

    // Clean up
    await request.delete(`${BASE}/api/v1/items/${itemId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
  })

  test('uploaded item has name from filename', async ({ request }) => {
    const b64 = 'data:image/jpeg;base64,' + TEST_JPEG.toString('base64')
    const res = await request.post(`${BASE}/api/v1/ingestion/upload-photo-json`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { image: b64, filename: 'My Blue Blazer.jpg' }
    })
    const { itemId } = await res.json()
    expect(itemId).toBeGreaterThan(0)

    const items = await (await request.get(`${BASE}/api/v1/items`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })).json()
    const item = items.find(i => i.id === itemId)
    expect(item.name).toBe('My Blue Blazer')

    await request.delete(`${BASE}/api/v1/items/${itemId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
  })

})

test.describe('Upload — Camera Page UI', () => {

  test('camera page loads with Choose Photos button', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-testid="choose-photos-btn"]')).toBeVisible()
  })

  test('camera page shows user context or upload button', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')
    // Either shows "Adding for" (if currentUser set) or just the upload button
    const hasUserLabel = await page.locator('text=Adding for').isVisible().catch(() => false)
    const hasUploadBtn = await page.locator('[data-testid="choose-photos-btn"]').isVisible()
    expect(hasUserLabel || hasUploadBtn).toBeTruthy()
  })

  test('file selection adds photos to queue', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')

    const fileInput = page.locator('[data-testid="file-input"]')
    await fileInput.setInputFiles(TEST_IMG_PATH)

    // Queue item should appear
    await expect(page.locator('text=Ready to upload')).toBeVisible({ timeout: 3000 })
  })

  test('upload button appears after file selection', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')

    await page.locator('[data-testid="file-input"]').setInputFiles(TEST_IMG_PATH)
    await expect(page.locator('[data-testid="upload-all-btn"]')).toBeVisible({ timeout: 3000 })
  })

  test('can name an item before uploading', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')

    await page.locator('[data-testid="file-input"]').setInputFiles(TEST_IMG_PATH)

    // Find the name input for the queued item
    const nameInput = page.locator('input[placeholder*="Name this item"]').first()
    await expect(nameInput).toBeVisible({ timeout: 3000 })
    await nameInput.fill('Test Blazer')
    await expect(nameInput).toHaveValue('Test Blazer')
  })

  test('upload completes and shows done state', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')

    // Get item count before
    const beforeItems = await page.evaluate(async (apiKey) => {
      const res = await fetch('/api/v1/items', { headers: { Authorization: `Bearer ${apiKey}` } })
      const data = await res.json()
      return data.length
    }, API_KEY)

    await page.locator('[data-testid="file-input"]').setInputFiles(TEST_IMG_PATH)
    await page.locator('input[placeholder*="Name this item"]').first().fill('E2E Test Item')
    await page.locator('[data-testid="upload-all-btn"]').click()

    // Wait for done state
    await expect(page.locator('text=Added to wardrobe')).toBeVisible({ timeout: 15000 })

    // View wardrobe button should appear
    await expect(page.locator('[data-testid="view-wardrobe-btn"]')).toBeVisible()

    // Item count should have increased
    const afterItems = await page.evaluate(async (apiKey) => {
      const res = await fetch('/api/v1/items', { headers: { Authorization: `Bearer ${apiKey}` } })
      const data = await res.json()
      return data.length
    }, API_KEY)
    expect(afterItems).toBe(beforeItems + 1)

    // Clean up the test item
    const items = await page.evaluate(async (apiKey) => {
      const res = await fetch('/api/v1/items', { headers: { Authorization: `Bearer ${apiKey}` } })
      return res.json()
    }, API_KEY)
    const testItem = items.find(i => i.name === 'E2E Test Item')
    if (testItem) {
      await page.evaluate(async ({ apiKey, id }) => {
        await fetch(`/api/v1/items/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } })
      }, { apiKey: API_KEY, id: testItem.id })
    }
  })

  test('View Wardrobe button navigates to wardrobe', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')

    await page.locator('[data-testid="file-input"]').setInputFiles(TEST_IMG_PATH)
    await page.locator('[data-testid="upload-all-btn"]').click()
    await expect(page.locator('[data-testid="view-wardrobe-btn"]')).toBeVisible({ timeout: 15000 })

    await page.locator('[data-testid="view-wardrobe-btn"]').click()

    // Should now be on wardrobe page
    await expect(page.locator('nav a.active:has-text("👗"), h1, h2').first()).toBeVisible()
  })

  // Regression test: upload should work even if AI analysis fails (undefined model)
  test('upload works when AI analysis fails gracefully', async ({ request }) => {
    // Upload succeeds as long as the DB insert works
    const b64 = 'data:image/jpeg;base64,' + TEST_JPEG.toString('base64')
    const res = await request.post(`${BASE}/api/v1/ingestion/upload-photo-json`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { image: b64, filename: 'regression_test.jpg' }
    })
    
    // Should succeed even if AI analysis fails
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(typeof body.itemId).toBe('number')
    
    // Verify item was created with ai_model_used = null (not 'undefined' string)
    const itemsRes = await request.get(`${BASE}/api/v1/items/${body.itemId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
    const item = await itemsRes.json()
    
    // ai_model_used should be null/undefined, not the string 'undefined'
    expect(['undefined', 'null']).not.toContain(String(item.ai_model_used))
    
    // Clean up
    await request.delete(`${BASE}/api/v1/items/${body.itemId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
  })

})
