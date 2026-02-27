# THREAD Interaction Design Architecture

*Last Updated: 2026-02-25*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

The core interaction loop of outerfit is: get a suggestion, react to it, get a better one next time. Every design decision in this document serves that loop. The interaction model borrows from the most battle-tested gesture vocabulary in mobile — swipe to accept/reject — and extends it with outfit editing and voice feedback to capture progressively richer training signals.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Interaction Phases                                │
├─────────────────────────────────────────────────────────────────────┤
│  Phase 1 (Beta)   │  Swipe right/left + tap to edit                 │
│                   │  Binary + partial signals                        │
├─────────────────────────────────────────────────────────────────────┤
│  Phase 2 (v1.5)   │  Outfit editing — swap, remove, add items       │
│                   │  Precise item-level signals                      │
├─────────────────────────────────────────────────────────────────────┤
│  Phase 3 (v2)     │  Voice feedback                                 │
│                   │  Natural language → structured training signal   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Swipe UX

### Why Swipe

Users arrive knowing how to swipe. Tinder established the pattern, every app since has reinforced it. Zero learning curve. More importantly — a swipe is faster and more honest than a button tap. Users swipe before they can overthink it. That instinctive reaction is exactly the kind of preference signal the TF model needs.

### Gesture Map

```
Swipe right  →  Accept outfit — wear it today
Swipe left   →  Reject outfit — show me another
Swipe up     →  Save outfit for later (not today, but love it)
Tap          →  Open outfit detail / edit mode
Long press   →  Quick item info (what is this item?)
```

### Card Stack Visual

Show 2-3 outfit cards slightly fanned behind the current card. This communicates "there are more options" and makes the swipe feel like exploration rather than a binary pass/fail test.

```
     ┌──────────────┐
   ┌─┤              ├─┐
 ┌─┤ │   OUTFIT 1   │ ├─┐
 │  │               │  │
 │  │  [item cards] │  │
 │  │               │  │
 │  │  ← reject     │  │
 │  │    accept →   │  │
 └─ └───────────────┘ ─┘
      ← 2 more cards visible behind
```

### Swipe Implementation (React + PWA)

```bash
npm install @use-gesture/react
# Lightweight gesture library — works in browser and Capacitor
```

```jsx
// client/src/components/OutfitSwipeCard.jsx
import { useSpring, animated } from '@react-spring/web'
import { useDrag } from '@use-gesture/react'
import { track } from '../analytics'

export function OutfitSwipeCard({ outfit, onAccept, onReject, onSave, onEdit }) {
  const [{ x, y, rotate, scale }, api] = useSpring(() => ({
    x: 0, y: 0, rotate: 0, scale: 1,
    config: { friction: 50, tension: 500 }
  }))

  const SWIPE_THRESHOLD = 120  // px before triggering action

  const bind = useDrag(({ active, movement: [mx, my], velocity: [vx], direction: [dx] }) => {
    const trigger = Math.abs(mx) > SWIPE_THRESHOLD || Math.abs(vx) > 0.5

    if (!active && trigger) {
      if (my < -80) {
        // Swipe up — save
        api.start({ y: -600, rotate: 0, scale: 0.8 })
        onSave(outfit)
        track('outfit_saved_swipe', { outfit_id: outfit.id })
      } else if (mx > 0) {
        // Swipe right — accept
        api.start({ x: 600, rotate: 20, scale: 1 })
        onAccept(outfit)
        track('suggestion_accepted', {
          outfit_id: outfit.id,
          method: 'swipe',
          velocity: vx,
        })
      } else {
        // Swipe left — reject
        api.start({ x: -600, rotate: -20, scale: 1 })
        onReject(outfit)
        track('suggestion_rejected', {
          outfit_id: outfit.id,
          method: 'swipe',
          velocity: vx,
        })
      }
    } else {
      // While dragging — follow finger, rotate slightly
      api.start({
        x: active ? mx : 0,
        y: active ? my * 0.3 : 0,
        rotate: active ? mx / 15 : 0,
        scale: active ? 1.05 : 1,
        immediate: active,
      })
    }
  }, {
    filterTaps: true,
    bounds: { top: -100 },
    rubberband: true,
  })

  // Visual feedback — color the card edge as user drags
  const cardColor = x.to(x => {
    if (x > 40) return `rgba(34, 197, 94, ${Math.min(x/120, 0.3)})`   // green tint
    if (x < -40) return `rgba(239, 68, 68, ${Math.min(-x/120, 0.3)})` // red tint
    return 'transparent'
  })

  return (
    <animated.div
      {...bind()}
      style={{ x, y, rotate, scale,
               touchAction: 'none',
               background: cardColor }}
      className="outfit-card"
      onClick={() => onEdit(outfit)}
    >
      <OutfitDisplay outfit={outfit} />
      <SwipeHints x={x} y={y} />
    </animated.div>
  )
}

// Visual hints that appear as user drags
function SwipeHints({ x, y }) {
  const acceptOpacity = x.to(x => Math.max(0, Math.min(1, x / 80)))
  const rejectOpacity = x.to(x => Math.max(0, Math.min(1, -x / 80)))
  const saveOpacity   = y.to(y => Math.max(0, Math.min(1, -y / 60)))

  return (
    <>
      <animated.div className="hint hint-accept" style={{ opacity: acceptOpacity }}>
        WEARING IT ✓
      </animated.div>
      <animated.div className="hint hint-reject" style={{ opacity: rejectOpacity }}>
        NEXT →
      </animated.div>
      <animated.div className="hint hint-save" style={{ opacity: saveOpacity }}>
        SAVED ↑
      </animated.div>
    </>
  )
}
```

