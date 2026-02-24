/**
 * Unit tests for FeatureEngine.js
 * Run: node tests/feature-engine.test.js
 * 
 * Zero dependencies — uses Node's built-in assert.
 */

import assert from 'node:assert/strict'
import {
  FEATURE_DIM,
  computeItemFeatures,
  computeColorHarmony,
  computeFormalityMatch,
  computeCategoryDiversity,
  computeAvgPeerEma,
  oneHot,
  oneHotCategory,
  parseHex,
  rgbToHSL,
  normalizeRGB,
  normalizeHSL,
  CATEGORIES,
  PATTERNS,
  MATERIALS,
  OCCASIONS,
} from '../server/services/FeatureEngine.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✅ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ❌ ${name}`)
    console.log(`     ${e.message}`)
  }
}

function approx(a, b, tolerance = 0.01) {
  assert.ok(Math.abs(a - b) < tolerance, `Expected ~${b}, got ${a}`)
}

// ── parseHex ────────────────────────────────────────────────────────────────

console.log('\nparseHex:')

test('parses 6-digit hex', () => {
  const c = parseHex('#ff0000')
  assert.deepEqual(c, { r: 255, g: 0, b: 0 })
})

test('parses without hash', () => {
  const c = parseHex('00ff00')
  assert.deepEqual(c, { r: 0, g: 255, b: 0 })
})

test('parses 3-digit shorthand', () => {
  const c = parseHex('#fff')
  assert.deepEqual(c, { r: 255, g: 255, b: 255 })
})

test('returns gray for null/undefined', () => {
  assert.deepEqual(parseHex(null), { r: 128, g: 128, b: 128 })
  assert.deepEqual(parseHex(undefined), { r: 128, g: 128, b: 128 })
})

test('returns gray for garbage input', () => {
  assert.deepEqual(parseHex('not-a-color'), { r: 128, g: 128, b: 128 })
})

// ── rgbToHSL ────────────────────────────────────────────────────────────────

console.log('\nrgbToHSL:')

test('pure red → h=0, s=1, l=0.5', () => {
  const hsl = rgbToHSL(255, 0, 0)
  approx(hsl.h, 0)
  approx(hsl.s, 1)
  approx(hsl.l, 0.5)
})

test('pure green → h=120', () => {
  const hsl = rgbToHSL(0, 255, 0)
  approx(hsl.h, 120)
})

test('pure blue → h=240', () => {
  const hsl = rgbToHSL(0, 0, 255)
  approx(hsl.h, 240)
})

test('white → s=0, l=1', () => {
  const hsl = rgbToHSL(255, 255, 255)
  approx(hsl.s, 0)
  approx(hsl.l, 1)
})

test('black → s=0, l=0', () => {
  const hsl = rgbToHSL(0, 0, 0)
  approx(hsl.s, 0)
  approx(hsl.l, 0)
})

// ── normalizeRGB / normalizeHSL ─────────────────────────────────────────────

console.log('\nnormalizeRGB/HSL:')

test('normalizeRGB returns values in [0,1]', () => {
  const rgb = normalizeRGB('#804020')
  assert.equal(rgb.length, 3)
  rgb.forEach(v => assert.ok(v >= 0 && v <= 1, `${v} not in [0,1]`))
})

test('normalizeHSL returns values in [0,1]', () => {
  const hsl = normalizeHSL('#ff6600')
  assert.equal(hsl.length, 3)
  hsl.forEach(v => assert.ok(v >= 0 && v <= 1, `${v} not in [0,1]`))
})

// ── oneHot ──────────────────────────────────────────────────────────────────

console.log('\noneHot:')

test('encodes known value', () => {
  const vec = oneHot('casual', OCCASIONS)
  assert.equal(vec.length, 5)
  assert.equal(vec[0], 1)  // casual is first
  assert.equal(vec.reduce((a, b) => a + b), 1) // exactly one 1
})

