# 12 — Feedback System & Phone Integration

## The Real Problem

The moments that contain the most useful feedback signal are exactly the moments 
when you won't open an app to give feedback:

- **7:15am** — Getting dressed, running late, outfit feels off but you wear it anyway
- **8am** — Walking out the door feeling great about what you're wearing
- **12pm** — Friend compliments your top at lunch
- **6pm** — Changing out of work clothes, vaguely relieved to be done with them
- **8pm** — At dinner, someone asks where you got your jacket
- **10pm** — In bed, vaguely remembering you wanted to log that you wore the green dress

By the time you're sitting with a phone thinking "I should rate some outfits," 
the signal is cold and your memory has flattened. You'll rate based on how you 
feel *now*, not how you felt *then*.

The feedback system has to be **ambient**. Capture signal at the moment it exists, 
with as little friction as possible, in whatever modality is natural at that moment.

---

## Three Capture Modalities

### 1. Voice — The Lowest Friction Input

Voice is the right primary interface for in-the-moment feedback. You're in the 
car after dinner. You say: "Hey, that black dress I wore tonight was perfect." 
Done. The system figures out the rest.

### 2. Camera — The Ingestion Interface

Point at clothes and shoot. Works for adding new items, documenting what you 
wore, and visual feedback ("I love this, remember it").

### 3. Notifications — The Proactive System

The app reaches out at the right moments, makes it one tap.

---

## Architecture: The Voice Pipeline

### On-Device vs. Server

Voice processing stays local. No audio leaving the machine.

```
Phone microphone
    ↓
Whisper.cpp (runs on your laptop/server, tiny model)
    ↓
Transcribed text
    ↓
Ollama (text model: llama3.2:3b)
    ↓
Structured intent JSON
    ↓
THREAD API action
```

**Whisper model options:**
| Model | Size | Speed | Accuracy |
|---|---|---|---|
| whisper-tiny | 75MB | Very fast | Good enough for fashion vocab |
| whisper-base | 142MB | Fast | Better for accented speech |
| whisper-small | 466MB | Medium | Recommended default |

The server runs a Whisper endpoint. The phone PWA records audio and sends it 
as a blob. Transcription happens server-side (your laptop). No cloud STT.

```javascript
// server/services/VoiceService.js
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')

async function transcribeAudio(audioBuffer, format = 'webm') {
  // Write audio to temp file
  const tempPath = path.join('./data/tmp', `voice_${Date.now()}.${format}`)
  fs.writeFileSync(tempPath, audioBuffer)
  
  // Run whisper.cpp
  return new Promise((resolve, reject) => {
    exec(
      `./bin/whisper-cli -m ./models/ggml-base.bin -f ${tempPath} -otxt -of ${tempPath}`,
      (error, stdout) => {
        fs.unlinkSync(tempPath)  // clean up
        if (error) reject(error)
        const text = fs.readFileSync(`${tempPath}.txt`, 'utf8').trim()
        fs.unlinkSync(`${tempPath}.txt`)
        resolve(text)
      }
    )
  })
}
```

**Setup adds to `setup.sh`:**
```bash
# Download and build whisper.cpp
if [ ! -f "./bin/whisper-cli" ]; then
  echo "📥 Setting up voice transcription..."
  git clone https://github.com/ggerganov/whisper.cpp whisper-build
  cd whisper-build && make -j4
  cp main ../bin/whisper-cli
  cd .. && rm -rf whisper-build
  
  # Download base model (~142MB)
  mkdir -p ./models
  curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin \
    -o ./models/ggml-base.bin
fi
```

---

## Intent Extraction

After transcription, Ollama extracts structured intent:

```javascript
async function parseVoiceIntent(transcript, userId) {
  const recentOutfits = await getRecentOutfits(userId, 5)  // last 5 generated/worn
  const recentItems = await getRecentItems(userId, 10)     // recently viewed items
  
  const prompt = `
You are a fashion assistant parsing voice input. Extract the intent from this 
voice note. The user's recent outfits and items are provided for context so you 
can resolve references like "that dress" or "the thing I wore yesterday."

Recent outfits: ${JSON.stringify(recentOutfits.map(o => ({
  id: o.id, 
  description: o.description,
  date: o.worn_date || o.created_at,
  items: o.item_names
})))}

Recent items: ${JSON.stringify(recentItems.map(i => ({
  id: i.id,
  name: i.name,
  category: i.category,
  color: i.primary_color
})))}

Voice input: "${transcript}"

