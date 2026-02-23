# THREAD Outfit Trainer - Design Document

## Overview

A feature for rapid-fire outfit generation with feedback-based learning. Users can:
1. Generate multiple outfit combinations instantly
2. Preview complete outfits with category selection
3. Give per-item feedback (thumbs up/down/neutral)
4. "Train" the neural network (learn from feedback)

The system evolves through three stages: pure heuristic (EMA), hand-crafted feature scoring, and finally a lightweight neural network — each stage feeding the next.

## ML Architecture

### The Goal

Build a **lightweight neural network** that learns personal fashion preferences from explicit feedback (thumbs up/down, worn confirmations) and contextual signals (weather, occasion, season). The model scores individual items within an outfit context, enabling the OutfitEngine to rank candidate outfits by predicted preference.

### Design Principles

1. **Small data, small model.** A wardrobe of 50-200 items generating 500-2000 feedback events over months. The architecture must learn from this, not pretend we have Netflix-scale data.
2. **Feature engineering > learned embeddings.** At this scale, hand-crafted features (color harmony, formality matching) outperform learned representations. Encode fashion knowledge the network can't discover from limited thumbs-ups.
3. **Regression, not classification.** Feedback is graded (+1.0 worn, +0.6 thumbs_up, -0.3 skipped, -0.8 thumbs_down). The model predicts a continuous preference score, not a binary like/dislike.
4. **In-process, no infrastructure.** TF.js-node runs directly in the Fastify server. No Docker, no GPU, no separate service. Training takes <1 second on CPU for 2000 samples.
5. **EMA is the floor, not a throwaway.** EMA scoring works today and remains the fallback forever. The NN blends in as it earns trust through validation performance.

### Current State (What Already Exists)

#### PreferenceService
- EMA (Exponential Moving Average) scoring per item
- Signal weights:
  - `worn_confirmed`: 1.0
  - `thumbs_up`: 0.6
  - `loved_item`: 0.55
  - `thumbs_down`: -0.8
  - `skipped_repeatedly`: -0.2

#### OutfitEngine
- Generates outfits from wardrobe items
- Considers occasion, weather, time of day
- Returns outfit combinations

---

## Neural Network Specification

### Architecture: Lightweight Item-Context Scorer

This is a **content-based** recommendation model. There is no collaborative filtering — with a single user (or very few), there's no cross-user signal to exploit. The entire model IS the user's learned taste.

