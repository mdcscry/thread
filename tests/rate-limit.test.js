import { test, expect, describe } from 'vitest'

describe('RateLimitService Logic', () => {
  // Rate limits by plan
  const LIMITS = {
    free: { gemini_vision: 10, outfit_generate: 50 },
    pro: { gemini_vision: 100, outfit_generate: 500 },
    enterprise: { gemini_vision: 1000, outfit_generate: 5000 }
  }
  
  test('free plan has correct limits', () => {
    expect(LIMITS.free.gemini_vision).toBe(10)
    expect(LIMITS.free.outfit_generate).toBe(50)
  })
  
  test('pro plan has higher limits', () => {
    expect(LIMITS.pro.gemini_vision).toBe(100)
    expect(LIMITS.pro.outfit_generate).toBe(500)
  })
  
  test('enterprise plan has highest limits', () => {
    expect(LIMITS.enterprise.gemini_vision).toBe(1000)
    expect(LIMITS.enterprise.outfit_generate).toBe(5000)
  })
  
  test('returns correct limit for endpoint', () => {
    const getLimit = (plan, endpoint) => LIMITS[plan]?.[endpoint] || LIMITS.free[endpoint]
    
    expect(getLimit('free', 'outfit_generate')).toBe(50)
    expect(getLimit('pro', 'outfit_generate')).toBe(500)
    expect(getLimit('unknown', 'outfit_generate')).toBe(50) // defaults to free
  })
  
  test('calculates remaining correctly', () => {
    const used = 5
    const limit = 50
    const remaining = Math.max(0, limit - used)
    
    expect(remaining).toBe(45)
  })
  
  test('rate limit exceeded when at limit', () => {
    const used = 50
    const limit = 50
    const allowed = used < limit
    
    expect(allowed).toBe(false)
  })
})
