// tests/entitlement-service.test.js — EntitlementService unit tests

import { describe, it, expect, beforeEach, vi } from 'vitest'
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

    it('handles duplicate provision gracefully', async () => {
      db.run.mockImplementationOnce(() => { throw new Error('UNIQUE constraint failed') })
      
      // Should handle gracefully - currently throws, update if you want graceful handling
      await expect(service.provisionFree(123)).rejects.toThrow('UNIQUE constraint')
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

    it('includes starter plan', () => {
      const plans = service.getPlans()
      expect(plans).toContainEqual({
        plan: 'starter',
        items_limit: 100,
        outfits_per_day: 10,
        ai_tier: 'enhanced'
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

    it('returns hasAccess false for canceled status', async () => {
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'free', 'canceled', null, null, null]]
      }]])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(false)
    })

    it('returns hasAccess true for paused status', async () => {
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'pro', 'paused', null, null, null]]
      }]])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns null for non-existent user', async () => {
      db.exec.mockReturnValueOnce([])

      const result = await service.check(999)

      expect(result).toBeNull()
    })

    it('handles null grace_period_end gracefully', async () => {
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'pro', 'past_due', null, null, null]]
      }]])

      const result = await service.check(123)

      // past_due with null grace = no access
      expect(result.hasAccess).toBe(false)
    })

    it('falls back to free plan for invalid plan code', async () => {
      db.exec.mockReturnValueOnce([[{
        values: [[1, 123, 'invalid_plan', 'active', null, null, null]]
      }]])

      const result = await service.check(123)

      // Should still return, plan_limits should fallback to free
      expect(result).toBeDefined()
      expect(result.plan_limits.items_limit).toBe(20)
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

    it('queries with correct date', async () => {
      await service.getTodayOutfitCount(123)

      expect(db.exec).toHaveBeenCalledWith(
        expect.stringContaining("DATE('now')"),
        [123]
      )
    })
  })

  describe('getItemCount', () => {
    it('returns item count for user', async () => {
      db.exec.mockReturnValueOnce([[{ values: [[42]] }]])

      const count = await service.getItemCount(123)

      expect(count).toBe(42)
    })

    it('returns 0 when no items', async () => {
      db.exec.mockReturnValueOnce([[{ values: [[0]] }]])

      const count = await service.getItemCount(123)

      expect(count).toBe(0)
    })
  })

  describe('updateFromWebhook', () => {
    it('updates plan and status correctly', async () => {
      await service.updateFromWebhook({
        userId: 123,
        plan: 'pro',
        status: 'active',
        lagoCustomerId: 'lago_123',
        lagoSubscriptionId: 'sub_123',
        currentPeriodEnd: '2026-03-01',
      })

      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE entitlements'),
        expect.arrayContaining(['pro', 'active', 'lago_123', 'sub_123'])
      )
    })

    it('sets grace period for past_due', async () => {
      const gracePeriodEnd = new Date()
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7)

      await service.updateFromWebhook({
        userId: 123,
        plan: 'pro',
        status: 'past_due',
        gracePeriodEnd: gracePeriodEnd.toISOString(),
      })

      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE entitlements'),
        expect.arrayContaining(['past_due'])
      )
    })

    it('falls back to free for invalid plan', async () => {
      await service.updateFromWebhook({
        userId: 123,
        plan: 'nonexistent_plan',
        status: 'active',
      })

      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE entitlements'),
        expect.arrayContaining(['free'])
      )
    })

    it('handles null values gracefully', async () => {
      await service.updateFromWebhook({
        userId: 123,
        plan: 'free',
        status: 'active',
        lagoCustomerId: null,
        lagoSubscriptionId: null,
        stripeCustomerId: null,
        currentPeriodEnd: null,
        gracePeriodEnd: null,
      })

      expect(db.run).toHaveBeenCalled()
      // Should not throw
    })
  })
})
