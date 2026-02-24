# THREAD Marketing & Pricing Architecture

*Last Updated: 2026-02-23*

---

## Core Insight

The wardrobe upload is a 20–30 minute commitment. A free trial that expires after that work is done is hostile UX — it punishes the most engaged users. THREAD uses a **low-friction paid entry** model instead: a small upfront cost that filters for real users, with pricing that grows naturally as users discover they want more.

---

## Pricing Tiers

| Tier | Price | Target User |
|------|-------|-------------|
| `peek` | $0 | Curious browsers — see the magic, not enough to live in it |
| `starter` | $2.99/mo | Solo user who wants daily help getting dressed |
| `pro` | $7.99/mo | Power user who wants the app to learn their taste |
| `couple` | $14.99/mo | Two people who need to coordinate outfits |
| `wardrobe_plus` | $19.99/mo | Planners — vacations, events, weekly prep |

### Tier Feature Matrix

| Feature | Peek | Starter | Pro | Couple | Wardrobe+ |
|---------|------|---------|-----|--------|-----------|
| Wardrobe items | 5 | 50 | Unlimited | Unlimited (×2) | Unlimited |
| Daily outfit suggestions | 1 | 5 | Unlimited | Unlimited | Unlimited |
| Weather-aware suggestions | ❌ | ✅ | ✅ | ✅ | ✅ |
| Outfit history | ❌ | ❌ | ✅ | ✅ | ✅ |
| Feedback learning (TF model) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Weekly planner | ❌ | ❌ | ❌ | ❌ | ✅ |
| Vacation packing planner | ❌ | ❌ | ❌ | ❌ | ✅ |
| Couple coordination | ❌ | ❌ | ❌ | ✅ | ✅ |
| Occasion planning | ❌ | ❌ | ❌ | ✅ | ✅ |
| Priority AI | ❌ | ❌ | ✅ | ✅ | ✅ |

### Pricing Philosophy

- **Peek** exists to let people see the product works before paying anything. 5 items is enough to get one good suggestion. Not enough to rely on it.
- **Starter** is the tripwire. $2.99 is "whatever, I'll try it" money. It filters out freeloaders without creating friction for real users.
- **Pro** is where most solo users should land. The TF personal model is the key differentiator — after 30+ feedback interactions the suggestions get genuinely personal.
- **Couple** is a unique market position. Nobody does coordinated outfit suggestions. This is both a premium tier and a marketing hook.
- **Wardrobe+** captures the high-intent, high-willingness-to-pay user: the planner. Vacations, events, and weekly prep all live here.

---

## Weekly Planner Feature

### Overview

The weekly planner generates a full 7-day outfit plan based on the user's wardrobe, the upcoming weather forecast, their calendar context (if provided), and their learned style preferences. It runs every Sunday and is available as a push notification or in-app view Monday morning.

This is a **Wardrobe+ exclusive feature**.

### Data Sources

| Source | Data | Cost |
|--------|------|------|
| Open-Meteo API | 7–10 day weather forecast | Free, no API key required |
| User wardrobe | Items, categories, fit preferences | Local SQLite |
| TF personal model | Learned style preferences | Local VPS |
| User calendar context | Optional — user provides occasion notes | Manual input |

### Open-Meteo Integration

Open-Meteo is free, open source, and requires no API key. It provides hourly and daily forecasts up to 16 days.

```javascript
// server/services/WeatherService.js
export class WeatherService {

  async getForecast({ latitude, longitude, days = 7 }) {
    const params = new URLSearchParams({
      latitude,
      longitude,
      daily: [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
        'weathercode',
        'windspeed_10m_max',
      ].join(','),
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      precipitation_unit: 'inch',
      forecast_days: days,
      timezone: 'auto',
    })

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    const data = await res.json()
    return this.normalize(data)
  }

  normalize(data) {
    return data.daily.time.map((date, i) => ({
      date,
      high: data.daily.temperature_2m_max[i],
      low: data.daily.temperature_2m_min[i],
      precipitation_chance: data.daily.precipitation_probability_max[i],
      wind_mph: data.daily.windspeed_10m_max[i],
      condition: this.weatherCodeToCondition(data.daily.weathercode[i]),
    }))
  }

  weatherCodeToCondition(code) {
    // WMO Weather Code mapping
    if (code === 0) return 'sunny'
    if (code <= 3) return 'partly_cloudy'
    if (code <= 48) return 'foggy'
    if (code <= 67) return 'rainy'
    if (code <= 77) return 'snowy'
    if (code <= 82) return 'rainy'
    if (code <= 99) return 'stormy'
    return 'unknown'
  }
}
```

