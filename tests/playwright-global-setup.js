/**
 * Playwright global setup — spins up the THREAD server with an isolated
 * test database before e2e tests run.
 *
 * Test server: https://localhost:3000
 * Test DB:     /tmp/thread-playwright-test.db (ephemeral, wiped each run)
 * Test user:   test@thread.test / testpass123
 */

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync, rmSync } from 'fs'
import https from 'https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')
export const TEST_DB = '/tmp/thread-playwright-test.db'
export const TEST_SERVER_PID_FILE = '/tmp/thread-playwright-server.pid'

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = https.get(
          'https://localhost:3000/health',
          { rejectUnauthorized: false },
          (res) => { res.resume(); resolve() }
        )
        req.on('error', reject)
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')) })
      })
      return
    } catch {
      await new Promise(r => setTimeout(r, 300))
    }
  }
  throw new Error('Test server did not start within 15s')
}

async function registerUser(email, password, firstName = 'Test') {
  const payload = JSON.stringify({ email, password, firstName })
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      rejectUnauthorized: false,
    }, (res) => { res.resume(); res.on('end', resolve) })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function seedTestUser() {
  // Seed both: the canonical test user and the legacy dev user the specs reference
  await registerUser('test@thread.test', 'testpass123')
  await registerUser('you@local.test', 'thread123')  // valid email format
  console.log('[playwright-setup] Test users seeded.')
}

export default async function setup() {
  if (process.env.SKIP_GLOBAL_SETUP) {
    console.log('[playwright-setup] Skipping (SKIP_GLOBAL_SETUP set)')
    return
  }
  // Wipe old test DB
  if (existsSync(TEST_DB)) rmSync(TEST_DB)

  console.log('[playwright-setup] Starting test server with isolated DB...')
  const server = spawn('node', ['server/index.js'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_PATH: TEST_DB,
      PORT: '3000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  // Store PID for teardown
  import('fs').then(({ writeFileSync }) =>
    writeFileSync(TEST_SERVER_PID_FILE, String(server.pid))
  )

  server.stdout.on('data', d => process.stdout.write(`[server] ${d}`))
  server.stderr.on('data', d => process.stderr.write(`[server] ${d}`))
  server.unref()

  await waitForServer()
  console.log('[playwright-setup] Server ready — seeding test user...')
  await seedTestUser()
  console.log('[playwright-setup] Ready.')
}