```
┌─────────────────────────────────────────────────────────────────────┐
│              THREAD ITEM-CONTEXT SCORER                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  INPUT FEATURES (~55 dimensions)                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  ITEM FEATURES                    CONTEXT FEATURES           │  │
│  │  ─────────────                    ────────────────           │  │
│  │  category_onehot    [16]          occasion_onehot   [5]     │  │
│  │  primary_color_rgb  [3]           season_onehot     [4]     │  │
│  │  primary_color_hsl  [3]           time_of_day       [3]     │  │
│  │  pattern_onehot     [8]                                     │  │
│  │  material_onehot    [10]          OUTFIT-LEVEL FEATURES     │  │
│  │  ema_score          [1]           ────────────────────      │  │
│  │                                   color_harmony      [1]    │  │
│  │                                   formality_match    [1]    │  │
│  │                                   category_diversity [1]    │  │
│  │                                   avg_peer_ema       [1]    │  │
│  │                                                              │  │
│  └──────────────────────────────────┬───────────────────────────┘  │
│                                     │                               │
│                                     ▼                               │
│                            ┌─────────────────┐                      │
│                            │  Dense(32, ReLU) │                     │
│                            └────────┬────────┘                      │
│                                     ▼                               │
│                            ┌─────────────────┐                      │
│                            │  Dropout(0.3)    │                     │
│                            └────────┬────────┘                      │
│                                     ▼                               │
│                            ┌─────────────────┐                      │
│                            │  Dense(16, ReLU) │                     │
│                            └────────┬────────┘                      │
│                                     ▼                               │
│                            ┌─────────────────┐                      │
│                            │  Dense(1, linear)│                     │
│                            │  (preference     │                     │
│                            │   score)         │                     │
│                            └─────────────────┘                      │
│                                                                     │
│  Total trainable parameters: ~2,300                                 │
│  Training time: <1 second on CPU (2000 samples)                     │
│  Loss function: Huber (robust to noisy labels)                      │
│  Optimizer: Adam (lr=0.01, decaying to 0.001)                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Why This Architecture

| Decision | Rationale |
|----------|-----------|
| **~2,300 params** (not 30K+) | Learnable from 500 samples without overfitting. A 224→128→64 network has 30K+ params — that needs 10-100x more data than we'll ever collect. |
| **Huber loss** (not binary crossentropy) | Feedback is graded (-1.0 to +1.0), not binary. Huber handles this naturally and is robust to noisy/contradictory labels. |
| **Linear output** (not sigmoid) | Scores can be negative (strong dislike) or >1 (strong affinity). More expressive than clamping to 0-1. |
| **Raw features** (not learned embeddings) | You need thousands of samples to learn useful embeddings. With <2000 events, hand-engineered features dominate. |
| **No user embedding** | Single user. The whole trained model IS the user embedding. Multi-user can be added later with a user-ID feature. |
| **No collaborative filtering** | Collaborative filtering needs many users with overlapping items. Single-user = content-based only. |
| **In-process TF.js** (not Docker) | 2,300 params trains in <1 second. Docker adds operational complexity for zero benefit at this scale. |

### Feature Engineering

This is where the real work lives. Good features are worth more than a deeper network.

```javascript
// Feature computation for a single item within an outfit context
function computeItemFeatures(item, context, outfitPeers) {
  return [
    // === ITEM FEATURES ===
    
    // Category (one-hot, 16 dims for male, padded to 16 for consistency)
    ...oneHot(item.category_id, NUM_CATEGORIES),          // [16]
    
    // Color — both RGB and HSL give the network different color signals
    ...normalizeRGB(item.primary_color),                   // [3] 0-1 scaled
    ...normalizeHSL(item.primary_color),                   // [3] 0-1 scaled
    
    // Pattern (one-hot: solid, striped, plaid, floral, geometric, camo, animal, abstract)
    ...oneHot(item.pattern, PATTERNS),                     // [8]
    
    // Material (one-hot: cotton, denim, leather, wool, polyester, silk, linen, 
    //           knit, fleece, nylon)
    ...oneHot(item.material, MATERIALS),                   // [10]
    
    // Current EMA score (the existing preference signal)
    item.ema_score,                                        // [1]
    
    // === CONTEXT FEATURES ===
    
    // Occasion (one-hot: casual, work, formal, date, outdoor)
    ...oneHot(context.occasion, OCCASIONS),                // [5]
    
    // Season (one-hot: spring, summer, fall, winter)
    ...oneHot(context.season, SEASONS),                    // [4]
    
    // Time of day (one-hot: morning, afternoon, evening)
    ...oneHot(context.timeOfDay, TIMES),                   // [3]
    
    // === OUTFIT-LEVEL FEATURES (the secret sauce) ===
    
    // Color harmony score between this item and its outfit peers
    computeColorHarmony(item, outfitPeers),                // [1]
    
    // How well this item's formality matches the context
    computeFormalityMatch(item, context),                   // [1]
    
    // Diversity of categories in the outfit (penalizes redundancy)
    computeCategoryDiversity(outfitPeers),                  // [1]
    
    // Average EMA of the other items (are peers well-liked?)
    computeAvgPeerEma(outfitPeers),                        // [1]
  ];
  // Total: 16 + 3 + 3 + 8 + 10 + 1 + 5 + 4 + 3 + 1 + 1 + 1 + 1 = 57
}
```

#### Color Harmony Computation

This is the single highest-value engineered feature. The NN shouldn't have to rediscover color theory from thumbs-ups.

```javascript
// Color harmony scoring based on color wheel relationships
function computeColorHarmony(item, outfitPeers) {
  if (outfitPeers.length === 0) return 0.5; // neutral if no peers
  
  const itemHSL = rgbToHSL(item.primary_color);
  const scores = outfitPeers.map(peer => {
    const peerHSL = rgbToHSL(peer.primary_color);
    const hueDiff = Math.abs(itemHSL.h - peerHSL.h);
    const normalizedDiff = Math.min(hueDiff, 360 - hueDiff); // circular
    
    // Complementary (150-180°): high harmony
    if (normalizedDiff >= 150 && normalizedDiff <= 180) return 0.9;
    
    // Analogous (0-30°): high harmony
    if (normalizedDiff <= 30) return 0.85;
    
    // Triadic (110-130°): good harmony
    if (normalizedDiff >= 110 && normalizedDiff <= 130) return 0.75;
    
    // Split-complementary (135-165°): good harmony
    if (normalizedDiff >= 135 && normalizedDiff <= 165) return 0.8;
    
    // Neutrals always harmonize (low saturation)
    if (itemHSL.s < 0.15 || peerHSL.s < 0.15) return 0.8;
    
    // Awkward zone (60-110°): poor harmony
    if (normalizedDiff >= 60 && normalizedDiff <= 110) return 0.3;
    
    // Default moderate
    return 0.5;
  });
  
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
```

#### Formality Matching

```javascript
// Item formality vs context expected formality
const FORMALITY_MAP = {
  // Items
  'T-Shirt': 2, 'Hoodie': 1, 'Button-Up': 6, 'Knitwear': 5,
  'Jacket': 5, 'Jeans': 3, 'Pants': 6, 'Shorts': 1,
  'Sneakers': 2, 'Boots': 5, 'Shoes': 7, 'Sandals': 1,
  'Belt': 5, 'Hat': 2, 'Dress': 7, 'Blouse': 6,
  // ... etc
};

const CONTEXT_FORMALITY = {
  'casual': 2, 'work': 6, 'formal': 8, 'date': 7, 'outdoor': 1
};

function computeFormalityMatch(item, context) {
  const itemFormality = FORMALITY_MAP[item.category] || 5;
  const contextFormality = CONTEXT_FORMALITY[context.occasion] || 5;
  const diff = Math.abs(itemFormality - contextFormality);
  // Normalize to 0-1 where 1 = perfect match
  return 1.0 - (diff / 10.0);
}
```

### Feedback Signal Taxonomy

| Signal | Source | Label Value | Confidence | Notes |
|--------|--------|-------------|------------|-------|
| `thumbs_up` | Outfit Trainer | +1.0 | High | Direct explicit signal |
| `thumbs_down` | Outfit Trainer | -1.0 | High | Direct explicit signal |
| `neutral` | Outfit Trainer | — | — | Not used for training (no signal) |
| `exclude` | Outfit Trainer | — | — | Hard filter, not a training signal (see below) |
| `worn_confirmed` | Calendar/log | +1.0 | Very High | Strongest positive signal |
| `voice_positive` | Voice feedback | +0.8 | High | |
| `voice_negative` | Voice feedback | -0.7 | High | |
| `saved_outfit` | User saved | +0.6 | Medium | |
| `viewed_long` | Passive | +0.2 | Low | |
| `skipped_repeated` | Passive | -0.3 | Low | |

**Important:** `exclude` is a **hard constraint on generation**, not a training signal. If someone excludes an item, it should never appear in generated outfits regardless of what the NN predicts. Exclusion lives in the OutfitEngine filter, not the loss function.

**Important:** `neutral` generates no training sample. Absence of signal is not a signal.

### Training Data: How Samples Are Constructed

Training samples are constructed **at training time** from raw feedback events, not pre-computed and stored. This means feature engineering can evolve without migrating stored vectors.

```javascript
// Construct a training sample from a feedback event
function buildTrainingSample(event, item, context, outfitPeers) {
  return {
    features: computeItemFeatures(item, context, outfitPeers),  // [57]
    label: event.feedback_value  // continuous: -1.0 to +1.0
  };
}

// At training time:
async function prepareTrainingData() {
  const events = await db.getAllFeedbackEvents();
  const samples = [];
  
  for (const event of events) {
    // Skip neutral — no training signal
    if (event.feedback_type === 'neutral') continue;
    // Skip exclude — hard filter, not a preference signal
    if (event.feedback_type === 'exclude') continue;
    
    const item = await db.getItem(event.item_id);
    if (!item) continue; // item was deleted, skip orphan
    
    const context = event.context || DEFAULT_CONTEXT;
    const outfitPeers = event.outfit_id 
      ? await db.getOutfitItems(event.outfit_id, event.item_id)
      : [];
    
    samples.push(buildTrainingSample(event, item, context, outfitPeers));
  }
  
  return samples;
}
```

### Data Model

```sql
-- Raw feedback events (source of truth for training)
CREATE TABLE outfit_feedback (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  outfit_id INTEGER,              -- links items shown together (nullable)
  feedback_type TEXT NOT NULL,     -- 'thumbs_up', 'thumbs_down', 'worn_confirmed', etc.
  feedback_value FLOAT NOT NULL,   -- -1.0 to +1.0 (continuous label)
  
  -- Context at time of feedback (stored as JSON, not pre-computed vectors)
  context_occasion TEXT,
  context_season TEXT,
  context_time_of_day TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Item exclusions (hard filter, separate from preference scoring)
CREATE TABLE item_exclusions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  reason TEXT,                     -- optional: "doesn't fit", "stained", etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_id)
);

