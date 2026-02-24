/**
 * Unit tests for GeminiVisionService.js
 * Run: node tests/gemini-vision.test.js
 * 
 * Tests cover: JSON parsing resilience, field normalization, availability check.
 * Live API test (optional): set GEMINI_API_KEY env var + pass --live flag.
 */

import { describe, test, expect } from 'vitest'
// assert shim — maps node:assert style to vitest expect
const assert = {
  ok: (val, msg) => expect(val, msg).toBeTruthy(),
  equal: (a, b, msg) => expect(a, msg).toBe(b),
  deepEqual: (a, b, msg) => expect(a, msg).toEqual(b),
  strictEqual: (a, b, msg) => expect(a, msg).toBe(b),
  throws: (fn, msg) => expect(fn, msg).toThrow(),
  rejects: async (fn, pattern) => {
    await expect(fn()).rejects.toThrow(pattern)
  },
}
import { GeminiVisionService } from '../server/services/GeminiVisionService.js'

// ── Availability ────────────────────────────────────────────────────────────


test('returns false when no API key set', () => {
  const saved = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  const svc = new GeminiVisionService()
  assert.equal(svc.isAvailable(), false)
  if (saved) process.env.GEMINI_API_KEY = saved
})

test('returns true when API key is set', () => {
  process.env.GEMINI_API_KEY = 'test-key-123'
  const svc = new GeminiVisionService()
  assert.equal(svc.isAvailable(), true)
  delete process.env.GEMINI_API_KEY
})

test('uses default model when GEMINI_MODEL not set', () => {
  delete process.env.GEMINI_MODEL
  process.env.GEMINI_API_KEY = 'test'
  const svc = new GeminiVisionService()
  assert.equal(svc.model, 'gemini-2.0-flash')
  delete process.env.GEMINI_API_KEY
})

test('respects GEMINI_MODEL env var', () => {
  process.env.GEMINI_MODEL = 'gemini-2.5-flash'
  process.env.GEMINI_API_KEY = 'test'
  const svc = new GeminiVisionService()
  assert.equal(svc.model, 'gemini-2.5-flash')
  delete process.env.GEMINI_MODEL
  delete process.env.GEMINI_API_KEY
})

// ── JSON Parsing (test the parsing logic extracted from the service) ────────


// Extract the parsing logic into a testable function
function parseGeminiResponse(text) {
  let structured
  const jsonStr = text.trim()
  try {
    structured = JSON.parse(jsonStr)
  } catch {
    try {
      const stripped = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
      structured = JSON.parse(stripped)
    } catch {
      const start = jsonStr.indexOf('{')
      if (start >= 0) {
        let depth = 0
        let end = start
        for (let i = start; i < jsonStr.length; i++) {
          if (jsonStr[i] === '{') depth++
          else if (jsonStr[i] === '}') depth--
          if (depth === 0) { end = i + 1; break }
        }
        structured = JSON.parse(jsonStr.slice(start, end))
      } else {
        throw new Error('No JSON found')
      }
    }
  }
  return structured
}

test('parses clean JSON', () => {
  const result = parseGeminiResponse('{"category": "T-Shirt", "color": "#fff"}')
  assert.equal(result.category, 'T-Shirt')
})

test('parses JSON with markdown code fence', () => {
  const result = parseGeminiResponse('```json\n{"category": "Jeans"}\n```')
  assert.equal(result.category, 'Jeans')
})

test('parses JSON with plain code fence', () => {
  const result = parseGeminiResponse('```\n{"category": "Boots"}\n```')
  assert.equal(result.category, 'Boots')
})

test('parses JSON with leading text', () => {
  const result = parseGeminiResponse('Here is the analysis:\n{"category": "Hat", "name": "Baseball Cap"}')
  assert.equal(result.category, 'Hat')
})

test('parses nested JSON objects', () => {
  const input = '{"name": "Jacket", "details": {"color": "#000", "nested": {"deep": true}}}'
  const result = parseGeminiResponse(input)
  assert.equal(result.name, 'Jacket')
  assert.equal(result.details.nested.deep, true)
})

test('parses JSON with trailing whitespace/newlines', () => {
  const result = parseGeminiResponse('  \n{"category": "Belt"}\n  ')
  assert.equal(result.category, 'Belt')
})

test('throws on non-JSON response', () => {
  assert.throws(() => parseGeminiResponse('This is just text with no JSON'), /No JSON found/)
})

test('throws on empty string', () => {
  assert.throws(() => parseGeminiResponse(''))
})

// ── Field Normalization ─────────────────────────────────────────────────────


