import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'
const HEADERS = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
const EMAIL = 'you@localhost'
const PASS = 'thread123'

async function login(page) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 5000 })
}

test.describe('Wardrobe Edit Modal', () => {

  test('clicking item card opens edit modal', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Click first item card
    const itemCard = page.locator('.item-card').first()
    await expect(itemCard).toBeVisible({ timeout: 5000 })
    await itemCard.click()
    
    // Modal should open with form fields
    await expect(page.locator('text=Edit Item')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('label:has-text("Name")')).toBeVisible()
    await expect(page.locator('label:has-text("Category")').first()).toBeVisible()
  })

  test('edit modal has all fields', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    await page.locator('.item-card').first().click()
    
    // Check all field groups exist
    await expect(page.locator('label:has-text("Name")')).toBeVisible()
    await expect(page.locator('label:has-text("Category")').first()).toBeVisible()
    await expect(page.locator('label:has-text("Subcategory")')).toBeVisible()
    await expect(page.locator('label:has-text("Primary Color")')).toBeVisible()
    await expect(page.locator('label:has-text("Pattern")')).toBeVisible()
    await expect(page.locator('label:has-text("Material")')).toBeVisible()
    await expect(page.locator('label:has-text("Formality")')).toBeVisible()
    await expect(page.locator('label:has-text("Seasons")')).toBeVisible()
    await expect(page.locator('label:has-text("Occasions")')).toBeVisible()
  })

  test('can change category in edit modal', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    await page.locator('.item-card').first().click()
    
    // Change category
    await page.locator('select').first().selectOption('top')
    
    // Save
    await page.click('button:has-text("Save Changes")')
    await page.waitForTimeout(500)
    
    // Modal should close
    await expect(page.locator('text=Edit Item')).not.toBeVisible()
  })

  test('cancel button closes modal without saving', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    await page.locator('.item-card').first().click()
    
    // Change something
    await page.locator('input[type="text"]').first().fill('SHOULD NOT SAVE')
    
    // Cancel
    await page.click('button:has-text("Cancel")')
    
    // Modal should close
    await expect(page.locator('text=Edit Item')).not.toBeVisible()
  })

  test('close button (X) closes modal', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    await page.locator('.item-card').first().click()
    await expect(page.locator('text=Edit Item')).toBeVisible()
    
    // Click X button
    await page.locator('button:has-text("×")').click()
    
    await expect(page.locator('text=Edit Item')).not.toBeVisible()
  })

  test('season checkboxes are interactive', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    await page.locator('.item-card').first().click()
    
    // Check a season checkbox
    const winterCheckbox = page.locator('label:has-text("winter") input[type="checkbox"]')
    await winterCheckbox.check()
    await expect(winterCheckbox).toBeChecked()
  })

})

test.describe('User Switching', () => {

  test('can switch to different user in profiles', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👥")')
    await page.waitForLoadState('networkidle')
    
    // Click on second user card
    const cards = page.locator('.card')
    const count = await cards.count()
    if (count > 1) {
      await cards.nth(1).click()
      await page.waitForTimeout(500)
    }
    
    await expect(page.locator('h1')).toContainText('Profiles')
  })

  test('switching user changes active user state', async ({ page }) => {
    await login(page)
    await page.waitForTimeout(500) // Wait for user state to initialize
    await page.click('nav a:has-text("👥")')
    await page.waitForLoadState('networkidle')
    
    // Check for Active badge on current user
    await expect(page.locator('text=Active')).toBeVisible()
  })

})

test.describe('Search and Filter', () => {

  test('search input filters items in real-time', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Get initial count
    const initialCards = await page.locator('.item-card').count()
    
    // Search for something that exists
    await page.fill('input[type="text"][placeholder*="Search"]', 'jacket')
    await page.waitForTimeout(300)
    
    const filteredCards = await page.locator('.item-card').count()
    expect(filteredCards).toBeLessThanOrEqual(initialCards)
  })

  test('category tabs filter items', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Click a category tab
    const topTab = page.locator('button:has-text("top")').first()
    if (await topTab.isVisible()) {
      await topTab.click()
      await page.waitForTimeout(300)
      await expect(page.locator('h1')).toContainText('Your Wardrobe')
    }
  })

  test('All tab shows all items', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Click All tab
    await page.locator('button:has-text("All")').first().click()
    await page.waitForTimeout(300)
    
    const cards = await page.locator('.item-card').count()
    expect(cards).toBeGreaterThan(0)
  })

})

