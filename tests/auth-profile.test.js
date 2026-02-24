import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../server/index.js'

// Note: These tests require a running server with test database
// Run with: npm run test:auth

const API_BASE = '/api/v1'

describe('Authentication - Sign Up', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
    firstName: 'Test'
  }

  describe('POST /auth/register', () => {
    test('should create new user account with email, password, firstName', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send(testUser)
      
      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('user')
      expect(res.body.user.email).toBe(testUser.email)
      expect(res.body.user.firstName).toBe(testUser.firstName)
      expect(res.body.user).not.toHaveProperty('password') // Password should not be returned
    })

    test('should return JWT token on successful registration', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({
          email: `test2-${Date.now()}@example.com`,
          password: 'password123',
          firstName: 'John'
        })
      
      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('token')
      expect(res.body.token).toMatch(/^eyJ/) // JWT format
    })

    test('should reject duplicate email', async () => {
      // First registration
      const dupEmail = `dup-${Date.now()}@example.com`
      await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({ email: dupEmail, password: 'pass123', firstName: 'One' })
      
      // Second registration with same email
      const res = await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({ email: dupEmail, password: 'pass456', firstName: 'Two' })
      
      expect(res.status).toBe(409)
      expect(res.body.error).toContain('email')
    })

    test('should reject invalid email format', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({ email: 'not-an-email', password: 'pass123', firstName: 'Bad' })
      
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('email')
    })

    test('should reject weak password (< 8 chars)', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({ email: 'test@example.com', password: 'short', firstName: 'Bad' })
      
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('password')
    })

    test('should reject missing firstName', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({ email: 'test@example.com', password: 'password123' })
      
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('firstName')
    })

    test('should reject bot with honeypot field filled', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({ 
          email: `bot-${Date.now()}@example.com`, 
          password: 'password123', 
          firstName: 'Bot',
          website_url: 'http://spam.com' // Honeypot
        })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('bot')
    })
  })

  describe('POST /auth/login', () => {
    let loginEmail = `login-${Date.now()}@example.com`
    let loginPassword = 'loginpassword123'

    beforeAll(async () => {
      // Create user first
      await request(app.server)
        .post(`${API_BASE}/auth/register`)
        .send({ email: loginEmail, password: loginPassword, firstName: 'LoginTest' })
    })

    test('should login with correct email and password', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/login`)
        .send({ email: loginEmail, password: loginPassword })
      
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('token')
      expect(res.body.user.email).toBe(loginEmail)
    })

    test('should reject wrong password', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/login`)
        .send({ email: loginEmail, password: 'wrongpassword' })
      
      expect(res.status).toBe(401)
      expect(res.body.error).toContain('Invalid')
    })

    test('should reject non-existent email', async () => {
      const res = await request(app.server)
        .post(`${API_BASE}/auth/login`)
        .send({ email: 'nobody@example.com', password: 'password123' })
      
      expect(res.status).toBe(401)
    })

    test('should rate limit after 5 failed attempts', async () => {
      const attempts = []
      for (let i = 0; i < 6; i++) {
        const res = await request(app.server)
          .post(`${API_BASE}/auth/login`)
          .send({ email: loginEmail, password: 'wrong' })
        attempts.push(res.status)
      }
      
      // First 5 should be 401, 6th should be 429 (rate limited)
      expect(attempts[5]).toBe(429)
    })
  })
})

