// tests/entitlement-service.test.js — EntitlementService unit tests

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EntitlementService } from '../server/services/EntitlementService.js'

describe('EntitlementService', () => {
  let db
  let service

  // Mock db with run/exec
  // Track call count per test to return correct values for multiple exec calls
  beforeEach(() => {
    db = {
      run: vi.fn(() => ({ lastInsertRowid: 1 })),
      exec: vi.fn((sql) => {
        if (sql.includes('PRAGMA table_info')) {
          // PRAGMA returns columns: id, user_id, plan, status, items_limit, outfits_per_day, grace_period_end
          return [[
            ['id', 1], ['user_id', 2], ['plan', 3], ['status', 4], ['items_limit', 5], ['outfits_per_day', 6], ['grace_period_end', 7]
          ]]
        }
        if (sql.includes('COUNT')) {
          return [{ columns: ['count'], values: [[0]] }]
        }
        // Default: return empty
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
        expect.arrayContaining([123, 20, 3, 'basic'])
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
        outfits_per_day: 999999,
        ai_tier: 'priority'
      })
      expect(plans).toContainEqual({
        plan: 'unlimited',
        items_limit: 999999,
        outfits_per_day: 999999,
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
    // Helper to mock both the SELECT query and PRAGMA query
    // sql.js exec returns [{ columns: [...], values: [[...]] }]
    const mockExecWithColumns = (mock, rowData) => {
      mock.mockReturnValueOnce([{           // First call: SELECT * FROM entitlements
        columns: ['id', 'user_id', 'plan', 'status', 'items_limit', 'outfits_per_day', 'grace_period_end'],
        values: [rowData]                   // rowData is already an array
      }])
      .mockReturnValueOnce([{               // Second call: PRAGMA table_info
        columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
        values: [
          [0, 'id', 'INTEGER', 0, null, 0],
          [1, 'user_id', 'INTEGER', 0, null, 0],
          [2, 'plan', 'TEXT', 0, null, 0],
          [3, 'status', 'TEXT', 0, null, 0],
          [4, 'items_limit', 'INTEGER', 0, null, 0],
          [5, 'outfits_per_day', 'INTEGER', 0, null, 0],
          [6, 'grace_period_end', 'TEXT', 0, null, 0]
        ]
      }])
    }

    it('returns hasAccess true for active status', async () => {
      mockExecWithColumns(db.exec, [1, 123, 'pro', 'active', null, null, null])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns hasAccess true for trialing status', async () => {
      mockExecWithColumns(db.exec, [1, 123, 'pro', 'trialing', null, null, null])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns hasAccess true for past_due within grace period', async () => {
      const futureGrace = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      mockExecWithColumns(db.exec, [1, 123, 'pro', 'past_due', null, null, futureGrace])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns hasAccess false for past_due after grace period', async () => {
      const pastGrace = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      mockExecWithColumns(db.exec, [1, 123, 'pro', 'past_due', null, null, pastGrace])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(false)
    })

    it('returns hasAccess false for canceled status', async () => {
      mockExecWithColumns(db.exec, [1, 123, 'free', 'canceled', null, null, null])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(false)
    })

    it('returns hasAccess true for paused status', async () => {
      mockExecWithColumns(db.exec, [1, 123, 'pro', 'paused', null, null, null])

      const result = await service.check(123)

      expect(result.hasAccess).toBe(true)
    })

    it('returns null for non-existent user', async () => {
      db.exec.mockReturnValueOnce([])  // Empty result for SELECT

      const result = await service.check(999) // userId 999 = non-existent user

      expect(result).toBeNull()
    })

    it('handles null grace_period_end gracefully', async () => {
      // past_due with null grace period end → no access
      // Rebuild service fresh to avoid any mock state contamination
      const freshDb = {
        run: vi.fn(),
        exec: vi.fn((sql) => {
          if (sql.includes('entitlements WHERE')) {
            return [{ columns: ['id','user_id','plan','status','items_limit','outfits_per_day','grace_period_end'], values: [[1,123,'pro','past_due',null,null,null]] }]
          }
          if (sql.includes('PRAGMA')) {
            return [{ columns: ['cid','name','type','notnull','dflt_value','pk'], values: [
              [0,'id','INTEGER',0,null,0],[1,'user_id','INTEGER',0,null,0],[2,'plan','TEXT',0,null,0],
              [3,'status','TEXT',0,null,0],[4,'items_limit','INTEGER',0,null,0],
              [5,'outfits_per_day','INTEGER',0,null,0],[6,'grace_period_end','TEXT',0,null,0]
            ]}]
          }
          return []
        })
      }
      const freshService = new EntitlementService(freshDb)

      const result = await freshService.check(123)

      // past_due with null grace = no access
      expect(result).not.toBeNull()
      expect(result.hasAccess).toBe(false)
    })

    it('falls back to free plan for invalid plan code', async () => {
      mockExecWithColumns(db.exec, [1, 123, 'invalid_plan', 'active', null, null, null])

      const result = await service.check(123)

      // Should still return, plan_limits should fallback to free
      expect(result).toBeDefined()
      expect(result.plan_limits.items_limit).toBe(20)
    })
  })

  describe('getTodayOutfitCount', () => {
    it('returns outfit count for user today', async () => {
      db.exec.mockReturnValueOnce([{ columns: ['count'], values: [[5]] }])

      const count = await service.getTodayOutfitCount(123)

      expect(count).toBe(5)
    })

    it('returns 0 when no outfits', async () => {
      db.exec.mockReturnValueOnce([{ columns: ['count'], values: [[0]] }])

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
      db.exec.mockReturnValueOnce([{ columns: ['count'], values: [[42]] }])

      const count = await service.getItemCount(123)

      expect(count).toBe(42)
    })

    it('returns 0 when no items', async () => {
      db.exec.mockReturnValueOnce([{ columns: ['count'], values: [[0]] }])

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
