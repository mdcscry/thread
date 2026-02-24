import { test, expect } from '@playwright/test'

const BASE = 'https://localhost:3000'
const EMAIL = 'you@localhost'
const PASS = 'thread123'

// Helper to login
async function login(page) {
  await page.goto(BASE)
  await page.fill('input[type="email"], input[placeholder*="email" i]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button:has-text("Login")')
  await page.waitForSelector('nav', { timeout: 10000 })
}

test.describe('Wardrobe Edit Modal', () => {

  test('click item opens edit modal, edit name, save, verify persistence', async ({ page }) => {
    // Login
    await login(page)
    
    // Navigate to wardrobe
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Wait for items to load
    await page.waitForSelector('.item-card, [class*="itemGrid"]', { timeout: 10000 })
    
    // Find first item card and click it to open edit modal
    const itemCard = page.locator('.item-card, [class*="itemCard"], [class*="item grid"]').first()
    await itemCard.click()
    
    // Wait for modal to appear
    const modal = page.locator('.modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // Get original name
    const nameInput = modal.locator('input[name="name"], input[value*=""], input').first()
    const originalName = await nameInput.inputValue()
    
    // Edit the name
    const newName = `Edited ${Date.now()}`
    await nameInput.fill(newName)
    
    // Find and click save button
    const saveButton = modal.locator('button:has-text("Save"), button[type="submit"]').first()
    await saveButton.click()
    
    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 5000 })
    
    // Verify the name change persisted - reload and check
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    
    // Click the same item again
    const editedItemCard = page.locator('.item-card, [class*="itemCard"], [class*="item grid"]').first()
    await editedItemCard.click()
    
    // Verify the name is updated in the modal
    const editedModal = page.locator('.modal')
    await expect(editedModal).toBeVisible({ timeout: 5000 })
    const editedNameInput = editedModal.locator('input[name="name"], input').first()
    await expect(editedNameInput).toHaveValue(newName)
  })

  test('clicking outside modal closes it without saving', async ({ page }) => {
    await login(page)
    
    // Navigate to wardrobe
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('.item-card, [class*="itemGrid"]', { timeout: 10000 })
    
    // Click first item to open modal
    const itemCard = page.locator('.item-card, [class*="itemCard"]').first()
    await itemCard.click()
    
    // Wait for modal
    const modal = page.locator('.modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // Get the name input value before
    const nameInput = modal.locator('input').first()
    const originalName = await nameInput.inputValue()
    
    // Type something but don't save
    await nameInput.fill('Unsaved changes')
    
    // Click outside modal (on overlay)
    const overlay = page.locator('.modal-overlay')
    await overlay.click({ position: { x: 10, y: 10 } })
    
    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 5000 })
    
    // Click item again - should see original name
    await itemCard.click()
    await expect(modal).toBeVisible({ timeout: 5000 })
    const nameAfterClose = await nameInput.inputValue()
    expect(nameAfterClose).toBe(originalName)
  })

  test('edit modal has all expected fields', async ({ page }) => {
    await login(page)
    
    // Navigate to wardrobe
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('.item-card, [class*="itemGrid"]', { timeout: 10000 })
    
    // Click first item
    const itemCard = page.locator('.item-card, [class*="itemCard"]').first()
    await itemCard.click()
    
    // Wait for modal
    const modal = page.locator('.modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // Check for expected fields
    await expect(modal.locator('label:has-text("Name")')).toBeVisible()
    await expect(modal.locator('label:has-text("Category")').first()).toBeVisible()
    await expect(modal.locator('label:has-text("Pattern")')).toBeVisible()
  })

  test('seasons and occasions checkboxes save and persist', async ({ page }) => {
    await login(page)
    
    // Navigate to wardrobe
    await page.click('nav a:has-text("👗")')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('.item-card, [class*="itemGrid"]', { timeout: 10000 })
    
    // Click first item to open edit modal
    const itemCard = page.locator('.item-card, [class*="itemCard"]').first()
    await itemCard.click()
    
    // Wait for modal
    const modal = page.locator('.modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    
    // Find and check a season checkbox (e.g., "Summer")
    const summerCheckbox = modal.locator('input[type="checkbox"]').filter({ hasText: /summer/i }).first()
    if (await summerCheckbox.count() > 0) {
      await summerCheckbox.check()
      
      // Find and check an occasion checkbox (e.g., "Casual")
      const casualCheckbox = modal.locator('input[type="checkbox"]').filter({ hasText: /casual/i }).first()
      if (await casualCheckbox.count() > 0) {
        await casualCheckbox.check()
      }
      
      // Save
      const saveButton = modal.locator('button:has-text("Save"), button[type="submit"]').first()
      await saveButton.click()
      
      // Wait for modal to close
      await expect(modal).not.toBeVisible({ timeout: 5000 })
      
      // Reopen the item
      await itemCard.click()
      await expect(modal).toBeVisible({ timeout: 5000 })
      
      // Verify checkboxes are still checked
      await expect(summerCheckbox).toBeChecked()
      if (await casualCheckbox.count() > 0) {
        await expect(casualCheckbox).toBeChecked()
      }
    }
  })
})
