# THREAD — Session Synopsis
## Last Updated: 2026-02-21 21:54 MST

## App Location
- Code: ~/Documents/outerfit/
- Server: `cd ~/Documents/outerfit && node server/index.js`
- URL: http://localhost:3000
- Login: you@localhost / thread123
- API Key: thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934

## Stack
- Backend: Fastify + sql.js (SQLite in-memory, saved to disk)
- Frontend: React SPA (pre-built, served as static files from client/dist/)
- DB: /Users/matthewcryer/Documents/outerfit/data/thread.db
- Images: /Users/matthewcryer/Documents/outerfit/data/images/user_1/
- Image URLs: served at /images/* prefix

## Test Suite (108 passing, 8 skipped)
Run: `cd ~/Documents/outerfit && npx playwright test`

## Working ✅
- Login (email/password + API key)
- All 7 nav pages render
- DB persists across restarts  
- Upload photos → saved to DB → appear in wardrobe
- Profile edit (name + gender) works
- Wardrobe delete button works
- Image paths fixed (no more data/images/ prefix)
- Server error handling improved

## Upload to LLM - PARTIALLY WORKING ⚠️
- Upload endpoint works: POST /api/v1/ingestion/upload-photo-json
- Ollama IS connected and working (tested directly)
- AI analysis runs but TIMING OUT (120 second limit not enough)
- Server crashes on large image uploads
- Issue: Images are too large, Ollama takes >2 minutes

## Known Issues
- Server crashes during long AI analysis (unhandled async errors)
- Vacation planner crashes server
- Love/Laundry toggle tests skipped (test env issues)

## Fixed This Session
1. Upload flow - items now save to DB with images
2. Profile name/gender editing - now works
3. Image path bug - stripped "data/images/" prefix
4. Wardrobe delete button - added data-testid
5. Vacation route - fixed broken comment block

## Files Modified
- server/routes/vacation.js - fixed broken code
- server/services/IngestionService.js - fixed mediumPath bug, increased timeout
- client/src/pages/Camera.jsx - rewritten with better UX
- client/src/pages/Wardrobe.jsx - added delete button data-testid
- client/src/pages/Profiles.jsx - added name editing UI

## Test Files Added
- tests/upload.spec.js (10 tests)
- tests/items.spec.js (15 tests) 
- tests/outfits.spec.js (16 tests)
- tests/settings.spec.js (13 tests)
- tests/vacation.spec.js (13 tests)
- tests/wardrobe.spec.js (8 tests)

## To Do
1. Fix server crash on upload (unhandled async error in IngestionService)
2. Use smaller images for Ollama analysis (thumbnail instead of full)
3. Fix VacationPlanner crashes
4. Re-enable skipped tests

## HTTPS / Deployment Decisions (2026-02-22)

### Current State
- mkcert certs generated, Fastify running HTTPS on localhost:3000
- Certs valid until May 2028, cover localhost + 127.0.0.1 + 10.0.0.190
- No browser warnings on desktop ✅
- Phone requires iOS cert dance — skipped for now

### Options Documented

**mkcert (current)** — desktop only, phone cert install is terrible UX
- Good for solo dev
- Bad for sharing with anyone

**Tailscale** — requires app install on both ends
- Better than cert dance but still "install an app" ask
- Free, works over LTE

**ngrok** — one command, instant public HTTPS
- `ngrok http 3000` → shareable URL immediately
- Free tier: random URLs, session expires
- Good for quick demos

**Render.com (recommended for sharing)**
- Real domain (thread.onrender.com), auto HTTPS, no setup on user end
- Free tier: spins down after 15min idle (~30sec cold start)
- $7/mo for always-on
- Needs `render.yaml` + persistent disk config for SQLite + images
- Right call when ready to share beyond just you

### Decision
Staying local for now. Revisit deployment when ready to share with others.