### Weekly Planner Service

```javascript
// server/services/WeeklyPlannerService.js
export class WeeklyPlannerService {
  constructor(db, weatherService, geminiService, trainerService) {
    this.db = db
    this.weather = weatherService
    this.gemini = geminiService
    this.trainer = trainerService
  }

  async generateWeeklyPlan({ userId, latitude, longitude, occasionNotes = {} }) {
    // 1. Get 7-day forecast
    const forecast = await this.weather.getForecast({ latitude, longitude, days: 7 })

    // 2. Get user's available wardrobe (not in laundry, not in storage)
    const wardrobe = this.db.exec(`
      SELECT * FROM items
      WHERE user_id = ? AND in_laundry = 0 AND in_storage = 0
    `, [userId])

    // 3. Get user profile + fit preferences
    const profile = this.db.exec(`
      SELECT preferences FROM users WHERE id = ?
    `, [userId])?.[0]

    // 4. Get learned preferences from TF model
    const styleScores = await this.trainer.predictBatch(userId, wardrobe)

    // 5. Build plan day by day
    const plan = []
    const usedOutfits = new Set() // avoid repeating outfits within the week

    for (const day of forecast) {
      const occasion = occasionNotes[day.date] || 'everyday'

      const prompt = this.buildPlannerPrompt({
        day,
        wardrobe,
        profile,
        styleScores,
        occasion,
        usedOutfits: [...usedOutfits],
      })

      const suggestion = await this.gemini.generateOutfit(prompt)
      plan.push({ date: day.date, weather: day, occasion, outfit: suggestion })

      // Track used items to encourage variety
      suggestion.items.forEach(item => usedOutfits.add(item.id))
    }

    // 6. Save plan to DB
    await this.savePlan(userId, plan)
    return plan
  }

  buildPlannerPrompt({ day, wardrobe, profile, styleScores, occasion, usedOutfits }) {
    return `
      You are a personal stylist creating a single outfit for the following day:

      Date: ${day.date}
      Weather: High ${day.high}°F, Low ${day.low}°F
      Conditions: ${day.condition}
      Wind: ${day.wind_mph} mph
      Rain chance: ${day.precipitation_chance}%
      Occasion: ${occasion}

      User profile: ${JSON.stringify(profile)}

      Available wardrobe items (scored by personal preference, higher = more loved):
      ${wardrobe.map(item => ({
        ...item,
        preference_score: styleScores[item.id] || 0.5
      }))}

      Already used this week (avoid repeating unless necessary):
      ${usedOutfits}

      Select 3-5 items that work together for this day.
      Prioritize higher preference_score items.
      Account for weather — layers if cold, breathable if hot, rain-ready if precipitation > 40%.
      Return JSON: { items: [{ id, name, reason }], styling_note: string }
    `
  }

  async savePlan(userId, plan) {
    // Store as JSON blob — retrieve for the week's view
    this.db.run(`
      INSERT OR REPLACE INTO weekly_plans (user_id, week_start, plan, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [userId, plan[0].date, JSON.stringify(plan)])
  }
}
```

### Weekly Plans DB Table

```sql
CREATE TABLE IF NOT EXISTS weekly_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  week_start  TEXT NOT NULL,        -- ISO date of Monday
  plan        TEXT NOT NULL,        -- JSON blob
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, week_start),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Weekly Planner API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/planner/weekly | Generate weekly plan |
| GET | /api/v1/planner/weekly | Get current week's plan |
| PATCH | /api/v1/planner/weekly/:date | Override a single day |
| POST | /api/v1/planner/vacation | Generate vacation packing plan |

### Vacation Planner

The vacation planner is an extension of the weekly planner — it takes a destination, date range, and planned activities, fetches the forecast for the destination, and generates both a day-by-day outfit plan and a packing list.