-- Training session log
CREATE TABLE training_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  feedback_count INTEGER NOT NULL,  -- how many samples used
  feature_count INTEGER NOT NULL,   -- input dimensions
  param_count INTEGER NOT NULL,     -- model parameters
  validation_loss FLOAT,            -- Huber loss on held-out data
  validation_mae FLOAT,             -- Mean Absolute Error
  trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  model_path TEXT,                   -- path to saved model weights
  notes TEXT
);
```

**Note:** No `training_events` table with pre-computed feature vectors. No `user_preference_profiles` with `FLOAT[]` columns. No `model_versions` table. Training builds features on-the-fly from `outfit_feedback`. Model metadata lives in `training_sessions`. SQLite doesn't support array columns — and we don't need them.

### Training Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRAINING PIPELINE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. COLLECT                                                     │
│     User interactions → outfit_feedback table                    │
│     (raw events with context, not pre-computed features)        │
│                                                                  │
│  2. PREPARE (at training time)                                  │
│     ├── Load all feedback events                                │
│     ├── Filter: skip neutral, skip exclude                      │
│     ├── Compute features on-the-fly from current item state     │
│     ├── Skip orphaned items (deleted since feedback)            │
│     └── Shuffle dataset                                         │
│                                                                  │
│  3. TRAIN (TF.js-node, in-process)                              │
│     ├── Split: 80% train / 20% validation                      │
│     ├── Model: Dense(32) → Dropout(0.3) → Dense(16) → Dense(1) │
│     ├── Loss: Huber                                             │
│     ├── Optimizer: Adam (lr=0.01, decay schedule)               │
│     ├── Epochs: up to 100                                       │
│     ├── Early stopping: patience=10 on validation loss          │
│     └── Time: <1 second for 2000 samples                        │
│                                                                  │
│  4. EVALUATE                                                    │
│     ├── Validation Huber loss                                   │
│     ├── Validation MAE (Mean Absolute Error)                    │
│     ├── Compare predicted vs actual on held-out set             │
│     └── Log to training_sessions table                          │
│                                                                  │
│  5. DEPLOY                                                      │
│     ├── Save model to disk (models/user_{id}/model.json)        │
│     ├── Update training_sessions record                         │
│     ├── Compute NN blend weight from sample count + val loss    │
│     └── Hot-reload: next outfit generation uses new model       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Training Implementation

```javascript
import * as tf from '@tensorflow/tfjs-node';

const FEATURE_DIM = 57;

function buildModel() {
  const model = tf.sequential({
    layers: [
      tf.layers.dense({ 
        inputShape: [FEATURE_DIM], 
        units: 32, 
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
      }),
      tf.layers.dropout({ rate: 0.3 }),
      tf.layers.dense({ 
        units: 16, 
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
      }),
      tf.layers.dense({ units: 1 })  // linear output — no activation
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: tf.losses.huberLoss,
    metrics: ['mae']
  });

  return model;
}

async function trainModel(samples) {
  if (samples.length < 50) {
    throw new Error(`Need at least 50 samples to train. Have: ${samples.length}`);
  }

  // Shuffle
  tf.util.shuffle(samples);

  // Split 80/20
  const splitIdx = Math.floor(samples.length * 0.8);
  const trainSamples = samples.slice(0, splitIdx);
  const valSamples = samples.slice(splitIdx);

  // Build tensors
  const trainX = tf.tensor2d(trainSamples.map(s => s.features));
  const trainY = tf.tensor2d(trainSamples.map(s => [s.label]));
  const valX = tf.tensor2d(valSamples.map(s => s.features));
  const valY = tf.tensor2d(valSamples.map(s => [s.label]));

  const model = buildModel();

  // Learning rate decay: start at 0.01, halve every 30 epochs
  let currentLr = 0.01;
  const lrScheduler = {
    onEpochEnd: (epoch) => {
      if (epoch > 0 && epoch % 30 === 0) {
        currentLr *= 0.5;
        model.optimizer.learningRate = currentLr;
      }
    }
  };

  const result = await model.fit(trainX, trainY, {
    epochs: 100,
    batchSize: Math.min(32, Math.floor(trainSamples.length / 4)),
    validationData: [valX, valY],
    callbacks: [
      tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 10 }),
      lrScheduler
    ],
    verbose: 0
  });

  // Get final validation metrics
  const finalEpoch = result.history.val_loss.length - 1;
  const valLoss = result.history.val_loss[finalEpoch];
  const valMae = result.history.val_mae[finalEpoch];

  // Cleanup tensors
  trainX.dispose();
  trainY.dispose();
  valX.dispose();
  valY.dispose();

  return { model, valLoss, valMae, epochs: finalEpoch + 1 };
}
```

### Inference

```javascript
// Score a single item within an outfit context
async function scoreItem(model, item, context, outfitPeers) {
  const features = computeItemFeatures(item, context, outfitPeers);
  const input = tf.tensor2d([features]);
  const prediction = model.predict(input);
  const score = (await prediction.data())[0];
  input.dispose();
  prediction.dispose();
  return score;  // continuous value, roughly -1.0 to +1.0
}

