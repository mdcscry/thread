export async function migrate(db) {
  if (!db) {
    const { getDb } = await import('../client.js')
    db = await getDb()
  }

  // Password reset tokens table
  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // Email verification columns
  try { db.run(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`) } catch (e) { /* already exists */ }
  try { db.run(`ALTER TABLE users ADD COLUMN email_verify_token TEXT`) } catch (e) { /* already exists */ }

  console.log('✅ Migration 004_auth_extras applied')
}
