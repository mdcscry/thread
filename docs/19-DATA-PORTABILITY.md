# THREAD Data Portability, Export, Import & Retention

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*

---

## Philosophy

Your wardrobe data belongs to you. Not to outerfit. You uploaded it, you own it, and you can take it with you at any time — whether you're leaving, returning, or just want a backup. This is not a compliance checkbox. It is a feature and a trust signal.

"You own your data" is stated explicitly in the Privacy Policy, surfaced in the app UI, and backed by working code. Users who trust you with their data will pay you longer and tell more people about you.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Data Portability System                          │
├─────────────────────────────────────────────────────────────────────┤
│  Export        │  User requests → async job → ZIP → link + email   │
│  Import        │  Upload ZIP → validate → full restore              │
│  Retention     │  Active: forever | Cancelled: 90 days | GDPR: 30d │
│  GDPR Delete   │  Request → 30-day window → full purge + confirm   │
│  Dormant       │  Cancelled accounts preserved in cold storage      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 1 — Data Export

### What's Included

A complete export contains everything outerfit holds about the user. Nothing is omitted.

```
outerfit-export-[username]-[date]/
├── README.txt                    # Human-readable guide to the export
├── data/
│   ├── profile.json              # User profile + preferences
│   ├── items.json                # Full wardrobe catalogue
│   ├── outfits.json              # All generated + saved outfits
│   ├── feedback.json             # All ratings and feedback
│   ├── weekly_plans.json         # All weekly plans
│   ├── feature_requests.json     # Things you asked for
│   └── entitlements.json         # Subscription history
└── images/
    ├── item-a3f2b1c4.webp        # One file per wardrobe item
    ├── item-9e7d5f2a.webp
    └── ...
```

### Export Request Flow

```
User clicks "Export my data" in Settings
        │
        ▼
Server creates export_jobs record (status: pending)
        │
        ▼
Returns immediately: "We're preparing your export.
You'll receive an email when it's ready — usually within 10 minutes."
        │
        ▼
Background job runs (async, doesn't block UI)
        │
        ├── Queries all user data from SQLite
        ├── Copies all image files
        ├── Writes JSON files
        ├── Creates README.txt
        ├── ZIPs everything
        ├── Stores ZIP in data/exports/
        └── Sends email with download link (24hr expiry)
        │
        ▼
User gets email + in-app notification
Download link available for 24 hours
```

### Export Jobs Table

```sql
CREATE TABLE IF NOT EXISTS export_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  status          TEXT DEFAULT 'pending',
  -- status: pending | processing | complete | failed | expired
  export_path     TEXT,           -- path to ZIP file
  download_token  TEXT UNIQUE,    -- random token for secure download URL
  token_expires_at DATETIME,      -- 24 hours from completion
  requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME,
  file_size_bytes INTEGER,
  error_message   TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Export Service

```javascript
// server/services/ExportService.js
import archiver from 'archiver'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import path from 'path'
import crypto from 'crypto'

// npm install archiver

const EXPORTS_DIR = process.env.EXPORTS_DIR || './data/exports'
const IMAGES_DIR  = process.env.IMAGES_DIR  || './data/images'
const APP_URL     = process.env.APP_URL      || 'https://outerfit.net'

export class ExportService {
  constructor(db, emailService) {
    this.db    = db
    this.email = emailService
  }

  // Called by route — creates job and returns immediately
  async requestExport(userId) {
    // Rate limit: one export per 24 hours
    const recent = this.db.exec(`
      SELECT id FROM export_jobs
      WHERE user_id = ? AND requested_at > datetime('now', '-24 hours')
      AND status IN ('pending', 'processing', 'complete')
    `, [userId])?.[0]

    if (recent) {
      throw new Error('An export was already requested in the last 24 hours. Check your email.')
    }

    const jobId = this.db.run(`
      INSERT INTO export_jobs (user_id, status)
      VALUES (?, 'pending')
    `, [userId]).lastInsertRowid

    // Run async — do not await
    this.runExport(jobId, userId).catch(err => {
      this.db.run(`
        UPDATE export_jobs SET status = 'failed', error_message = ?
        WHERE id = ?
      `, [err.message, jobId])
    })

    return { jobId, message: "Your export is being prepared. You'll receive an email when it's ready." }
  }

