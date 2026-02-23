# 👗 THREAD — Your Personal AI Wardrobe Stylist

A fully local wardrobe intelligence system. Your clothes. Your AI. Your machine. No cloud, no subscriptions, no data leaving your home.

---

## Why This Exists

Because getting dressed shouldn't require a subscription.

We built THREAD because we wanted something that actually works — no rotating ads, no "pro" tier, no your-data-is-our-product nonsense. Just a tool that knows what's in your closet and helps you figure out what to wear.

Your wardrobe stays on your machine. The AI runs locally via Ollama. Everything is SQLite. If you want out, your data is yours — it's just a folder you can delete.

---

## What It Does

- **Upload clothes** — Snap a photo or pick from your gallery. THREAD analyzes it and figures out what it is.
- **Browse your wardrobe** — Filter by category, color, season, occasion. Search. Find anything fast.
- **Edit what the AI gets wrong** — Click any item, correct the details. You're the authority on your own clothes.
- **Mark favorites and laundry** — Heart the pieces you love. Track what's in the wash.
- **Get outfit suggestions** — Tell THREAD what you're doing (work, date, casual) and what the weather's doing. It puts together something that works.
- **Plan trips** — Tell it where you're going and for how long. It figures out what to pack for maximum outfit variety with minimum baggage.
- **Control via API** — Webhooks and API keys let you integrate with Shortcuts, Home Assistant, or whatever you build.

---

## Quick Start

```bash
# Install dependencies
npm install && npm run build

# Fire it up (requires Ollama running with llava:7b and llama3.2:3b)
node server/index.js
```

Open **https://localhost:3000** in your browser.

**Login credentials:** `you@localhost` / `thread123`

On your phone (same WiFi): `https://YOUR-COMPUTER-IP:3000` — it works as a PWA.

---

## What the AI Does

THREAD uses two local models via Ollama:

1. **llava:7b** (vision) — Looks at your clothing photo and extracts:
   - Category (shirt, pants, jacket, shoes, etc.)
   - Primary color + full color palette
   - Pattern (solid, striped, plaid, floral)
   - Material (cotton, wool, leather, synthetic)
   - Formality (0–10 scale, "gym shorts" to "black tie")
   - Seasons it works for
   - Occasions it's appropriate for
   - A confidence score (so you know when to double-check)

2. **llama3.2:3b** (text) — Powers the chat interface. You talk to it naturally ("what should I wear to a wedding in Denver in November?") and it reasons about your wardrobe to suggest something that fits.

Everything runs on your machine. The models never call external APIs. Your photos never leave your network.

---

## Features

| Feature | What It Is |
|---|---|
| 📷 **Photo Upload** | Camera or file picker. Works on mobile. |
| 🧠 **Auto-Tagging** | AI extracts category, colors, pattern, material, formality, seasons, occasions |
| 🔍 **Wardrobe Browser** | Filter, search, sort. Find that one blue shirt fast. |
| ✏️ **Edit Anything** | Click any item to correct AI guesses |
| ❤️ **Favorites** | Heart items you reach for most |
| 🧺 **Laundry Tracker** | Mark items currently in the wash |
| 👔 **Outfit Suggestions** | Occasion + weather aware. Works. |
| ✈️ **Vacation Planner** | Optimize for variety, minimize luggage |
| 👤 **Profile** | Style preferences, sizes, what you like |
| ⚙️ **Settings** | API keys, webhooks, preferences |
| 🔒 **HTTPS (dev)** | mkcert for local HTTPS |

---

## API Overview

THREAD exposes a REST API for programmatic access. All endpoints require an API key passed via `X-API-Key` header.

### Authentication

```bash
# Include your API key in requests
curl -H "X-API-Key: your-api-key" https://localhost:3000/api/wardrobe
```

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/wardrobe` | List all clothing items |
| `POST` | `/api/wardrobe` | Add new item (multipart/form-data for image) |
| `GET` | `/api/wardrobe/:id` | Get single item details |
| `PATCH` | `/api/wardrobe/:id` | Update item (edit tags, name, etc.) |
| `DELETE` | `/api/wardrobe/:id` | Remove item |
| `POST` | `/api/outfits/generate` | Generate outfit suggestions |
| `GET` | `/api/outfits` | List saved outfits |
| `POST` | `/api/vacation` | Create packing list for trip |
| `GET` | `/api/profile` | Get user profile |
| `PATCH` | `/api/profile` | Update preferences |
| `GET` | `/api/webhooks` | List registered webhooks |
| `POST` | `/api/webhooks` | Register new webhook |

### Webhooks

Configure webhooks to get notified when:
- New item added to wardrobe
- Outfit generated
- Vacation plan created

Payloads are POSTed to your URL as JSON.

---

## Tech Stack

- **Backend:** Node.js + Fastify
- **Database:** SQLite via sql.js (file-based, no separate server)
- **Frontend:** React SPA, mobile-first PWA
- **AI:** Ollama — llava:7b (vision), llama3.2:3b (text)
- **Tests:** Playwright
- **HTTPS:** mkcert (local development)

---

## Requirements

- Node 20+
- Ollama running locally with `llava:7b` and `llama3.2:3b` pulled
- 8GB RAM minimum (16GB+ recommended)
- Any machine that runs Node — laptop, desktop, mini PC

---

## Contributing

This is a personal project that got out of hand (in a good way). If you want to contribute:

1. **Fork it** — Go for it.
2. **Pick a ticket** — Check the repo for open issues.
3. **Test your changes** — Run `npm test` before submitting.
4. **Be nice** — This is a chill project.

No CLA, no corporate process. Just make it better and share.

---

## Development Workflow

### Branches

| Branch | URL | Database | Purpose |
|--------|-----|----------|---------|
| `main` | https://localhost:3000 | `thread.db` | Production |
| `qa` | https://localhost:8080 | `thread-test.db` | Development & Testing |

### Setup

```bash
# Create test database (one-time)
cp data/thread.db data/thread-test.db

# Start test server (qa branch)
PORT=8080 DATABASE_PATH=$(pwd)/data/thread-test.db pm2 start "node server/index.js" --name thread-test

# Configure Playwright for test server
# (playwright.config.js already set to port 8080)
```

### Workflow

```bash
# 1. Switch to qa and pull latest
git checkout qa
git pull origin qa

# 2. Make changes, test locally
#    Run: npm run dev (client) in one terminal
#    Run: pm2 restart thread-test (server)

# 3. Run tests
npx playwright test

# 4. Commit to qa
git add -A
git commit -m "description of changes"
git push origin qa

# 5. When ready, merge to main for production
git checkout main
git merge qa
git push origin main

# 6. Rebuild and restart production
cd client && npm run build && pm2 restart thread
```

### Quick Commands

```bash
# Restart production server
pm2 restart thread

# Restart test server
pm2 restart thread-test

# View production logs
pm2 logs thread

# View test logs
pm2 logs thread-test
```

---

## License

MIT — use it, break it, fork it, extend it.