### Haptic Feedback

On native (Capacitor), add haptic confirmation on swipe completion:

```javascript
import { Haptics, ImpactStyle } from '@capacitor/haptics'

// In onAccept callback
if (window.Capacitor?.isNativePlatform()) {
  Haptics.impact({ style: ImpactStyle.Medium })
}

// In onReject callback
if (window.Capacitor?.isNativePlatform()) {
  Haptics.impact({ style: ImpactStyle.Light })
}
```

### Rejection Follow-Up (Optional Quick Tag)

After a left swipe, optionally surface a quick tag panel. Keep it to 4 options max — if it takes more than 1 second to respond to, users will ignore it.

```jsx
// Appears briefly after swipe left — auto-dismisses after 3 seconds
function RejectionTag({ onTag, onDismiss }) {
  return (
    <div className="rejection-tags">
      <p>What was off?</p>
      <div className="tag-row">
        <button onClick={() => onTag('too_formal')}>Too formal</button>
        <button onClick={() => onTag('too_casual')}>Too casual</button>
        <button onClick={() => onTag('wrong_weather')}>Wrong for weather</button>
        <button onClick={() => onTag('just_not_feeling_it')}>Not feeling it</button>
      </div>
      <button className="skip" onClick={onDismiss}>Skip</button>
    </div>
  )
}
```

Tag data feeds directly into the TF model as weighted negative signals per category.

### Training Signal from Swipe

```javascript
// server/services/FeedbackService.js

async recordSwipeFeedback({ userId, outfitId, action, tag = null, velocity = null }) {
  // action: 'accept' | 'reject' | 'save'

  const outfit = await this.getOutfit(outfitId)

  for (const item of outfit.items) {
    const feedbackValue = action === 'accept' ? 0.9
                        : action === 'save'   ? 0.7
                        : action === 'reject' ? 0.1
                        : 0.5

    // Weight by velocity — fast confident swipe = stronger signal
    const velocityWeight = velocity ? Math.min(1 + velocity * 0.1, 1.3) : 1.0
    const weightedValue  = Math.min(feedbackValue * velocityWeight, 1.0)

    await this.db.run(`
      INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
      VALUES (?, ?, ?, ?)
    `, [userId, item.id, weightedValue, tag || action])
  }
}
```

---

## Phase 2 — Outfit Editing

### The Core Insight

A rejected outfit is often 90% correct. One wrong item — shoes too casual, bag doesn't match, wrong layer for the temperature — causes the whole outfit to be rejected. That's a weak training signal: the model learns "user didn't like this outfit" but doesn't learn *which item* was the problem.

