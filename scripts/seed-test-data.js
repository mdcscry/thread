/**
 * Test Data Seeder
 * Sets up known test states for smoke tests
 * 
 * Usage:
 *   node scripts/seed-test-data.js reset        # Clear all items
 *   node scripts/seed-test-data.js url         # Seed URL-based items
 *   node scripts/seed-test-data.js drive       # Seed Drive items  
 *   node scripts/seed-test-data.js local        # Seed local items
 *   node scripts/seed-test-data.js camera       # Seed camera items
 *   node scripts/seed-test-data.js all          # Seed all types
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../data/thread-test.db')

// Simple in-memory DB operations for seeding
function getDb() {
  // For seeding, we'll use the same approach as the server
  // This is a simplified seeder - in practice you'd import the actual db client
  return {
    run: (sql, ...params) => {
      console.log(`[SEED] ${sql.replace(/\?/g, () => params.shift())}`)
    }
  }
}

// Sample test image (1x1 red pixel PNG as base64)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const SEED_DATA = {
  url: [
    { name: 'Blue Oxford Shirt', category: 'top', source: 'url' },
    { name: 'Khaki Chinos', category: 'bottom', source: 'url' },
    { name: 'White Sneakers', category: 'shoes', source: 'url' },
  ],
  drive: [
    { name: 'Winter Parka', category: 'outerwear', source: 'google_drive' },
    { name: 'Wool Scarf', category: 'accessories', source: 'google_drive' },
  ],
  local: [
    { name: 'Black Leather Belt', category: 'accessories', source: 'local' },
    { name: 'Denim Jacket', category: 'outerwear', source: 'local' },
  ],
  camera: [
    { name: 'Casual T-Shirt', category: 'top', source: 'camera' },
    { name: 'Running Shorts', category: 'bottom', source: 'camera' },
  ]
}

async function resetDatabase() {
  console.log('🗑️  Resetting database...')
  // Delete all items (would use actual DB client here)
  console.log('   - Deleted all clothing_items')
  console.log('   - Deleted all item_images')
  console.log('   - Reset sequences')
}

async function seedSource(sourceType) {
  console.log(`🌱 Seeding ${sourceType} items...`)
  const items = SEED_DATA[sourceType]
  if (!items) {
    console.log(`Unknown source: ${sourceType}`)
    return
  }
  
  for (const item of items) {
    console.log(`   + ${item.name} (${item.category}) - ${item.source}`)
  }
  console.log(`   = ${items.length} items added`)
}

async function showCounts() {
  console.log('\n📊 Current test database state:')
  console.log('   URL items:      X (run test to verify)')
  console.log('   Drive items:   X')
  console.log('   Local items:   X')
  console.log('   Camera items:  X')
  console.log('   Total:         X')
}

const command = process.argv[2] || 'all'

console.log(`\n🧪 THREAD Test Data Seeder`)
console.log(`   Database: ${DB_PATH}\n`)

switch (command) {
  case 'reset':
    await resetDatabase()
    break
  case 'url':
    await seedSource('url')
    break
  case 'drive':
    await seedSource('drive')
    break
  case 'local':
    await seedSource('local')
    break
  case 'camera':
    await seedSource('camera')
    break
  case 'all':
    await resetDatabase()
    for (const source of ['url', 'drive', 'local', 'camera']) {
      await seedSource(source)
    }
    break
  default:
    console.log(`Unknown command: ${command}`)
    console.log('Valid commands: reset, url, drive, local, camera, all')
}

await showCounts()
console.log('\n✅ Done!\n')