test('unknown value → all zeros', () => {
  const vec = oneHot('underwater', OCCASIONS)
  assert.equal(vec.reduce((a, b) => a + b), 0)
})

test('null → all zeros', () => {
  const vec = oneHot(null, OCCASIONS)
  assert.equal(vec.reduce((a, b) => a + b), 0)
})

test('case insensitive', () => {
  const vec = oneHot('FORMAL', OCCASIONS)
  assert.equal(vec[2], 1)
})

// ── oneHotCategory ──────────────────────────────────────────────────────────

console.log('\noneHotCategory:')

test('encodes direct category', () => {
  const vec = oneHotCategory('T-Shirt')
  assert.equal(vec.length, 16)
  assert.equal(vec[0], 1)
})

test('maps alias (Shoes → Sneakers)', () => {
  const vec = oneHotCategory('Shoes')
  const sneakersIdx = CATEGORIES.indexOf('Sneakers')
  assert.equal(vec[sneakersIdx], 1)
})

test('maps alias (Heels → Boots)', () => {
  const vec = oneHotCategory('Heels')
  const bootsIdx = CATEGORIES.indexOf('Boots')
  assert.equal(vec[bootsIdx], 1)
})

// ── computeColorHarmony ─────────────────────────────────────────────────────

console.log('\ncomputeColorHarmony:')

test('complementary colors (red + cyan) score high', () => {
  const item = { primary_color: '#ff0000' }  // red: h=0
  const peers = [{ primary_color: '#00ffff' }]  // cyan: h=180
  const score = computeColorHarmony(item, peers)
  assert.ok(score >= 0.8, `Expected >=0.8, got ${score}`)
})

test('analogous colors score high', () => {
  const item = { primary_color: '#ff0000' }   // red: h=0
  const peers = [{ primary_color: '#ff4400' }] // red-orange: ~h=16
  const score = computeColorHarmony(item, peers)
  assert.ok(score >= 0.8, `Expected >=0.8, got ${score}`)
})

test('triadic colors (red + green, 120°) score moderately', () => {
  const item = { primary_color: '#ff0000' }   // red: h=0
  const peers = [{ primary_color: '#00ff00' }] // green: h=120 — triadic
  const score = computeColorHarmony(item, peers)
  assert.ok(score >= 0.7, `Expected >=0.7 (triadic harmony), got ${score}`)
})

test('true clash (red + chartreuse, ~80°) scores low', () => {
  const item = { primary_color: '#ff0000' }   // red: h=0
  const peers = [{ primary_color: '#80ff00' }] // chartreuse: ~h=90 — awkward zone
  const score = computeColorHarmony(item, peers)
  assert.ok(score <= 0.5, `Expected <=0.5, got ${score}`)
})

test('neutrals always harmonize', () => {
  const item = { primary_color: '#333333' }    // dark gray — very low saturation
  const peers = [{ primary_color: '#ff0000' }] // red
  const score = computeColorHarmony(item, peers)
  assert.ok(score >= 0.7, `Expected >=0.7, got ${score}`)
})

test('navy + khaki score well', () => {
  const item = { primary_color: '#001f3f' }    // navy
  const peers = [{ primary_color: '#c3b091' }] // khaki
  const score = computeColorHarmony(item, peers)
  assert.ok(score >= 0.5, `Expected >=0.5, got ${score} (navy+khaki)`)
})

test('no peers → 0.5 (neutral)', () => {
  const score = computeColorHarmony({ primary_color: '#ff0000' }, [])
  approx(score, 0.5)
})

// ── computeFormalityMatch ───────────────────────────────────────────────────

console.log('\ncomputeFormalityMatch:')

test('hoodie + formal = poor match', () => {
  const score = computeFormalityMatch({ category: 'Hoodie' }, { occasion: 'formal' })
  assert.ok(score < 0.4, `Expected <0.4, got ${score}`)
})

test('button-up + work = good match', () => {
  const score = computeFormalityMatch({ category: 'Button-Up' }, { occasion: 'work' })
  assert.ok(score >= 0.9, `Expected >=0.9, got ${score}`)
})

