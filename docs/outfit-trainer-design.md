# THREAD Outfit Trainer - Design Document

## Overview

A feature for rapid-fire outfit generation with feedback-based learning. Users can:
1. Generate multiple outfit combinations instantly
2. Preview complete outfits with category selection
3. Give per-item feedback (thumbs up/down/neutral)
4. "Train" the neural network (learn from feedback)

## ML Architecture

### The Goal

Build a neural network that learns user fashion preferences and generates personalized outfit recommendations.

### Current State (What Already Exists)

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

## Neural Network Specification

### Architecture: Collaborative Filtering + Content-Based Hybrid

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THREAD NEURAL NETWORK                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   USER       │    │    ITEM      │    │   CONTEXT    │          │
│  │  EMBEDDING   │    │  EMBEDDING   │    │  EMBEDDING   │          │
│  │              │    │              │    │              │          │
│  │  - style_prefs│    │  - category │    │  - weather   │          │
│  │  - color_pref │    │  - colors   │    │  - occasion  │          │
│  │  - fit_pref  │    │  - pattern  │    │  - time      │          │
│  │  - brand_aff │    │  - material │    │  - location  │          │
│  │  - formality │    │  - brand    │    │  - season    │          │
│  │              │    │  - ema_score│    │              │          │
│  │  [64 dims]   │    │  [128 dims] │    │  [32 dims]   │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                    │
│         └───────────────────┼───────────────────┘                    │
│                             ▼                                        │
│                    ┌───────────────┐                                 │
│                    │    CONCAT     │                                 │
│                    │   [224 dims]  │                                 │
│                    └───────┬───────┘                                 │
│                            ▼                                        │
│                    ┌───────────────┐                                 │
│                    │  DENSE LAYERS │                                │
│                    │  224 → 128 → 64                              │
│                    │  ReLU, Dropout                                 │
│                    └───────┬───────┘                                 │
│                            ▼                                        │
│                    ┌───────────────┐                                 │
│                    │   OUTPUT       │                                │
│                    │  [1]           │                                │
│                    │  Sigmoid       │                                │
│                    │  (0-1 score)  │                                │
│                    └───────────────┘                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Training Data Schema

```sql
-- Raw feedback events (training data)
CREATE TABLE training_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  
  -- Input features
  user_style_vector FLOAT[],      -- [64] user style preference
  item_category INTEGER,           -- category_id
  item_color_vector FLOAT[],      -- [6] RGB + hsl
  item_pattern TEXT,
  item_material TEXT,
  item_brand TEXT,
  item_ema_score FLOAT,           -- existing score
  
  -- Context
  context_weather TEXT,
  context_occasion TEXT,
  context_time_of_day TEXT,
  context_season TEXT,
  context_location TEXT,
  
  -- Target
  feedback_type TEXT NOT NULL,    -- 'thumbs_up', 'thumbs_down', 'worn', 'skipped'
  feedback_value FLOAT NOT NULL,  -- 1.0, -0.8, 1.0, -0.2 etc
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User preference profile (learned)
CREATE TABLE user_preference_profiles (
  user_id INTEGER PRIMARY KEY,
  style_vector FLOAT[],           -- [64] learned style preferences
  color_preferences FLOAT[],      -- [12] preferred colors
  formality_score FLOAT,           -- 0-10 scale
  brand_affinities JSON,          -- {brand_name: score}
  fit_preference TEXT,            -- 'slim', 'regular', 'loose'
  model_version TEXT,            -- 'v1.0', 'v1.1'
  last_trained_at DATETIME,
  training_samples INTEGER        -- how many feedback events used
);

-- Model versions
CREATE TABLE model_versions (
  id INTEGER PRIMARY KEY,
  version TEXT NOT NULL,          -- 'v1.0'
  architecture JSON,              -- model config
  accuracy_score FLOAT,           -- validation accuracy
  trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
```

### Feedback Signal Taxonomy

| Signal | Source | Value | Confidence |
|--------|--------|-------|------------|
| `thumbs_up` | Outfit Trainer | +1.0 | High |
| `thumbs_down` | Outfit Trainer | -1.0 | High |
| `neutral` | Outfit Trainer | 0.0 | None |
| `exclude` | Outfit Trainer | -0.5 | Medium |
| `worn_confirmed` | Calendar/log | +1.0 | Very High |
| `voice_positive` | Voice feedback | +0.8 | High |
| `voice_negative` | Voice feedback | -0.7 | High |
| `saved_outfit` | User saved | +0.6 | Medium |
| `viewed_long` | Passive | +0.2 | Low |
| `skipped_repeated` | Passive | -0.3 | Low |

