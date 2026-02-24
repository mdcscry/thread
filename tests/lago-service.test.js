// tests/lago-service.test.js — LagoService unit tests

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LagoService } from '../server/services/LagoService.js'

// Mock fetch globally
global.fetch = vi.fn()

describe('LagoService', () => {
  let service

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env
    delete process.env.LAGO_API_KEY
    service = new LagoService()
  })

  describe('isEnabled', () => {
    it('returns false when LAGO_API_KEY not set', () => {
      expect(service.isEnabled()).toBe(false)
    })

    it('returns true when LAGO_API_KEY set', () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()
      expect(svc.isEnabled()).toBe(true)
    })
  })

  describe('createCustomer', () => {
    it('calls /v1/customers with correct body in production mode', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customer: { lago_id: 'lago_123' } })
      })

      const result = await svc.createCustomer({ userId: 456, email: 'test@example.com', name: 'Test User' })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.getlago.com/v1/customers',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer lago_test_key',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            customer: {
              external_id: '456',
              email: 'test@example.com',
              name: 'Test User'
            }
          })
        })
      )
      expect(result).toEqual({ lago_customer_id: 'lago_123' })
    })

    it('logs and returns dev ID when disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log')
      const svc = new LagoService()

      const result = await svc.createCustomer({ userId: 456, email: 'test@example.com' })

      expect(consoleSpy).toHaveBeenCalledWith('[LAGO] [DEV] Would create customer: test@example.com')
      expect(result).toEqual({ lago_customer_id: 'dev_456' })
    })

    it('throws on API error', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => 'Unprocessable entity'
      })

      await expect(svc.createCustomer({ userId: 456, email: 'test@example.com' }))
        .rejects.toThrow('Lago createCustomer failed: 422 Unprocessable entity')
    })

    it('handles network timeout', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockRejectedValueOnce(new Error('Network timeout'))

      await expect(svc.createCustomer({ userId: 456, email: 'test@example.com' }))
        .rejects.toThrow('Network timeout')
    })

    it('handles 5xx server error', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service unavailable'
      })

      await expect(svc.createCustomer({ userId: 456, email: 'test@example.com' }))
        .rejects.toThrow('Lago createCustomer failed: 503 Service unavailable')
    })

    it('handles 429 rate limit', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      })

      await expect(svc.createCustomer({ userId: 456, email: 'test@example.com' }))
        .rejects.toThrow('Lago createCustomer failed: 429 Rate limit exceeded')
    })

    it('handles malformed JSON response', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON') }
      })

      await expect(svc.createCustomer({ userId: 456, email: 'test@example.com' }))
        .rejects.toThrow('Invalid JSON')
    })

    it('handles missing customer in response', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ wrong_key: 'value' })
      })

      const result = await svc.createCustomer({ userId: 456, email: 'test@example.com' })
      expect(result.lago_customer_id).toBeUndefined()
    })
  })

  describe('createSubscription', () => {
    it('calls /v1/subscriptions with correct body', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: { lago_id: 'sub_789' } })
      })

      const result = await svc.createSubscription({ lagoCustomerId: 'lago_123', planCode: 'pro' })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.getlago.com/v1/subscriptions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            subscription: {
              customer_id: 'lago_123',
              plan_code: 'pro'
            }
          })
        })
      )
      expect(result).toEqual({ lago_subscription_id: 'sub_789' })
    })

    it('logs in dev mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log')
      const svc = new LagoService()

      const result = await svc.createSubscription({ lagoCustomerId: 'lago_123', planCode: 'pro' })

      expect(consoleSpy).toHaveBeenCalledWith('[LAGO] [DEV] Would subscribe lago_123 to pro')
      expect(result).toEqual({ lago_subscription_id: expect.stringContaining('dev_sub_') })
    })

    it('handles server error on subscription', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error'
      })

      await expect(svc.createSubscription({ lagoCustomerId: 'lago_123', planCode: 'pro' }))
        .rejects.toThrow('Lago createSubscription failed: 500 Internal error')
    })
  })

  describe('cancelSubscription', () => {
    it('calls DELETE /v1/subscriptions/{id}', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({ ok: true })

      const result = await svc.cancelSubscription({ lagoSubscriptionId: 'sub_789' })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.getlago.com/v1/subscriptions/sub_789',
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(result).toEqual({ success: true })
    })

    it('returns success on 404 (already canceled)', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const result = await svc.cancelSubscription({ lagoSubscriptionId: 'sub_789' })

      expect(result).toEqual({ success: true })
    })

    it('logs in dev mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log')
      const svc = new LagoService()

      const result = await svc.cancelSubscription({ lagoSubscriptionId: 'sub_789' })

      expect(consoleSpy).toHaveBeenCalledWith('[LAGO] [DEV] Would cancel subscription sub_789')
      expect(result).toEqual({ success: true })
    })

    it('throws on other errors', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({ ok: false, status: 500 })

      await expect(svc.cancelSubscription({ lagoSubscriptionId: 'sub_789' }))
        .rejects.toThrow('Lago cancelSubscription failed: 500')
    })
  })

  describe('createCheckout', () => {
    it('returns dev URL in dev mode', async () => {
      const svc = new LagoService()

      const result = await svc.createCheckout({
        lagoCustomerId: 'lago_123',
        planCode: 'pro',
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel'
      })

      expect(result.checkout_url).toBe('http://localhost:5173/billing/success?plan=pro&dev=true')
    })

    it('calls /v1/checkouts in production', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ checkout: { url: 'https://checkout.lago.com/abc' } })
      })

      const result = await svc.createCheckout({
        lagoCustomerId: 'lago_123',
        planCode: 'pro',
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel'
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.getlago.com/v1/checkouts',
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.checkout_url).toBe('https://checkout.lago.com/abc')
    })

    it('handles missing checkout URL in response', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ checkout: {} })
      })

      const result = await svc.createCheckout({
        lagoCustomerId: 'lago_123',
        planCode: 'pro',
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel'
      })

      expect(result.checkout_url).toBeUndefined()
    })

    it('throws on checkout error', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request'
      })

      await expect(svc.createCheckout({
        lagoCustomerId: 'lago_123',
        planCode: 'pro',
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel'
      })).rejects.toThrow('Lago createCheckout failed: 400 Bad request')
    })
  })

  describe('createPortalUrl', () => {
    it('returns dev URL in dev mode', async () => {
      const svc = new LagoService()

      const result = await svc.createPortalUrl({
        lagoCustomerId: 'lago_123',
        returnUrl: 'http://localhost:5173/billing'
      })

      expect(result.portal_url).toBe('http://localhost:5173/billing?dev=true')
    })

    it('calls /v1/customer_portal_url in production', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ portal_url: { url: 'https://portal.lago.com/xyz' } })
      })

      const result = await svc.createPortalUrl({
        lagoCustomerId: 'lago_123',
        returnUrl: 'http://localhost:5173/billing'
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.getlago.com/v1/customer_portal_url',
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.portal_url).toBe('https://portal.lago.com/xyz')
    })

    it('handles missing portal URL in response', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ portal_url: {} })
      })

      const result = await svc.createPortalUrl({
        lagoCustomerId: 'lago_123',
        returnUrl: 'http://localhost:5173/billing'
      })

      expect(result.portal_url).toBeUndefined()
    })

    it('throws on portal error', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Customer not found'
      })

      await expect(svc.createPortalUrl({
        lagoCustomerId: 'lago_123',
        returnUrl: 'http://localhost:5173/billing'
      })).rejects.toThrow('Lago createPortalUrl failed: 404 Customer not found')
    })
  })

  describe('API URL configuration', () => {
    it('uses custom API URL when set', async () => {
      process.env.LAGO_API_KEY = 'lago_test_key'
      process.env.LAGO_API_URL = 'https://custom.lago.example.com'
      const svc = new LagoService()

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customer: { lago_id: 'lago_123' } })
      })

      await svc.createCustomer({ userId: 456, email: 'test@example.com' })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.lago.example.com/v1/customers',
        expect.anything()
      )
    })
  })
})
