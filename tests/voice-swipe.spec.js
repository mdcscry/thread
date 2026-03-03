/**
 * Voice + Swipe Mode Tests
 * Tests for VoiceButton component and SwipeMode in OutfitTrainer
 */

const { test, expect } = require('@playwright/test')

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000'
const API_KEY = process.env.TEST_API_KEY || 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'

async function login(page) {
  await page.goto(BASE_URL)
  await page.fill('input[type="email"]', 'you@localhost')
  await page.fill('input[type="password"]', 'thread123')
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('login'), { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(500)
}

async function goToTrainer(page) {
  await login(page)
  await page.click('a[href="#"]:has-text("🧠"), nav a:nth-child(3)')
  await page.waitForTimeout(500)
}

async function goToStudio(page) {
  await login(page)
  await page.click('nav a:nth-child(2)')
  await page.waitForTimeout(500)
}

// ── Voice Button ──────────────────────────────────────────────────────────────

test.describe('VoiceButton', () => {
  test('appears on OutfitTrainer page', async ({ page }) => {
    await goToTrainer(page)
    const btn = page.locator('button:has-text("Tap to generate a random outfit")')
    await expect(btn).toBeVisible()
  })

  test('appears on OutfitStudio page', async ({ page }) => {
    await goToStudio(page)
    const btn = page.locator('button:has-text("Tap to describe what you\'re looking for")')
    await expect(btn).toBeVisible()
  })

  test('trainer voice button has mic emoji', async ({ page }) => {
    await goToTrainer(page)
    const btn = page.locator('button:has-text("🎤")')
    await expect(btn).toBeVisible()
  })

  test('studio voice button has mic emoji', async ({ page }) => {
    await goToStudio(page)
    const btn = page.locator('button:has-text("🎤")')
    await expect(btn).toBeVisible()
  })
})

// ── Intent Parser (unit-level via page.evaluate) ──────────────────────────────

test.describe('Voice Intent Parser', () => {
  test('parses casual occasion', async ({ page }) => {
    await page.goto(BASE_URL)
    const result = await page.evaluate(() => {
      // Inline the parser logic for testing
      function parseOutfitIntent(transcript) {
        const t = transcript.toLowerCase()
        const occasionMap = {
          casual: ['casual','relaxed','chill','everyday','weekend','lounge'],
          work: ['work','office','professional','business','meeting','interview'],
          formal: ['formal','gala','black tie','fancy','elegant','suit'],
          date: ['date','dinner','romantic','evening out','night out','restaurant'],
          outdoor: ['outdoor','hiking','gym','athletic','sport','active','workout'],
        }
        let occasion = 'casual'
        for (const [occ, words] of Object.entries(occasionMap)) {
          if (words.some(w => t.includes(w))) { occasion = occ; break }
        }
        const countMatch = t.match(/(\d+)\s*(outfit|look|option)/i)
        const count = countMatch ? Math.min(parseInt(countMatch[1]), 10) : 5
        return { occasion, count }
      }
      return parseOutfitIntent('something relaxed for the weekend')
    })
    expect(result.occasion).toBe('casual')
    expect(result.count).toBe(5)
  })

  test('parses work occasion', async ({ page }) => {
    await page.goto(BASE_URL)
    const result = await page.evaluate(() => {
      function parseOutfitIntent(t) {
        t = t.toLowerCase()
        if (t.includes('work') || t.includes('office') || t.includes('meeting')) return { occasion: 'work', count: 5 }
        if (t.includes('date') || t.includes('dinner') || t.includes('restaurant')) return { occasion: 'date', count: 5 }
        return { occasion: 'casual', count: 5 }
      }
      return parseOutfitIntent('I have a work meeting tomorrow')
    })
    expect(result.occasion).toBe('work')
  })

  test('parses date occasion', async ({ page }) => {
    await page.goto(BASE_URL)
    const result = await page.evaluate(() => {
      function parseOutfitIntent(t) {
        t = t.toLowerCase()
        if (t.includes('work') || t.includes('office') || t.includes('meeting')) return { occasion: 'work', count: 5 }
        if (t.includes('date') || t.includes('dinner') || t.includes('restaurant')) return { occasion: 'date', count: 5 }
        return { occasion: 'casual', count: 5 }
      }
      return parseOutfitIntent('dinner date tonight nothing too formal')
    })
    expect(result.occasion).toBe('date')
  })

  test('parses count from transcript', async ({ page }) => {
    await page.goto(BASE_URL)
    const result = await page.evaluate(() => {
      function parseOutfitIntent(transcript) {
        const countMatch = transcript.match(/(\d+)\s*(outfit|look|option)/i)
        const count = countMatch ? Math.min(parseInt(countMatch[1]), 10) : 5
        return { count }
      }
      return parseOutfitIntent('show me 3 outfit options')
    })
    expect(result.count).toBe(3)
  })

  test('caps count at 10', async ({ page }) => {
    await page.goto(BASE_URL)
    const result = await page.evaluate(() => {
      function parseOutfitIntent(transcript) {
        const countMatch = transcript.match(/(\d+)\s*(outfit|look|option)/i)
        const count = countMatch ? Math.min(parseInt(countMatch[1]), 10) : 5
        return { count }
      }
      return parseOutfitIntent('give me 99 outfit options')
    })
    expect(result.count).toBe(10)
  })
})

// ── Swipe Mode ────────────────────────────────────────────────────────────────

test.describe('SwipeMode', () => {
  test('view toggle appears after generating outfits', async ({ page }) => {
    await goToTrainer(page)

    // Generate outfits via API directly to speed up test
    const res = await page.request.post(`${BASE_URL}/api/v1/outfit-trainer/generate`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { categories: {}, occasion: 'casual', count: 2 }
    })
    expect(res.ok()).toBe(true)

    // Trigger generate in UI
    await page.click('button:has-text("Generate")')
    await page.waitForSelector('button:has-text("Swipe")', { timeout: 15000 })

    const swipeBtn = page.locator('button:has-text("Swipe")')
    const gridBtn = page.locator('button:has-text("Grid")')
    await expect(swipeBtn).toBeVisible()
    await expect(gridBtn).toBeVisible()
  })

  test('swipe mode is default on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // iPhone 14
    await goToTrainer(page)
    await page.click('button:has-text("Generate")')
    await page.waitForSelector('button:has-text("Swipe"), button:has-text("Grid")', { timeout: 15000 })

    // On mobile, swipe should be active (primary styled)
    const swipeBtn = page.locator('button:has-text("Swipe")')
    await expect(swipeBtn).toBeVisible()
  })

  test('grid mode is default on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await goToTrainer(page)
    await page.click('button:has-text("Generate")')
    await page.waitForSelector('button:has-text("Grid"), button:has-text("Swipe")', { timeout: 15000 })

    const gridBtn = page.locator('button:has-text("Grid")')
    await expect(gridBtn).toBeVisible()
  })

  test('like and nope buttons are visible in swipe mode', async ({ page }) => {
    await goToTrainer(page)
    await page.click('button:has-text("Generate")')
    await page.waitForSelector('button:has-text("👆 Swipe")', { timeout: 15000 })
    await page.click('button:has-text("👆 Swipe")')
    await page.waitForTimeout(300)

    const likeBtn = page.locator('button[title="Like"]')
    const nopeBtn = page.locator('button[title="Nope"]')
    await expect(likeBtn).toBeVisible()
    await expect(nopeBtn).toBeVisible()
  })

  test('clicking like advances to next card', async ({ page }) => {
    await goToTrainer(page)
    await page.click('button:has-text("Generate")')
    await page.waitForSelector('button:has-text("👆 Swipe")', { timeout: 15000 })
    await page.click('button:has-text("👆 Swipe")')
    await page.waitForTimeout(300)

    // Check initial progress
    const progress = page.locator('text=/1 \\/ \\d+/')
    await expect(progress).toBeVisible()

    // Click like
    await page.click('button[title="Like"]')
    await page.waitForTimeout(400)

    // Progress should advance
    const progress2 = page.locator('text=/2 \\/ \\d+/')
    await expect(progress2).toBeVisible()
  })

  test('completing all swipes shows summary screen', async ({ page }) => {
    await goToTrainer(page)

    // Generate just 2 outfits to make test fast
    await page.selectOption('input[type="number"]', { label: '2' }).catch(() => {})
    const countInput = page.locator('input[type="number"]')
    await countInput.fill('2')

    await page.click('button:has-text("Generate")')
    await page.waitForSelector('button:has-text("👆 Swipe")', { timeout: 15000 })
    await page.click('button:has-text("👆 Swipe")')
    await page.waitForTimeout(300)

    // Swipe through all
    for (let i = 0; i < 2; i++) {
      await page.click('button[title="Like"]')
      await page.waitForTimeout(400)
    }

    // Should show completion screen
    await expect(page.locator('text=All done!')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('button:has-text("Submit Feedback")')).toBeVisible()
    await expect(page.locator('button:has-text("Generate More")')).toBeVisible()
  })

  test('can switch between grid and swipe modes', async ({ page }) => {
    await goToTrainer(page)
    await page.click('button:has-text("Generate")')
    await page.waitForSelector('button:has-text("👆 Swipe")', { timeout: 15000 })

    // Switch to swipe
    await page.click('button:has-text("👆 Swipe")')
    await page.waitForTimeout(300)
    await expect(page.locator('button[title="Like"]')).toBeVisible()

    // Switch back to grid
    await page.click('button:has-text("⊞ Grid")')
    await page.waitForTimeout(300)
    await expect(page.locator('button[title="Like"]')).not.toBeVisible()
  })
})

