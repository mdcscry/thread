import { initializeDatabase } from './client.js'
import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Run migrations
await initializeDatabase()

// Run any migration files
const migrationsDir = path.join(__dirname, 'migrations')
try {
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort()
  
  for (const file of files) {
    console.log(`Running migration: ${file}`)
    const migration = await import(path.join(migrationsDir, file))
    if (migration.migrate) {
      await migration.migrate()
    }
  }
} catch (e) {
  // Migrations directory might not exist or be empty
  console.log('No migrations to run or migrations dir not found')
}

console.log('✅ Migrations complete')
