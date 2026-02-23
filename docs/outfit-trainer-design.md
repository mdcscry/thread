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

---

## Implementation Decisions (Answering Open Questions)

1. **How many outfits to generate?**
   - Default: 5
   - Max: 20
   - Minimum to generate: 1

2. **How to handle empty categories?**
   - "Any" option in dropdown fills from available items
   - If slot empty, outfit shows partial (just what's available)
   - Required minimum: Top + Bottom + Footwear = valid outfit

3. **Accessories - max per outfit?**
   - Max: 2 accessories per outfit
   - Optional - can have 0, 1, or 2

4. **Feedback persistence?**
   - Keep raw feedback for 90 days
   - Aggregate into user preference profile after 90 days
   - Delete raw data older than 1 year

5. **Model version naming?**
   - Semantic versioning: v1.0, v1.1, v2.0
   - v1.x: EMA-dominant (0-50% NN)
   - v2.x: NN-dominant (50-90% NN)
   - v3.x: Full NN (90-100%)

---

## TensorFlow.js Docker Setup

### Container Spec

```dockerfile
# Dockerfile.tfjs
FROM node:20

WORKDIR /app

# Install TF.js
RUN npm install @tensorflow/tfjs-node@latest

# Copy training scripts
COPY train.mjs .
COPY models/ ./models/

# Expose API port
EXPOSE 8081

# Run training server
CMD ["node", "server.mjs"]
```

### Training Server API

```
POST /api/v1/train
  Body: { userId, feedbackEvents: [...] }
  Returns: { modelVersion, accuracy, loss }

POST /api/v1/predict
  Body: { userId, items: [...], context: {...} }
  Returns: { score: 0.87 }

GET /api/v1/model/:userId/status
  Returns: { ready: true, samples: 1500, accuracy: 0.82 }
```

### Local Development

```bash
# Build
docker build -f Dockerfile.tfjs -t thread-tfjs .

# Run
docker run -p 8081:8081 -v ./models:/app/models thread-tfjs

# With GPU (if available)
docker run --gpus all -p 8081:8081 thread-tfjs
```

---

## Cold Start Strategy

For new users with no feedback history:

### Stage 1: Demographic-Based Defaults
```javascript
function getColdStartPreferences(gender, location, season) {
  // Use population-level defaults
  const defaults = {
    male: {
      casual: 0.7,
      formal: 0.3,
      colors: ['navy', 'black', 'gray'],
      formality: 5
    },
    female: {
      casual: 0.65,
      formal: 0.35,
      colors: ['black', 'white', 'beige'],
      formality: 5
    }
  }
  
  return defaults[gender] || defaults.male
}
```

### Stage 2: Quick Onboarding Quiz
Ask 5-10 questions on first launch:
- "What's your style? (Casual / Formal / Mix)"
- "What colors do you gravitate toward?"
- "Any brands you love/hate?"

### Stage 3: Transfer Learning
- Use pre-trained model on similar users
- Apply user's initial feedback to fine-tune

---

## Privacy Considerations

### Data Collection
- All feedback stored locally (SQLite) or encrypted in transit
- No third-party sharing
- User can export/delete their data

### GDPR/CCPA Compliance
- Right to access: Export all user data
- Right to deletion: "Delete my data" button
- Data retention: 1 year max, then auto-delete

### Anonymization for Model Training
- Aggregate across users for population insights
- Never share individual user data
- Differential privacy for population models

---

## Cost Analysis

### Current (EMA)
- Storage: ~$0 (SQLite)
- Compute: ~$0 (existing server)
- **Cost per user: ~$0/month**

### With TF.js
- Docker container: $5-20/month (always-on small instance)
- GPU training: $0.50/hour (on-demand)
- Storage for models: ~$1/month
- **Cost per user: ~$0.50-2.00/month**

### Optimization
- Train nightly (off-peak)
- Delete models after 30 days of inactivity
- Use CPU training (slower but cheaper)

---

## Success Metrics

### Immediate (v1.0)
- [ ] Users can generate outfits
- [ ] Feedback loop works
- [ ] EMA scores update correctly

### Short-term (v1.x)
- [ ] 100+ feedback events per active user
- [ ] 70%+ outfits generated with feedback
- [ ] User satisfaction > 3/5

### Medium-term (v2.0)
- [ ] NN model trained with 1000+ samples
- [ ] 75%+ prediction accuracy on held-out data
- [ ] User satisfaction > 4/5

### Long-term (v3.0)
- [ ] Full NN dominance (90%+)
- [ ] Personalized per-user models
- [ ] User satisfaction > 4.5/5

### Metrics to Track
```
- daily_active_users
- feedback_events_per_user
- outfits_generated_per_day
- thumbs_up_rate (what % are positive)
- model_accuracy_on_validation_set
- user_retention_30d
- net_promoter_score
```

---

## Future Enhancements

### v2.1: Visual Style Transfer
- Use CLIP or DALL-E embeddings
- "Generate outfit that looks like this photo"

### v2.2: Social Features
- Share outfits to community
- See what similar users wear
- Voting on community outfits

### v3.0: Advanced Context
- Calendar integration (events, meetings)
- Location-based suggestions (office vs outdoor)
- Weather-aware with multi-day forecasts

### v3.1: Voice Interface
- "What should I wear today?"
- Voice feedback: "This is great" / "Not feeling it"

---

## Summary

This design document covers:

1. ✅ Neural network architecture (user + item + context embeddings)
2. ✅ Training pipeline (feedback → training → evaluation → deploy)
3. ✅ UI for rapid-fire generation with feedback
4. ✅ API endpoints for generate/feedback/train/stats
5. ✅ EMA → NN blending strategy
6. ✅ Cold start handling
7. ✅ TensorFlow.js Docker setup
8. ✅ Privacy and compliance
9. ✅ Cost analysis
10. ✅ Success metrics

### Next Steps

1. **Immediate**: Test Outfit Trainer with current wardrobe
2. **Short**: Add more feedback signals (voice, worn log)
3. **Medium**: Set up TF.js Docker, collect 1000+ samples
4. **Long**: Train first NN model, start blending

---

*Document Version: 1.0*
*Last Updated: 2026-02-23*

---

## Additional Engineering Considerations

### Error Handling

```javascript
// Graceful degradation
async function generateOutfits(userId, filters, count) {
  try {
    // Try NN first
    if (nnReady && nnConfident) {
      return await nnGenerate(userId, filters, count)
    }
    // Fall back to EMA
    return await emaGenerate(userId, filters, count)
  } catch (error) {
    console.error('Generation failed:', error)
    // Ultimate fallback: random
    return await randomGenerate(userId, filters, count)
  }
}
```

**Error Scenarios:**
| Scenario | Handling |
|----------|----------|
| No items in category | Show partial outfit, warn user |
| NN timeout | Fall back to EMA |
| DB connection lost | Cache feedback locally, retry |
| Invalid feedback | Validate, reject malformed |

### Rate Limiting

```javascript
// Prevent abuse
const rateLimits = {
  generate: { max: 100, window: '1h' },
  feedback: { max: 500, window: '1h' },
  train: { max: 10, window: '24h' }
}
```

### Testing Strategy

```javascript
// Unit tests
describe('EMA Scoring', () => {
  test('thumbs_up increases score', () => {
    const item = { ema_score: 0.5, ema_count: 5 }
    const result = updateItemScore(item, 0.6)
    expect(result.ema_score).toBeGreaterThan(0.5)
  })
})

// Integration tests
test('feedback persists to DB', async () => {
  await submitFeedback([{ itemId: 1, type: 'thumbs_up' }])
  const feedback = await getFeedback(1)
  expect(feedback).toHaveLength(1)
})

// E2E tests
test('full trainer flow', async ({ page }) => {
  await login()
  await page.click('[data-testid="trainer"]')
  await page.click('Generate')
  await page.click('thumbs_up')
  await page.click('Submit')
  await expect(page.locator('.pending-count')).toHaveText('1')
})
```

### Security

- **Input validation**: Sanitize all feedback
- **SQL injection**: Use parameterized queries (done)
- **Rate limiting**: Per-user limits
- **API authentication**: Required for all endpoints (done)
- **Data encryption**: At rest for sensitive preferences

### Monitoring & Observability

```javascript
// Metrics to track
const metrics = {
  generation_latency_ms: histogram,
  feedback_submission_rate: counter,
  nn_model_confidence: gauge,
  ema_nn_blend_ratio: gauge,
  training_duration_seconds: histogram,
  user_satisfaction_score: gauge
}

// Alerts
if (nn_confidence < 0.5 && training_samples > 1000) {
  alert('NN underperforming with sufficient data')
}
```

### Edge Cases

1. **User deletes all items**: Clear feedback, restart learning
2. **Duplicate feedback**: Idempotent - don't double count
3. **Very large wardrobe**: Pagination, limit to top-scored items
4. **No feedback ever**: Pure cold start, use demographic defaults
5. **Conflicting feedback**: EMA naturally权重s recent over old
6. **Items deleted**: Keep feedback history, mark item_id as orphaned

### Migration Strategy

```sql
-- v1: Add tables
ALTER TABLE clothing_items ADD COLUMN ema_score DEFAULT 0.5;
ALTER TABLE clothing_items ADD COLUMN ema_count DEFAULT 0;

-- v2: Add training tables (done)
CREATE TABLE outfit_feedback (...);
CREATE TABLE training_sessions (...);

-- v3: Add NN-specific tables
CREATE TABLE user_preference_profiles (...);
CREATE TABLE model_versions (...);
```

### Rollback Plan

If NN performs worse than EMA:
1. Monitor A/B test results daily
2.自动 rollback if NN group has >10% lower satisfaction
3. Keep NN disabled but preserve trained weights
4. Investigate and retrain with adjustments
