import { authenticateApiKey } from '../middleware/auth.js'
import { requireEntitlement } from '../middleware/entitlements.js'
import IngestionService from '../services/IngestionService.js'
import { RateLimitService } from '../services/RateLimitService.js'
import { ImageService } from '../services/ImageService.js'
import https from 'https'
import http from 'http'

let ingestionService = null
let imageService = null

export default async function ingestionRoutes(fastify, opts) {
  if (!ingestionService) {
    ingestionService = new IngestionService()
  }
  if (!imageService) {
    imageService = new ImageService()
  }

  // Start ingestion job (requires item entitlement)
  fastify.post('/ingestion/start', { preHandler: [authenticateApiKey, requireEntitlement('items')] }, async (request, reply) => {
    const { userId } = request.user
    const { sourceUrl, sourceType = 'google_drive', model } = request.body
    
    // Check rate limit for Gemini vision
    const rateCheck = await RateLimitService.checkLimit(userId, 'gemini_vision')
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        limit: rateCheck.limit,
        remaining: 0,
        plan: rateCheck.plan
      })
    }

    if (!sourceUrl) {
      return reply.code(400).send({ error: 'sourceUrl is required' })
    }

    // Start job in background
    const job = ingestionService.startJob(userId, sourceUrl, sourceType, model)
      .then(result => {
        console.log('Ingestion job complete:', result)
      })
      .catch(error => {
        console.error('Ingestion job failed:', error)
      })

    return { 
      message: 'Job started',
      status: 'running'
    }
  })

  // Get job status
  fastify.get('/ingestion/:jobId', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { jobId } = request.params

    const job = ingestionService.getJobStatus(jobId)
    
    if (!job || job.user_id !== userId) {
      return reply.code(404).send({ error: 'Job not found' })
    }

    return job
  })

  // List jobs
  fastify.get('/ingestion', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { limit = 20 } = request.query

    return ingestionService.listJobs(userId, parseInt(limit))
  })

  // Quick endpoint: check if Ollama is running
  fastify.get('/ingestion/check-ollama', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const isHealthy = await ingestionService.ollama.checkHealth()
    const models = isHealthy ? await ingestionService.ollama.listModels() : []
    
    return {
      healthy: isHealthy,
      models,
      defaultModel: ingestionService.ollama.model
    }
  })

  // Upload single photo (camera companion)
  fastify.post('/ingestion/upload-photo', { preHandler: [authenticateApiKey], config: { limits: { fileSize: 2 * 1024 * 1024 } } }, async (request, reply) => {
    const { userId } = request.user
    
    try {
      const data = await request.file()
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' })
      }

      if (!data.mimetype.startsWith('image/')) {
        return reply.code(400).send({ error: 'File must be an image' })
      }

      const buffer = await data.toBuffer()
      const result = await imageService.processAndStore(buffer, userId)
      
      return { 
        filename: result.filename,
        size: result.size,
        width: result.width,
        height: result.height,
      }
    } catch (err) {
      console.error('Upload error:', err)
      if (err.message.includes('too small')) {
        return reply.code(422).send({ error: err.message, code: 'IMAGE_TOO_SMALL' })
      }
      return reply.code(500).send({ error: err.message })
    }
  })

  // Upload single photo as JSON (base64) - simpler than multipart
  fastify.post('/ingestion/upload-photo-json', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { image, filename } = request.body
    
    if (!image) {
      return reply.code(400).send({ error: 'image is required' })
    }
    
    try {
      // Remove data URL prefix if present
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      
      const itemId = await ingestionService.processSinglePhoto(userId, buffer, filename || 'photo.jpg')
      
      return { 
        success: true, 
        itemId,
        message: 'Photo analyzed and added to wardrobe'
      }
    } catch (err) {
      console.error('Upload error:', err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // Upload photo from URL
  fastify.post('/ingestion/upload-from-url', { preHandler: [authenticateApiKey] }, async (request, reply) => {
    const { userId } = request.user
    const { url, filename } = request.body

    if (!url) {
      return reply.code(400).send({ error: 'url is required' })
    }

    // Only allow http/https
    let parsedUrl
    try {
      parsedUrl = new URL(url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return reply.code(400).send({ error: 'Only http/https URLs are supported' })
      }
    } catch {
      return reply.code(400).send({ error: 'Invalid URL' })
    }

    try {
      // Fetch the image
      const buffer = await new Promise((resolve, reject) => {
        const client = parsedUrl.protocol === 'https:' ? https : http
        const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to fetch image: HTTP ${res.statusCode}`))
          }
          const contentType = res.headers['content-type'] || ''
          if (!contentType.startsWith('image/')) {
            return reject(new Error(`URL does not point to an image (${contentType})`))
          }
          const chunks = []
          res.on('data', chunk => chunks.push(chunk))
          res.on('end', () => resolve(Buffer.concat(chunks)))
          res.on('error', reject)
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
      })

      if (buffer.length > 10 * 1024 * 1024) {
        return reply.code(400).send({ error: 'Image too large (max 10MB)' })
      }

      const derivedFilename = filename || parsedUrl.pathname.split('/').pop() || 'photo.jpg'
      const itemId = await ingestionService.processSinglePhoto(userId, buffer, derivedFilename)

      return {
        success: true,
        itemId,
        message: 'Photo fetched from URL and added to wardrobe'
      }
    } catch (err) {
      console.error('Upload-from-url error:', err)
      return reply.code(500).send({ error: err.message })
    }
  })
}
