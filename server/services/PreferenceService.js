import db from '../db/client.js'

// EMA scoring replaces TensorFlow.js per docs/11-HARD-PROBLEMS-AND-REVISIONS.md section 6

const EMA_ALPHA = 0.3  // how fast new feedback overrides old

// Signal weights per docs/12-FEEDBACK-AND-PHONE-INTEGRATION.md
const SIGNAL_WEIGHTS = {
  // High confidence — deliberate, specific
  worn_confirmed:          1.0,   // Logged as actually worn
  voice_positive_strong:   0.9,   // "That was perfect"
  voice_positive_mild:     0.65,  // "That worked pretty well"
  
  // Medium confidence — in-app, intentional
  thumbs_up:               0.6,
  loved_item:              0.55,  // Hearted in catalog
  
  // Low confidence — passive, ambiguous  
  worn_unconfirmed:        0.4,   // Generated but no explicit worn log
  
  // Negative signals
  thumbs_down:            -0.8,
  voice_negative_strong:  -0.9,   // "That looked awful"
  voice_negative_mild:    -0.5,   // "Didn't feel quite right"
  skipped_repeatedly:     -0.2,   // Generated 3+ times, never chosen
}

/**
 * Update an item's EMA score based on feedback
 * @param {Object} item - clothing_item from DB
 * @param {number} feedbackValue - normalized 0-1 value
 * @returns {Object} updated { ema_score, ema_count }
 */
export function updateItemScore(item, feedbackValue) {
  const normalized = Math.max(0, Math.min(1, feedbackValue))
  
  if (!item.ema_count || item.ema_count === 0) {
    return { ema_score: normalized, ema_count: 1 }
  }
  
  const newScore = (EMA_ALPHA * normalized) + ((1 - EMA_ALPHA) * item.ema_score)
  return { 
    ema_score: Math.max(0, Math.min(1, newScore)), 
    ema_count: item.ema_count + 1
  }
}

/**
 * Record feedback for an outfit - updates all items in the outfit
 * @param {number} userId 
 * @param {number} outfitId 
 * @param {string} signalType - key from SIGNAL_WEIGHTS
 */
export async function recordFeedback(userId, outfitId, signalType) {
  const weight = SIGNAL_WEIGHTS[signalType] || 0
  if (weight === 0) return  // Don't update on dismissed notifications
  
  // Get outfit
  const outfit = db.prepare('SELECT * FROM outfits WHERE id = ? AND user_id = ?').get(outfitId, userId)
  if (!outfit) return
  
  const itemIds = JSON.parse(outfit.item_ids || '[]')
  
  // Update each item
  for (const itemId of itemIds) {
    const item = db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(itemId)
    if (!item) continue
    
    const updated = updateItemScore(item, (weight + 1) / 2)  // map [-1, 1] to [0, 1]
    
    db.prepare(`
      UPDATE clothing_items 
      SET ema_score = ?, ema_count = ?
      WHERE id = ?
    `).run(updated.ema_score, updated.ema_count, itemId)
  }
  
  // Also update outfit feedback
  db.prepare(`
    UPDATE outfits SET feedback = ? WHERE id = ?
  `).run(weight > 0 ? 1 : weight < 0 ? -1 : 0, outfitId)
  
  // Track preference event
  db.prepare(`
    INSERT INTO preference_events (user_id, outfit_id, event_type)
    VALUES (?, ?, ?)
  `).run(userId, outfitId, signalType)
}

/**
 * Mark outfit as worn (confirmed)
 * @param {number} userId 
 * @param {number} outfitId 
 */
export async function markAsWorn(userId, outfitId) {
  const outfit = db.prepare('SELECT * FROM outfits WHERE id = ? AND user_id = ?').get(outfitId, userId)
  if (!outfit) return
  
  const itemIds = JSON.parse(outfit.item_ids || '[]')
  const now = new Date().toISOString()
  
  // Update each item
  for (const itemId of itemIds) {
    const item = db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(itemId)
    if (!item) continue
    
    const updated = updateItemScore(item, 1.0)  // Full positive
    
    db.prepare(`
      UPDATE clothing_items 
      SET times_worn = times_worn + 1,
          times_worn_confirmed = times_worn_confirmed + 1,
          last_worn = ?,
          last_worn_confirmed = ?,
          ema_score = ?,
          ema_count = ?
      WHERE id = ?
    `).run(now, now, updated.ema_score, updated.ema_count, itemId)
  }
  
  // Update outfit
  db.prepare(`
    UPDATE outfits 
    SET was_worn = 1, was_worn_confirmed_at = ?, worn_date = date('now')
    WHERE id = ?
  `).run(now, outfitId)
  
  // Track event
  db.prepare(`
    INSERT INTO preference_events (user_id, outfit_id, event_type)
    VALUES (?, ?, 'worn_confirmed')
  `).run(userId, outfitId)
}

/**
 * Get average EMA score for items
 * @param {number[]} itemIds 
 * @returns {number} 0-1
 */