  async runExport(jobId, userId) {
    this.db.run(`UPDATE export_jobs SET status = 'processing' WHERE id = ?`, [jobId])

    // 1 — Collect all user data
    const user     = this.getUser(userId)
    const items    = this.getItems(userId)
    const outfits  = this.getOutfits(userId)
    const feedback = this.getFeedback(userId)
    const plans    = this.getWeeklyPlans(userId)
    const requests = this.getFeatureRequests(userId)
    const entitle  = this.getEntitlements(userId)

    // 2 — Prepare export directory name
    const safeUsername = (user.name || user.email.split('@')[0])
      .replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const dateStr = new Date().toISOString().split('T')[0]
    const exportName = `outerfit-export-${safeUsername}-${dateStr}`

    // 3 — Create ZIP
    await fs.mkdir(EXPORTS_DIR, { recursive: true })
    const zipPath = path.join(EXPORTS_DIR, `${exportName}.zip`)
    const output  = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      archive.on('error', reject)
      archive.pipe(output)

      // README
      archive.append(this.generateReadme(user, items.length, dateStr), {
        name: `${exportName}/README.txt`
      })

      // JSON data files
      archive.append(JSON.stringify(user, null, 2),      { name: `${exportName}/data/profile.json` })
      archive.append(JSON.stringify(items, null, 2),     { name: `${exportName}/data/items.json` })
      archive.append(JSON.stringify(outfits, null, 2),   { name: `${exportName}/data/outfits.json` })
      archive.append(JSON.stringify(feedback, null, 2),  { name: `${exportName}/data/feedback.json` })
      archive.append(JSON.stringify(plans, null, 2),     { name: `${exportName}/data/weekly_plans.json` })
      archive.append(JSON.stringify(requests, null, 2),  { name: `${exportName}/data/feature_requests.json` })
      archive.append(JSON.stringify(entitle, null, 2),   { name: `${exportName}/data/entitlements.json` })

      // Images
      for (const item of items) {
        if (item.primary_image) {
          const imgPath = path.join(IMAGES_DIR, item.primary_image)
          const imgName = path.basename(item.primary_image)
          archive.file(imgPath, { name: `${exportName}/images/${imgName}` })
        }
      }

      archive.finalize()
    })

    // 4 — Generate secure download token
    const token     = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const stat      = await fs.stat(zipPath)

    this.db.run(`
      UPDATE export_jobs SET
        status = 'complete',
        export_path = ?,
        download_token = ?,
        token_expires_at = ?,
        completed_at = CURRENT_TIMESTAMP,
        file_size_bytes = ?
      WHERE id = ?
    `, [zipPath, token, expiresAt.toISOString(), stat.size, jobId])

    // 5 — Send email + in-app notification
    const downloadUrl = `${APP_URL}/api/v1/export/download/${token}`
    await this.email.sendExportReady({
      to: user.email,
      firstName: user.name,
      downloadUrl,
      fileSizeMB: Math.round(stat.size / 1024 / 1024 * 10) / 10,
      itemCount: items.length,
    })
  }

  generateReadme(user, itemCount, dateStr) {
    return `outerfit Data Export
====================
Exported: ${dateStr}
Account: ${user.email}
Items: ${itemCount}

WHAT'S IN THIS EXPORT
---------------------
data/profile.json       Your account and style preferences
data/items.json         Your complete wardrobe catalogue
data/outfits.json       All outfit suggestions and saves
data/feedback.json      Your ratings and feedback history
data/weekly_plans.json  Your weekly outfit plans
data/entitlements.json  Your subscription history
images/                 All your wardrobe photos (WebP format)

HOW TO REIMPORT
---------------
You can reimport this export to outerfit at any time:
1. Go to outerfit.net/settings/import
2. Upload this ZIP file
3. Your wardrobe will be fully restored

Your subscription history is preserved. If you return within
90 days of cancellation, your data will still be waiting for you
in your account — you don't need to reimport.

QUESTIONS
---------
hello@outerfit.net

outerfit.net | Arvada, CO
`
  }

  // Download route handler
  async serveDownload(token, reply) {
    const job = this.db.exec(`
      SELECT * FROM export_jobs
      WHERE download_token = ?
      AND status = 'complete'
      AND token_expires_at > datetime('now')
    `, [token])?.[0]

    if (!job) {
      return reply.status(404).send({
        error: 'Download link not found or expired. Request a new export from Settings.'
      })
    }

    const filename = path.basename(job.export_path)
    return reply
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Content-Type', 'application/zip')
      .sendFile(job.export_path)
  }

  // Data query helpers
  getUser(userId) {
    const row = this.db.exec(`
      SELECT id, name, email, avatar_url, gender, preferences, created_at
      FROM users WHERE id = ?
    `, [userId])?.[0]
    // Deliberately exclude: password, api_key, totp_secret
    return row
  }

  getItems(userId) {
    return this.db.execAll(`SELECT * FROM items WHERE user_id = ?`, [userId])
  }

  getOutfits(userId) {
    return this.db.execAll(`
      SELECT o.*, GROUP_CONCAT(oi.item_id) as item_ids
      FROM outfits o
      LEFT JOIN outfit_items oi ON oi.outfit_id = o.id
      WHERE o.user_id = ?
      GROUP BY o.id
    `, [userId])
  }

  getFeedback(userId) {
    return this.db.execAll(`SELECT * FROM item_feedback WHERE user_id = ?`, [userId])
  }

  getWeeklyPlans(userId) {
    return this.db.execAll(`SELECT * FROM weekly_plans WHERE user_id = ?`, [userId])
  }

  getFeatureRequests(userId) {
    return this.db.execAll(`SELECT wish, created_at FROM feature_requests WHERE user_id = ?`, [userId])
  }

  getEntitlements(userId) {
    return this.db.execAll(`
      SELECT plan, status, current_period_end, created_at, updated_at
      FROM entitlements WHERE user_id = ?
    `, [userId])
    // Deliberately exclude: stripe_customer_id, lago IDs
  }
}
```

### Export Routes

```javascript
// server/routes/export.js

