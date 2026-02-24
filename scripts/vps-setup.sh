#!/bin/bash
# ============================================================================
# VPS Setup Script — THREAD + OpenClaw + Ollama + Tailscale + Caddy
# 
# Target: DatabaseMart GPU VPS — RTX Pro 4000 Ada (24GB VRAM)
#         24 CPU cores, 60GB RAM, 320GB SSD, Ubuntu 22.04 LTS
#         Order: 5148848963
#
# Run as root:
#   bash scripts/vps-setup.sh
#
# Or remote:
#   scp scripts/vps-setup.sh root@VPS_IP:~ && ssh root@VPS_IP bash vps-setup.sh
# ============================================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
THREAD_DOMAIN="${THREAD_DOMAIN:-outerfit.net}"
OPENCLAW_REPO="git@github.com:mdcscry/openclaw.git"
THREAD_REPO="git@github.com:mdcscry/thread.git"
APP_USER="deploy"
APP_DIR="/opt/thread"
OPENCLAW_DIR="/home/${APP_USER}/.openclaw"
DATA_DIR="/data"
BACKUP_DIR="/data/backups"

echo "╔══════════════════════════════════════════╗"
echo "║  VPS Setup: THREAD + OpenClaw + GPU      ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. System packages + NVIDIA check ───────────────────────────────────────
echo "▸ [1/10] System packages..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git build-essential sqlite3 \
  ca-certificates gnupg lsb-release \
  ufw fail2ban unattended-upgrades jq htop nvtop

# Verify GPU — DatabaseMart should pre-install NVIDIA drivers
echo "▸ Checking GPU..."
if command -v nvidia-smi &>/dev/null; then
  echo "  ✅ NVIDIA driver found:"
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
else
  echo "  ⚠️  No nvidia-smi found. Installing NVIDIA drivers..."
  apt-get install -y -qq nvidia-driver-535 nvidia-cuda-toolkit
  echo "  ⚠️  REBOOT REQUIRED after driver install. Run this script again after reboot."
  echo "  Run: reboot"
  exit 1
fi

# ── 2. Create deploy user ───────────────────────────────────────────────────
echo "▸ [2/9] Creating deploy user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  usermod -aG sudo "$APP_USER"
  echo "${APP_USER} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${APP_USER}
fi

# Create data directories
mkdir -p "$DATA_DIR" "$BACKUP_DIR" "${DATA_DIR}/models" "${DATA_DIR}/images"
chown -R "$APP_USER":"$APP_USER" "$DATA_DIR"

# ── 3. Node.js (via fnm) ────────────────────────────────────────────────────
echo "▸ [3/9] Node.js..."
su - "$APP_USER" -c '
  curl -fsSL https://fnm.vercel.app/install | bash
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install 22
  fnm default 22
  npm install -g pm2
'

# ── 4. Tailscale ────────────────────────────────────────────────────────────
echo "▸ [4/9] Tailscale..."
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
echo ""
echo "  ⚠️  Run 'sudo tailscale up' after this script to authenticate."
echo "  Then on your Mac: tailscale status → note the VPS IP (100.x.x.x)"
echo ""

