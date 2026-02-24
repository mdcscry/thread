import db from '../db/client.js'
import { authenticateApiKey } from '../middleware/auth.js'
import { requireEntitlement } from '../middleware/entitlements.js'
import OutfitEngine from '../services/OutfitEngine.js'
import WeatherService from '../services/WeatherService.js'
import { recordFeedback, markAsWorn } from '../services/PreferenceService.js'
import { RateLimitService } from '../services/RateLimitService.js'

let outfitEngine = null
let weatherService = null

export default async function outfitsRoutes(fastify, opts) {
  // Initialize services
  if (!outfitEngine) {
    weatherService = new WeatherService()
    outfitEngine = new OutfitEngine()
    outfitEngine.setWeatherService(weatherService)
  }

  // Generate outfits (requires outfit entitlement)
  fastify.post('/outfits/generate', { preHandler: [authenticateApiKey, requireEntitlement('outfits')] }, async (request, reply) => {
    const { userId } = request.user
    
    // Check rate limit
    const rateCheck = await RateLimitService.checkLimit(userId, 'outfit_generate')
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        limit: rateCheck.limit,
        remaining: 0,
        plan: rateCheck.plan
      })
    }
    
    const context = request.body

    const result = await outfitEngine.generateOutfits(userId, {
      ...context,
      userId
    })

    if (result.error) {
      return reply.code(400).send({ error: result.error })
    }

    // Save outfits to database
    const insert = db.prepare(`
      INSERT INTO outfits (user_id, item_ids, occasion, event_name, event_date, time_of_day, weather_summary, location, style_intent, chat_prompt, ml_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const savedOutfits = []
    for (const outfit of result.outfits.slice(0, 10)) {
      const itemIds = Object.values(outfit.items).flatMap(v => Array.isArray(v) ? v : (v ? [v.id] : [])).filter(Boolean)
      
      const res = insert.run(
        userId,
        JSON.stringify(itemIds),
        context.occasion || null,
        context.eventName || null,
        context.eventDate || null,
        context.timeOfDay || null,
        JSON.stringify(result.context.weather),
        context.location || null,
        JSON.stringify({ formality: context.formalityTarget }),
        context.chatPrompt || null,
        outfit.ruleScore
      )

      savedOutfits.push({
        ...outfit,
        id: res.lastInsertRowid,
        saved: true
      })
    }

    return {
      outfits: savedOutfits,
      context: result.context,
      totalGenerated: result.totalGenerated,
      rateLimit: {
        remaining: rateCheck.remaining - 1,
        limit: rateCheck.limit
      }
    }
  })

  // List outfits
  fastify.get('/outfits', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { limit = 50, offset = 0, feedback } = request.query

    let query = 'SELECT * FROM outfits WHERE user_id = ?'
    const params = [userId]

    if (feedback !== undefined) {
      query += ' AND feedback = ?'
      params.push(parseInt(feedback))
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), parseInt(offset))

    const outfits = db.prepare(query).all(...params)

    // Expand item_ids to actual items
    return outfits.map(o => ({
      ...o,
      items: JSON.parse(o.item_ids || '[]')
    }))
  })

  // Get single outfit
  fastify.get('/outfits/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    const outfit = db.prepare('SELECT * FROM outfits WHERE id = ? AND user_id = ?').get(id, userId)
    
    if (!outfit) {
      return reply.code(404).send({ error: 'Outfit not found' })
    }

    // Get the items
    const itemIds = JSON.parse(outfit.item_ids || '[]')
    const items = itemIds.map(id => db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(id))

    return {
      ...outfit,
      items
    }
  })

  // Submit feedback (supports signal types per docs/12)
  fastify.post('/outfits/:id/feedback', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params
    const { feedback, signalType, note } = request.body

    const outfit = db.prepare('SELECT * FROM outfits WHERE id = ? AND user_id = ?').get(id, userId)
    
    if (!outfit) {
      return reply.code(404).send({ error: 'Outfit not found' })
    }

    // Map simple feedback to signal types
    const signalMap = {
      1: 'thumbs_up',
      0: 'neutral',
      '-1': 'thumbs_down'
    }
    const type = signalType || signalMap[String(feedback)] || 'thumbs_up'

    // Use new PreferenceService for EMA updates
    await recordFeedback(userId, parseInt(id), type)

    if (note) {
      db.prepare('UPDATE outfits SET feedback_note = ? WHERE id = ?').run(note, id)
    }

    return { success: true, signalType: type }
  })

  // Mark as worn (confirmed - highest value signal)
  fastify.post('/outfits/:id/worn', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    const outfit = db.prepare('SELECT * FROM outfits WHERE id = ? AND user_id = ?').get(id, userId)
    
    if (!outfit) {
      return reply.code(404).send({ error: 'Outfit not found' })
    }

    // Use PreferenceService for confirmed wear (updates EMA + counts)
    await markAsWorn(userId, parseInt(id))

    return { success: true, message: 'Outfit logged as worn' }
  })

  // Generate couple outfits (both people simultaneously)
  fastify.post('/outfits/generate-couple', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { user1Id, user2Id, chatPrompt, occasion, timeOfDay } = request.body
    
    // Generate candidates for each person
    const context = {
      chatPrompt,
      occasion: occasion || 'casual',
      timeOfDay: timeOfDay || 'evening',
      location: 'Boulder, CO',
      numToGenerate: 20
    }
    
    const result1 = await outfitEngine.generateOutfits(user1Id, context)
    const result2 = await outfitEngine.generateOutfits(user2Id, context)
    
    if (result1.error || result2.error) {
      return reply.code(400).send({ error: 'Not enough items in one or both wardrobes' })
    }
    
    // Score all pairs for coordination
    const pairs = []
    for (const o1 of result1.outfits.slice(0, 10)) {
      for (const o2 of result2.outfits.slice(0, 10)) {
        const coordinationScore = scoreCoupleCoordination(o1, o2)
        const individual1 = o1.scores?.final || o1.ruleScore || 0.5
        const individual2 = o2.scores?.final || o2.ruleScore || 0.5
        
        // Balanced: both people's individual scores matter
        const combined = (0.3 * coordinationScore) + 
                         (0.35 * individual1) + 
                         (0.35 * individual2)
        
        pairs.push({ 
          outfit1: o1, 
          outfit2: o2, 
          score: combined,
          coordinationScore,
          individual1,
          individual2
        })
      }
    }
    
    // Sort by combined score
    pairs.sort((a, b) => b.score - a.score)
    
    return {
      pairs: pairs.slice(0, 10),
      context: result1.context
    }
  })
}

// Score couple coordination
function scoreCoupleCoordination(outfit1, outfit2) {
  let score = 0.5
  
  const items1 = Object.values(outfit1.items).flatMap(v => Array.isArray(v) ? v : (v ? [v] : [])).filter(Boolean)
  const items2 = Object.values(outfit2.items).flatMap(v => Array.isArray(v) ? v : (v ? [v] : [])).filter(Boolean)
  
  // Formality match — most important
  const avgFormality1 = items1.reduce((sum, i) => sum + (i.formality || 5), 0) / Math.max(items1.length, 1)
  const avgFormality2 = items2.reduce((sum, i) => sum + (i.formality || 5), 0) / Math.max(items2.length, 1)
  const formalityDiff = Math.abs(avgFormality1 - avgFormality2)
  score -= formalityDiff * 0.08
  
  // Color harmony
  const colors1 = items1.map(i => i.primary_color?.toLowerCase()).filter(Boolean)
  const colors2 = items2.map(i => i.primary_color?.toLowerCase()).filter(Boolean)
  const allColors = [...colors1, ...colors2]
  
  // Neutrals are flexible
  const neutrals = ['black', 'white', 'grey', 'gray', 'navy', 'beige', 'cream']
  const nonNeutrals = allColors.filter(c => !neutrals.includes(c))
  
  if (nonNeutrals.length <= 2) {
    score += 0.2 // Mostly neutrals = coordinated
  }
  
  // Style tag overlap
  const tags1 = items1.flatMap(i => {
    try { return JSON.parse(i.style_tags || '[]') } catch { return [] }
  })
  const tags2 = items2.flatMap(i => {
    try { return JSON.parse(i.style_tags || '[]') } catch { return [] }
  })
  const overlap = tags1.filter(t => tags2.includes(t)).length
  const tagScore = overlap / Math.max(tags1.length, tags2.length, 1)
  score += tagScore * 0.2
  
  return Math.max(0, Math.min(1, score))
}
