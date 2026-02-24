import db from '../db/client.js'
import { authenticateApiKey } from '../middleware/auth.js'
import { toggleLaundry, toggleStorage } from '../services/PreferenceService.js'

// Items routes
export default async function itemsRoutes(fastify, opts) {
  // List all items (with primary image from item_images)
  fastify.get('/items', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { category, flagged, loved, search, inLaundry, stored, offset, limit } = request.query

    let query = db.prepare('SELECT * FROM clothing_items WHERE user_id = ? AND is_active = 1')
    let items = query.all(userId)

    if (category) {
      items = items.filter(i => i.category === category)
    }
    if (flagged === 'true') {
      items = items.filter(i => i.ai_flagged)
    }
    if (loved === 'true') {
      items = items.filter(i => i.is_loved)
    }
    if (inLaundry === 'true') {
      items = items.filter(i => i.in_laundry)
    }
    if (inLaundry === 'false') {
      items = items.filter(i => !i.in_laundry)
    }
    if (stored === 'true') {
      items = items.filter(i => i.storage_status === 'stored')
    }
    if (search) {
      const s = search.toLowerCase()
      items = items.filter(i =>
        (i.name && i.name.toLowerCase().includes(s)) ||
        (i.primary_color && i.primary_color.toLowerCase().includes(s)) ||
        (i.material && i.material.toLowerCase().includes(s))
      )
    }

    // Apply pagination
    if (offset) {
      items = items.slice(parseInt(offset))
    }
    if (limit) {
      items = items.slice(0, parseInt(limit))
    }

    // Attach primary image to each item and safely parse JSON fields
    return items.map(item => {
      const primaryImage = db.prepare(`
        SELECT * FROM item_images
        WHERE item_id = ? AND is_primary = 1
      `).get(item.id)

      // Safely parse JSON fields
      let parsedColors = []
      let parsedOccasion = []
      let parsedSeason = []
      let parsedStyleTags = []
      try {
        parsedColors = item.colors ? JSON.parse(item.colors) : []
      } catch (e) { parsedColors = [] }
      try {
        parsedOccasion = item.occasion ? JSON.parse(item.occasion) : []
      } catch (e) { parsedOccasion = [] }
      try {
        parsedSeason = item.season ? JSON.parse(item.season) : []
      } catch (e) { parsedSeason = [] }
      try {
        parsedStyleTags = item.style_tags ? JSON.parse(item.style_tags) : []
      } catch (e) { parsedStyleTags = [] }

      return {
        ...item,
        // Null guards for commonly null fields
        category: item.category || null,
        primary_color: item.primary_color || null,
        colors: parsedColors,
        occasion: parsedOccasion,
        season: parsedSeason,
        style_tags: parsedStyleTags,
        pattern: item.pattern || null,
        material: item.material || null,
        subcategory: item.subcategory || null,
        primary_image: primaryImage || null
      }
    })
  })

  // Get flagged items (MUST be before /items/:id to avoid route collision)
  fastify.get('/items/flagged', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user

    return db.prepare(`
      SELECT i.*, r.question, r.field_name as refine_field
      FROM clothing_items i
      LEFT JOIN refinement_prompts r ON i.id = r.item_id AND r.status = 'pending'
      WHERE i.user_id = ? AND i.ai_flagged = 1 AND i.user_reviewed = 0
    `).all(userId)
  })

  // Get laundry items (MUST be before /items/:id to avoid route collision)
  fastify.get('/items/laundry', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user

    return db.prepare(`
      SELECT * FROM clothing_items 
      WHERE user_id = ? AND in_laundry = 1 AND is_active = 1
    `).all(userId)
  })

  // Get stored items (MUST be before /items/:id to avoid route collision)
  fastify.get('/items/stored', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user

    return db.prepare(`
      SELECT * FROM clothing_items 
      WHERE user_id = ? AND storage_status = 'stored' AND is_active = 1
    `).all(userId)
  })

  // Get single item (with images from item_images table)
  fastify.get('/items/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    const item = db.prepare('SELECT * FROM clothing_items WHERE id = ? AND user_id = ?').get(id, userId)
    
    if (!item) {
      return reply.code(404).send({ error: 'Item not found' })
    }

    // Get images
    const images = db.prepare(`
      SELECT * FROM item_images 
      WHERE item_id = ? 
      ORDER BY is_primary DESC, sort_order ASC
    `).all(id)

    return {
      ...item,
      images
    }
  })

  // Update item
  fastify.patch('/items/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params
    const updates = request.body

    // Check if item exists first
    const existing = db.prepare('SELECT id FROM clothing_items WHERE id = ? AND user_id = ?').get(id, userId)
    if (!existing) {
      return reply.code(404).send({ error: 'Item not found' })
    }

    // Build dynamic update
    const fields = Object.keys(updates)
    if (fields.length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => {
      if (typeof updates[f] === 'object') {
        return JSON.stringify(updates[f])
      }
      return updates[f]
    })

    db.prepare(`UPDATE clothing_items SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
      .run(...values, id, userId)

    return db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(id)
  })

  // Toggle loved
  fastify.post('/items/:id/love', { 
    preHandler: [authenticateApiKey]
  }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    const item = db.prepare('SELECT is_loved FROM clothing_items WHERE id = ? AND user_id = ?').get(id, userId)
    
    if (!item) {
      return reply.code(404).send({ error: 'Item not found' })
    }

    const newValue = item.is_loved ? 0 : 1
    db.prepare('UPDATE clothing_items SET is_loved = ? WHERE id = ?').run(newValue, id)

    return { is_loved: newValue }
  })

  // Delete (soft) item
  fastify.delete('/items/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    // Check if item exists first
    const existing = db.prepare('SELECT id FROM clothing_items WHERE id = ? AND user_id = ?').get(id, userId)
    if (!existing) {
      return reply.code(404).send({ error: 'Item not found' })
    }

    db.prepare('UPDATE clothing_items SET is_active = 0 WHERE id = ? AND user_id = ?').run(id, userId)

    return { success: true }
  })

  // Answer refinement prompt
  fastify.post('/items/:id/refine', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params
    const { answer, field } = request.body

    // Update the prompt
    db.prepare(`
      UPDATE refinement_prompts 
      SET status = 'answered', answer = ?, answered_at = CURRENT_TIMESTAMP
      WHERE item_id = ? AND user_id = ? AND field_name = ?
    `).run(answer, id, userId, field)

    // Update the item
    db.prepare(`UPDATE clothing_items SET ${field} = ? WHERE id = ?`).run(answer, id)

    // Check if all prompts answered
    const pending = db.prepare(`
      SELECT COUNT(*) as count FROM refinement_prompts 
      WHERE item_id = ? AND status = 'pending'
    `).get(id)

    if (pending.count === 0) {
      db.prepare('UPDATE clothing_items SET ai_flagged = 0, user_reviewed = 1 WHERE id = ?').run(id)
    }

    return { success: true }
  })

  // Toggle laundry status
  fastify.post('/items/:id/laundry', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    const item = db.prepare('SELECT * FROM clothing_items WHERE id = ? AND user_id = ?').get(id, userId)
    if (!item) {
      return reply.code(404).send({ error: 'Item not found' })
    }

    const inLaundry = toggleLaundry(parseInt(id))
    return { in_laundry: inLaundry }
  })

  // Toggle storage status (active <-> stored)
  fastify.post('/items/:id/storage', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params
    const { note } = request.body || {}

    const item = db.prepare('SELECT * FROM clothing_items WHERE id = ? AND user_id = ?').get(id, userId)
    if (!item) {
      return reply.code(404).send({ error: 'Item not found' })
    }

    const newStatus = toggleStorage(parseInt(id))
    if (note) {
      db.prepare('UPDATE clothing_items SET storage_note = ? WHERE id = ?').run(note, id)
    }

    return { storage_status: newStatus }
  })
}
