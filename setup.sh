#!/bin/bash
set -e

echo "🧵 Setting up THREAD..."

# Check Node.js
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
  echo "❌ Node.js 20+ required. Download from nodejs.org"
  exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check Ollama
if ! command -v ollama &> /dev/null; then
  echo "⚠️  Ollama not found. Installing..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install ollama || curl -fsSL https://ollama.ai/install.sh | sh
  else
    curl -fsSL https://ollama.ai/install.sh | sh
  fi
fi

if command -v ollama &> /dev/null; then
  echo "✅ Ollama detected"
else
  echo "⚠️  Ollama not installed - AI features will be disabled until you install it"
fi

# Install npm dependencies
echo "📦 Installing dependencies..."
npm install

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/images
mkdir -p server/ml/saved_model

# Copy .env template
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env file (edit to customize)"
fi

# Run database migrations
echo "🗄️  Setting up database..."
node server/db/migrate.js

# Create default users
echo "👤 Creating default users..."
node server/db/seed.js

echo ""
echo "✅ THREAD is ready!"
echo ""
echo "   Run: npm start"
echo "   Open: http://localhost:3000"
echo ""
echo "   Your phone: scan the QR code in Settings to connect"
