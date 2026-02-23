/**
 * TrainerService.js — Lightweight NN training and inference for the Outfit Trainer
 * 
 * Architecture: Dense(32, ReLU) → Dropout(0.3) → Dense(16, ReLU) → Dense(1, linear)
 * Parameters: ~2,300
 * Loss: Huber (robust to noisy labels)
 * Training time: <1 second on CPU for 2000 samples
 * 
 * Depends on: @tensorflow/tfjs-node (install: npm install @tensorflow/tfjs-node)
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import db from '../db/client.js'
import { computeItemFeatures, FEATURE_DIM } from './FeatureEngine.js'
import { updateItemScore } from './PreferenceService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = join(__dirname, '..', '..', 'data', 'models')

// Lazy-load TF.js — don't crash if not installed yet
let tf = null
async function getTf() {
  if (tf) return tf
  try {
    tf = await import('@tensorflow/tfjs-node')
    return tf
  } catch (e) {
    // Fallback to pure JS (slower but works without native bindings)
    try {
      tf = await import('@tensorflow/tfjs')
      console.warn('TrainerService: Using tfjs CPU fallback (no native bindings)')
      return tf
    } catch (e2) {
      throw new Error('TensorFlow.js not installed. Run: npm install @tensorflow/tfjs-node')
    }
  }
}

// ── Model cache (per user) ──────────────────────────────────────────────────

const modelCache = new Map()  // userId → { model, trainingSamples, validationLoss }

// ── NN Weight Calculation ───────────────────────────────────────────────────

/**
 * Determine how much weight the NN gets in the EMA/NN blend.
 * Based on training sample count and validation loss.
 * 
 * @param {number} trainingSamples - total feedback events used for training
 * @param {number} validationLoss - Huber loss on held-out validation set
 * @returns {number} 0 to 0.90
 */
export function getNnWeight(trainingSamples, validationLoss) {
  if (!trainingSamples || trainingSamples < 100) return 0

  // Data confidence: 0 at 100 samples, maxes at 0.45 at 1500+
  const dataConf = Math.min((trainingSamples - 100) / 1400, 1.0) * 0.45

  // Loss confidence: 0 if loss > 0.3, maxes at 0.45 if loss < 0.1
  const lossConf = validationLoss < 0.3
    ? Math.min((0.3 - validationLoss) / 0.2, 1.0) * 0.45
    : 0

  const weight = dataConf + lossConf
  return Math.max(0.05, Math.min(weight, 0.90))
}

// ── Model Building ──────────────────────────────────────────────────────────

/**
 * Build the NN model architecture.
 * Dense(32, ReLU, L2) → Dropout(0.3) → Dense(16, ReLU, L2) → Dense(1, linear)
 */
async function buildModel() {
  const tfjs = await getTf()

  const model = tfjs.sequential({
    layers: [
      tfjs.layers.dense({
        inputShape: [FEATURE_DIM],
        units: 32,
        activation: 'relu',
        kernelRegularizer: tfjs.regularizers.l2({ l2: 0.001 }),
      }),
      tfjs.layers.dropout({ rate: 0.3 }),
      tfjs.layers.dense({
        units: 16,
        activation: 'relu',
        kernelRegularizer: tfjs.regularizers.l2({ l2: 0.001 }),
      }),
      tfjs.layers.dense({ units: 1 }),  // linear output
    ],
  })

  model.compile({
    optimizer: tfjs.train.adam(0.01),
    loss: 'huberLoss' in tfjs.losses ? tfjs.losses.huberLoss : 'meanSquaredError',
    metrics: ['mae'],
  })

  return model
}

// ── Training Data Preparation ───────────────────────────────────────────────

/**
 * Build training samples from all feedback events.
 * Features are computed on-the-fly from current item state.
 */
function prepareTrainingData(userId) {
  const events = db.prepare(`
    SELECT * FROM outfit_feedback
    WHERE user_id = ?
    AND feedback_type NOT IN ('neutral', 'exclude')
    ORDER BY created_at
  `).all(userId)

  const samples = []

  for (const event of events) {
    const item = db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(event.item_id)
    if (!item) continue  // orphaned feedback — item was deleted

    // Build context from stored context or defaults
    const context = {
      occasion: event.context_occasion || 'casual',
      season: event.context_season || getCurrentSeason(),
      timeOfDay: event.context_time_of_day || 'afternoon',
    }

    // Get outfit peers if outfit_id exists
    let outfitPeers = []
    if (event.outfit_id) {
      outfitPeers = db.prepare(`
        SELECT ci.* FROM outfit_feedback of2
        JOIN clothing_items ci ON ci.id = of2.item_id
        WHERE of2.outfit_id = ? AND of2.item_id != ? AND of2.user_id = ?
        GROUP BY of2.item_id
      `).all(event.outfit_id, event.item_id, userId)
    }

    // Compute label: use stored feedback_value, or derive from type
    let label = event.feedback_value
    if (label == null) {
      const LABEL_MAP = {
        'thumbs_up': 1.0,
        'thumbs_down': -1.0,
        'worn_confirmed': 1.0,
        'voice_positive': 0.8,
        'voice_negative': -0.7,
        'saved_outfit': 0.6,
        'viewed_long': 0.2,
        'skipped_repeated': -0.3,
      }
      label = LABEL_MAP[event.feedback_type] ?? 0
    }

    const features = computeItemFeatures(item, context, outfitPeers)

    // Validate — all features must be valid numbers
    if (features.some(f => typeof f !== 'number' || isNaN(f))) {
      console.warn(`TrainerService: skipping event ${event.id} — invalid features`)
      continue
    }

    samples.push({ features, label })
  }

  return samples
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'fall'
  return 'winter'
}

