# THREAD Outfit Trainer - Design Document

## Overview

A feature for rapid-fire outfit generation with feedback-based learning. Users can:
1. Generate multiple outfit combinations instantly
2. Preview complete outfits with category selection
3. Give per-item feedback (thumbs up/down/neutral)
4. "Train" the model (apply feedback to preferences)

## Current State (What Already Exists)

### PreferenceService
- EMA (Exponential Moving Average) scoring per item
- Signal weights:
  - `worn_confirmed`: 1.0
  - `thumbs_up`: 0.6
  - `loved_item`: 0.55
  - `thumbs_down`: -0.8
  - `skipped_repeatedly`: -0.2

### OutfitEngine
- Generates outfits from wardrobe items
- Considers occasion, weather, time of day
- Returns outfit combinations

---

## Feature: Outfit Trainer

### 1. UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ OUTFIT TRAINER                                          [⚙️]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ CATEGORY SELECTOR                                        │   │
│  │                                                          │   │
│  │  Top:        [Dropdown: Any/T-Shirt/Button-Up/Hoodie]   │   │
│  │  Bottom:     [Dropdown: Any/Jeans/Pants/Shorts]         │   │
│  │  Footwear:   [Dropdown: Any/Sneakers/Boots/Shoes]       │   │
│  │  Accessory:  [Dropdown: Any/Belt/Hat/Socks]            │   │
│  │                                                          │   │
│  │  Style:      [All │ Casual │ Formal │ Date]             │   │
│  │                                                          │   │
│  │  Count: [5] outfits  [🔄 Refresh]                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ OUTFIT 1 │ │ OUTFIT 2 │ │ OUTFIT 3 │ │ OUTFIT 4 │  ...   │
│  │          │ │          │ │          │ │          │        │
│  │  👕      │ │  👕      │ │  👕      │ │  👕      │        │
│  │  [img]   │ │  [img]   │ │  [img]   │ │  [img]   │        │
│  │  [☐]     │ │  [☐]     │ │  [☐]     │ │  [☐]     │        │
│  │          │ │          │ │          │ │          │        │
│  │  👖      │ │  👖      │ │  👖      │ │  👖      │        │
│  │  [img]   │ │  [img]   │ │  [img]   │ │  [img]   │        │
│  │  [☐]     │ │  [☐]     │ │  [☐]     │ │  [☐]     │        │
│  │          │ │          │ │          │ │          │        │
│  │  👟      │ │  👟      │ │  👟      │ │  👟      │        │
│  │  [img]   │ │  [img]   │ │  [img]   │ │  [img]   │        │
│  │  [☐]     │ │  [☐]     │ │  [☐]     │ │  [☐]     │        │
│  │          │ │          │ │          │ │          │        │
│  │  👍 👎 😐 │ │  👍 👎 😐 │ │  👍 👎 😐 │ │  👍 👎 😐 │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ FEEDBACK QUEUE: 12 items pending                       │   │
│  │ [👍 Upload Training Data]  [🧠 Train Model]             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Data Model

```sql
-- Feedback per item in an outfit
CREATE TABLE outfit_feedback (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  outfit_id INTEGER,  -- optional, if outfit was saved
  item_id INTEGER NOT NULL,
  feedback_type TEXT NOT NULL,  -- 'thumbs_up', 'thumbs_down', 'neutral', 'exclude'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Training sessions
CREATE TABLE training_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  feedback_count INTEGER NOT NULL,
  model_version TEXT,  -- e.g., 'v1.0'
  trained_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. API Endpoints

```
POST /api/v1/outfit-trainer/generate
  Body: { categories: { top, bottom, footwear, accessory }, count: 5 }
  Returns: { outfits: [...] }

POST /api/v1/outfit-trainer/feedback
  Body: { itemId, feedbackType, outfitId? }
  Returns: { success, newScore }

POST /api/v1/outfit-trainer/train
  Body: { }  -- Apply all pending feedback
  Returns: { success, itemsUpdated, newModelVersion }

GET  /api/v1/outfit-trainer/stats
  Returns: { pendingFeedback, trainingCount, lastTrained }
```

### 4. Feedback Flow

```
User clicks refresh
       │
       ▼
┌──────────────────┐
│ Generate N      │
│ outfit combos  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Display grid    │
│ of outfits     │
└────────┬─────────┘
         │
         ▼
User gives feedback per item
(thumbs up/down/neutral/exclude)
         │
         ▼
┌──────────────────┐
│ Queue feedback  │
│ in DB          │
└────────┬─────────┘
         │
         ▼
User clicks "Train Model"
         │
         ▼
┌──────────────────┐
│ Apply EMA       │
│ update to      │
│ item scores    │
└────────┬─────────┘
         │
         ▼
Future generations
include preference
context
```

### 5. "Training" Implementation

Since we already have EMA scoring in PreferenceService, "training" means:

1. Collect all pending feedback
2. Apply signal weights:
   - `thumbs_up` → +0.6 to item's EMA score
   - `thumbs_down` → -0.8 to item's EMA score
   - `neutral` → no change
   - `exclude` → -0.5 (don't show this combo again)
3. Store training session record
4. Return new model version number

**No actual ML model retraining** — just updating preference weights that the OutfitEngine uses.

### 6. Outfit Display Template

Default template:
```
┌─────────────────┐
│     TOP        │  ← Required
├─────────────────┤
│    BOTTOM      │  ← Required  
├─────────────────┤
│   FOOTWEAR     │  ← Required
├─────────────────┤
│  ACCESSORY 1   │  ← Optional
│  ACCESSORY 2   │  ← Optional
└─────────────────┘
```

Categories mapped to slots:
- **Top**: T-Shirt, Button-Up, Knitwear, Hoodie, Jacket, Blouse, Dress, Tank
- **Bottom**: Jeans, Pants, Shorts, Skirts, Leggings
- **Footwear**: Boots, Sneakers, Shoes, Sandals, Heels, Flats
- **Accessory**: Belt, Hat, Socks, Scarf, Necklace, Earrings, Bracelet, Handbag

---

## Implementation Phases

### Phase 1: Rapid-Fire Generation (MVP)
- [ ] New OutfitTrainer page/component
- [ ] Category dropdowns
- [ ] Generate N outfits at once
- [ ] Grid display

### Phase 2: Feedback
- [ ] Per-item thumbs up/down/neutral buttons
- [ ] Exclude checkbox
- [ ] Queue feedback in DB

### Phase 3: Training
- [ ] "Train" button
- [ ] Apply EMA updates
- [ ] Training session tracking
- [ ] Model version display

### Phase 4: Integration
- [ ] Connect to existing PreferenceService
- [ ] Pass preference context to OutfitEngine
- [ ] Verify outfits respect learned preferences

---

## Open Questions

1. **How many outfits to generate?** Default 5, max 20
2. **How to handle empty categories?** Allow "Any" or skip slot
3. **Accessories - max per outfit?** 2 accessories max
4. **Feedback persistence?** Keep history for 90 days
5. **Model version naming?** Semantic: v1.0, v1.1, etc.

---

## Technical Notes

- Reuse existing `PreferenceService.updateItemScore()` for training
- Reuse existing `OutfitEngine.generateOutfits()` with category filters
- Store feedback in new `outfit_feedback` table
- Training = applying weighted scores to EMA, not actual model retraining