Return JSON with exactly this structure:
{
  "intent": "feedback" | "add_worn" | "add_item" | "generate" | "question" | "unknown",
  "confidence": 0.0-1.0,
  
  // For intent: "feedback"
  "feedback": {
    "sentiment": "positive" | "negative" | "neutral",
    "strength": "strong" | "mild",
    "target_type": "outfit" | "item",
    "target_id": <id or null if ambiguous>,
    "target_description": "what was described if no ID match",
    "specific_note": "any specific comment to save",
    "feedback_value": 1.0 | 0.6 | 0.3 | 0.0 | -0.5 | -1.0
  },
  
  // For intent: "add_worn"
  "worn": {
    "outfit_id": <id or null>,
    "item_ids": [<ids>],
    "date": "today" | "yesterday" | "<ISO date>",
    "occasion": "<occasion if mentioned>"
  },
  
  // For intent: "generate"  
  "generate": {
    "occasion": "<extracted occasion>",
    "style_words": ["<words>"],
    "time_of_day": "<if mentioned>",
    "date": "<if mentioned>"
  },
  
  // For any intent
  "raw_note": "${transcript}",
  "needs_clarification": false,
  "clarification_question": null
}

Output only valid JSON.`

  const response = await ollama.chat(prompt, { model: 'llama3.2:3b' })
  return JSON.parse(response)
}
```

### Example Resolutions

**"That black dress I wore tonight was perfect"**
```json
{
  "intent": "feedback",
  "feedback": {
    "sentiment": "positive",
    "strength": "strong", 
    "target_type": "item",
    "target_description": "black dress worn tonight",
    "specific_note": "felt perfect",
    "feedback_value": 1.0
  }
}
```
→ System finds most recently worn dress, applies feedback, asks for confirmation if ambiguous.

**"I need something for Sarah's wedding on Saturday, garden party, it'll be warm"**
```json
{
  "intent": "generate",
  "generate": {
    "occasion": "wedding",
    "style_words": ["garden party"],
    "time_of_day": "afternoon",
    "date": "saturday",
    "weather_override": "warm"
  }
}
```
→ Triggers outfit generation with these parameters.

**"The jeans I wore yesterday felt too tight"**
```json
{
  "intent": "feedback",
  "feedback": {
    "sentiment": "negative",
    "strength": "mild",
    "target_type": "item",
    "target_description": "jeans worn yesterday",
    "specific_note": "felt too tight",
    "feedback_value": -0.5
  }
}
```
→ Finds yesterday's outfit, identifies the jeans, adds a note and reduces EMA score.

---

## The Voice API Endpoint

```
POST /api/v1/voice
Content-Type: multipart/form-data

Fields:
  audio: <blob>          (webm/m4a/mp3)
  userId: <id>
  format: "webm"

Response:
{
  "transcript": "that black dress I wore tonight was perfect",
  "intent": { ... },
  "action_taken": "feedback_recorded" | "outfit_generated" | "needs_clarification",
  "result": { ... },
  "confirmation_message": "Got it — logged positive feedback for your black midi dress from tonight. 🖤"
}
```

---

## Phone UI: The Voice Button

The voice button lives in the bottom navigation bar, center position, prominent.

```
┌────────────────────────────────────────┐
│                                        │
│          [ app content ]               │
│                                        │
├──────┬──────┬──────────┬──────┬────────┤
│  👗  │  ✨  │  🎙️     │  ✈️  │  ⚙️   │
│ Ward │Outfit│  VOICE   │Trips │Settings│
└──────┴──────┴──────────┴──────┴────────┘
```

The voice tab opens a full-screen recording interface:

```
┌────────────────────────────────────────┐
│                                        │
│         🎙️                            │
│                                        │
│   Hold to talk, release to send        │
│                                        │
│   ┌──────────────────────────────┐     │
│   │ ●  Recording...  0:04        │     │
│   └──────────────────────────────┘     │
│                                        │
│   Recent:                              │
│   "Black dress tonight was perfect" ✓  │
│   "Need an outfit for Saturday" →      │
│   "These jeans felt too tight" ✓       │
│                                        │
└────────────────────────────────────────┘
```

Push-to-talk is better than tap-to-toggle for this use case — less likely to leave recording running accidentally. On release: uploads audio → transcribes → shows result → confirms action.

**Confirmation step:**
```
┌────────────────────────────────────────┐
│  ✅ Got it                             │
│                                        │
│  "That black dress I wore tonight      │
│   was perfect"                         │
│                                        │
│  → Logging: Loved ❤️ for your          │
│    Black satin midi dress              │
│    (from tonight's outfit)             │
│                                        │
│  [ ✓ Confirm ]   [ ✗ That's wrong ]   │
└────────────────────────────────────────┘
```

If "That's wrong" — either show a picker to select the right item, or let them re-record with more specificity.