// Score a complete outfit (average of item scores)
async function scoreOutfit(model, items, context) {
  const scores = await Promise.all(
    items.map(item => {
      const peers = items.filter(i => i.id !== item.id);
      return scoreItem(model, item, context, peers);
    })
  );
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// Generate and rank outfits
async function generateOutfits(userId, availableItems, context, count = 5) {
  // 1. Filter out excluded items
  const excluded = await db.getExcludedItemIds(userId);
  const eligible = availableItems.filter(i => !excluded.has(i.id));
  
  // 2. Generate candidate combinations
  const candidates = generateCombinations(eligible, context);
  
  // 3. Score each candidate
  const nnReady = await isModelReady(userId);
  const nnWeight = nnReady ? getNnWeight(userId) : 0;
  
  const scored = await Promise.all(
    candidates.map(async (combo) => {
      const emaScore = computeEmaOutfitScore(combo.items);
      
      let nnScore = 0;
      if (nnReady) {
        nnScore = await scoreOutfit(nnModel, combo.items, context);
      }
      
      // Blend EMA and NN scores
      const finalScore = (1 - nnWeight) * emaScore + nnWeight * nnScore;
      
      return { ...combo, emaScore, nnScore, finalScore };
    })
  );
  
  // 4. Return top N
  return scored
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, count);
}
```

---

## Model Blending: EMA → Neural Network

The NN earns its weight through demonstrated validation performance, not arbitrary version numbers.

### Transition Formula

```
final_score = (1 - nn_weight) * ema_score + nn_weight * nn_score
```

### Weight Determination

NN weight is a function of **two signals**: how much data we have and how well the model performs on held-out data.

```javascript
function getNnWeight(trainingSamples, validationLoss) {
  // No model or too little data: pure EMA
  if (trainingSamples < 100) return 0;
  
  // Data confidence: 0 at 100 samples, maxes at 0.45 at 1500+
  const dataConf = Math.min((trainingSamples - 100) / 1400, 1.0) * 0.45;
  
  // Accuracy confidence: 0 if loss > 0.3, maxes at 0.45 if loss < 0.1
  const lossConf = validationLoss < 0.3
    ? Math.min((0.3 - validationLoss) / 0.2, 1.0) * 0.45
    : 0;
  
  // Combined, clamped to 5-90% range
  const weight = dataConf + lossConf;
  return Math.max(0.05, Math.min(weight, 0.90));
}
```

### Expected Progression

| Training Samples | Validation Loss (Huber) | NN Weight | Description |
|-----------------|------------------------|-----------|-------------|
| <100 | — | 0% | Pure EMA. Collecting feedback. |
| 100-300 | ~0.25-0.30 | 5-15% | NN starting to contribute. EMA dominant. |
| 300-700 | ~0.20-0.25 | 15-40% | NN gaining confidence. Meaningful blend. |
| 700-1500 | ~0.15-0.20 | 40-65% | NN dominant if validation is strong. |
| 1500+ | <0.15 | 65-90% | NN driving recommendations. EMA as safety net. |

### Monitoring the Blend

Every outfit generation logs:
```javascript
{
  outfitId: 42,
  emaScore: 0.72,
  nnScore: 0.81,
  nnWeight: 0.35,
  finalScore: 0.753,    // 0.65*0.72 + 0.35*0.81
  trainingSamples: 450,
  validationLoss: 0.22
}
```

This lets you audit whether the NN is helping or hurting, per outfit.

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
│  │  Occasion:   [All │ Casual │ Work │ Formal │ Date]      │   │
│  │                                                          │   │
│  │  Count: [5] outfits  [🔄 Generate]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ OUTFIT 1 │ │ OUTFIT 2 │ │ OUTFIT 3 │ │ OUTFIT 4 │  ...   │
│  │          │ │          │ │          │ │          │        │
│  │  👕      │ │  👕      │ │  👕      │ │  👕      │        │
│  │  [img]   │ │  [img]   │ │  [img]   │ │  [img]   │        │
│  │  👍 👎   │ │  👍 👎   │ │  👍 👎   │ │  👍 👎   │        │
│  │          │ │          │ │          │ │          │        │
│  │  👖      │ │  👖      │ │  👖      │ │  👖      │        │
│  │  [img]   │ │  [img]   │ │  [img]   │ │  [img]   │        │
│  │  👍 👎   │ │  👍 👎   │ │  👍 👎   │ │  👍 👎   │        │
│  │          │ │          │ │          │ │          │        │
│  │  👟      │ │  👟      │ │  👟      │ │  👟      │        │
│  │  [img]   │ │  [img]   │ │  [img]   │ │  [img]   │        │
│  │  👍 👎   │ │  👍 👎   │ │  👍 👎   │ │  👍 👎   │        │
│  │          │ │          │ │          │ │          │        │
│  │  🚫      │ │  🚫      │ │  🚫      │ │  🚫      │        │
│  │ Exclude  │ │ Exclude  │ │ Exclude  │ │ Exclude  │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ FEEDBACK: 12 pending  │  MODEL: 450 samples, loss 0.22 │   │
│  │ [💾 Save Feedback]    │  [🧠 Train Model]              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**UI changes from original:**
- Per-item feedback is thumbs up/down only (no neutral button — absence of feedback IS neutral)
- Exclude is per-outfit, not per-item (bottom of card, not inline)
- Status bar shows training stats (sample count, loss) so user can see the model learning
- "Save Feedback" is separate from "Train Model" — feedback accumulates, training is intentional

### 2. Outfit Display Template

Default template:
```
┌─────────────────┐
│     TOP         │  ← Required
├─────────────────┤
│    BOTTOM       │  ← Required  
├─────────────────┤
│   FOOTWEAR      │  ← Required
├─────────────────┤
│  ACCESSORY 1    │  ← Optional
│  ACCESSORY 2    │  ← Optional (max 2)
└─────────────────┘
```

Categories mapped to slots:
- **Top**: T-Shirt, Button-Up, Knitwear, Hoodie, Jacket, Blouse, Dress, Tank, Camisole
- **Bottom**: Jeans, Pants, Shorts, Skirts, Leggings
- **Footwear**: Boots, Sneakers, Shoes, Sandals, Heels, Flats
- **Accessory**: Belt, Hat, Socks, Scarf, Necklace, Earrings, Bracelet, Handbag

Minimum valid outfit: **Top + Bottom + Footwear**. Accessories optional (0, 1, or 2 max).

### 3. API Endpoints

```
POST /api/v1/outfit-trainer/generate
  Body: { 
    categories: { top?, bottom?, footwear?, accessory? },  // "Any" or specific
    occasion: "casual" | "work" | "formal" | "date" | "outdoor",
    count: 5  // 1-20
  }
  Returns: { 
    outfits: [{ 
      id, items: [...], 
      emaScore, nnScore, nnWeight, finalScore 
    }] 
  }

