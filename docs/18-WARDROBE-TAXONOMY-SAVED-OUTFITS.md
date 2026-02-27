# THREAD Wardrobe Taxonomy & Saved Outfits

*Last Updated: 2026-02-25*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

This document covers two related and foundational product decisions:

1. **Wardrobe Taxonomy** — the category/subcategory structure that allows the AI to reason meaningfully about formality, occasion, layering, and coordination. Without subcategory, "Tops" is too broad for the AI to make good decisions.

2. **Saved Outfits as a First-Class Feature** — the distinction between AI-generated novel combinations and user-defined outfits that are known to work. Both are outfits. They serve different purposes and carry different training signal weight.

These two features together are what make outerfit actually work in practice for the way women — and people in general — actually relate to their clothes.

---

## The Two Outfit Types

This distinction is fundamental to the product:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Novel Combo                  │  Saved Outfit                       │
│                               │                                     │
│  AI builds something new      │  A known-good combination           │
│  from individual items        │  user defined or approved           │
│                               │                                     │
│  High creativity              │  Zero risk                          │
│  Variable quality             │  High confidence                    │
│  Needs training data          │  Perfect for planning               │
│                               │                                     │
│  "Here's something you've     │  "Here's something you already      │
│   never tried before"         │   know works"                       │
└─────────────────────────────────────────────────────────────────────┘
```

**The real-world insight:** Women often buy items as a pair — pants and a blouse, a skirt and a top — and always wear them together. That combination is not a novel combo. It is a saved outfit with a name. Treating it as raw items to be recombined by AI misses the point entirely.

**Beta strategy:** The beta tests the Novel Combo AI specifically. Can outerfit build good new combinations from individual items? That is the hard technical question. While beta answers that question, the Saved Outfit system is built in parallel — so when the product launches publicly, both modes work together.

---

## Beta Scope Declaration

```
Beta tests:     Novel Combo AI quality
                Narrow scope — testers are asked specifically:
                "Does outerfit suggest outfits you'd actually wear
                 that you wouldn't have put together yourself?"

Parallel build: Saved Outfits system (this document)
                Subcategory taxonomy
                Outfit builder UI
                Weekly plan mixing (saved + novel)
                Photo outfit import (Phase 2)
```

Testers during beta are explicitly told: "We're testing the AI's ability to create new outfit combinations. Saved outfits and the weekly planner are coming — we want to know if the novel suggestions work first."

This manages expectations and focuses feedback on the right question.

---

## Part 1 — Wardrobe Taxonomy

### The Problem with Flat Categories

"Tops" tells the AI almost nothing useful. A blazer and a crop top are both Tops. They are not interchangeable in any outfit context. The AI needs subcategory to reason about:

- **Formality stacking** — blazer over blouse = office. blazer over t-shirt = smart casual. blazer over bodysuit = evening.
- **Occasion matching** — chinos for casual Friday, dress trousers for meetings
- **Layering logic** — cardigans layer over almost anything, puffer jackets layer over nothing
- **Coordination rules** — heels with a midi skirt, sneakers with joggers

### Taxonomy

Gemini classifies items to subcategory level automatically on upload. The taxonomy is the classification target.

```
TOPS
├── T-shirt
├── Casual top / Tank
├── Blouse
├── Button-down / Shirt
├── Polo
├── Bodysuit
├── Crop top
├── Sweater / Knitwear
├── Hoodie / Sweatshirt
└── Vest top / Camisole

BOTTOMS
├── Jeans (casual)
├── Jeans (dark / smart)
├── Trousers / Dress pants
├── Chinos / Khakis
├── Shorts
├── Leggings
├── Joggers / Sweatpants
├── Skirt (mini)
├── Skirt (midi)
└── Skirt (maxi)

OUTERWEAR
├── Blazer / Sport coat
├── Cardigan
├── Jacket (casual / denim / leather)
├── Coat (smart / wool)
├── Puffer / Down jacket
├── Raincoat / Trench
└── Vest / Gilet

DRESSES & JUMPSUITS
├── Casual dress
├── Work / Smart dress
├── Cocktail / Evening dress
├── Maxi dress
├── Jumpsuit
└── Romper / Playsuit

FOOTWEAR
├── Sneakers (casual / lifestyle)
├── Sneakers (athletic / running)
├── Flats / Loafers
├── Heels (block)
├── Heels (stiletto / pointed)
├── Boots (ankle)
├── Boots (knee / tall)
├── Sandals (casual)
├── Sandals (dressy)
└── Mules / Slides