---

## iPhone Siri Shortcut Integration

Beyond the PWA, create an iPhone Shortcut that works with Siri:

**"Hey Siri, THREAD feedback"** → Shortcut runs:

```
1. Record audio (10 seconds, or stop when user taps)
2. Get Contents of URL
   URL: http://[server-ip]:3000/api/v1/voice
   Method: POST
   Request Body: audio blob
   Headers: Authorization: Bearer [api_key]
3. Get "confirmation_message" from response
4. Show notification with confirmation_message
```

This means the user can say "Hey Siri, THREAD feedback" from anywhere — phone 
locked, driving, hands full — speak their note, and it's done. No app open.

**Add to Settings:** QR code that installs the pre-configured Shortcut on the user's phone with their API key already embedded.

---

## Notification-Driven Feedback (Proactive Capture)

The server sends push notifications at the right moments. The user taps and 
provides one-tap feedback without opening the app fully.

### Implementation: Web Push

```javascript
// server/services/NotificationService.js
const webpush = require('web-push')

// Generate VAPID keys once, store in .env
// npx web-push generate-vapid-keys

webpush.setVapidDetails(
  'mailto:thread@localhost',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

async function sendNotification(userId, payload) {
  const subscription = await getUserPushSubscription(userId)
  if (!subscription) return
  
  await webpush.sendNotification(
    subscription,
    JSON.stringify(payload)
  )
}
```

The PWA service worker handles the notification and the tap action:

```javascript
// client/public/sw.js
self.addEventListener('notificationclick', event => {
  const { action, outfit_id, item_id } = event.notification.data
  
  if (action === 'worn') {
    // Mark outfit as worn without opening app
    fetch(`/api/v1/outfits/${outfit_id}/worn`, { method: 'POST' })
    event.notification.close()
  }
  
  if (action === 'loved' || action === 'meh') {
    const value = action === 'loved' ? 1 : -0.5
    fetch(`/api/v1/outfits/${outfit_id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ value })
    })
    event.notification.close()
  }
  
  if (action === 'open') {
    clients.openWindow(`/outfit/${outfit_id}`)
  }
})
```

### Notification Triggers & Timing

```javascript
// server/jobs/NotificationJobs.js

// 1. MORNING SUGGESTION (7:30am, configurable)
//    "Here's an outfit for today — 62°F and sunny ☀️"
//    [View it] → opens outfit in PWA
schedule.every('day').at('07:30').do(async () => {
  for (const user of await getActiveUsers()) {
    const outfit = await generateBestOutfitForToday(user.id)
    await sendNotification(user.id, {
      title: "Today's outfit suggestion",
      body: outfit.description + ` — ${outfit.weatherNote}`,
      data: { outfit_id: outfit.id },
      actions: [
        { action: 'open', title: '👀 See it' },
        { action: 'worn', title: '✅ Wore this' }
      ]
    })
  }
})

// 2. MIDDAY CHECK-IN (12:30pm, only if morning outfit was opened but not confirmed)
//    "Did you end up wearing the outfit we suggested?"
//    [Yes ✅] [No, different outfit] [No, stayed home]
schedule.every('day').at('12:30').do(async () => {
  for (const user of await getUsersWithUnconfirmedMorningOutfit()) {
    await sendNotification(user.id, {
      title: "Did you wear today's outfit?",
      body: "Tap to log what you actually wore — it helps us learn 🧠",
      data: { outfit_id: user.morningOutfitId },
      actions: [
        { action: 'worn', title: '✅ Yes, wore it' },
        { action: 'open', title: '📝 Log different outfit' }
      ]
    })
  }
})

// 3. EVENING REFLECTION (8:30pm, light touch)
//    Only fires if no feedback logged today and an outfit was generated
//    "How did today's outfit feel?"
schedule.every('day').at('20:30').do(async () => {
  for (const user of await getUsersWithNoFeedbackToday()) {
    const outfit = await getTodaysOutfit(user.id)
    if (!outfit) continue
    
    await sendNotification(user.id, {
      title: "How did today feel?",
      body: outfit.shortDescription,
      data: { outfit_id: outfit.id },
      actions: [
        { action: 'loved', title: '❤️ Loved it' },
        { action: 'meh',   title: '😐 It was okay' },
        { action: 'open',  title: '💬 Tell us more' }
      ]
    })
  }
})

