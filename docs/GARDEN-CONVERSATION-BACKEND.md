# Garden Conversation Service — Backend Architecture Design

**Document:** GARDEN-CONVERSATION-BACKEND.md  
**Author:** molti  
**Date:** February 26, 2026  
**Status:** Design — not yet implemented  

---

## Overview

The Garden Conversation Service sends a daily AI-generated garden dialogue email to subscribers. Each subscriber chooses:
- A **location** (city, state — e.g. "Gilbert, AZ")
- A **prose style** (author — e.g. "Carver", "Morrison", "Hemingway")

The system generates one prose piece per unique `(location, author)` combination per day, caches it, and emails all subscribers who share that combination. A subscriber in Gilbert who chose Carver gets the same email as another Gilbert/Carver subscriber — but a different email than the Gilbert/Morrison subscriber next door.

The system must scale from dozens to hundreds of thousands of subscribers without re-running inference for shared combinations.

---

## Core Design Principle: Combination-First, Subscriber-Second

The key insight is that **inference runs per (location, author) combination, not per subscriber**. 

If 10,000 people choose Boulder/Hemingway, inference runs once. The email engine loops through subscribers and delivers the pre-generated content.

This means:
- Inference cost is bounded by the number of unique combinations, not subscribers
- The generation pipeline and the delivery pipeline are fully decoupled
- A slow inference run never blocks email delivery

---

## Data Model

### Subscribers Table
```sql
subscribers (
  id              UUID PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  location_city   TEXT NOT NULL,        -- "Gilbert"
  location_state  TEXT NOT NULL,        -- "AZ"
  author_key      TEXT NOT NULL,        -- "carver"
  station_code    TEXT,                 -- "PSR" (resolved at signup)
  timezone        TEXT,                 -- "America/Phoenix"
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMP,
  confirmed_at    TIMESTAMP,            -- email confirmation
  unsubscribed_at TIMESTAMP
)
```

### Combinations Table
```sql
combinations (
  id              UUID PRIMARY KEY,
  station_code    TEXT NOT NULL,        -- "PSR"
  author_key      TEXT NOT NULL,        -- "carver"
  location_city   TEXT NOT NULL,        -- "Gilbert"
  location_state  TEXT NOT NULL,        -- "AZ"
  garden_context  TEXT,                 -- cached once, permanent
  garden_context_fetched_at TIMESTAMP,
  UNIQUE (station_code, author_key)
)
```

### Daily Runs Table
```sql
daily_runs (
  id              UUID PRIMARY KEY,
  combination_id  UUID REFERENCES combinations(id),
  run_date        DATE NOT NULL,
  status          TEXT,                 -- pending | generating | complete | failed
  prose_text      TEXT,                 -- final rendered prose
  prose_html      TEXT,                 -- HTML version for email
  topic           TEXT,
  quote           TEXT,
  author_name     TEXT,                 -- "Raymond Carver"
  weather_summary TEXT,
  characters      TEXT,                 -- JSON array of character names
  generated_at    TIMESTAMP,
  generation_ms   INTEGER,              -- how long inference took
  UNIQUE (combination_id, run_date)
)
```

### Deliveries Table
```sql
deliveries (
  id              UUID PRIMARY KEY,
  daily_run_id    UUID REFERENCES daily_runs(id),
  subscriber_id   UUID REFERENCES subscribers(id),
  status          TEXT,                 -- pending | sent | failed | bounced
  sent_at         TIMESTAMP,
  error           TEXT
)
```

### Author Requests Table
```sql
author_requests (
  id              UUID PRIMARY KEY,
  requested_by    UUID REFERENCES subscribers(id),
  author_name     TEXT NOT NULL,
  notes           TEXT,
  status          TEXT DEFAULT 'pending',  -- pending | approved | declined | live
  created_at      TIMESTAMP
)
```

---

## Daily Pipeline

### Phase 1: Planning (00:00 local time for each timezone)