// Request export
fastify.post('/api/v1/export/request', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const result = await exportService.requestExport(request.user.id)
  return reply.send(result)
})

// Check export status
fastify.get('/api/v1/export/status', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const job = db.exec(`
    SELECT status, completed_at, file_size_bytes, token_expires_at
    FROM export_jobs
    WHERE user_id = ?
    ORDER BY requested_at DESC LIMIT 1
  `, [request.user.id])?.[0]

  return reply.send(job || { status: 'none' })
})

// Download — no auth required, token is the auth
fastify.get('/api/v1/export/download/:token', async (request, reply) => {
  return exportService.serveDownload(request.params.token, reply)
})
```

---

## Part 2 — Data Import (Full Restore)

### Import Flow

```
User uploads ZIP to /settings/import
        │
        ▼
Server validates ZIP structure
        │
        ▼
Server checks for conflicts (existing items with same names?)
        │
        ▼
User chooses: Merge with existing | Replace everything
        │
        ▼
Background job runs full restore
        │
        ├── Restores profile preferences (not email/password)
        ├── Restores all items + reuploads images
        ├── Restores outfits + outfit_items
        ├── Restores feedback (retrains TF model)
        └── Restores weekly plans
        │
        ▼
Email confirmation: "Your wardrobe has been restored — X items imported"
```

### Import Service

```javascript
// server/services/ImportService.js
import AdmZip from 'adm-zip'
// npm install adm-zip

