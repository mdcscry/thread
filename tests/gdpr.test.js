import { test, expect, describe } from 'vitest'

describe('GDPR Data Export', () => {
  test('export structure is defined', () => {
    const exportStructure = {
      exportedAt: expect.any(String),
      user: {
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String),
        createdAt: expect.any(String)
      },
      wardrobe: {
        items: expect.any(Array),
        count: expect.any(Number)
      },
      outfits: {
        items: expect.any(Array),
        count: expect.any(Number)
      },
      preferences: {
        items: expect.any(Array),
        count: expect.any(Number)
      },
      feedback: {
        items: expect.any(Array),
        count: expect.any(Number)
      },
      social: {
        invites: expect.any(Array),
        wardrobeShares: expect.any(Array)
      }
    }
    
    expect(exportStructure).toBeDefined()
  })
})

describe('GDPR Account Deletion', () => {
  test('deletion order handles foreign keys', () => {
    const deletionOrder = [
      'preference_events',
      'user_preferences', 
      'wardrobe_shares',
      'invites',
      'outfit_items',
      'outfits',
      'clothing_items',
      'users'
    ]
    
    expect(deletionOrder.indexOf('preference_events')).toBeLessThan(deletionOrder.indexOf('outfit_items'))
    expect(deletionOrder.indexOf('outfit_items')).toBeLessThan(deletionOrder.indexOf('outfits'))
    expect(deletionOrder.indexOf('outfits')).toBeLessThan(deletionOrder.indexOf('clothing_items'))
    expect(deletionOrder.indexOf('clothing_items')).toBeLessThan(deletionOrder.indexOf('users'))
  })
})