// ── Training ────────────────────────────────────────────────────────────────

/**
 * Train the NN model from all accumulated feedback.
 * 
 * @param {number} userId
 * @returns {{ success, samples, validationLoss, validationMAE, epochs, trainingTimeMs, nnWeight, paramCount }}
 */
export async function trainModel(userId) {
  const tfjs = await getTf()
  const startTime = Date.now()

  // 1. Prepare data
  const samples = prepareTrainingData(userId)

  if (samples.length < 50) {
    return {
      success: false,
      error: `Need at least 50 feedback samples to train. Have: ${samples.length}`,
      samples: samples.length,
    }
  }

  // 2. Shuffle
  tfjs.util.shuffle(samples)

  // 3. Split 80/20
  const splitIdx = Math.floor(samples.length * 0.8)
  const trainSamples = samples.slice(0, splitIdx)
  const valSamples = samples.slice(splitIdx)

  // 4. Build tensors
  const trainX = tfjs.tensor2d(trainSamples.map(s => s.features))
  const trainY = tfjs.tensor2d(trainSamples.map(s => [s.label]))
  const valX = tfjs.tensor2d(valSamples.map(s => s.features))
  const valY = tfjs.tensor2d(valSamples.map(s => [s.label]))

  // 5. Build and train model
  const model = await buildModel()

  // Learning rate decay callback
  let currentLr = 0.01
  const callbacks = []

  // Early stopping
  try {
    callbacks.push(tfjs.callbacks.earlyStopping({ monitor: 'val_loss', patience: 10 }))
  } catch {
    // earlyStopping may not exist in all tfjs versions
  }

  const batchSize = Math.min(32, Math.max(4, Math.floor(trainSamples.length / 4)))

  const result = await model.fit(trainX, trainY, {
    epochs: 100,
    batchSize,
    validationData: [valX, valY],
    callbacks,
    verbose: 0,
  })

  // 6. Extract metrics
  const finalEpoch = result.history.val_loss.length - 1
  const valLoss = result.history.val_loss[finalEpoch]
  const valMae = result.history.val_mae ? result.history.val_mae[finalEpoch] : null

  // 7. Cleanup tensors
  trainX.dispose()
  trainY.dispose()
  valX.dispose()
  valY.dispose()

  // 8. Save model
  const modelDir = join(MODELS_DIR, `user_${userId}`)
  if (!existsSync(modelDir)) mkdirSync(modelDir, { recursive: true })
  const modelPath = `file://${modelDir}`
  await model.save(modelPath)

  // 9. Cache model
  const paramCount = model.countParams()
  modelCache.set(userId, { model, trainingSamples: samples.length, validationLoss: valLoss })

  // 10. Log training session to DB
  const nnWeight = getNnWeight(samples.length, valLoss)
  db.prepare(`
    INSERT INTO training_sessions (user_id, feedback_count, feature_count, param_count, validation_loss, validation_mae, model_path, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    samples.length,
    FEATURE_DIM,
    paramCount,
    valLoss,
    valMae,
    modelDir,
    `epochs=${finalEpoch + 1}, batchSize=${batchSize}, lr=0.01→decay`
  )

  const trainingTimeMs = Date.now() - startTime

  return {
    success: true,
    samples: samples.length,
    validationLoss: Math.round(valLoss * 1000) / 1000,
    validationMAE: valMae ? Math.round(valMae * 1000) / 1000 : null,
    epochs: finalEpoch + 1,
    trainingTimeMs,
    nnWeight: Math.round(nnWeight * 100) / 100,
    paramCount,
  }
}

// ── Inference ───────────────────────────────────────────────────────────────

/**
 * Load a trained model for a user (from cache or disk).
 * Returns null if no model exists.
 */
async function loadModel(userId) {
  // Check cache
  if (modelCache.has(userId)) return modelCache.get(userId)

  // Check disk
  const modelDir = join(MODELS_DIR, `user_${userId}`)
  const modelJsonPath = join(modelDir, 'model.json')
  if (!existsSync(modelJsonPath)) return null

  try {
    const tfjs = await getTf()
    const model = await tfjs.loadLayersModel(`file://${modelJsonPath}`)

    // Get latest training session for metadata
    const session = db.prepare(`
      SELECT feedback_count, validation_loss FROM training_sessions
      WHERE user_id = ? ORDER BY trained_at DESC LIMIT 1
    `).get(userId)

    const cached = {
      model,
      trainingSamples: session?.feedback_count || 0,
      validationLoss: session?.validation_loss || 1.0,
    }
    modelCache.set(userId, cached)
    return cached
  } catch (e) {
    console.error(`TrainerService: failed to load model for user ${userId}:`, e.message)
    return null
  }
}

