// Migration: Add last_used column to users table
// Required for login API key rotation tracking

import { prepare as db, getDb } from '../client.js'

export async function migrate() {
  console.log('Running migration: add last_used to users')
  
  const database = await getDb()
  
  try {
    database.run(`ALTER TABLE users ADD COLUMN last_used DATETIME`)
    console.log('✅ Migration: Added last_used column to users table')
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('✅ Migration: last_used column already exists')
    } else {
      throw e
    }
  }
}