Edit-then-accept is the richest interaction in the app. It tells the model exactly what was wrong at the item level.

```
Accept as-is          →  All items get strong positive signal
Accept after swap     →  Swapped-out item gets negative signal
                          Swapped-in item gets positive signal
                          Remaining items get positive signal
Accept after remove   →  Removed item gets negative signal
                          Remaining items get positive signal
```

Over time the model learns not just "what they like" but "what they change" — which is a meaningfully more precise signal.

### Edit Mode UI

Tap the outfit card to enter edit mode:

```
┌─────────────────────────────────────────────────────┐
│  TUESDAY'S OUTFIT                          [Done ✓] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐           │
│  │ Top  │  │Bottom│  │Shoes │  │ Bag  │           │
│  │      │  │      │  │  ✕   │  │      │           │
│  │[swap]│  │[swap]│  │[swap]│  │[swap]│           │
│  └──────┘  └──────┘  └──────┘  └──────┘           │
│                                                     │
│  + Add item                                         │
│                                                     │
│  [Cancel]                          [Accept outfit]  │
└─────────────────────────────────────────────────────┘
```

### Swap Interaction

Tapping "swap" on any item opens a filtered wardrobe browser showing alternatives in the same category, sorted by preference score from the TF model.

```jsx
// client/src/components/OutfitEditor.jsx
export function OutfitEditor({ outfit, onAccept, onCancel }) {
  const [items, setItems]   = useState(outfit.items)
  const [swaps, setSwaps]   = useState({})  // itemId → newItemId
  const [removed, setRemoved] = useState(new Set())
  const [added, setAdded]   = useState([])

  const handleSwap = async (oldItem, newItem) => {
    setItems(items.map(i => i.id === oldItem.id ? newItem : i))
    setSwaps({ ...swaps, [oldItem.id]: newItem.id })

    track('outfit_item_swapped', {
      outfit_id: outfit.id,
      old_item_id: oldItem.id,
      new_item_id: newItem.id,
      category: oldItem.category,
      reason: 'manual_swap',
    })
  }

  const handleRemove = (item) => {
    setItems(items.filter(i => i.id !== item.id))
    setRemoved(new Set([...removed, item.id]))

    track('outfit_item_removed', {
      outfit_id: outfit.id,
      item_id: item.id,
      category: item.category,
    })
  }

  const handleAccept = async () => {
    // Record granular feedback for each item
    await recordEditFeedback({
      outfitId: outfit.id,
      originalItems: outfit.items,
      finalItems: items,
      swaps,
      removed: [...removed],
      added: added.map(i => i.id),
    })

    onAccept({ ...outfit, items })

    track('suggestion_accepted', {
      outfit_id: outfit.id,
      method: 'edited',
      swaps_made: Object.keys(swaps).length,
      items_removed: removed.size,
      items_added: added.length,
    })
  }

  return (
    <div className="outfit-editor">
      <div className="edit-items">
        {items.map(item => (
          <EditableItem
            key={item.id}
            item={item}
            onSwap={(newItem) => handleSwap(item, newItem)}
            onRemove={() => handleRemove(item)}
          />
        ))}
      </div>
      <AddItemButton
        category={null}
        onAdd={(item) => setAdded([...added, item])}
      />
      <div className="edit-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={handleAccept} className="primary">Accept outfit</button>
      </div>
    </div>
  )
}
```

### Granular Feedback Recording

```javascript
// server/services/FeedbackService.js

async recordEditFeedback({ outfitId, originalItems, finalItems, swaps, removed, added }) {
  const userId = this.userId

  for (const item of originalItems) {
    if (removed.includes(item.id)) {
      // Explicitly removed — negative signal
      await this.db.run(`
        INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
        VALUES (?, ?, 0.05, 'outfit_edit_removed')
      `, [userId, item.id])

    } else if (swaps[item.id]) {
      // Swapped out — mild negative signal
      await this.db.run(`
        INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
        VALUES (?, ?, 0.2, 'outfit_edit_swapped_out')
      `, [userId, item.id])

      // Swapped in — positive signal
      await this.db.run(`
        INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
        VALUES (?, ?, 0.85, 'outfit_edit_swapped_in')
      `, [userId, swaps[item.id]])

    } else {
      // Kept — positive signal (they chose to keep it)
      await this.db.run(`
        INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
        VALUES (?, ?, 0.9, 'outfit_edit_kept')
      `, [userId, item.id])
    }
  }

  // Added items — strong positive signal
  for (const itemId of added) {
    await this.db.run(`
      INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
      VALUES (?, ?, 0.95, 'outfit_edit_added')
    `, [userId, itemId])
  }
}
```