test('sneakers + casual = good match', () => {
  const score = computeFormalityMatch({ category: 'Sneakers' }, { occasion: 'casual' })
  assert.ok(score >= 0.9, `Expected >=0.9, got ${score}`)
})

test('dress + date = decent match', () => {
  const score = computeFormalityMatch({ category: 'Dress' }, { occasion: 'date' })
  assert.ok(score >= 0.9, `Expected >=0.9, got ${score}`)
})

test('no context → uses default formality 5', () => {
  const score = computeFormalityMatch({ category: 'Pants' }, {})
  // Pants=6, default=5, diff=1 → 0.9
  approx(score, 0.9)
})

// ── computeCategoryDiversity ────────────────────────────────────────────────

console.log('\ncomputeCategoryDiversity:')

test('all unique categories → 1.0', () => {
  const peers = [
    { category: 'T-Shirt' },
    { category: 'Jeans' },
    { category: 'Sneakers' },
  ]
  approx(computeCategoryDiversity(peers), 1.0)
})

test('duplicate categories → < 1.0', () => {
  const peers = [
    { category: 'T-Shirt' },
    { category: 'T-Shirt' },
    { category: 'Jeans' },
  ]
  approx(computeCategoryDiversity(peers), 2 / 3)
})

test('no peers → 0.5', () => {
  approx(computeCategoryDiversity([]), 0.5)
})

// ── computeAvgPeerEma ───────────────────────────────────────────────────────

console.log('\ncomputeAvgPeerEma:')

test('averages peer scores', () => {
  const peers = [{ ema_score: 0.8 }, { ema_score: 0.6 }]
  approx(computeAvgPeerEma(peers), 0.7)
})

test('missing ema_score defaults to 0.5', () => {
  const peers = [{ ema_score: 0.8 }, {}]
  approx(computeAvgPeerEma(peers), 0.65)
})

test('no peers → 0.5', () => {
  approx(computeAvgPeerEma([]), 0.5)
})

// ── computeItemFeatures (integration) ───────────────────────────────────────

console.log('\ncomputeItemFeatures:')

test('produces correct dimension vector', () => {
  const item = {
    category: 'T-Shirt',
    primary_color: '#ff0000',
    pattern: 'solid',
    material: 'cotton',
    ema_score: 0.7,
  }
  const context = { occasion: 'casual', season: 'summer', timeOfDay: 'morning' }
  const peers = [
    { category: 'Jeans', primary_color: '#001f3f', ema_score: 0.6 },
    { category: 'Sneakers', primary_color: '#ffffff', ema_score: 0.8 },
  ]

  const features = computeItemFeatures(item, context, peers)
  assert.equal(features.length, FEATURE_DIM, `Expected ${FEATURE_DIM} dims, got ${features.length}`)
})

test('all values are numbers', () => {
  const features = computeItemFeatures(
    { category: 'Jeans', primary_color: '#0000ff', pattern: 'solid', material: 'denim', ema_score: 0.5 },
    { occasion: 'work', season: 'fall', timeOfDay: 'afternoon' },
    []
  )
  features.forEach((v, i) => {
    assert.equal(typeof v, 'number', `Feature[${i}] is ${typeof v}, expected number`)
    assert.ok(!isNaN(v), `Feature[${i}] is NaN`)
  })
})

test('handles missing/null fields gracefully', () => {
  const features = computeItemFeatures({}, {}, [])
  assert.equal(features.length, FEATURE_DIM)
  features.forEach((v, i) => {
    assert.ok(!isNaN(v), `Feature[${i}] is NaN with empty input`)
  })
})

test('handles null context and peers', () => {
  const features = computeItemFeatures({ category: 'Boots' })
  assert.equal(features.length, FEATURE_DIM)
})

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)
if (failed > 0) {
  console.log('❌ SOME TESTS FAILED')
  process.exit(1)
} else {
  console.log('✅ ALL TESTS PASSED')
}
