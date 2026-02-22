import db from '../db/client.js'
import { getAverageEmaScore, buildColorProfile, paletteConsistencyScore } from './PreferenceService.js'

// Color harmony mapping
const COLOR_WHEEL = {
  red: 0, orange: 30, yellow: 60, lime: 90, green: 120,
  teal: 150, cyan: 180, sky: 210, blue: 240, purple: 270,
  magenta: 300, pink: 330
}

const NEUTRALS = ['black', 'white', 'grey', 'gray', 'beige', 'navy', 'cream', 'ivory', 'tan', 'brown', 'khaki']

const OCCASION_FORMALITY = {
  gym: 1,
  beach: 2,
  casual: 3,
  brunch: 4,
  date: 5,
  dinner: 6,
  work: 7,
  business: 8,
  formal: 9,
  wedding: 10
}

export class OutfitEngine {
  constructor() {
    this.weatherService = null // Injected
  }

  setWeatherService(ws) {
    this.weatherService = ws
  }

  async generateOutfits(userId, context) {
    // Get weather if not provided
    let weather = context.weather
    if (!weather && context.location) {
      weather = await this.weatherService.getWeatherForLocation(context.location)
    } else if (!weather) {
      weather = await this.weatherService.getCurrentWeather()
    }

    const fullContext = {
      ...context,
      weather,
      currentSeason: this.getCurrentSeason(),
      formalityTarget: context.formalityTarget || OCCASION_FORMALITY[context.occasion] || 5
    }

    // Get eligible items (excludes laundry and stored items)
    const eligibleItems = await this.getEligibleItems(userId, fullContext)
    
    if (eligibleItems.length === 0) {
      return { error: 'No eligible items found. Add clothes to your wardrobe first.' }
    }

    // Get user color profile for palette scoring
    const userProfile = buildColorProfile(userId)

    // Generate combinations
    const combinations = this.generateCombinations(eligibleItems, fullContext)
    
    // Score each outfit using EMA + rules + palette
    const scored = combinations.map(combo => {
      const ruleScore = this.computeRuleScore(combo, fullContext)
      const emaScore = getAverageEmaScore(Object.values(combo).flatMap(v => 
        Array.isArray(v) ? v.map(i => i.id) : (v ? [v.id] : [])
      ).filter(Boolean))
      const palScore = paletteConsistencyScore(
        Object.values(combo).flatMap(v => Array.isArray(v) ? v : (v ? [v] : [])).filter(Boolean),
        userProfile
      )

      // Combined: 40% EMA + 40% rules + 20% palette
      const finalScore = (0.4 * emaScore) + (0.4 * ruleScore) + (0.2 * palScore)

      return {
        items: combo,
        scores: {
          ema: emaScore,
          rule: ruleScore,
          palette: palScore,
          final: finalScore
        },
        weatherMatch: this.checkWeatherMatch(combo, weather)
      }
    })

    // Sort by final score
    scored.sort((a, b) => b.scores.final - a.scores.final)

    // Apply diversity
    const diverse = this.diversify(scored, context.numToGenerate || 15)

    return {
      outfits: diverse,
      context: fullContext,
      totalGenerated: combinations.length,
      userProfile
    }
  }

  // Generate with pre-filtered items (for vacation planner)
  generateOutfitsWithItems(items, context) {
    const scored = items.map(combo => {
      const ruleScore = this.computeRuleScore(combo, context)
      const emaScore = getAverageEmaScore(Object.values(combo).flatMap(v => 
        Array.isArray(v) ? v.map(i => i.id) : (v ? [v.id] : [])
      ).filter(Boolean))

      return {
        items: combo,
        ruleScore,
        emaScore,
        weatherMatch: this.checkWeatherMatch(combo, context.weather)
      }
    })

    scored.sort((a, b) => b.ruleScore - a.ruleScore)
    return { outfits: scored.slice(0, 20) }
  }

  getCurrentSeason() {
    const month = new Date().getMonth()
    if (month >= 2 && month <= 4) return 'spring'
    if (month >= 5 && month <= 7) return 'summer'
    if (month >= 8 && month <= 10) return 'fall'
    return 'winter'
  }

  async getEligibleItems(userId, context) {
    let query = db.prepare(`
      SELECT * FROM clothing_items 
      WHERE user_id = ? AND is_active = 1 AND storage_status = 'active' AND in_laundry = 0
    `)
    
    let items = query.all(userId)

    // Filter by weather
    items = items.filter(item => {
      if (context.weather) {
        if (context.weather.temp_f < (item.temp_min_f || 30)) return false
        if (context.weather.temp_f > (item.temp_max_f || 100)) return false
      }
      return true
    })

    // Filter by formality
    if (context.formalityTarget) {
      items = items.filter(item => {
        const itemFormality = item.formality || 5
        return Math.abs(itemFormality - context.formalityTarget) <= 3
      })
    }

    return items
  }