ACCESSORIES
├── Belt
├── Scarf
├── Hat / Cap
├── Sunglasses
├── Earrings
├── Necklace
├── Bracelet / Watch
└── Hair accessory

BAGS
├── Tote
├── Handbag / Purse
├── Crossbody
├── Backpack
├── Clutch
├── Belt bag / Fanny pack
└── Work bag / Briefcase

ACTIVEWEAR
├── Sports top / Bra
├── Leggings (athletic)
├── Shorts (athletic)
└── Hoodie / Zip-up (athletic)
```

### Schema Update

```sql
-- items table already has category and subcategory columns
-- Ensure subcategory is populated on all items

-- Formality score — derived from subcategory, used in outfit reasoning
-- 1 = very casual, 5 = formal
ALTER TABLE items ADD COLUMN formality_score INTEGER;

-- Seasonality — helps weekly planner avoid suggesting summer dresses in January
ALTER TABLE items ADD COLUMN seasonality TEXT;
-- seasonality: 'all_season' | 'spring_summer' | 'autumn_winter' | 'summer_only' | 'winter_only'
```

### Formality Map

The AI uses formality scores to ensure outfit coherence — items in the same outfit should be within 1-2 points of each other.

```javascript
const FORMALITY_MAP = {
  // Tops
  't_shirt':          1,
  'hoodie':           1,
  'casual_top':       1,
  'crop_top':         1,
  'polo':             2,
  'sweater':          2,
  'button_down':      3,
  'blouse':           3,
  'bodysuit':         3,
  'cardigan':         3,

  // Bottoms
  'joggers':          1,
  'leggings':         1,
  'shorts':           1,
  'jeans_casual':     1,
  'jeans_dark':       2,
  'chinos':           2,
  'skirt_mini':       2,
  'skirt_midi':       3,
  'skirt_maxi':       3,
  'trousers':         4,
  'dress_pants':      4,

  // Outerwear
  'puffer':           1,
  'denim_jacket':     1,
  'raincoat':         2,
  'cardigan':         2,
  'wool_coat':        3,
  'blazer':           4,
  'trench':           4,

  // Footwear
  'sneakers_athletic':1,
  'sneakers_casual':  2,
  'sandals_casual':   2,
  'boots_ankle':      3,
  'loafers_flats':    3,
  'mules':            3,
  'boots_tall':       3,
  'heels_block':      4,
  'sandals_dressy':   4,
  'heels_stiletto':   5,

  // Dresses
  'casual_dress':     2,
  'work_dress':       3,
  'cocktail_dress':   5,
  'evening_dress':    5,
  'jumpsuit':         3,
  'maxi_dress':       3,
}
```

### Gemini Classification Prompt Update

```javascript
const VISION_PROMPT = `
Analyze this clothing item and return ONLY valid JSON:

{
  "name": "descriptive name for the item",
  "category": one of [tops, bottoms, outerwear, dresses_jumpsuits, footwear, accessories, bags, activewear],
  "subcategory": one of the subcategories listed below,
  "primary_color": "main color name",
  "secondary_color": "secondary color if present, or null",
  "pattern": "solid | stripes | plaid | floral | animal_print | geometric | abstract | other | none",
  "material": "cotton | denim | wool | silk | synthetic | leather | linen | knit | other",
  "fit": "slim | regular | relaxed | oversized | fitted | flowy",
  "silhouette": description of overall shape,
  "formality_score": integer 1-5 based on the formality map,
  "seasonality": "all_season | spring_summer | autumn_winter | summer_only | winter_only",
  "ai_description": "2-3 sentence styling description"
}

Subcategory options by category:
Tops: t_shirt, casual_top, blouse, button_down, polo, bodysuit, crop_top, sweater, hoodie, vest_top
Bottoms: jeans_casual, jeans_dark, trousers, chinos, shorts, leggings, joggers, skirt_mini, skirt_midi, skirt_maxi
Outerwear: blazer, cardigan, jacket_casual, coat_smart, puffer, raincoat, vest_gilet
Dresses_jumpsuits: casual_dress, work_dress, cocktail_dress, maxi_dress, jumpsuit, romper
Footwear: sneakers_casual, sneakers_athletic, flats_loafers, heels_block, heels_stiletto, boots_ankle, boots_tall, sandals_casual, sandals_dressy, mules
Accessories: belt, scarf, hat, sunglasses, earrings, necklace, bracelet_watch, hair_accessory
Bags: tote, handbag, crossbody, backpack, clutch, belt_bag, work_bag
Activewear: sports_top, leggings_athletic, shorts_athletic, hoodie_athletic
`
```

---

## Part 2 — Saved Outfits as a First-Class Feature

### Schema Updates

```sql
-- Extend the existing outfits table
ALTER TABLE outfits ADD COLUMN source TEXT DEFAULT 'ai_generated';
-- source: 'ai_generated' | 'user_defined' | 'ai_edited' | 'photo_import'

