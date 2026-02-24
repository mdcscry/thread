# 02 — Database Schema

## Overview

SQLite via `better-sqlite3`. All tables defined via Knex migrations so the schema evolves cleanly.

---

## Tables

### `users`
Supports multiple wardrobes (you + girlfriend + anyone else).

```sql
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  password    TEXT,                    -- bcrypt hash, optional
  api_key     TEXT UNIQUE,             -- for webhook/mobile auth
  avatar_url  TEXT,
  preferences JSON,                    -- UI preferences, units, etc.
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### `clothing_items`
Core table. One row per piece of clothing.

```sql
CREATE TABLE clothing_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id),
  
  -- Source
  source_url      TEXT,                -- original Google Drive URL
  image_path      TEXT NOT NULL,       -- local path: data/images/user_1/abc.jpg
  image_thumbnail TEXT,                -- path to 300px thumbnail
  
  -- Identity
  name            TEXT,                -- user-given name, e.g. "Blue linen shirt"
  category        TEXT,                -- top, bottom, dress, outerwear, shoes, accessory, bag, etc.
  subcategory     TEXT,                -- t-shirt, blazer, jeans, sneakers, etc.
  
  -- Visual attributes (AI + user editable)
  primary_color   TEXT,
  secondary_color TEXT,
  colors          JSON,                -- ["navy", "white", "gold"] full list
  pattern         TEXT,                -- solid, striped, floral, plaid, geometric, animal, etc.
  material        TEXT,                -- cotton, wool, silk, linen, polyester, denim, leather, etc.
  texture         TEXT,                -- smooth, ribbed, knit, woven, sheer, velvet, etc.
  
  -- Fit & Form
  silhouette      TEXT,                -- fitted, relaxed, oversized, structured, flowy, etc.
  length          TEXT,                -- crop, regular, midi, maxi, mini (for dresses/skirts/tops)
  fit             TEXT,                -- tight, slim, regular, relaxed, loose, oversized
  
  -- Occasion & Style
  style_tags      JSON,                -- ["casual", "office", "evening", "sporty", "boho"]
  occasion        JSON,                -- ["work", "dinner", "beach", "gym", "wedding"]
  formality       INTEGER,             -- 1 (gym) to 10 (black tie)
  
  -- Season & Weather
  season          JSON,                -- ["spring", "summer", "fall", "winter"]
  weight          TEXT,                -- lightweight, medium, heavyweight
  temp_min_f      INTEGER,             -- lowest comfortable temp in Fahrenheit
  temp_max_f      INTEGER,             -- highest comfortable temp
  waterproof      BOOLEAN DEFAULT 0,
  layering_role   TEXT,                -- base, mid, outer, standalone
  
  -- State
  ai_confidence   REAL,                -- 0-1, how confident the AI was
  ai_flagged      BOOLEAN DEFAULT 0,   -- AI wasn't sure, needs user review
  user_reviewed   BOOLEAN DEFAULT 0,   -- user has confirmed/edited
  is_loved        BOOLEAN DEFAULT 0,   -- user hearted this item
  is_active       BOOLEAN DEFAULT 1,   -- soft delete / retired items
  
  -- Stats
  times_worn      INTEGER DEFAULT 0,
  last_worn       DATETIME,
  
  -- AI raw output
  ai_raw_description TEXT,             -- full text from vision model
  ai_model_used   TEXT,                -- which Ollama model analyzed it
  
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_items_user ON clothing_items(user_id);
CREATE INDEX idx_items_category ON clothing_items(category);
CREATE INDEX idx_items_flagged ON clothing_items(ai_flagged, user_reviewed);
```

---

### `outfits`
Generated outfits — saved for history and feedback.

```sql
CREATE TABLE outfits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id),
  
  -- Composition (array of item IDs)
  item_ids        JSON NOT NULL,        -- [3, 17, 42, 89]
  
  -- Context it was generated for
  occasion        TEXT,
  event_name      TEXT,                 -- "Dinner at Rosso", "School pickup"
  event_date      DATE,
  time_of_day     TEXT,                 -- morning, afternoon, evening, night
  weather_summary JSON,                 -- {temp_f: 68, condition: "partly_cloudy", ...}
  location        TEXT,
  
  -- Style intent
  style_intent    JSON,                 -- {formality: 7, mood: "confident", fit: "relaxed"}
  chat_prompt     TEXT,                 -- the natural language prompt that generated it
  
  -- Scoring
  ml_score        REAL,                 -- 0-1 from preference model
  ml_model_version TEXT,
  
  -- Feedback
  feedback        INTEGER,              -- 1=loved, 0=neutral, -1=disliked
  feedback_note   TEXT,                 -- optional user comment
  was_worn        BOOLEAN DEFAULT 0,
  worn_date       DATE,
  
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_outfits_user ON outfits(user_id);
CREATE INDEX idx_outfits_feedback ON outfits(feedback);
CREATE INDEX idx_outfits_event_date ON outfits(event_date);
```

---

### `preference_events`
Fine-grained training signal for the ML model.

```sql
CREATE TABLE preference_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  outfit_id   INTEGER REFERENCES outfits(id),
  
  -- What happened
  event_type  TEXT,    -- 'thumbs_up', 'thumbs_down', 'worn', 'skipped', 'loved_item'
  
  -- Feature snapshot at time of event (for ML)
  features    JSON,    -- serialized feature vector used to train model
  
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### `ingestion_jobs`
Track download/analysis progress.

