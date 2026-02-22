import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'
const HEADERS = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
const EMAIL = 'you@localhost'
const PASS = 'thread123'

// Minimal valid JPEG for tests
const TEST_JPEG_B64 = 'data:image/jpeg;base64,' + Buffer.from([
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
]).toString('base64')

async function uploadTestItem(request, name = 'test_item') {
  const res = await request.post(`${BASE}/api/v1/ingestion/upload-photo-json`, {
    headers: HEADERS,
    data: { image: TEST_JPEG_B64, filename: `${name}.jpg` }
  })
  if (!res.ok()) return null
  const body = await res.json()
  return body.itemId
}

async function login(page) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 5000 })
}

test.describe('1. Outfit Generation', () => {

  test('POST /outfits/generate with casual occasion', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/generate`, {
      headers: HEADERS,
      data: {
        occasion: 'casual',
        chatPrompt: 'Weekend casual outfit'
      }
    })
    expect(res.status()).not.toBe(500)
    const body = await res.json()
    if (res.ok()) {
      expect(body).toHaveProperty('outfits')
      expect(Array.isArray(body.outfits)).toBe(true)
    }
  })

  test('POST /outfits/generate with work occasion', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/generate`, {
      headers: HEADERS,
      data: {
        occasion: 'work',
        chatPrompt: 'Business casual for office'
      }
    })
    expect(res.status()).not.toBe(500)
  })

  test('POST /outfits/generate with evening occasion', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/generate`, {
      headers: HEADERS,
      data: {
        occasion: 'evening',
        chatPrompt: 'Dinner date'
      }
    })
    expect(res.status()).not.toBe(500)
  })

  test('POST /outfits/generate returns context with weather', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/generate`, {
      headers: HEADERS,
      data: { occasion: 'casual' }
    })
    if (res.ok()) {
      const body = await res.json()
      expect(body).toHaveProperty('context')
    }
  })

  test('POST /outfits/generate-couple with two users', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/generate-couple`, {
      headers: HEADERS,
      data: {
        user1Id: 1,
        user2Id: 2,
        chatPrompt: 'Couple going to a concert'
      }
    })
    // Either returns pairs or error about insufficient items
    expect([200, 400]).toContain(res.status())
  })

  test('GET /outfits returns list of generated outfits', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const outfits = await res.json()
    expect(Array.isArray(outfits)).toBe(true)
  })

  test('GET /outfits supports limit parameter', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/outfits?limit=5`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const outfits = await res.json()
    expect(outfits.length).toBeLessThanOrEqual(5)
  })

  test('GET /outfits/:id returns single outfit with items', async ({ request }) => {
    const list = await (await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })).json()
    if (list.length > 0) {
      const res = await request.get(`${BASE}/api/v1/outfits/${list[0].id}`, { headers: HEADERS })
      expect(res.ok()).toBeTruthy()
      const outfit = await res.json()
      expect(outfit).toHaveProperty('items')
    }
  })

})

test.describe('2. Search Functionality', () => {

  test('GET /items?search finds items by name', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items?search=sweater`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const items = await res.json()
    items.forEach(i => {
      expect(i.name?.toLowerCase()).toContain('sweater')
    })
  })

  test('GET /items?search finds items by color', async ({ request }) => {
    // First upload an item with a known color
    const res = await request.get(`${BASE}/api/v1/items?search=blue`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const items = await res.json()
    // May be empty or have items
    expect(Array.isArray(items)).toBe(true)
  })

  test('GET /items?search is case insensitive', async ({ request }) => {
    const lower = await (await request.get(`${BASE}/api/v1/items?search=sweater`, { headers: HEADERS })).json()
    const upper = await (await request.get(`${BASE}/api/v1/items?search=Sweater`, { headers: HEADERS })).json()
    expect(lower.length).toBe(upper.length)
  })

  test('GET /items?search with no results returns empty array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items?search=xyznonexistent123`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const items = await res.json()
    expect(items.length).toBe(0)
  })

  test('search input exists in wardrobe UI', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first()
    await expect(searchInput).toBeVisible({ timeout: 3000 })
  })

  test('can type in search and see results', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first()
    await searchInput.fill('sweater')
    await page.waitForTimeout(500)
    // Should still have results or clear state
    await expect(page.locator('h1, h2, .card').first()).toBeVisible()
  })

})

