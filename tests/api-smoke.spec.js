import { test, expect, request } from '@playwright/test'

const BASE = 'https://localhost:3000'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'

// API tests - fast and reliable
test('API - users endpoint works', async ({ request }) => {
  const res = await request.get(`${BASE}/api/v1/users`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  })
  expect(res.ok()).toBeTruthy()
  const users = await res.json()
  expect(users.length).toBeGreaterThan(0)
})

test('API - profile preferences endpoint works', async ({ request }) => {
  const res = await request.get(`${BASE}/api/v1/users`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  })
  expect(res.ok()).toBeTruthy()
  const users = await res.json()
  const user = users[0]
  
  // Check preferences field exists
  expect(user).toHaveProperty('preferences')
})

test('API - items endpoint works', async ({ request }) => {
  const res = await request.get(`${BASE}/api/v1/items`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  })
  expect(res.ok()).toBeTruthy()
})

test('API - outfits endpoint works', async ({ request }) => {
  const res = await request.get(`${BASE}/api/v1/outfits`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  })
  expect(res.ok()).toBeTruthy()
})
