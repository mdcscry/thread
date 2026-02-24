# Contributing to outerfit

## Rule #1: Every Feature Needs Tests

**Every new service, route, or utility file MUST have a corresponding test file.**

| New file | Required test file |
|----------|-------------------|
| `server/services/FooService.js` | `tests/foo-service.test.js` |
| `server/routes/foo.js` | `tests/foo-routes.test.js` (integration) |
| `server/utils/foo.js` | `tests/foo.test.js` |

No exceptions. If you add a file without tests, the PR will not be merged.

## Test Requirements

- **Unit tests**: Mock external dependencies (Sharp, Stripe, Lago, DB). Test logic in isolation.
- **Integration tests**: Use `tests/setup.js` for a fresh test DB. Test real HTTP routes with supertest.
- **Coverage**: Happy path + at least 2 error/edge cases per function.

## Running Tests

```bash
# Unit tests (fast, no server needed)
npx vitest run tests/entitlement-service.test.js tests/lago-service.test.js \
  tests/stripe-service.test.js tests/rate-limit.test.js tests/gdpr.test.js \
  tests/feature-engine.test.js tests/gemini-vision.test.js tests/image-service.test.js

# Auth integration tests (needs test DB)
NODE_ENV=test npx vitest run tests/auth-routes.test.js

# All unit tests
npx vitest run

# All Playwright E2E (needs live server on port 3000)
npx playwright test
```

## Code Quality — Roborev

Every commit is automatically reviewed by roborev (AI code review daemon).

- **P verdict** = clean, no issues
- **F verdict** = issues found, must fix before moving on
- **Any severity level (High/Medium/Low) = F verdict** — fix everything
- Check verdict: `roborev status`
- Read review: `roborev show <job_id>`
- Full branch audit: `roborev review --branch --wait`

Do not merge branches with F verdicts.

## Commit Style

```
feat: add ImageService for Sharp-based compression
fix: correct path traversal check in serveImage
test: add ImageService unit tests
docs: update image standards
chore: add sharp dependency
```

## Stack Quick Reference

- **Backend**: Fastify + sql.js (SQLite)
- **Frontend**: React SPA, mobile-first PWA
- **Vision AI**: Gemini 2.5 Flash → Ollama fallback
- **Image processing**: Sharp (server), Canvas API (client)
- **Billing**: Lago + Stripe
- **Tests**: Vitest (unit) + Playwright (E2E) + supertest (integration)
- **DB path**: `data/thread.db` (dev), `/tmp/thread-test-{pid}.db` (test)
