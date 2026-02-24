/**
 * Test Data Seeder
 * Sets up known test states for smoke tests
 * 
 * Usage:
 *   node scripts/seed-test-data.js reset        # Clear all items
 *   node scripts/seed-test-data.js local       # Seed from test-images folder
 *   node scripts/seed-test-data.js camera      # Seed camera items (uses test-images)
 *   node scripts/seed-test-data.js all        # Seed all types
 * 
 * Test images should be in: data/test-images/
 *   - jeans.jpg
 *   - test.jpg (or any other images)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../data')
const TEST_IMAGES_DIR = path.join(DATA_DIR, 'test-images')
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'thread-test.db')

// Get test images from test-images folder
function getTestImages() {
  if (!fs.existsSync(TEST_IMAGES_DIR)) {
    console.log(`⚠️  Test images folder not found: ${TEST_IMAGES_DIR}`)
    return []
  }
  
  const files = fs.readdirSync(TEST_IMAGES_DIR)
    .filter(f => /\.(jpg|jpeg|png|heic|webp)$/i.test(f))
    .map(f => ({
      name: f.replace(/\.[^.]+$/, ''),
      path: path.join(TEST_IMAGES_DIR, f),
      file: f
    }))
  
  console.log(`📁 Found ${files.length} test images in ${TEST_IMAGES_DIR}`)
  return files
}

const SEED_DATA = {
  local: [
    { name: 'Blue Jeans', category: 'bottom', filename: 'jeans.jpg' },
  ],
  camera: [
    { name: 'Test Photo', category: 'top', filename: 'test.jpg' },
  ]
}

async function resetDatabase() {
  console.log('🗑️  Resetting database...')
  console.log('   (Run: pm2 restart thread-test to recreate fresh DB)')
}

async function seedLocal() {
  console.log('🌱 Seeding local items from test-images...')
  const images = getTestImages()
  
  // Map to expected files
  const items = []
  for (const seed of SEED_DATA.local) {
    const img = images.find(i => i.file === seed.filename)
    if (img) {
      items.push({ ...seed, path: img.path })
    }
  }
  
  for (const item of items) {
    console.log(`   + ${item.name} (${item.category}) - ${item.filename}`)
  }
  console.log(`   = ${items.length} items ready to ingest`)
}

async function seedCamera() {
  console.log('🌱 Seeding camera items...')
  const images = getTestImages()
  
  const items = []
  for (const seed of SEED_DATA.camera) {
    const img = images.find(i => i.file === seed.filename)
    if (img) {
      items.push({ ...seed, path: img.path })
    }
  }
  
  for (const item of items) {
    console.log(`   + ${item.name} (${item.category}) - ${item.filename}`)
  }
  console.log(`   = ${items.length} items ready for camera upload`)
}

async function showCounts() {
  console.log('\n📊 Test images available:')
  const images = getTestImages()
  for (const img of images) {
    console.log(`   - ${img.file} (${img.name})`)
  }
  console.log('\n💡 To seed:')
  console.log('   1. Upload via local folder ingestion')
  console.log('   2. Or upload via camera page using file input')
}

const command = process.argv[2] || 'all'

console.log(`\n🧪 THREAD Test Data Seeder`)
console.log(`   Test images: ${TEST_IMAGES_DIR}`)
console.log(`   Database: ${DB_PATH}\n`)

switch (command) {
  case 'reset':
    await resetDatabase()
    break
  case 'local':
    await seedLocal()
    break
  case 'camera':
    await seedCamera()
    break
  case 'all':
    await seedLocal()
    await seedCamera()
    break
  default:
    console.log(`Unknown command: ${command}`)
    console.log('Valid commands: reset, local, camera, all')
}

await showCounts()
console.log('\n✅ Done!\n')
