const Fastify = require('fastify')

const app = Fastify({ logger: true })

// Simple in-memory model storage (would use proper ML in production)
const models = new Map()

app.get('/health', async () => {
  return { status: 'ok', nn_ready: models.size > 0 }
})

// Score outfit
app.post('/score', async (req) => {
  const { features, userId, context } = req.body
  
  // Simplified scoring - in production would use actual ML
  const emaScore = features.reduce((sum, f) => sum + (f.ema_score || 0.5), 0) / Math.max(features.length, 1)
  const ruleScore = features.reduce((sum, f) => sum + (f.rule_score || 0.5), 0) / Math.max(features.length, 1)
  
  const finalScore = (0.5 * emaScore) + (0.5 * ruleScore)
  
  return {
    score: finalScore,
    components: { ema: emaScore, rule: ruleScore, nn: null, gbm: null },
    maturity: models.get(userId)?.count || 0
  }
})

// Batch score
app.post('/score-batch', async (req) => {
  const { outfits } = req.body
  
  return {
    scores: outfits.map((o, i) => ({
      outfitIndex: i,
      score: Math.random() * 0.3 + 0.6, // Placeholder
      components: { ema: 0.6, rule: 0.7, nn: null, gbm: null }
    }))
  }
})

// Train
app.post('/train', async (req) => {
  const { userId, features, label, signalWeight } = req.body
  
  if (!models.has(userId)) {
    models.set(userId, { count: 0, features: [] })
  }
  
  const model = models.get(userId)
  model.count++
  model.features.push({ features, label, weight: signalWeight })
  
  return { status: 'ok', modelMaturity: model.count }
})

// Retrain
app.post('/retrain', async (req) => {
  const { userId } = req.body
  
  // Simulate retraining
  return { status: 'ok', samples: models.get(userId)?.count || 0 }
})

// Model info
app.get('/models/:userId', async (req) => {
  const { userId } = req.params
  const model = models.get(userId)
  
  return {
    userId,
    maturity: model?.count || 0,
    nnLoaded: false,
    gbmLoaded: false,
    weights: { ema: 0.5, rule: 0.5, nn: 0, gbm: 0 }
  }
})

app.listen({ port: 5001, host: '0.0.0.0' })
  .then(() => console.log('ML service running on :5001'))
