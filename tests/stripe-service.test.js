// tests/stripe-service.test.js — StripeService unit tests

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StripeService } from '../server/services/StripeService.js'

// Mock stripe module
vi.mock('stripe', () => {
  return {
    default: vi.fn(() => ({
      customers: {
        create: vi.fn(),
      },
      paymentIntents: {
        create: vi.fn(),
      },
      paymentMethods: {
        list: vi.fn(),
      },
      checkout: {
        sessions: {
          create: vi.fn(),
        },
      },
      billingPortal: {
        sessions: {
          create: vi.fn(),
        },
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    })),
  }
})

describe('StripeService', () => {
  let service

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    service = new StripeService()
  })

  describe('isEnabled', () => {
    it('returns false when STRIPE_SECRET_KEY not set', () => {
      expect(service.isEnabled()).toBe(false)
    })

    it('returns true when STRIPE_SECRET_KEY set', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      expect(svc.isEnabled()).toBe(true)
    })
  })

  describe('createCustomer', () => {
    it('logs and returns dev ID when disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      const result = await service.createCustomer({ email: 'test@example.com', name: 'Test' })

      expect(consoleSpy).toHaveBeenCalledWith('[STRIPE] [DEV] Would create customer: test@example.com')
      expect(result.id).toMatch(/^cus_dev_/)
    })

    it('calls Stripe API when enabled', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockCustomer = { id: 'cus_123' }
      svc.stripe.customers.create.mockResolvedValue(mockCustomer)

      const result = await svc.createCustomer({ email: 'test@example.com', name: 'Test' })

      expect(svc.stripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test',
        metadata: undefined,
      })
      expect(result).toEqual({ id: 'cus_123' })
    })

    it('passes metadata through', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockCustomer = { id: 'cus_123' }
      svc.stripe.customers.create.mockResolvedValue(mockCustomer)

      await svc.createCustomer({ 
        email: 'test@example.com', 
        name: 'Test',
        metadata: { userId: '456', source: 'web' }
      })

      expect(svc.stripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test',
        metadata: { userId: '456', source: 'web' },
      })
    })

    it('throws on Stripe API error', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      svc.stripe.customers.create.mockRejectedValue(new Error('Stripe API error'))

      await expect(svc.createCustomer({ email: 'test@example.com' }))
        .rejects.toThrow('Stripe API error')
    })
  })

  describe('createPaymentIntent', () => {
    it('returns dev payment intent when disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log')

      const result = await service.createPaymentIntent({ amount: 999, customerId: 'cus_123' })

      expect(consoleSpy).toHaveBeenCalledWith('[STRIPE] [DEV] Would create payment intent: $9.99')
      expect(result.id).toMatch(/^pi_dev_/)
      expect(result.client_secret).toBeDefined()
    })

    it('calls Stripe when enabled', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockPI = { id: 'pi_123', client_secret: 'secret_123' }
      svc.stripe.paymentIntents.create.mockResolvedValue(mockPI)

      const result = await svc.createPaymentIntent({ amount: 999, customerId: 'cus_123' })

      expect(svc.stripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 999,
        currency: 'usd',
        customer: 'cus_123',
        metadata: undefined,
      })
      expect(result).toEqual(mockPI)
    })

    it('uses custom currency when provided', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockPI = { id: 'pi_123', client_secret: 'secret_123' }
      svc.stripe.paymentIntents.create.mockResolvedValue(mockPI)

      await svc.createPaymentIntent({ amount: 999, currency: 'eur', customerId: 'cus_123' })

      expect(svc.stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'eur' })
      )
    })

    it('handles payment intent errors', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      svc.stripe.paymentIntents.create.mockRejectedValue(new Error('Card declined'))

      await expect(svc.createPaymentIntent({ amount: 999, customerId: 'cus_123' }))
        .rejects.toThrow('Card declined')
    })
  })

  describe('getPaymentMethods', () => {
    it('returns empty array when disabled', async () => {
      const result = await service.getPaymentMethods('cus_123')
      expect(result.data).toEqual([])
    })

    it('calls Stripe when enabled', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockPMs = { data: [{ id: 'pm_1' }, { id: 'pm_2' }] }
      svc.stripe.paymentMethods.list.mockResolvedValue(mockPMs)

      const result = await svc.getPaymentMethods('cus_123')

      expect(svc.stripe.paymentMethods.list).toHaveBeenCalledWith({
        customer: 'cus_123',
        type: 'card',
      })
      expect(result.data).toHaveLength(2)
    })

    it('handles API errors', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      svc.stripe.paymentMethods.list.mockRejectedValue(new Error('Not found'))

      await expect(svc.getPaymentMethods('cus_123'))
        .rejects.toThrow('Not found')
    })
  })

  describe('createCheckoutSession', () => {
    it('returns dev URL when disabled', async () => {
      const result = await svc.createCheckoutSession({
        customerId: 'cus_123',
        lineItems: [{ price: 'price_123', quantity: 1 }],
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel',
      })

      expect(result.url).toBe('http://localhost:5173/billing/success?dev=true')
    })

    it('calls Stripe when enabled', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockSession = { url: 'https://checkout.stripe.com/c/pay/cs_123' }
      svc.stripe.checkout.sessions.create.mockResolvedValue(mockSession)

      const result = await svc.createCheckoutSession({
        customerId: 'cus_123',
        lineItems: [{ price: 'price_123', quantity: 1 }],
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel',
      })

      expect(svc.stripe.checkout.sessions.create).toHaveBeenCalled()
      expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_123')
    })

    it('handles 3D Secure required', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockSession = { 
        url: 'https://checkout.stripe.com/c/pay/cs_123',
        payment_intent: { id: 'pi_123', status: 'requires_action' }
      }
      svc.stripe.checkout.sessions.create.mockResolvedValue(mockSession)

      const result = await svc.createCheckoutSession({
        customerId: 'cus_123',
        lineItems: [{ price: 'price_123', quantity: 1 }],
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel',
      })

      // Should still return the URL even with 3DS
      expect(result.url).toContain('checkout.stripe.com')
    })

    it('handles checkout errors', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      svc.stripe.checkout.sessions.create.mockRejectedValue(new Error('Product not found'))

      await expect(service.createCheckoutSession({
        customerId: 'cus_123',
        lineItems: [{ price: 'price_123', quantity: 1 }],
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel',
      })).rejects.toThrow('Product not found')
    })

    it('handles expired session', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockSession = { url: null, expired: true }
      svc.stripe.checkout.sessions.create.mockResolvedValue(mockSession)

      const result = await svc.createCheckoutSession({
        customerId: 'cus_123',
        lineItems: [{ price: 'price_123', quantity: 1 }],
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel',
      })

      // Should handle gracefully
      expect(result.url).toBeNull()
    })
  })

  describe('createPortalSession', () => {
    it('returns dev URL when disabled', async () => {
      const result = await svc.createPortalSession({
        customerId: 'cus_123',
        returnUrl: 'http://localhost:5173/billing',
      })

      expect(result.url).toBe('http://localhost:5173/billing?dev=true')
    })

    it('calls Stripe when enabled', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockSession = { url: 'https://billing.stripe.com/session/bps_123' }
      svc.stripe.billingPortal.sessions.create.mockResolvedValue(mockSession)

      const result = await svc.createPortalSession({
        customerId: 'cus_123',
        returnUrl: 'http://localhost:5173/billing',
      })

      expect(svc.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'http://localhost:5173/billing',
      })
      expect(result.url).toBe('https://billing.stripe.com/session/bps_123')
    })

    it('handles portal errors', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      svc.stripe.billingPortal.sessions.create.mockRejectedValue(new Error('Customer not found'))

      await expect(service.createPortalSession({
        customerId: 'cus_123',
        returnUrl: 'http://localhost:5173/billing',
      })).rejects.toThrow('Customer not found')
    })
  })

  describe('verifyWebhookSignature', () => {
    it('returns null when disabled', () => {
      const result = service.verifyWebhookSignature('payload', 'signature')
      expect(result).toBeNull()
    })

    it('returns null when secret not set', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const result = svc.verifyWebhookSignature('payload', 'signature')
      expect(result).toBeNull()
    })

    it('returns event when signature valid', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123'
      const svc = new StripeService()
      const mockEvent = { type: 'payment_intent.succeeded' }
      svc.stripe.webhooks.constructEvent.mockReturnValue(mockEvent)

      const result = svc.verifyWebhookSignature('payload', 'valid_sig')

      expect(result).toEqual(mockEvent)
    })

    it('returns null on invalid signature', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123'
      const svc = new StripeService()
      svc.stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature')
      })

      const result = svc.verifyWebhookSignature('payload', 'invalid_sig')

      expect(result).toBeNull()
    })

    it('handles malformed payload', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123'
      const svc = new StripeService()
      svc.stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No compatible overload')
      })

      const result = svc.verifyWebhookSignature('invalid{json', 'signature')

      expect(result).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('handles missing optional parameters', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockCustomer = { id: 'cus_123' }
      svc.stripe.customers.create.mockResolvedValue(mockCustomer)

      // Should not throw with minimal params
      const result = await svc.createCustomer({ email: 'test@example.com' })
      expect(result.id).toBeDefined()
    })

    it('handles zero amount', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockPI = { id: 'pi_123', client_secret: 'secret_123' }
      svc.stripe.paymentIntents.create.mockResolvedValue(mockPI)

      const result = await svc.createPaymentIntent({ amount: 0, customerId: 'cus_123' })
      expect(result.id).toBeDefined()
    })

    it('handles empty line items', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'
      const svc = new StripeService()
      const mockSession = { url: 'https://checkout.stripe.com/c/pay/cs_123' }
      svc.stripe.checkout.sessions.create.mockResolvedValue(mockSession)

      const result = await svc.createCheckoutSession({
        customerId: 'cus_123',
        lineItems: [],
        successUrl: 'http://localhost:5173/success',
        cancelUrl: 'http://localhost:5173/cancel',
      })

      expect(result.url).toBeDefined()
    })
  })
})
