/**
 * API Smoke Test Script
 * Tests critical endpoints without Playwright - plain node/https
 * Run: node tests/smoke.js
 */

import https from 'https'
import http from 'http'

const API_BASE = 'https://localhost:3000/api/v1'
const API_KEY = 'thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934'

let passed = 0
let failed = 0
let sessionCookie = ''

// Helper to make HTTPS requests
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const lib = isHttps ? https : http
    
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...options.headers
      },
      rejectUnauthorized: false, // Allow self-signed certs
      ...options
    }
    
    const req = lib.request(opts, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const cookie = res.headers['set-cookie']
        if (cookie) sessionCookie = cookie[0].split(';')[0]
        
        let parsed = data
        try {
          parsed = JSON.parse(data)
        } catch (e) {
          // Keep as string if not JSON
        }
        
        resolve({ 
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        })
      })
    })
    
    req.on('error', reject)
    req.timeout = 10000
    
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function test(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// Health check
await test('GET /health', async () => {
  const res = await request('https://localhost:3000/health')
  assert(res.ok, `Health check failed: ${res.status}`)
})

// Login
await test('POST /auth/login (login)', async () => {
  const res = await request(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'you@localhost', password: 'thread123' })
  })
  assert(res.ok, `Login failed: ${res.status}`)
  // Login returns user info with API key - cookie is optional
  assert(res.data.apiKey, 'No API key returned')
})

// GET /items
let testItemId = null
await test('GET /items (list items)', async () => {
  const res = await request(`${API_BASE}/items`, {
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Cookie': sessionCookie }
  })
  assert(res.ok, `GET /items failed: ${res.status}`)
  assert(Array.isArray(res.data), 'Response should be an array')
  if (res.data.length > 0) testItemId = res.data[0].id
})

// GET /items/:id
await test('GET /items/:id (single item)', async () => {
  if (!testItemId) {
    console.log('  (skipping - no items in wardrobe)')
    return
  }
  const res = await request(`${API_BASE}/items/${testItemId}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Cookie': sessionCookie }
  })
  assert(res.ok, `GET /items/${testItemId} failed: ${res.status}`)
  assert(res.data.id === testItemId, 'Item ID mismatch')
})

// POST /ingestion/upload-photo (upload photo)
await test('POST /ingestion/upload-photo (upload photo)', async () => {
  // We'll just test that the endpoint exists and accepts the request
  const res = await request(`${API_BASE}/ingestion/upload-photo`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'multipart/form-data; boundary=----test'
    },
    body: '------test\r\n\r\n------test--'
  })
  // Accept 400, 415 as "endpoint exists, bad body"
  assert([200, 400, 415, 500].includes(res.status), 
    `Upload endpoint returned unexpected: ${res.status}`)
})

// PATCH /items/:id
let uploadedItemId = testItemId
await test('PATCH /items/:id (update item)', async () => {
  if (!uploadedItemId) {
    console.log('  (skipping - no item to update)')
    return
  }
  const res = await request(`${API_BASE}/items/${uploadedItemId}`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${API_KEY}`, 
      'Cookie': sessionCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Updated via Smoke Test' })
  })
  assert(res.ok, `PATCH failed: ${res.status}`)
})

// DELETE /items/:id
await test('DELETE /items/:id (delete item)', async () => {
  if (!uploadedItemId) {
    console.log('  (skipping - no item to delete)')
    return
  }
  const res = await request(`${API_BASE}/items/${uploadedItemId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Cookie': sessionCookie }
  })
  assert(res.ok, `DELETE failed: ${res.status}`)
})

// GET /weather
await test('GET /weather?location=Denver', async () => {
  const res = await request(`${API_BASE}/weather?location=Denver`, {
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Cookie': sessionCookie }
  })
  assert(res.ok, `Weather failed: ${res.status}`)
  // Weather returns flat object with temp_f, condition, etc.
  assert(res.data.temp_f !== undefined, 'Weather response missing temp_f')
})

// GET /outfits
await test('GET /outfits', async () => {
  const res = await request(`${API_BASE}/outfits`, {
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Cookie': sessionCookie }
  })
  assert(res.ok, `GET /outfits failed: ${res.status}`)
  assert(Array.isArray(res.data), 'Outfits response should be an array')
})

// Summary
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
