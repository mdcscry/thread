import { prepare as db } from '../db/client.js'
import crypto from 'crypto'

// Simple API key authentication
export async function authenticateApiKey(request, reply) {
  const authHeader = request.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid authorization header' })
  }

  const apiKey = authHeader.slice(7)
  
  // Look up user by API key
  const user = db('SELECT * FROM users WHERE api_key = ?').get(apiKey)
  
  if (!user) {
    return reply.code(401).send({ error: 'Invalid API key' })
  }

  // Update last used
  try {
    db('UPDATE users SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
  } catch(e) {}

  request.user = {
    userId: user.id,
    id: user.id,
    name: user.name,
    email: user.email
  }
}

// Optional auth - doesn't fail if no key
export async function optionalAuth(request, reply) {
  const authHeader = request.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.user = { id: 1, name: 'Guest' } // Default to first user
    return
  }

  const apiKey = authHeader.slice(7)
  const user = db('SELECT * FROM users WHERE api_key = ?').get(apiKey)
  
  if (user) {
    request.user = {
      userId: user.id,
      id: user.id,
      name: user.name,
      email: user.email
    }
  } else {
    request.user = { userId: 1, id: 1, name: 'Guest' }
  }
}
