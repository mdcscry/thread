#!/bin/bash
# THREAD Setup Script for GF - One Command Deploy
# Run: ./setup-gf.sh

set -e

echo "🧵 Setting up THREAD for you..."

# 1. Install PM2 if needed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# 2. Start server with PM2
cd ~/Documents/outerfit
echo "🚀 Starting THREAD server..."
pm2 stop thread 2>/dev/null || true
pm2 delete thread 2>/dev/null || true
pm2 start "node server/index.js" --name thread

# 3. Configure auto-restart
pm2 set thread autorestart: true
pm2 set thread watch: false
pm2 set thread max_restarts: 10

# 4. Save and enable auto-start on boot
pm2 save
echo "💾 Saving PM2 state..."

# 5. Set up Mac auto-start (requires password)
echo "🔐 Setting up auto-start on boot..."
sudo env PATH=$PATH:/usr/local/Cellar/node/25.6.1/bin \
    /usr/local/lib/node_modules/pm2/bin/pm2 startup launchd \
    -u matthewcryer --hp /Users/matthewcryer 2>/dev/null || true

# 6. Verify
sleep 2
curl -sk https://localhost:3000/health > /dev/null && echo "✅ THREAD is running at https://localhost:3000" || echo "❌ Server not responding"

echo ""
echo "📱 On your phone: https://10.0.0.190:3000"
echo "🛡️  Install the CA cert first: https://10.0.0.190:3000/ca.crt"
echo ""
echo "Done! Server will auto-restart if it crashes."