```
1. Query all active subscribers
2. GROUP BY (station_code, author_key) → unique combinations needed today
3. For each combination:
   a. Check daily_runs for today → if complete, skip
   b. If missing → insert daily_runs row with status=pending
4. Emit: "N combinations to generate today"
```

### Phase 2: Generation (runs in parallel, bounded concurrency)

For each pending combination:

```
1. Resolve weather for station_code (NWS API)
   - Current conditions
   - 7-day forecast  
   - AFD (Area Forecast Discussion) → MiniMax summarize → Sonnet proof
   
2. Load garden_context from combinations table (permanent cache)
   - If missing: call Sonnet once, store permanently

3. Load archive history from daily_runs for this combination
   - Last 3 days of prose_text → character memory context

4. Run inference pipeline:
   a. Sonnet orchestrator → topic + quote (weather-aware)
   b. Random cast selection (3-5 characters)
   c. Bootstrap each character (haiku or sonnet per character config)
   d. Dialogue loop (N turns)
   e. Haiku → prose scene
   f. Sonnet → author style pass
   
5. Store result in daily_runs:
   - prose_text, prose_html, topic, quote, characters
   - status = complete
   
6. On failure: status = failed, error logged, retry once
```

### Phase 3: Delivery (after generation complete, or on rolling basis)

```
1. Query daily_runs WHERE status=complete AND run_date=today
2. For each complete run:
   a. Query subscribers for this combination_id
   b. For each subscriber:
      - Insert deliveries row (status=pending)
      - Send email via SMTP/SendGrid
      - Update status=sent or failed
3. Bounce handling → mark subscriber inactive after N failures
4. Unsubscribe links embedded in every email
```

---

## Generation Concurrency

At scale, thousands of combinations need to run daily. Two approaches:

### Option A: Sequential with rate limiting (current scale, <1000 combos)
- Single process, run combinations one at a time
- Each combination takes 3-6 minutes
- 100 combinations = ~8 hours — fine if started at midnight

### Option B: Worker pool (medium scale, 1000-50000 combos)
- N worker processes, each claiming a pending daily_run row
- Claim via `UPDATE daily_runs SET status='generating', worker_id=X WHERE status='pending' LIMIT 1`
- Optimistic locking prevents double-generation
- Workers can run on multiple machines

### Option C: Queue-based (100,000+ combos)
- Push each pending combination onto a job queue (Redis, SQS, etc.)
- Workers pull from queue, process independently
- Horizontal scaling — add workers as needed
- Dead letter queue for failures

**Recommendation:** Build Option A now, design schema to support B/C later. The `status` field and `worker_id` column on `daily_runs` enable both.

---

## Garden Context Cache

`garden_context` lives in the `combinations` table, not a file. Fetched once per `(station_code, author_key)` combination, never re-fetched unless manually invalidated.

This is the Sonnet-generated paragraph describing the local gardening conditions (zone, soil, climate, seasonal calendar, native plants). It's permanent because the geography doesn't change.

Invalidation: admin endpoint to clear `garden_context` and `garden_context_fetched_at` for a combination → re-fetches on next run.

---

## Archive / Character Memory

Character memory (past conversations) is stored in `daily_runs.prose_text` and queried by combination. The generation pipeline pulls the last 3 `daily_runs` rows for the same `combination_id` and injects them as context.

This means:
- Boulder/Hemingway subscribers share a continuous conversation history
- Gilbert/Carver subscribers have their own separate history
- A new combination starts fresh with no memory

---

## Author Management

Authors live in `authors.json` (current) → migrate to `authors` table:

```sql
authors (
  key         TEXT PRIMARY KEY,    -- "carver"
  name        TEXT NOT NULL,       -- "Raymond Carver"
  style_prompt TEXT NOT NULL,      -- the style description
  active      BOOLEAN DEFAULT true,
  added_at    TIMESTAMP
)
```

**Author Request Flow:**
1. Subscriber submits request via website form
2. Inserted into `author_requests`
3. Admin reviews → writes style prompt → sets status=approved
4. New author added to `authors` table → available for selection immediately
5. Requesting subscriber notified by email

