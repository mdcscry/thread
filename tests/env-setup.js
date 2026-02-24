// This file runs BEFORE any imports — sets env vars for test DB isolation
process.env.NODE_ENV = 'test'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
process.env.SENTRY_DSN = ''
process.env.DATABASE_PATH = `/tmp/thread-test-${process.pid}.db`