# ── 5. Ollama (GPU) ─────────────────────────────────────────────────────────
echo "▸ [5/9] Ollama..."
if ! command -v ollama &>/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Pull models — RTX 4000 Ada has 24GB VRAM
# llava:7b (~4.7GB) + llama3.2:3b (~2GB) + moondream (~1.7GB) = ~8.4GB
# Plenty of headroom for larger models later
echo "  Pulling models (RTX 4000 Ada, 24GB VRAM)..."
su - "$APP_USER" -c '
  echo "=== Model pull started $(date) ===" > /tmp/ollama-pull.log
  ollama pull llava:7b >> /tmp/ollama-pull.log 2>&1 && echo "✅ llava:7b done" >> /tmp/ollama-pull.log &
  ollama pull llama3.2:3b >> /tmp/ollama-pull.log 2>&1 && echo "✅ llama3.2:3b done" >> /tmp/ollama-pull.log &
  ollama pull moondream >> /tmp/ollama-pull.log 2>&1 && echo "✅ moondream done" >> /tmp/ollama-pull.log &
  wait
  echo "=== All models pulled $(date) ===" >> /tmp/ollama-pull.log
  echo ""
  echo "  VRAM budget (24GB):"
  echo "    llava:7b      ~4.7GB  (vision — clothing analysis fallback)"
  echo "    llama3.2:3b   ~2.0GB  (text — outfit param extraction)"
  echo "    moondream     ~1.7GB  (fast vision — <1s per image!)"
  echo "    ─────────────────────"
  echo "    Total         ~8.4GB  (15.6GB free for bigger models later)"
  echo ""
  echo "  Optional upgrades:"
  echo "    ollama pull llava:13b      (~8GB, better quality)"
  echo "    ollama pull deepseek-r1:14b (~9GB, reasoning)"
  echo "    ollama pull phi4:14b       (~9GB, general)"
'
echo "  Check: tail -f /tmp/ollama-pull.log"

# ── 6. Caddy (reverse proxy + auto SSL) ─────────────────────────────────────
echo "▸ [6/9] Caddy..."
if ! command -v caddy &>/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# Caddy config
cat > /etc/caddy/Caddyfile << EOF
# THREAD — AI Wardrobe Stylist
${THREAD_DOMAIN} {
    reverse_proxy localhost:3000

    # Image uploads can be large
    request_body {
        max_size 100MB
    }

    # Cache static assets
    @static path *.js *.css *.png *.jpg *.jpeg *.webp *.svg *.woff2
    header @static Cache-Control "public, max-age=86400"

    # Security headers (supplement Helmet)
    header {
        X-Robots-Tag "noindex, nofollow"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    log {
        output file /var/log/caddy/thread.log
    }
}

# Ollama API — Tailscale only (not public!)
:11435 {
    @tailscale remote_ip 100.0.0.0/8
    reverse_proxy @tailscale localhost:11434
}
EOF

mkdir -p /var/log/caddy
systemctl restart caddy

# ── 7. Firewall + SSH hardening ──────────────────────────────────────────────
echo "▸ [7/10] Firewall + SSH..."

# SSH hardening
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart sshd
echo "  ⚠️  SSH password auth disabled. Make sure your SSH key is on this machine!"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp     # Caddy HTTP (redirects to HTTPS)
ufw allow 443/tcp    # Caddy HTTPS
ufw allow 41641/udp  # Tailscale
# Port 3000, 11434 NOT exposed — only via Caddy/Tailscale
ufw --force enable

# ── 8. THREAD app ───────────────────────────────────────────────────────────
echo "▸ [8/10] THREAD app..."
su - "$APP_USER" -c "
  export PATH=\"\$HOME/.local/share/fnm:\$PATH\"
  eval \"\$(fnm env)\"
  
  # Clone THREAD
  if [ ! -d '${APP_DIR}' ]; then
    git clone ${THREAD_REPO} ${APP_DIR}
  fi
  cd ${APP_DIR}
  git checkout feature/outfit-trainer-v2 2>/dev/null || git checkout main
  npm ci
  npm run build
  
  # Create .env
  cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

# Database — persistent data directory
DATABASE_PATH=${DATA_DIR}/thread.db
IMAGE_STORAGE_PATH=${DATA_DIR}/images

# Vision Analysis
GEMINI_API_KEY=\${GEMINI_API_KEY}
GEMINI_MODEL=gemini-2.5-flash

# Ollama — local GPU (fast on this machine!)
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_VISION_MODEL=llava:7b
DEFAULT_TEXT_MODEL=llama3.2:3b

# Security
JWT_SECRET=$(openssl rand -hex 32)
API_KEY_PREFIX=thread_sk_

# Weather
WEATHER_API_BASE=https://api.open-meteo.com/v1
ENVEOF

  echo '⚠️  Edit ${APP_DIR}/.env and set GEMINI_API_KEY!'
  
  # PM2 ecosystem
  cat > ecosystem.config.cjs << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'thread',
    script: 'server/index.js',
    cwd: '${APP_DIR}',
    env: {
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    max_memory_restart: '500M',
    error_file: '/data/logs/thread-error.log',
    out_file: '/data/logs/thread-out.log',
  }]
}
PM2EOF

  mkdir -p /data/logs
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER} | tail -1 | bash
"

