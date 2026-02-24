#!/bin/bash
# THREAD Backup Script — Cloudflare R2
# TODO: Add R2 credentials to run on VPS
# Required env vars:
#   R2_ENDPOINT=https://<account_id>.rclone cloudflarestorage.com
#   R2_ACCESS_KEY=<your-access-key>
#   R2_SECRET_KEY=<your-secret-key>
#   R2_BUCKET=thread-backups

set -e

DATE=$(date +%Y-%m-%d)
BACKUP_DIR=/tmp/thread-backup-$DATE

# Skip if R2 not configured
if [ -z "$R2_ENDPOINT" ] || [ -z "$R2_ACCESS_KEY" ]; then
  echo "⚠️ R2 not configured — skipping backup"
  echo "Set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET to enable"
  exit 0
fi

# Ensure rclone is installed
if ! command -v rclone &> /dev/null; then
  echo "Installing rclone..."
  curl https://rclone.org/install.sh | sudo bash
fi

mkdir -p $BACKUP_DIR

# Database backup (SQLite)
DB_PATH=${DB_PATH:-/home/deploy/outerfit/data/thread.db}
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/thread-$DATE.db"
  echo "✅ Database backed up"
fi

# Images backup
IMAGES_PATH=${IMAGES_PATH:-/home/deploy/outerfit/data/images}
if [ -d "$IMAGES_PATH" ]; then
  cp -r $IMAGES_PATH $BACKUP_DIR/images
  echo "✅ Images backed up"
fi

# Compress
tar -czf /tmp/thread-backup-$DATE.tar.gz -C /tmp thread-backup-$DATE
rm -rf $BACKUP_DIR

# Upload to R2
rclone copyto /tmp/thread-backup-$DATE.tar.gz r2:$R2_BUCKET/$DATE/thread-backup-$DATE.tar.gz

# Cleanup old local backups (keep last 3)
rm -f /tmp/thread-backup-*.tar.gz

echo "✅ Backup complete: thread-backup-$DATE.tar.gz → R2"
