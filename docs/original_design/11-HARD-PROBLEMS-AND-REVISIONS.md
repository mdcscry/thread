# 11 — Hard Problems, Bad Ideas & Missing Features

> This document captures honest engineering assessments, design revisions, and features
> discovered to be essential after the initial spec. Claude Code should treat this document
> as **amendments** to the original spec — where it conflicts with earlier docs, this wins.

---

## 1. Google Drive — Fix the Foundation

### The Problem

The scraping approach in `04-INGESTION-PIPELINE.md` is the most fragile thing in the entire project. Google breaks scrapers without notice. It'll work at launch and silently fail three months later.

### The Fix

Make the **Google Drive API** the primary path. It's free. Requires a one-time API key setup but is stable and documented.

**Revised ingestion source priority:**
```
1. Google Drive API v3 (requires API key — guided setup in Settings)
2. Google Drive page scrape (fallback, no key needed, fragile)
3. Local folder path
4. Direct image URLs
5. ZIP upload
```

**Add to Settings → Integrations:**
```
Google Drive API Key
[ Paste key here... ]

Don't have one? Follow our 2-minute setup guide →
(links to: console.cloud.google.com → New Project → Drive API → Create Key)
```

**API-based crawler:**
```javascript
async function crawlGoogleDriveAPI(folderId, apiKey) {
  let allFiles = []
  let pageToken = null

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/'`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      pageSize: 100,
      key: apiKey,
      ...(pageToken && { pageToken })
    })

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`
    )
    const data = await res.json()

    if (data.error) throw new Error(data.error.message)

    allFiles = allFiles.concat(data.files)
    pageToken = data.nextPageToken
  } while (pageToken)

  return allFiles
}
```

Download URL stays the same: `https://drive.google.com/uc?export=download&id={FILE_ID}`

Add `GOOGLE_DRIVE_API_KEY` to `.env`. If empty, fall back to scraping with a visible warning banner in the UI.

---

## 2. Vision AI — Set Realistic Expectations

### What Will Actually Be Accurate

| Field | Expected Accuracy | Notes |
|---|---|---|
| category | 90%+ | Top/bottom/dress/shoes — usually obvious |
| subcategory | 75% | Blazer vs. jacket can be tricky |
| primary_color | 85% | Dark colors (navy/black/charcoal) frequently confused |
| pattern | 80% | Solid vs. pattern reliable; specific pattern less so |
| silhouette/fit | 70% | Highly dependent on photo angle |
| material | 55% | Genuinely hard; cotton vs. linen vs. rayon often wrong |
| texture | 60% | Better with close-up photos |
| formality | 70% | Usually in the right ballpark |
| season/temp | 65% | Inference-heavy, error-prone |

### Implications for the Build

**Don't trust material for outfit logic.** Use it as a display label only until user-confirmed. Weight the ML outfit scoring to ignore unconfirmed material fields.

**Dark color disambiguation** — add a post-processing step after AI analysis:
```javascript
const DARK_COLOR_DISAMBIGUATION = {
  'dark blue': 'navy',
  'dark navy': 'navy', 
  'very dark blue': 'navy',
  'dark': null,  // prompt user
  'very dark': null,
  'black or navy': null,  // common confusion — flag for review
  'dark brown': 'brown',
  'charcoal gray': 'charcoal',
  'dark gray': 'charcoal'
}

// If primary_color maps to null → auto-flag for user review
// Include the raw AI description in the refinement prompt
```

**Photo type matters.** Add a `photo_type` field to `clothing_items`:
```sql
photo_type  TEXT  -- 'hanger', 'flat_lay', 'worn', 'product', 'unknown'
```

The AI prompt should detect this: worn photos give better fit/silhouette data; product photos give better material data; flat lays are worst for everything. Weight confidence accordingly.

---

## 3. Worn Today — The Most Important Missing Feature

### Why It Matters

Thumbs up on a screen and "I actually put this on my body and left the house" are fundamentally different signals. The ML model needs to know the difference or it learns what looks good on a phone at 8am, not what you actually wear.

### Add to `clothing_items`