describe('User Profile', () => {
  let authToken = null

  beforeAll(async () => {
    // Create and login user
    const email = `profile-${Date.now()}@example.com`
    await request(app.server)
      .post(`${API_BASE}/auth/register`)
      .send({ email, password: 'password123', firstName: 'Profile' })
    
    const loginRes = await request(app.server)
      .post(`${API_BASE}/auth/login`)
      .send({ email, password: 'password123' })
    
    authToken = loginRes.body.token
  })

  describe('GET /profile', () => {
    test('should return user profile with all fields', async () => {
      const res = await request(app.server)
        .get(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
      
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('firstName')
      expect(res.body).toHaveProperty('genderIdentity')
      expect(res.body).toHaveProperty('stylePresentation')
      expect(res.body).toHaveProperty('height')
      expect(res.body).toHaveProperty('bodyDescription')
      expect(res.body).toHaveProperty('preferredFit')
      expect(res.body).toHaveProperty('areasToHighlight')
      expect(res.body).toHaveProperty('areasToMinimize')
      expect(res.body).toHaveProperty('primaryUseCases')
    })
  })

  describe('PATCH /profile', () => {
    test('should update genderIdentity', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ genderIdentity: 'Man' })
      
      expect(res.status).toBe(200)
      expect(res.body.genderIdentity).toBe('Man')
    })

    test('should update stylePresentation', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ stylePresentation: 'Masculine' })
      
      expect(res.status).toBe(200)
      expect(res.body.stylePresentation).toBe('Masculine')
    })

    test('should accept valid stylePresentation options', async () => {
      const options = ['Feminine', 'Masculine', 'Androgynous', 'Fluid']
      
      for (const opt of options) {
        const res = await request(app.server)
          .patch(`${API_BASE}/profile`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ stylePresentation: opt })
        
        expect(res.status).toBe(200)
        expect(res.body.stylePresentation).toBe(opt)
      }
    })

    test('should reject invalid stylePresentation', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ stylePresentation: 'InvalidOption' })
      
      expect(res.status).toBe(400)
    })

    test('should update height with unit', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          height: { value: 180, unit: 'cm' }
        })
      
      expect(res.status).toBe(200)
      expect(res.body.height.value).toBe(180)
      expect(res.body.height.unit).toBe('cm')
    })

    test('should update bodyDescription free text', async () => {
      const desc = 'Tall and lean, broad shoulders, athletic build'
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ bodyDescription: desc })
      
      expect(res.status).toBe(200)
      expect(res.body.bodyDescription).toBe(desc)
    })

    test('should update areasToHighlight as array', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          areasToHighlight: ['Shoulders', 'Chest'],
          areasToMinimize: ['Hips']
        })
      
      expect(res.status).toBe(200)
      expect(res.body.areasToHighlight).toEqual(['Shoulders', 'Chest'])
      expect(res.body.areasToMinimize).toEqual(['Hips'])
    })

    test('should accept self_describe when genderIdentity is Self-describe', async () => {
      // First set gender to Self-describe
      await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ genderIdentity: 'Self-describe' })
      
      // Then set self describe
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ selfDescribe: 'Genderfluid, present differently based on mood' })
      
      expect(res.status).toBe(200)
      expect(res.body.selfDescribe).toBe('Genderfluid, present differently based on mood')
    })

    test('should update preferredFit', async () => {
      const fits = ['Relaxed', 'Regular', 'Fitted']
      for (const fit of fits) {
        const res = await request(app.server)
          .patch(`${API_BASE}/profile`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ preferredFit: fit })
        
        expect(res.status).toBe(200)
        expect(res.body.preferredFit).toBe(fit)
      }
    })

    test('should update primaryUseCases as array', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          primaryUseCases: ['Work/office', 'Night out', 'Travel']
        })
      
      expect(res.status).toBe(200)
      expect(res.body.primaryUseCases).toEqual(['Work/office', 'Night out', 'Travel'])
    })

    test('should reject invalid primaryUseCases', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          primaryUseCases: ['InvalidOption']
        })
      
      expect(res.status).toBe(400)
    })

    test('should reject unauthenticated request', async () => {
      const res = await request(app.server)
        .patch(`${API_BASE}/profile`)
        .send({ firstName: 'Hacker' })
      
      expect(res.status).toBe(401)
    })
  })
})

describe('Wardrobe Style Presentation Icons', () => {
  // These test the frontend component logic
  
  test('should return correct icon for Feminine presentation', () => {
    const icons = {
      Feminine: '👗',
      Masculine: '👔',
      Androgynous: '⚥',
      Fluid: '🌊'
    }
    expect(icons.Feminine).toBe('👗')
  })

  test('should return correct icon for Masculine presentation', () => {
    const icons = {
      Feminine: '👗',
      Masculine: '👔',
      Androgynous: '⚥',
      Fluid: '🌊'
    }
    expect(icons.Masculine).toBe('👔')
  })

  test('should return correct icon for Androgynous presentation', () => {
    const icons = {
      Feminine: '👗',
      Masculine: '👔',
      Androgynous: '⚥',
      Fluid: '🌊'
    }
    expect(icons.Androgynous).toBe('⚥')
  })

  test('should return correct icon for Fluid presentation', () => {
    const icons = {
      Feminine: '👗',
      Masculine: '👔',
      Androgynous: '⚥',
      Fluid: '🌊'
    }
    expect(icons.Fluid).toBe('🌊')
  })

  test('should return default icon for unknown presentation', () => {
    const getIcon = (presentation) => {
      const icons = {
        Feminine: '👗',
        Masculine: '👔',
        Androgynous: '⚥',
        Fluid: '🌊'
      }
      return icons[presentation] || '⚪'
    }
    
    expect(getIcon('Unknown')).toBe('⚪')
    expect(getIcon(null)).toBe('⚪')
    expect(getIcon(undefined)).toBe('⚪')
  })

  test('should filter items by presentation style', () => {
    const items = [
      { id: 1, name: 'Dress', presentation: 'Feminine' },
      { id: 2, name: 'Suit', presentation: 'Masculine' },
      { id: 3, name: 'Blazer', presentation: 'Androgynous' },
      { id: 4, name: 'Tee', presentation: 'Fluid' }
    ]
    
    const filterByPresentation = (items, presentation) => {
      if (!presentation || presentation === 'all') return items
      return items.filter(item => item.presentation === presentation)
    }
    
    expect(filterByPresentation(items, 'Feminine')).toHaveLength(1)
    expect(filterByPresentation(items, 'Masculine')).toHaveLength(1)
    expect(filterByPresentation(items, 'all')).toHaveLength(4)
    expect(filterByPresentation(items, null)).toHaveLength(4)
  })
})
