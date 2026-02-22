import initSqlJs from 'sql.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

// Use absolute path to ensure consistency
const dbPath = process.env.DATABASE_PATH || '/Users/matthewcryer/Documents/outerfit/data/thread.db'

// Ensure data directory exists
const dataDir = path.dirname(dbPath)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// SQL.js database instance
let db = null

// Initialize and get database
export async function getDb() {
  if (db) return db
  
  const SQL = await initSqlJs()
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    console.log('Loading existing DB from:', dbPath)
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    console.log('Creating new DB at:', dbPath)
    db = new SQL.Database()
  }
  
  return db
}

// Save database to disk
export function saveDb() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

// Close and reload database (for import operations)
export async function closeAndReloadDatabase() {
  if (db) {
    db.close()
    db = null
  }
  // Re-initialize
  return await getDb()
}

// Helper for running queries - returns results as objects
export function runQuery(sql, params = []) {
  if (!db) throw new Error('Database not initialized')
  
  // Replace ? placeholders with actual values (one at a time)
  let finalSql = sql
  if (params.length > 0) {
    for (const p of params) {
      const val = p === null ? 'NULL' : typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : p
      finalSql = finalSql.replace(/\?/, val)
    }
  }
  
  const results = []
  const stmt = db.prepare(finalSql)
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

// Helper for running insert/update - returns lastInsertRowid and changes
export function runExec(sql, params = []) {
  if (!db) throw new Error('Database not initialized')

  // Replace ? placeholders with actual values (one at a time)
  let finalSql = sql
  if (params.length > 0) {
    for (const p of params) {
      const val = p === null ? 'NULL' : typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : p
      finalSql = finalSql.replace(/\?/, val)
    }
  }

  db.run(finalSql)

  // Get last insert rowid - handle the result array properly
  let lastId = 0
  try {
    const result = db.exec('SELECT last_insert_rowid() as id')
    if (result && result.length > 0 && result[0].values && result[0].values.length > 0) {
      lastId = result[0].values[0][0]
    }
  } catch (e) {
    console.error('Error getting last insert rowid:', e)
  }

  const changes = db.getRowsModified()
  saveDb() // Save after write
  return { lastInsertRowid: lastId, changes }
}

// Simple wrapper that mimics better-sqlite3 API
export function prepare(sql) {
  return {
    all: (...params) => runQuery(sql, params),
    get: (...params) => {
      const results = runQuery(sql, params)
      return results[0] || null
    },
    run: (...params) => runExec(sql, params)
  }
}

// Initialize tables (revised schema per docs/11-HARD-PROBLEMS-AND-REVISIONS.md)
export async function initializeDatabase() {
  const database = await getDb()
  
  // Run migrations
  try {
    const { readdirSync } = await import('fs')
    const { fileURLToPath } = await import('url')
    const path = await import('path')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const migrationsDir = path.join(__dirname, 'migrations')
    
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort()
    
    for (const file of files) {
      console.log(`Running migration: ${file}`)
      const migration = await import(path.join(migrationsDir, file))
      if (migration.migrate) {
        await migration.migrate()
      }
    }
  } catch (e) {
    // Migrations directory might not exist or be empty - that's fine
  }
  
  // Create tables if they don't exist (won't overwrite data)
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password TEXT,
      api_key TEXT UNIQUE,
      avatar_url TEXT,
      gender TEXT,
      preferences TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- Clothing items (revised: removed single image fields, added EMA + laundry + storage)
    CREATE TABLE IF NOT EXISTS clothing_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      source_url TEXT,
      name TEXT,
      category TEXT,
      subcategory TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      weft_color TEXT,
      colors TEXT DEFAULT '[]',
      pattern TEXT,
      material TEXT,
      texture TEXT,
      silhouette TEXT,
      length TEXT,
      fit TEXT,
      style_tags TEXT DEFAULT '[]',
      occasion TEXT DEFAULT '[]',
      formality INTEGER DEFAULT 5,
      season TEXT DEFAULT '[]',
      weight TEXT,
      temp_min_f INTEGER DEFAULT 30,
      temp_max_f INTEGER DEFAULT 95,
      waterproof INTEGER DEFAULT 0,
      layering_role TEXT,
      ai_confidence REAL DEFAULT 0,
      ai_flagged INTEGER DEFAULT 0,
      user_reviewed INTEGER DEFAULT 0,
      is_loved INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      times_worn INTEGER DEFAULT 0,
      times_worn_confirmed INTEGER DEFAULT 0,
      last_worn DATETIME,
      last_worn_confirmed DATETIME,
      ema_score REAL DEFAULT 0.5,
      ema_count INTEGER DEFAULT 0,
      storage_status TEXT DEFAULT 'active',
      stored_at DATETIME,
      storage_note TEXT,
      in_laundry INTEGER DEFAULT 0,
      laundry_since DATETIME,
      ai_raw_description TEXT,
      ai_model_used TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Create indexes
  database.run(`CREATE INDEX IF NOT EXISTS idx_items_user ON clothing_items(user_id);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_items_category ON clothing_items(category);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_items_flagged ON clothing_items(ai_flagged, user_reviewed);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_items_laundry ON clothing_items(in_laundry);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_items_storage ON clothing_items(storage_status);`)

  database.run(`
    -- Multiple images per item (section 4)
    CREATE TABLE IF NOT EXISTS item_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER REFERENCES clothing_items(id) ON DELETE CASCADE,
      path_full TEXT NOT NULL,
      path_medium TEXT NOT NULL,
      path_thumb TEXT NOT NULL,
      photo_type TEXT DEFAULT 'unknown',
      is_primary INTEGER DEFAULT 0,
      ai_analyzed INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`CREATE INDEX IF NOT EXISTS idx_item_images_item ON item_images(item_id);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_item_images_primary ON item_images(item_id, is_primary);`)

  database.run(`
    -- Outfits
    CREATE TABLE IF NOT EXISTS outfits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      item_ids TEXT NOT NULL,
      occasion TEXT,
      event_name TEXT,
      event_date DATE,
      time_of_day TEXT,
      weather_summary TEXT,
      location TEXT,
      style_intent TEXT,
      chat_prompt TEXT,
      ml_score REAL,
      ml_model_version TEXT,
      feedback INTEGER DEFAULT 0,
      feedback_note TEXT,
      was_worn INTEGER DEFAULT 0,
      was_worn_confirmed_at DATETIME,
      worn_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`CREATE INDEX IF NOT EXISTS idx_outfits_user ON outfits(user_id);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_outfits_feedback ON outfits(feedback);`)
  database.run(`CREATE INDEX IF NOT EXISTS idx_outfits_event_date ON outfits(event_date);`)

  database.run(`
    -- Preference events
    CREATE TABLE IF NOT EXISTS preference_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      outfit_id INTEGER REFERENCES outfits(id),
      event_type TEXT,
      features TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- Ingestion jobs
    CREATE TABLE IF NOT EXISTS ingestion_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      source_url TEXT NOT NULL,
      source_type TEXT,
      status TEXT DEFAULT 'pending',
      total_images INTEGER DEFAULT 0,
      processed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      ai_model TEXT,
      error_log TEXT DEFAULT '[]',
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- Refinement prompts
    CREATE TABLE IF NOT EXISTS refinement_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      item_id INTEGER REFERENCES clothing_items(id),
      question TEXT NOT NULL,
      field_name TEXT,
      status TEXT DEFAULT 'pending',
      answered_at DATETIME,
      answer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- Vacation plans
    CREATE TABLE IF NOT EXISTS vacation_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      destination TEXT,
      start_date DATE,
      end_date DATE,
      num_days INTEGER,
      max_items INTEGER,
      activities TEXT DEFAULT '[]',
      climate TEXT,
      item_ids TEXT DEFAULT '[]',
      outfit_ids TEXT DEFAULT '[]',
      total_outfits INTEGER,
      versatility_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- API keys
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      key_hash TEXT UNIQUE NOT NULL,
      label TEXT,
      permissions TEXT DEFAULT '[]',
      last_used DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- Webhooks
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      url TEXT NOT NULL,
      events TEXT DEFAULT '[]',
      secret TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- Voice notes
    CREATE TABLE IF NOT EXISTS voice_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      raw_audio_path TEXT,
      transcript TEXT NOT NULL,
      intent TEXT,
      confidence REAL,
      action_taken TEXT,
      needs_review INTEGER DEFAULT 0,
      user_confirmed INTEGER DEFAULT 0,
      outfit_id INTEGER REFERENCES outfits(id),
      item_ids TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  database.run(`
    -- Push subscriptions
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      endpoint TEXT NOT NULL,
      keys TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  saveDb()
  console.log('✅ Database initialized (sql.js)')
}

// Default export - initialize on use
export default {
  prepare,
  getDb,
  initializeDatabase,
  saveDb
}
