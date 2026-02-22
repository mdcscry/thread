import Fastify from 'fastify'
import cors from '@fastify/cors'
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

// Initialize database
import { initializeDatabase } from './db/client.js'

// Load TLS certs if present
const certPath = path.join(__dirname, '../certs/cert.pem')
const keyPath = path.join(__dirname, '../certs/key.pem')
const tlsOptions = existsSync(certPath) && existsSync(keyPath)
  ? { https: { cert: readFileSync(certPath), key: readFileSync(keyPath) } }
  : {}

const fastify = Fastify({
  logger: true,
  ...tlsOptions
})

// Register plugins
await fastify.register(cors, {
  origin: true,
  credentials: true
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

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
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

start()
