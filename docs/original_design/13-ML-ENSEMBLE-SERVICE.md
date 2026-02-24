# 13 — ML Ensemble Service (Docker)

## Architecture Decision

The preference ML model runs as a **standalone Docker service**, not embedded in 
the Node.js process. The main app treats it as a microservice and calls it over 
HTTP. This solves:

- TF.js native dependency hell on diverse host machines
- GPU resource allocation (container gets what's left after Ollama)
- Hot model reloading without app restart
- Clean separation — the ensemble can grow in complexity without touching app code
- Better testing — the ML service is independently testable

```
┌─────────────────────────────────────────────────────────────┐
│                     THREAD Main App                         │
│                     (Node.js :3000)                         │
│                                                             │
│   OutfitEngine.scoreOutfit()                                │
│         │                                                   │
│         ▼                                                   │
│   POST http://localhost:5001/score  ──────────────────────► │
│         │                                                   │
│         ◄──────────────────────────────────── { score: 0.82,│
│                                                components } │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ML Ensemble Service  (:5001)                   │
│              (Docker container)                             │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │  Ensemble Blender                                    │  │
│   │  score = w1*nn + w2*gbm + w3*ema + w4*rules         │  │
│   └──────────────────────────────────────────────────────┘  │
│          │               │              │                   │
│   ┌──────▼──────┐ ┌──────▼──────┐ ┌────▼────────────────┐  │
│   │  Neural Net  │ │  Gradient   │ │  EMA + Rule Scores  │  │
│   │  (TF.js)     │ │  Boosted    │ │  (from main DB)     │  │
│   │              │ │  Tree       │ │                     │  │
│   │  Deep patterns│ │(XGBoost)   │ │  Fast, interpretable│  │
│   │  non-linear  │ │  Feature    │ │  No training needed │  │
│   │  interactions│ │  importance │ │                     │  │
│   └──────────────┘ └─────────────┘ └─────────────────────┘  │
│                                                             │
│   GPU: auto-detected, used if available                     │
│   CPU fallback: always works                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Why Ensemble

Each model has different strengths. Blending them outperforms any single model,
especially in the cold-start and sparse-data scenarios this app will face:

| Model | Strength | Weakness | When it shines |
|---|---|---|---|
| Neural Net (TF.js) | Non-linear patterns, interaction effects | Needs 50+ examples | After extensive use |
| Gradient Boosted Tree | Feature importance, handles sparse data well | Less flexible | Medium data, 20-50 ratings |
| EMA Scores | Instant, no training | Ignores context (weather, occasion) | Always, cold start |
| Rule-based | Always correct for hard constraints | Can't learn taste | Always, guardrail |

The ensemble automatically down-weights the NN when it has little data and 
up-weights it as it gains confidence. EMA and rules are always present as a floor.

---

## Docker Service

### File: `ml-service/Dockerfile`

```dockerfile
FROM node:20-slim

# Install Python for XGBoost (we'll use a Python subprocess for GBM)
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install xgboost scikit-learn numpy --break-system-packages

WORKDIR /app

# Copy package files
COPY package.json ./
RUN npm install

# Copy service code
COPY . .

# Create model storage directory
RUN mkdir -p /app/models/nn /app/models/gbm

EXPOSE 5001

CMD ["node", "server.js"]
```

### GPU Variant: `ml-service/Dockerfile.gpu`

```dockerfile
FROM tensorflow/tensorflow:latest-gpu

RUN apt-get update && apt-get install -y nodejs npm python3-pip && \
    pip3 install xgboost scikit-learn numpy

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN mkdir -p /app/models/nn /app/models/gbm

EXPOSE 5001
CMD ["node", "server.js"]
```

### File: `ml-service/package.json`

```json
{
  "name": "thread-ml-service",
  "version": "1.0.0",
  "dependencies": {
    "@tensorflow/tfjs-node": "^4.17.0",
    "fastify": "^4.26.0",
    "better-sqlite3": "^9.4.0"
  }
}
```

---

## Docker Compose

`docker-compose.yml` at the project root:

```yaml
version: '3.8'

services:
  ml-service:
    build:
      context: ./ml-service
      dockerfile: Dockerfile
    container_name: thread-ml
    ports:
      - "5001:5001"
    volumes:
      # Model weights persist outside container
      - ./data/models:/app/models
      # Read-only access to the SQLite DB for EMA scores
      - ./data/thread.db:/app/data/thread.db:ro
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/thread.db
      - MODEL_PATH=/app/models
      - PORT=5001
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # GPU variant — uncomment if NVIDIA GPU available
  # ml-service-gpu:
  #   build:
  #     context: ./ml-service
  #     dockerfile: Dockerfile.gpu
  #   deploy:
  #     resources:
  #       reservations:
  #         devices:
  #           - driver: nvidia
  #             count: 1
  #             capabilities: [gpu]
  #   ... same as above
```

The setup script detects NVIDIA presence and switches to the GPU compose variant:

```bash
# In setup.sh
if command -v nvidia-smi &> /dev/null; then
  echo "🎮 NVIDIA GPU detected — enabling GPU acceleration for ML service"
  sed -i 's/dockerfile: Dockerfile$/dockerfile: Dockerfile.gpu/' docker-compose.yml
  # Uncomment GPU service block
fi

echo "🐳 Starting ML service..."
docker compose up -d ml-service
```

---

## ML Service: server.js

```javascript
// ml-service/server.js
const Fastify = require('fastify')
const tf = require('@tensorflow/tfjs-node')  // or tfjs-node-gpu
const { EnsembleModel } = require('./ensemble')

const app = Fastify({ logger: true })
const ensemble = new EnsembleModel()

app.get('/health', async () => {
  return {
    status: 'ok',
    nn_ready: ensemble.nnReady,
    gbm_ready: ensemble.gbmReady,
    gpu: tf.getBackend()
  }
})

// Score a single outfit
app.post('/score', async (req) => {
  const { features, userId, context } = req.body
  const result = await ensemble.score(features, userId, context)
  return result
})

// Score multiple outfits in one call (batch — much more efficient)
app.post('/score-batch', async (req) => {
  const { outfits, userId, context } = req.body
  const results = await ensemble.scoreBatch(outfits, userId, context)
  return { scores: results }
})

// Train on new feedback
app.post('/train', async (req) => {
  const { userId, outfitId, features, label, signalWeight } = req.body
  await ensemble.trainOnFeedback(userId, features, label, signalWeight)
  return { status: 'ok', modelMaturity: ensemble.getMaturity(userId) }
})

// Trigger full batch retrain
app.post('/retrain', async (req) => {
  const { userId } = req.body
  const stats = await ensemble.batchRetrain(userId)
  return stats
})

// Model info
app.get('/models/:userId', async (req) => {
  return ensemble.getModelInfo(req.params.userId)
})

await app.listen({ port: 5001, host: '0.0.0.0' })
```

---

## Ensemble Model: ensemble.js

```javascript
// ml-service/ensemble.js
const tf = require('@tensorflow/tfjs-node')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

class EnsembleModel {
  constructor() {
    this.nnModels = {}      // per-user neural nets
    this.gbmModels = {}     // per-user GBM model paths
    this.maturity = {}      // per-user feedback count
    this.db = new Database(process.env.DB_PATH, { readonly: true })
    
    this.loadExistingModels()
  }

  // ─────────────────────────────────────────
  // SCORING
  // ─────────────────────────────────────────

  async score(features, userId, context) {
    const maturity = this.getMaturity(userId)

    // Always compute
    const emaScore   = this.getEMAScore(features, userId)
    const ruleScore  = features.rule_score  // pre-computed by main app

    // Conditionally compute based on maturity
    let nnScore  = null
    let gbmScore = null
    let weights  = this.getWeights(maturity)

    if (maturity >= 15 && this.nnModels[userId]) {
      nnScore = await this.predictNN(features, userId)
    }

    if (maturity >= 10 && this.gbmModels[userId]) {
      gbmScore = this.predictGBM(features, userId)
    }

    // Blend available scores
    const finalScore = this.blend({
      nn:   nnScore,
      gbm:  gbmScore,
      ema:  emaScore,
      rule: ruleScore
    }, weights)

    return {
      score: finalScore,
      components: { nn: nnScore, gbm: gbmScore, ema: emaScore, rule: ruleScore },
      weights,
      maturity
    }
  }

  async scoreBatch(outfits, userId, context) {
    // More efficient: batch all NN predictions in one tf.tidy()
    const maturity = this.getMaturity(userId)
    const weights  = this.getWeights(maturity)

    let nnScores = null
    if (maturity >= 15 && this.nnModels[userId]) {
      const featureMatrix = outfits.map(o => o.features)
      nnScores = await this.predictNNBatch(featureMatrix, userId)
    }

    return outfits.map((outfit, i) => {
      const emaScore  = this.getEMAScore(outfit.features, userId)
      const ruleScore = outfit.features.rule_score
      let gbmScore    = null
      
      if (maturity >= 10 && this.gbmModels[userId]) {
        gbmScore = this.predictGBM(outfit.features, userId)
      }

      const finalScore = this.blend({
        nn:   nnScores ? nnScores[i] : null,
        gbm:  gbmScore,
        ema:  emaScore,
        rule: ruleScore
      }, weights)

      return {
        outfitIndex: i,
        score: finalScore,
        components: { nn: nnScores?.[i], gbm: gbmScore, ema: emaScore, rule: ruleScore }
      }
    })
  }

  blend(scores, weights) {
    let total = 0
    let weightSum = 0

    for (const [key, score] of Object.entries(scores)) {
      if (score === null || score === undefined) continue
      total     += score * weights[key]
      weightSum += weights[key]
    }

    return weightSum > 0 ? total / weightSum : 0.5
  }

  // Weights shift as model matures
  getWeights(maturity) {
    if (maturity < 10) {
      return { nn: 0, gbm: 0, ema: 0.5, rule: 0.5 }
    } else if (maturity < 25) {
      return { nn: 0, gbm: 0.3, ema: 0.4, rule: 0.3 }
    } else if (maturity < 50) {
      return { nn: 0.2, gbm: 0.35, ema: 0.3, rule: 0.15 }
    } else if (maturity < 100) {
      return { nn: 0.35, gbm: 0.35, ema: 0.2, rule: 0.1 }
    } else {
      return { nn: 0.45, gbm: 0.35, ema: 0.15, rule: 0.05 }
    }
  }

  // ─────────────────────────────────────────
  // NEURAL NETWORK (TF.js)
  // ─────────────────────────────────────────

  createNN() {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [FEATURE_DIM], units: 128, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' })
      ]
    })

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    })

    return model
  }

  async predictNN(features, userId) {
    const model = this.nnModels[userId]
    if (!model) return null

    return tf.tidy(() => {
      const input = tf.tensor2d([features])
      const pred  = model.predict(input)
      return pred.dataSync()[0]
    })
  }

  async predictNNBatch(featureMatrix, userId) {
    const model = this.nnModels[userId]
    if (!model) return null

    return tf.tidy(() => {
      const input = tf.tensor2d(featureMatrix)
      const preds = model.predict(input)
      return Array.from(preds.dataSync())
    })
  }

  async trainOnFeedback(userId, features, label, signalWeight = 1.0) {
    // Load or create model
    if (!this.nnModels[userId]) {
      this.nnModels[userId] = await this.loadOrCreateNN(userId)
    }

    const model = this.nnModels[userId]
    const maturity = this.getMaturity(userId)

    // Only start NN training after enough data
    if (maturity >= 15) {
      const xs = tf.tensor2d([features])
      const ys = tf.tensor2d([[label]])

      // Weight the sample by signal quality
      await model.fit(xs, ys, {
        epochs: Math.ceil(3 * signalWeight),
        batchSize: 1,
        verbose: 0
      })

      xs.dispose()
      ys.dispose()

      // Save after every update
      await model.save(`file://${process.env.MODEL_PATH}/nn/user_${userId}`)
    }

    // Increment maturity
    this.maturity[userId] = (this.maturity[userId] || 0) + 1
  }

  async batchRetrain(userId) {
    // Fetch all feedback from DB
    const events = this.db.prepare(`
      SELECT features, 
             CASE event_type 
               WHEN 'worn_confirmed' THEN 1.0
               WHEN 'thumbs_up' THEN 0.85
               WHEN 'thumbs_down' THEN 0.0
               WHEN 'voice_positive_strong' THEN 0.95
               WHEN 'voice_negative' THEN 0.05
               WHEN 'skipped' THEN 0.3
             END as label,
             signal_weight
      FROM preference_events
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 500
    `).all(userId)

    if (events.length < 10) {
      return { status: 'insufficient_data', count: events.length }
    }

    const xs = tf.tensor2d(events.map(e => JSON.parse(e.features)))
    const ys = tf.tensor2d(events.map(e => [e.label]))

    const model = this.nnModels[userId] || this.createNN()

    const history = await model.fit(xs, ys, {
      epochs: 20,
      batchSize: 16,
      validationSplit: 0.15,
      shuffle: true,
      verbose: 0
    })

    xs.dispose()
    ys.dispose()

    this.nnModels[userId] = model
    await model.save(`file://${process.env.MODEL_PATH}/nn/user_${userId}`)

    // Also retrain GBM
    await this.retrainGBM(userId, events)

    return {
      status: 'ok',
      samples: events.length,
      finalLoss: history.history.loss.slice(-1)[0],
      finalValLoss: history.history.val_loss?.slice(-1)[0]
    }
  }

  // ─────────────────────────────────────────
  // GRADIENT BOOSTED TREE (XGBoost via Python)
  // ─────────────────────────────────────────

  predictGBM(features, userId) {
    const modelPath = this.gbmModels[userId]
    if (!modelPath) return null

    // Write features to temp file, call Python script, read result
    // This is fast enough for scoring — ~2ms per call
    const tmpIn  = `/tmp/gbm_input_${userId}.json`
    const tmpOut = `/tmp/gbm_output_${userId}.json`

    fs.writeFileSync(tmpIn, JSON.stringify({ features }))

    try {
      execSync(
        `python3 ${__dirname}/gbm_predict.py ${modelPath} ${tmpIn} ${tmpOut}`,
        { timeout: 5000 }
      )
      const result = JSON.parse(fs.readFileSync(tmpOut, 'utf8'))
      return result.score
    } catch (e) {
      return null  // graceful degradation
    } finally {
      fs.rmSync(tmpIn, { force: true })
      fs.rmSync(tmpOut, { force: true })
    }
  }

  async retrainGBM(userId, events) {
    const dataPath  = `/tmp/gbm_train_${userId}.json`
    const modelPath = `${process.env.MODEL_PATH}/gbm/user_${userId}.json`

    fs.writeFileSync(dataPath, JSON.stringify(events))

    try {
      execSync(
        `python3 ${__dirname}/gbm_train.py ${dataPath} ${modelPath}`,
        { timeout: 60000 }
      )
      this.gbmModels[userId] = modelPath
    } catch (e) {
      console.error('GBM training failed:', e.message)
    } finally {
      fs.rmSync(dataPath, { force: true })
    }
  }

  // ─────────────────────────────────────────
  // EMA (reads from SQLite, already computed)
  // ─────────────────────────────────────────

  getEMAScore(features, userId) {
    // features already contains ema_scores for each item
    // We just average them here — the real work happens in the main app
    const emaFields = Object.entries(features)
      .filter(([k]) => k.startsWith('item_ema_'))
      .map(([, v]) => v)
      .filter(v => v !== null)

    return emaFields.length > 0
      ? emaFields.reduce((a, b) => a + b, 0) / emaFields.length
      : 0.5
  }

  // ─────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────

  getMaturity(userId) {
    return this.maturity[userId] || this.db.prepare(
      'SELECT COUNT(*) as count FROM preference_events WHERE user_id = ?'
    ).get(userId)?.count || 0
  }

  get nnReady() {
    return Object.keys(this.nnModels).length > 0
  }

  get gbmReady() {
    return Object.keys(this.gbmModels).length > 0
  }

  async loadExistingModels() {
    const modelDir = `${process.env.MODEL_PATH}/nn`
    if (!fs.existsSync(modelDir)) return

    for (const dir of fs.readdirSync(modelDir)) {
      const match = dir.match(/^user_(\d+)$/)
      if (!match) continue
      const userId = match[1]
      try {
        this.nnModels[userId] = await tf.loadLayersModel(
          `file://${modelDir}/${dir}/model.json`
        )
        console.log(`Loaded NN model for user ${userId}`)
      } catch (e) {
        console.warn(`Failed to load NN for user ${userId}:`, e.message)
      }
    }

    const gbmDir = `${process.env.MODEL_PATH}/gbm`
    if (fs.existsSync(gbmDir)) {
      for (const file of fs.readdirSync(gbmDir)) {
        const match = file.match(/^user_(\d+)\.json$/)
        if (match) this.gbmModels[match[1]] = path.join(gbmDir, file)
      }
    }
  }

  getModelInfo(userId) {
    return {
      userId,
      maturity: this.getMaturity(userId),
      nnLoaded: !!this.nnModels[userId],
      gbmLoaded: !!this.gbmModels[userId],
      weights: this.getWeights(this.getMaturity(userId)),
      backend: tf.getBackend()
    }
  }
}

