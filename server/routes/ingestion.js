import { authenticateApiKey } from '../middleware/auth.js'
import { requireEntitlement } from '../middleware/entitlements.js'
import IngestionService from '../services/IngestionService.js'
import { RateLimitService } from '../services/RateLimitService.js'
import { ImageService } from '../services/ImageService.js'

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
}
