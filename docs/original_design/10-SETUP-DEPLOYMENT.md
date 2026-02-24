# 10 — Setup & Deployment

## Prerequisites

The setup script will check for and guide installation of these:

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime for both server and client |
| npm | 10+ | Package manager |
| Ollama | Latest | Local AI model runner |
| Git | Any | Installation |
| Docker | Optional | Only if using BullMQ queue |

---

## One-Command Setup

```bash
git clone https://github.com/yourname/thread-wardrobe
cd thread-wardrobe
npm run setup
```

The `setup.sh` script does the following:

```bash
#!/bin/bash
echo "🧵 Setting up THREAD..."

# Check Node.js
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
  echo "❌ Node.js 20+ required. Download from nodejs.org"
  exit 1
fi

# Check Ollama
if ! command -v ollama &> /dev/null; then
  echo "⚠️  Ollama not found. Installing..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install ollama || curl -fsSL https://ollama.ai/install.sh | sh
  else
    curl -fsSL https://ollama.ai/install.sh | sh
  fi
fi

# Pull default vision model
echo "📥 Pulling default AI model (this may take a few minutes)..."
ollama pull llava:7b

# Install npm dependencies
echo "📦 Installing dependencies..."
npm install

# Create data directories
mkdir -p data/images
mkdir -p server/ml/saved_model

# Copy .env template
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env file (edit to customize)"
fi

# Run database migrations
echo "🗄️  Setting up database..."
npm run db:migrate

# Create default users
npm run db:seed

echo ""
echo "✅ THREAD is ready!"
echo ""
echo "   Run: npm start"
echo "   Open: http://localhost:3000"
echo ""
echo "   Your phone: scan the QR code in Settings to connect"
```

---

## Starting the App

```bash
npm start
```

This runs both the Vite dev server (client) and Fastify (server) concurrently using `concurrently`.

In production mode:
```bash
npm run build    # Build the React app
npm run serve    # Serve built app via Fastify
```

---

## Environment Variables (.env)

```bash
# Server
PORT=3000
HOST=0.0.0.0      # Listen on all interfaces so phone can connect

# Database
DATABASE_PATH=./data/thread.db

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_VISION_MODEL=llava:7b
DEFAULT_TEXT_MODEL=llama3.2:3b

# Images
IMAGE_STORAGE_PATH=./data/images

# Security
JWT_SECRET=change-this-to-a-random-string
API_KEY_PREFIX=thread_sk_

# Features
ENABLE_WEBHOOKS=true
ENABLE_MULTI_USER=true

# Weather (free, no key needed)
WEATHER_API_BASE=https://api.open-meteo.com/v1

# Optional: Google Drive API key (fallback for Drive scraping)
GOOGLE_API_KEY=
```

---

## Available npm Scripts

```
npm start              Start everything in development mode
npm run build          Build frontend for production
npm run serve          Serve production build

npm run db:migrate     Run pending database migrations
npm run db:rollback    Roll back last migration
npm run db:seed        Seed sample data / create default users
npm run db:reset       Drop and recreate database (DESTRUCTIVE)

npm run setup          Run first-time setup script
npm run check:ollama   Verify Ollama is running and list models
npm run train          Force batch retrain preference model

npm run test           Run all tests
npm run test:api       Run API endpoint tests
npm run lint           Lint code
```

---

## Package.json Structure

```json
{
  "name": "thread-wardrobe",
  "version": "1.0.0",
  "scripts": {
    "start": "concurrently \"npm run server\" \"npm run client\"",
    "server": "node --watch server/index.js",
    "client": "cd client && vite --host",
    "build": "cd client && vite build",
    "serve": "node server/index.js --production",
    "setup": "bash setup.sh",
    "db:migrate": "node server/db/migrate.js",
    "db:seed": "node server/db/seed.js",
    "check:ollama": "node scripts/check-ollama.js"
  },
  "dependencies": {
    "fastify": "^4.26",
    "@fastify/cors": "^9.0",
    "@fastify/static": "^7.0",
    "@fastify/websocket": "^9.0",
    "better-sqlite3": "^9.4",
    "knex": "^3.1",
    "sharp": "^0.33",
    "node-fetch": "^3.3",
    "@tensorflow/tfjs-node": "^4.17",
    "bcrypt": "^5.1",
    "jsonwebtoken": "^9.0",
    "qrcode": "^1.5",
    "p-limit": "^5.0",
    "imghash": "^0.2",
    "cheerio": "^1.0",
    "dotenv": "^16.4"
  },
  "devDependencies": {
    "concurrently": "^8.2",
    "vite": "^5.2"
  }
}
```

---

## Running as a Service (Always On)

To have THREAD start automatically and always run in the background:

### Using PM2 (recommended)

```bash
npm install -g pm2

# Start app with PM2
pm2 start npm --name "thread" -- run serve

# Save config so it restarts on boot
pm2 save
pm2 startup    # Follow the instructions it prints

# Monitor
pm2 status
pm2 logs thread
```

### On Mac with launchd

A launchd plist is provided at `scripts/com.thread.wardrobe.plist`. Copy to `~/Library/LaunchAgents/` and load with `launchctl`.

---

## Updating

```bash
cd thread-wardrobe
git pull
npm install          # in case new dependencies
npm run db:migrate   # in case new migrations
pm2 restart thread   # if using PM2
```

---

## Multi-Machine Setup

If you want to run the server on a dedicated mini PC (like a Mac Mini or old laptop) and access from other computers and phones:

1. Run THREAD on the server machine with `npm run serve`
2. Set `HOST=0.0.0.0` in .env (already default)
3. Find server's local IP: `ipconfig getifaddr en0` (Mac) or `hostname -I` (Linux)
4. Access from any device on same WiFi: `http://SERVER_IP:3000`
5. Optionally install Tailscale for remote access

Recommended dedicated hardware: Any machine with 8GB+ RAM, 100GB+ storage. A $150 used mini PC works perfectly.

---

## Troubleshooting

**Ollama not responding:**
```bash
ollama serve    # start Ollama server
ollama list     # check installed models
```

**Camera/vision model too slow:**
→ Switch to `moondream2` in Settings → AI Model. Much faster on CPU-only machines.

**Can't connect from phone:**
→ Check phone and computer are on same WiFi
→ Check firewall: `sudo ufw allow 3000` (Linux) or System Preferences → Firewall (Mac)
→ Use the QR code in Settings for easy connection

**Database locked:**
```bash
# SQLite can lock if app crashed. Delete WAL files:
rm data/thread.db-wal data/thread.db-shm
```

**Google Drive downloads failing:**
→ Ensure the folder link has "Anyone with link can view" enabled
→ Try adding a Google API key in .env for more reliable access