const FEATURE_DIM = 85  // must match main app feature builder

module.exports = { EnsembleModel }
```

---

## Python Scripts

### `ml-service/gbm_train.py`

```python
import sys
import json
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split

data_path, model_path = sys.argv[1], sys.argv[2]

with open(data_path) as f:
    events = json.load(f)

X = np.array([json.loads(e['features']) if isinstance(e['features'], str) 
              else e['features'] for e in events])
y = np.array([e['label'] for e in events])

X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.15, random_state=42)

model = xgb.XGBClassifier(
    n_estimators=200,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    use_label_encoder=False,
    eval_metric='logloss',
    early_stopping_rounds=20,
    verbosity=0
)

model.fit(
    X_train, y_train,
    eval_set=[(X_val, y_val)],
    verbose=False
)

model.save_model(model_path)
print(json.dumps({'status': 'ok', 'best_iteration': model.best_iteration}))
```

### `ml-service/gbm_predict.py`

```python
import sys
import json
import numpy as np
import xgboost as xgb

model_path, input_path, output_path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(input_path) as f:
    data = json.load(f)

model = xgb.XGBClassifier()
model.load_model(model_path)

X = np.array([data['features']])
score = float(model.predict_proba(X)[0][1])

with open(output_path, 'w') as f:
    json.dump({'score': score}, f)
