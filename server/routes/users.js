import { authenticateApiKey } from '../middleware/auth.js'
import db from '../db/client.js'

export default async function usersRoutes(fastify, opts) {
  // List users
  fastify.get('/users', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    try {
      return db.prepare('SELECT id, name, email, avatar_url, gender, preferences, created_at FROM users').all()
    } catch(e) {
      // Fallback if gender column doesn't exist
      return db.prepare('SELECT id, name, email, avatar_url, preferences, created_at FROM users').all()
    }
  })

  // Get single user
  fastify.get('/users/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { id } = request.params
    let user
    try {
      user = db.prepare('SELECT id, name, email, avatar_url, gender, preferences, created_at FROM users WHERE id = ?').get(id)
    } catch(e) {
      user = db.prepare('SELECT id, name, email, avatar_url, preferences, created_at FROM users WHERE id = ?').get(id)
    }
    
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }
    
    // Get stats
    const stats = {
      totalItems: db.prepare('SELECT COUNT(*) as count FROM clothing_items WHERE user_id = ? AND is_active = 1').get(id)?.count || 0,
      totalOutfits: db.prepare('SELECT COUNT(*) as count FROM outfits WHERE user_id = ?').get(id)?.count || 0,
      lovedItems: db.prepare('SELECT COUNT(*) as count FROM clothing_items WHERE user_id = ? AND is_loved = 1').get(id)?.count || 0,
      feedbackCount: db.prepare('SELECT COUNT(*) as count FROM preference_events WHERE user_id = ?').get(id)?.count || 0
    }
    
    return { ...user, stats }
  })

  // Update user
  fastify.patch('/users/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params
    const { name, avatar_url, gender, preferences } = request.body
    
    if (name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
    }
    if (avatar_url) {
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, id)
    }
    if (gender) {
      try {
        db.prepare('UPDATE users SET gender = ? WHERE id = ?').run(gender, id)
      } catch(e) {
        // Column doesn't exist, ignore
      }
    }
    if (preferences) {
      const current = db.prepare('SELECT preferences FROM users WHERE id = ?').get(id)
      const merged = { ...JSON.parse(current.preferences || '{}'), ...preferences }
      db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(merged), id)
    }
    
    try {
      return db.prepare('SELECT id, name, email, avatar_url, gender, preferences FROM users WHERE id = ?').get(id)
    } catch(e) {
      return db.prepare('SELECT id, name, email, avatar_url, preferences FROM users WHERE id = ?').get(id)
    }
  })
}
