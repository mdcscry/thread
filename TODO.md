# THREAD — TODO (2026-02-22)

## 🔴 Critical (tests failing)

1. **Fix uploadItem helper in tests** — `items.spec.js` uploads via `http://` in BASE const at top of file — double-check all test files updated to https after sed
2. **`/api/v1/items/flagged` 404** — route `/items/flagged` is being matched by `/items/:id` (Fastify route order issue). Register `/items/flagged` BEFORE `/items/:id`.
3. **Upload → PATCH/DELETE returns 200 on missing item** — after upload, PATCH/DELETE with bad ID should 404, not 200

## 🟡 Bugs to fix

4. **VacationPlanner crashes** — `server/services/VacationPlanner.js` uses `db.prepare().run()` wrong. Needs null guards + try/catch throughout
5. **Weather route missing validation** — `GET /api/v1/weather` with no `?location=` should return 400, currently returns 200
6. **Love/Laundry toggle returns ID=0** — `PreferenceService.js` toggleLove/toggleLaundry — response returns item ID=0 instead of actual ID
7. **`subcategory` stored as string "null"** — some items have literal string "null" instead of SQL NULL. Fix in ingestion and add migration to clean existing data

## 🟢 Tests to write

8. **Wardrobe edit modal tests** — click item → modal opens → edit name → save → verify change persisted
9. **Onboarding flow tests** — once endpoints exist (see ONBOARDING.md in docs/)
10. **Invite flow tests** — once endpoints exist (see 14-MULTI-USER-INVITE-FLOW.md)
11. **Re-enable skipped tests** — love/laundry/flagged tests currently `.skip`'d

## 🔵 Features to implement

12. **Onboarding flow** — implement `docs/ONBOARDING.md` design: `user_preferences` table, 5-question UI, closet intake endpoint
13. **Multi-user invite** — implement `14-MULTI-USER-INVITE-FLOW.md`: invites table, wardrobe_shares, accept flow
14. **Render deploy** — create render.yaml, .env.render, and deploy instructions (NOT done, just designed)

## 🧪 Smoke test

18. **API smoke test script** — write `tests/smoke.js` (plain node, no Playwright) that hits all critical endpoints with curl/fetch and prints pass/fail. Should run in <5s. Endpoints: health, login, GET /items, GET /items/:id, POST upload, PATCH item, DELETE item, GET /weather?location=Denver, GET /outfits. Run with: `node tests/smoke.js`

## 🔧 Code quality

15. **Consistent API response envelope** — some routes return `{error}`, some `{message}`, some raw objects. Pick one shape and standardize
16. **Hardcoded paths** — `IngestionService.js` has hardcoded `IMAGE_ROOT`. Move to env var `IMAGE_STORAGE_PATH`
17. **DB path** — `server/db/client.js` has hardcoded `/Users/matthewcryer/...`. Move to env var `DATABASE_PATH`

## 🤖 LLM Verification (untested)

21. **Verify llama3.2:3b works** — Test outfit suggestions, vacation planning, natural language queries. The API endpoints exist but LLM responses haven't been verified. Manual test: POST /api/v1/outfits/generate with an occasion, see what it returns.

22. **Ollama image handling** — Compress images (not just resize) before sending to llava:7b to speed up analysis. Use sharp or similar to compress JPEG quality.

23. **Add weft_color attribute** — Denim and some fabrics have warp (outer) and weft (inner) colors. Add `weft_color` column to clothing_items, update AI prompt to extract it, add to edit modal.

## 🐳 Docker & Infrastructure

19. **Docker production-ready** — Current docker-compose.yml is stub. Create:
    - Dockerfile for main app (Node, builds React, runs Fastify)
    - Update docker-compose.yml with proper healthchecks
    - Ensure volume mounts for /data work
    - Test locally: docker-compose up --build

20. **Terraform (optional)** — Only if you want cloud infrastructure-as-code. Skip for now.

## Context
- App: `~/Documents/outerfit/`
- Stack: Fastify + sql.js + React
- Tests: `npx playwright test` (need server running first: `node server/index.js`)
- Server: `https://localhost:3000`
- Login: you@localhost / thread123
- API key: `thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934`
- DB: `/Users/matthewcryer/Documents/outerfit/data/thread.db`
