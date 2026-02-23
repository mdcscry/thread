import db from '../db/client.js'
import { authenticateApiKey } from '../middleware/auth.js'
import { updateItemScore } from '../services/PreferenceService.js'
import { trainModel as nnTrainModel, blendedScoreOutfit, getTrainingStats, getUserNnWeight, clearModelCache } from '../services/TrainerService.js'

export default async function outfitTrainerRoutes(fastify, opts) {
  
  // Generate outfits with category filters
  fastify.post('/outfit-trainer/generate', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { categories, occasion, count = 5 } = request.body || {}

    try {
      // Get excluded items
      const excludedItems = db.prepare(`
        SELECT item_id FROM item_exclusions WHERE user_id = ?
      `).all(userId)
      const excludedIds = new Set(excludedItems.map(e => e.item_id))

      // Build query based on category filters
      let query = `
        SELECT * FROM clothing_items
        WHERE user_id = ?
      `
      const params = [userId]

      // Filter out excluded items
      if (excludedIds.size > 0) {
        query += ` AND id NOT IN (${Array.from(excludedIds).join(',')})`
      }

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
      
      // Build context for scoring
      const context = {
        occasion: occasion || 'casual',
        season: getCurrentSeason(),
        timeOfDay: getCurrentTimeOfDay(),
      }

      // Generate more candidates than needed, then rank by blended score
      const candidateCount = Math.min(count * 3, 30)
      const candidates = []
      for (let i = 0; i < candidateCount; i++) {
        const outfit = {
          id: i + 1,
          items: {
            top: tops[i % tops.length] || null,
            bottom: bottoms[(i * 3 + 1) % bottoms.length] || null,
            footwear: footwear[(i * 7 + 2) % footwear.length] || null,
            accessory: accessories[(i * 5 + 3) % accessories.length] || null
          }
        }
        // Filter out null items
        outfit.items = Object.fromEntries(Object.entries(outfit.items).filter(([_, v]) => v))
        if (Object.keys(outfit.items).length > 0) {
          candidates.push(outfit)
        }
      }

      // Score each candidate with EMA + NN blend
      const scored = await Promise.all(
        candidates.map(async (outfit) => {
          const itemList = Object.values(outfit.items)
          try {
            const scoring = await blendedScoreOutfit(userId, itemList, context)
            return { ...outfit, ...scoring }
          } catch (e) {
            // Fallback: pure EMA average
            const emaScore = itemList.reduce((sum, item) => sum + (item.ema_score ?? 0.5), 0) / itemList.length
            return { ...outfit, finalScore: emaScore, emaScore, nnScore: null, nnWeight: 0, scoringMethod: 'ema' }
          }
        })
      )

      // Sort by finalScore, return top N
      scored.sort((a, b) => b.finalScore - a.finalScore)
      const outfits = scored.slice(0, count)

      return { outfits }
    } catch (error) {
      console.error('Generate error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })
  
  // Submit feedback
  fastify.post('/outfit-trainer/feedback', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { items, outfitId, context } = request.body

    if (!Array.isArray(items)) {
      return reply.code(400).send({ error: 'Expected items array' })
    }

    try {
      // Map feedback types to values
      const feedbackValues = {
        thumbs_up: 1.0,
        thumbs_down: -1.0
      }

      const insert = db.prepare(`
        INSERT INTO outfit_feedback (
          user_id, item_id, outfit_id, feedback_type, feedback_value,
          context_occasion, context_season, context_time_of_day
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let inserted = 0
      for (const fb of items) {
        if (fb.itemId && fb.feedback) {
          const feedbackValue = feedbackValues[fb.feedback]
          if (feedbackValue !== undefined) {
            insert.run(
              userId,
              fb.itemId,
              outfitId || null,
              fb.feedback,
              feedbackValue,
              context?.occasion || null,
              context?.season || null,
              context?.timeOfDay || null
            )

            // Immediately update EMA score
            const item = db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(fb.itemId)
            if (item) {
              const weight = fb.feedback === 'thumbs_up' ? 0.6 : -0.8
              const newScore = updateItemScore(item, weight)
              db.prepare(`
                UPDATE clothing_items SET ema_score = ?, ema_count = ema_count + 1
                WHERE id = ?
              `).run(newScore.ema_score, fb.itemId)
            }

            inserted++
          }
        }
      }

      // Get updated pending count
      const pending = db.prepare(`
        SELECT COUNT(*) as count FROM outfit_feedback
        WHERE user_id = ? AND (trained = 0 OR trained IS NULL)
      `).get(userId)

      return { saved: true, count: inserted, pendingCount: pending?.count || 0 }
    } catch (error) {
      console.error('Feedback error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })
  
  // Exclude an item from outfit generation
  fastify.post('/outfit-trainer/exclude', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { itemId, reason } = request.body

    if (!itemId) {
      return reply.code(400).send({ error: 'itemId required' })
    }

    try {
      db.prepare(`
        INSERT INTO item_exclusions (user_id, item_id, reason)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, item_id) DO NOTHING
      `).run(userId, itemId, reason || null)

      return { excluded: true }
    } catch (error) {
      console.error('Exclude error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })

  // Remove item from exclusions
  fastify.delete('/outfit-trainer/exclude/:itemId', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { itemId } = request.params

    try {
      db.prepare(`
        DELETE FROM item_exclusions WHERE user_id = ? AND item_id = ?
      `).run(userId, itemId)

      return { restored: true }
    } catch (error) {
      console.error('Restore error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })

  // Train neural network model
  fastify.post('/outfit-trainer/train', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user

    try {
      // Train the NN (handles sample validation, feature computation, training, saving)
      const result = await nnTrainModel(userId)

      if (!result.success) {
        return { error: result.error, pending: result.samples }
      }

      // Mark all feedback as trained
      db.prepare(`
        UPDATE outfit_feedback SET trained = 1 WHERE user_id = ? AND (trained = 0 OR trained IS NULL)
      `).run(userId)

      // Clear model cache so next scoring picks up new model
      clearModelCache(userId)

      return {
        success: true,
        samples: result.samples,
        validationLoss: result.validationLoss,
        validationMAE: result.validationMAE,
        epochs: result.epochs,
        trainingTimeMs: result.trainingTimeMs,
        nnWeight: result.nnWeight,
        paramCount: result.paramCount,
      }
    } catch (error) {
      console.error('Train error:', error)
      return reply.code(500).send({ error: error.message })
    }
  })
  
  // Get stats (includes NN training info)
  fastify.get('/outfit-trainer/stats', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user

    try {
      const pending = db.prepare(`
        SELECT COUNT(*) as count FROM outfit_feedback
        WHERE user_id = ? AND (trained = 0 OR trained IS NULL)
      `).get(userId)

      const excluded = db.prepare(`
        SELECT COUNT(*) as count FROM item_exclusions WHERE user_id = ?
      `).get(userId)

      // Get NN training stats
      const nnStats = getTrainingStats(userId)

      return {
        pendingFeedback: pending?.count || 0,
        totalSamples: nnStats.totalSamples,
        trainingRuns: nnStats.trainingRuns,
        lastTrained: nnStats.lastTrained,
        validationLoss: nnStats.validationLoss,
        validationMAE: nnStats.validationMAE,
        nnWeight: nnStats.nnWeight,
        paramCount: nnStats.paramCount,
        excludedItems: excluded?.count || 0,
      }
    } catch (error) {
      console.error('Stats error:', error)
      return { pendingFeedback: 0, totalSamples: 0, trainingRuns: 0, nnWeight: 0, excludedItems: 0 }
    }
  })
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'fall'
  return 'winter'
}

function getCurrentTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