export function getAverageEmaScore(itemIds) {
  if (!itemIds || itemIds.length === 0) return 0.5
  
  const items = itemIds.map(id => db.prepare('SELECT ema_score FROM clothing_items WHERE id = ?').get(id)).filter(Boolean)
  if (items.length === 0) return 0.5
  
  const sum = items.reduce((acc, i) => acc + (i.ema_score || 0.5), 0)
  return sum / items.length
}

/**
 * Build wardrobe color profile for a user
 * Used to penalize outfits with colors foreign to user's aesthetic
 * @param {number} userId 
 * @returns {Object} { dominantColors: string[], palettePerson: {...} }
 */
export function buildColorProfile(userId) {
  const items = db.prepare(`
    SELECT colors FROM clothing_items 
    WHERE user_id = ? AND is_active = 1 AND user_reviewed = 1
  `).all(userId)
  
  // Count color frequencies
  const colorFreq = {}
  items.forEach(item => {
    try {
      const colors = JSON.parse(item.colors || '[]')
      colors.forEach(c => {
        const normalized = c.toLowerCase().trim()
        colorFreq[normalized] = (colorFreq[normalized] || 0) + 1
      })
    } catch {}
  })
  
  const total = Object.values(colorFreq).reduce((a, b) => a + b, 0)
  
  // Define color families
  const earthTones = ['beige', 'camel', 'tan', 'brown', 'terracotta', 'rust', 'olive', 'khaki']
  const neutrals = ['black', 'white', 'grey', 'gray', 'navy', 'cream', 'ivory', 'charcoal']
  const brights = ['red', 'cobalt', 'emerald', 'magenta', 'yellow', 'orange', 'purple']
  const pastels = ['blush', 'lavender', 'mint', 'peach', 'powder blue', 'baby blue', 'rose']
  
  const scoreAgainst = (freqs, family, tot) => {
    const familyCount = family.reduce((sum, c) => sum + (freqs[c] || 0), 0)
    return tot > 0 ? familyCount / tot : 0
  }
  
  return {
    dominantColors: Object.entries(colorFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([color]) => color),
    palettePerson: {
      earthTone: scoreAgainst(colorFreq, earthTones, total),
      neutral: scoreAgainst(colorFreq, neutrals, total),
      bright: scoreAgainst(colorFreq, brights, total),
      pastel: scoreAgainst(colorFreq, pastels, total)
    }
  }
}

/**
 * Score outfit palette consistency with user's wardrobe
 * @param {Array} items - outfit items
 * @param {Object} userProfile - color profile
 * @returns {number} 0-1
 */
export function paletteConsistencyScore(items, userProfile) {
  const profileColors = userProfile.dominantColors || []
  const neutrals = ['black', 'white', 'grey', 'gray', 'navy', 'cream', 'ivory', 'beige', 'tan', 'brown']
  
  const outfitColors = items.flatMap(item => {
    try {
      return JSON.parse(item.colors || '[]')
    } catch {
      return [item.primary_color].filter(Boolean)
    }
  }).map(c => c.toLowerCase().trim())
  
  const foreignColors = outfitColors.filter(c => 
    !profileColors.includes(c) && 
    !neutrals.includes(c)
  )
  
  return Math.max(0, 1 - (foreignColors.length * 0.15))
}

/**
 * Toggle laundry status for an item
 * @param {number} itemId 
 * @returns {boolean} new laundry status
 */
export function toggleLaundry(itemId) {
  const item = db.prepare('SELECT in_laundry FROM clothing_items WHERE id = ?').get(itemId)
  if (!item) return false
  
  const newStatus = item.in_laundry ? 0 : 1
  const now = new Date().toISOString()
  
  db.prepare(`
    UPDATE clothing_items 
    SET in_laundry = ?, laundry_since = ?
    WHERE id = ?
  `).run(newStatus, newStatus ? now : null, itemId)
  
  return newStatus === 1
}

/**
 * Clear laundry status for items older than 48 hours
 * Called by daily cron job
 */
export function clearOldLaundry() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  
  const result = db.prepare(`
    UPDATE clothing_items 
    SET in_laundry = 0, laundry_since = NULL
    WHERE in_laundry = 1 AND laundry_since < ?
  `).run(cutoff)
  
  return result.changes
}

/**
 * Toggle storage status (active <-> stored)
 * @param {number} itemId 
 * @returns {string} new status
 */
export function toggleStorage(itemId) {
  const item = db.prepare('SELECT storage_status FROM clothing_items WHERE id = ?').get(itemId)
  if (!item) return 'active'
  
  const newStatus = item.storage_status === 'active' ? 'stored' : 'active'
  const now = new Date().toISOString()
  
  db.prepare(`
    UPDATE clothing_items 
    SET storage_status = ?, stored_at = ?
    WHERE id = ?
  `).run(newStatus, newStatus === 'stored' ? now : null, itemId)
  
  return newStatus
}

export default {
  updateItemScore,
  recordFeedback,
  markAsWorn,
  getAverageEmaScore,
  buildColorProfile,
  paletteConsistencyScore,
  toggleLaundry,
  clearOldLaundry,
  toggleStorage,
  SIGNAL_WEIGHTS
}
