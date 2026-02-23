// Migration: Upgrade Outfit Trainer to v2
// Phase 1: Enhanced feedback collection with context and exclusions

import { prepare as db, getDb, saveDb } from '../client.js'

export async function migrate() {
  console.log('Running migration: upgrade outfit trainer to v2')

  const database = await getDb()

  // Add new columns to outfit_feedback table
  database.run(`
    ALTER TABLE outfit_feedback ADD COLUMN feedback_value FLOAT;
  `)
  database.run(`
    ALTER TABLE outfit_feedback ADD COLUMN context_occasion TEXT;
  `)
  database.run(`
    ALTER TABLE outfit_feedback ADD COLUMN context_season TEXT;
  `)
  database.run(`
    ALTER TABLE outfit_feedback ADD COLUMN context_time_of_day TEXT;
  `)

  // Create item_exclusions table
  database.run(`
    CREATE TABLE IF NOT EXISTS item_exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (item_id) REFERENCES clothing_items(id),
      UNIQUE(user_id, item_id)
    );
  `)

  // Add new columns to training_sessions table
  database.run(`
    ALTER TABLE training_sessions ADD COLUMN feature_count INTEGER;
  `)
  database.run(`
    ALTER TABLE training_sessions ADD COLUMN param_count INTEGER;
  `)
  database.run(`
    ALTER TABLE training_sessions ADD COLUMN validation_loss FLOAT;
  `)
  database.run(`
    ALTER TABLE training_sessions ADD COLUMN validation_mae FLOAT;
  `)
  database.run(`
    ALTER TABLE training_sessions ADD COLUMN model_path TEXT;
  `)
  database.run(`
    ALTER TABLE training_sessions ADD COLUMN notes TEXT;
  `)

  // Create indexes for performance
  database.run(`CREATE INDEX IF NOT EXISTS idx_exclusions_user ON item_exclusions(user_id);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_exclusions_item ON item_exclusions(item_id);`)

  saveDb()
  console.log('✅ Migration complete: outfit trainer v2 schema upgraded')
}

export default { migrate }