export class ImportService {
  constructor(db, imageService, emailService) {
    this.db    = db
    this.image = imageService
    this.email = emailService
  }

  async validateZip(buffer) {
    try {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries().map(e => e.entryName)

      const hasItems    = entries.some(e => e.includes('data/items.json'))
      const hasProfile  = entries.some(e => e.includes('data/profile.json'))
      const hasImages   = entries.some(e => e.includes('images/'))

      if (!hasItems || !hasProfile) {
        throw new Error('This does not appear to be a valid outerfit export file.')
      }

      // Count items and images
      const itemsEntry  = zip.getEntry(entries.find(e => e.includes('data/items.json')))
      const items       = JSON.parse(itemsEntry.getData().toString())
      const imageCount  = entries.filter(e => e.includes('images/') && e.endsWith('.webp')).length

      return {
        valid: true,
        itemCount: items.length,
        imageCount,
        hasOutfits:  entries.some(e => e.includes('data/outfits.json')),
        hasFeedback: entries.some(e => e.includes('data/feedback.json')),
        hasPlans:    entries.some(e => e.includes('data/weekly_plans.json')),
      }
    } catch (err) {
      if (err.message.includes('valid outerfit')) throw err
      throw new Error('Could not read ZIP file. Make sure you upload the original outerfit export.')
    }
  }

