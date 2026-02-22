# THREAD Onboarding Flow Design

## 1. Questions to Ask a New User (Max 5)

| # | Question | Why It Matters | Input Type |
|---|----------|----------------|------------|
| 1 | **"What's your style in a few words?"** (e.g., casual, minimalist, bold) | Seeds the outfit engine | Multi-select chips or free text |
| 2 | **"What occasions do you dress for most?"** (work, weekends, dates, workouts) | Filters outfit suggestions | Multi-select chips |
| 3 | **"What climate do you live in?"** (hot, cold, mixed, varies) | Seasons wardrobe suggestions | Single-select |
| 4 | **"What colors do you gravitate toward?"** | Personal color prefs | Color picker + "no preference" |
| 5 | **"How do you like your fit?"** (tight, relaxed, varies by item) | Fit preference | Single-select or skip |

**UI:** Swipeable cards, one question per screen, "Skip" on each.

---

## 2. Data Model

New `user_preferences` table:

```sql
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  
  -- Q1: Style
  style_tags TEXT DEFAULT '[]',          -- ["casual", "minimalist"]
  
  -- Q2: Occasions
  primary_occasions TEXT DEFAULT '[]',  -- ["work", "weekends"]
  
  -- Q3: Climate
  climate TEXT DEFAULT 'mixed',          -- "hot" | "cold" | "mixed" | "seasonal"
  
  -- Q4: Color prefs
  preferred_colors TEXT DEFAULT '[]',     -- hex codes or names
  color_exclusions TEXT DEFAULT '[]',     -- colors to avoid
  
  -- Q5: Fit
  fit_preference TEXT DEFAULT 'relaxed', -- "tight" | "relaxed" | "varies"
  
  -- State
  onboarding_completed INTEGER DEFAULT 0,
  closet_intake_completed INTEGER DEFAULT 0,
  
  created_at INTEGER,
  updated_at INTEGER,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 3. "Tell Me About Your Closet" Flow

Conversational intake before photo uploads.

**Prompts user taps:**
- "My go-to work outfit"
- "Weekend look"
- "Something I wear on dates"
- "My comfiest clothes"
- "My nicest outfit"

**AI parses → creates clothing_items:**
- `category`: top, bottom, dress, outerwear, shoes, accessory
- `subcategory`: t-shirt, jeans, blazer, etc.
- `primary_color`: dominant color
- `formality`: 1-10 (infer from words: "nicest" → 8, "comfy" → 2)
- `season`: infer or default all
- `occasion`: from onboarding answers

---

## 4. First Outfit Suggestion

**Minimum: 5 items** (1 top + 1 bottom + 1 shoe + 2任意)

| Wardrobe State | What They See |
|----------------|---------------|
| 0 items | "Upload your first piece" + quick-add |
| 1-4 items | Progress: "Add X more to unlock outfits" |
| 5+ items | "Here's what you could wear" — 2-3 combos |

**Logic:** Simple rule-based matching (formality match, season match, no color clash). After 15+ items → AI-ranked.

---

## 5. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /onboarding/start` | POST | Initialize, create user_preferences |
| `POST /onboarding/preferences` | POST | Save Q1-5 answers |
| `GET /onboarding/status` | GET | Return completed flags + item counts |
| `POST /onboarding/closet-intake` | POST | Submit free-text, AI parses |
| `GET /onboarding/closet-intake/prompts` | GET | Return guided prompts |
| `POST /onboarding/complete` | POST | Mark done, trigger first outfit |

---

## Response Shapes

```typescript
// GET /onboarding/status
{
  "onboarding_completed": true,
  "closet_intake_completed": false,
  "clothing_items_count": 3,
  "ready_for_suggestions": false,
  "next_action": "complete_closet_intake" | "upload_photos"
}

// POST /onboarding/closet-intake
{
  "text": "I wear navy jeans and white tees to work",
  "parsed_items": [
    { "category": "bottom", "subcategory": "jeans", "primary_color": "navy", "formality": 5 },
    { "category": "top", "subcategory": "t-shirt", "primary_color": "white", "formality": 3 }
  ]
}
```
