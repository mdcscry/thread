import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import db, { runExec, runQuery, saveDb } from '../db/client.js'
import OllamaService from './OllamaService.js'

const IMAGE_ROOT = process.env.IMAGE_STORAGE_PATH || '/Users/matthewcryer/Documents/outerfit/data/images'

// Returns { diskPath, dbPath } — diskPath for sharp/fs, dbPath for DB storage
function imagePaths(userId, hash, suffix) {
  const filename = `${hash}_${suffix}.jpg`
  return {
    diskPath: path.join(IMAGE_ROOT, `user_${userId}`, filename),
    dbPath: `user_${userId}/${filename}`
  }
}

export class IngestionService {
  constructor() {
    this.ollama = new OllamaService()
  }

  async startJob(userId, sourceUrl, sourceType = 'google_drive', model = null) {
    if (model) {
      this.ollama = new OllamaService(model)
    }

    // Create job
    const insert = db.prepare(`
      INSERT INTO ingestion_jobs (user_id, source_url, source_type, status, ai_model)
      VALUES (?, ?, ?, 'running', ?)
    `)
    const result = insert.run(userId, sourceUrl, sourceType, this.ollama.model)
    const jobId = result.lastInsertRowid

    try {
      // Discover images
      const imageUrls = await this.discoverImages(sourceUrl, sourceType)
      
      // Update job with total
      db.prepare(`UPDATE ingestion_jobs SET total_images = ? WHERE id = ?`)
        .run(imageUrls.length, jobId)

      let processed = 0
      let failed = 0
      const errors = []

      for (const url of imageUrls) {
        try {
          await this.processImage(userId, jobId, url)
          processed++
        } catch (error) {
          failed++
          errors.push({ url, error: error.message })
        }
        
        // Update progress
        db.prepare(`UPDATE ingestion_jobs SET processed = ?, failed = ? WHERE id = ?`)
          .run(processed, failed, jobId)
      }

      // Mark complete
      db.prepare(`UPDATE ingestion_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(jobId)

      return { jobId, processed, failed, total: imageUrls.length }

    } catch (error) {
      db.prepare(`UPDATE ingestion_jobs SET status = 'failed', error_log = ? WHERE id = ?`)
        .run(JSON.stringify([error.message]), jobId)
      throw error
    }
  }

  async discoverImages(sourceUrl, sourceType) {
    switch (sourceType) {
      case 'google_drive':
        return this.discoverGoogleDrive(sourceUrl)
      case 'url':
        return [sourceUrl] // Direct URL - just return it as a single-item array
      case 'webpage':
        return this.parseUrlList(sourceUrl)
      case 'url_list':
        return this.parseUrlList(sourceUrl)
      default:
        throw new Error(`Unknown source type: ${sourceType}`)
    }
  }

  async discoverGoogleDrive(folderUrl) {
    // Extract folder ID from URL
    const match = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (!match) {
      throw new Error('Invalid Google Drive folder URL')
    }
    const folderId = match[1]

    // Fetch the folder page
    const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`)
    const html = await response.text()

    // Extract file IDs and names from the page
    const imageUrls = []
    const imageExtensions = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif']
    
    // Google's page structure changes, but files are usually in a data attribute
    const dataPattern = /\["([a-zA-Z0-9_-]{28,})","([^"]+\.(" + imageExtensions.join('|') + "))"/gi
    
    let matchResult
    while ((matchResult = dataPattern.exec(html)) !== null) {
      const fileId = matchResult[1]
      const fileName = matchResult[2]
      const ext = fileName.split('.').pop().toLowerCase()
      
      if (imageExtensions.includes(ext)) {
        // Direct download URL
        imageUrls.push(`https://drive.google.com/uc?export=download&id=${fileId}`)
      }
    }

    // Fallback: try to scrape differently if no results
    if (imageUrls.length === 0) {
      // Try alternative pattern
      const altPattern = /"([a-zA-Z0-9_-]{28,})":\s*"([^"]+\.(" + imageExtensions.join('|') + "))/gi
      while ((matchResult = altPattern.exec(html)) !== null) {
        const fileId = matchResult[1]
        imageUrls.push(`https://drive.google.com/uc?export=download&id=${fileId}`)
      }
    }

    return imageUrls
  }

  parseUrlList(text) {
    const urls = text.split(/[\n,]/).map(u => u.trim()).filter(u => u.startsWith('http'))
    return urls
  }

  async processImage(userId, jobId, imageUrl) {
    // Download image
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`)
    }
    
    const buffer = await response.arrayBuffer()
    const inputBuffer = Buffer.from(buffer)

    // Generate hash for filename
    const hash = crypto.createHash('md5').update(inputBuffer).digest('hex').slice(0, 12)
    
    // Ensure user directory exists
    const userDir = path.join(IMAGE_ROOT, `user_${userId}`)
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })

    const full   = imagePaths(userId, hash, 'full')
    const medium = imagePaths(userId, hash, 'medium')
    const thumb  = imagePaths(userId, hash, 'thumb')

    await sharp(inputBuffer).jpeg({ quality: 90 }).toFile(full.diskPath)
    await sharp(inputBuffer).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toFile(medium.diskPath)
    await sharp(inputBuffer).resize(300, 300, { fit: 'cover', position: 'top' }).jpeg({ quality: 80 }).toFile(thumb.diskPath)

    // Analyze with Ollama
    let analysis = null
    let aiFlagged = 0
    let aiConfidence = 0

    try {
      analysis = await this.ollama.analyzeImageStructured(mediumPath)
      
      if (analysis.structured) {
        const s = analysis.structured
        aiConfidence = s.confidence || 0
        
        // Flag if low confidence or many uncertain fields
        const uncertainCount = (s.uncertain_fields || []).length
        if (aiConfidence < 0.7 || uncertainCount > 2) {
          aiFlagged = 1
        }
      }
    } catch (error) {
      console.error('AI analysis failed:', error)
      aiFlagged = 1
    }

    const s = analysis?.structured || {}

    const { lastInsertRowid: itemId } = runExec(`
      INSERT INTO clothing_items (
        user_id, source_url,
        category, subcategory, primary_color, secondary_color, weft_color, colors,
        pattern, material, texture, silhouette, fit, length,
        style_tags, occasion, formality, season, weight,
        temp_min_f, temp_max_f, ai_confidence, ai_flagged,
        ai_raw_description, ai_model_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, imageUrl,
      s.category || null, s.subcategory || null, s.primary_color || null, s.secondary_color || null, s.weft_color || null,
      JSON.stringify(s.colors || []),
      s.pattern || null, s.material || null, s.texture || null, s.silhouette || null, s.fit || null, s.length || null,
      JSON.stringify(s.style_tags || []), JSON.stringify(s.occasion || []), s.formality || 5,
      JSON.stringify(s.season || []), s.weight || null,
      s.temp_min_f || 45, s.temp_max_f || 85, aiConfidence, aiFlagged,
      analysis?.rawDescription || null, analysis?.model || null
    ])

    runExec(`
      INSERT INTO item_images (item_id, path_full, path_medium, path_thumb, photo_type, is_primary)
      VALUES (?, ?, ?, ?, 'unknown', 1)
    `, [itemId, full.dbPath, medium.dbPath, thumb.dbPath])

    // Create refinement prompts for flagged items
    if (aiFlagged && analysis?.structured?.uncertain_fields?.length > 0) {
      for (const field of analysis.structured.uncertain_fields) {
        const questions = {
          material: 'What material is this item?',
          weight: 'How heavy/warm is this item?',
          season: 'What seasons would you wear this in?',
          category: 'What type of clothing is this?',
          formality: 'On a scale 1-10, how formal is this item?'
        }
        
        if (questions[field]) {
          db.prepare(`
            INSERT INTO refinement_prompts (user_id, item_id, question, field_name)
            VALUES (?, ?, ?, ?)
          `).run(userId, itemId, questions[field], field)
        }
      }
    }

    return itemId
  }

  // Process a single photo (from camera)
  async processSinglePhoto(userId, buffer, filename = 'photo.jpg') {
    const inputBuffer = Buffer.from(buffer)
    const hash = crypto.createHash('md5').update(inputBuffer).digest('hex').slice(0, 12)
    
    const userDir = path.join(IMAGE_ROOT, `user_${userId}`)
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true })

    const full   = imagePaths(userId, hash, 'full')
    const medium = imagePaths(userId, hash, 'medium')
    const thumb  = imagePaths(userId, hash, 'thumb')

    await sharp(inputBuffer).jpeg({ quality: 90 }).toFile(full.diskPath)
    await sharp(inputBuffer).resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toFile(medium.diskPath)
    await sharp(inputBuffer).resize(300, 300, { fit: 'cover', position: 'top' }).jpeg({ quality: 80 }).toFile(thumb.diskPath)

    // FAST: Insert immediately with pending status, queue for async AI analysis
    const { lastInsertRowid: itemId } = runExec(`
      INSERT INTO clothing_items (
        user_id, name, category, subcategory, primary_color, secondary_color, weft_color, colors,
        pattern, material, texture, silhouette, fit, length, style_tags, occasion,
        formality, season, weight, temp_min_f, temp_max_f, ai_confidence, ai_flagged,
        ai_raw_description, ai_model_used, ai_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, filename.replace(/\.[^.]+$/, ''),
      null, null, null, null, null, '[]',
      null, null, null, null, null, null, '[]', '[]', 5,
      '[]', null, 45, 85, 0, 0,
      null, null, 'pending'
    ])

    if (!itemId) throw new Error('Failed to get itemId after insert')

    runExec(`
      INSERT INTO item_images (item_id, path_full, path_medium, path_thumb, photo_type, is_primary)
      VALUES (?, ?, ?, ?, 'unknown', 1)
    `, [itemId, full.dbPath, medium.dbPath, thumb.dbPath])

    // Queue for background AI analysis (non-blocking)
    this.queueAnalysis(itemId, medium.diskPath)

    return itemId
  }

  // Background queue for AI analysis
  queue = []
  queueProcessing = false

  queueAnalysis(itemId, imagePath) {
    this.queue.push({ itemId, imagePath })
    this.processQueue()
  }

  async processQueue() {
    if (this.queueProcessing || this.queue.length === 0) return
    this.queueProcessing = true
    
    while (this.queue.length > 0) {
      const job = this.queue.shift()
      try {
        await this.analyzeQueuedItem(job.itemId, job.imagePath)
      } catch (err) {
        console.error('Queue analysis failed for item', job.itemId, err.message)
      }
    }
    
    this.queueProcessing = false
  }

  async analyzeQueuedItem(itemId, imagePath) {
    // Update status to processing
    runExec(`UPDATE clothing_items SET ai_status = 'processing' WHERE id = ?`, [itemId])
    
    let analysis = null
    let aiFlagged = 0
    let aiConfidence = 0

    try {
      // Try MiniMax first (fast)
      analysis = await this.ollama.analyzeImageWithMiniMax(imagePath, 'Analyze this clothing item. Be very specific about: type, color(s), material, pattern, texture, fit, silhouette, style tags.')
      
      // MiniMax returns text - extract structured data
      const rawDescription = typeof analysis === 'string' ? analysis : 'No description'
      const lowerDesc = rawDescription.toLowerCase()
      
      const s = {
        category: this.ollama.extractCategory(lowerDesc),
        primary_color: this.ollama.extractColor(lowerDesc),
        material: this.ollama.extractMaterial(lowerDesc),
        fit: this.ollama.extractFit(lowerDesc),
        pattern: this.ollama.extractPattern(lowerDesc),
      }
      
      analysis = {
        rawDescription,
        structured: s,
        model: 'minimax-mcp'
      }
    } catch (error) {
      console.log('MiniMax failed, queuing for Ollama later:', error.message)
      // Keep as 'processing' - will retry with Ollama in next cycle
    }

    // If no analysis, try Ollama (slower)
    if (!analysis?.structured) {
      try {
        console.log('Trying Ollama for item', itemId)
        analysis = await this.ollama.analyzeWithOllamaDirect(imagePath)
      } catch (err) {
        console.error('Ollama also failed for item', itemId, err.message)
      }
    }

    // Update item with results
    const s = analysis?.structured || {}
    const model = analysis?.model || null
    
    runExec(`
      UPDATE clothing_items SET 
        category = ?, subcategory = ?, primary_color = ?, secondary_color = ?, colors = ?,
        pattern = ?, material = ?, ai_confidence = ?, ai_flagged = ?,
        ai_raw_description = ?, ai_model_used = ?, ai_status = ?
      WHERE id = ?
    `, [
      s.category || null, s.subcategory || null, s.primary_color || null, s.secondary_color || null, JSON.stringify(s.colors || []),
      s.pattern || null, s.material || null, s.confidence || 0, aiFlagged,
      analysis?.rawDescription || null, model, analysis ? 'complete' : 'failed', itemId
    ])
  }

  getJobStatus(jobId) {
    return db.prepare('SELECT * FROM ingestion_jobs WHERE id = ?').get(jobId)
  }

  listJobs(userId, limit = 20) {
    return db.prepare(`
      SELECT * FROM ingestion_jobs 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(userId, limit)
  }
}

export default IngestionService