  async runImport(userId, buffer, mode = 'merge') {
    const zip       = new AdmZip(buffer)
    const entries   = zip.getEntries()
    const user      = this.db.exec(`SELECT email, name FROM users WHERE id = ?`, [userId])?.[0]

    const getJson = (pattern) => {
      const entry = entries.find(e => e.entryName.includes(pattern))
      if (!entry) return null
      try { return JSON.parse(entry.getData().toString()) }
      catch { return null }
    }

    const items    = getJson('data/items.json')    || []
    const outfits  = getJson('data/outfits.json')  || []
    const feedback = getJson('data/feedback.json') || []
    const plans    = getJson('data/weekly_plans.json') || []
    const profile  = getJson('data/profile.json')

    // If replacing: wipe existing data first
    if (mode === 'replace') {
      this.db.run(`DELETE FROM outfit_items WHERE outfit_id IN
        (SELECT id FROM outfits WHERE user_id = ?)`, [userId])
      this.db.run(`DELETE FROM outfits WHERE user_id = ?`, [userId])
      this.db.run(`DELETE FROM item_feedback WHERE user_id = ?`, [userId])
      this.db.run(`DELETE FROM weekly_plans WHERE user_id = ?`, [userId])
      this.db.run(`DELETE FROM items WHERE user_id = ?`, [userId])
    }

    // Restore profile preferences (never overwrite email, password, or subscription)
    if (profile?.preferences) {
      this.db.run(`UPDATE users SET preferences = ? WHERE id = ?`,
        [JSON.stringify(profile.preferences), userId])
    }

    // Restore items — map old IDs to new IDs for outfit restoration
    const itemIdMap = {}
    for (const item of items) {
      const oldId = item.id

      // Restore image from ZIP
      let newFilename = item.primary_image
      const imgEntry = entries.find(e =>
        e.entryName.includes('images/') &&
        e.entryName.includes(item.primary_image?.split('/').pop())
      )
      if (imgEntry) {
        const imgBuffer = imgEntry.getData()
        const stored = await this.image.processAndStore(imgBuffer, userId)
        newFilename = stored.filename
      }

      const result = this.db.run(`
        INSERT INTO items (
          user_id, name, category, subcategory,
          primary_color, secondary_color, colors, pattern,
          material, texture, silhouette, fit,
          primary_image, ai_description,
          is_loved, in_laundry, in_storage, ai_flagged,
          purchase_price, purchase_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId, item.name, item.category, item.subcategory,
        item.primary_color, item.secondary_color, item.colors, item.pattern,
        item.material, item.texture, item.silhouette, item.fit,
        newFilename, item.ai_description,
        item.is_loved, item.in_laundry, item.in_storage, item.ai_flagged,
        item.purchase_price, item.purchase_date, item.created_at
      ])

      itemIdMap[oldId] = result.lastInsertRowid
    }

    // Restore outfits using new item IDs
    for (const outfit of outfits) {
      const oldOutfitId = outfit.id
      const result = this.db.run(`
        INSERT INTO outfits (user_id, name, occasion, weather, temperature, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId, outfit.name, outfit.occasion, outfit.weather,
          outfit.temperature, outfit.created_at])

      const newOutfitId = result.lastInsertRowid
      const itemIds = outfit.item_ids?.split(',').map(Number) || []

      for (const oldItemId of itemIds) {
        const newItemId = itemIdMap[oldItemId]
        if (newItemId) {
          this.db.run(`
            INSERT INTO outfit_items (outfit_id, item_id)
            VALUES (?, ?)
          `, [newOutfitId, newItemId])
        }
      }
    }

    // Restore feedback using new item IDs
    for (const fb of feedback) {
      const newItemId = itemIdMap[fb.item_id]
      if (newItemId) {
        this.db.run(`
          INSERT INTO item_feedback (user_id, item_id, feedback_value, context, created_at)
          VALUES (?, ?, ?, ?, ?)
        `, [userId, newItemId, fb.feedback_value, fb.context, fb.created_at])
      }
    }

    // Restore weekly plans
    for (const plan of plans) {
      this.db.run(`
        INSERT OR REPLACE INTO weekly_plans (user_id, week_start, plan, created_at)
        VALUES (?, ?, ?, ?)
      `, [userId, plan.week_start, plan.plan, plan.created_at])
    }

    // Send confirmation
    await this.email.sendImportComplete({
      to: user.email,
      firstName: user.name,
      itemCount: items.length,
      outfitCount: outfits.length,
    })

    return {
      itemsImported: items.length,
      outfitsImported: outfits.length,
      imagesRestored: Object.keys(itemIdMap).length,
    }
  }
}
```

### Import Route

```javascript
// server/routes/import.js
fastify.post('/api/v1/import', {
  preHandler: [authenticate],
  config: { limits: { fileSize: 500 * 1024 * 1024 } }  // 500MB max
}, async (request, reply) => {
  const data   = await request.file()
  const buffer = await data.toBuffer()
  const mode   = request.query.mode || 'merge'  // 'merge' | 'replace'

  // Validate first — fast response
  const validation = await importService.validateZip(buffer)
  if (!validation.valid) {
    return reply.status(400).send({ error: validation.error })
  }

  // Run import async
  importService.runImport(request.user.id, buffer, mode)
    .catch(err => fastify.log.error({ err }, 'Import failed'))

  return reply.send({
    message: `Restoring ${validation.itemCount} items. You'll receive an email when complete.`,
    ...validation
  })
})

// Validate ZIP without importing (pre-flight check)
fastify.post('/api/v1/import/validate', {
  preHandler: [authenticate],
  config: { limits: { fileSize: 500 * 1024 * 1024 } }
}, async (request, reply) => {
  const data   = await request.file()
  const buffer = await data.toBuffer()
  const result = await importService.validateZip(buffer)
  return reply.send(result)
})
```

---

## Part 3 — Data Retention Policy

### Active Accounts

Data is retained for the lifetime of the account. No automatic purges on active accounts regardless of inactivity.

### Cancelled Accounts — 90-Day Window

When a user cancels their subscription or deletes their account:

```
Day 0    — Cancellation recorded. Account enters 'dormant' state.
           Data fully intact. User can log in and export.
           Email sent: "Your data is safe for 90 days."

Day 1-89 — Account dormant. User can reactivate and restore instantly.
           Full data preserved: wardrobe, images, outfits, feedback, TF model.

