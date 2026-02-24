# 05 — Outfit Engine

## Overview

The Outfit Engine takes a request context (occasion, weather, style preferences) and generates ranked outfit combinations from the user's wardrobe. It combines combinatorial logic, rule-based styling, and ML preference scoring.

---

## Request Context Object

```typescript
interface OutfitRequest {
  userId: number
  
  // Event details
  occasion: string        // dinner, work, gym, casual, wedding, beach, etc.
  eventName?: string      // "Sarah's birthday dinner"
  eventDate?: string      // ISO date
  timeOfDay: string       // morning, afternoon, evening, night
  
  // Weather (auto-fetched or overridden)
  location?: string       // for weather lookup
  weatherOverride?: {
    temp_f: number
    condition: string     // sunny, cloudy, rainy, snowy
    wind: boolean
    humidity: string      // low, medium, high
  }
  
  // Style intent
  formalityTarget?: number  // 1-10
  moodTags?: string[]       // ["confident", "playful", "professional"]
  fitPreference?: string    // tight, regular, loose, mixed
  colorPalette?: string[]   // ["neutrals", "bold", "earth tones"]
  avoidColors?: string[]    // ["orange", "yellow"]
  
  // Constraints
  mustIncludeItemIds?: number[]    // specific pieces to build around
  excludeItemIds?: number[]        // things in the laundry, etc.
  vacationMode?: boolean
  
  // From chat
  chatPrompt?: string      // raw natural language
  
  // UI state
  numToGenerate: number    // 15-20 for browsing
}
```

---

## Generation Algorithm

### Step 1: Filter Eligible Items

```javascript
async function getEligibleItems(userId, context) {
  const items = await db('clothing_items')
    .where({ user_id: userId, is_active: true })
    .whereNotIn('id', context.excludeItemIds || [])
  
  return items.filter(item => {
    // Weather filter
    if (context.weather.temp_f < item.temp_min_f) return false
    if (context.weather.temp_f > item.temp_max_f) return false
    
    // Rain/wind filter
    if (context.weather.rainy && item.waterproof === false && 
        item.category === 'shoes') return false
    
    // Season filter (soft — items without season data pass through)
    if (item.season && item.season.length > 0) {
      if (!item.season.includes(context.currentSeason)) return false
    }
    
    // Formality filter (±3 range)
    if (Math.abs(item.formality - context.formalityTarget) > 3) return false
    
    return true
  })
}
```

### Step 2: Build Outfit Slots

Every outfit follows a slot structure:

```
CORE (required):
  [ TOP ]  +  [ BOTTOM ]   ← separates
  OR
  [ DRESS / JUMPSUIT ]     ← one-piece
  
FOUNDATION (required):
  [ SHOES ]
  
OPTIONAL:
  [ OUTERWEAR ]  ← added if temp < 60°F or rain
  [ BAG ]        ← added for dinner/work occasions
  [ ACCESSORY ]  ← 0-2 pieces
```

### Step 3: Generate Combinations

```javascript
function generateCombinations(eligible, context, count = 50) {
  const tops = eligible.filter(i => i.category === 'top')
  const bottoms = eligible.filter(i => i.category === 'bottom')
  const dresses = eligible.filter(i => ['dress', 'jumpsuit'].includes(i.category))
  const shoes = eligible.filter(i => i.category === 'shoes')
  const outerwear = eligible.filter(i => i.category === 'outerwear')
  const bags = eligible.filter(i => i.category === 'bag')
  const accessories = eligible.filter(i => i.category === 'accessory')
  
  const outfits = []
  
  // Generate separate combos
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        const outfit = { top, bottom, shoe }
        
        // Maybe add outerwear
        if (context.weather.temp_f < 60 && outerwear.length > 0) {
          outfit.outer = randomFrom(outerwear)
        }
        
        // Maybe add bag
        if (['dinner', 'work', 'event'].includes(context.occasion) && bags.length > 0) {
          outfit.bag = randomFrom(bags)
        }
        
        // Maybe add accessory (0-2)
        const numAccessories = Math.floor(Math.random() * 3)
        if (numAccessories > 0 && accessories.length > 0) {
          outfit.accessories = sample(accessories, numAccessories)
        }
        
        outfits.push(outfit)
      }
    }
  }
  
  // Generate dress combos
  for (const dress of dresses) {
    for (const shoe of shoes) {
      const outfit = { dress, shoe }
      // ... similar optional additions
      outfits.push(outfit)
    }
  }
  
  // Return shuffled sample (too many combinations otherwise)
  return shuffle(outfits).slice(0, count)
}
```

### Step 4: Score Each Outfit

```javascript
async function scoreOutfits(outfits, context, userId, model) {
  return outfits.map(outfit => {
    const ruleScore = computeRuleScore(outfit, context)
    const features = buildFeatureVector(outfit, context, userId)
    const mlScore = model.predict(features)      // 0-1
    const modelAge = getModelMaturity(userId)    // 0-1 confidence in ML
    
    const finalScore = (modelAge * mlScore) + ((1 - modelAge) * ruleScore)
    
    return {
      ...outfit,
      scores: { rule: ruleScore, ml: mlScore, final: finalScore },
      features
    }
  })
  .sort((a, b) => b.scores.final - a.scores.final)
}
```

