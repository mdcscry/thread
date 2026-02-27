/**
 * Playwright global teardown — kills the test server and wipes the test DB.
 */

import { existsSync, rmSync, readFileSync } from 'fs'

const TEST_DB = '/tmp/thread-playwright-test.db'
const TEST_SERVER_PID_FILE = '/tmp/thread-playwright-server.pid'

export default async function teardown() {
  if (process.env.SKIP_GLOBAL_SETUP) return
  if (existsSync(TEST_SERVER_PID_FILE)) {
    const pid = parseInt(readFileSync(TEST_SERVER_PID_FILE, 'utf8').trim(), 10)
    try {
      process.kill(pid, 'SIGTERM')
      console.log(`[playwright-teardown] Killed test server (pid ${pid})`)
    } catch (e) {
      console.warn(`[playwright-teardown] Could not kill pid ${pid}: ${e.message}`)
    }
    rmSync(TEST_SERVER_PID_FILE)
  }

  if (existsSync(TEST_DB)) {
    rmSync(TEST_DB)
    console.log('[playwright-teardown] Test DB wiped.')
  }
}