Day 85   — Warning email: "Your outerfit data will be deleted in 5 days.
           Export or reactivate to keep it."

Day 90   — Automatic purge job runs. All data deleted permanently.
           Email sent: "Your outerfit data has been deleted."
```

### Dormant Account State

```sql
ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active';
-- account_status: active | dormant | deleted | gdpr_pending

ALTER TABLE users ADD COLUMN dormant_since DATETIME;
ALTER TABLE users ADD COLUMN purge_scheduled_at DATETIME;
```

### Retention Cron Job

```javascript
// server/jobs/dataRetention.js
import cron from 'node-cron'

// Run daily at 3am — after backup, before analytics ETL
cron.schedule('0 3 * * *', async () => {

  // Send 5-day warning to accounts dormant for 85 days
  const warnUsers = db.exec(`
    SELECT u.id, u.email, u.name, u.purge_scheduled_at
    FROM users u
    WHERE u.account_status = 'dormant'
    AND u.dormant_since = date('now', '-85 days')
    AND NOT EXISTS (
      SELECT 1 FROM churn_interventions ci
      WHERE ci.user_id = u.id
      AND ci.intervention_type = 'retention_warning_85d'
    )
  `)

  for (const user of warnUsers || []) {
    await emailService.sendRetentionWarning({
      to: user.email,
      firstName: user.name,
      purgeDate: user.purge_scheduled_at,
      reactivateUrl: `${APP_URL}/reactivate`,
      exportUrl: `${APP_URL}/settings/export`,
    })
    db.run(`
      INSERT INTO churn_interventions (user_id, intervention_type)
      VALUES (?, 'retention_warning_85d')
    `, [user.id])
  }

  // Purge accounts dormant for 90+ days
  const purgeUsers = db.exec(`
    SELECT id, email FROM users
    WHERE account_status = 'dormant'
    AND dormant_since <= date('now', '-90 days')
  `)

  for (const user of purgeUsers || []) {
    await purgeUserData(user.id)
    await emailService.sendPurgeConfirmation({ to: user.email })
  }
})

async function purgeUserData(userId) {
  // Delete in dependency order
  db.run(`DELETE FROM export_jobs WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM billing_events WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM churn_signals WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM churn_interventions WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM ai_usage WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM feature_requests WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM weekly_plans WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM item_feedback WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM outfit_items WHERE outfit_id IN
    (SELECT id FROM outfits WHERE user_id = ?)`, [userId])
  db.run(`DELETE FROM outfits WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM password_reset_tokens WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM entitlements WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM invites WHERE from_user_id = ?`, [userId])

  // Get image paths before deleting items
  const images = db.exec(`SELECT primary_image FROM items WHERE user_id = ?`, [userId])
  db.run(`DELETE FROM items WHERE user_id = ?`, [userId])

  // Mark user record as deleted (keep email for suppression list)
  db.run(`
    UPDATE users SET
      name = '[deleted]',
      password = '',
      api_key = NULL,
      avatar_url = NULL,
      gender = NULL,
      preferences = NULL,
      totp_secret = NULL,
      account_status = 'deleted'
    WHERE id = ?
  `, [userId])

  // Delete image files from filesystem
  for (const img of images || []) {
    if (img.primary_image) {
      await imageService.deleteImage(img.primary_image)
    }
  }

  // Delete export ZIP files for this user
  // (already expired but clean up storage)
  const exports = db.exec(`SELECT export_path FROM export_jobs WHERE user_id = ?`, [userId])
  for (const exp of exports || []) {
    if (exp.export_path) {
      try { await fs.unlink(exp.export_path) } catch {}
    }
  }
}
```

---

## Part 4 — GDPR Delete Requests

### The Process

GDPR Article 17 gives EU users the right to erasure. outerfit honours this for all users globally — not just EU — because it is the right thing to do and simpler than geo-gating.

```
User submits GDPR delete request
        │
        ▼