```javascript
async generateVacationPlan({ userId, destination, startDate, endDate, activities }) {
  // Geocode destination → lat/lng (use free Nominatim/OpenStreetMap)
  const coords = await this.geocode(destination)

  // Get forecast for destination
  const days = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)
  const forecast = await this.weather.getForecast({ ...coords, days: Math.min(days, 16) })

  // Generate day-by-day plan
  const plan = await this.generateWeeklyPlan({
    userId,
    ...coords,
    occasionNotes: activities,  // e.g. { '2026-03-10': 'beach', '2026-03-11': 'dinner' }
  })

  // Generate packing list from plan
  const packingList = this.buildPackingList(plan, days)

  return { plan, packingList, destination, forecast }
}

buildPackingList(plan, totalDays) {
  const items = {}
  plan.forEach(day => {
    day.outfit.items.forEach(item => {
      items[item.id] = items[item.id] || { ...item, count: 0 }
      items[item.id].count++
    })
  })

  return {
    clothing: Object.values(items),
    extras: this.suggestExtras(plan),  // umbrella, sunscreen, layers etc.
    totalDays,
    generatedAt: new Date().toISOString(),
  }
}
```

### Geocoding (Free — OpenStreetMap Nominatim)

```javascript
async geocode(destination) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'THREAD-App/1.0 support@outerfit.net' } }
  )
  const [result] = await res.json()
  return { latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) }
}
```

### Scheduled Plan Generation

Run weekly planner automatically every Sunday night for all Wardrobe+ subscribers:

```javascript
// server/jobs/weeklyPlanner.js — run via node-cron
import cron from 'node-cron'

// Every Sunday at 9pm local
cron.schedule('0 21 * * 0', async () => {
  const subscribers = db.exec(`
    SELECT u.id, u.preferences
    FROM users u
    JOIN entitlements e ON e.user_id = u.id
    WHERE e.plan = 'wardrobe_plus' AND e.status = 'active'
  `)

  for (const user of subscribers) {
    const prefs = JSON.parse(user.preferences || '{}')
    if (prefs.latitude && prefs.longitude) {
      await weeklyPlannerService.generateWeeklyPlan({
        userId: user.id,
        latitude: prefs.latitude,
        longitude: prefs.longitude,
      })
    }
  }
})
```

---

## Feature Gating by Demand

The most capital-efficient way to build a premium tier. Don't speculate — listen.

### Implementation

Add a feedback button to every screen in the React app:

```jsx
// client/src/components/FeatureRequest.jsx
export function FeatureRequest() {
  const [submitted, setSubmitted] = useState(false)

  const submit = async (wish) => {
    await fetch('/api/v1/feedback/feature-request', {
      method: 'POST',
      body: JSON.stringify({ wish }),
    })
    setSubmitted(true)
  }

  return (
    <div className="feature-request">
      {!submitted ? (
        <>
          <p>I wish THREAD could...</p>
          <input onKeyDown={e => e.key === 'Enter' && submit(e.target.value)} />
        </>
      ) : (
        <p>Thanks — we read every one of these.</p>
      )}
    </div>
  )
}
```

