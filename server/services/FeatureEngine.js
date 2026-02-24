/**
 * FeatureEngine.js — Hand-crafted feature computation for the Outfit Trainer NN
 * 
 * Produces a 57-dimension feature vector per item-in-context:
 *   Item:    category_onehot[16] + color_rgb[3] + color_hsl[3] + pattern_onehot[8] + material_onehot[10] + ema_score[1]
 *   Context: occasion_onehot[5] + season_onehot[4] + time_of_day[3]
 *   Outfit:  color_harmony[1] + formality_match[1] + category_diversity[1] + avg_peer_ema[1]
 *   Total:   57
 */

// ── Category encoding (16 slots, covers male categories + padding) ──────────

const CATEGORIES = [
  'T-Shirt', 'Button-Up', 'Knitwear', 'Hoodie', 'Jacket',
  'Blouse', 'Dress', 'Tank', 'Camisole',
  'Jeans', 'Pants', 'Shorts', 'Skirts', 'Leggings',
  'Boots', 'Sneakers'
]
// Overflow categories map to nearest slot
const CATEGORY_ALIASES = {
  'Shoes': 'Sneakers', 'Sandals': 'Sneakers', 'Heels': 'Boots', 'Flats': 'Sneakers',
  'Belt': 'Jacket', 'Hat': 'Hoodie', 'Socks': 'Sneakers',
  'Scarf': 'Knitwear', 'Necklace': 'Dress', 'Earrings': 'Dress',
  'Bracelet': 'Dress', 'Handbag': 'Jacket', 'Other': 'T-Shirt'
}

const PATTERNS = ['solid', 'striped', 'plaid', 'floral', 'geometric', 'camo', 'animal', 'abstract']

const MATERIALS = ['cotton', 'denim', 'leather', 'wool', 'polyester', 'silk', 'linen', 'knit', 'fleece', 'nylon']

const OCCASIONS = ['casual', 'work', 'formal', 'date', 'outdoor']

const SEASONS = ['spring', 'summer', 'fall', 'winter']

const TIMES = ['morning', 'afternoon', 'evening']

// ── Formality map (1-10 scale) ──────────────────────────────────────────────

const ITEM_FORMALITY = {
  'T-Shirt': 2, 'Hoodie': 1, 'Button-Up': 6, 'Knitwear': 5,
  'Jacket': 5, 'Blouse': 6, 'Dress': 7, 'Tank': 2, 'Camisole': 3,
  'Jeans': 3, 'Pants': 6, 'Shorts': 1, 'Skirts': 5, 'Leggings': 2,
  'Boots': 5, 'Sneakers': 2, 'Shoes': 7, 'Sandals': 1, 'Heels': 8, 'Flats': 4,
  'Belt': 5, 'Hat': 2, 'Socks': 2, 'Scarf': 4,
  'Necklace': 6, 'Earrings': 6, 'Bracelet': 5, 'Handbag': 5
}

const CONTEXT_FORMALITY = {
  'casual': 2, 'work': 6, 'formal': 8, 'date': 7, 'outdoor': 1
}

// ── Color utilities ─────────────────────────────────────────────────────────

/**
 * Parse a hex color string to {r, g, b} (0-255)
 * Accepts: #rgb, #rrggbb, rgb, rrggbb
 */