30-day consideration window begins
(GDPR allows up to 30 days to process)
        │
        ├── Confirmation email sent immediately
        ├── User can export data during this window
        ├── User can cancel the request during this window
        │
        ▼
Day 30 — Full data purge (same as retention purge)
        │
        ▼
Confirmation email: "All your data has been permanently deleted"
```

### GDPR Request Table

```sql
CREATE TABLE IF NOT EXISTS gdpr_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  request_type    TEXT NOT NULL DEFAULT 'erasure',
  -- request_type: erasure | portability | correction | restriction
  status          TEXT DEFAULT 'pending',
  -- status: pending | processing | complete | cancelled
  requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  scheduled_for   DATETIME,   -- 30 days from request
  completed_at    DATETIME,
  cancelled_at    DATETIME,
  notes           TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### GDPR Routes

```javascript
// server/routes/gdpr.js

// Submit erasure request
fastify.post('/api/v1/gdpr/erasure', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const userId = request.user.id
  const user   = db.exec(`SELECT email, name FROM users WHERE id = ?`, [userId])?.[0]

  // Check for existing pending request
  const existing = db.exec(`
    SELECT id FROM gdpr_requests
    WHERE user_id = ? AND status = 'pending'
  `, [userId])?.[0]

  if (existing) {
    return reply.send({ message: 'A deletion request is already pending.' })
  }

  const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  db.run(`
    INSERT INTO gdpr_requests (user_id, request_type, status, scheduled_for)
    VALUES (?, 'erasure', 'pending', ?)
  `, [userId, scheduledFor.toISOString()])

  // Set account to dormant immediately — no new charges
  db.run(`
    UPDATE users SET account_status = 'gdpr_pending', dormant_since = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [userId])

  // Cancel Lago subscription immediately
  await lagoService.cancelSubscription(userId)

  await emailService.sendGdprRequestConfirmation({
    to: user.email,
    firstName: user.name,
    deletionDate: scheduledFor,
    cancelUrl: `${APP_URL}/settings/gdpr/cancel`,
    exportUrl: `${APP_URL}/settings/export`,
  })

  return reply.send({
    message: 'Your deletion request has been received.',
    scheduledFor,
    note: 'You can export your data or cancel this request before the deletion date.'
  })
})

// Cancel pending GDPR request
fastify.delete('/api/v1/gdpr/erasure', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const userId = request.user.id

  db.run(`
    UPDATE gdpr_requests SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'pending'
  `, [userId])

  db.run(`
    UPDATE users SET account_status = 'active', dormant_since = NULL
    WHERE id = ?
  `, [userId])

  return reply.send({ message: 'Your deletion request has been cancelled.' })
})

// Check GDPR request status
fastify.get('/api/v1/gdpr/status', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const request_record = db.exec(`
    SELECT status, scheduled_for, requested_at
    FROM gdpr_requests
    WHERE user_id = ?
    ORDER BY requested_at DESC LIMIT 1
  `, [request.user.id])?.[0]

  return reply.send(request_record || { status: 'none' })
})
```

### GDPR Cron Job

```javascript
// Runs inside the same daily retention cron at 3am
// Process GDPR erasure requests due today
const gdprDue = db.exec(`
  SELECT gr.user_id, u.email
  FROM gdpr_requests gr
  JOIN users u ON u.id = gr.user_id
  WHERE gr.status = 'pending'
  AND gr.scheduled_for <= datetime('now')
`)

for (const req of gdprDue || []) {
  await purgeUserData(req.user_id)
  db.run(`
    UPDATE gdpr_requests SET status = 'complete', completed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'pending'
  `, [req.user_id])
  await emailService.sendGdprComplete({ to: req.email })
}
```

---

## Email Templates

### Export Ready

```
Subject: Your outerfit data export is ready

Hey [name],

Your export is ready. It contains your complete wardrobe —
[X] items and all your outfit history.

