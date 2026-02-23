import db from '../db/client.js'
import { authenticateApiKey } from '../middleware/auth.js'
import { updateItemScore } from '../services/PreferenceService.js'

export default async function outfitTrainerRoutes(fastify, opts) {
  
  // Generate outfits with category filters
  fastify.post('/outfit-trainer/generate', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { categories, count = 5 } = request.body || {}
    
    try {
      // Build query based on category filters
      let query = `
        SELECT * FROM clothing_items 
        WHERE user_id = ?
      `
      const params = [userId]
      
      // Add category filters
      if (categories?.top) {
        query += ` AND category = ?`
        params.push(categories.top)
      }
      if (categories?.bottom) {
        query += ` AND category = ?`
        params.push(categories.bottom)
      }
      if (categories?.footwear) {
        query += ` AND category = ?`
        params.push(categories.footwear)
      }
      if (categories?.accessory) {
        query += ` AND category = ?`
        params.push(categories.accessory)
      }
      
      query += ` ORDER BY ema_score DESC LIMIT 100`
      
      const items = db.prepare(query).all(...params)
      
      // Group by category
      const byCategory = {}
      for (const item of items) {
        const cat = item.category || 'Other'
        if (!byCategory[cat]) byCategory[cat] = []
        byCategory[cat].push(item)
      }
      
      // Generate outfit combinations
      const tops = byCategory[categories?.top] || byCategory['T-Shirt'] || byCategory['Button-Up'] || byCategory['Knitwear'] || byCategory['Hoodie'] || byCategory['Jacket'] || Object.values(byCategory).flat().slice(0, 10)
      const bottoms = byCategory[categories?.bottom] || byCategory['Jeans'] || byCategory['Pants'] || byCategory['Shorts'] || Object.values(byCategory).flat().slice(0, 10)
      const footwear = byCategory[categories?.footwear] || byCategory['Boots'] || byCategory['Sneakers'] || byCategory['Shoes'] || byCategory['Sandals'] || Object.values(byCategory).flat().slice(0, 10)
      const accessories = byCategory[categories?.accessory] || byCategory['Belt'] || byCategory['Hat'] || byCategory['Socks'] || Object.values(byCategory).flat().slice(0, 10)
      
      const outfits = []
      for (let i = 0; i < count; i++) {
        const outfit = {
          id: i + 1,
          items: {
            top: tops[i % tops.length] || null,
            bottom: bottoms[i % bottoms.length] || null,
            footwear: footwear[i % footwear.length] || null,
            accessory: accessories[i % accessories.length] || null
          }
        }
        // Filter out null items
        outfit.items = Object.fromEntries(Object.entries(outfit.items).filter(([_, v]) => v))
        if (Object.keys(outfit.items).length > 0) {
          outfits.push(outfit)
        }
      }
      
      return { outfits }
    } catch (error) {
      console.error('Generate error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })
  
  // Submit feedback
  fastify.post('/outfit-trainer/feedback', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const feedbackList = request.body  // Array of { itemId, feedbackType }
    
    if (!Array.isArray(feedbackList)) {
      return reply.code(400).send({ error: 'Expected array of feedback' })
    }
    
    try {
      const insert = db.prepare(`
        INSERT INTO outfit_feedback (user_id, item_id, feedback_type)
        VALUES (?, ?, ?)
      `)
      
      let inserted = 0
      for (const fb of feedbackList) {
        if (fb.itemId && fb.feedbackType) {
          insert.run(userId, fb.itemId, fb.feedbackType)
          inserted++
        }
      }
      
      return { success: true, count: inserted }
    } catch (error) {
      console.error('Feedback error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })
  
  // Train model (apply feedback to EMA scores)
  fastify.post('/outfit-trainer/train', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    try {
      // Get all pending feedback
      const feedback = db.prepare(`
        SELECT * FROM outfit_feedback 
        WHERE user_id = ? AND trained = 0
        ORDER BY created_at
      `).all(userId)
      
      if (feedback.length < 3) {
        return { error: 'Need at least 3 feedback items to train', pending: feedback.length }
      }
      
      // Signal weights
      const weights = {
        thumbs_up: 0.6,
        thumbs_down: -0.8,
        neutral: 0,
        exclude: -0.5
      }
      
      let updated = 0
      const updateItem = db.prepare(`
        UPDATE clothing_items SET ema_score = ?, ema_count = ema_count + 1
        WHERE id = ?
      `)
      
      // Process each feedback
      for (const fb of feedback) {
        const item = db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(fb.item_id)
        if (!item) continue
        
        const weight = weights[fb.feedback_type] || 0
        const newScore = updateItemScore(item, weight)
        
        updateItem.run(newScore.ema_score, fb.item_id)
        updated++
      }
      
      // Mark feedback as trained
      db.prepare(`
        UPDATE outfit_feedback SET trained = 1 WHERE user_id = ?
      `).run(userId)
      
      // Record training session
      const sessionCount = db.prepare(`
        SELECT COUNT(*) as count FROM training_sessions WHERE user_id = ?
      `).get(userId)
      
      const newVersion = `v1.${(sessionCount?.count || 0) + 1}`
      
      db.prepare(`
        INSERT INTO training_sessions (user_id, feedback_count, model_version)
        VALUES (?, ?, ?)
      `).run(userId, updated, newVersion)
      
      return { 
        success: true, 
        itemsUpdated: updated,
        newModelVersion: newVersion
      }
    } catch (error) {
      console.error('Train error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })
  
  // Get stats
  fastify.get('/outfit-trainer/stats', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    try {
      const pending = db.prepare(`
        SELECT COUNT(*) as count FROM outfit_feedback 
        WHERE user_id = ? AND (trained = 0 OR trained IS NULL)
      `).get(userId)
      
      const training = db.prepare(`
        SELECT COUNT(*) as count, MAX(model_version) as lastVersion
        FROM training_sessions WHERE user_id = ?
      `).get(userId)
      
      return {
        pendingFeedback: pending?.count || 0,
        trainingCount: training?.count || 0,
        modelVersion: training?.lastVersion || 'v1.0 (EMA)'
      }
    } catch (error) {
      console.error('Stats error:', error)
      return { pendingFeedback: 0, trainingCount: 0, modelVersion: 'v1.0 (EMA)' }
    }
  })
}