function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return { r: 128, g: 128, b: 128 } // gray default
  hex = hex.replace(/^#/, '')
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  if (hex.length !== 6) return { r: 128, g: 128, b: 128 }
  const n = parseInt(hex, 16)
  if (isNaN(n)) return { r: 128, g: 128, b: 128 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/**
 * RGB (0-255) → HSL (h: 0-360, s: 0-1, l: 0-1)
 */
function rgbToHSL(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s, l }
}

/**
 * Normalize RGB to [0, 1] range — returns [r, g, b]
 */
function normalizeRGB(hex) {
  const { r, g, b } = parseHex(hex)
  return [r / 255, g / 255, b / 255]
}

/**
 * Normalize HSL to [0, 1] range — returns [h, s, l]
 */
function normalizeHSL(hex) {
  const { r, g, b } = parseHex(hex)
  const hsl = rgbToHSL(r, g, b)
  return [hsl.h / 360, hsl.s, hsl.l]
}

// ── One-hot encoding ────────────────────────────────────────────────────────

/**
 * One-hot encode a value against a vocabulary.
 * Returns array of length vocab.length, all zeros except index of value = 1.
 * Unknown values → all zeros.
 */
function oneHot(value, vocab) {
  const vec = new Array(vocab.length).fill(0)
  if (!value) return vec
  const normalized = value.toLowerCase().trim()
  const idx = vocab.findIndex(v => v.toLowerCase() === normalized)
  if (idx >= 0) vec[idx] = 1
  return vec
}

/**
 * One-hot encode a category, using aliases for overflow categories.
 */
function oneHotCategory(category) {
  if (!category) return new Array(CATEGORIES.length).fill(0)
  const resolved = CATEGORY_ALIASES[category] || category
  return oneHot(resolved, CATEGORIES)
}

// ── Outfit-level features (the secret sauce) ────────────────────────────────

/**
 * Color harmony between an item and its outfit peers.
 * Based on color wheel relationships:
 *   Complementary (150-180°): 0.9
 *   Analogous (0-30°): 0.85
 *   Split-complementary (135-165°): 0.8
 *   Triadic (110-130°): 0.75
 *   Neutrals always harmonize: 0.8
 *   Awkward zone (60-110°): 0.3
 * 
 * Returns 0-1 score (higher = more harmonious)
 */
function computeColorHarmony(item, outfitPeers) {
  if (!outfitPeers || outfitPeers.length === 0) return 0.5

  const itemRGB = parseHex(item.primary_color)
  const itemHSL = rgbToHSL(itemRGB.r, itemRGB.g, itemRGB.b)

  const scores = outfitPeers.map(peer => {
    const peerRGB = parseHex(peer.primary_color)
    const peerHSL = rgbToHSL(peerRGB.r, peerRGB.g, peerRGB.b)

    const hueDiff = Math.abs(itemHSL.h - peerHSL.h)
    const normalizedDiff = Math.min(hueDiff, 360 - hueDiff) // circular distance

    // Neutrals always harmonize (low saturation = gray/black/white/beige)
    if (itemHSL.s < 0.15 || peerHSL.s < 0.15) return 0.8

    // Same-ish color (monochromatic): high harmony
    if (normalizedDiff <= 15) return 0.9

    // Analogous (15-30°): high harmony
    if (normalizedDiff <= 30) return 0.85

    // Complementary (150-180°): high harmony
    if (normalizedDiff >= 150 && normalizedDiff <= 180) return 0.9

    // Split-complementary (135-165°): good harmony
    if (normalizedDiff >= 135) return 0.8

    // Triadic (110-130°): good harmony
    if (normalizedDiff >= 110 && normalizedDiff <= 130) return 0.75

    // Awkward zone (60-110°): poor harmony
    if (normalizedDiff >= 60) return 0.3

    // Transition zones (30-60°): moderate
    return 0.5
  })

  return scores.reduce((a, b) => a + b, 0) / scores.length
}

/**
 * How well an item's formality matches the context occasion.
 * Returns 0-1 where 1 = perfect match.
 */
function computeFormalityMatch(item, context) {
  const itemFormality = ITEM_FORMALITY[item.category] || item.formality || 5
  const contextFormality = CONTEXT_FORMALITY[context?.occasion] || 5
  const diff = Math.abs(itemFormality - contextFormality)
  return Math.max(0, 1.0 - (diff / 10.0))
}

/**
 * Category diversity in the outfit — penalizes redundant categories.
 * Returns 0-1 where 1 = all unique categories.
 */
function computeCategoryDiversity(outfitPeers) {
  if (!outfitPeers || outfitPeers.length === 0) return 0.5
  const cats = new Set(outfitPeers.map(p => p.category).filter(Boolean))
  return cats.size / outfitPeers.length
}

/**
 * Average EMA score of outfit peers.
 * High peer scores = item is in good company.
 */
function computeAvgPeerEma(outfitPeers) {
  if (!outfitPeers || outfitPeers.length === 0) return 0.5
  const scores = outfitPeers.map(p => p.ema_score ?? 0.5)
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

// ── Main feature computation ────────────────────────────────────────────────

/**
 * Compute the full 57-dimension feature vector for an item in context.
 * 
 * @param {Object} item - clothing_items row (needs: category, primary_color, pattern, material, ema_score)
 * @param {Object} context - { occasion, season, timeOfDay }
 * @param {Object[]} outfitPeers - other items in the same outfit (excludes this item)
 * @returns {number[]} feature vector of length FEATURE_DIM
 */
function computeItemFeatures(item, context = {}, outfitPeers = []) {
  return [
    // Item features
    ...oneHotCategory(item.category),           // [16]
    ...normalizeRGB(item.primary_color),         // [3]
    ...normalizeHSL(item.primary_color),         // [3]
    ...oneHot(item.pattern, PATTERNS),           // [8]
    ...oneHot(item.material, MATERIALS),         // [10]
    item.ema_score ?? 0.5,                       // [1]

    // Context features
    ...oneHot(context.occasion, OCCASIONS),      // [5]
    ...oneHot(context.season, SEASONS),          // [4]
    ...oneHot(context.timeOfDay, TIMES),         // [3]

    // Outfit-level features
    computeColorHarmony(item, outfitPeers),      // [1]
    computeFormalityMatch(item, context),         // [1]
    computeCategoryDiversity(outfitPeers),        // [1]
    computeAvgPeerEma(outfitPeers),              // [1]
  ]
  // Total: 16 + 3 + 3 + 8 + 10 + 1 + 5 + 4 + 3 + 1 + 1 + 1 + 1 = 57
}

/** Expected feature vector length */
const FEATURE_DIM = 57

// ── Exports ─────────────────────────────────────────────────────────────────

export {
  FEATURE_DIM,
  CATEGORIES,
  PATTERNS,
  MATERIALS,
  OCCASIONS,
  SEASONS,
  TIMES,
  ITEM_FORMALITY,
  CONTEXT_FORMALITY,
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
}

export default {
  FEATURE_DIM,
  computeItemFeatures,
  computeColorHarmony,
  computeFormalityMatch,
  computeCategoryDiversity,
  computeAvgPeerEma,
}
