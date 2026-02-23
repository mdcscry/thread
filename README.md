# THREAD (outerfit)

AI-powered wardrobe stylist with neural network preference learning. Upload photos of your clothes, get AI analysis, generate outfits, train a personal style model.

## Features

- **📸 Photo Ingestion**: Upload via URL, local folder, Google Drive, or in-app camera
- **🤖 AI Vision Analysis**: Gemini 2.5 Flash (free tier) with Ollama GPU fallback — auto-detects category, colors, material, pattern, formality, seasons
- **🧠 Neural Network**: Lightweight TF.js model (2,300 params) learns your style from thumbs up/down feedback
- **👔 Outfit Generation**: Weather-aware, occasion-based, scored by EMA + NN blend
- **🎨 Color Harmony**: HSL color wheel scoring — complementary, analogous, triadic combinations
- **📱 Mobile PWA**: Install on phone, camera capture, push notifications, offline support
- **👥 Multi-Profile**: Multiple users with separate wardrobes

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React SPA (Vite)                                        │
│  Wardrobe │ Outfit Trainer │ Camera │ Settings            │
├─────────────────────────────────────────────────────────┤
│  Fastify API                                             │
│  ├── FeatureEngine (57-dim vectors)                      │
│  ├── TrainerService (TF.js neural network)               │
│  ├── GeminiVisionService → Ollama fallback               │
│  ├── OutfitEngine (generation + scoring)                 │
│  ├── PreferenceService (EMA scoring)                     │
│  └── @fastify/helmet + rate-limit + schema validation    │
├─────────────────────────────────────────────────────────┤
│  SQLite (sql.js) │ TF.js-node │ Sharp (image processing) │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, mobile-first PWA |
| Backend | Node.js + Fastify |
| Database | SQLite (sql.js) |
| Neural Network | TensorFlow.js (in-process, CPU) |
| Vision AI | Gemini 2.5 Flash (primary), Ollama (GPU fallback) |
| Image Processing | Sharp |
| Security | Helmet, rate limiting, JSON Schema validation |
| Testing | Playwright (E2E) + Node assert (64 unit tests) |

## Quick Start

```bash
# Install
npm install

# Set up environment
cp .env.example .env
# Edit .env: add GEMINI_API_KEY (free: https://aistudio.google.com/apikey)

# Development
npm run dev          # Starts server + client

# Tests
node tests/feature-engine.test.js    # 41 feature engineering tests
node tests/gemini-vision.test.js     # 20 unit + 3 live API tests
npx playwright test                   # E2E tests
```

## Environment Variables

```bash
# Required
GEMINI_API_KEY=           # Free at https://aistudio.google.com/apikey
JWT_SECRET=               # Any random string

# Optional
GEMINI_MODEL=gemini-2.5-flash
OLLAMA_BASE_URL=http://localhost:11434    # For GPU fallback
DATABASE_PATH=./data/thread.db
IMAGE_STORAGE_PATH=./data/images
```

## Neural Network

The Outfit Trainer learns personal style preferences through a lightweight neural network:

- **Input**: 57-dim feature vector (item attributes + context + outfit-level signals)
- **Architecture**: Dense(32) → Dropout(0.3) → Dense(16) → Dense(1)
- **Parameters**: ~2,300 (trains in <1 second on CPU)
- **Loss**: Huber (robust to noisy feedback)
- **Scoring**: EMA + NN blend, weighted by sample count + validation loss

### How It Learns

1. Generate outfits → user gives thumbs up/down per item
2. Feedback updates EMA scores immediately
3. After 50+ events, click "Train Model" → TF.js trains NN from all feedback
4. NN weight increases as validation loss improves (5% → 90%)
5. Future outfit generation uses blended EMA + NN scoring

### Feature Engineering

Color harmony, formality matching, category diversity, and peer EMA scores — hand-crafted features that encode fashion knowledge the NN can't learn from limited feedback.

See: [`docs/outfit-trainer-design.md`](docs/outfit-trainer-design.md) for full design.

## Vision Analysis

Provider cascade with graceful degradation:

1. **Gemini 2.5 Flash** (primary) — free tier: 1500 images/day, ~4-6s, structured JSON
2. **Ollama** (fallback) — local GPU: llava:7b, moondream. Fast with NVIDIA GPU.
3. **Fail gracefully** — item saved without AI analysis, flagged for review

Returns: category, hex colors, material, pattern, formality (1-10), seasons, temperature range, style tags, confidence score.

## Deployment

### VPS (recommended)

```bash
# Full setup: Node, Tailscale, Ollama GPU, Caddy SSL, PM2, firewall
scp scripts/vps-setup.sh root@VPS_IP:~
ssh root@VPS_IP 'THREAD_DOMAIN=outerfit.net bash vps-setup.sh'

# Deploy updates (from Mac, over Tailscale)
VPS_HOST=deploy@100.x.x.x bash scripts/deploy-vps.sh

# Pull DB backup
VPS_HOST=deploy@100.x.x.x bash scripts/backup-from-vps.sh
```

### Render

```bash
# One-click deploy via render.yaml blueprint
# Or: connect GitHub repo → auto-deploy on push
```

### Docker

```bash
docker build -t thread .
docker run -p 3000:3000 -v ./data:/app/data thread
```

## Categories

**Male (16):** T-Shirt, Button-Up, Knitwear, Hoodie, Jacket, Jeans, Pants, Shorts, Boots, Sneakers, Shoes, Sandals, Belt, Hat, Socks, Other

**Female (32):** All male + Blouse, Dress, Tank, Camisole, Skirts, Leggings, Heels, Flats, Scarf, Necklace, Earrings, Bracelet, Handbag

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/vps-setup.sh` | Full VPS provisioning (Ubuntu 22.04 + GPU) |
| `scripts/deploy-vps.sh` | Push-to-deploy over Tailscale |
| `scripts/deploy.sh` | Local deploy (QA → production) |
| `scripts/backup-from-vps.sh` | Pull SQLite backup to Mac |
| `scripts/seed-test-data.js` | Seed test wardrobe data |

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── pages/           # React pages (Wardrobe, OutfitTrainer, Camera, etc.)
│   │   └── App.jsx          # Router + nav
│   └── public/
│       ├── manifest.json    # PWA manifest
│       ├── sw.js            # Service worker (caching, push, offline)
│       └── offline.html     # Offline fallback
├── server/
│   ├── routes/              # API endpoints
│   ├── services/
│   │   ├── FeatureEngine.js       # 57-dim feature vectors
│   │   ├── TrainerService.js      # TF.js NN training + inference
│   │   ├── GeminiVisionService.js # Gemini Flash vision analysis
│   │   ├── OllamaService.js       # Ollama fallback + text generation
│   │   ├── OutfitEngine.js        # Outfit generation + scoring
│   │   └── PreferenceService.js   # EMA preference learning
│   ├── db/
│   │   ├── client.js        # SQLite connection + schema
│   │   └── migrations/      # Incremental schema changes
│   └── middleware/
│       └── auth.js          # API key authentication
├── tests/
│   ├── feature-engine.test.js  # 41 unit tests
│   ├── gemini-vision.test.js   # 23 unit tests (3 live API)
│   └── *.spec.js               # Playwright E2E tests
├── docs/
│   └── outfit-trainer-design.md # Full NN design document
├── scripts/                     # Deploy + ops scripts
├── render.yaml                  # Render blueprint
├── Dockerfile                   # Container build
└── .env                         # Environment config
```

## License

MIT