### Step 5: Diversity Enforcement

Even with scoring, we don't want 15 outfits all with the same blazer. After sorting:

```javascript
function diversify(rankedOutfits, topN = 20) {
  const selected = []
  const itemUsageCount = {}
  
  for (const outfit of rankedOutfits) {
    const allItems = getItemIds(outfit)
    const maxUsage = Math.max(...allItems.map(id => itemUsageCount[id] || 0))
    
    // Don't show same item more than 4 times in top results
    if (maxUsage < 4) {
      selected.push(outfit)
      allItems.forEach(id => {
        itemUsageCount[id] = (itemUsageCount[id] || 0) + 1
      })
    }
    
    if (selected.length >= topN) break
  }
  
  return selected
}
```

---

## Color Harmony Rules

```javascript
const COLOR_WHEEL = {
  red: 0, orange: 30, yellow: 60, lime: 90, green: 120,
  teal: 150, cyan: 180, sky: 210, blue: 240, purple: 270,
  magenta: 300, pink: 330
}

function colorHarmonyScore(items) {
  const hues = items
    .map(i => COLOR_WHEEL[i.primary_color])
    .filter(h => h !== undefined)
  
  if (hues.length < 2) return 0.5  // neutral
  
  const spread = maxHueSpread(hues)
  
  if (spread < 30) return 0.9      // monochromatic — safe
  if (spread >= 165 && spread <= 195) return 0.85  // complementary — bold but good
  if (spread >= 90 && spread <= 150) return 0.75   // analogous — pleasant
  if (spread > 60 && spread < 90) return 0.5       // split — risky
  
  return 0.3                       // clash
}

// Special case: neutrals (black, white, grey, beige, navy) pair with anything
function adjustForNeutrals(score, items) {
  const neutrals = ['black', 'white', 'grey', 'gray', 'beige', 'navy', 'cream', 'ivory']
  const nonNeutralCount = items.filter(i => !neutrals.includes(i.primary_color)).length
  if (nonNeutralCount <= 1) return 1.0  // neutrals + one color = always works
  return score
}
```

---

## Outfit Studio UI

```
┌──────────────────────────────────────────────────────────────┐
│  ✨ Outfit Studio                                            │
│                                                              │
│  ┌──────────────────────┐  ┌─────────────────────────────┐  │
│  │  💬 Chat             │  │  🎛️ Filters                  │  │
│  │                      │  │                             │  │
│  │  "Something casual   │  │  Occasion: [Dinner ▾]       │  │
│  │   but cute for       │  │  Formality: ●────── 6/10    │  │
│  │   Saturday brunch"   │  │  Weather: 📍 Auto [55°F ☁]  │  │
│  │                      │  │  Fit: [Relaxed ▾]           │  │
│  │  [ Generate → ]      │  │  Style: casual classic      │  │
│  └──────────────────────┘  │          bohemian ✓         │  │
│                            └─────────────────────────────┘  │
│  ─────────────────────────────────────────────────────────── │
│                                                              │
│  Outfit 1 of 18  ◀ ▶                         💾 Save        │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ 🖼️ Top  │  │ 🖼️ Bot  │  │ 🖼️ Shoe │  │ 🖼️ Bag  │       │
│  │ Cream   │  │ Wide    │  │ Tan     │  │ Straw   │       │
│  │ linen   │  │ leg     │  │ mules   │  │ tote    │       │
│  │ blouse  │  │ jeans   │  │         │  │         │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                              │
│        ┌────────────────────────────────────┐               │
│        │   [ 👎 Pass ]    [ 👍 Love it ]   │               │
│        └────────────────────────────────────┘               │
│                                                              │
│   AI Match Score: ████████░░ 82%    🌡️ Perfect for 55°F     │
└──────────────────────────────────────────────────────────────┘
```

---

## Seasonal / Time-of-Day Visual Theming

The outfit display changes its visual presentation based on context:

| Context | Background | Lighting | Mood |
|---|---|---|---|
| Summer morning | Warm golden gradient | Bright | Airy |
| Rainy day | Cool grey-blue | Diffused | Cozy |
| Evening / dinner | Dark navy, subtle gold | Warm | Elegant |
| Winter | Crisp white, icy blue | Cool | Structured |
| Beach / vacation | Turquoise, sand | Bright | Relaxed |

These are CSS class swaps triggered by `context.season` + `context.timeOfDay` + `context.weather.condition`.

---

## Outfit Card Component

Each item in an outfit is displayed as a photo card. Layout adapts to number of pieces:

```
2 items (dress + shoes):     [ Large ] [ Large ]
3 items (top+bottom+shoes):  [ Mid ] [ Mid ] [ Mid ]
4 items:                     [ Large top area ] [ Small shoes ] [ Small bag ]
5+ items:                    Grid with featured center item
```

Clicking any item opens a detail drawer showing full info + ability to swap that slot.

---

## Swapping Items

User can click any slot in the outfit and see alternatives:

```
"Swap shoes"
→ Shows all eligible shoes filtered for this outfit's context
→ User picks one → outfit updates → rescored
→ New combination saved as a variant
```
