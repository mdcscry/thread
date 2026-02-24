import { prepare as db } from '../db/client.js'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { EmailService } from '../services/EmailService.js'

// Rate limiting (simple in-memory)
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 5

function checkRateLimit(ip) {
  const now = Date.now()
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
  
  if (now > record.resetAt) {
    record.count = 1
    record.resetAt = now + RATE_LIMIT_WINDOW_MS
  } else {
    record.count++
  }
  
  rateLimitMap.set(ip, record)
  return record.count <= RATE_LIMIT_MAX
}

export default async function authRoutes(fastify, options) {
  // POST /auth/register
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string', minLength: 1 },
          'cf-turnstile-response': { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, firstName, 'cf-turnstile-response': turnstileToken } = request.body
    
    // Rate limit check
    const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown'
    if (!checkRateLimit(clientIp)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.' })
    }
    
    // Verify Turnstile token
    if (turnstileToken) {
      const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
      if (turnstileSecret) {
        try {
          const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: turnstileSecret,
              response: turnstileToken,
              remoteip: clientIp
            })
          })
          const verifyData = await verifyRes.json()
          if (!verifyData.success) {
            return reply.code(400).send({ error: 'Bot verification failed. Please try again.' })
          }
        } catch (e) {
          console.error('Turnstile verification error:', e)
          // Continue if Turnstile verification fails (don't block signups)
        }
      }
    }
    
    // Check if email exists
    const existing = db('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' })
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)
    
    // Generate API key
    const apiKey = 'thread_sk_' + crypto.randomBytes(20).toString('hex')
    
    // Insert user
    const result = db(`
      INSERT INTO users (email, password, name, api_key, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(email.toLowerCase(), passwordHash, firstName, apiKey)
    
    return reply.code(201).send({
      userId: result.lastInsertRowid,
      email: email.toLowerCase(),
      firstName,
      apiKey
    })
  })

  // POST /auth/login
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body
    
    // Rate limit check
    const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown'
    if (!checkRateLimit(clientIp)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.' })
    }
    
    // Find user
    const user = db('SELECT * FROM users WHERE email = ?').get(email.toLowerCase())
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }
    
    // Verify password - support both bcrypt and plain text (backward compat)
    let validPassword = false
    if (user.password && user.password.startsWith('$2')) {
      // bcrypt hash
      validPassword = await bcrypt.compare(password, user.password)
    } else if (user.password) {
      // Plain text (legacy)
      validPassword = (password === user.password)
    }
    if (!validPassword) {
      return reply.code(401).send({ error: 'Invalid email or password' })
    }
    
    // Generate new API key (rotate on login)
    const apiKey = 'thread_sk_' + crypto.randomBytes(20).toString('hex')
    db('UPDATE users SET api_key = ?, last_used = datetime(\'now\') WHERE id = ?').run(apiKey, user.id)
    
    return reply.send({
      userId: user.id,
      email: user.email,
      name: user.name,
      apiKey
    })
  })

  // POST /auth/forgot-password
  fastify.post('/auth/forgot-password', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    const { email } = request.body
    
    // Rate limit check
    const clientIp = request.ip || request.headers['x-forwarded-for'] || 'unknown'
    if (!checkRateLimit(clientIp)) {
      return reply.code(429).send({ error: 'Too many requests. Please try again later.' })
    }
    
    // Always return 200 — never reveal whether email exists
    const user = db('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())
    if (!user) {
      return reply.send({ sent: true })
    }
    
    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    
    db(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, token, expires.toISOString())
    
    // Send reset email
    const resetUrl = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`
    await EmailService.sendPasswordReset({ to: email, resetUrl })
    
    return reply.send({ sent: true })
  })

  // POST /auth/reset-password
  fastify.post('/auth/reset-password', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', minLength: 64, maxLength: 64 },
          password: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    const { token, password } = request.body
    
    const record = db(`
      SELECT user_id FROM password_reset_tokens
      WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(token)
    
    if (!record) {
      return reply.status(400).send({ error: 'Invalid or expired reset link.' })
    }
    
    const hashed = await bcrypt.hash(password, 10)
    db('UPDATE users SET password = ? WHERE id = ?').run(hashed, record.user_id)
    db('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token)
    
    return reply.send({ reset: true })
  })
}