---

## Weather Station Resolution

At signup:
1. User enters city + state
2. Backend geocodes via Nominatim (OpenStreetMap) → lat/lon
3. NWS points API → `gridId` (station_code) + observation station
4. Store `station_code` on subscriber and combination
5. Show user: "Your weather station: NWS Phoenix (PSR)"

Station codes are stable — no re-resolution needed unless user changes location.

---

## Email

**Current:** Gmail SMTP with app password — fine for hundreds  
**At scale:** SendGrid or Postmark

Email format per subscriber:
- Subject: `Garden Conversation — February 26, 2026` (+ author if not Hemingway)
- Header: date, location, characters, topic
- Body: prose scene
- Footer: quote, unsubscribe link, "change location/author" link

One SMTP/API call per subscriber. The prose HTML is pre-generated and reused.

---

## Delivery Timing

Subscribers get email at a consistent local time (e.g. 6:00 AM in their timezone). This means:

- Generation must complete before 6 AM in the earliest timezone served
- If a combination fails to generate → send a fallback (yesterday's prose, or a graceful skip)
- Timezone stored on subscriber at signup

---

## Tech Stack Recommendation

| Layer | Current | At Scale |
|-------|---------|----------|
| Database | SQLite | PostgreSQL |
| Job queue | None (sequential) | Redis + workers |
| Email | Gmail SMTP | SendGrid |
| Scheduler | OpenClaw cron | Cron + worker daemon |
| File storage | Flat files | DB rows |
| API | None | Fastify (already in outerfit) |

The Fastify server in outerfit is the natural home for the subscriber API (signup, confirm, unsubscribe, change preferences, author requests).

---

## Subscriber Signup Flow

```
1. User visits website
2. Enters: email, city/state, author preference
3. Backend:
   a. Geocode city/state → station_code
   b. Look up or create combination row
   c. Create subscriber row (unconfirmed)
   d. Send confirmation email
4. User clicks confirmation link
5. subscriber.confirmed_at set → active
6. Next day's generation run includes this combination
```

---

## Scale Math

| Subscribers | Unique Combos (est.) | Generation Time (3min/combo) | Workers Needed |
|-------------|---------------------|------------------------------|----------------|
| 1,000 | 200 | 10 hours | 3-4 |
| 10,000 | 1,500 | 75 hours | 20-25 |
| 100,000 | 8,000 | ~400 hours | 100+ (queue) |

At 100K subscribers, the queue-based approach (Option C) is required. Each worker handles one combination at a time. With 100 workers and 3-min average generation, 8,000 combos complete in ~4 hours. Starts at midnight, delivers by 4 AM.

Inference cost at scale is the primary constraint. Each combination costs ~$0.10-0.30 in API calls. 8,000 combos/day = ~$800-2,400/day. Subscription pricing needs to cover this.

---

## Open Questions (for business design doc)

1. Pricing model — free tier with Hemingway only? Premium for other authors?
2. How many locations does a subscriber get? One or multiple?
3. International expansion — NWS only covers USA. Non-US stations?
4. Can subscribers request specific characters to appear?
5. White-label / community garden organizations as bulk subscribers?

---

## Files / Paths (current prototype)

```
~/.openclaw/skills/garden-conversation/
  garden-daily-single-email.py   # v1 — production cron, Boulder only
  garden-daily-v2.py             # v2 — multi-location, multi-author
  authors.json                   # author style prompts
  garden-context-cache.json      # location context cache (file → DB later)

~/.openclaw/workspace-garden/memory/
  BOU/hemingway/                 # Boulder/Hemingway archive
  PSR/carver/                    # Gilbert/Carver archive
  PQR/oates/                     # Ridgefield/Oates archive
  persona-*.md                   # 12 character personas

~/.openclaw/workspace/memory/
  persona-*.md                   # canonical persona source
```

---

*This document describes the backend generation and delivery architecture. The business layer, pricing, and frontend design are covered in separate documents.*