# ── 9. OpenClaw ─────────────────────────────────────────────────────────────
echo "▸ [9/10] OpenClaw..."
su - "$APP_USER" -c "
  export PATH=\"\$HOME/.local/share/fnm:\$PATH\"
  eval \"\$(fnm env)\"
  
  # Install OpenClaw
  npm install -g openclaw
  
  # Clone your config repo
  if [ ! -d '${OPENCLAW_DIR}' ]; then
    git clone ${OPENCLAW_REPO} ${OPENCLAW_DIR}
  fi
  
  echo ''
  echo '⚠️  OpenClaw installed. To complete setup:'
  echo '  1. cd ~/.openclaw'
  echo '  2. Edit config.yaml with your API keys'
  echo '  3. openclaw gateway start'
  echo ''
"

# ── 10. Backup cron ────────────────────────────────────────────────────────
echo "▸ [10/10] Backup cron..."
cat > /etc/cron.d/thread-backup << 'CRONEOF'
# Nightly SQLite backup at 3 AM
0 3 * * * deploy sqlite3 /data/thread.db ".backup /data/backups/thread-$(date +\%Y\%m\%d).db" && find /data/backups -name "thread-*.db" -mtime +30 -delete
CRONEOF

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  TODO (manual steps):                                ║"
echo "║                                                      ║"
echo "║  1. sudo tailscale up                                ║"
echo "║     (authenticate with your Tailscale account)       ║"
echo "║                                                      ║"
echo "║  2. Point DNS: ${THREAD_DOMAIN} → VPS IP             ║"
echo "║     (A record to your VPS public IP)                 ║"
echo "║                                                      ║"
echo "║  3. Edit /opt/thread/.env                            ║"
echo "║     Set GEMINI_API_KEY                               ║"
echo "║                                                      ║"
echo "║  4. Edit ~/.openclaw/config.yaml                     ║"
echo "║     Set API keys, then: openclaw gateway start       ║"
echo "║                                                      ║"
echo "║  5. Copy SSH keys for GitHub:                        ║"
echo "║     ssh-keygen -t ed25519                            ║"
echo "║     → Add to github.com/settings/keys                ║"
echo "║                                                      ║"
echo "║  Services:                                           ║"
echo "║    THREAD:   https://${THREAD_DOMAIN}                ║"
echo "║    Ollama:   localhost:11434 (Tailscale: 100.x:11435)║"
echo "║    OpenClaw: openclaw status                         ║"
echo "║    PM2:      pm2 status / pm2 logs thread            ║"
echo "║    Caddy:    systemctl status caddy                  ║"
echo "║                                                      ║"
echo "║  Backups: /data/backups/ (nightly, 30-day retention) ║"
echo "║                                                      ║"
echo "║  GPU monitoring:                                     ║"
echo "║    nvidia-smi          (snapshot)                    ║"
echo "║    nvtop               (live, like htop for GPU)     ║"
echo "║    ollama ps           (loaded models + VRAM usage)  ║"
echo "║                                                      ║"
echo "║  Hardware: RTX Pro 4000 Ada (24GB VRAM)              ║"
echo "║           24 cores, 60GB RAM, 320GB SSD              ║"
echo "║           DatabaseMart Order: 5148848963             ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