### What the Model Learns

After enough edit interactions, the model builds item-level preference patterns:

```
"User consistently swaps flats → deprioritize flats for work occasions"
"User always adds a blazer to casual suggestions → blazer is versatile for this user"
"User never keeps the suggested bag → stop including bags in outfit suggestions"
"User swaps blue items for navy → prefer deeper tones"
```

These patterns emerge naturally from the feedback data without explicit programming.

---

## Phase 3 — Voice Feedback

### Overview

Voice feedback allows users to explain in natural language why they rejected an outfit. "These shoes are too casual for a Monday" becomes a structured training signal. This is a Phase 3 feature — the swipe + edit interactions provide sufficient signal quality for beta and v1. Voice is the refinement layer that makes the model exceptional.

**Do not build this until:** The TF model is well-trained on swipe + edit signals, outfit acceptance rate is consistently above 40%, and users are organically asking for a way to explain their rejections.

### The Pipeline

```
User speaks after swipe left
        ↓
Web Speech API (browser) or Whisper API (higher quality)
captures audio → text transcript
        ↓
Transcript sent to Gemini with structured extraction prompt
        ↓
Gemini returns structured attributes JSON
        ↓
Attributes stored in item_feedback as weighted signals
        ↓
TF model trains on structured attributes
```

### Speech-to-Text

Two options depending on quality requirements:

**Option A — Web Speech API (free, browser-native)**
```javascript
// Works in Chrome and Safari — no API cost
const recognition = new webkitSpeechRecognition()
recognition.continuous = false
recognition.interimResults = false
recognition.lang = 'en-US'

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript
  processVoiceFeedback(transcript)
}

recognition.start()
// User speaks → recognition.onresult fires → transcript ready
```

**Option B — OpenAI Whisper API (~$0.006/minute)**
Better accuracy, works on all browsers, handles accents and background noise:
```javascript
// Record audio blob → send to Whisper → get transcript
const response = await openai.audio.transcriptions.create({
  file: audioBlob,
  model: 'whisper-1',
  language: 'en',
})
const transcript = response.text
```

### Gemini NLP Extraction

The transcript is sent to Gemini with a prompt that extracts structured attributes:

```javascript
// server/services/VoiceFeedbackService.js

const EXTRACTION_PROMPT = `
You are extracting structured feedback from a user comment about an outfit suggestion.

User said: "${transcript}"

Extract feedback attributes and return ONLY valid JSON matching this schema:
{
  "sentiment": "positive" | "negative" | "neutral",
  "items_mentioned": [
    {
      "category": "tops" | "bottoms" | "shoes" | "outerwear" | "accessories" | "bags",
      "sentiment": "positive" | "negative",
      "reasons": ["too_casual" | "too_formal" | "wrong_color" | "wrong_weather" |
                  "dont_like_style" | "worn_recently" | "love_it" | "fits_well" |
                  "uncomfortable" | "occasion_mismatch"]
    }
  ],
  "occasion_context": "work" | "casual" | "formal" | "active" | "date" | null,
  "weather_context": "too_warm" | "too_cold" | "wrong_for_rain" | null,
  "general_sentiment": "overall_positive" | "overall_negative" | "mixed",
  "confidence": 0.0 to 1.0
}

If the comment doesn't clearly map to any attribute, use null.
Return ONLY the JSON object, no other text.
`

async extractFeedbackAttributes(transcript) {
  const response = await gemini.generateContent(EXTRACTION_PROMPT)
  try {
    return JSON.parse(response.text)
  } catch {
    // Gemini returned non-JSON — log and return null
    fastify.log.warn({ transcript }, 'Voice feedback extraction failed')
    return null
  }
}
```