ALTER TABLE outfits ADD COLUMN name TEXT;
-- User-defined outfits get names: "Monday work look", "First date", "Sunday errands"

ALTER TABLE outfits ADD COLUMN is_favourite INTEGER DEFAULT 0;
ALTER TABLE outfits ADD COLUMN times_worn INTEGER DEFAULT 0;
ALTER TABLE outfits ADD COLUMN last_worn_at DATETIME;
ALTER TABLE outfits ADD COLUMN season TEXT;
-- season: 'all' | 'spring' | 'summer' | 'autumn' | 'winter'

ALTER TABLE outfits ADD COLUMN cover_image TEXT;
-- Optional flat-lay or worn photo of the complete outfit

-- Outfit tags — for filtering and weekly plan matching
CREATE TABLE IF NOT EXISTS outfit_tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  outfit_id   INTEGER NOT NULL,
  tag         TEXT NOT NULL,
  -- common tags: work, casual, formal, date, weekend, travel, smart_casual
  FOREIGN KEY (outfit_id) REFERENCES outfits(id)
);
```

### Outfit Builder UI

Simple three-step flow. No AI involved — this is the user saying "I know this works."

```
Step 1 — Name your outfit
  ┌─────────────────────────────────────┐
  │  What's this outfit called?         │
  │  ┌───────────────────────────────┐  │
  │  │  Monday work look             │  │
  │  └───────────────────────────────┘  │
  │                                     │
  │  Occasion (optional)                │
  │  [Work] [Casual] [Date] [Formal]    │
  │  [Weekend] [Travel] [+Add]          │
  └─────────────────────────────────────┘

Step 2 — Pick your items
  ┌─────────────────────────────────────┐
  │  Add items from your wardrobe       │
  │                                     │
  │  Filter: [All] [Tops] [Bottoms]...  │
  │                                     │
  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐         │
  │  │  │ │  │ │✓ │ │  │ │  │  ...     │
  │  └──┘ └──┘ └──┘ └──┘ └──┘         │
  │                                     │
  │  Selected: Navy blazer, White       │
  │  blouse, Black trousers, Loafers   │
  └─────────────────────────────────────┘

Step 3 — Review and save
  ┌─────────────────────────────────────┐
  │  Monday work look                   │
  │                                     │
  │  [item] [item] [item] [item]        │
  │                                     │
  │  [Save outfit]                      │
  └─────────────────────────────────────┘
```

```jsx
// client/src/pages/OutfitBuilderPage.jsx
export function OutfitBuilderPage() {
  const [step, setStep]           = useState(1)
  const [name, setName]           = useState('')
  const [tags, setTags]           = useState([])
  const [selectedItems, setSelected] = useState([])

  const toggleItem = (item) => {
    setSelected(prev =>
      prev.find(i => i.id === item.id)
        ? prev.filter(i => i.id !== item.id)
        : [...prev, item]
    )
  }

  const save = async () => {
    await fetch('/api/v1/outfits', {
      method: 'POST',
      body: JSON.stringify({
        name,
        tags,
        item_ids: selectedItems.map(i => i.id),
        source: 'user_defined',
      })
    })

    track('outfit_user_defined', {
      item_count: selectedItems.length,
      tags,
    })

    navigate('/wardrobe/outfits')
  }

  // ... render steps
}
```

### My Outfits View

A browsable collection of all saved outfits — user-defined and AI-approved.

```
/wardrobe/outfits

Filter: [All] [Favourites] [Work] [Casual] [Date] [Not worn recently]
Sort:   [Most worn] [Recently added] [Last worn]

┌──────────┐ ┌──────────┐ ┌──────────┐
│ Monday   │ │ First    │ │ Sunday   │
│ work look│ │ date     │ │ errands  │
│          │ │          │ │          │
│ ♥ 12x   │ │ ♥ 3x    │ │ ♥ 8x    │
└──────────┘ └──────────┘ └──────────┘

