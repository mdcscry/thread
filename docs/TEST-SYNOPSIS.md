# THREAD - Test & Debug Synopsis

## Current Status
- Server runs at http://localhost:3000
- LocalTunnel provides HTTPS for mobile testing
- Frontend built with React + Vite
- Database: sql.js (SQLite in-memory with file persistence)

## Known Issues

### 1. Database Persistence
- `initializeDatabase()` runs on every server start
- Currently uses `CREATE TABLE IF NOT EXISTS` — GOOD
- But the schema keeps changing during development
- Items disappear when server restarts because the DB file path may differ

### 2. Images Not Displaying
- Images saved in `data/images/user_1/`
- Paths stored in DB as `data/images/user_1/filename.jpg`
- Frontend tries to load from `/images/data/images/user_1/filename.jpg` — WRONG PATH
- Need to fix path in Wardrobe.jsx or normalize DB paths

### 3. Profile/Gender Column
- Added fallback handling in users.js for missing gender column
- Works now but schema should be consistent

### 4. Upload Flow
- Camera upload times out (15s limit) if Ollama is slow
- Items flagged for review if AI fails
- Need to verify items actually appear in wardrobe after upload

### 5. Delete Button
- Implemented but needs testing

## Test Plan (Playwright)

### Priority 1: Auth & Profiles
- [ ] Login with email/password
- [ ] Switch between users (You / Partner)
- [ ] Set gender on profile
- [ ] Gender persists after page reload

### Priority 2: Wardrobe
- [ ] Items display with images
- [ ] Category filters work (All, Knitwear, Bottom, etc.)
- [ ] Heart/love button toggles
- [ ] Delete button removes item
- [ ] Items persist after page reload

### Priority 3: Upload
- [ ] File upload via Choose Photos
- [ ] Upload shows progress
- [ ] Uploaded items appear in wardrobe
- [ ] Items show in correct category

### Priority 4: Outfits
- [ ] Generate outfits from prompt
- [ ] Outfit cards display
- [ ] Feedback buttons work

## Debug Commands

```bash
# Check what's in DB
cd ~/Documents/outerfit
node -e "
import('./server/db/client.js').then(async ({getDb, prepare}) => {
  await getDb()
  const items = prepare('SELECT * FROM clothing_items').all()
  console.log('Items:', items.length)
})
"

# Check image paths
curl http://localhost:3000/images/user_1/b4eb4d02cf31_thumb.jpg

# Check API
curl http://localhost:3000/api/v1/items -H "Authorization: Bearer thread_sk_..."
```

## Next Steps
1. Fix image path rendering in Wardrobe.jsx
2. Ensure DB persists items across restarts
3. Write Playwright tests for core flows
4. Run tests against localhost:3000
