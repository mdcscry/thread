export function migrate() {
  const { prepare: db } = require('../client.js')
  
  // Password reset tokens table
  db(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run()
  
  // Email verification tokens table
  db(`
    ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0
  `).run()
  
  db(`
    ALTER TABLE users ADD COLUMN email_verify_token TEXT
  `).run()
  
  console.log('✅ Migration 004_auth_extras applied')
}
