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

  // GDPR: Export all user data
  fastify.get('/user/export', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(userId)
    const items = db.prepare('SELECT * FROM clothing_items WHERE user_id = ? AND is_active = 1').all(userId)
    const outfits = db.prepare('SELECT * FROM outfits WHERE user_id = ?').all(userId)
    const preferences = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').all(userId)
    const feedback = db.prepare('SELECT * FROM preference_events WHERE user_id = ?').all(userId)
    const invites = db.prepare('SELECT * FROM invites WHERE inviter_id = ? OR invitee_id = ?').all(userId, userId)
    const wardrobeShares = db.prepare('SELECT * FROM wardrobe_shares WHERE owner_id = ? OR shared_with_id = ?').all(userId, userId)
    
    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at
      },
      wardrobe: {
        items: items.map(i => ({ ...i, image_data: i.image_data ? '[BINARY DATA]' : null })),
        count: items.length
      },
      outfits: {
        items: outfits,
        count: outfits.length
      },
      preferences: {
        items: preferences,
        count: preferences.length
      },
      feedback: {
        items: feedback,
        count: feedback.length
      },
      social: {
        invites: invites,
        wardrobeShares: wardrobeShares
      }
    }
  })

  // GDPR: Delete account and all data
  fastify.delete('/user/account', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    // Delete in order due to foreign keys
    db.prepare('DELETE FROM preference_events WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM user_preferences WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM wardrobe_shares WHERE owner_id = ? OR shared_with_id = ?').run(userId, userId)
    db.prepare('DELETE FROM invites WHERE inviter_id = ? OR invitee_id = ?').run(userId, userId)
    db.prepare('DELETE FROM outfit_items WHERE outfit_id IN (SELECT id FROM outfits WHERE user_id = ?)').run(userId)
    db.prepare('DELETE FROM outfits WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM clothing_items WHERE user_id = ?').run(userId)
    // Billing data
    db.prepare('DELETE FROM billing_events WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM entitlements WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    
    return { deleted: true, userId }
  })
}
