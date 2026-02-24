export function migrate() {
  const { prepare: db } = require('../client.js')
  
  // Add plan to users
  try {
    db(`ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`).run()
  } catch (e) {
    // Column may already exist
  }
  
  // API usage tracking
  db(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, endpoint, date)
    )
  `).run()
  
  console.log('✅ Migration 005_ai_rate_limits applied')
}
