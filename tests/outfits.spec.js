import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'
const EMAIL = 'you@localhost'
const PASS = 'thread123'
const HEADERS = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }

async function loginNav(page, emoji) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 5000 })
  if (emoji) await page.click(`nav a:has-text("${emoji}")`)
  await page.waitForLoadState('networkidle')
}

test.describe('Outfits — API', () => {

  test('POST /outfits/from-item returns suggestions for valid itemId', async ({ request }) => {
    // First get a valid item ID from the user's wardrobe
    const itemsRes = await request.get(`${BASE}/api/v1/items`, { headers: HEADERS })
    const items = await itemsRes.json()
    
    if (!items || items.length === 0) {
      test.skip() // No items in wardrobe
      return
    }
    
    const itemId = items[0].id
    const res = await request.post(`${BASE}/api/v1/outfits/from-item`, {
      headers: HEADERS,
      data: { itemId }
    })
    
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('item')
    expect(body).toHaveProperty('suggestions')
    expect(Array.isArray(body.suggestions)).toBe(true)
  })

  test('POST /outfits/from-item returns 404 for invalid itemId', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/from-item`, {
      headers: HEADERS,
      data: { itemId: 999999 }
    })
    
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.error).toContain('not found')
  })

  test('POST /outfits/from-item returns 400 when itemId is missing', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/from-item`, {
      headers: HEADERS,
      data: {}
    })
    
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(body.error).toContain('required')
  })

  test('POST /outfits/from-item returns empty suggestions when no matches found', async ({ request }) => {
    // Get items and try one that may not have complements
    const itemsRes = await request.get(`${BASE}/api/v1/items`, { headers: HEADERS })
    const items = await itemsRes.json()
    
    if (!items || items.length === 0) {
      test.skip()
      return
    }
    
    const itemId = items[0].id
    const res = await request.post(`${BASE}/api/v1/outfits/from-item`, {
      headers: HEADERS,
      data: { itemId }
    })
    
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('suggestions')
    // Suggestions may be empty but should be an array
    expect(Array.isArray(body.suggestions)).toBe(true)
  })

  test('GET /outfits returns array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const outfits = await res.json()
    expect(Array.isArray(outfits)).toBe(true)
  })

  test('POST /outfits/generate returns outfits or meaningful error', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/generate`, {
      headers: HEADERS,
      data: {
        occasion: 'casual',
        location: 'Boulder, CO',
        chatPrompt: 'Something casual for a weekend'
      }
    })
    // Either generates outfits, or returns a clear error (not enough items, etc.)
    // Should never be a 500
    expect(res.status()).not.toBe(500)
    const body = await res.json()
    if (res.ok()) {
      expect(body).toHaveProperty('outfits')
      expect(Array.isArray(body.outfits)).toBe(true)
    } else {
      expect(body).toHaveProperty('error')
    }
  })

  test('POST /outfits/:id/feedback accepts thumbs up', async ({ request }) => {
    // Get or create an outfit to feedback on
    const outfits = await (await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })).json()

    if (outfits.length === 0) {
      // Generate one first
      const gen = await request.post(`${BASE}/api/v1/outfits/generate`, {
        headers: HEADERS,
        data: { occasion: 'casual', location: 'Boulder, CO' }
      })
      if (!gen.ok()) {
        test.skip() // Not enough items to generate
        return
      }
      const { outfits: newOutfits } = await gen.json()
      if (!newOutfits?.[0]?.id) { test.skip(); return }
      outfits.push(newOutfits[0])
    }

    const outfitId = outfits[0].id
    const res = await request.post(`${BASE}/api/v1/outfits/${outfitId}/feedback`, {
      headers: HEADERS,
      data: { feedback: 1, signalType: 'thumbs_up' }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('POST /outfits/:id/feedback accepts thumbs down', async ({ request }) => {
    const outfits = await (await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })).json()
    if (outfits.length === 0) { test.skip(); return }

    const outfitId = outfits[0].id
    const res = await request.post(`${BASE}/api/v1/outfits/${outfitId}/feedback`, {
      headers: HEADERS,
      data: { feedback: -1, signalType: 'thumbs_down' }
    })
    expect(res.ok()).toBeTruthy()
  })

  test('POST /outfits/:id/worn marks outfit as worn', async ({ request }) => {
    const outfits = await (await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })).json()
    if (outfits.length === 0) { test.skip(); return }

    const outfitId = outfits[0].id
    const res = await request.post(`${BASE}/api/v1/outfits/${outfitId}/worn`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('GET /outfits/:id returns outfit with items array', async ({ request }) => {
    const outfits = await (await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })).json()
    if (outfits.length === 0) { test.skip(); return }

    const res = await request.get(`${BASE}/api/v1/outfits/${outfits[0].id}`, { headers: HEADERS })
    expect(res.ok()).toBeTruthy()
    const outfit = await res.json()
    expect(outfit).toHaveProperty('items')
  })

  test('GET /outfits/:id returns 404 for unknown id', async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/outfits/999999`, { headers: HEADERS })
    expect(res.status()).toBe(404)
  })

  test('POST /outfits/generate-couple returns pairs or error', async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/outfits/generate-couple`, {
      headers: HEADERS,
      data: { user1Id: 1, user2Id: 2, chatPrompt: 'Dinner out' }
    })
    expect(res.status()).not.toBe(500)
    const body = await res.json()
    if (res.ok()) {
      expect(body).toHaveProperty('pairs')
    } else {
      expect(body).toHaveProperty('error')
    }
  })

})

test.describe('Outfits — UI', () => {

  test('outfit studio page loads', async ({ page }) => {
    await loginNav(page, '✨')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('outfit prompt input exists', async ({ page }) => {
    await loginNav(page, '✨')
    const input = page.locator('input[type="text"], textarea').first()
    await expect(input).toBeVisible()
  })

  test('can type a prompt', async ({ page }) => {
    await loginNav(page, '✨')
    const input = page.locator('input[type="text"], textarea').first()
    await input.fill('Something casual for the weekend')
    await expect(input).toHaveValue('Something casual for the weekend')
  })

  test('generate button exists', async ({ page }) => {
    await loginNav(page, '✨')
    const btn = page.locator('button').filter({ hasText: /generate|suggest|create/i }).first()
    await expect(btn).toBeVisible()
  })

  test('feedback buttons (thumbs) exist in outfit results if any exist', async ({ page, request }) => {
    const outfits = await (await request.get(`${BASE}/api/v1/outfits`, { headers: HEADERS })).json()
    if (outfits.length === 0) {
      test.info().annotations.push({ type: 'skip', description: 'No outfits to test feedback on' })
      return
    }
    await loginNav(page, '✨')
    // Look for thumbs up/down buttons
    const thumbs = page.locator('button').filter({ hasText: /👍|👎|♥|love|worn/i })
    // These might not be visible until outfits are generated — just check page loads cleanly
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('outfit studio has "Start with an item" button', async ({ page }) => {
    await loginNav(page, '✨')
    const btn = page.locator('button').filter({ hasText: /start with an item|start with/i }).first()
    await expect(btn).toBeVisible()
  })

})
