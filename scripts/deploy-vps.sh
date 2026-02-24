#!/bin/bash
# ============================================================================
# Deploy THREAD to VPS — run from your Mac
# Usage: bash scripts/deploy-vps.sh
#
# Requires: Tailscale connected, SSH access to VPS
# ============================================================================

set -euo pipefail

VPS_HOST="${VPS_HOST:-deploy@100.x.x.x}"  # Set your Tailscale IP!
APP_DIR="/opt/thread"

echo "🚀 Deploying THREAD to ${VPS_HOST}..."

# Push to GitHub first
echo "▸ Pushing to GitHub..."
git push origin HEAD

# Deploy on VPS
echo "▸ Deploying on VPS..."
ssh "$VPS_HOST" << REMOTE
  set -e
  export PATH="\$HOME/.local/share/fnm:\$PATH"
  eval "\$(fnm env)"

  cd ${APP_DIR}
  
  # Pull latest
  git fetch origin
  git checkout \$(git rev-parse --abbrev-ref HEAD)
  git pull origin \$(git rev-parse --abbrev-ref HEAD)
  
  # Install deps if package.json changed
  npm ci --production
  
  # Build client
  npm run build
  
  # Restart app (zero downtime with PM2)
  pm2 reload thread
  
  echo ""
  echo "✅ Deployed! Checking health..."
  sleep 2
  curl -s http://localhost:3000/health | jq .
REMOTE

echo ""
echo "✅ Deploy complete!"
