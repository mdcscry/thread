// tests/entitlement-service.test.js — EntitlementService unit tests

import { describe, it, expect, beforeEach } from 'vitest'
import { EntitlementService } from '../server/services/EntitlementService.js'

describe('EntitlementService', () => {
  let db
  let service

  // Mock db with run/exec
  beforeEach(() => {
    db = {
      run: vi.fn(() => ({ lastInsertRowid: 1 })),
      exec: vi.fn((sql) => {
        if (sql.includes('PRAGMA table_info')) {
          return [[
            { values: [['id', 1], ['user_id', 2], ['plan', 3], ['status', 4], ['items_limit', 5], ['outfits_per_day', 6], ['grace_period_end', 7]] }
          ]]
        }
        if (sql.includes('SELECT COUNT')) {
          return [[{ values: [[0]] }]]
        }
        return [[]]
      })
    }
    service = new EntitlementService(db)
  })

  describe('provisionFree', () => {
    it('creates entitlement with free plan limits', async () => {
      await service.provisionFree(123)

      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO entitlements'),
        expect.arrayContaining([123, 'free', 'active', 20, 3, 'basic'])
      )
    })
  })

  describe('getPlans', () => {
    it('returns all 4 plans with correct limits', () => {
      const plans = service.getPlans()

      expect(plans).toHaveLength(4)
      expect(plans).toContainEqual({
        plan: 'free',
        items_limit: 20,
        outfits_per_day: 3,
        ai_tier: 'basic'
      })
      expect(plans).toContainEqual({
        plan: 'pro',
        items_limit: 500,
        outfits_per_day: Infinity,
        ai_tier: 'priority'
      })
      expect(plans).toContainEqual({
        plan: 'unlimited',
        items_limit: Infinity,
        outfits_per_day: Infinity,
        ai_tier: 'priority_ml'
      })
    })
  })

  describe('check', () => {
    it('returns hasAccess true for active status', async () => {
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'pro', 'active', null, null, null]]
      }]])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns hasAccess true for trialing status', async () => {
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'pro', 'trialing', null, null, null]]
      }]])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns hasAccess true for past_due within grace period', async () => {
      const futureGrace = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'pro', 'past_due', null, null, futureGrace]]
      }]])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns hasAccess false for past_due after grace period', async () => {
      const pastGrace = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'pro', 'past_due', null, null, pastGrace]]
      }]])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(false)
    })

    it('returns null for non-existent user', async () => {
      db.exec.mockReturnValueOnce([])

      const result = await check(999)

      expect(result).toBeNull()
    })
  })

  describe('getTodayOutfitCount', () => {
    it('returns outfit count for user today', async () => {
      db.exec.mockReturnValueOnce([[{ values: [[5]] }]])

      const count = await service.getTodayOutfitCount(123)

      expect(count).toBe(5)
    })

    it('returns 0 when no outfits', async () => {
      db.exec.mockReturnValueOnce([[{ values: [[0]] }]])

      const count = await service.getTodayOutfitCount(123)

      expect(count).toBe(0)
    })
  })

  describe('getItemCount', () => {
    it('returns item count for user', async () => {
      db.exec.mockReturnValueOnce([[{ values: [[42]] }]])

      const count = await service.getItemCount(123)

      expect(count).toBe(42)
    })
  })
})