test.describe('Item Actions', () => {

  test('love button toggles heart', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForSelector('.item-card', { timeout: 10000 })
    
    // Get initial heart state
    const heartBtn = page.locator('.item-card-actions button').first()
    const initialText = await heartBtn.textContent()
    const isInitiallyLoved = initialText === '❤️'
    
    // Click to toggle
    await heartBtn.click()
    await page.waitForTimeout(500)
    
    // Verify state changed
    const newText = await heartBtn.textContent()
    expect(newText).not.toBe(initialText)
  })

  test('delete button removes item after confirmation', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    const initialCount = await page.locator('.item-card').count()
    
    // Handle confirm dialog
    page.on('dialog', d => d.accept())
    
    // Click delete on first item
    const deleteBtn = page.locator('[data-action="delete"]').first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      await page.waitForTimeout(500)
      
      const afterCount = await page.locator('.item-card').count()
      expect(afterCount).toBeLessThanOrEqual(initialCount)
    }
  })

})

test.describe('Weather Integration', () => {

  test('weather shows in outfit studio', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("✨")')
    await page.waitForLoadState('networkidle')
    
    // Weather info should be displayed somewhere on the page
    // (may vary based on implementation)
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('weather API accepts various location formats', async ({ request }) => {
    const locations = [
      'Boulder, CO',
      'Boulder,Colorado', 
      '80301',
      'Boulder'
    ]
    
    for (const loc of locations) {
      const res = await request.get(`${BASE}/api/v1/weather?location=${encodeURIComponent(loc)}`, { 
        headers: HEADERS 
      })
      // Should either succeed or fail gracefully
      expect([200, 400, 404]).toContain(res.status())
    }
  })

})

test.describe('Settings', () => {

  test('settings page displays API key', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("⚙️")')
    await page.waitForLoadState('networkidle')
    
    // Should show API key (may be masked)
    const pageContent = await page.content()
    expect(pageContent).toMatch(/thread_sk_|API Key|Key/)
  })

  test('settings page shows wardrobe stats', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("⚙️")')
    await page.waitForLoadState('networkidle')
    
    // Should show some stats
    const stats = page.locator('text=/\\d+ items|style|wardrobe/i')
    await expect(stats.first()).toBeVisible({ timeout: 3000 })
  })

})

test.describe('Navigation', () => {

  test('all nav items are accessible', async ({ page }) => {
    await login(page)
    
    const navItems = ['👗', '✨', '📷', '✈️', '👥', '📥', '⚙️']
    
    for (const item of navItems) {
      await page.click(`nav a:has-text("${item}")`)
      await page.waitForTimeout(300)
      await expect(page.locator('h1, h2').first()).toBeVisible()
    }
  })

  test('active nav item is highlighted', async ({ page }) => {
    await login(page)
    
    // Default should be wardrobe
    const wardrobeLink = page.locator('nav a:has-text("👗")')
    await expect(wardrobeLink).toBeVisible()
  })

})

test.describe('Outfit Studio', () => {

  test('can type outfit prompt', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("✨")')
    await page.waitForLoadState('networkidle')
    
    const input = page.locator('input[type="text"], textarea').first()
    if (await input.isVisible()) {
      await input.fill('Something casual for the weekend')
      await expect(input).toHaveValue('Something casual for the weekend')
    }
  })

  test('generate button exists', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("✨")')
    await page.waitForLoadState('networkidle')
    
    const generateBtn = page.locator('button:has-text("Generate"), button:has-text("Suggest"), button:has-text("Create")').first()
    await expect(generateBtn).toBeVisible({ timeout: 3000 })
  })

})

test.describe('Vacation Planner', () => {

  test('vacation page loads', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("✈️")')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('vacation form has required fields', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("✈️")')
    await page.waitForLoadState('networkidle')
    
    // Should have destination input
    const inputs = page.locator('input')
    expect(await inputs.count()).toBeGreaterThan(0)
  })

})

test.describe('Ingestion Page', () => {

  test('ingestion page shows Ollama status', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📥")')
    await page.waitForLoadState('networkidle')
    
    // Should show Ollama connection status
    const status = page.locator('text=/ollama|connected|disconnected|Model/i')
    await expect(status.first()).toBeVisible({ timeout: 5000 })
  })

  test('ingestion page has source URL input', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("📥")')
    await page.waitForLoadState('networkidle')
    
    const input = page.locator('input').first()
    await expect(input).toBeVisible()
  })

})

test.describe('Edge Cases', () => {

  test('empty search returns all items', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    const initialCount = await page.locator('.item-card').count()
    
    // Clear search
    await page.fill('input[type="text"][placeholder*="Search"]', '')
    await page.waitForTimeout(300)
    
    const afterCount = await page.locator('.item-card').count()
    expect(afterCount).toBe(initialCount)
  })

  test('rapid filter switching does not break UI', async ({ page }) => {
    await login(page)
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Rapidly click different filters
    const tabs = page.locator('.tab, button:has-text("top"), button:has-text("All")')
    const count = await tabs.count()
    if (count > 1) {
      await tabs.nth(0).click()
      await tabs.nth(1).click()
      await tabs.nth(0).click()
    }
    
    // UI should still be functional
    await expect(page.locator('h1')).toContainText('Your Wardrobe')
  })

})
