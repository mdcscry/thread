// Migration: Create user_preferences table
// Feature 12: Onboarding flow

import { prepare as db, getDb, saveDb } from '../client.js'

export async function migrate() {
  console.log('Running migration: create user_preferences table')
  
  const database = await getDb()
  
  // Create user_preferences table
  database.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      
      -- Q1: Style
      style_tags TEXT DEFAULT '[]',
      
      -- Q2: Occasions
      primary_occasions TEXT DEFAULT '[]',
      
      -- Q3: Climate
      climate TEXT DEFAULT 'mixed',
      
      -- Q4: Color prefs
      preferred_colors TEXT DEFAULT '[]',
      color_exclusions TEXT DEFAULT '[]',
      
      -- Q5: Fit
      fit_preference TEXT DEFAULT 'relaxed',
      
      -- State
      onboarding_completed INTEGER DEFAULT 0,
      closet_intake_completed INTEGER DEFAULT 0,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `)
  
  // Create index
  database.run(`CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_preferences(user_id);`)
  
  saveDb()
  console.log('✅ Migration complete: user_preferences table created')
}

export default { migrate }
