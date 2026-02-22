// Migration: Create invites and wardrobe_shares tables
// Feature 13: Multi-user invite flow

import { prepare as db, getDb, saveDb } from '../client.js'

export async function migrate() {
  console.log('Running migration: create invites and wardrobe_shares tables')
  
  const database = await getDb()
  
  // Create invites table
  database.run(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      inviter_user_id INTEGER NOT NULL,
      invitee_email TEXT,
      permissions TEXT DEFAULT '["view"]',
      status TEXT DEFAULT 'pending',
      expires_at DATETIME,
      accepted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (inviter_user_id) REFERENCES users(id)
    );
  `)
  
  // Create wardrobe_shares table
  database.run(`
    CREATE TABLE IF NOT EXISTS wardrobe_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      shared_with_user_id INTEGER NOT NULL,
      permissions TEXT DEFAULT '["view"]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (owner_user_id) REFERENCES users(id),
      FOREIGN KEY (shared_with_user_id) REFERENCES users(id),
      UNIQUE(owner_user_id, shared_with_user_id)
    );
  `)
  
  // Create indexes
  database.run(`CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_invites_user ON invites(inviter_user_id);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_shares_owner ON wardrobe_shares(owner_user_id);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_shares_shared ON wardrobe_shares(shared_with_user_id);`)
  
  saveDb()
  console.log('✅ Migration complete: invites and wardrobe_shares tables created')
}

export default { migrate }
