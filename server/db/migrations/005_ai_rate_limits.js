export async function migrate(db) {
  if (!db) {
    const { getDb } = await import('../client.js')
    db = await getDb()
  }

  // Add plan to users
  try { db.run(`ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`) } catch (e) { /* already exists */ }

  // API usage tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, endpoint, date)
    )
  `)

  console.log('✅ Migration 005_ai_rate_limits applied')
}