```sql
CREATE TABLE ingestion_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id),
  
  source_url      TEXT NOT NULL,
  source_type     TEXT,                 -- 'google_drive', 'local_folder', 'icloud'
  
  status          TEXT DEFAULT 'pending',  -- pending, running, completed, failed
  
  total_images    INTEGER DEFAULT 0,
  processed       INTEGER DEFAULT 0,
  failed          INTEGER DEFAULT 0,
  
  ai_model        TEXT,                 -- which Ollama model to use
  
  error_log       JSON,                 -- array of error messages
  started_at      DATETIME,
  completed_at    DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### `refinement_prompts`
When AI flags an item as uncertain, we queue a prompt to the user.

```sql
CREATE TABLE refinement_prompts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id),
  item_id       INTEGER REFERENCES clothing_items(id),
  
  question      TEXT NOT NULL,          -- "Is this cashmere or wool?"
  field_name    TEXT,                   -- which schema field is being clarified
  status        TEXT DEFAULT 'pending', -- pending, answered, dismissed
  
  answered_at   DATETIME,
  answer        TEXT,
  
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### `vacation_plans`
Saved vacation packing plans.

```sql
CREATE TABLE vacation_plans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id),
  
  name            TEXT NOT NULL,        -- "Paris Trip June"
  destination     TEXT,
  start_date      DATE,
  end_date        DATE,
  num_days        INTEGER,
  
  -- Constraints
  max_items       INTEGER,              -- hard limit on pieces to pack
  activities      JSON,                 -- ["beach", "dinner", "hiking", "casual"]
  climate         TEXT,                 -- hot, mild, cold, variable
  
  -- Result
  item_ids        JSON,                 -- packed items
  outfit_ids      JSON,                 -- generated outfit combinations
  
  -- Stats
  total_outfits   INTEGER,
  versatility_score REAL,              -- outfits per item
  
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### `api_keys`
For webhook/mobile automation.

```sql
CREATE TABLE api_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  key_hash    TEXT UNIQUE NOT NULL,     -- hashed key stored, raw shown once
  label       TEXT,                     -- "iPhone Shortcut", "Home Assistant"
  permissions JSON,                     -- ["read", "generate_outfit", "feedback"]
  last_used   DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Schema Evolution Notes

- All migrations in `server/db/migrations/`
- Run with `npm run db:migrate`
- Rollback with `npm run db:rollback`
- Seed sample data with `npm run db:seed`

---

## Clothing Category Reference

```
category          subcategories
─────────────     ─────────────────────────────────────────────
top               t-shirt, tank, blouse, shirt, sweater, hoodie, cardigan, crop-top, bodysuit
bottom            jeans, trousers, shorts, skirt, leggings, joggers
dress             mini-dress, midi-dress, maxi-dress, shirt-dress, wrap-dress, bodycon
outerwear         jacket, blazer, coat, puffer, trench, leather-jacket, vest
shoes             sneakers, heels, boots, sandals, loafers, flats, oxfords, mules, platforms
bag               tote, crossbody, clutch, backpack, shoulder-bag, bucket-bag
accessory         belt, scarf, hat, jewelry, sunglasses, hair-accessory, watch
activewear        sports-bra, athletic-shorts, leggings, track-jacket, swimwear
lingerie          bra, underwear, slip, lounge
```