POST /api/v1/outfit-trainer/feedback
  Body: { 
    items: [
      { itemId: 1, feedback: "thumbs_up" },
      { itemId: 2, feedback: "thumbs_down" }
    ],
    outfitId: 42,          // links items shown together
    context: { occasion, season, timeOfDay }
  }
  Returns: { saved: true, pendingCount: 13 }

POST /api/v1/outfit-trainer/exclude
  Body: { itemId: 5, reason?: "stained" }
  Returns: { excluded: true }

DELETE /api/v1/outfit-trainer/exclude/:itemId
  Returns: { restored: true }

POST /api/v1/outfit-trainer/train
  Returns: { 
    success: true, 
    samples: 450, 
    validationLoss: 0.22,
    validationMAE: 0.18,
    epochs: 34,
    nnWeight: 0.35,
    trainingTimeMs: 820
  }

GET /api/v1/outfit-trainer/stats
  Returns: { 
    pendingFeedback: 12, 
    totalSamples: 450,
    lastTrained: "2026-02-23T10:30:00Z",
    validationLoss: 0.22,
    nnWeight: 0.35,
    excludedItems: 3
  }
```

### 4. Feedback Flow

```
User clicks Generate
       │
       ▼
┌──────────────────────┐
│ Generate N combos    │
│ Score with EMA + NN  │
│ Rank by finalScore   │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Display outfit grid  │
│ Each item shows img  │
│ + thumbs up/down     │
└────────┬─────────────┘
         │
         ▼
User gives per-item feedback
(thumbs up / thumbs down / nothing)
         │
         ▼
┌──────────────────────┐
│ Save Feedback        │
│ → outfit_feedback    │
│ → EMA update (imm.)  │
│ Pending count + 1    │
└────────┬─────────────┘
         │
         ▼
User clicks "Train Model"
(when they have enough feedback)
         │
         ▼
┌──────────────────────┐
│ Build features from  │
│ all feedback events  │
│ Train NN (<1 sec)    │
│ Log to training_sess │
│ Update NN blend wt   │
└────────┬─────────────┘
         │
         ▼
