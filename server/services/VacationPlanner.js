import db from '../db/client.js'
import OutfitEngine from './OutfitEngine.js'

const ACTIVITY_FORMALITY = {
  beach:      { formality: [1, 3], categories: ['swimwear', 'bottom', 'top', 'shoes'] },
  casual:    { formality: [2, 5], categories: ['top', 'bottom', 'shoes'] },
  dining:    { formality: [5, 8], categories: ['top', 'bottom', 'dress', 'shoes', 'bag'] },
  hiking:    { formality: [1, 3], categories: ['activewear', 'shoes', 'outerwear'] },
  sightseeing:{ formality: [2, 5], categories: ['top', 'bottom', 'shoes', 'bag'] },
  nightlife: { formality: [6, 9], categories: ['dress', 'top', 'bottom', 'shoes', 'bag'] },
  business:  { formality: [7, 10], categories: ['top', 'bottom', 'shoes', 'bag'] }
}

const CLIMATE_PARAMS = {
  hot:      { temp_min_f: 75, temp_max_f: 110 },
  warm:     { temp_min_f: 60, temp_max_f: 85 },
  mild:     { temp_min_f: 45, temp_max_f: 70 },
  cold:     { temp_min_f: 20, temp_max_f: 50 },
  variable: { temp_min_f: 40, temp_max_f: 85 }
}

