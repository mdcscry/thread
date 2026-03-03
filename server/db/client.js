import { Pool } from 'pg'

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://plotlines:plines2026@localhost:5432/thread',
})

// Convert ? placeholders to $1, $2, etc.
function convertParams(sql, params) {
  if (!params || params.length === 0) return { sql, params }
  
  let paramIndex = 1
  const newSql = sql.replace(/\?/g, () => `$${paramIndex++}`)
  return { sql: newSql, params }
}

// Get database connection
export async function getDb() {
  return pool
}

// Save database - no-op for PostgreSQL (auto-commits)
export function saveDb() {
  // PostgreSQL auto-commits, nothing to do
}

// Close and reload database
export async function closeAndReloadDatabase() {
  await pool.end()
  return pool
}

// Helper for running queries - returns results as objects
export function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const { sql: finalSql, params: finalParams } = convertParams(sql, params)
    pool.query(finalSql, finalParams, (err, result) => {
      if (err) {
        console.error('SQL Error:', err.message, finalSql)
        reject(err)
      } else {
        resolve(result.rows)
      }
    })
  })
}

// Helper for running exec (INSERT/UPDATE/DELETE)
export function runExec(sql, params = []) {
  return new Promise((resolve, reject) => {
    const { sql: finalSql, params: finalParams } = convertParams(sql, params)
    pool.query(finalSql, finalParams, (err, result) => {
      if (err) {
        console.error('SQL Error:', err.message, finalSql)
        reject(err)
      } else {
        resolve({ lastInsertRowid: parseInt(result.insertId) || 0, changes: result.rowCount || 0 })
      }
    })
  })
}

// Simple wrapper that mimics better-sqlite3 API
export function prepare(sql) {
  return {
    all: async (...params) => {
      const { sql: finalSql, params: finalParams } = convertParams(sql, params)
      const result = await pool.query(finalSql, finalParams)
      return result.rows
    },
    get: async (...params) => {
      const { sql: finalSql, params: finalParams } = convertParams(sql, params)
      const result = await pool.query(finalSql, finalParams)
      return result.rows[0] || null
    },
    run: async (...params) => {
      const { sql: finalSql, params: finalParams } = convertParams(sql, params)
      const result = await pool.query(finalSql, finalParams)
      return { lastInsertRowid: parseInt(result.insertId) || 0, changes: result.rowCount || 0 }
    }
  }
}

// Initialize tables (no-op - tables already exist in Postgres)
export async function initializeDatabase() {
  console.log('Database initialized (PostgreSQL)')
}

// Default export
export default {
  getDb,
  saveDb,
  closeAndReloadDatabase,
  runQuery,
  runExec,
  prepare,
  initializeDatabase
}