```sql
times_worn_confirmed  INTEGER DEFAULT 0,  -- actual wears logged
last_worn_confirmed   DATETIME
```

### Add to `outfits`

```sql
was_worn          BOOLEAN DEFAULT 0,
worn_date         DATE,
worn_confirmed_at DATETIME
```

### The "Worn Today" Button

On mobile, this needs to be one tap, prominent, available from:
- The outfit detail page (after generating)
- A morning widget/quick access in the app header
- Via the API (for Shortcuts automation)

```
GET /api/v1/quick/worn-today?outfitId=234
```

**Training signal weight:**
```javascript
const FEEDBACK_WEIGHTS = {
  thumbs_up:      0.6,   // liked on screen
  thumbs_down:   -1.0,   // disliked
  worn:           1.0,   // actually wore it
  skipped:       -0.2,   // generated but ignored
  neutral:        0.0
}
```

**Gentle daily prompt:** If the user generated outfits in the morning but didn't log a "worn" by 2pm, send a notification: "Did you wear one of today's outfits? Tap to log it." This is the single highest-value data collection touchpoint.

---

## 4. Multi-Photo Per Item — Revise the Schema

### The Problem

The current spec assumes one photo per clothing item. Real wardrobes don't work that way. You'll photograph the same top:
- On a hanger (what you have)
- Flat on a bed (easy to do in bulk)
- Being worn (most useful for outfit display)
- Product shot from the brand (if you saved it)

### Revised Schema

Replace `image_path` / `image_thumbnail` in `clothing_items` with a separate table:

```sql
-- Remove from clothing_items:
-- image_path, image_thumbnail

-- Add to clothing_items:
primary_image_id  INTEGER REFERENCES item_images(id)

-- New table:
CREATE TABLE item_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER REFERENCES clothing_items(id) ON DELETE CASCADE,
  
  path_full     TEXT NOT NULL,
  path_medium   TEXT NOT NULL,
  path_thumb    TEXT NOT NULL,
  
  photo_type    TEXT DEFAULT 'unknown',  -- hanger, flat_lay, worn, product
  is_primary    BOOLEAN DEFAULT 0,       -- shown in outfit cards
  
  ai_analyzed   BOOLEAN DEFAULT 0,       -- has this image been analyzed
  
  sort_order    INTEGER DEFAULT 0,
  
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_item_images_item ON item_images(item_id);
CREATE INDEX idx_item_images_primary ON item_images(item_id, is_primary);
```

### Ingestion Logic Change

When multiple photos of the same item exist (detected by pHash similarity), the ingestion service:
1. Groups them as one item with multiple images
2. Prompts user: "These look like the same piece — merge them?" with thumbnails
3. Lets user pick the primary photo for outfit display
4. Runs AI analysis on each and merges the most confident field values

The primary image is what appears in outfit cards. Secondary images are viewable in the item detail drawer.

### Photo Priority for Outfit Display

```javascript
const PHOTO_TYPE_PRIORITY = ['worn', 'product', 'flat_lay', 'hanger', 'unknown']

function getPrimaryDisplayImage(images) {
  for (const type of PHOTO_TYPE_PRIORITY) {
    const img = images.find(i => i.photo_type === type && i.is_primary)
    if (img) return img
  }
  return images[0]  // fallback
}
```

---

## 5. Wardrobe Color Profile — Feed the Outfit Engine

### The Problem

The outfit engine scores individual outfit color harmony but doesn't know that a person's wardrobe skews earth tones. It'll generate technically harmonious outfits that are completely wrong for someone's aesthetic.

### The Fix

Compute a per-user color profile from their wardrobe:

```javascript
async function buildColorProfile(userId) {
  const items = await db('clothing_items')
    .where({ user_id: userId, is_active: true, user_reviewed: true })
  
  // Count color frequencies
  const colorFreq = {}
  items.forEach(item => {
    const colors = JSON.parse(item.colors || '[]')
    colors.forEach(c => {
      colorFreq[c] = (colorFreq[c] || 0) + 1
    })
  })
  
  // Derive palette personality
  const earthTones = ['beige', 'camel', 'tan', 'brown', 'terracotta', 'rust', 'olive']
  const neutrals   = ['black', 'white', 'grey', 'navy', 'cream', 'ivory']
  const brights    = ['red', 'cobalt', 'emerald', 'magenta', 'yellow', 'orange']
  const pastels    = ['blush', 'lavender', 'mint', 'peach', 'powder blue']
  
  const total = Object.values(colorFreq).reduce((a, b) => a + b, 0)
  
  return {
    dominantColors: Object.entries(colorFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([color]) => color),
    
    palettePerson: {
      earthTone: scoreAgainst(colorFreq, earthTones, total),
      neutral:   scoreAgainst(colorFreq, neutrals, total),
      bright:    scoreAgainst(colorFreq, brights, total),
      pastel:    scoreAgainst(colorFreq, pastels, total)
    }
  }
}
```

**Use in OutfitEngine:**
```javascript
// Penalize outfits that introduce colors foreign to the user's palette
function paletteConsistencyScore(outfit, userColorProfile) {
  const outfitColors = getAllColors(outfit.items)
  const foreignColors = outfitColors.filter(c => 
    !userColorProfile.dominantColors.includes(c) &&
    !isNeutral(c)
  )
  return Math.max(0, 1 - (foreignColors.length * 0.15))
}
```

Store the profile in `users.preferences` JSON field. Recompute whenever items are added or reviewed.

---

## 6. Replace TensorFlow.js — Simpler is Better

### The Problem

TF.js Node has native bindings, platform-specific CUDA dependencies, and version conflicts that make it a real headache to install on unfamiliar machines. For this use case — learning ~200 items across a few users — it's massive overkill that brings unnecessary complexity.

### The Replacement: Weighted Item Scoring

Replace the neural network with an **Exponential Moving Average (EMA) score per item**, stored in SQLite. No ML library. No native deps. Works everywhere. Gets 80% of the benefit.

```sql
-- Add to clothing_items:
ema_score     REAL DEFAULT 0.5,   -- rolling preference score, 0-1
ema_count     INTEGER DEFAULT 0   -- number of feedback events
```

**Update on feedback:**
```javascript
const EMA_ALPHA = 0.3  // how fast new feedback overrides old

function updateItemScore(item, feedbackValue) {
  // feedbackValue: 1.0 (worn), 0.6 (thumbs up), 0.0 (thumbs down), -0.2 (skipped)
  const normalized = Math.max(0, Math.min(1, feedbackValue))
  
  if (item.ema_count === 0) {
    return { ema_score: normalized, ema_count: 1 }
  }
  
  const newScore = (EMA_ALPHA * normalized) + ((1 - EMA_ALPHA) * item.ema_score)
  return { ema_score: newScore, ema_count: item.ema_count + 1 }
}

// Called when outfit gets feedback — update every item in that outfit
async function recordFeedback(userId, outfitId, feedbackValue) {
  const outfit = await getOutfit(outfitId)
  const items = JSON.parse(outfit.item_ids)
  
  await Promise.all(items.map(async (itemId) => {
    const item = await getItem(itemId)
    const updated = updateItemScore(item, feedbackValue)
    await db('clothing_items').where({ id: itemId }).update(updated)
  }))
  
  // Also track occasion-level preferences
  await updateOccasionProfile(userId, outfit.occasion, feedbackValue)
}
```

**Outfit scoring becomes:**
```javascript
function scoreOutfit(outfit, context, userProfile) {
  // Average EMA score of all items
  const itemScore = outfit.items.reduce((sum, item) => 
    sum + item.ema_score, 0) / outfit.items.length
  
  // Context match (rule-based, unchanged)
  const ruleScore = computeRuleScore(outfit, context)
  
  // Palette consistency
  const paletteScore = paletteConsistencyScore(outfit, userProfile.colorProfile)
  
  // Combined
  return (0.4 * itemScore) + (0.4 * ruleScore) + (0.2 * paletteScore)
}
```

**Keep the cold start logic** from the original spec — just remove the TF.js references. The EMA approach doesn't need a maturity threshold; it starts contributing meaningfully from the first feedback event.

If the project grows and there's genuine demand for the neural net later, add it as an optional enhancement. Don't ship it on day one.

