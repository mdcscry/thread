# THREAD - AI Wardrobe Stylist

## Current State (Paused 2026-02-21)

### What's Working
- Server running on localhost:3000
- Database persists (sql.js, fixed DB path)
- 4 items with images in wardrobe:
  - Blue Sweater (knitwear)
  - Denim Jacket (outerwear)
  - White T-Shirt (top)
  - Wool Socks (accessory)
- API returns items with primary_image paths correctly
- Image URLs work: /images/user_1/filename_*.jpg

### Test Suite
- Location: ~/Documents/outerfit/tests/core.spec.js
- 34 tests passing
- Run with: `cd ~/Documents/outerfit && npx playwright test`

### Known Issues
- Image display in frontend may still have path issues
- Upload flow needs testing
- Gender setting in profiles needs fixing

### Files Modified
- server/db/client.js - Fixed absolute path to DB
- Tests: tests/core.spec.js, tests/app.spec.js

### To Resume
1. Start server: `cd ~/Documents/outerfit && node server/index.js`
2. Tunnel: `npx localtunnel --port 3000`
3. Run tests: `cd ~/Documents/outerfit && npx playwright test`