Future generations use
updated EMA + NN blend
```

**Key difference from original:** Feedback immediately updates EMA scores (instant gratification). The "Train Model" button retrains the NN from all accumulated feedback. These are separate operations — EMA is always live, NN training is batched.

---

## Cold Start Strategy

No demographic assumptions. No "male defaults to navy." Start with **maximum diversity** to collect signal fast.

### Stage 1: Diversity-First Generation (0 feedback)

```javascript
function generateColdStart(items, context, count) {
  // Maximize variety: ensure each outfit uses different items
  // Spread across categories, colors, formality levels
  // Goal: expose the user to their full wardrobe quickly
  const combos = generateDiverseCombinations(items, count);
  
  // Random shuffle within combos — no preference bias yet
  return shuffleArray(combos);
}
```

No scores, no ranking. Just variety. Every outfit is equally likely. This avoids encoding assumptions about what the user "should" like.

### Stage 2: Quick Onboarding (Optional)

If implemented, 3-5 questions max:
- "Pick your vibe: Casual / Dressed Up / Mix"
- "Colors you always reach for?" (show swatches)
- "Any items you never want to see?" (exclusion, not training)

This seeds initial EMA adjustments, not NN training.

### Stage 3: EMA Takes Over (10+ feedback events)

After ~10 thumbs up/down, EMA scores differentiate items enough for the OutfitEngine to produce meaningfully ranked results. This is the floor — it works with very little data.

### Stage 4: NN Blends In (100+ feedback events)

Once 100 events accumulate and the model trains with validation loss < 0.3, the NN starts contributing at 5-15% weight. User shouldn't notice the transition — outfits just gradually get better.

---

## Error Handling & Graceful Degradation

```javascript
async function generateOutfits(userId, filters, count) {
  try {
    // Always start with candidate generation
    const candidates = await generateCandidates(userId, filters, count * 3);
    
    if (candidates.length === 0) {
      return { outfits: [], warning: 'No items match these filters' };
    }
    
    // Score with whatever is available
    let scoringMethod = 'ema';
    try {
      if (await isModelReady(userId)) {
        scoringMethod = 'blend';
      }
    } catch (nnError) {
      console.warn('NN scoring failed, falling back to EMA:', nnError.message);
      scoringMethod = 'ema';
    }
    
    const scored = await scoreCandidates(candidates, scoringMethod);
    return { 
      outfits: scored.slice(0, count),
      scoringMethod  // transparent to UI
    };
    
  } catch (error) {
    console.error('Generation failed entirely:', error);
    // Ultimate fallback: return random outfits from available items
    return {
      outfits: await randomGenerate(userId, filters, count),
      scoringMethod: 'random',
      warning: 'Using random generation — scoring unavailable'
    };
  }
}
```

**Degradation cascade:** NN+EMA blend → pure EMA → random. Never fails to return outfits.

| Error Scenario | Handling |
|----------------|----------|
| No items in category | Partial outfit + warn user |
| NN prediction throws | Fall back to EMA silently |
| All items excluded | Warn: "Everything excluded — restore some items?" |
| DB write fails on feedback | Cache in memory, retry on next Save |
| Training fails (too few samples) | Return error with sample count, keep using EMA |
| Model file corrupted | Delete, retrain on next Train button click |
| Item deleted after feedback | Skip orphaned feedback at training time |

---

## Rate Limiting

```javascript
const RATE_LIMITS = {
  generate: { max: 100, windowMs: 60 * 60 * 1000 },   // 100/hour
  feedback: { max: 500, windowMs: 60 * 60 * 1000 },    // 500/hour
  train:    { max: 10,  windowMs: 24 * 60 * 60 * 1000 } // 10/day
};
```

Training is the most expensive operation (~1 second). 10/day is generous for a single user. If they're slamming Train, the model won't meaningfully change between clicks.

---

## Testing Strategy

### Unit Tests

```javascript
describe('Feature Engineering', () => {
  test('computeColorHarmony: complementary colors score high', () => {
    const navy = { primary_color: '#001f3f' };
    const khaki = { primary_color: '#c3b091' };
    expect(computeColorHarmony(navy, [khaki])).toBeGreaterThan(0.7);
  });

  test('computeColorHarmony: clashing colors score low', () => {
    const red = { primary_color: '#ff0000' };
    const green = { primary_color: '#00ff00' };
    // Red+green: ~120° apart — awkward zone
    expect(computeColorHarmony(red, [green])).toBeLessThan(0.5);
  });

  test('computeFormalityMatch: hoodie + formal = poor match', () => {
    const hoodie = { category: 'Hoodie' };
    const formal = { occasion: 'formal' };
    expect(computeFormalityMatch(hoodie, formal)).toBeLessThan(0.4);
  });

  test('computeFormalityMatch: button-up + work = good match', () => {
    const buttonUp = { category: 'Button-Up' };
    const work = { occasion: 'work' };
    expect(computeFormalityMatch(buttonUp, work)).toBeGreaterThan(0.7);
  });
});

describe('EMA Scoring', () => {
  test('thumbs_up increases score', () => {
    const item = { ema_score: 0.5, ema_count: 5 };
    const result = updateItemScore(item, 0.6);
    expect(result.ema_score).toBeGreaterThan(0.5);
  });

  test('thumbs_down decreases score', () => {
    const item = { ema_score: 0.5, ema_count: 5 };
    const result = updateItemScore(item, -0.8);
    expect(result.ema_score).toBeLessThan(0.5);
  });
});

describe('NN Weight Calculation', () => {
  test('zero weight below 100 samples', () => {
    expect(getNnWeight(50, 0.15)).toBe(0);
    expect(getNnWeight(99, 0.10)).toBe(0);
  });

  test('low weight at 100 samples even with good loss', () => {
    expect(getNnWeight(100, 0.10)).toBeLessThan(0.15);
  });

  test('high weight at 1500+ with low loss', () => {
    expect(getNnWeight(1500, 0.10)).toBeGreaterThan(0.6);
  });

  test('never exceeds 90%', () => {
    expect(getNnWeight(10000, 0.01)).toBeLessThanOrEqual(0.90);
  });
});
```

### Integration Tests

```javascript
describe('Feedback Pipeline', () => {
  test('feedback persists to DB and updates EMA', async () => {
    const itemBefore = await db.getItem(1);
    await submitFeedback([{ itemId: 1, feedback: 'thumbs_up', outfitId: 1 }]);
    
    const feedback = await db.getFeedbackForItem(1);
    expect(feedback).toHaveLength(1);
    
    const itemAfter = await db.getItem(1);
    expect(itemAfter.ema_score).toBeGreaterThan(itemBefore.ema_score);
  });

  test('exclude prevents item from appearing in generation', async () => {
    await excludeItem(1, 'stained');
    const outfits = await generateOutfits(userId, {}, {}, 10);
    const allItemIds = outfits.flatMap(o => o.items.map(i => i.id));
    expect(allItemIds).not.toContain(1);
  });

  test('training requires minimum samples', async () => {
    await clearAllFeedback();
    await submitFeedback([{ itemId: 1, feedback: 'thumbs_up' }]);
    await expect(trainModel()).rejects.toThrow(/at least 50/);
  });
});