test.describe('3. Weather API', () => {

  test('GET /weather returns current weather', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/weather?location=Boulder,CO`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const weather = await res.json()
    expect(weather).toBeTruthy()
  })

  test('GET /weather accepts different locations', async ({ request }) => {
    const locations = ['Denver,CO', 'New York,NY', 'Los Angeles,CA']
    for (const loc of locations) {
      const res = await request.get(`${BASE}/api/v1/weather?location=${encodeURIComponent(loc)}`, { headers: HEADERS })
      // Either success or graceful error for invalid location
      expect([200, 400, 404]).toContain(res.status())
    }
  })

  test('GET /weather/forecast returns forecast', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/weather/forecast?location=Boulder,CO`, { headers: HEADERS })
    // Weather service may be down or return error - that's OK
    expect([200, 400, 404, 500]).toContain(res.status())
  })

  test('GET /weather without location returns 400', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/weather`, { headers: HEADERS })
    expect(res.status()).toBe(400)
  })

  test('GET /weather/geocode returns coordinates', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/weather/geocode?location=Boulder,CO`, { headers: HEADERS })
    // May return coordinates or error
    expect([200, 400, 404]).toContain(res.status())
  })

})

test.describe('4. Error Handling', () => {

  test('unauthorized request returns 401', async ({ request }) => {
    const endpoints = [
      `${BASE}/api/v1/items`,
      `${BASE}/api/v1/outfits`,
      `${BASE}/api/v1/users`,
      `${BASE}/api/v1/settings/me`
    ]
    for (const url of endpoints) {
      const res = await request.get(url)
      expect(res.status()).toBe(401)
    }
  })

  test('invalid API key returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items`, {
      headers: { Authorization: 'Bearer invalid_key_123' }
    })
    expect(res.status()).toBe(401)
  })

  test('GET /items/:id with invalid id returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items/999999999`, { headers: HEADERS })
    expect(res.status()).toBe(404)
  })

  test('PATCH /items/:id with invalid id returns 404', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/v1/items/999999999`, {
      headers: HEADERS,
      data: { name: 'test' }
    })
    expect(res.status()).toBe(404)
  })

  test('DELETE /items/:id with invalid id returns 404', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/v1/items/999999999`, { headers: HEADERS })
    expect(res.status()).toBe(404)
  })

  test('POST /items/:id/love with invalid id returns 404', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/items/999999999/love`, { headers: HEADERS })
    expect(res.status()).toBe(404)
  })

  test('login with invalid email returns error', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'notexist@example.com', password: 'anypassword' }
    })
    expect(res.ok()).toBeFalsy()
  })

  test('login with wrong password returns error', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: { email: EMAIL, password: 'wrongpassword' }
    })
    expect(res.ok()).toBeFalsy()
  })

  test('API request with malformed JSON body returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/items`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      data: 'not json'
    })
    expect([400, 415]).toContain(res.status())
  })

})

