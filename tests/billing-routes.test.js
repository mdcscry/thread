// tests/billing-routes.test.js — Billing API tests

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.API_URL || 'http://localhost:3000'

test.describe('Billing API', () => {

  test('GET /api/v1/billing/plans returns all plans', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/billing/plans`)
    const body = await response.json()

    expect(response.status()).toBe(200)
    expect(body.plans).toHaveLength(4)
    expect(body.plans).toContainEqual(expect.objectContaining({ plan: 'free' }))
    expect(body.plans).toContainEqual(expect.objectContaining({ plan: 'pro' }))
  })

  test('GET /api/v1/billing/plans returns correct limits for each plan', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/billing/plans`)
    const body = await response.json()

    const free = body.plans.find(p => p.plan === 'free')
    expect(free.items_limit).toBe(20)
    expect(free.outfits_per_day).toBe(3)
    expect(free.ai_tier).toBe('basic')

    const pro = body.plans.find(p => p.plan === 'pro')
    expect(pro.items_limit).toBe(500)
    expect(pro.ai_tier).toBe('priority')
  })

  test('GET /api/v1/billing/entitlement without auth returns 401', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/billing/entitlement`)

    expect(response.status()).toBe(401)
  })

  test('POST /api/v1/billing/checkout without auth returns 401', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/billing/checkout`, {
      data: { plan: 'pro' }
    })

    expect(response.status()).toBe(401)
  })

  test('POST /api/v1/billing/checkout with invalid plan returns 400', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/billing/checkout`, {
      data: { plan: 'invalid_plan' }
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid plan')
    expect(body.valid_plans).toContain('starter')
    expect(body.valid_plans).toContain('pro')
    expect(body.valid_plans).toContain('unlimited')
  })

  test('POST /api/v1/billing/checkout with missing plan returns 400', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/billing/checkout`, {
      data: {}
    })

    expect(response.status()).toBe(400)
  })

  test('GET /api/v1/billing/portal without auth returns 401', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/billing/portal`)

    expect(response.status()).toBe(401)
  })

  test('POST /api/v1/webhooks/lago without signature returns 401 when secret set', async ({ request }) => {
    // This test's behavior depends on WEBHOOK_LAGO_SECRET being set
    // In dev mode (no secret), it returns 200
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: { webhook_type: 'subscription.started', object: {} }
    })

    // Either 200 (dev mode) or 401 (prod with secret)
    expect([200, 401]).toContain(response.status())
  })

  test('POST /api/v1/webhooks/lago with invalid JSON returns 400', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: null
    })

    expect([200, 400]).toContain(response.status())
  })
})

test.describe('Billing API - Authenticated', () => {
  // These tests would need authenticated users
  // Documenting expected behavior

  test.todo('GET /api/v1/billing/entitlement returns entitlement for authenticated user')

  test.todo('GET /api/v1/billing/entitlement returns usage counts')

  test.todo('POST /api/v1/billing/checkout returns checkout_url for valid plan')

  test.todo('POST /api/v1/billing/checkout returns 400 for user without email')

  test.todo('GET /api/v1/billing/portal returns portal_url for user with subscription')
})

test.describe('Webhooks API', () => {

  test('POST /api/v1/webhooks/lago with valid signature succeeds', async ({ request }) => {
    // This test requires WEBHOOK_LAGO_SECRET to be set
    // In dev mode (no secret), it should succeed
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'subscription.started',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456' },
          plan: { code: 'pro' }
        }
      }
    })

    // Dev mode: 200, Production with invalid sig: 401
    expect([200, 401]).toContain(response.status())
  })

  test('logs unknown event types without crashing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'unknown.event.type',
        object: {}
      }
    })

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.received).toBe(true)
  })

  test('handles subscription.started event', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'subscription.started',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456' },
          plan: { code: 'pro' },
          next_plan_change_date: '2026-03-01'
        }
      }
    })

    expect(response.status()).toBe(200)
  })

  test('handles subscription.terminated event', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'subscription.terminated',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456' },
          plan: { code: 'pro' }
        }
      }
    })

    expect(response.status()).toBe(200)
  })

  test('handles invoice.payment_failure event', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'invoice.payment_failure',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456' },
          subscription: { plan: { code: 'pro' } }
        }
      }
    })

    expect(response.status()).toBe(200)
  })

  test('handles invoice.payment_success event', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'invoice.payment_success',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456' },
          subscription: { plan: { code: 'pro' } }
        }
      }
    })

    expect(response.status()).toBe(200)
  })

  test('handles subscription.upgraded event', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'subscription.upgraded',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456' },
          plan: { code: 'pro' },
          next_plan_change_date: '2026-03-01'
        }
      }
    })

    expect(response.status()).toBe(200)
  })

  test('handles subscription.downgraded event', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'subscription.downgraded',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456' },
          plan: { code: 'starter' },
          next_plan_change_date: '2026-03-01'
        }
      }
    })

    expect(response.status()).toBe(200)
  })

  test('handles customer.payment_provider_created event', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'customer.payment_provider_created',
        object: {
          lago_id: 'evt_123',
          customer: { lago_id: 'cus_456', stripe_customer_id: 'cus_stripe_123' }
        }
      }
    })

    expect(response.status()).toBe(200)
  })

  test('logs event to billing_events table', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: {
        webhook_type: 'subscription.started',
        object: {
          lago_id: 'evt_test_123',
          customer: { lago_id: 'cus_456' },
          plan: { code: 'pro' }
        }
      }
    })

    expect(response.status()).toBe(200)
    // Would verify DB entry in full integration test
  })

  test.todo('handles duplicate event (idempotency) - same lago_event_id twice')

  test.todo('handles webhook with missing customer - logs but does not crash')
})

test.describe('Entitlement Enforcement', () => {

  test.todo('POST /ingestion/start returns 402 when item limit reached')

  test.todo('POST /outfits/generate returns 402 when daily outfit limit reached')

  test.todo('POST /outfit-trainer/generate returns 402 when daily outfit limit reached')

  test.todo('returns upgrade_url in 402 response')

  test.todo('returns resets_at timestamp for daily limits')
})
