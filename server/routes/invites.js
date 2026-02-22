// Invite routes
// Feature 13: Multi-user invite flow

import db from '../db/client.js'
import { authenticateApiKey } from '../middleware/auth.js'
import crypto from 'crypto'

// Generate a secure random token
function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

// Get current timestamp
function now() {
  return new Date().toISOString()
}

// Add days to date
function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result.toISOString()
}

export default async function inviteRoutes(fastify, opts) {
  
  // POST /api/invites - Create a new invite
  fastify.post('/invites', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { email, permissions } = request.body
    
    // Generate token
    const token = generateToken()
    
    // Default permissions
    const invitePermissions = permissions || ['view']
    
    // Set expiry (7 days)
    const expiresAt = addDays(new Date(), 7)
    
    // Create invite
    const result = db.prepare(`
      INSERT INTO invites (token, inviter_user_id, invitee_email, permissions, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, userId, email || null, JSON.stringify(invitePermissions), expiresAt, now())
    
    // Build the invite URL (would be configurable in production)
    const inviteUrl = `https://localhost:3000/invite/${token}`
    
    return {
      id: result.lastInsertRowid,
      token,
      invite_url: inviteUrl,
      permissions: invitePermissions,
      expires_at: expiresAt,
      status: 'pending'
    }
  })
  
  // GET /api/invites - List all invites for current user
  fastify.get('/invites', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    const invites = db.prepare(`
      SELECT id, token, invitee_email, permissions, status, expires_at, accepted_at, created_at
      FROM invites
      WHERE inviter_user_id = ?
      ORDER BY created_at DESC
    `).all(userId)
    
    return invites.map(invite => ({
      ...invite,
      permissions: JSON.parse(invite.permissions || '["view"]'),
      invite_url: `https://localhost:3000/invite/${invite.token}`
    }))
  })
  
  // GET /api/invites/:token - Public endpoint to view invite (no auth required)
  fastify.get('/invites/:token', async (request, reply) => {
    const { token } = request.params
    
    const invite = db.prepare(`
      SELECT id, token, inviter_user_id, invitee_email, permissions, status, expires_at, created_at
      FROM invites
      WHERE token = ?
    `).get(token)
    
    if (!invite) {
      return reply.code(404).send({ error: 'Invite not found' })
    }
    
    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return reply.code(410).send({ error: 'Invite has expired' })
    }
    
    // Check if already accepted
    if (invite.status === 'accepted') {
      return reply.code(410).send({ error: 'Invite has already been used' })
    }
    
    // Get inviter name
    const inviter = db.prepare('SELECT name FROM users WHERE id = ?').get(invite.inviter_user_id)
    
    return {
      id: invite.id,
      inviter_name: inviter?.name || 'Someone',
      invitee_email: invite.invitee_email,
      permissions: JSON.parse(invite.permissions || '["view"]'),
      expires_at: invite.expires_at,
      status: invite.status
    }
  })
  
  // POST /api/invites/:token/accept - Accept an invite
  fastify.post('/invites/:token/accept', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { token } = request.params
    const { userId } = request.user
    
    const invite = db.prepare('SELECT * FROM invites WHERE token = ?').get(token)
    
    if (!invite) {
      return reply.code(404).send({ error: 'Invite not found' })
    }
    
    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return reply.code(410).send({ error: 'Invite has expired' })
    }
    
    // Check if already accepted
    if (invite.status === 'accepted') {
      return reply.code(410).send({ error: 'Invite has already been used' })
    }
    
    // Check email if specified
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (invite.invitee_email && user.email !== invite.invitee_email) {
      // Allow if no email was specified on invite, otherwise check
      return reply.code(403).send({ error: 'This invite was sent to a different email' })
    }
    
    // Create wardrobe_share
    const existingShare = db.prepare(`
      SELECT id FROM wardrobe_shares 
      WHERE owner_user_id = ? AND shared_with_user_id = ?
    `).get(invite.inviter_user_id, userId)
    
    if (!existingShare) {
      db.prepare(`
        INSERT INTO wardrobe_shares (owner_user_id, shared_with_user_id, permissions, created_at)
        VALUES (?, ?, ?, ?)
      `).run(invite.inviter_user_id, userId, invite.permissions, now())
    }
    
    // Update invite status
    db.prepare(`
      UPDATE invites 
      SET status = 'accepted', accepted_at = ?
      WHERE token = ?
    `).run(now(), token)
    
    // Get inviter info
    const inviter = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(invite.inviter_user_id)
    
    return {
      message: 'Invite accepted! You now have access to this wardrobe.',
      shared_with: inviter,
      permissions: JSON.parse(invite.permissions || '["view"]')
    }
  })
  
  // GET /api/wardrobe-shares - List all shared wardrobes
  fastify.get('/wardrobe-shares', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    
    // Get wardrobes shared with me
    const sharedWithMe = db.prepare(`
      SELECT ws.*, u.name as owner_name, u.email as owner_email
      FROM wardrobe_shares ws
      JOIN users u ON ws.owner_user_id = u.id
      WHERE ws.shared_with_user_id = ?
    `).all(userId)
    
    // Get my wardrobes shared with others
    const sharedByMe = db.prepare(`
      SELECT ws.*, u.name as shared_with_name, u.email as shared_with_email
      FROM wardrobe_shares ws
      JOIN users u ON ws.shared_with_user_id = u.id
      WHERE ws.owner_user_id = ?
    `).all(userId)
    
    return {
      shared_with_me: sharedWithMe.map(s => ({
        ...s,
        permissions: JSON.parse(s.permissions || '["view"]')
      })),
      shared_by_me: sharedByMe.map(s => ({
        ...s,
        permissions: JSON.parse(s.permissions || '["view"]')
      }))
    }
  })
}