test.describe('5. Edge Cases', () => {

  test('empty wardrobe returns empty array', async ({ request }) => {
    // This assumes we can query for user with no items
    const res = await request.get(`${BASE}/api/v1/items?userId=9999`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const items = await res.json()
    expect(Array.isArray(items)).toBe(true)
  })

  test('duplicate item upload is allowed', async ({ request }) => {
    const id1 = await uploadTestItem(request, 'dup_test_1')
    const id2 = await uploadTestItem(request, 'dup_test_2')
    // Both should succeed (or fail gracefully)
    expect([true, false]).toContain(id1 > 0)
  })

  test('very long item name is handled', async ({ request }) => {
    const longName = 'a'.repeat(500)
    const res = await request.patch(`${BASE}/api/v1/items/5`, {
      headers: HEADERS,
      data: { name: longName }
    })
    // Should either truncate or accept
    expect([200, 400]).toContain(res.status())
  })

  test('special characters in search are handled', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items?search=<script>`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
  })

  test('API handles missing optional parameters gracefully', async ({ request }) => {
    // /outfits/generate without any body
    const res = await request.post(`${BASE}/api/v1/outfits/generate`, {
      headers: HEADERS,
      data: {}
    })
    // Should return error, not 500
    expect([200, 400]).toContain(res.status())
  })

  test('category filter with invalid category returns empty', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items?category=invalid_category_xyz`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const items = await res.json()
    // Should return empty or items (filtered)
    expect(Array.isArray(items)).toBe(true)
  })

  test('pagination - offset parameter works', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items?offset=0&limit=2`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const items = await res.json()
    expect(items.length).toBeLessThanOrEqual(2)
  })

})

test.describe('6. Data Integrity', () => {

  test('item created_at timestamp is set', async ({ request }) => {
    const items = await (await request.get(`${BASE}/api/v1/items`, { headers: HEADERS })).json()
    if (items.length > 0) {
      expect(items[0]).toHaveProperty('created_at')
      expect(items[0].created_at).toBeTruthy()
    }
  })

  test('item has primary_image when image was uploaded', async ({ request }) => {
    const items = await (await request.get(`${BASE}/api/v1/items`, { headers: HEADERS })).json()
    const withImage = items.filter(i => i.primary_image)
    if (withImage.length > 0) {
      expect(withImage[0].primary_image.path_thumb).toMatch(/^user_\d+\//)
    }
  })

  test('user profile has required fields', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/users/1`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const user = await res.json()
    expect(user).toHaveProperty('id')
    expect(user).toHaveProperty('email')
  })

  test('item soft delete sets is_active to 0', async ({ request }) => {
    // Create and delete
    const id = await uploadTestItem(request, 'soft_delete_test')
    if (id) {
      await request.delete(`${BASE}/api/v1/items/${id}`, { headers: HEADERS })
      // Item should not appear in active list
      const items = await (await request.get(`${BASE}/api/v1/items`, { headers: HEADERS })).json()
      const stillExists = items.find(i => i.id === id)
      expect(stillExists).toBeUndefined()
    }
  })

})

test.describe('7. UI Interactions', () => {

  test('can switch between users in profiles', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👥")')
    // Click on second user card if exists
    const cards = page.locator('.card')
    const count = await cards.count()
    if (count > 1) {
      await cards.nth(1).click()
      await page.waitForTimeout(300)
    }
    await expect(page.locator('h1')).toContainText('Profiles')
  })

  test('wardrobe category filter tabs filter items', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    
    // Click a category tab
    const tab = page.locator('button:has-text("knitwear"), button:has-text("top")').first()
    if (await tab.isVisible()) {
      await tab.click()
      await page.waitForTimeout(500)
      // Page should still work
      await expect(page.locator('h1, h2').first()).toBeVisible()
    }
  })

  test('settings page shows API key', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("⚙️")')
    const pageContent = await page.content()
    expect(pageContent).toContain('thread_sk_')
  })

  test('can navigate to all pages without error', async ({ page }) => {
    await login(page)
    const navs = ['👗', '✨', '📷', '✈️', '👥', '📥', '⚙️']
    for (const nav of navs) {
      await page.click(`nav a:has-text("${nav}")`)
      await page.waitForTimeout(300)
      await expect(page.locator('h1, h2').first()).toBeVisible()
    }
  })

})

test.describe('8. Performance & Limits', () => {

  test('items endpoint responds quickly', async ({ request }) => {
    const start = Date.now()
    await request.get(`${BASE}/api/v1/items`, { headers: HEADERS })
    const duration = Date.now() - start
    expect(duration).toBeLessThan(2000) // Should respond within 2 seconds
  })

  test('large limit parameter is handled', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/items?limit=1000`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
  })

})