```sql
CREATE TABLE IF NOT EXISTS feature_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  plan        TEXT,
  wish        TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Decision Rule

| Request count | Action |
|---------------|--------|
| 1–4 | Log it, watch for pattern |
| 5–9 | Add to backlog, validate with follow-up |
| 10+ | Build it, gate it one tier above requesters |

---

## Marketing Plan

### The Core Message

Three distinct hooks for three distinct audiences:

| Audience | Hook | Channel |
|----------|------|---------|
| Daily dresser | "Stop staring at your closet every morning" | Instagram, TikTok |
| Planner | "Pack exactly what you need. Nothing else." | Pinterest, travel blogs |
| Couples | "What are we wearing?" — solved forever | Reddit, relationship content |

### Phase 1 — Proof of Concept (0–50 users)

**Goal:** Prove the AI actually works for someone who didn't build it.

**Actions:**
- Get the GF using it. For real. Her verdict is your first product truth.
- Post honest content about building it — the tech, the challenges, the dubious GF. Builders have audiences and authenticity converts.
- Reddit: r/femalefashionadvice, r/malefashionadvice, r/capsulewardrobe. Don't pitch — participate. Mention THREAD when genuinely relevant.
- Find 10 people who are not you and not your GF. Give them free Pro access. Watch what they do. Ask them nothing for 2 weeks, then ask everything.

**Metric to hit before Phase 2:** 3 out of 10 beta users say they'd pay for it unprompted.

### Phase 2 — Early Growth (50–500 users)

**Goal:** Find repeatable acquisition channels.

**Content marketing:**
- "10 outfits from 30 wardrobe items" — SEO-friendly, shareable, demonstrates the product
- "How to build a capsule wardrobe your AI can work with" — positions THREAD as the tool
- "What to pack for [destination] in [month]" — high search intent, vacation planner hook

**The couple angle as PR:**
- Pitch to relationship advice newsletters and blogs
- "The app that ends the 'what are you wearing' argument" is a headline that writes itself
- Morning show segment potential — this is genuinely novel

**Influencer micro-strategy:**
- Fashion micro-influencers (10k–100k followers) are more effective than macro at this stage
- Offer 3 months free Wardrobe+ in exchange for honest content — not a paid post, honest content
- Target: style-focused creators who actually talk about getting dressed, not just posing

**Metric to hit before Phase 3:** Organic word-of-mouth accounts for 30%+ of new signups.

### Phase 3 — Scale (500+ users)

**Goal:** Paid acquisition becomes viable.

- CAC/LTV math: if LTV of a Pro user is ~$96 (12 months × $7.99), you can spend up to ~$30 to acquire them profitably
- Pinterest ads for vacation planner — high intent, visual product
- Instagram/TikTok for daily dresser — video of the app working is the ad
- App Store optimization once TWA/Capacitor is live — "outfit planner" and "AI stylist" are searchable

### Retention Strategy

Retention is cheaper than acquisition. For a fashion app:

- **Weekly planner push notification** — "Your week is planned. Tap to see Monday's outfit." This is a daily active use driver.
- **Seasonal wardrobe review** — "You haven't worn these 12 items in 90 days. Archive them?"
- **Occasion reminders** — user adds "job interview Tuesday" and gets a reminder Sunday to plan the outfit
- **Monthly style recap** — "Your most-worn item this month was your navy blazer. Here's why it works."

---

## Inference Cost Management

Gemini Flash is cheap but real at scale. Manage it by tier.

| Operation | Model | Cost tier | Cached? |
|-----------|-------|-----------|---------|
| Vision analysis (upload) | Gemini Flash | One-time per item | ✅ Result stored in DB |
| Daily outfit suggestion | Gemini Flash | Per request | ⚠️ Rate limited by plan |
| Weekly plan generation | Gemini Flash | Weekly batch | ✅ Stored until next week |
| Vacation plan | Gemini Flash | On-demand | ✅ Stored |
| TF personal model inference | Local TensorFlow | Free | ✅ Always cached |

**Key insight:** Once an item is analyzed by vision AI, the result is stored permanently. The ongoing inference cost is outfit generation only — not re-analyzing the wardrobe on every request.

**Cost projection at scale:**

| Users | Plan mix assumption | Est. Gemini calls/day | Est. monthly cost |
|-------|--------------------|-----------------------|-------------------|
| 100 | 60% starter, 40% pro | ~300 | ~$2 |
| 1,000 | 50/30/20 split | ~2,500 | ~$15 |
| 10,000 | 40/35/25 split | ~20,000 | ~$120 |

Gemini Flash pricing makes this very manageable. The TF personal model running locally on the RTX Pro 4000 Ada VPS is effectively free per-inference — that GPU is significantly overpowered for this workload, which is actually an advantage.

---

## New Environment Variables

```bash
# Weather
OPEN_METEO_BASE_URL=https://api.open-meteo.com/v1
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org

# Planner
WEEKLY_PLAN_CRON=0 21 * * 0   # Sunday 9pm
VACATION_MAX_DAYS=16            # Open-Meteo forecast limit
```

---

## New Files

```
server/
├── services/
│   ├── WeatherService.js         # Open-Meteo integration
│   ├── WeeklyPlannerService.js   # Weekly + vacation planning
│   └── GeocodingService.js       # Nominatim geocoding
├── routes/
│   └── planner.js                # Planner API endpoints
└── jobs/
    └── weeklyPlanner.js          # Cron job — Sunday night batch

client/src/
├── pages/
│   ├── WeeklyPlanner.jsx         # 7-day plan view
│   └── VacationPlanner.jsx       # Vacation packing view
└── components/
    └── FeatureRequest.jsx        # "I wish THREAD could..." widget
```

---

## Summary

The business case is straightforward. People get dressed every day. That is not going away. The question is whether the AI is good enough to earn a recurring payment — and the answer to that is only knowable by shipping it and watching real people use it.

The GF is the canary. If she uses it without being asked and finds it genuinely useful, you have a product. If she tolerates it politely, you have more work to do. Either way you find out fast and cheaply.

Build it. Ship it. Watch what happens.