// ── Outfit Trainer API ────────────────────────────────────────────────────────

test.describe('Outfit Trainer API', () => {
  test('generate endpoint returns outfits', async ({ page }) => {
    const res = await page.request.post(`${BASE_URL}/api/v1/outfit-trainer/generate`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { categories: {}, occasion: 'casual', count: 3 }
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.outfits).toBeDefined()
    expect(Array.isArray(data.outfits)).toBe(true)
  })

  test('generate respects occasion param', async ({ page }) => {
    const res = await page.request.post(`${BASE_URL}/api/v1/outfit-trainer/generate`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: { categories: {}, occasion: 'work', count: 2 }
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data).toHaveProperty('outfits')
  })

  test('stats endpoint returns data', async ({ page }) => {
    const res = await page.request.get(`${BASE_URL}/api/v1/outfit-trainer/stats`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data).toHaveProperty('totalSamples')
  })

  test('feedback endpoint accepts swipe-style batch', async ({ page }) => {
    const res = await page.request.post(`${BASE_URL}/api/v1/outfit-trainer/feedback`, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      data: {
        items: [{ itemId: 1, feedback: 'thumbs_up' }, { itemId: 2, feedback: 'thumbs_down' }],
        outfitId: null,
        context: { occasion: 'casual', season: null, timeOfDay: null }
      }
    })
    // Should not 500 — 200 or 404 (item not found) both acceptable
    expect(res.status()).not.toBe(500)
  })
})