---

## 7. Vacation Optimizer — Performance Fix

### The Problem

20 random restarts × iterating 200+ items × 10 activity types = potentially 30+ seconds synchronous. Unacceptable.

### The Fix

Run it as a **background job**, exactly like ingestion:

```javascript
// POST /api/v1/vacation/optimize → returns jobId immediately
// GET  /api/v1/vacation/jobs/:jobId → poll for status
// WebSocket event 'vacation_complete' when done
```

**Also add time limits:**
```javascript
const OPTIMIZER_CONFIG = {
  maxRestarts: 20,
  maxTimeMs: 15000,       // hard stop at 15 seconds
  candidateLimit: 50,     // only evaluate top 50 items per restart
  earlyStopThreshold: 0.95  // stop if score reaches 95% of theoretical max
}
```

With these limits, worst case is 15 seconds, typical is 5-8 seconds, which is fine for a background job.

---

## 8. Seasonal Archiving Flow

### The Feature

Twice a year (spring and fall), the app surfaces a review mode: "Time to update your wardrobe for the season." The user quickly flips through items and marks them as stored/active. The outfit engine ignores stored items without deleting them.

```sql
-- Add to clothing_items:
storage_status  TEXT DEFAULT 'active',  -- active, stored
stored_at       DATETIME,
storage_note    TEXT   -- "winter storage", "attic", "under bed"
```

**Trigger:** Automatic prompt on first app open after March 1 and September 1.

**Review UI — rapid flip mode:**
```
Seasonal Review — Spring Edition

Showing: Winter items (47 remaining)

┌─────────────────────────────────────┐
│                                     │
│    [Photo: Heavy wool coat]         │
│                                     │
│  "Camel wool overcoat"              │
│  Last worn: February 3              │
│                                     │
│  [ 📦 Store it ]   [ ✅ Keep out ] │
└─────────────────────────────────────┘
         Item 12 of 47
```

Swipe left to store, swipe right to keep. Takes about 3 minutes for a typical wardrobe.

**Stored items still appear** in the catalog (greyed out, in a "Stored" section) and in vacation planning (sometimes you want to pull something out of storage for a trip). They just don't appear in daily outfit generation.

---

## 9. Laundry Mode

### The Feature

A simple "this is in the laundry" toggle. Auto-clears after 48 hours. The outfit engine excludes laundry items.

```sql
-- Add to clothing_items:
in_laundry        BOOLEAN DEFAULT 0,
laundry_since     DATETIME
```

**Auto-clear job** — runs daily:
```javascript
// Clear laundry status for items marked > 48 hours ago
await db('clothing_items')
  .where('in_laundry', true)
  .where('laundry_since', '<', new Date(Date.now() - 48 * 60 * 60 * 1000))
  .update({ in_laundry: false, laundry_since: null })
```

**UI:** Long-press any item in the catalog → context menu → "In laundry." A small 🧺 badge appears on the thumbnail. Laundry items are excluded from all outfit generation without any other action from the user.

**Also useful:** A "Laundry basket" view — see everything currently in the wash. Useful for knowing when you're running low on a category ("Oh, both my black jeans are dirty").

---

## 10. Couple's Coordinated Outfits

### The Feature

A mode where the outfit engine generates outfits for both people simultaneously, optimizing for visual coordination at a shared event.

**Not matchy-matchy** (same colors) but **complementary** (color families that work together, formality levels that match, overall aesthetic that coheres).