### The Schema Challenge

The critical design decision is the attribute schema. It must be:
- **Consistent** — Gemini must extract the same attributes regardless of phrasing
- **Bounded** — finite set of categories and reasons the TF model can train on
- **Extensible** — new reasons can be added as users surface them

The schema above covers the most common rejection reasons. Expand it based on what users actually say during beta — the voice transcripts are a goldmine for understanding why suggestions fail.

### Storing Voice Feedback

```sql
-- Add to schema
CREATE TABLE IF NOT EXISTS voice_feedback (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  outfit_id       INTEGER,
  transcript      TEXT NOT NULL,
  extracted_attrs TEXT,    -- JSON from Gemini extraction
  confidence      REAL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Converting Voice Attributes to TF Signals

```javascript
async recordVoiceFeedback(userId, outfitId, transcript) {
  const attrs = await this.extractFeedbackAttributes(transcript)
  if (!attrs || attrs.confidence < 0.6) return  // Low confidence — ignore

  // Store raw transcript + extracted attrs
  this.db.run(`
    INSERT INTO voice_feedback (user_id, outfit_id, transcript, extracted_attrs, confidence)
    VALUES (?, ?, ?, ?, ?)
  `, [userId, outfitId, transcript, JSON.stringify(attrs), attrs.confidence])

  // Convert to item-level feedback signals
  const outfit = await this.getOutfit(outfitId)

  for (const itemFeedback of attrs.items_mentioned) {
    // Find matching items in the outfit by category
    const matchingItems = outfit.items.filter(i => i.category === itemFeedback.category)

    for (const item of matchingItems) {
      const feedbackValue = itemFeedback.sentiment === 'positive' ? 0.85 : 0.15

      this.db.run(`
        INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
        VALUES (?, ?, ?, ?)
      `, [userId, item.id, feedbackValue,
          `voice_${itemFeedback.reasons?.[0] || itemFeedback.sentiment}`])
    }
  }
}
```

### Voice UX

Keep the voice interaction frictionless — it should feel like talking to someone, not filling out a form:

```jsx
// Appears 1 second after swipe left — auto-dismisses after 5 seconds
function VoiceFeedback({ outfitId, onComplete, onSkip }) {
  const [state, setState] = useState('idle')  // idle | listening | processing | done

  const startListening = () => {
    setState('listening')
    // Start Web Speech API or record audio
    // ...
  }

  return (
    <div className="voice-feedback">
      {state === 'idle' && (
        <>
          <p>Tell us what was off?</p>
          <button className="voice-btn" onClick={startListening}>
            🎤 Speak
          </button>
          <button className="skip-btn" onClick={onSkip}>Skip</button>
        </>
      )}
      {state === 'listening' && (
        <div className="listening-indicator">
          <div className="pulse-ring" />
          <p>Listening...</p>
        </div>
      )}
      {state === 'processing' && <p>Got it...</p>}
      {state === 'done'       && <p>Thanks — we'll learn from that.</p>}
    </div>
  )
}
```

---

## Combined Interaction Flow

The full interaction experience from suggestion to training signal:

```
Outfit card appears (card stack)
        │
        ├── SWIPE RIGHT (fast)
        │   → Accept all items: strong positive signal (0.9)
        │   → Velocity-weighted: faster swipe = stronger signal
        │   → Haptic feedback (native)
        │
        ├── SWIPE UP
        │   → Save for later: moderate positive signal (0.7)
        │   → No rejection tag / voice prompt
        │
        ├── SWIPE LEFT (fast)
        │   → All items: negative signal (0.1)
        │   → Optional rejection tag appears (4 options, 3 second timeout)
        │   → [Phase 3] Optional voice prompt appears after tag
        │
        └── TAP → Edit mode
                    │
                    ├── Keep all items → Accept
                    │   → All kept items: strong positive (0.9)
                    │
                    ├── Swap item(s) → Accept
                    │   → Swapped out: mild negative (0.2)
                    │   → Swapped in: positive (0.85)
                    │   → Kept items: positive (0.9)
                    │
                    ├── Remove item(s) → Accept
                    │   → Removed: strong negative (0.05)
                    │   → Kept items: positive (0.9)
                    │
                    └── Add item(s) → Accept
                        → Added: strong positive (0.95)
                        → All other items: positive (0.9)
```

---

## PostHog Events

```javascript
// Swipe events
track('suggestion_accepted',    { method: 'swipe', velocity, outfit_id })
track('suggestion_rejected',    { method: 'swipe', velocity, outfit_id })
track('outfit_saved_swipe',     { outfit_id })
track('rejection_tag_selected', { tag, outfit_id })
track('rejection_tag_skipped',  { outfit_id })

// Edit events
track('outfit_edit_opened',     { outfit_id })
track('outfit_item_swapped',    { outfit_id, category, old_item_id, new_item_id })
track('outfit_item_removed',    { outfit_id, category, item_id })
track('outfit_item_added',      { outfit_id, category, item_id })
track('suggestion_accepted',    { method: 'edited', swaps_made, items_removed, outfit_id })
track('outfit_edit_cancelled',  { outfit_id })

// Voice events (Phase 3)
track('voice_feedback_prompted',  { outfit_id })
track('voice_feedback_started',   { outfit_id })
track('voice_feedback_completed', { outfit_id, transcript_length, confidence })
track('voice_feedback_skipped',   { outfit_id })
```

---

## Implementation Phases

### Phase 1 — Beta Launch

```
□ SwipeCard component with right/left gestures
□ Card stack visual (2-3 cards)
□ Swipe hints (accept/reject labels appear while dragging)
□ Velocity-weighted feedback recording
□ Rejection tag panel (4 options, 3 second timeout)
□ Haptic feedback (Capacitor — when native)
□ PostHog swipe events
```

### Phase 2 — v1.5 (after beta, before public launch)

```
□ Outfit edit mode
□ Item swap — filtered wardrobe browser
□ Item remove
□ Item add
□ Granular item-level feedback recording
□ PostHog edit events
□ TF model retrained on edit signals
```

### Phase 3 — v2 (after public launch, when acceptance rate > 40%)

```
□ Voice feedback prompt after swipe left
□ Web Speech API integration
□ Gemini NLP extraction pipeline
□ Voice feedback schema + storage
□ Voice → TF signal conversion
□ Whisper API upgrade (if quality insufficient)
□ PostHog voice events
```

---

## New Files

```
client/src/
├── components/
│   ├── OutfitSwipeCard.jsx     # Swipe gesture card
│   ├── CardStack.jsx           # Card stack visual
│   ├── RejectionTags.jsx       # Post-swipe tag panel
│   ├── OutfitEditor.jsx        # Edit mode UI
│   ├── EditableItem.jsx        # Individual item in edit mode
│   ├── ItemSwapBrowser.jsx     # Wardrobe browser for swapping
│   └── VoiceFeedback.jsx       # Voice prompt UI (Phase 3)
└── pages/
    └── OutfitPage.jsx          # Main outfit suggestion page

server/
└── services/
    ├── FeedbackService.js      # Swipe + edit feedback recording
    └── VoiceFeedbackService.js # Voice NLP pipeline (Phase 3)
```

---

## Key Design Decisions

**Velocity-weighted signals.** A fast, confident swipe right carries more weight than a slow, hesitant one. Users who swipe quickly have a clear preference. Users who swipe slowly may be unsure. The TF model should reflect this nuance.

**Edit is the richest signal.** A swipe tells you the outfit was wrong. An edit tells you exactly what was wrong and what was right. Prioritise making edit mode fast and frictionless — every edit interaction is worth more than ten swipes.

**Voice is Phase 3, not Phase 1.** The NLP pipeline adds meaningful complexity. Swipe + edit gives you 80% of the signal quality at 10% of the complexity. Build voice when the model is mature enough to benefit from the nuance it provides.

**Rejection tags are optional, not required.** Never block the swipe gesture with a mandatory form. The tag panel appears briefly and auto-dismisses. A tag is a bonus signal. The swipe itself is the signal.

**The card stack is a psychological choice.** Showing more cards behind the current one communicates abundance — "there are more options" — which reduces the anxiety of rejecting a suggestion. Users swipe more freely when they know another option is immediately behind.
