#!/bin/bash
# ============================================================================
# Pull THREAD backup from VPS to local Mac — run from Mac
# Usage: bash scripts/backup-from-vps.sh
# ============================================================================

set -euo pipefail

VPS_HOST="${VPS_HOST:-deploy@100.x.x.x}"  # Set your Tailscale IP!
LOCAL_BACKUP_DIR="$HOME/backups/thread"
DATE=$(date +%Y%m%d)

mkdir -p "$LOCAL_BACKUP_DIR"

echo "📦 Backing up THREAD DB from VPS..."

# Create fresh backup on VPS
ssh "$VPS_HOST" "sqlite3 /data/thread.db '.backup /tmp/thread-backup.db'"

# Pull it
scp "$VPS_HOST:/tmp/thread-backup.db" "$LOCAL_BACKUP_DIR/thread-${DATE}.db"

# Cleanup remote temp
ssh "$VPS_HOST" "rm /tmp/thread-backup.db"

# Keep last 30 local backups
find "$LOCAL_BACKUP_DIR" -name "thread-*.db" -mtime +30 -delete

echo "✅ Saved: $LOCAL_BACKUP_DIR/thread-${DATE}.db"
echo "   Size: $(du -h "$LOCAL_BACKUP_DIR/thread-${DATE}.db" | cut -f1)"
ls -lh "$LOCAL_BACKUP_DIR" | tail -5