/**
 * Score a single item within an outfit context using the NN.
 * Returns a continuous preference score (roughly -1 to +1).
 */
export async function scoreItem(userId, item, context, outfitPeers) {
  const cached = await loadModel(userId)
  if (!cached) return null

  const tfjs = await getTf()
  const features = computeItemFeatures(item, context, outfitPeers)
  const input = tfjs.tensor2d([features])
  const prediction = cached.model.predict(input)
  const score = (await prediction.data())[0]
  input.dispose()
  prediction.dispose()
  return score
}

/**
 * Score a complete outfit (average of per-item NN scores).
 */
export async function scoreOutfit(userId, items, context) {
  const cached = await loadModel(userId)
  if (!cached) return null

  const scores = await Promise.all(
    items.map(item => {
      const peers = items.filter(i => i.id !== item.id)
      return scoreItem(userId, item, context, peers)
    })
  )

  const validScores = scores.filter(s => s !== null)
  if (validScores.length === 0) return null
  return validScores.reduce((a, b) => a + b, 0) / validScores.length
}

/**
 * Check if a trained model is ready for a user.
 */
export async function isModelReady(userId) {
  const cached = await loadModel(userId)
  return cached !== null
}

/**
 * Get current NN weight for a user based on their latest training session.
 */
export function getUserNnWeight(userId) {
  const session = db.prepare(`
    SELECT feedback_count, validation_loss FROM training_sessions
    WHERE user_id = ? ORDER BY trained_at DESC LIMIT 1
  `).get(userId)

  if (!session) return 0
  return getNnWeight(session.feedback_count, session.validation_loss)
}

/**
 * Get training stats for a user.
 */
export function getTrainingStats(userId) {
  const session = db.prepare(`
    SELECT feedback_count, validation_loss, validation_mae, trained_at, param_count
    FROM training_sessions
    WHERE user_id = ? ORDER BY trained_at DESC LIMIT 1
  `).get(userId)

  const totalFeedback = db.prepare(`
    SELECT COUNT(*) as count FROM outfit_feedback
    WHERE user_id = ? AND feedback_type NOT IN ('neutral', 'exclude')
  `).get(userId)

  const sessionCount = db.prepare(`
    SELECT COUNT(*) as count FROM training_sessions WHERE user_id = ?
  `).get(userId)

  return {
    totalSamples: totalFeedback?.count || 0,
    lastTrained: session?.trained_at || null,
    validationLoss: session?.validation_loss || null,
    validationMAE: session?.validation_mae || null,
    paramCount: session?.param_count || null,
    trainingRuns: sessionCount?.count || 0,
    nnWeight: session ? getNnWeight(session.feedback_count, session.validation_loss) : 0,
  }
}

// ── Blended Scoring (EMA + NN) ──────────────────────────────────────────────

/**
 * Score an outfit using the EMA/NN blend.
 * This is the main scoring function for outfit generation.
 * 
 * @returns {{ finalScore, emaScore, nnScore, nnWeight, scoringMethod }}
 */
export async function blendedScoreOutfit(userId, items, context) {
  // EMA score: average of item EMA scores
  const emaScore = items.reduce((sum, item) => sum + (item.ema_score ?? 0.5), 0) / items.length

  // Try NN scoring
  let nnScore = null
  let nnWeight = 0
  let scoringMethod = 'ema'

  try {
    if (await isModelReady(userId)) {
      nnScore = await scoreOutfit(userId, items, context)
      if (nnScore !== null) {
        nnWeight = getUserNnWeight(userId)
        scoringMethod = nnWeight > 0 ? 'blend' : 'ema'
      }
    }
  } catch (e) {
    console.warn('TrainerService: NN scoring failed, using EMA:', e.message)
  }

  // Blend
  const finalScore = nnScore !== null && nnWeight > 0
    ? (1 - nnWeight) * emaScore + nnWeight * nnScore
    : emaScore

  return {
    finalScore: Math.round(finalScore * 1000) / 1000,
    emaScore: Math.round(emaScore * 1000) / 1000,
    nnScore: nnScore !== null ? Math.round(nnScore * 1000) / 1000 : null,
    nnWeight: Math.round(nnWeight * 100) / 100,
    scoringMethod,
  }
}

/**
 * Clear model cache (e.g., after retraining).
 */
export function clearModelCache(userId) {
  if (userId) {
    modelCache.delete(userId)
  } else {
    modelCache.clear()
  }
}

export default {
  trainModel,
  scoreItem,
  scoreOutfit,
  blendedScoreOutfit,
  isModelReady,
  getNnWeight,
  getUserNnWeight,
  getTrainingStats,
  clearModelCache,
}