  generateCombinations(items, context) {
    const tops = items.filter(i => i.category === 'top')
    const bottoms = items.filter(i => i.category === 'bottom')
    const dresses = items.filter(i => i.category === 'dress')
    const shoes = items.filter(i => i.category === 'shoes')
    const outerwear = items.filter(i => i.category === 'outerwear')
    const bags = items.filter(i => i.category === 'bag')
    const accessories = items.filter(i => i.category === 'accessory')

    const outfits = []
    const maxOutfits = context.numToGenerate || 50

    // Generate top + bottom combos
    for (const top of tops) {
      for (const bottom of bottoms) {
        if (outfits.length >= maxOutfits) break
        
        const outfit = { 
          top: { ...top, id: top.id }, 
          bottom: { ...bottom, id: bottom.id }, 
          shoes: shoes[Math.floor(Math.random() * shoes.length)] 
        }
        
        // Maybe add outerwear for cold
        if (context.weather && context.weather.temp_f < 60 && outerwear.length > 0 && Math.random() > 0.5) {
          outfit.outer = outerwear[Math.floor(Math.random() * outerwear.length)]
        }
        
        // Maybe add bag for dinner/work
        if (['dinner', 'work', 'date'].includes(context.occasion) && bags.length > 0 && Math.random() > 0.5) {
          outfit.bag = bags[Math.floor(Math.random() * bags.length)]
        }
        
        // Maybe add accessory
        if (accessories.length > 0 && Math.random() > 0.6) {
          const numAccessories = Math.floor(Math.random() * 2) + 1
          const shuffled = [...accessories].sort(() => Math.random() - 0.5)
          outfit.accessories = shuffled.slice(0, numAccessories)
        }

        outfits.push(outfit)
      }
    }

    // Generate dress combos
    for (const dress of dresses) {
      if (outfits.length >= maxOutfits) break
      
      const outfit = { 
        dress: { ...dress, id: dress.id }, 
        shoes: shoes[Math.floor(Math.random() * shoes.length)] 
      }
      
      if (context.weather && context.weather.temp_f < 60 && outerwear.length > 0) {
        outfit.outer = outerwear[Math.floor(Math.random() * outerwear.length)]
      }

      outfits.push(outfit)
    }

    // Shuffle and limit
    return outfits.sort(() => Math.random() - 0.5).slice(0, maxOutfits)
  }

  computeRuleScore(outfit, context) {
    let score = 0.5
    const allItems = this.getAllItems(outfit)

    // Color harmony
    const colorScore = this.colorHarmonyScore(allItems)
    score += (colorScore - 0.5) * 0.3

    // Loved items bonus
    const lovedCount = allItems.filter(i => i.is_loved).length
    score += lovedCount * 0.05

    // Formality match
    if (context.formalityTarget) {
      const avgFormality = allItems.reduce((sum, i) => sum + (i.formality || 5), 0) / allItems.length
      const formalityDiff = Math.abs(avgFormality - context.formalityTarget)
      score -= formalityDiff * 0.05
    }

    return Math.max(0, Math.min(1, score))
  }

  colorHarmonyScore(items) {
    const hues = items
      .map(i => COLOR_WHEEL[i.primary_color?.toLowerCase()])
      .filter(h => h !== undefined)

    if (hues.length < 2) return 0.8 // Neutrals are flexible

    // Check for neutrals
    const nonNeutrals = items.filter(i => !NEUTRALS.includes(i.primary_color?.toLowerCase()))
    if (nonNeutrals.length <= 1) return 1.0 // Neutrals + one color always works

    const spread = Math.max(...hues) - Math.min(...hues)

    if (spread < 30) return 0.9 // Monochromatic
    if (spread >= 165 && spread <= 195) return 0.85 // Complementary
    if (spread >= 90 && spread <= 150) return 0.75 // Analogous

    return 0.4 // Clash
  }

  checkWeatherMatch(outfit, weather) {
    if (!weather) return 'Unknown'
    
    const allItems = this.getAllItems(outfit)
    const avgWeight = this.averageWeight(allItems)
    const temp = weather.temp_f

    if (temp < 50 && avgWeight !== 'heavyweight') return 'Cold'
    if (temp > 80 && avgWeight === 'heavyweight') return 'Hot'
    
    return 'Perfect'
  }

  averageWeight(items) {
    const weights = { lightweight: 0.33, medium: 0.66, heavyweight: 1 }
    const avg = items.reduce((sum, i) => sum + (weights[i.weight] || 0.5), 0) / items.length
    if (avg < 0.4) return 'lightweight'
    if (avg > 0.6) return 'heavyweight'
    return 'medium'
  }

  getAllItems(outfit) {
    return Object.values(outfit).flatMap(v => 
      Array.isArray(v) ? v : (v ? [v] : [])
    ).filter(Boolean)
  }

  diversify(rankedOutfits, topN = 20) {
    const selected = []
    const itemUsageCount = {}

    for (const outfit of rankedOutfits) {
      const allItems = this.getAllItems(outfit.items)
      const maxUsage = Math.max(0, ...allItems.map(id => itemUsageCount[id.id] || 0))

      if (maxUsage < 4) {
        selected.push(outfit)
        allItems.forEach(item => {
          itemUsageCount[item.id] = (itemUsageCount[item.id] || 0) + 1
        })
      }

      if (selected.length >= topN) break
    }

    return selected
  }
}

export default OutfitEngine