export class VacationPlanner {
  async planTrip(userId, constraints) {
    try {
      const { activities, climate, maxItems = 12, startDate, endDate } = constraints

      // Validate required fields
      if (!activities || !Array.isArray(activities) || activities.length === 0) {
        throw new Error('activities is required and must be a non-empty array')
      }

      // Get all active items
      let allItems = []
      try {
        allItems = db.prepare(`
          SELECT * FROM clothing_items
          WHERE user_id = ? AND is_active = 1
        `).all(userId) || []
      } catch (err) {
        console.error('Error fetching items:', err)
        allItems = []
      }

      // Filter for climate
      const climateParams = CLIMATE_PARAMS[climate] || CLIMATE_PARAMS.mild
      const eligibleItems = (allItems || []).filter(item => {
        if (!item) return false
        const itemMin = item.temp_min_f || 30
        const itemMax = item.temp_max_f || 100
        return itemMin <= climateParams.temp_max_f && itemMax >= climateParams.temp_min_f
      })

      // Run optimization
      const result = await this.optimizePacking(eligibleItems, constraints)

      // Generate outfit combinations - handle case where no items
      let outfits = []
      if (result && result.items && result.items.length > 0) {
        try {
          outfits = this.generateVacationOutfits(result.items, activities)
        } catch (e) {
          console.error('Error generating vacation outfits:', e)
          outfits = []
        }
      }

      // Save to database
      let insertResult = null
      try {
        const insert = db.prepare(`
          INSERT INTO vacation_plans (
            user_id, name, destination, start_date, end_date, num_days,
            max_items, activities, climate, item_ids, outfit_ids, total_outfits, versatility_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const itemIds = result && result.items ? result.items.filter(i => i && i.id).map(i => i.id) : []
        const outfitIds = outfits.filter(o => o && o.id).map(o => o.id)

        insertResult = insert.run(
          userId,
          constraints.name || 'Trip',
          constraints.destination || null,
          startDate || null,
          endDate || null,
          constraints.numDays || 7,
          maxItems,
          JSON.stringify(activities),
          climate || 'mild',
          JSON.stringify(itemIds),
          JSON.stringify(outfitIds),
          outfits.length,
          result && result.versatilityScore ? result.versatilityScore : 0
        )
      } catch (err) {
        console.error('Error saving vacation plan:', err)
        return {
          id: null,
          items: result ? result.items : [],
          outfits,
          totalOutfits: outfits.length,
          versatilityScore: result ? result.versatilityScore : 0,
          error: 'Failed to save vacation plan'
        }
      }

      return {
        id: insertResult ? insertResult.lastInsertRowid : null,
        items: result ? result.items : [],
        outfits,
        totalOutfits: outfits.length,
        versatilityScore: result ? result.versatilityScore : 0
      }
    } catch (err) {
      console.error('VacationPlanner.planTrip error:', err)
      throw err
    }
  }

  async optimizePacking(candidatePool = [], constraints) {
    if (!candidatePool || candidatePool.length === 0) {
      return { items: [], outfitCount: 0, versatilityScore: 0 }
    }

    const { activities, maxItems } = constraints || {}
    const mustCategories = this.getRequiredCategories(activities || [])
    
    // Start with must-have items
    let selected = this.getMustHaveItems(candidatePool, mustCategories)
    
    let bestSolution = selected
    let bestScore = 0
    
    // Run random restarts
    for (let attempt = 0; attempt < 20; attempt++) {
      let current = [...selected]
      const candidates = this.shuffle([...candidatePool.filter(i => !selected.includes(i))])
      
      // Greedy add
      while (current.length < maxItems && candidates.length > 0) {
        let best = null
        let bestGain = -1
        
        for (const candidate of candidates.slice(0, 50)) {
          const gain = this.marginalGain(candidate, current, constraints)
          if (gain > bestGain) {
            bestGain = gain
            best = candidate
          }
        }
        
        if (best) {
          current.push(best)
          candidates.splice(candidates.indexOf(best), 1)
        } else {
          break
        }
      }
      
      // Local search improvement
      current = this.localSearch(current, candidatePool, constraints)
      
      const score = this.countOutfits(current, activities)
      if (score > bestScore) {
        bestScore = score
        bestSolution = current
      }
    }
    
    return {
      items: bestSolution,
      outfitCount: bestScore,
      versatilityScore: bestSolution.length > 0 ? bestScore / bestSolution.length : 0
    }
  }

  getRequiredCategories(activities) {
    const categories = new Set()
    for (const activity of activities) {
      const req = ACTIVITY_FORMALITY[activity]
      if (req) {
        req.categories.forEach(c => categories.add(c))
      }
    }
    return Array.from(categories)
  }

  getMustHaveItems(items = [], requiredCategories = []) {
    const mustHave = []
    
    // Need at least one shoe
    const shoes = (items || []).filter(i => i && i.category === 'shoes')
    if (shoes.length > 0) mustHave.push(shoes[0])
    
    return mustHave
  }

  shuffle(array = []) {
    return array.sort(() => Math.random() - 0.5)
  }

  marginalGain(item, selected = [], constraints) {
    const testSet = [...selected, item]
    return this.countOutfits(testSet, constraints?.activities || [])
  }

  countOutfits(items = [], activities = []) {
    let count = 0
    
    for (const activity of activities) {
      const req = ACTIVITY_FORMALITY[activity]
      if (!req) continue
      
      // Can we build an outfit for this activity?
      const validItems = items.filter(i => i != null)
      const hasTop = validItems.some(i => ['top', 'dress'].includes(i.category))
      const hasBottom = validItems.some(i => i.category === 'bottom')
      const hasShoes = validItems.some(i => i.category === 'shoes')
      
      if (hasTop && hasBottom && hasShoes) count++
    }
    
    return count
  }

  localSearch(selected = [], pool = [], constraints = {}) {
    let improved = true
    let current = selected || []
    
    if (!current || !pool) return current
    
    while (improved) {
      improved = false
      
      for (let i = 0; i < current.length; i++) {
        const item = current[i]
        
        // Try swapping with each unselected item
        for (const replacement of pool) {
          if (current.includes(replacement)) continue
          
          const testSet = [...current]
          testSet[i] = replacement
          
          const testScore = this.countOutfits(testSet, constraints.activities)
          const currentScore = this.countOutfits(current, constraints.activities)
          
          if (testScore > currentScore) {
            current = testSet
            improved = true
            break
          }
        }
        
        if (improved) break
      }
    }
    
    return current
  }

  generateVacationOutfits(packedItems, activities) {
    const outfits = []

    if (!packedItems || packedItems.length === 0 || !activities || activities.length === 0) {
      return outfits
    }

    try {
      const outfitEngine = new OutfitEngine()

      for (const activity of activities) {
        // Generate combos for this activity using the engine's combination generator
        const context = { occasion: activity, numToGenerate: 10 }

        // Use generateCombinations to create actual outfit combinations from items
        const combinations = outfitEngine.generateCombinations(packedItems, context)

        // Score each combination
        for (const combo of combinations.slice(0, 5)) {
          const ruleScore = outfitEngine.computeRuleScore(combo, context)
          outfits.push({
            items: combo,
            ruleScore,
            activity,
            id: `vacation-${activity}-${outfits.length}`
          })
        }
      }
    } catch (err) {
      console.error('Error in generateVacationOutfits:', err)
    }

    return outfits
  }

  listTrips(userId) {
    try {
      return db.prepare(`
        SELECT * FROM vacation_plans
        WHERE user_id = ?
        ORDER BY created_at DESC
      `).all(userId) || []
    } catch (err) {
      console.error('Error listing trips:', err)
      return []
    }
  }

  getTrip(userId, tripId) {
    try {
      const trip = db.prepare('SELECT * FROM vacation_plans WHERE id = ? AND user_id = ?').get(tripId, userId)
      if (!trip) return null

      let itemIds = []
      try {
        itemIds = JSON.parse(trip.item_ids || '[]')
      } catch (e) {
        itemIds = []
      }

      const items = itemIds
        .filter(id => id != null)
        .map(id => db.prepare('SELECT * FROM clothing_items WHERE id = ?').get(id))
        .filter(item => item != null)

      return {
        ...trip,
        items
      }
    } catch (err) {
      console.error('Error getting trip:', err)
      return null
    }
  }
}

export default VacationPlanner