// 4. REFINEMENT PROMPTS (when items need review)
//    "3 new items need a quick review — takes 2 minutes"
//    Fire when count crosses 5, then again at 10, 20
async function checkRefinementThreshold(userId) {
  const pending = await getPendingRefinements(userId)
  const thresholds = [5, 10, 20]
  
  if (thresholds.includes(pending.length)) {
    await sendNotification(userId, {
      title: `${pending.length} items need your eye 👀`,
      body: "Quick review helps your outfit suggestions get smarter",
      data: { action: 'open', page: '/catalog?filter=flagged' },
      actions: [
        { action: 'open', title: '✏️ Review now' }
      ]
    })
  }
}

// 5. SEASONAL ARCHIVING PROMPT (March 1, September 1)
//    "Time to update your wardrobe for spring — takes 5 minutes"

// 6. LAUNDRY AUTO-CLEAR REMINDER
//    (Optional) "Your laundry's probably done — 4 items back in rotation"
```

### Notification Preferences

In Settings → Notifications, user can toggle each type and set quiet hours:

```
Morning suggestion:     [ ON ]   at [ 7:30 AM ▾ ]
Midday check-in:        [ ON ]
Evening reflection:     [ OFF ]
Refinement prompts:     [ ON ]
Seasonal review:        [ ON ]

Quiet hours: 10:00 PM → 7:00 AM
```

---

## Camera Flow — What You Actually Photograph

### Mode 1: New Item Ingestion

Already covered in the spec. Shoot → queue → analyze → catalog.

The improvement here: **guided shooting UI**

```
┌────────────────────────────────────────┐
│  📸 Shoot Your Wardrobe                │
│                                        │
│  [ Category: Top ▾ ]                  │
│                                        │
│  ┌────────────────────────────────┐    │
│  │                                │    │
│  │  [viewfinder]                  │    │
│  │                                │    │
│  │  💡 Lay flat, good light,      │    │
│  │     whole item visible         │    │
│  └────────────────────────────────┘    │
│                                        │
│          [📷 Shoot]                    │
│                                        │
│  ✓ 23 items added this session         │
│  [ Done — Start Analysis ]             │
└────────────────────────────────────────┘
```

Pre-selecting the category before shooting means the AI prompt can be more targeted ("You said this is a top — focus on style, color, material") and confidence goes up.

### Mode 2: Document What You're Wearing

**"Log Today's Outfit"** — camera mode that expects a worn photo:

```
┌────────────────────────────────────────┐
│  📷 What are you wearing?              │
│                                        │
│  [viewfinder — selfie camera default]  │
│                                        │
│  Or tap items to build it:             │
│  ┌──────┐ ┌──────┐ ┌──────┐           │
│  │      │ │  ✓   │ │      │           │
│  │      │ │ Top  │ │      │           │
│  └──────┘ └──────┘ └──────┘           │
│                                        │
│  [ 📷 Photo ]   [ ✓ Tap to select ]   │
└────────────────────────────────────────┘
```

Two paths:
1. **Photo** — take a selfie or mirror shot, AI identifies which items from your wardrobe you're wearing (visual matching against your catalog)
2. **Tap to select** — scroll through recent/suggested items and tap the ones you're wearing

The photo path uses a visual similarity search against catalog images — this is hard and model-dependent. Start with tap-to-select as the primary flow, photo matching as a nice-to-have.

### Mode 3: Visual Feedback

Point camera at something → one-tap reaction:

```
[ 📷 camera ]  → shows item or outfit
[ ❤️ Love ]  [ 👎 Nope ]  [ 📝 Note it ]
```

This is for moments like: you're in the store, you see something that makes you think of a gap in your wardrobe, you shoot it and note "I need something like this in navy."

---

## The Worn Outfit Builder (Tap to Select)

This is the most practical feedback flow for daily use. Not AI-dependent, works instantly, teaches the model what actually left the house.

```
┌────────────────────────────────────────┐
│  ✅ Log What You Wore                  │
│  Monday, June 15                       │
│                                        │
│  Suggested (from this morning):        │
│  ┌──────────────────────────────────┐  │
│  │ [Cream blouse] [Wide jeans] [Tan │  │
│  │  mules]        ← tap to confirm  │  │
│  └──────────────────────────────────┘  │
│  [ ✓ Yes, this is it ]                │
│                                        │
│  ── Or build it from scratch ──        │
│                                        │
│  TOP:      [+ Select]                  │
│  BOTTOM:   [+ Select]                  │
│  SHOES:    [+ Select]                  │
│  + Add more pieces                     │
│                                        │
│  Occasion: [Casual ▾]                  │
│  How'd it feel? ❤️  😐  👎           │
│                                        │
│  [ Save Outfit ]                       │
└────────────────────────────────────────┘
```

The "Suggested" section shows what the app generated for that morning — one tap confirms it if that's what was actually worn. This covers the majority of days where the app's suggestion was used.

---

## Feedback Signal Weight Summary

Not all feedback is equal. The system weights signals:

```javascript
const SIGNAL_WEIGHTS = {
  // High confidence — deliberate, specific
  worn_confirmed:          1.0,   // Logged as actually worn
  voice_positive_strong:   0.9,   // "That was perfect" / "I love this"
  voice_positive_mild:     0.65,  // "That worked pretty well"
  
  // Medium confidence — in-app, intentional
  thumbs_up_in_app:        0.6,
  loved_item_heart:        0.55,  // Hearted in catalog
  
  // Low confidence — passive, ambiguous  
  notification_one_tap:    0.5,   // "Loved it" from notification
  worn_unconfirmed:        0.4,   // Generated but no explicit worn log (inferred)
  
  // Negative signals
  thumbs_down_in_app:     -0.8,
  voice_negative_strong:  -0.9,   // "That looked awful"
  voice_negative_mild:    -0.5,   // "Didn't feel quite right"
  skipped_repeatedly:     -0.2,   // Generated 3+ times, never chosen
  notification_dismissed:  0.0,   // Ambiguous — they might have just been busy
}
```

The EMA update uses the weight:
```javascript
function updateItemScore(item, signalWeight) {
  if (signalWeight === 0) return item  // don't update on dismissed notifications
  
  const normalized = (signalWeight + 1) / 2  // map [-1, 1] to [0, 1]
  const alpha = 0.3 * Math.abs(signalWeight)  // stronger signals update faster
  
  const newScore = (alpha * normalized) + ((1 - alpha) * item.ema_score)
  return { 
    ema_score: Math.max(0, Math.min(1, newScore)),
    ema_count: item.ema_count + 1
  }
}
```

---

## Voice Note Log

Every voice input is stored, even if the intent extraction was confident:

```sql
CREATE TABLE voice_notes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id),
  
  raw_audio_path  TEXT,             -- kept for 30 days, then auto-deleted
  transcript      TEXT NOT NULL,
  
  intent          TEXT,             -- parsed intent type
  confidence      REAL,             -- extraction confidence
  action_taken    TEXT,             -- what the system did
  
  -- If action was ambiguous
  needs_review    BOOLEAN DEFAULT 0,
  user_confirmed  BOOLEAN DEFAULT 0,
  
  -- Link to what it affected
  outfit_id       INTEGER REFERENCES outfits(id),
  item_ids        JSON,
  
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