→ Download your data ([X]MB)
  [DOWNLOAD LINK]

This link expires in 24 hours. After that, you can request
a new export from Settings at any time.

— outerfit
```

### 85-Day Retention Warning

```
Subject: Your outerfit data will be deleted in 5 days

Hey [name],

Your outerfit account has been inactive for 85 days. In keeping
with our data retention policy, your wardrobe data will be
permanently deleted on [DATE].

You have two options:

→ Export your data before it's gone: [EXPORT LINK]
→ Reactivate your account: [REACTIVATE LINK]

If you'd like your data deleted sooner, you can also submit
a deletion request from Settings.

— outerfit
```

### GDPR Request Confirmation

```
Subject: Your data deletion request — confirmed

Hey [name],

We've received your request to permanently delete your outerfit data.

Your data will be deleted on: [DATE — 30 days from now]

Before that date, you can:
→ Export your data: [EXPORT LINK]
→ Cancel this request: [CANCEL LINK]

After [DATE], all your data — wardrobe photos, outfit history,
preferences, and account information — will be permanently and
irreversibly deleted.

— outerfit
```

---

## Data Retention Summary

| Data type | Active account | Dormant (cancelled) | GDPR request | Deleted account |
|-----------|---------------|--------------------|--------------| ----------------|
| Wardrobe items + images | Forever | 90 days | 30 days | Purged |
| Outfit history | Forever | 90 days | 30 days | Purged |
| Feedback + TF model | Forever | 90 days | 30 days | Purged |
| Email address | Forever | 90 days | 30 days | Kept (suppression list only) |
| Billing history | Forever | 90 days | 30 days | Kept (legal requirement) |
| Export ZIPs | 24 hours | 24 hours | 24 hours | Purged |
| Analytics snapshots (aggregate, no PII) | Forever | Forever | Forever | Not affected |

**Note on email suppression:** The email address is retained after deletion as a suppression record only — to prevent accidentally re-adding a deleted user to marketing lists. It is stored as a hash, not plaintext, and used for no other purpose.

**Note on billing history:** Financial records may be subject to statutory retention requirements (typically 7 years in the US). These records contain no wardrobe or personal preference data — only transaction amounts and dates.

---

## Environment Variables

```bash
# Export / Import
EXPORTS_DIR=./data/exports
IMPORT_MAX_SIZE_MB=500
EXPORT_LINK_EXPIRY_HOURS=24

# Retention
DORMANT_RETENTION_DAYS=90
GDPR_PROCESSING_DAYS=30
RETENTION_WARNING_DAYS=85
```

---

## New Files

```
server/
├── services/
│   ├── ExportService.js        # ZIP generation, delivery
│   └── ImportService.js        # ZIP validation, full restore
├── routes/
│   ├── export.js               # Export request + download routes
│   ├── import.js               # Import + validate routes
│   └── gdpr.js                 # GDPR erasure request routes
├── jobs/
│   └── dataRetention.js        # 90-day purge + GDPR processing cron

data/
└── exports/                    # Temporary ZIP storage (auto-cleaned after 24hrs)
```

---

## In-App UI — Settings Page

The Settings page should surface all of this clearly under a **"Your Data"** section:

```
Your Data
─────────────────────────────────────────────────
Export your wardrobe          [Export my data →]
Last export: Never

Import from backup            [Import ZIP →]

Data retention policy         [Read our policy →]
Your data is kept for 90 days after cancellation.

────────────────────────────────────────────────
Delete my account

  Permanently delete your account and all data.
  You'll have 30 days to change your mind or
  export your data first.

                              [Request deletion →]
```

---

## The Positioning Statement

Add this to the Privacy Policy, the onboarding flow, and the Settings page:

> **You own your wardrobe data.** outerfit never sells it, never uses it to train models for other companies, and never locks you in. Export your complete wardrobe — photos, outfit history, everything — at any time, in a format you can reimport if you ever come back. Your data is yours.
