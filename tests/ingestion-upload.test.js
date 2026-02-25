/**
 * Ingestion upload tests — exercises both upload methods:
 *   1. POST /ingestion/upload-photo       — multipart local file
 *   2. POST /ingestion/upload-from-url   — fetch from URL (glyphmatic.us)
 *
 * Uses a small curated subset of test images (one per category, both genders).
 * Images served from https://glyphmatic.us/tools/thread/ — stable, we control it.
 * Never use Shopify CDN URLs — they expire.
 *
 * These are integration tests: they hit the real ingestion pipeline including
 * IngestionService.processSinglePhoto() but with Gemini mocked to avoid API calls.
 */

import { describe, test, expect, vi, beforeAll } from 'vitest'
import request from 'supertest'
import path from 'path'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')

// Mock Gemini vision — avoid real API calls in test suite
vi.mock('../server/services/GeminiVisionService.js', () => {
  const mockResult = {
    name: 'Test Item',
    category: 'Tops',
    subcategory: 'T-Shirt',
    primary_color: '#FFFFFF',
    secondary_color: null,
    pattern: 'solid',
    material: 'cotton',
    formality: 3,
    season: ['spring', 'summer'],
    tags: ['casual'],
    ai_confidence: 0.95,
    description: 'A test clothing item'
  }
  class GeminiVisionService {
    analyzeClothingItem() { return Promise.resolve(mockResult) }
  }
  return { GeminiVisionService }
})

import { app } from '../server/index.js'
import { TEST_API_KEY } from './setup.js'

const AUTH = { Authorization: `Bearer ${TEST_API_KEY}` }
const API = '/api/v1'

// --- Local file fixtures (subset — one per major category, both genders) ---
const MALE_DIR = path.join(REPO_ROOT, 'data/test-images/male')
const FEMALE_DIR = path.join(REPO_ROOT, 'data/test-images/female')

const LOCAL_FILES = [
  // Male
  { file: path.join(MALE_DIR, '01-tshirt.jpg'),                             label: 'male t-shirt' },
  { file: path.join(MALE_DIR, '05-jacket.jpg'),                             label: 'male jacket' },
  { file: path.join(MALE_DIR, '06-jeans.jpg'),                              label: 'male jeans' },
  { file: path.join(MALE_DIR, 'toddsnyder-sportcoat-runway-db-sport-coatnavy.jpg'), label: 'male sportcoat' },
  { file: path.join(MALE_DIR, 'toddsnyder-trousers-linen-gurkha-trouserwhite.jpg'), label: 'male trousers' },
  { file: path.join(MALE_DIR, 'toddsnyder-tie-formal-silk-tie-black.jpg'),  label: 'male tie' },
  { file: path.join(MALE_DIR, 'toddsnyder-turtleneck-cashmere-turtleneck-navy-1.jpg'), label: 'male turtleneck' },
  // Female
  { file: path.join(FEMALE_DIR, '03-tianna-dress--powder-puff.jpg'),        label: 'female dress' },
  { file: path.join(FEMALE_DIR, '03-leta-skirt--snow-white.jpg'),           label: 'female skirt' },
  { file: path.join(FEMALE_DIR, 'fn-dress-midi-1.jpg'),                     label: 'female midi dress' },
  { file: path.join(FEMALE_DIR, 'fn-pants-wide-leg-1.jpg'),                 label: 'female wide-leg pants' },
  { file: path.join(FEMALE_DIR, 'fn-handbag-1.jpg'),                        label: 'female handbag' },
  { file: path.join(FEMALE_DIR, 'everlane-cardigan-womens-organic-cotton-relaxed-cardigan-black.jpg'), label: 'female cardigan' },
  { file: path.join(FEMALE_DIR, 'shopbop-necklace-1.jpg'),                  label: 'female necklace' },
].filter(f => existsSync(f.file))  // skip gracefully if local images not present

// --- URL fixtures — served from glyphmatic.us (stable, we control it) ---
// Never use Shopify CDN URLs — they expire with product updates
const URL_FIXTURES = [
  { url: 'https://glyphmatic.us/tools/thread/female/everlane-dress-smock-babydoll.jpg', label: 'female smock dress (URL)' },
  { url: 'https://glyphmatic.us/tools/thread/female/fn-dress-midi-1.jpg',               label: 'female midi dress (URL)' },
  { url: 'https://glyphmatic.us/tools/thread/male/toddsnyder-turtleneck-cashmere-turtleneck-black-1.jpg', label: 'male turtleneck (URL)' },
  { url: 'https://glyphmatic.us/tools/thread/male/toddsnyder-tie-formal-silk-tie-black.jpg', label: 'male tie (URL)' },
]

beforeAll(async () => {
  await app.ready()
})

// ─── Local file upload ────────────────────────────────────────────────────────

describe('POST /ingestion/upload-photo (local file)', () => {
  if (LOCAL_FILES.length === 0) {
    test.skip('No local test images found — run scrapers to populate data/test-images/', () => {})
    return
  }

  for (const { file, label } of LOCAL_FILES) {
    test(`uploads ${label}`, async () => {
      const buffer = readFileSync(file)
      const filename = path.basename(file)

      const res = await request(app.server)
        .post(`${API}/ingestion/upload-photo`)
        .set(AUTH)
        .attach('file', buffer, { filename, contentType: 'image/jpeg' })

      expect(res.status).toBe(200)
      // upload-photo stores image + returns metadata (Gemini analysis queued separately)
      expect(res.body).toHaveProperty('filename')
      expect(res.body).toHaveProperty('size')
      expect(res.body.size).toBeGreaterThan(0)
    })
  }
})

// ─── URL-based upload ─────────────────────────────────────────────────────────

describe('POST /ingestion/upload-from-url', () => {
  test('rejects missing url', async () => {
    const res = await request(app.server)
      .post(`${API}/ingestion/upload-from-url`)
      .set(AUTH)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/url is required/i)
  })

  test('rejects non-http protocol', async () => {
    const res = await request(app.server)
      .post(`${API}/ingestion/upload-from-url`)
      .set(AUTH)
      .send({ url: 'ftp://example.com/image.jpg' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/http/i)
  })

  test('rejects invalid URL', async () => {
    const res = await request(app.server)
      .post(`${API}/ingestion/upload-from-url`)
      .set(AUTH)
      .send({ url: 'not-a-url' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid url/i)
  })

  test('rejects unauthenticated request', async () => {
    const res = await request(app.server)
      .post(`${API}/ingestion/upload-from-url`)
      .send({ url: URL_FIXTURES[0].url })

    expect(res.status).toBe(401)
  })

  // Live URL tests — skipped in CI (no network), run locally
  const RUN_LIVE = process.env.TEST_LIVE_URLS === '1'

  for (const { url, label } of URL_FIXTURES) {
    const runner = RUN_LIVE ? test : test.skip
    runner(`fetches and ingests ${label}`, async () => {
      const res = await request(app.server)
        .post(`${API}/ingestion/upload-from-url`)
        .set(AUTH)
        .send({ url })

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('itemId')
      expect(typeof res.body.itemId).toBe('number')
      expect(res.body.success).toBe(true)
    }, 30000)  // 30s timeout — network fetch + Gemini
  }
})