A "Voice Log" section in Settings shows recent notes, what the system interpreted, and whether the user confirmed it. This builds trust — you can see what the system actually learned from what you said.

---

## The Feedback Loop Flywheel

Put it all together, the loop looks like this on a typical day:

```
7:30am  Push notification → "Here's today's outfit" → user taps View
7:32am  User opens PWA, sees outfit cards, swipes through 3 options
7:35am  User taps "Wore this" → worn logged, EMA updates for 4 items
        
12:30pm No worn confirmation yet today? → check-in notification suppressed 
        (they already confirmed at 7:35)
        
1:15pm  User trying on clothes → opens camera → shoots 6 new items
        Analysis runs in background → items appear in catalog by 1:45pm
        
6:45pm  In the car: "Hey Siri, THREAD feedback"
        Says: "Those wide leg pants from today felt amazing"
        System: finds today's logged outfit, identifies pants, applies strong positive
        Confirmation notification: "Got it — loved your ivory wide-leg trousers 🤍"
        
8:30pm  Evening notification → suppressed (feedback already logged today)
        
After 50 days of this:
  → EMA scores have meaningful signal across the wardrobe
  → Outfit engine knows which items consistently land and which don't
  → Morning suggestions start feeling noticeably more "right"
  → The system has learned each person's actual aesthetic, not just their stated one
```

---

## Implementation Priority

Build this in this order:

1. **Notification infrastructure** — web push registration in PWA, VAPID setup, morning suggestion notification. This is the lightest lift and highest return. Even a simple "here's an outfit" notification with a [Wore this] action button teaches the model.

2. **Worn outfit logger** — the tap-to-select UI for logging what was actually worn. This is the single highest-quality signal and requires no AI.

3. **Voice endpoint** — Whisper transcription + Ollama intent extraction. Get the server pipeline working first, then build the PWA mic UI.

4. **Voice PWA UI** — push-to-talk button, confirmation step, voice log.

5. **Siri Shortcut generator** — auto-generate a downloadable `.shortcut` file pre-configured with the user's API key and server URL. One scan of a QR code installs it.

6. **Guided camera flows** — category-first shooting mode, worn outfit photo matching (the visual matching is hardest, leave this for last).