### Training Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRAINING PIPELINE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. COLLECT FEEDBACK                                          │
│     └── User interactions → training_events                     │
│                                                                  │
│  2. PREPROCESS                                                │
│     ├── Normalize embeddings                                   │
│     ├── Encode categoricals                                    │
│     └── Balance classes (upsample minority)                    │
│                                                                  │
│  3. TRAIN (TF.js in Docker)                                  │
│     ├── Split: 80% train / 20% validation                    │
│     ├── Optimizer: Adam (lr=0.001)                            │
│     ├── Loss: Binary Crossentropy                              │
│     ├── Epochs: 50-100                                        │
│     └── Early stopping: patience=5                             │
│                                                                  │
│  4. EVALUATE                                                  │
│     ├── Accuracy, Precision, Recall, F1                        │
│     ├── A/B test vs baseline (random/heuristic)              │
│     └── User satisfaction surveys                               │
│                                                                  │
│  5. DEPLOY                                                    │
│     ├── Save model weights                                     │
│     ├── Update model_versions table                            │
│     ├── User preference profiles update                        │
│     └── Canary deploy to subset of users                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Inference

```javascript
// Generate outfit score
async function scoreOutfit(userId, items, context) {
  // 1. Get user preference profile
  const profile = await db.getUserProfile(userId)
  
  // 2. Get item embeddings
  const itemEmbeddings = await Promise.all(
    items.map(item => getItemEmbedding(item))
  )
  
  // 3. Get context embedding
  const contextEmbedding = getContextEmbedding(context)
  
  // 4. Run inference
  const input = concat([
    profile.style_vector,
    ...itemEmbeddings,
    contextEmbedding
  ])
  
  const score = await tfModel.predict(input)
  return score  // 0-1 probability
}

// Generate multiple combos, rank by score
async function generateOutfits(userId, availableItems, context, n = 5) {
  const combos = generateCombinations(availableItems)
  const scored = await Promise.all(
    combos.map(combo => ({
      combo,
      score: scoreOutfit(userId, combo.items, context)
    }))
  )
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}
```

### User Preference Learning

The model learns these dimensions:

| Dimension | Examples | How Learned |
|-----------|----------|-------------|
| **Style** | casual, formal, edgy, classic | Thumbs up/down on outfits |
| **Colors** | navy, black, earth tones | Which colors appear in liked items |
| **Formality** | 1-10 scale | Occasion-based feedback |
| **Brands** | preferred brands | Repeated selection of brand |
| **Fit** | slim, regular, loose | Feedback on specific items |
| **Layers** | single, layered, weather-appropriate | Weather + choice correlation |
| **Accessories** | minimal, statement | Feedback on accessory items |

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

---

## Model Blending: EMA → Neural Network

As the NN gets trained, it should gradually take over from EMA.

### Transition Formula

```
final_score = (1 - nn_weight) * ema_score + nn_weight * nn_score
```

### Training Stages

| Stage | EMA Weight | NN Weight | Description |
|-------|-----------|-----------|-------------|
| v1.0 | 100% | 0% | Pure EMA, collecting feedback |
| v1.1-v1.x | 80-95% | 5-20% | NN getting trained, low confidence |
| v2.0 | 50% | 50% | First trained NN, balanced |
| v2.1+ | 20-40% | 60-80% | NN dominant, EMA as fallback |
| v3.0 | 0% | 100% | Full NN (if desired) |

### Determining NN Weight

```javascript
function getNnWeight(trainingSamples, validationAccuracy) {
  // Weight based on training data size
  const dataWeight = Math.min(trainingSamples / 1000, 0.5)  // Max 50% from data size
  
  // Weight based on validation accuracy
  const accuracyWeight = validationAccuracy > 0.7 
    ? (validationAccuracy - 0.7) * 1.5  // 0-45% from accuracy
    : 0
  
  // Minimum 5% NN once we have any training
  const nnWeight = Math.max(0.05, dataWeight + accuracyWeight)
  
  return Math.min(nnWeight, 0.95)  // Never go above 95%
}

// Usage in outfit generation
async function scoreOutfit(userId, items, context) {
  const emaScore = getEmaScore(items)  // Current EMA
  
  let nnScore = 0.5  // Default (neutral)
  if (nnModelReady) {
    nnScore = await nnPredict(userId, items, context)
  }
  
  const nnWeight = getNnWeight(trainingSamples, accuracy)
  const finalScore = (1 - nnWeight) * emaScore + nnWeight * nnScore
  
  return finalScore
}
```

### Confidence Signals

The NN should signal its confidence:
- **High confidence** (>1000 samples, >80% accuracy): NN can dominate
- **Medium confidence** (500-1000 samples, 70-80%): Blend 50/50
- **Low confidence** (<500 samples): NN only 5-10%, EMA dominant
- **No training**: NN = 0%, pure EMA

### A/B Testing During Transition

Run parallel generation:
- 50% users get EMA-weighted
- 50% get NN-weighted
- Compare user satisfaction metrics
- Gradually roll out NN as confidence grows