// Simulate what the service does after parsing
function normalizeStructured(raw) {
  return {
    name: raw.name || 'Unknown Item',
    category: raw.category || 'Other',
    subcategory: raw.subcategory || null,
    primary_color: raw.primary_color || '#808080',
    secondary_color: raw.secondary_color || null,
    weft_color: raw.weft_color || null,
    colors: raw.colors || [],
    pattern: raw.pattern || 'solid',
    material: raw.material || 'unknown',
    texture: raw.texture || null,
    silhouette: raw.silhouette || null,
    fit: raw.fit || 'regular',
    length: raw.length || null,
    style_tags: raw.style_tags || [],
    occasion: raw.occasion || ['casual'],
    formality: raw.formality ?? 5,
    season: raw.season || ['spring', 'summer', 'fall', 'winter'],
    weight: raw.weight || 'medium',
    temp_min_f: raw.temp_min_f ?? 40,
    temp_max_f: raw.temp_max_f ?? 90,
    waterproof: raw.waterproof ? 1 : 0,
    layering_role: raw.layering_role || 'standalone',
    confidence: raw.confidence ?? 0.8,
    uncertain_fields: raw.uncertain_fields || [],
  }
}

test('fills defaults for empty object', () => {
  const result = normalizeStructured({})
  assert.equal(result.name, 'Unknown Item')
  assert.equal(result.category, 'Other')
  assert.equal(result.primary_color, '#808080')
  assert.equal(result.pattern, 'solid')
  assert.equal(result.material, 'unknown')
  assert.equal(result.fit, 'regular')
  assert.equal(result.formality, 5)
  assert.deepEqual(result.season, ['spring', 'summer', 'fall', 'winter'])
  assert.equal(result.waterproof, 0)
  assert.equal(result.confidence, 0.8)
})

test('preserves provided values', () => {
  const result = normalizeStructured({
    name: 'Navy Hoodie',
    category: 'Hoodie',
    primary_color: '#001f3f',
    formality: 1,
    waterproof: true,
    confidence: 0.95,
  })
  assert.equal(result.name, 'Navy Hoodie')
  assert.equal(result.category, 'Hoodie')
  assert.equal(result.primary_color, '#001f3f')
  assert.equal(result.formality, 1)
  assert.equal(result.waterproof, 1)
  assert.equal(result.confidence, 0.95)
})

test('formality 0 is preserved (not replaced by default)', () => {
  const result = normalizeStructured({ formality: 0 })
  assert.equal(result.formality, 0)
})

test('waterproof false → 0', () => {
  assert.equal(normalizeStructured({ waterproof: false }).waterproof, 0)
})

test('waterproof true → 1', () => {
  assert.equal(normalizeStructured({ waterproof: true }).waterproof, 1)
})

test('colors defaults to empty array', () => {
  assert.deepEqual(normalizeStructured({}).colors, [])
})

test('occasion defaults to [casual]', () => {
  assert.deepEqual(normalizeStructured({}).occasion, ['casual'])
})

// ── Error handling ──────────────────────────────────────────────────────────


test('throws when no API key set', async () => {
  delete process.env.GEMINI_API_KEY
  const svc = new GeminiVisionService()
  await assert.rejects(
    () => svc.analyzeImageStructured('/tmp/nonexistent.jpg'),
    /GEMINI_API_KEY not set/
  )
})

// ── Live API test (optional) ────────────────────────────────────────────────

const runLive = process.argv.includes('--live')
if (runLive) {
  console.log('\nLive API tests:')
  
  // Reload env
  const dotenv = await import('dotenv')
  dotenv.config()
  
  const svc = new GeminiVisionService()
  if (!svc.isAvailable()) {
    console.log('  ⏭️  Skipped — no GEMINI_API_KEY in .env')
  } else {
    test('analyzes t-shirt image', async () => {
      const result = await svc.analyzeImageStructured('./data/test-images/blueowl/male/01-tshirt.jpg')
      assert.ok(result.structured)
      assert.equal(result.structured.category, 'T-Shirt')
      assert.ok(result.structured.primary_color.startsWith('#'))
      assert.ok(result.structured.confidence > 0.5)
      assert.ok(result.model.includes('gemini'))
    })

    test('analyzes boots image', async () => {
      const result = await svc.analyzeImageStructured('./data/test-images/blueowl/male/09-boots.jpg')
      assert.ok(result.structured)
      assert.equal(result.structured.category, 'Boots')
      assert.ok(result.structured.material)
    })

    test('all required fields present', async () => {
      const result = await svc.analyzeImageStructured('./data/test-images/blueowl/male/06-jeans.jpg')
      const s = result.structured
      const required = ['name', 'category', 'primary_color', 'pattern', 'material', 'fit', 'formality', 'season', 'confidence']
      for (const field of required) {
        assert.ok(s[field] != null, `Missing field: ${field}`)
      }
    })
  }
} else {
  console.log('\n  ℹ️  Run with --live flag for API integration tests')
}

// Tests managed by vitest
