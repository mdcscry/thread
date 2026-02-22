// Onboarding routes
// Feature 12: Onboarding flow

import db from '../db/client.js'
import { authenticateApiKey } from '../middleware/auth.js'

export default async function onboardingRoutes(fastify, opts) {
  
  // POST /onboarding/start - Initialize, create user_preferences
  fastify.post('/onboarding/start', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    // Check if preferences already exist
    const existing = db.prepare('SELECT id FROM user_preferences WHERE user_id = ?').get(userId)
    
    if (existing) {
      return { 
        message: 'Onboarding already started',
        preferences_id: existing.id
      }
    }
    
    // Create new preferences record
    const result = db.prepare(`
      INSERT INTO user_preferences (user_id, created_at, updated_at)
      VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(userId)
    
    return {
      message: 'Onboarding started',
      preferences_id: result.lastInsertRowid,
      onboarding_completed: false,
      closet_intake_completed: false
    }
  })
  
  // POST /onboarding/preferences - Save Q1-5 answers
  fastify.post('/onboarding/preferences', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { 
      style_tags,
      primary_occasions,
      climate,
      preferred_colors,
      color_exclusions,
      fit_preference
    } = request.body
    
    // Check if preferences exist
    let prefs = db.prepare('SELECT id FROM user_preferences WHERE user_id = ?').get(userId)
    
    if (!prefs) {
      // Create if doesn't exist
      const result = db.prepare(`
        INSERT INTO user_preferences (user_id, created_at, updated_at)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(userId)
      prefs = { id: result.lastInsertRowid }
    }
    
    // Build update query dynamically
    const updates = []
    const values = []
    
    if (style_tags !== undefined) {
      updates.push('style_tags = ?')
      values.push(JSON.stringify(style_tags))
    }
    if (primary_occasions !== undefined) {
      updates.push('primary_occasions = ?')
      values.push(JSON.stringify(primary_occasions))
    }
    if (climate !== undefined) {
      updates.push('climate = ?')
      values.push(climate)
    }
    if (preferred_colors !== undefined) {
      updates.push('preferred_colors = ?')
      values.push(JSON.stringify(preferred_colors))
    }
    if (color_exclusions !== undefined) {
      updates.push('color_exclusions = ?')
      values.push(JSON.stringify(color_exclusions))
    }
    if (fit_preference !== undefined) {
      updates.push('fit_preference = ?')
      values.push(fit_preference)
    }
    
    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP')
      values.push(userId)
      
      db.prepare(`UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?`)
        .run(...values)
    }
    
    // Return updated preferences
    const updated = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId)
    
    return {
      message: 'Preferences saved',
      preferences: {
        style_tags: JSON.parse(updated.style_tags || '[]'),
        primary_occasions: JSON.parse(updated.primary_occasions || '[]'),
        climate: updated.climate,
        preferred_colors: JSON.parse(updated.preferred_colors || '[]'),
        color_exclusions: JSON.parse(updated.color_exclusions || '[]'),
        fit_preference: updated.fit_preference
      }
    }
  })
  
  // GET /onboarding/status - Return completed flags + item counts
  fastify.get('/onboarding/status', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    // Get preferences
    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId)
    
    // Get clothing items count
    const itemsCount = db.prepare(`
      SELECT COUNT(*) as count FROM clothing_items 
      WHERE user_id = ? AND is_active = 1
    `).get(userId)
    
    const onboardingCompleted = prefs ? !!prefs.onboarding_completed : false
    const closetIntakeCompleted = prefs ? !!prefs.closet_intake_completed : false
    const readyForSuggestions = itemsCount.count >= 5
    
    let nextAction = null
    if (!onboardingCompleted) {
      nextAction = 'complete_onboarding'
    } else if (!closetIntakeCompleted) {
      nextAction = 'complete_closet_intake'
    } else if (itemsCount.count < 5) {
      nextAction = 'upload_photos'
    }
    
    return {
      onboarding_completed: onboardingCompleted,
      closet_intake_completed: closetIntakeCompleted,
      clothing_items_count: itemsCount.count,
      ready_for_suggestions: readyForSuggestions,
      next_action: nextAction
    }
  })
  
  // POST /onboarding/closet-intake - Submit free-text, AI parses
  fastify.post('/onboarding/closet-intake', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { text } = request.body
    
    if (!text) {
      return reply.code(400).send({ error: 'Text is required' })
    }
    
    // Check if preferences exist
    let prefs = db.prepare('SELECT id FROM user_preferences WHERE user_id = ?').get(userId)
    
    if (!prefs) {
      const result = db.prepare(`
        INSERT INTO user_preferences (user_id, created_at, updated_at)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(userId)
      prefs = { id: result.lastInsertRowid }
    }
    
    // Simple keyword-based parsing (placeholder for AI)
    // In production, this would call an AI service
    const parsedItems = []
    
    // Parse common items from text
    const textLower = text.toLowerCase()
    
    // Category patterns
    const categoryPatterns = {
      top: ['tee', 't-shirt', 'shirt', 'blouse', 'polo', 'tank', 'sweater', 'hoodie', 'jacket'],
      bottom: ['jeans', 'pants', 'trousers', 'shorts', 'skirt', 'leggings'],
      dress: ['dress', 'gown', 'jumpsuit'],
      outerwear: ['jacket', 'coat', 'blazer', 'cardigan', 'vest'],
      shoes: ['shoes', 'sneakers', 'boots', 'heels', 'loafers', 'sandals', 'flats']
    }
    
    const colorMap = {
      'navy': '#000080', 'blue': '#0000FF', 'white': '#FFFFFF', 'black': '#000000',
      'gray': '#808080', 'grey': '#808080', 'red': '#FF0000', 'green': '#008000',
      'brown': '#A52A2A', 'beige': '#F5F5DC', 'khaki': '#C3B091', 'tan': '#D2B48C',
      'pink': '#FFC0CB', 'purple': '#800080', 'orange': '#FFA500', 'yellow': '#FFFF00'
    }
    
    // Extract colors mentioned
    const foundColors = []
    for (const [color, hex] of Object.entries(colorMap)) {
      if (textLower.includes(color)) {
        foundColors.push({ name: color, hex })
      }
    }
    
    // Extract items
    for (const [category, keywords] of Object.entries(categoryPatterns)) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          // Determine formality based on keywords
          let formality = 5
          if (['blazer', 'coat', 'dress', 'gown', 'jumpsuit'].includes(keyword)) {
            formality = 8
          } else if (['sweater', 'hoodie', 'cardigan'].includes(keyword)) {
            formality = 6
          } else if (['shorts', 'sandals', 'tank'].includes(keyword)) {
            formality = 3
          } else if (['leggings', 'comfy'].includes(keyword)) {
            formality = 2
          }
          
          // Determine subcategory
          const subcategory = keyword === 'tee' ? 't-shirt' : keyword
          
          parsedItems.push({
            category,
            subcategory,
            primary_color: foundColors[0]?.name || 'unknown',
            formality
          })
          break // Only add one item per category
        }
      }
    }
    
    // If no items parsed, add a generic item
    if (parsedItems.length === 0) {
      parsedItems.push({
        category: 'top',
        subcategory: 't-shirt',
        primary_color: foundColors[0]?.name || 'unknown',
        formality: 5
      })
    }
    
    // Mark closet intake as completed
    db.prepare(`
      UPDATE user_preferences 
      SET closet_intake_completed = 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(userId)
    
    return {
      text,
      parsed_items: parsedItems,
      message: `Parsed ${parsedItems.length} item(s) from your description. Add photos to complete your wardrobe!`
    }
  })
  
  // GET /onboarding/closet-intake/prompts - Return guided prompts
  fastify.get('/onboarding/closet-intake/prompts', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    return {
      prompts: [
        "My go-to work outfit",
        "Weekend look",
        "Something I wear on dates",
        "My comfiest clothes",
        "My nicest outfit"
      ]
    }
  })
}