┌──────────┐ ┌──────────┐
│ [AI] Apr │ │ + Create │
│ suggestion│ │ outfit   │
│ saved    │ │          │
│ ☆ 1x    │ │          │
└──────────┘ └──────────┘
```

### "Wear Today" from Saved Outfits

User can trigger a saved outfit directly — bypasses the AI entirely:

```javascript
fastify.post('/api/v1/outfits/:id/wear', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const { id } = request.params

  db.run(`
    UPDATE outfits SET
      times_worn = times_worn + 1,
      last_worn_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `, [id, request.user.id])

  // Record positive signal for all items in outfit
  const items = db.execAll(`
    SELECT item_id FROM outfit_items WHERE outfit_id = ?
  `, [id])

  for (const { item_id } of items) {
    db.run(`
      INSERT INTO item_feedback (user_id, item_id, feedback_value, context)
      VALUES (?, ?, 0.9, 'worn_from_saved_outfit')
    `, [request.user.id, item_id])
  }

  track('saved_outfit_worn', { outfit_id: id })
  return reply.send({ worn: true })
})
```

---

## Part 3 — Weekly Plan Mixing

The weekly planner (doc 06) currently builds 7 novel combos. With saved outfits, it can mix in known-good combinations — reducing AI load, improving confidence, and reflecting how people actually dress.

### Mixing Strategy

```javascript
// server/services/WeeklyPlannerService.js

async generateWeeklyPlan({ userId, latitude, longitude, occasionNotes = {} }) {
  const forecast    = await this.weather.getForecast({ latitude, longitude, days: 7 })
  const savedOutfits = await this.getSavedOutfits(userId)
  const plan        = []

  for (const day of forecast) {
    const occasion = occasionNotes[day.date] || 'everyday'

    // Decision: use saved outfit or generate novel combo?
    const savedMatch = this.findSavedOutfitMatch({
      savedOutfits,
      occasion,
      weather: day,
      alreadyUsed: plan.map(p => p.outfit_id),
    })

    if (savedMatch) {
      plan.push({
        date: day.date,
        weather: day,
        occasion,
        outfit: savedMatch,
        source: 'saved',
      })
    } else {
      // Generate novel combo via Gemini
      const novel = await this.generateNovelOutfit({ day, userId, occasion })
      plan.push({
        date: day.date,
        weather: day,
        occasion,
        outfit: novel,
        source: 'ai_generated',
      })
    }
  }

  await this.savePlan(userId, plan)
  return plan
}

findSavedOutfitMatch({ savedOutfits, occasion, weather, alreadyUsed }) {
  return savedOutfits.find(outfit => {
    // Not already in this week's plan
    if (alreadyUsed.includes(outfit.id)) return false

    // Occasion match
    if (outfit.tags?.length && !outfit.tags.includes(occasion)) return false

    // Season match — don't suggest winter coat in July
    if (!this.isSuitableForWeather(outfit, weather)) return false

    // Not worn in the last 7 days
    if (outfit.last_worn_at) {
      const daysSinceWorn = (Date.now() - new Date(outfit.last_worn_at)) / 86400000
      if (daysSinceWorn < 7) return false
    }

    return true
  })
}
```

### Weekly Plan UI — Showing Source

The weekly plan view should clearly distinguish saved outfits from novel combos — users should feel confident about the saved ones and curious about the new ones.

```
WEEK OF MARCH 2

MON  [Saved] Monday work look          ♥ 12x worn
TUE  [New ✨] Navy chinos + white...    ← AI suggestion
WED  [Saved] Smart casual Friday look  ♥ 8x worn
THU  [New ✨] Burgundy midi + ankle...  ← AI suggestion
FRI  [Saved] First date                ♥ 3x worn
SAT  [New ✨] Weekend casual combo      ← AI suggestion
SUN  [New ✨] Relaxed Sunday look       ← AI suggestion
```

---

## Part 4 — Photo Import (Phase 2)

The most powerful saved outfit capture — user photographs themselves wearing a complete outfit and outerfit identifies the items.

```
User photos themselves (or a flat lay)
        ↓
Gemini vision identifies individual items in the photo
        ↓
Matches identified items against existing wardrobe items
        ↓
"We found these items from your wardrobe in this photo:
 Navy blazer, White blouse, Black trousers, Loafers
 Is this right?" → User confirms/corrects
        ↓
