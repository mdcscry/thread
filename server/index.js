import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'
import dotenv from 'dotenv'

dotenv.config()

// Prevent unhandled rejections from crashing the server
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Import routes
import itemsRoutes from './routes/items.js'
import outfitsRoutes from './routes/outfits.js'
import outfitsFromItemRoutes from './routes/outfits-from-item.js'
import ingestionRoutes from './routes/ingestion.js'
import weatherRoutes from './routes/weather.js'
import vacationRoutes from './routes/vacation.js'
import settingsRoutes from './routes/settings.js'
import usersRoutes from './routes/users.js'
import voiceRoutes from './routes/voice.js'
import onboardingRoutes from './routes/onboarding.js'
import inviteRoutes from './routes/invites.js'
import exportRoutes from './routes/export.js'
import outfitTrainerRoutes from './routes/outfit-trainer.js'

// Initialize database
import { initializeDatabase } from './db/client.js'

// Load TLS certs if present
const certPath = path.join(__dirname, '../certs/cert.pem')
const keyPath = path.join(__dirname, '../certs/key.pem')
const tlsOptions = existsSync(certPath) && existsSync(keyPath)
  ? { https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } }
  : {}

const isProduction = process.env.NODE_ENV === 'production'

const fastify = Fastify({
  logger: isProduction
    ? { level: 'info' }                    // Structured JSON logs for Render
    : { level: 'info', transport: { target: 'pino-pretty' } },  // Pretty logs for dev
  ...tlsOptions
})

// Handle empty JSON bodies gracefully
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    if (!body || body === '') {
      req.body = {}
    } else {
      req.body = JSON.parse(body)
    }
    done(null, req.body)
  } catch (err) {
    done(err)
  }
})

// Register plugins
await fastify.register(cors, {
  origin: true,
  credentials: true
})

// Security headers (CSP, HSTS, X-Frame-Options, etc.)
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // Vite dev needs inline
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],  // Allow image URLs
      connectSrc: ["'self'", "ws:", "wss:", "https://api.open-meteo.com"],
    }
  },
  crossOriginEmbedderPolicy: false,  // Allow loading external images
})

// Global rate limiting
await fastify.register(rateLimit, {
  max: 200,          // 200 requests per minute globally
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    return request.headers['x-forwarded-for'] || request.ip
  }
})

await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
})

await fastify.register(websocket)

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../client/dist'),
  prefix: '/',
  wildcard: false,
  index: 'index.html'
})

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../data/images'),
  prefix: '/images',
  decorateReply: false
})

// Initialize database (async for sql.js)
await initializeDatabase()

// Run migrations on startup (idempotent — safe to re-run)
try {
  const migrationsDir = path.join(__dirname, 'db', 'migrations')
  if (existsSync(migrationsDir)) {
    const { readdirSync } = await import('fs')
    const files = readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort()
    for (const file of files) {
      const migration = await import(path.join(migrationsDir, file))
      if (migration.migrate) await migration.migrate()
    }
    console.log(`✅ ${files.length} migration(s) checked`)
  }
} catch (e) {
  console.error('Migration error (non-fatal):', e.message)
}

// Register routes
fastify.register(itemsRoutes, { prefix: '/api/v1' })
fastify.register(outfitsRoutes, { prefix: '/api/v1' })
fastify.register(outfitsFromItemRoutes, { prefix: '/api/v1' })
fastify.register(ingestionRoutes, { prefix: '/api/v1' })
fastify.register(weatherRoutes, { prefix: '/api/v1' })
fastify.register(vacationRoutes, { prefix: '/api/v1' })
fastify.register(settingsRoutes, { prefix: '/api/v1' })
fastify.register(usersRoutes, { prefix: '/api/v1' })
fastify.register(voiceRoutes, { prefix: '/api/v1' })
fastify.register(onboardingRoutes, { prefix: '/api/v1' })
fastify.register(inviteRoutes, { prefix: '/api/v1' })
fastify.register(exportRoutes, { prefix: '/api/v1' })
fastify.register(outfitTrainerRoutes, { prefix: '/api/v1' })

// Health check (Render uses this for zero-downtime deploys)
fastify.get('/health', async () => {
  let dbOk = false
  try {
    const { prepare } = await import('./db/client.js')
    const result = prepare('SELECT COUNT(*) as count FROM users').get()
    dbOk = result != null
  } catch {}
  return {
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  }
})

// Serve mkcert CA cert for phone trust installation
fastify.get('/ca.crt', async (request, reply) => {
  const { execSync } = await import('child_process')
  try {
    const caRoot = execSync('mkcert -CAROOT').toString().trim()
    const caFile = path.join(caRoot, 'rootCA.pem')
    const cert = readFileSync(caFile)
    reply.header('Content-Type', 'application/x-x509-ca-cert')
    reply.header('Content-Disposition', 'attachment; filename="thread-ca.crt"')
    return reply.send(cert)
  } catch {
    return reply.status(404).send('CA cert not found')
  }
})

// Root - serve index.html for SPA
fastify.get('*', async (request, reply) => {
  return reply.sendFile('index.html')
})

// Start server
const start = async () => {
  const port = parseInt(process.env.PORT || '3000')
  const host = process.env.HOST || '0.0.0.0'

  try {
    await fastify.listen({ port, host })
    const proto = tlsOptions.https ? 'https' : 'http'
    console.log(`
🧵 THREAD - AI Wardrobe Stylist
   Local:   ${proto}://localhost:${port}
   Network: ${proto}://10.0.0.190:${port}
`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown (Render sends SIGTERM)
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`)
  try {
    await fastify.close()
    console.log('Server closed. Goodbye.')
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err)
    process.exit(1)
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()
