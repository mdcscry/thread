import { prepare as db } from '../db/client.js'

// Rate limits by plan
const LIMITS = {
  free: {
    gemini_vision: 10,      // 10 image analyses/day
    outfit_generate: 50,    // 50 outfit generations/day
  },
  pro: {
    gemini_vision: 100,
    outfit_generate: 500,
  },
  enterprise: {
    gemini_vision: 1000,
    outfit_generate: 5000,
  }
}

function getToday() {
  return new Date().toISOString().split('T')[0]
}

export const RateLimitService = {
  /**
   * Check if user has remaining quota for an endpoint
   * @returns {Object} { allowed: boolean, limit: number, remaining: number }
   */
  async checkLimit(userId, endpoint) {
    const user = db('SELECT plan FROM users WHERE id = ?').get(userId)
    const plan = user?.plan || 'free'
    const limits = LIMITS[plan]?.[endpoint] || LIMITS.free[endpoint] || 0
    
    const today = getToday()
    const record = db(`
      SELECT count FROM api_usage 
      WHERE user_id = ? AND endpoint = ? AND date = ?
    `).get(userId, endpoint, today)
    
    const used = record?.count || 0
    const remaining = Math.max(0, limits - used)
    
    return {
      allowed: used < limits,
      limit: limits,
      remaining,
      plan
    }
  },
  
  /**
   * Increment usage for an endpoint
   */
  async recordUsage(userId, endpoint) {
    const today = getToday()
    
    // Try to update existing record
    const updated = db(`
      UPDATE api_usage 
      SET count = count + 1 
      WHERE user_id = ? AND endpoint = ? AND date = ?
    `).run(userId, endpoint, today)
    
    // If no record updated, insert new
    if (updated.changes === 0) {
      db(`
        INSERT INTO api_usage (user_id, endpoint, date, count)
        VALUES (?, ?, ?, 1)
      `).run(userId, endpoint, today)
    }
  },
  
  /**
   * Middleware factory for rate limiting
   */
  middleware(endpoint) {
    return async (request, reply) => {
      const userId = request.user?.id
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' })
      }
      
      const { allowed, limit, remaining } = await RateLimitService.checkLimit(userId, endpoint)
      
      if (!allowed) {
        return reply.code(429).send({
          error: 'Rate limit exceeded',
          limit,
          remaining: 0,
          plan: 'free'
        })
      }
      
      // Record usage after successful request
      request.rateLimitEndpoint = endpoint
      request.rateLimitUserId = userId
    }
  },
  
  /**
   * Get user's current usage stats
   */
  async getUsageStats(userId) {
    const user = db('SELECT plan FROM users WHERE id = ?').get(userId)
    const plan = user?.plan || 'free'
    const today = getToday()
    
    const stats = {}
    for (const endpoint of Object.keys(LIMITS.free)) {
      const record = db(`
        SELECT count FROM api_usage 
        WHERE user_id = ? AND endpoint = ? AND date = ?
      `).get(userId, endpoint, today)
      
      stats[endpoint] = {
        used: record?.count || 0,
        limit: LIMITS[plan]?.[endpoint] || LIMITS.free[endpoint],
        remaining: Math.max(0, (LIMITS[plan]?.[endpoint] || LIMITS.free[endpoint]) - (record?.count || 0))
      }
    }
    
    return { plan, ...stats }
  }
}