Saved as user_defined outfit
```

This is Phase 2 because item matching from a full-outfit photo is harder than single-item analysis. The AI needs to isolate individual items within a complete look, then match each to the wardrobe database. Technically achievable with Gemini but requires careful prompt engineering and validation UX.

```javascript
// Phase 2 — sketch only, not for beta
async importOutfitFromPhoto(userId, photoBuffer) {
  const wardrobe = await this.getWardrobe(userId)

  const prompt = `
    This is a complete outfit. Identify each clothing item visible.
    For each item, find the best match from this wardrobe:
    ${JSON.stringify(wardrobe.map(i => ({ id: i.id, name: i.name,
      category: i.category, subcategory: i.subcategory,
      primary_color: i.primary_color })))}

    Return JSON:
    {
      "matched_items": [{ "item_id": int, "confidence": 0-1, "notes": string }],
      "unmatched_items": [{ "description": string, "category": string }]
    }
  `

  const result = await gemini.generateContent([prompt, photoBuffer])
  return JSON.parse(result.text)
}
```

---

## Training Signal Weight by Source

User-defined outfits carry stronger training signal than AI-generated ones because they represent deliberate, conscious choices.

| Source | Feedback weight | Rationale |
|--------|----------------|-----------|
| `ai_edited` (swapped items) | High | Explicit item-level preference |
| `user_defined` (outfit builder) | Very high | Deliberate conscious choice |
| `photo_import` | Very high | Actual worn outfit |
| `worn_from_saved` | High | Repeated positive signal |
| `ai_generated` + swipe right | Medium | Positive but passive |
| `ai_generated` + swipe left | Medium negative | Negative but unspecific |

```javascript
const SOURCE_WEIGHT = {
  'ai_edited':        0.9,
  'user_defined':     0.95,
  'photo_import':     0.95,
  'worn_from_saved':  0.9,
  'ai_accepted':      0.8,
  'ai_rejected':      0.15,
}
```

---

## New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/outfits | List all outfits (saved + AI) |
| POST | /api/v1/outfits | Create user-defined outfit |
| GET | /api/v1/outfits/:id | Get outfit detail |
| PATCH | /api/v1/outfits/:id | Update outfit (rename, retag) |
| DELETE | /api/v1/outfits/:id | Delete outfit |
| POST | /api/v1/outfits/:id/wear | Record as worn today |
| POST | /api/v1/outfits/:id/favourite | Toggle favourite |
| POST | /api/v1/outfits/import-photo | Photo outfit import (Phase 2) |

---

## New Files

```
client/src/
├── pages/
│   ├── OutfitBuilderPage.jsx    # Outfit builder (3-step)
│   └── MyOutfitsPage.jsx        # Saved outfits collection
└── components/
    ├── OutfitCard.jsx           # Card for outfit grid
    ├── OutfitBadge.jsx          # Saved / AI / New badge
    └── ItemPicker.jsx           # Wardrobe item grid selector

server/
└── services/
    └── WeeklyPlannerService.js  # Updated — mixing saved + novel
```

---

## Implementation Priority

### Beta (now)
```
□ Subcategory taxonomy in Gemini vision prompt
□ formality_score + seasonality on items table
□ outfits table schema extensions (source, name, tags etc.)
□ outfit_tags table
□ POST /api/v1/outfits (user_defined source)
□ GET /api/v1/outfits with source filter
□ POST /api/v1/outfits/:id/wear
□ Basic outfit builder UI (step 2 above)
□ My Outfits view
```

### v1.5 (parallel to beta, before public launch)
```
□ Weekly plan mixing (saved + novel)
□ Outfit source badge in weekly plan view
□ Favourite outfits
□ Outfit tagging
□ "Not worn recently" filter
□ Training signal weights by source
```

### v2 (post launch)
```
□ Photo outfit import
□ Gemini item matching from full-outfit photo
□ Match confirmation UI
```

---

## The Core Insight

outerfit is not just an outfit generator. It is a wardrobe intelligence system. The Novel Combo AI is the hardest and most impressive part — but it serves a user base that already has strong opinions about what works. Saved outfits honour those opinions and integrate them into the system rather than overriding them.

A woman who has spent years building a wardrobe and knows what goes together is not looking for an AI to tell her everything is wrong. She is looking for an AI that respects what she already knows, builds on it intelligently, and occasionally surprises her with something new.

Saved outfits are how outerfit respects what she already knows.
Novel combos are how outerfit surprises her.
The weekly plan is how both work together.
