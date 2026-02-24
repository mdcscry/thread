# 03 — AI & ML Design

## Two Distinct AI Systems

THREAD uses two fundamentally different AI approaches for different jobs:

| System | What It Does | Technology |
|---|---|---|
| **Vision LLM** | Understand what clothing items ARE | Ollama (local) |
| **Preference Model** | Predict what YOU will LIKE | TensorFlow.js |

These work together: the LLM creates structured descriptions, the ML model learns which combinations of those descriptions produce outfits you love.

---

## Part 1: Vision LLM — Clothing Analysis

### Supported Models (via Ollama)

Listed in recommended order for a typical machine:

```
Model               VRAM    Speed    Quality    Best For
─────────────────   ──────  ───────  ─────────  ────────────────────────
moondream2          2GB     Fast     Good       Low-resource machines, bulk ingestion
llava:7b            4GB     Medium   Good       General purpose, well-rounded
qwen2.5-vl:7b       4GB     Medium   Excellent  Best quality at 7B, OCR, detail
gemma3:4b           3GB     Fast     Good       Fast + quality balance
llava:13b           8GB     Slow     Very Good  Better machines
molmo:7b            5GB     Medium   Excellent  Detailed analysis
qwen2.5-vl:72b      40GB+   Slow     Excellent  High-end workstations only
```

The app lets users pick their model in Settings, and validates it's available in Ollama before ingestion starts.

---

### Analysis Prompt Design

Each clothing image gets a two-stage analysis:

**Stage 1: Raw Description**
```
You are a professional fashion analyst. Examine this clothing item carefully.
Describe what you see in detail: the type of garment, its color(s), pattern,
material if you can determine it, texture, approximate weight/thickness,
how it would fit on a body, and any notable design details.
Be precise and factual. If you are uncertain about something, say so explicitly.
```

**Stage 2: Structured Extraction**
```
Based on your description, output a JSON object with exactly these fields.
Use null for any field you cannot determine confidently. Use "uncertain" for
fields where you're making an educated guess.

{
  "category": "top|bottom|dress|outerwear|shoes|bag|accessory|activewear",
  "subcategory": "specific type",
  "primary_color": "single dominant color name",
  "secondary_color": "second color if present, else null",
  "colors": ["all colors present"],
  "pattern": "solid|striped|floral|plaid|geometric|animal|graphic|textured|other",
  "material": "cotton|wool|silk|linen|polyester|denim|leather|knit|synthetic|unknown",
  "texture": "smooth|ribbed|knit|woven|sheer|velvet|terry|denim|leather|other",
  "silhouette": "fitted|relaxed|oversized|structured|flowy|boxy",
  "fit": "tight|slim|regular|relaxed|loose|oversized",
  "length": "crop|short|regular|midi|maxi|null",
  "style_tags": ["casual","office","evening","sporty","boho","edgy","classic","romantic"],
  "season": ["spring","summer","fall","winter"],
  "weight": "lightweight|medium|heavyweight",
  "temp_min_f": 45,
  "temp_max_f": 85,
  "formality": 5,
  "confidence": 0.85,
  "uncertain_fields": ["material", "weight"]
}

Output only valid JSON. No explanation, no markdown.
```

---

### Confidence & Flagging System

Items are flagged for user review when:
- `confidence < 0.7`
- More than 2 fields are in `uncertain_fields`
- JSON parsing fails (AI hallucination)
- Category is "unknown" or missing

Flagged items get a `refinement_prompt` entry with a specific question:

```javascript
const refinementQuestions = {
  material: "What material is this item? (cotton, wool, silk, linen, synthetic...)",
  weight:   "How heavy/warm is this item? (lightweight, medium, heavyweight)",
  season:   "What seasons would you wear this in?",
  category: "What type of clothing is this?",
  formality: "On a scale 1-10, how formal is this item? (1=gym, 10=black tie)"
}
```

A notification badge appears in the UI when pending refinements exist. The user can answer inline without navigating away from whatever they're doing.

---

### Retry & Fallback Strategy

```
Attempt 1: Full structured prompt → parse JSON
Attempt 2 (if parse fails): Simpler prompt, fewer fields
Attempt 3: Store raw description only, flag for manual entry
```

---

## Part 2: Preference ML Model

### Goal

After the user has rated ~20+ outfits, the model starts predicting which new outfits they'll like before showing them, so only high-probability hits are presented.

### Architecture

A simple feedforward neural network in TensorFlow.js:

```
Input Layer:  ~80 features (flattened outfit encoding)
              ↓
Dense(128, relu) + Dropout(0.3)
              ↓
Dense(64, relu) + Dropout(0.2)
              ↓
Dense(32, relu)
              ↓
Dense(1, sigmoid)  →  score: 0.0 (hate) to 1.0 (love)
```

