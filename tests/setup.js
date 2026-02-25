/**
 * Test setup — creates a fresh isolated test DB, runs all migrations,
 * seeds a test user + wardrobe items, and exports the Fastify app for supertest.
 *
 * Seeded test user:
 *   email: test@thread.test
 *   password: testpass123  (real bcrypt hash)
 *   api_key: thread_sk_test_000000000000000000000000000000000000000000000000
 */

// NOTE: DATABASE_PATH is set in tests/env-setup.js (loaded via vitest setupFiles BEFORE imports)
// Do not set it here — env-setup.js runs first and that value is what client.js sees.

import path from 'path'
import { fileURLToPath } from 'url'
import { readdirSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')

// --- Boot app (NODE_ENV=test prevents start()) ---
import { app } from '../server/index.js'
import { getDb } from '../server/db/client.js'

// initializeDatabase() is already called inside server/index.js on import.
// Run migrations manually here so they use the test DB instance.
const db = await getDb()

const migrationsDir = path.join(REPO_ROOT, 'server/db/migrations')
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort()
for (const file of migrationFiles) {
  const mod = await import(path.join(migrationsDir, file))
  if (mod.migrate) await mod.migrate(db)
}

// --- Seed test user ---
// Real bcrypt hash of 'testpass123' (cost factor 10)
const TEST_HASH = '$2b$10$sIxB5v1tefoB5ZMhAgb27eP278HXr.PlE95g6SWo.M8XfMurXdVoG'
const TEST_USER = {
  email: 'test@thread.test',
  password: TEST_HASH,
  name: 'Test User',
  api_key: 'thread_sk_test_000000000000000000000000000000000000000000000000',
  gender: 'man',
}

db.run(
  `INSERT OR IGNORE INTO users (name, email, password, api_key, gender, email_verified)
   VALUES (?, ?, ?, ?, ?, 1)`,
  [TEST_USER.name, TEST_USER.email, TEST_USER.password, TEST_USER.api_key, TEST_USER.gender]
)

// Use parameterized query to get userId
const userRows = db.exec('SELECT id FROM users WHERE api_key = ?', [TEST_USER.api_key])
const userId = userRows?.[0]?.values?.[0]?.[0] ?? 1

// --- Seed wardrobe items — small curated subset, one per major category ---
// Male: from data/test-images/male/ (old numbered files still present)
// Female: from data/test-images/female/
// Keep this small — tests need coverage, not volume.

const MALE_DIR   = path.join(REPO_ROOT, 'data/test-images/male')
const FEMALE_DIR = path.join(REPO_ROOT, 'data/test-images/female')

const ITEMS = [
  // --- Male (9 items) ---
  { dir: MALE_DIR,   file: '01-tshirt.jpg',                                      name: 'White T-Shirt',        category: 'Tops',        subcategory: 'T-Shirt',   primary_color: '#FFFFFF', formality: 2, pattern: 'solid',    material: 'cotton',     gender: 'male' },
  { dir: MALE_DIR,   file: '02-buttonup.jpg',                                    name: 'Blue Button-Up',       category: 'Tops',        subcategory: 'Shirt',     primary_color: '#4A90D9', formality: 5, pattern: 'solid',    material: 'cotton',     gender: 'male' },
  { dir: MALE_DIR,   file: '03-knitwear.jpg',                                    name: 'Grey Sweater',         category: 'Tops',        subcategory: 'Sweater',   primary_color: '#888888', formality: 4, pattern: 'textured', material: 'wool',       gender: 'male' },
  { dir: MALE_DIR,   file: '05-jacket.jpg',                                      name: 'Navy Jacket',          category: 'Outerwear',   subcategory: 'Jacket',    primary_color: '#1A2A4A', formality: 6, pattern: 'solid',    material: 'polyester',  gender: 'male' },
  { dir: MALE_DIR,   file: '06-jeans.jpg',                                       name: 'Dark Jeans',           category: 'Bottoms',     subcategory: 'Jeans',     primary_color: '#2B3A5E', formality: 3, pattern: 'solid',    material: 'denim',      gender: 'male' },
  { dir: MALE_DIR,   file: '07-pants.jpg',                                       name: 'Chino Pants',          category: 'Bottoms',     subcategory: 'Pants',     primary_color: '#C8A882', formality: 5, pattern: 'solid',    material: 'cotton',     gender: 'male' },
  { dir: MALE_DIR,   file: '09-boots.jpg',                                       name: 'Brown Boots',          category: 'Footwear',    subcategory: 'Boots',     primary_color: '#6B3A2A', formality: 5, pattern: 'solid',    material: 'leather',    gender: 'male' },
  { dir: MALE_DIR,   file: '12-belt.jpg',                                        name: 'Black Belt',           category: 'Accessories', subcategory: 'Belt',      primary_color: '#111111', formality: 5, pattern: 'solid',    material: 'leather',    gender: 'male' },
  { dir: MALE_DIR,   file: '13-hat.jpg',                                         name: 'Grey Baseball Cap',    category: 'Accessories', subcategory: 'Hat',       primary_color: '#777777', formality: 1, pattern: 'solid',    material: 'cotton',     gender: 'male' },

  // --- Female (9 items) ---
  { dir: FEMALE_DIR, file: '01-tissue-short-sleeve-v-neck-top.jpg',              name: 'White V-Neck Top',     category: 'Tops',        subcategory: 'T-Shirt',   primary_color: '#FFFFFF', formality: 3, pattern: 'solid',    material: 'cotton',     gender: 'female' },
  { dir: FEMALE_DIR, file: '01-tropical-wool-blazer--dark-nav.jpg',              name: 'Navy Blazer',          category: 'Outerwear',   subcategory: 'Jacket',    primary_color: '#1A2A4A', formality: 7, pattern: 'solid',    material: 'wool',       gender: 'female' },
  { dir: FEMALE_DIR, file: '01-the-utility-straight-leg-pant-.jpg',              name: 'Straight Leg Pant',    category: 'Bottoms',     subcategory: 'Pants',     primary_color: '#333333', formality: 5, pattern: 'solid',    material: 'cotton',     gender: 'female' },
  { dir: FEMALE_DIR, file: '04-carpenter-jeans.jpg',                             name: 'Carpenter Jeans',      category: 'Bottoms',     subcategory: 'Jeans',     primary_color: '#3A5A8A', formality: 2, pattern: 'solid',    material: 'denim',      gender: 'female' },
  { dir: FEMALE_DIR, file: '03-tianna-dress--powder-puff.jpg',                   name: 'Powder Puff Dress',    category: 'Dresses',     subcategory: 'Dress',     primary_color: '#F5C5C5', formality: 6, pattern: 'solid',    material: 'silk',       gender: 'female' },
  { dir: FEMALE_DIR, file: '03-leta-skirt--snow-white.jpg',                      name: 'White Skirt',          category: 'Bottoms',     subcategory: 'Skirt',     primary_color: '#FFFFFF', formality: 5, pattern: 'solid',    material: 'cotton',     gender: 'female' },
  { dir: FEMALE_DIR, file: '03-kinzee-boots--white-leather.jpg',                 name: 'White Leather Boots',  category: 'Footwear',    subcategory: 'Boots',     primary_color: '#FFFFFF', formality: 4, pattern: 'solid',    material: 'leather',    gender: 'female' },
  { dir: FEMALE_DIR, file: '03-andromeda-heels--brown-leather.jpg',              name: 'Brown Heels',          category: 'Footwear',    subcategory: 'Heels',     primary_color: '#6B3A2A', formality: 7, pattern: 'solid',    material: 'leather',    gender: 'female' },
  { dir: FEMALE_DIR, file: '01-canvas-mini-lug-tote--birch.jpg',                 name: 'Canvas Tote Bag',      category: 'Accessories', subcategory: 'Handbag',   primary_color: '#D4C4A0', formality: 3, pattern: 'solid',    material: 'canvas',     gender: 'female' },
]

const imagesDestDir = path.join(REPO_ROOT, 'data/images')
if (!existsSync(imagesDestDir)) mkdirSync(imagesDestDir, { recursive: true })

for (const item of ITEMS) {
  const srcPath = path.join(item.dir, item.file)
  const destPath = path.join(imagesDestDir, `test-${item.gender}-${item.file}`)
  if (existsSync(srcPath) && !existsSync(destPath)) {
    copyFileSync(srcPath, destPath)
  }

  const imageUrl = `/data/images/test-${item.gender}-${item.file}`
  const sourceUrl = `https://glyphmatic.us/tools/thread/${item.gender}/${item.file}`

  db.run(
    `INSERT OR IGNORE INTO clothing_items
       (user_id, source_url, name, category, subcategory, primary_color,
        formality, pattern, material, ai_status, ai_confidence, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', 0.9, 1)`,
    [userId, sourceUrl, item.name, item.category, item.subcategory,
     item.primary_color, item.formality, item.pattern, item.material]
  )

  const itemRows = db.exec('SELECT id FROM clothing_items WHERE source_url = ? AND user_id = ?', [sourceUrl, userId])
  const itemId = itemRows?.[0]?.values?.[0]?.[0]
  if (itemId) {
    db.run(
      `INSERT OR IGNORE INTO item_images (item_id, path_full, path_medium, path_thumb, is_primary) VALUES (?, ?, ?, ?, 1)`,
      [itemId, imageUrl, imageUrl, imageUrl]
    )
  }
}

await app.ready()

// Cleanup test DB file on process exit
const testDbPath = process.env.DATABASE_PATH
process.on('exit', () => {
  try {
    if (testDbPath && testDbPath.startsWith('/tmp/')) rmSync(testDbPath, { force: true })
  } catch (e) {
    console.warn('Failed to clean up test DB:', e.message)
  }
})

// supertest needs the underlying http.Server
export { app }
export const server = app.server

export const TEST_API_KEY = TEST_USER.api_key
export const TEST_EMAIL = TEST_USER.email
export const TEST_PASSWORD = 'testpass123'
export const TEST_USER_ID = userId
