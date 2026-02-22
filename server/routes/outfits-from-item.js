import db from '../db/client.js'
import { authenticateApiKey } from '../middleware/auth.js'
import { buildColorProfile, paletteConsistencyScore } from '../services/PreferenceService.js'

// Color harmony and complement logic
const NEUTRALS = ['black', 'white', 'grey', 'gray', 'beige', 'navy', 'cream', 'ivory', 'tan', 'brown', 'khaki']

const COLOR_COMPLEMENTS = {
  // Complementary colors on the color wheel
  red: ['green', 'teal', 'blue', 'navy'],
  orange: ['blue', 'navy', 'teal', 'sky'],
  yellow: ['blue', 'navy', 'purple', 'violet'],
  green: ['red', 'pink', 'burgundy', 'coral'],
  blue: ['orange', 'coral', 'tan', 'brown'],
  purple: ['yellow', 'lime', 'green'],
  pink: ['green', 'teal', 'grey', 'navy'],
  brown: ['blue', 'sky', 'cream', 'white'],
  navy: ['orange', 'coral', 'tan', 'beige']
}

const CATEGORY_COMPLEMENTS = {
  // What categories typically go together
  top: ['bottom', 'shoes', 'outerwear', 'accessory'],
  bottom: ['top', 'shoes', 'outerwear', 'accessory', 'bag'],
  dress: ['shoes', 'outerwear', 'accessory', 'bag'],
  outerwear: ['top', 'bottom', 'shoes', 'bag'],
  shoes: ['top', 'bottom', 'dress'],
  bag: ['top', 'bottom', 'dress', 'shoes'],
  accessory: ['top', 'bottom', 'dress']
}

export default async function outfitsFromItemRoutes(fastify, opts) {
  // Build outfit from a single item
  fastify.post('/outfits/from-item', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { itemId } = request.body

    if (!itemId) {
      return reply.code(400).send({ error: 'itemId is required' })
    }

    // Get the selected item
    const selectedItem = db.prepare('SELECT * FROM clothing_items WHERE id = ? AND user_id = ?').get(itemId, userId)

    if (!selectedItem) {
      return reply.code(404).send({ error: 'Item not found' })
    }

    // Get eligible items (excluding the selected item)
    const eligibleItems = db.prepare(`
      SELECT * FROM clothing_items 
      WHERE user_id = ? AND is_active = 1 AND storage_status = 'active' AND in_laundry = 0 AND id != ?
    `).all(userId, itemId)

    if (eligibleItems.length === 0) {
      return {
        item: selectedItem,
        suggestions: []
      }
    }

    // Get user color profile for scoring
    const userProfile = buildColorProfile(userId)

    // Find complementary items
    const suggestions = findComplementaryItems(selectedItem, eligibleItems, userProfile)

    // Sort by score and take top 3-5
    suggestions.sort((a, b) => b.score - a.score)
    const finalSuggestions = suggestions.slice(0, 5)

    return {
      item: selectedItem,
      suggestions: finalSuggestions
    }
  })
}

function findComplementaryItems(selectedItem, allItems, userProfile) {
  const suggestions = []
  const selectedColor = selectedItem.primary_color?.toLowerCase()
  const selectedCategory = selectedItem.category
  const selectedFormality = selectedItem.formality || 5

  // Get complementary categories
  const targetCategories = CATEGORY_COMPLEMENTS[selectedCategory] || ['top', 'bottom', 'shoes']

  for (const item of allItems) {
    // Only consider items from complementary categories
    if (!targetCategories.includes(item.category)) continue

    let score = 0.5

    // 1. Category fit (most important)
    if (targetCategories.includes(item.category)) {
      score += 0.25
    }

    // 2. Color harmony with selected item
    const itemColor = item.primary_color?.toLowerCase()
    
    if (itemColor && selectedColor) {
      // Check if colors complement each other
      if (COLOR_COMPLEMENTS[selectedColor]?.includes(itemColor)) {
        score += 0.2 // Complementary colors
      } else if (NEUTRALS.includes(itemColor) || NEUTRALS.includes(selectedColor)) {
        score += 0.15 // Neutral pairs well with anything
      } else if (itemColor === selectedColor) {
        score += 0.1 // Monochromatic
      } else {
        // Check if both are non-neutrals (potential clash)
        const bothNonNeutral = !NEUTRALS.includes(itemColor) && !NEUTRALS.includes(selectedColor)
        if (bothNonNeutral) {
          score -= 0.1
        }
      }
    }

    // 3. Formality match
    const itemFormality = item.formality || 5
    const formalityDiff = Math.abs(itemFormality - selectedFormality)
    if (formalityDiff <= 1) {
      score += 0.15
    } else if (formalityDiff <= 2) {
      score += 0.05
    } else {
      score -= formalityDiff * 0.05
    }

    // 4. Season compatibility
    const currentSeason = getCurrentSeason()
    try {
      const itemSeasons = JSON.parse(item.season_tags || '[]')
      const selectedSeasons = JSON.parse(selectedItem.season_tags || '[]')
      if (itemSeasons.includes(currentSeason) || selectedSeasons.includes(currentSeason)) {
        score += 0.05
      }
    } catch {}

    // 5. Weather compatibility (weight)
    if (item.weight && selectedItem.weight) {
      if (item.weight === selectedItem.weight) {
        score += 0.05
      }
    }

    // 6. Loved items bonus
    if (item.is_loved) {
      score += 0.1
    }

    // 7. Palette consistency with user's profile
    const paletteScore = paletteConsistencyScore([item, selectedItem], userProfile)
    score += (paletteScore - 0.5) * 0.1

    // Cap score between 0 and 1
    score = Math.max(0, Math.min(1, score))

    suggestions.push({
      ...item,
      score: Math.round(score * 100) / 100,
      matchReason: getMatchReason(selectedItem, item)
    })
  }

  return suggestions
}

function getMatchReason(selectedItem, matchedItem) {
  const reasons = []
  
  const selectedColor = selectedItem.primary_color?.toLowerCase()
  const matchedColor = matchedItem.primary_color?.toLowerCase()

  // Color-based reasons
  if (matchedColor && selectedColor) {
    if (NEUTRALS.includes(matchedColor) || NEUTRALS.includes(selectedColor)) {
      reasons.push('Neutral pairs with everything')
    } else if (COLOR_COMPLEMENTS[selectedColor]?.includes(matchedColor)) {
      reasons.push('Complementary colors')
    } else if (matchedColor === selectedColor) {
      reasons.push('Monochromatic look')
    }
  }

  // Formality-based reasons
  const formalityDiff = Math.abs((matchedItem.formality || 5) - (selectedItem.formality || 5))
  if (formalityDiff <= 1) {
    reasons.push('Similar formality level')
  }

  // Category-based reasons
  reasons.push(`Pairs well with ${selectedItem.category}`)

  return reasons.join('. ')
}

function getCurrentSeason() {
  const month = new Date().getMonth()
  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'fall'
  return 'winter'
}