```

---

## Main App Integration

### `server/services/MLService.js`

```javascript
// Thin HTTP client — main app doesn't know anything about TF or XGBoost
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001'
const ML_TIMEOUT_MS = 2000  // don't let ML slow down outfit generation

async function scoreOutfitBatch(outfits, userId, context) {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/score-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outfits, userId, context }),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS)
    })

    if (!res.ok) throw new Error(`ML service ${res.status}`)
    return await res.json()

  } catch (e) {
    // ML service down or slow → graceful degradation to rule+EMA only
    console.warn('ML service unavailable, using rule scores:', e.message)
    return {
      scores: outfits.map((o, i) => ({
        outfitIndex: i,
        score: o.features.rule_score,    // always pre-computed
        components: { nn: null, gbm: null }
      }))
    }
  }
}

async function recordFeedback(userId, outfitId, features, label, signalWeight) {
  try {
    await fetch(`${ML_SERVICE_URL}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, outfitId, features, label, signalWeight }),
      signal: AbortSignal.timeout(5000)
    })
  } catch (e) {
    // Non-critical — feedback still gets stored in SQLite by main app
    console.warn('ML training call failed:', e.message)
  }
}

async function getMLStatus() {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(1000)
    })
    return await res.json()
  } catch {
    return { status: 'offline' }
  }
}

module.exports = { scoreOutfitBatch, recordFeedback, getMLStatus }
```

---

## Batch Retrain Trigger

The main app triggers batch retraining periodically:

```javascript
// server/jobs/RetrainJob.js

// Every 50 new feedback events per user, trigger a retrain
async function checkRetrainThreshold(userId) {
  const count = await db('preference_events')
    .where({ user_id: userId })
    .count()
  
  const lastRetrain = await db('users')
    .select('last_retrain_count')
    .where({ id: userId })
    .first()

  const newEvents = count - (lastRetrain?.last_retrain_count || 0)

  if (newEvents >= 50) {
    // Fire and forget — this takes ~30 seconds
    fetch(`${ML_SERVICE_URL}/retrain`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    }).then(async res => {
      const stats = await res.json()
      console.log(`Retrain complete for user ${userId}:`, stats)
      
      await db('users')
        .where({ id: userId })
        .update({ 
          last_retrain_count: count,
          last_retrained_at: new Date()
        })
    }).catch(e => console.error('Retrain failed:', e))
  }
}
```

---

## Settings UI — ML Status Panel

In Settings → Intelligence, show the ensemble state:

```
┌───────────────────────────────────────────────────────┐
│  🧠 Style Intelligence                                │
│                                                       │
│  Your style model          Emma's style model         │
│  ────────────────          ─────────────────          │
│  Maturity: ████████░░ 78%  Maturity: ████░░░░░░ 41%  │
│  Ratings: 134              Ratings: 67                │
│                                                       │
│  Active models:            Active models:             │
│  ✅ Neural network         ✅ Neural network          │
│  ✅ Gradient boosted       ✅ Gradient boosted        │
│  ✅ EMA scoring            ✅ EMA scoring             │
│                                                       │
│  Ensemble weights (you):   Backend: CPU (no GPU)      │
│  NN 45% · GBM 35%          ML Service: ✅ Online      │
│  EMA 15% · Rules 5%                                   │
│                                                       │
│  [ Force Retrain ]   [ View Feature Importance ]      │
└───────────────────────────────────────────────────────┘
```

Feature importance from XGBoost is genuinely useful here — you can show the user 
"the model has learned that formality match and color palette are your strongest 
predictors, and material matters less to you." That's interesting feedback about 
someone's own taste.

---

## Setup Changes

Add to `setup.sh`:

```bash
# Check Docker
if ! command -v docker &> /dev/null; then
  echo "⚠️  Docker not found."
  echo "   The ML ensemble service requires Docker."
  echo "   Install from: https://docs.docker.com/get-docker/"
  echo "   The app will still work without it — ML features will be disabled."
  echo ""
  ML_ENABLED=false
else
  echo "🐳 Building ML service container..."
  docker compose build ml-service
  docker compose up -d ml-service
  
  # Wait for health check
  echo "⏳ Waiting for ML service to start..."
  for i in {1..30}; do
    if curl -sf http://localhost:5001/health > /dev/null; then
      echo "✅ ML service ready"
      break
    fi
    sleep 2
  done
  
  ML_ENABLED=true
fi

echo "ML_ENABLED=${ML_ENABLED}" >> .env
```

Add to `.env.example`:

```bash
# ML Ensemble Service
ML_SERVICE_URL=http://localhost:5001
ML_ENABLED=true
ML_TIMEOUT_MS=2000
```

Docker is listed as "optional but strongly recommended" in the README. Without it, the app falls back to EMA + rule scoring — still works, just doesn't get smarter as fast.

---

## Why This Architecture Holds Up

The 2-second timeout on ML calls is the key design decision. The main app never 
waits more than 2 seconds for the ML service. If the container is starting up, 
retraining, or having a moment — outfit generation still works immediately using 
EMA and rules. Users never notice the ML service is a separate process.

As the wardrobe grows and feedback accumulates, the ensemble weights shift 
automatically toward the more powerful models. A brand new user gets a simple, 
fast, interpretable system. A user with 200 ratings gets a properly trained 
neural net + XGBoost blend that's learned their specific aesthetic. The 
architecture grows with the data without any user-facing changes.
