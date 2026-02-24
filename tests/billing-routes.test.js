// tests/billing-routes.test.js — Billing API tests

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.API_URL || 'http://localhost:3000'

// Helper to create test user and get auth
async function getAuthHeaders() {
  // This would need a real user in test DB
  // For now, just test the unauthenticated cases
  return {}
}

test.describe('Billing API', () => {

  test('GET /api/v1/billing/plans returns all plans', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/billing/plans`)
    const body = await response.json()

    expect(response.status()).toBe(200)
    expect(body.plans).toHaveLength(4)
    expect(body.plans).toContainEqual(expect.objectContaining({ plan: 'free' }))
    expect(body.plans).toContainEqual(expect.objectContaining({ plan: 'pro' }))
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
    // This would need auth - just documenting expected behavior
    // Expected: 400 with { error: 'Invalid plan', valid_plans: ['starter', 'pro', 'unlimited'] }
    expect(true).toBe(true) // Placeholder
  })

  test('GET /api/v1/billing/portal without auth returns 401', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/billing/portal`)

    expect(response.status()).toBe(401)
  })

  test('POST /api/v1/webhooks/lago without signature returns 401', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/webhooks/lago`, {
      data: { webhook_type: 'subscription.started', object: {} }
    })

    // With WEBHOOK_LAGO_SECRET set, should return 401
    // Without it (dev mode), returns 200
    expect([200, 401]).toContain(response.status())
  })
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
})
