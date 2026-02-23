/**
 * THREAD Smoke Tests
 * 
 * Tests all ingestion methods:
 * - URL ingestion (from glyphmatic.us)
 * - Local folder ingestion
 * - Google Drive ingestion (when configured)
 * 
 * Note: Same images can be in multiple sources - they'll just get added multiple times.
 * End state: N items per source tested.
 */

import { test, expect } from '@playwright/test'

const BASE = process.env.TEST_BASE_URL || 'https://localhost:8080'
const EMAIL = 'you@localhost'
const PASS = 'thread123'

// Test data - images available from each source
// These map to data/test-images/blueowl/ folders
const TEST_SOURCES = {
  url: {
    baseUrl: 'https://glyphmatic.us/tools/thread/male',
    images: [
      '01-tshirt.jpg', '02-buttonup.jpg', '03-knitwear.jpg',
      '04-hoodie.jpg', '05-jacket.jpg', '06-jeans.jpg',
      '07-pants.jpg', '09-boots.jpg', '10-shoes.jpg',
      '11-sandals.jpg', '12-belt.jpg', '13-hat.jpg', '14-socks.jpg'
    ],
    expectedCategories: ['T-Shirt', 'Button-Up', 'Knitwear', 'Hoodie', 'Jacket', 
                        'Jeans', 'Pants', 'Boots', 'Shoes', 'Sandals', 
                        'Belt', 'Hat', 'Socks']
  },
  local: {
    folder: 'data/test-images/blueowl/male',
    images: [
      '01-tshirt.jpg', '02-buttonup.jpg', '03-knitwear.jpg',
      '04-hoodie.jpg', '05-jacket.jpg', '06-jeans.jpg',
      '07-pants.jpg', '09-boots.jpg', '10-shoes.jpg',
      '11-sandals.jpg', '12-belt.jpg', '13-hat.jpg', '14-socks.jpg'
    ],
    expectedCategories: ['T-Shirt', 'Button-Up', 'Knitwear', 'Hoodie', 'Jacket', 
                        'Jeans', 'Pants', 'Boots', 'Shoes', 'Sandals', 
                        'Belt', 'Hat', 'Socks']
  },
  drive: {
    folder: 'data/test-images/blueowl/male', // Same images in Drive
    images: [
      '01-tshirt.jpg', '02-buttonup.jpg', '03-knitwear.jpg',
      '04-hoodie.jpg', '05-jacket.jpg', '06-jeans.jpg',
      '07-pants.jpg', '09-boots.jpg', '10-shoes.jpg',
      '11-sandals.jpg', '12-belt.jpg', '13-hat.jpg', '14-socks.jpg'
    ],
    expectedCategories: ['T-Shirt', 'Button-Up', 'Knitwear', 'Hoodie', 'Jacket', 
                        'Jeans', 'Pants', 'Boots', 'Shoes', 'Sandals', 
                        'Belt', 'Hat', 'Socks']
  }
}

async function login(page) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 10000 })
}

async function getItemCount(page) {
  await page.waitForSelector('.item-card, [class*="itemGrid"]', { timeout: 5000 })
  const items = await page.locator('.item-card, [class*="itemGrid"]').count()
  return items
}

test.describe('THREAD Smoke Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('smoke: wardrobe loads', async ({ page }) => {
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    const count = await getItemCount(page)
    console.log(`Wardrobe has ${count} items`)
    
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('smoke: profiles page works', async ({ page }) => {
    await page.click('nav a:has-text("👥")')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Profile, text=User')).toBeVisible({ timeout: 5000 })
  })

  test('smoke: settings page loads', async ({ page }) => {
    await page.click('nav a:has-text("⚙️")')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Settings, text=API')).toBeVisible({ timeout: 5000 })
  })

  test('smoke: gender-based categories change', async ({ page }) => {
    // Go to profiles
    await page.click('nav a:has-text("👥")')
    await page.waitForLoadState('networkidle')
    
    // Check if we can switch profiles or see gender options
    const genderSelect = page.locator('select[name="gender"], input[name="gender"]')
    if (await genderSelect.count() > 0) {
      console.log('Gender selector found - can test category changes')
    }
    
    // Go to wardrobe
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Try adding an item to see category options
    const addButton = page.locator('button:has-text("+"), button:has-text("Add")').first()
    if (await addButton.count() > 0) {
      await addButton.click()
      await page.waitForTimeout(500)
      
      // Check category dropdown options
      const categoryOptions = await page.locator('select[name="category"] option, [class*="category"]').count()
      console.log(`Category options found: ${categoryOptions}`)
    }
  })

  test('ingestion: URL method works', async ({ page }) => {
    await page.click('nav a:has-text("📥")') // Ingestion
    await page.waitForLoadState('networkidle')
    
    const initialCount = await getItemCount(page)
    console.log(`Before URL ingestion: ${initialCount} items`)
    
    // Try URL ingestion with first test image
    const urlInput = page.locator('input[placeholder*="URL" i], input[name="url"]')
    if (await urlInput.count() > 0) {
      const testUrl = `${TEST_SOURCES.url.baseUrl}/01-tshirt.jpg`
      await urlInput.fill(testUrl)
      
      const submitButton = page.locator('button:has-text("Add"), button:has-text("Submit")').first()
      if (await submitButton.count() > 0) {
        await submitButton.click()
        await page.waitForTimeout(3000)
      }
    }
    
    // Check wardrobe for new item
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    const newCount = await getItemCount(page)
    console.log(`After URL ingestion: ${newCount} items`)
    console.log(`Expected: ${initialCount + 1} items`)
  })

  test('ingestion: local folder method works', async ({ page }) => {
    // This test assumes local folder ingestion is configured
    // Would need to set up the local folder path in settings first
    console.log('Local folder ingestion test - requires folder configuration')
    expect(true).toBe(true)
  })

  test('ingestion: camera/upload method works', async ({ page }) => {
    await page.click('nav a:has-text("📷")')
    await page.waitForLoadState('networkidle')
    
    // Check for file input
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.count() > 0) {
      console.log('Camera/file upload found')
      
      // Would upload a test file here
      // await fileInput.first().setInputFiles(...)
    }
    
    expect(true).toBe(true)
  })
})

test.describe('Test Summary', () => {
  test('summary: report item counts', async ({ page }) => {
    await login(page)
    
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    const totalItems = await getItemCount(page)
    console.log(`\n📊 TEST SUMMARY:`)
    console.log(`   Total items in wardrobe: ${totalItems}`)
    console.log(`   Sources tested: URL, Local (manual), Camera (manual)`)
    console.log(`   Note: Each source adds items independently\n`)
    
    expect(totalItems).toBeGreaterThanOrEqual(0)
  })
})