```javascript
async function generateCoupleOutfits(user1Id, user2Id, context) {
  // Generate candidate outfits for each person independently
  const candidates1 = await generateCandidates(user1Id, context, 30)
  const candidates2 = await generateCandidates(user2Id, context, 30)
  
  // Score all pairs for coordination
  const pairs = []
  for (const o1 of candidates1) {
    for (const o2 of candidates2) {
      const coordinationScore = scoreCoupleCoordination(o1, o2)
      const individual1 = scoreOutfit(o1, context, user1Id)
      const individual2 = scoreOutfit(o2, context, user2Id)
      
      // Balanced: both people's individual scores matter
      const combined = (0.3 * coordinationScore) + 
                       (0.35 * individual1) + 
                       (0.35 * individual2)
      
      pairs.push({ outfit1: o1, outfit2: o2, score: combined })
    }
  }
  
  return pairs.sort((a, b) => b.score - a.score).slice(0, 10)
}

function scoreCoupleCoordination(outfit1, outfit2) {
  let score = 0.5
  
  // Formality match — most important
  const formalityDiff = Math.abs(
    averageFormality(outfit1.items) - averageFormality(outfit2.items)
  )
  score -= formalityDiff * 0.08
  
  // Color family harmony — not matching, just not clashing
  const colorHarmony = coupleColorHarmony(outfit1.items, outfit2.items)
  score += colorHarmony * 0.3
  
  // Style family — both casual, both dressy, etc.
  const styleOverlap = styleTagOverlap(outfit1.items, outfit2.items)
  score += styleOverlap * 0.2
  
  return Math.max(0, Math.min(1, score))
}
```

**UI:** Side-by-side outfit cards. Generate → flip through pairs together. Thumbs up/down on the pair.

Add `POST /api/v1/outfits/generate-couple` route.

---

## 11. Mobile Camera Ingestion — The Missing Piece

### Why This Matters More Than Anything Else

Ingesting a full two-person wardrobe is 300-500 photos. If taking those photos is annoying, the wardrobe never gets fully populated and the whole system is half-broken forever.

The current spec assumes photos already exist in Google Drive. Real usage: you have to *take* those photos first, and the easiest place to do it is standing in front of your closet holding your phone.

### The Camera Companion Mode

A dedicated page in the mobile PWA: `/camera`

```
┌────────────────────────────────────┐
│  📸 Add to Wardrobe                │
│                        For: Emma ▾ │
│                                    │
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  │    [ Camera Viewfinder ]     │  │
│  │                              │  │
│  │                              │  │
│  └──────────────────────────────┘  │
│                                    │
│  Tips: Good lighting, whole item   │
│        visible, neutral background │
│                                    │
│         [📷 Capture]               │
│                                    │
│  Queue: 3 photos waiting to upload │
└────────────────────────────────────┘
```

**How it works:**
1. Open the mobile PWA → Camera tab
2. Select which user's wardrobe you're adding to
3. Take photos — they queue locally
4. On WiFi, they upload directly to the server's ingestion pipeline
5. Analysis runs in the background — no waiting at the camera screen
6. A notification appears when items are analyzed and ready to review

**Technical approach:**
- Use `navigator.mediaDevices.getUserMedia()` in the PWA (works on iOS Safari 14.3+, all Android Chrome)
- Photos captured as JPEG blobs in the browser
- Uploaded via `fetch()` POST to `/api/v1/ingestion/upload-photo`
- Service worker queues uploads if connection drops (uploads when reconnected)
- Server processes each photo immediately as it arrives, no waiting for a batch

**Why this changes adoption:**
The friction between "I want to add my wardrobe" and "my wardrobe is in the app" determines whether anyone actually uses this beyond the first week. Making it phone-native, immediate, and background-processed removes that friction entirely.

Add `/camera` route to the PWA with a prominent entry point in the bottom navigation bar.

---

## Summary: Revised Build Priority

Given everything above, here's what changes in the build order:

**Phase 4.5 (new):** After Ollama integration, implement the revised item image schema (`item_images` table) before building any ingestion — retrofitting it later is painful.

**Phase 5 (revised):** Build Google Drive API as primary path, scraping as fallback. Add photo type detection to the analysis prompt.

**Phase 9 (replaced):** Skip TF.js. Implement EMA scoring on `clothing_items` instead. Far simpler, ships faster, works better on day one.

**Phase 11 (new):** Camera companion mode. Build it before vacation planner — it directly determines whether the wardrobe gets populated enough for anything else to matter.

**Phase 12.5 (new):** Laundry mode and seasonal archiving — these are lightweight but should be built before the app is "done" because users will want them immediately.

**Phase 13 (add to):** Couple's coordination mode — build the joint scoring function and add the UI as an additional tab in Outfit Studio.