Runs entirely in Node.js process. No Python. No GPU required (though it helps).
Model weights saved to `server/ml/saved_model/` and persist between restarts.

---

### Feature Engineering

Each outfit is encoded as a feature vector. Example features:

**Item-level features** (per slot: top, bottom, shoes, outer, accessory):
- Category one-hot encoding
- Color encoding (hue bucket, saturation, brightness)
- Pattern one-hot
- Formality level (normalized 0-1)
- Weight (lightweight=0, medium=0.5, heavy=1)
- Style tags (multi-hot)

**Outfit-level features:**
- Color harmony score (complementary, analogous, monochrome, clash)
- Formality variance (how consistent is the formality across pieces)
- Total weight (for weather suitability)
- Number of pieces
- Season match score (given time of year)

**Context features:**
- Temperature normalized (0=freezing, 1=hot)
- Occasion one-hot encoding
- Time of day one-hot
- Day of week (captures weekend vs weekday patterns)
- Season one-hot

**User history features:**
- Times each item has been worn
- Times each item has appeared in loved outfits
- Preferred color for this user (rolling average)

Total: approximately 80-100 features.

---

### Training Loop

```javascript
// Incremental training on new feedback
async function trainOnFeedback(userId, outfitId, feedback) {
  const features = await buildFeatureVector(userId, outfitId)
  const label = feedback === 1 ? 1.0 : feedback === -1 ? 0.0 : 0.5
  
  // Load existing model or create new
  const model = await loadOrCreateModel(userId)
  
  // Single-sample gradient update (online learning)
  await model.fit(
    tf.tensor2d([features]),
    tf.tensor2d([[label]]),
    { epochs: 3, batchSize: 1, shuffle: false }
  )
  
  await model.save(`file://./server/ml/saved_model/user_${userId}`)
  
  // Also store full feature vector for periodic batch retraining
  await db('preference_events').insert({
    user_id: userId,
    outfit_id: outfitId,
    event_type: feedback === 1 ? 'thumbs_up' : 'thumbs_down',
    features: JSON.stringify(features)
  })
}
```

**Batch retraining** runs every 50 new events to avoid local minima from purely incremental updates.

---

### Cold Start Strategy

Before enough ratings exist, the model can't be trusted. Cold start thresholds:

| Ratings Count | Strategy |
|---|---|
| 0-10 | Random ordering, no ML scoring |
| 11-25 | Soft ML weighting (30% ML, 70% rule-based) |
| 26-50 | Moderate ML weighting (60% ML, 40% rule-based) |
| 50+ | Full ML scoring |

The UI shows the user their "style intelligence" level and how many more ratings improve it.

---

### Rule-Based Baseline (Always Active)

The rule-based scorer handles cold start and sanity-checks ML predictions:

```javascript
function ruleScore(outfit, context) {
  let score = 0.5
  
  // Temperature rules
  const avgWeight = averageWeight(outfit.items)
  score += temperatureMatch(avgWeight, context.temp_f) * 0.3
  
  // Occasion formality match
  const avgFormality = averageFormality(outfit.items)
  const expectedFormality = OCCASION_FORMALITY[context.occasion]
  score -= Math.abs(avgFormality - expectedFormality) * 0.05
  
  // Color clash penalty
  if (hasColorClash(outfit.items)) score -= 0.15
  
  // Season match
  if (!seasonMatch(outfit.items, context.season)) score -= 0.2
  
  // Loved items bonus
  score += outfit.items.filter(i => i.is_loved).length * 0.05
  
  return Math.max(0, Math.min(1, score))
}
```

---

### Outfit Presentation Flow

```
User requests outfits for "dinner tonight, it's 55°F, Italian restaurant"
          ↓
NLP extracts: { occasion: "dinner", formality: 7, temp_f: 55, style: "classic" }
          ↓
OutfitEngine generates 50 candidate outfit combinations from wardrobe
          ↓
Each candidate → feature vector → PreferenceModel → ml_score
          ↓
Candidates sorted by: (0.6 × ml_score) + (0.4 × rule_score)
          ↓
Top 15-20 presented to user in swipe/scroll UI
          ↓
User swipes → feedback → model update
```

---

## NLP for Chat Input

The chat interface sends natural language to Ollama (text-only model, e.g., `llama3.2:3b`) with a structured extraction prompt:

**Input:** "Something cute for brunch with my girlfriends on Saturday, it's going to be warm and sunny"

**Extraction prompt:**
```
Extract outfit parameters from this request. Return JSON only.
{
  "occasion": "brunch",
  "formality": 4,
  "time_of_day": "morning",
  "weather_override": "warm and sunny",
  "style_words": ["cute"],
  "mood": "social",
  "day_of_week": "saturday"
}
```

The extracted JSON feeds directly into the OutfitEngine. The chat input and form inputs are fully interchangeable — they set the same internal state object.