describe('Training Pipeline', () => {
  test('full train cycle produces model with valid metrics', async () => {
    // Seed 200 feedback events
    await seedFeedback(200);
    
    const result = await trainModel();
    expect(result.validationLoss).toBeLessThan(1.0);
    expect(result.validationMAE).toBeDefined();
    expect(result.epochs).toBeGreaterThan(1);
    expect(result.trainingTimeMs).toBeLessThan(5000);
  });
});
```

### E2E Tests (Playwright)

```javascript
test('full trainer flow: generate → feedback → train', async ({ page }) => {
  await login(page);
  await page.click('[data-testid="trainer-nav"]');
  
  // Generate outfits
  await page.click('[data-testid="generate-btn"]');
  await expect(page.locator('.outfit-card')).toHaveCount(5);
  
  // Give feedback on first outfit's top item
  await page.click('.outfit-card:first-child .item:first-child [data-testid="thumbs-up"]');
  
  // Save feedback
  await page.click('[data-testid="save-feedback"]');
  await expect(page.locator('[data-testid="pending-count"]')).toContainText('1');
  
  // Train (will fail if <50 samples, but UI should handle gracefully)
  // Seed more feedback first in a real test
});
```

---

## Security Considerations

- **Input validation**: All feedback values sanitized — only accepted types pass through
- **SQL injection**: Parameterized queries throughout (already standard in THREAD)
- **Rate limiting**: Per-user limits prevent abuse
- **API authentication**: Required for all endpoints (existing auth middleware)
- **Model files**: Stored in server-side `models/` directory, not accessible via web
- **No PII in training data**: Features are derived from item attributes, not personal data
- **Feedback deletion**: User can delete all feedback + retrain (GDPR right to deletion)

---

## Monitoring & Observability

### Metrics to Log

```javascript
// Per generation request
{
  userId, timestamp,
  scoringMethod,           // 'random' | 'ema' | 'blend'
  nnWeight,                // 0-0.9
  candidateCount,          // how many combos were scored
  generationTimeMs,        // total time including scoring
}

// Per training session
{
  userId, timestamp,
  sampleCount,
  validationLoss,
  validationMAE,
  epochs,
  trainingTimeMs,
  previousLoss,            // to detect regression
}

// Per feedback batch
{
  userId, timestamp,
  thumbsUpCount,
  thumbsDownCount,
  totalPending,
}
```

### Alerts (logged to console, not external monitoring)

```javascript
// Model regression: new training is worse than previous
if (newLoss > previousLoss * 1.2) {
  console.warn(`⚠️ Model regression: loss went from ${previousLoss} to ${newLoss}`);
  // Don't auto-rollback, but warn user in UI
}

// Extreme class imbalance: user only gives thumbs-up (or only thumbs-down)
const upRatio = thumbsUpCount / totalFeedback;
if (upRatio > 0.9 || upRatio < 0.1) {
  console.warn(`⚠️ Imbalanced feedback: ${(upRatio * 100).toFixed(0)}% positive`);
  // Model will struggle to learn — warn user to try thumbs-down too
}
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| User deletes wardrobe items | Feedback for deleted items becomes orphaned. Skip at training time. Don't delete feedback — the preference signal is still valid for pattern learning. |
| Duplicate feedback on same item | Each event is stored. EMA handles this naturally (recent signal weighs more). NN trains on all events — duplicates reinforce signal, which is correct. |
| Very large wardrobe (500+ items) | Combination space explodes. Cap candidate generation at 1000 combos, sample randomly from feasible space. |
| Zero feedback | Pure diversity generation. No EMA bias, no NN. |
| All items excluded | Return empty + warning. Suggest restoring items. |
| Conflicting feedback (up then down) | Both stored. EMA naturally weights recent. NN sees both — learns that preference changed. This is correct behavior. |
| Feedback without outfit context | Store with null outfit_id. Item-level features still valid. Outfit-level features (harmony, diversity) default to neutral. |
| Feedback on items from different outfits | Each feedback event records its outfit_id. Features computed per-event at training time. No cross-contamination. |

---

## Migration Strategy

```sql
-- Phase 1: Feedback collection
-- Add to existing schema

ALTER TABLE clothing_items ADD COLUMN ema_score FLOAT DEFAULT 0.5;
ALTER TABLE clothing_items ADD COLUMN ema_count INTEGER DEFAULT 0;

CREATE TABLE outfit_feedback (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  outfit_id INTEGER,
  feedback_type TEXT NOT NULL,
  feedback_value FLOAT NOT NULL,
  context_occasion TEXT,
  context_season TEXT,
  context_time_of_day TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE item_exclusions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_id)
);

-- Phase 2: Training infrastructure

CREATE TABLE training_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  feedback_count INTEGER NOT NULL,
  feature_count INTEGER NOT NULL,
  param_count INTEGER NOT NULL,
  validation_loss FLOAT,
  validation_mae FLOAT,
  trained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  model_path TEXT,
  notes TEXT
);

-- Indexes for performance
CREATE INDEX idx_feedback_user ON outfit_feedback(user_id);
CREATE INDEX idx_feedback_item ON outfit_feedback(item_id);
CREATE INDEX idx_feedback_outfit ON outfit_feedback(outfit_id);
CREATE INDEX idx_exclusions_user ON item_exclusions(user_id);
```

### Rollback Plan

If the NN performs worse than pure EMA:

1. **Immediate**: Set `nnWeight = 0` in config. Pure EMA, no code change needed.
2. **Diagnostic**: Compare generation quality logs — NN-blended vs EMA-only periods.
3. **Retrain**: Delete model file, collect more feedback, retrain with different hyperparameters.
4. **Nuclear**: Drop `training_sessions` table, delete `models/` directory. Feedback data preserved — can retrain later.

No user data is lost in any rollback scenario. Feedback events are always preserved.

---

## Privacy Considerations

### Data Collection
- All data stored locally in SQLite — nothing leaves the device
- No third-party analytics or model training services
- No telemetry

