import { getDb, initializeDatabase, prepare as db } from './client.js'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const hashPassword = async (password) => {
  return bcrypt.hash(password, 10)
}

const generateApiKey = (prefix = 'thread_sk_') => {
  return prefix + crypto.randomBytes(24).toString('hex')
}

async function seed() {
  // Initialize database first
  await initializeDatabase()
  
  // Check if users exist
  const existingUsers = db('SELECT COUNT(*) as count FROM users').get()
  
  if (existingUsers.count > 0) {
    console.log('ℹ️  Users already exist, skipping seed')
    return
  }

  // Create default user (you)
  const passwordHash = await hashPassword('thread123')
  const apiKey = generateApiKey()
  
  db(`INSERT INTO users (name, email, password, api_key, preferences) VALUES (?, ?, ?, ?, ?)`).run(
    'You', 'you@localhost', passwordHash, apiKey, JSON.stringify({
      units: 'imperial',
      defaultModel: 'llava:7b',
      theme: 'auto'
    })
  )
  
  console.log('✅ Default user created')
  console.log('   Email: you@localhost')
  console.log('   Password: thread123')
  console.log('   API Key:', apiKey)
  
  // Create second user (girlfriend/partner) - optional
  const partnerApiKey = generateApiKey()
  db(`INSERT INTO users (name, email, password, api_key, preferences) VALUES (?, ?, ?, ?, ?)`).run(
    'Partner', 'partner@localhost', await hashPassword('thread123'), partnerApiKey, JSON.stringify({
      units: 'imperial',
      defaultModel: 'llava:7b',
      theme: 'auto'
    })
  )
  
  console.log('✅ Partner user created')
  console.log('   Email: partner@localhost')
  console.log('   Password: thread123')
}

seed().catch(console.error)
