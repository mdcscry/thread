/**
 * Test setup — creates a fresh in-memory test DB, runs all migrations,
 * seeds a test user + wardrobe items, and exports the Fastify app for supertest.
 *
 * Seeded test user:
 *   email: test@thread.test
 *   password: testpass123
 *   api_key: thread_sk_test_000000000000000000000000000000000000000000000000
 */

process.env.NODE_ENV = 'test'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' // self-signed cert
process.env.SENTRY_DSN = ''                     // no Sentry in tests
process.env.DATABASE_PATH = `/tmp/thread-test-${Date.now()}.db` // isolated test DB

import path from 'path'
import { fileURLToPath } from 'url'
import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')

// --- Boot app (NODE_ENV=test prevents start()) ---
import { app } from '../server/index.js'
import { initializeDatabase, getDb } from '../server/db/client.js'

// Initialize DB + run all migrations
await initializeDatabase()

const migrationsDir = path.join(REPO_ROOT, 'server/db/migrations')
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort()
const db0 = await getDb()
for (const file of migrationFiles) {
  const mod = await import(path.join(migrationsDir, file))
  if (mod.migrate) await mod.migrate(db0) // pass db for migrations that expect it
}

const db = await getDb()

// --- Seed test user ---
const TEST_USER = {
  email: 'test@thread.test',
  password: '$2b$10$abcdefghijklmnopqrstuvuFakeHashedPasswordForTestingOnly1',
  name: 'Test User',
  api_key: 'thread_sk_test_000000000000000000000000000000000000000000000000',
  gender: 'man',
}

db.run(
  `INSERT OR IGNORE INTO users (name, email, password, api_key, gender, email_verified)
   VALUES (?, ?, ?, ?, ?, 1)`,
  [TEST_USER.name, TEST_USER.email, TEST_USER.password, TEST_USER.api_key, TEST_USER.gender]
)

const userRow = db.exec(`SELECT id FROM users WHERE email = '${TEST_USER.email}'`)
const userId = userRow[0]?.values[0]?.[0] ?? 1

// --- Seed wardrobe items from local test images ---
const imageDir = path.join(REPO_ROOT, 'data/test-images/blueowl/male')
const BASE_URL = 'https://glyphmatic.us/tools/thread/male'

const ITEMS = [
  { file: '01-tshirt.jpg',    name: 'White T-Shirt',       category: 'Tops',     subcategory: 'T-Shirt',    primary_color: '#FFFFFF', formality: 2, pattern: 'solid',   material: 'cotton' },
  { file: '02-buttonup.jpg',  name: 'Blue Button-Up',      category: 'Tops',     subcategory: 'Shirt',      primary_color: '#4A90D9', formality: 5, pattern: 'solid',   material: 'cotton' },
  { file: '03-knitwear.jpg',  name: 'Grey Knitwear',       category: 'Tops',     subcategory: 'Sweater',    primary_color: '#888888', formality: 4, pattern: 'textured', material: 'wool' },
  { file: '04-hoodie.jpg',    name: 'Black Hoodie',        category: 'Tops',     subcategory: 'Hoodie',     primary_color: '#111111', formality: 2, pattern: 'solid',   material: 'fleece' },
  { file: '05-jacket.jpg',    name: 'Navy Jacket',         category: 'Outerwear',subcategory: 'Jacket',     primary_color: '#1A2A4A', formality: 6, pattern: 'solid',   material: 'polyester' },
  { file: '06-jeans.jpg',     name: 'Dark Jeans',          category: 'Bottoms',  subcategory: 'Jeans',      primary_color: '#2B3A5E', formality: 3, pattern: 'solid',   material: 'denim' },
  { file: '07-pants.jpg',     name: 'Chino Pants',         category: 'Bottoms',  subcategory: 'Pants',      primary_color: '#C8A882', formality: 5, pattern: 'solid',   material: 'cotton' },
  { file: '09-boots.jpg',     name: 'Brown Boots',         category: 'Footwear', subcategory: 'Boots',      primary_color: '#6B3A2A', formality: 5, pattern: 'solid',   material: 'leather' },
  { file: '10-shoes.jpg',     name: 'White Sneakers',      category: 'Footwear', subcategory: 'Sneakers',   primary_color: '#F5F5F5', formality: 2, pattern: 'solid',   material: 'canvas' },
  { file: '11-sandals.jpg',   name: 'Tan Sandals',         category: 'Footwear', subcategory: 'Sandals',    primary_color: '#C8A470', formality: 1, pattern: 'solid',   material: 'leather' },
  { file: '12-belt.jpg',      name: 'Black Leather Belt',  category: 'Accessories', subcategory: 'Belt',   primary_color: '#111111', formality: 5, pattern: 'solid',   material: 'leather' },
  { file: '13-hat.jpg',       name: 'Grey Baseball Cap',   category: 'Accessories', subcategory: 'Hat',    primary_color: '#777777', formality: 1, pattern: 'solid',   material: 'cotton' },
  { file: '14-socks.jpg',     name: 'White Socks',         category: 'Accessories', subcategory: 'Socks',  primary_color: '#FFFFFF', formality: 2, pattern: 'solid',   material: 'cotton' },
]

// Copy images to data/images/ so the app can serve them
const imagesDestDir = path.join(REPO_ROOT, 'data/images')
if (!existsSync(imagesDestDir)) mkdirSync(imagesDestDir, { recursive: true })

for (const item of ITEMS) {
  const srcPath = path.join(imageDir, item.file)
  const destPath = path.join(imagesDestDir, `test-${item.file}`)
  if (existsSync(srcPath) && !existsSync(destPath)) {
    copyFileSync(srcPath, destPath)
  }

  const imageUrl = `/data/images/test-${item.file}`
  const sourceUrl = `${BASE_URL}/${item.file}`

  db.run(
    `INSERT OR IGNORE INTO clothing_items
       (user_id, source_url, name, category, subcategory, primary_color,
        formality, pattern, material, ai_status, ai_confidence, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', 0.9, 1)`,
    [userId, sourceUrl, item.name, item.category, item.subcategory,
     item.primary_color, item.formality, item.pattern, item.material]
  )

  // Link image
  const itemRow = db.exec(`SELECT id FROM clothing_items WHERE name = '${item.name.replace(/'/g, "''")}' AND user_id = ${userId}`)
  const itemId = itemRow[0]?.values[0]?.[0]
  if (itemId) {
    db.run(
      `INSERT OR IGNORE INTO item_images (item_id, path_full, path_medium, path_thumb, is_primary) VALUES (?, ?, ?, ?, 1)`,
      [itemId, imageUrl, imageUrl, imageUrl]
    )
  }
}

await app.ready()

// supertest needs the underlying http.Server
export { app }
export const server = app.server

export const TEST_API_KEY = TEST_USER.api_key
export const TEST_EMAIL = TEST_USER.email
export const TEST_USER_ID = userId
