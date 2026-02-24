# 06 — Vacation Planner

## Overview

The Vacation Planner solves a fundamentally different problem than daily outfit generation: **maximum outfit variety from a minimum number of packed items**.

This is a combinatorial optimization problem — essentially a form of the Set Cover / Maximum Coverage problem. We want to find the subset of wardrobe items that generates the most valid outfit combinations given trip constraints.

---

## The Core Problem

Given:
- Your full wardrobe (N items)
- A trip with D days and K distinct activity types
- A packing limit of M items maximum

Find the M items that produce the most outfit combinations while satisfying:
- Coverage of all required activity types
- Weather/climate appropriateness for the destination
- Color harmony across the selected pieces (everything should work together)
- No redundant pieces (don't pack 3 white tees)

---

## Algorithm

### Step 1: Activity Analysis

```javascript
const ACTIVITY_FORMALITY = {
  beach:      { formality: [1, 3], categories: ['swimwear', 'bottom', 'top', 'shoes'] },
  casual:     { formality: [2, 5], categories: ['top', 'bottom', 'shoes'] },
  dining:     { formality: [5, 8], categories: ['top', 'bottom', 'dress', 'shoes', 'bag'] },
  hiking:     { formality: [1, 3], categories: ['activewear', 'shoes', 'outerwear'] },
  sightseeing:{ formality: [2, 5], categories: ['top', 'bottom', 'shoes', 'bag'] },
  nightlife:  { formality: [6, 9], categories: ['dress', 'top', 'bottom', 'shoes', 'bag'] },
  business:   { formality: [7, 10], categories: ['top', 'bottom', 'shoes', 'bag'] }
}
```

### Step 2: Climate-Based Filtering

```javascript
function filterForClimate(items, climate) {
  const CLIMATE_PARAMS = {
    hot:      { temp_min_f: 75, temp_max_f: 110 },
    warm:     { temp_min_f: 60, temp_max_f: 85 },
    mild:     { temp_min_f: 45, temp_max_f: 70 },
    cold:     { temp_min_f: 20, temp_max_f: 50 },
    variable: { temp_min_f: 40, temp_max_f: 85 }
  }
  
  const { temp_min_f, temp_max_f } = CLIMATE_PARAMS[climate]
  
  return items.filter(item => 
    item.temp_min_f <= temp_max_f && item.temp_max_f >= temp_min_f
  )
}
```

### Step 3: Versatility Scoring

For each item, score how many valid outfit combinations it enables:

```javascript
function itemVersatilityScore(item, candidatePool, context) {
  let outfitCount = 0
  
  // For each activity type
  for (const activity of context.activities) {
    const requirements = ACTIVITY_FORMALITY[activity]
    
    if (!requirements.categories.includes(item.category)) continue
    
    // Count how many complete outfits can be built including this item
    const complementary = candidatePool.filter(other => 
      other.id !== item.id &&
      isCompatible(item, other, activity) &&
      colorHarmony(item, other) > 0.5
    )
    
    outfitCount += complementary.length
  }
  
  return outfitCount
}
```

### Step 4: Greedy Optimization with Interchange

Pure greedy (always pick highest versatility item) produces decent results but misses interactions. We use greedy + random restart:

```javascript
async function optimizePacking(eligibleItems, constraints, maxItems) {
  const { activities, climate, maxItems: M } = constraints
  
  let bestSolution = null
  let bestScore = 0
  
  // Run N random restarts and keep best
  for (let attempt = 0; attempt < 20; attempt++) {
    
    // Start with must-have items (shoes for each activity type, etc.)
    let selected = getMustHaveItems(eligibleItems, activities)
    
    // Shuffle remaining candidates for diversity across restarts
    const candidates = shuffle(
      eligibleItems.filter(i => !selected.includes(i))
    )
    
    // Greedy add: keep adding the item that most increases outfit count
    while (selected.length < M && candidates.length > 0) {
      let bestItem = null
      let bestGain = -1
      
      for (const candidate of candidates.slice(0, 50)) {  // consider top 50
        const gain = marginalOutfitGain(candidate, selected, constraints)
        if (gain > bestGain) {
          bestGain = gain
          bestItem = candidate
        }
      }
      
      if (bestItem) {
        selected.push(bestItem)
        candidates.splice(candidates.indexOf(bestItem), 1)
      } else break
    }
    
    // Local search: try swapping each selected item with an unselected one
    selected = localSearchImprove(selected, eligibleItems, constraints)
    
    const score = countTotalOutfits(selected, activities, constraints)
    if (score > bestScore) {
      bestScore = score
      bestSolution = selected
    }
  }
  
  return { items: bestSolution, outfitCount: bestScore }
}
```

### Step 5: Generate All Outfit Combinations

Once the packing list is finalized, enumerate all valid outfits:

```javascript
function generateVacationOutfits(packedItems, activities) {
  const outfits = []
  
  for (const activity of activities) {
    const activityOutfits = generateCombinations(packedItems, { occasion: activity })
    activityOutfits.forEach(o => {
      o.activity = activity
      outfits.push(o)
    })
  }
  
  // Deduplicate identical combinations
  return deduplicateOutfits(outfits)
}
```

---

## Vacation Planner UI

```
┌─────────────────────────────────────────────────────────────┐
│  ✈️  Vacation Packer                                        │
│                                                             │
│  Trip Name: [ Paris - June ________________ ]               │
│  Dates:     [ June 15 ] → [ June 25 ]  (10 days)           │
│  Climate:   [ Warm / Mild ▾ ]                               │
│  Max Items: [    12    ]  (including shoes)                  │
│                                                             │
│  Activities:                                                │
│  ✓ Casual sightseeing    ✓ Nice dinners                     │
│  ✓ Walking / light hike  □ Beach    □ Business              │
│                                                             │
│  [ 🎯 Optimize My Packing List ]                            │
│                                                             │
│  ──────────────────────────────────────────────────────  │
│                                                             │
│  📦 Pack These 12 Items → Creates 28 Outfits               │
│  Versatility Score: 2.3 outfits per item ⭐                 │
│                                                             │
│  TOPS (4):          BOTTOMS (3):    SHOES (2):              │
│  ┌───┐ ┌───┐       ┌───┐ ┌───┐    ┌───┐ ┌───┐             │
│  │   │ │   │       │   │ │   │    │   │ │   │             │
│  └───┘ └───┘       └───┘ └───┘    └───┘ └───┘             │
│  ┌───┐ ┌───┐       ┌───┐                                   │
│  │   │ │   │       │   │         OUTERWEAR (1) DRESS (1)   │
│  └───┘ └───┘       └───┘         ┌───┐        ┌───┐        │
│                                  │   │        │   │        │
│                                  └───┘        └───┘        │
│                                                             │
│  [ View All 28 Outfits ] [ Export Packing List PDF ]        │
└─────────────────────────────────────────────────────────────┘
```

---

## Outfit Calendar View

For longer trips, display outfits in a day-by-day calendar:

```
Day 1 (Sat)     Day 2 (Sun)     Day 3 (Mon)     ...
Arrival         Sightseeing     Nice Dinner
[Outfit 3]      [Outfit 7]      [Outfit 12]
Casual          Casual          Dressy
```

User can shuffle, lock specific days, and the optimizer respects locked assignments.

---

## Packing List Export

Generate a printable/shareable packing list:

```markdown
# Paris Trip - June 15-25

## Pack (12 items → 28 outfits)

TOPS
□ Cream linen blouse
□ Navy striped tee
□ White cotton shirt  
□ Black ribbed tank

BOTTOMS
□ Wide leg cream trousers
□ Dark wash straight jeans
□ Black midi skirt

SHOES
□ Tan leather mules
□ White sneakers

OUTERWEAR
□ Camel trench coat

DRESS
□ Navy wrap dress

BAG
□ Tan leather crossbody
```

Exported as PDF or plain text. QR code links back to the app for viewing outfits on your phone while traveling.

---

## Couple's Packing (Future Feature)

When both users are taking the same trip, the optimizer can plan for both wardrobes simultaneously, avoiding total item count for each person while maximizing combined outfit diversity.
