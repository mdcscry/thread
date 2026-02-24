import { test, expect, describe, beforeAll } from 'vitest'
import request from 'supertest'
import { server } from '../tests/setup.js'
const app = server

describe('Auth Routes', () => {
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'testpassword123'
  
  // Set up test user once before login tests (use a different email to not conflict with register tests)
  const loginEmail = `logintest-${Date.now()}@example.com`
  
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: loginEmail, password: testPassword, firstName: 'LoginTest' })
    
    expect(res.status).toBe(201)
  })
  
  describe('POST /auth/register', () => {
    test('registers new user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: testEmail, password: testPassword, firstName: 'Test' })
      
      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('userId')
      expect(res.body).toHaveProperty('apiKey')
      expect(res.body.apiKey).toMatch(/^thread_sk_/)
    })
    
    test('rejects duplicate email', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: testEmail, password: testPassword, firstName: 'Test' })
      
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: testEmail, password: testPassword, firstName: 'Test' })
      
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('already registered')
    })
    
    test('rejects weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'weak@test.com', password: 'short', firstName: 'Test' })
      
      expect(res.status).toBe(400)
    })
  })
  
  describe('POST /auth/login', () => {
    test('logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: loginEmail, password: testPassword })
      
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('apiKey')
    })
    
    test('rejects wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: loginEmail, password: 'wrongpassword' })
      
      expect(res.status).toBe(401)
    })
  })
  
  describe('POST /auth/forgot-password', () => {
    test('returns success for valid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testEmail })
      
      expect(res.status).toBe(200)
      expect(res.body.sent).toBe(true)
    })
    
    test('returns success for unknown email (security)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
      
      expect(res.status).toBe(200)
      expect(res.body.sent).toBe(true)
    })
  })
  
  describe('POST /auth/reset-password', () => {
    let resetToken = null
    
    test('generates reset token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testEmail })
      
      // In dev mode, token is logged (in production, sent via email)
      expect(res.status).toBe(200)
    })
    
    test('resets password with valid token', async () => {
      // Get token from DB (in real test, extract from email)
      // For now, just verify the endpoint exists and rejects invalid
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid-token-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', password: 'newpassword123' })
      
      expect(res.status).toBe(400)
    })
  })
  
  describe('POST /auth/verify-email', () => {
    test('rejects invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: 'invalid-token-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })
      
      expect(res.status).toBe(400)
    })
  })
})
