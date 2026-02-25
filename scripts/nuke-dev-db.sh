#!/bin/bash
# Nuke the dev database and restart fresh.
# Does NOT reload images — use the GUI or load-dev-wardrobe.sh for that.

DB="data/thread.db"
IMAGES="data/images"

echo "⚠️  This will wipe all dev data."
read -p "Are you sure? (yes/no): " confirm
[[ "$confirm" != "yes" ]] && echo "Aborted." && exit 0

echo ""
echo "Stopping server..."
pm2 stop thread 2>/dev/null

echo "Nuking database..."
rm -f "$DB" "$DB-wal" "$DB-shm"

echo "Nuking stored images..."
rm -rf "$IMAGES"
mkdir -p "$IMAGES"

echo "Restarting server (migrations will run fresh)..."
pm2 start thread
sleep 3

echo ""
echo "✅ Fresh dev environment ready."
echo "   → Open https://localhost:3000 to start loading images via GUI"