### User Control
- **Export**: GET endpoint to dump all feedback as JSON
- **Delete**: POST endpoint to delete all feedback + retrain (or revert to pure EMA)
- **Exclude**: Per-item exclusion with optional reason

### Data Retention
- Feedback events: Kept indefinitely (they improve the model over time)
- Training sessions: Kept indefinitely (audit trail)
- Model files: Overwritten on each retrain (only latest version kept)

---

## Cost Analysis

### Current (EMA only)
- Storage: ~$0 (SQLite, kilobytes)
- Compute: ~$0 (arithmetic in existing server)

### With TF.js-node (NN)
- Storage: ~$0 (model file: ~50KB)
- Compute: ~$0 (training: <1s CPU, inference: <1ms per item)
- Dependencies: `@tensorflow/tfjs-node` (~300MB install, but it's an npm package, not a service)
- **No additional infrastructure costs. No Docker. No GPU. No separate server.**

---

## Implementation Phases

### Phase 1: Feedback Collection (MVP)
- [ ] New OutfitTrainer page/component
- [ ] Category dropdowns + occasion selector
- [ ] Generate N outfits, display grid
- [ ] Per-item thumbs up/down buttons
- [ ] Exclude button per outfit
- [ ] `outfit_feedback` and `item_exclusions` tables
- [ ] Immediate EMA update on feedback
- [ ] Pending feedback counter in UI
- **Scoring**: Pure EMA. No NN.

### Phase 2: Feature Engineering
- [ ] `computeItemFeatures()` — full 57-dim feature vector
- [ ] `computeColorHarmony()` — color wheel scoring
- [ ] `computeFormalityMatch()` — item vs context formality
- [ ] Unit tests for all feature functions
- [ ] Feature-enhanced scoring (EMA + hand-crafted rules)
- **Scoring**: EMA + rule-based features. Still no NN.

### Phase 3: Neural Network
- [ ] Install `@tensorflow/tfjs-node`
- [ ] `buildModel()` — 2,300 param network
- [ ] `trainModel()` — from feedback events
- [ ] `scoreItem()` / `scoreOutfit()` — inference
- [ ] `getNnWeight()` — blend weight calculation
- [ ] "Train Model" button in UI
- [ ] `training_sessions` table + logging
- [ ] Model save/load (`models/user_{id}/model.json`)
- **Scoring**: EMA + NN blend.

### Phase 4: Signals & Iteration
- [ ] Worn confirmation tracking (calendar/manual log)
- [ ] Passive signals (time spent viewing, skipped items)
- [ ] Voice feedback integration (if/when voice UI exists)
- [ ] Retrain scheduling (auto-train after N new events?)
- [ ] A/B display: show user "NN thinks..." vs "You might like..." labels
- **Scoring**: Full blend with rich signal sources.

---

## Success Metrics

### Phase 1 (Feedback Collection)
- Users can generate and rate outfits
- EMA scores update correctly
- Exclude works (item never reappears)

### Phase 2 (Features)
- Color harmony test suite passes
- Feature-enhanced outfits feel better than random
- All 57 features compute correctly for every item

### Phase 3 (NN)
- Model trains successfully from 100+ samples
- Validation loss < 0.3 (Huber)
- Validation MAE < 0.25
- Training completes in < 2 seconds
- Blend weight increases as data grows
- User notices improvement (subjective)

### Phase 4 (Maturity)
- 1000+ feedback events accumulated
- Validation loss < 0.15
- NN weight > 50%
- User satisfaction: "it knows what I like"

### Metrics to Track

```
feedback_events_total           -- cumulative feedback count
feedback_positive_ratio         -- % thumbs up (watch for imbalance)
training_sessions_total         -- how often user retrains  
latest_validation_loss          -- model quality
latest_nn_weight                -- how much NN contributes
generation_requests_per_day     -- engagement
generation_latency_ms           -- performance
excluded_items_count            -- items filtered out
```

---

## Future Enhancements (Post-Phase 4)

### Multi-User Support
Add `user_id` as a feature input. Train a shared model across users if the user base grows. For now, one model per user.

### Visual Embeddings (CLIP)
Replace hand-crafted color/pattern features with CLIP embeddings of item photos. Requires a vision model — could use Ollama's llava. Massive feature upgrade, but only worth it with 5000+ samples.

### Outfit-Level Scoring
Current architecture scores items individually, then averages. A future version could score entire outfits as a unit (concatenate all item features, predict one score). Needs more data — the combinatorial space is huge.

### Calendar Integration
Auto-detect upcoming events, pre-generate occasion-appropriate outfits, push notification: "Here's what I'd suggest for tomorrow's meeting."

### Voice Interface
"What should I wear today?" → Generate top-scored outfit for current context → describe it aloud via TTS.

---

## Summary

| Component | Approach |
|-----------|----------|
| **Architecture** | Content-based item-context scorer, 2,300 params |
| **Features** | 57 hand-engineered dims: item attributes + context + outfit-level harmony |
| **Training** | TF.js-node in-process, Huber loss, <1s on CPU |
| **Inference** | Per-item scoring, outfit = average of item scores |
| **Blending** | EMA→NN blend weighted by sample count + validation loss |
| **Cold start** | Diversity-first, no demographic assumptions |
| **Fallback** | NN→EMA→random cascade, never fails |
| **Infrastructure** | Zero. No Docker, no GPU, no separate service. |

The hard part isn't the neural network — it's the feature engineering and the patience to collect enough feedback. The architecture is deliberately small so it can learn from what you actually have, not what you wish you had. Build Phase 1, start clicking thumbs, and the model will follow the data.

---

*Document Version: 2.0*
*Last Updated: 2026-02-23*
*Rewrite: Opus 4.6 — practical NN architecture for small-data fashion recommendation*
