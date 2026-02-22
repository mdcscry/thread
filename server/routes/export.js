import JSZip from 'jszip'
import { authenticateApiKey } from '../middleware/auth.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { pipeline } from 'stream/promises'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'thread.db')
const IMAGES_DIR = path.join(DATA_DIR, 'images')

// Export routes
export default async function exportRoutes(fastify, opts) {
  // GET /export - Export database and images as ZIP
  fastify.get('/export', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    try {
      const zip = new JSZip()
      const timestamp = new Date().toISOString().split('T')[0]
      const userId = request.user.userId

      // Add database file
      if (existsSync(DB_PATH)) {
        const dbBuffer = readFileSync(DB_PATH)
        zip.file('thread.db', dbBuffer)
      } else {
        return reply.code(404).send({ error: 'Database file not found' })
      }

      // Add images folder (user-specific)
      const userImagesDir = path.join(IMAGES_DIR, `user_${userId}`)
      if (existsSync(userImagesDir)) {
        const { readdirSync, statSync } = await import('fs')
        
        // Add all images from user's folder
        const addFolderToZip = (dir, zipDir) => {
          const items = readdirSync(dir)
          for (const item of items) {
            const fullPath = path.join(dir, item)
            const stat = statSync(fullPath)
            if (stat.isDirectory()) {
              addFolderToZip(fullPath, zipDir ? `${zipDir}/${item}` : item)
            } else {
              const buffer = readFileSync(fullPath)
              const relativePath = path.relative(IMAGES_DIR, fullPath)
              zip.file(relativePath, buffer)
            }
          }
        }
        
        addFolderToZip(userImagesDir, '')
      }

      // Add metadata file
      const metadata = {
        exportedAt: new Date().toISOString(),
        userId: userId,
        version: '1.0.0'
      }
      zip.file('metadata.json', JSON.stringify(metadata, null, 2))

      // Generate ZIP
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      
      // Send ZIP file
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', `attachment; filename="thread-export-${timestamp}.zip"`)
      return reply.send(zipBuffer)
      
    } catch (error) {
      console.error('Export error:', error)
      return reply.code(500).send({ error: 'Failed to create export', details: error.message })
    }
  })

  // POST /import - Import database and images from ZIP
  fastify.post('/import', { 
    preHandler: [authenticateApiKey],
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    try {
      const data = await request.file()
      
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' })
      }

      const userId = request.user.userId
      const filename = data.filename
      
      // Validate filename extension
      if (!filename.endsWith('.zip')) {
        return reply.code(400).send({ error: 'Invalid file type. Expected .zip' })
      }

      // Save uploaded file to temp location
      const tempDir = path.join(os.tmpdir(), `thread-import-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })
      
      const tempZipPath = path.join(tempDir, 'import.zip')
      await pipeline(data.file, createWriteStream(tempZipPath))

      try {
        // Read and validate ZIP
        const zipBuffer = readFileSync(tempZipPath)
        const zip = await JSZip.loadAsync(zipBuffer)
        
        // Check for required files
        const fileNames = Object.keys(zip.files)
        if (!fileNames.includes('thread.db')) {
          return reply.code(400).send({ error: 'Invalid export: missing thread.db' })
        }
        
        if (!fileNames.includes('metadata.json')) {
          return reply.code(400).send({ error: 'Invalid export: missing metadata.json' })
        }

        // Validate metadata
        const metadataContent = await zip.file('metadata.json').async('string')
        const metadata = JSON.parse(metadataContent)
        
        // Backup current data
        const backupDir = path.join(DATA_DIR, 'backups')
        if (!existsSync(backupDir)) {
          mkdirSync(backupDir, { recursive: true })
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const backupPath = path.join(backupDir, `backup-${timestamp}`)
        mkdirSync(backupPath, { recursive: true })
        
        // Backup current database
        if (existsSync(DB_PATH)) {
          const backupDbPath = path.join(backupPath, 'thread.db')
          writeFileSync(backupDbPath, readFileSync(DB_PATH))
        }
        
        // Backup current user images
        const userImagesDir = path.join(IMAGES_DIR, `user_${userId}`)
        if (existsSync(userImagesDir)) {
          const { copyFileSync, mkdirSync: fsMkdirSync, readdirSync: fsReaddirSync, statSync: fsStatSync } = await import('fs')
          const backupImagesDir = path.join(backupPath, 'images', `user_${userId}`)
          fsMkdirSync(backupImagesDir, { recursive: true })
          
          const copyDir = (src, dest) => {
            fsMkdirSync(dest, { recursive: true })
            for (const item of fsReaddirSync(src)) {
              const srcPath = path.join(src, item)
              const destPath = path.join(dest, item)
              if (fsStatSync(srcPath).isDirectory()) {
                copyDir(srcPath, destPath)
              } else {
                copyFileSync(srcPath, destPath)
              }
            }
          }
          copyDir(userImagesDir, backupImagesDir)
        }

        // Extract database from ZIP
        const dbBuffer = await zip.file('thread.db').async('nodebuffer')
        
        // Replace current database with imported one
        // Close and reload the database after replacing the file
        const { closeAndReloadDatabase } = await import('../db/client.js')
        writeFileSync(DB_PATH, dbBuffer)
        
        // Reload the database to pick up the new data
        await closeAndReloadDatabase()

        // Extract images from ZIP
        const { mkdirSync: fsMkdir, writeFileSync: fsWrite, readdirSync: fsRead, statSync: fsStat } = await import('fs')
        
        // Clear existing user images and replace
        if (existsSync(userImagesDir)) {
          rmSync(userImagesDir, { recursive: true, force: true })
        }
        fsMkdir(userImagesDir, { recursive: true })
        
        // Extract all files from ZIP
        for (const [filePath, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir || filePath === 'thread.db' || filePath === 'metadata.json') {
            continue // Skip directories and metadata files
          }
          
          const fullPath = path.join(IMAGES_DIR, filePath)
          const dir = path.dirname(fullPath)
          
          if (!existsSync(dir)) {
            fsMkdir(dir, { recursive: true })
          }
          
          const fileBuffer = await zipEntry.async('nodebuffer')
          fsWrite(fullPath, fileBuffer)
        }

        return reply.send({ 
          success: true, 
          message: 'Import completed successfully',
          backupLocation: backupPath,
          metadata: metadata
        })
        
      } catch (extractError) {
        console.error('Extract error:', extractError)
        return reply.code(400).send({ error: 'Failed to extract import file', details: extractError.message })
      } finally {
        // Clean up temp directory
        try {
          rmSync(tempDir, { recursive: true, force: true })
        } catch (e) {
          console.error('Failed to cleanup temp dir:', e)
        }
      }
      
    } catch (error) {
      console.error('Import error:', error)
      return reply.code(500).send({ error: 'Failed to process import', details: error.message })
    }
  })
}
