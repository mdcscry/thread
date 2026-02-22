import { authenticateApiKey, optionalAuth } from '../middleware/auth.js'
import { generateQRCodeUrl } from '../services/QRService.js'
import { loginUser } from '../services/AuthService.js'
import db from '../db/client.js'
import crypto from 'crypto'
import bcrypt from 'bcrypt'

export default async function settingsRoutes(fastify, opts) {
  // Login with email/password (for phone)
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body
    
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required' })
    }
    
    const result = await loginUser(email, password)
    
    if (result.error) {
      return reply.code(401).send(result)
    }
    
    return result
  })

  // Get QR code for phone connection
  fastify.get('/settings/qr', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const port = parseInt(process.env.PORT || '3000')
    return await generateQRCodeUrl(port)
  })

  // Get current user info
  fastify.get('/settings/me', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const user = db.prepare('SELECT id, name, email, avatar_url, preferences, created_at FROM users WHERE id = ?').get(userId)
    return user
  })

  // Update user preferences
  fastify.patch('/settings/preferences', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { preferences } = request.body

    const current = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId)
    const merged = { ...JSON.parse(current.preferences || '{}'), ...preferences }

    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(merged), userId)

    return { preferences: merged }
  })

  // List API keys
  fastify.get('/settings/api-keys', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    return db.prepare(`
      SELECT id, label, permissions, last_used, created_at 
      FROM api_keys WHERE user_id = ?
    `).all(userId)
  })

  // Create API key
  fastify.post('/settings/api-keys', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { label, permissions = [] } = request.body

    const keyHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex')
    const key = `thread_sk_${keyHash}`

    db.prepare(`
      INSERT INTO api_keys (user_id, key_hash, label, permissions)
      VALUES (?, ?, ?, ?)
    `).run(userId, keyHash, label, JSON.stringify(permissions))

    return { 
      api_key: key,
      label,
      permissions,
      message: 'This is the only time you\'ll see this key!'
    }
  })

  // Delete API key
  fastify.delete('/settings/api-keys/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(id, userId)
    return { success: true }
  })

  // List webhooks
  fastify.get('/settings/webhooks', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    return db.prepare(`
      SELECT id, url, events, active, created_at 
      FROM webhooks WHERE user_id = ?
    `).all(userId)
  })

  // Create webhook
  fastify.post('/settings/webhooks', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { url, events = [] } = request.body

    const secret = crypto.randomBytes(20).toString('hex')

    const result = db.prepare(`
      INSERT INTO webhooks (user_id, url, events, secret)
      VALUES (?, ?, ?, ?)
    `).run(userId, url, JSON.stringify(events), secret)

    return {
      id: result.lastInsertRowid,
      url,
      events,
      secret,
      message: 'Save this secret — it won\'t be shown again!'
    }
  })

  // Delete webhook
  fastify.delete('/settings/webhooks/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params

    db.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?').run(id, userId)
    return { success: true }
  })

  // Toggle webhook
  fastify.patch('/settings/webhooks/:id', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { id } = request.params
    const { active } = request.body

    db.prepare('UPDATE webhooks SET active = ? WHERE id = ? AND user_id = ?').run(active ? 1 : 0, id, userId)
    return { success: true }
  })

  // Get wardrobe stats
  fastify.get('/settings/stats', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user

    const totalItems = db.prepare('SELECT COUNT(*) as count FROM clothing_items WHERE user_id = ? AND is_active = 1').get(userId)?.count || 0
    const totalOutfits = db.prepare('SELECT COUNT(*) as count FROM outfits WHERE user_id = ?').get(userId)?.count || 0
    const flaggedItems = db.prepare('SELECT COUNT(*) as count FROM clothing_items WHERE user_id = ? AND ai_flagged = 1').get(userId)?.count || 0
    const lovedItems = db.prepare('SELECT COUNT(*) as count FROM clothing_items WHERE user_id = ? AND is_loved = 1').get(userId)?.count || 0
    const inLaundry = db.prepare('SELECT COUNT(*) as count FROM clothing_items WHERE user_id = ? AND in_laundry = 1').get(userId)?.count || 0
    const stored = db.prepare('SELECT COUNT(*) as count FROM clothing_items WHERE user_id = ? AND storage_status = "stored"').get(userId)?.count || 0

    return {
      totalItems,
      totalOutfits,
      flaggedItems,
      lovedItems,
      inLaundry,
      stored
    }
  })
}
