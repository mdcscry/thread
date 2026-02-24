# THREAD Data Governance — Lifecycle, Ownership & Portability

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

This document defines how data moves through THREAD, who owns it, how long it lives, and what happens when it dies. It is not a privacy policy (that's the iubenda-generated legal document users see). This is the internal engineering and policy reference that ensures the privacy policy is actually true.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Data Classification                            │
├─────────────────────────────────────────────────────────────────────┤
│  User-Provided     │  Photos, profile, preferences, feedback        │
├─────────────────────────────────────────────────────────────────────┤
│  System-Derived    │  Garment attributes, outfit history, scores    │
├─────────────────────────────────────────────────────────────────────┤
│  Model Artifacts   │  TF weights, training checkpoints              │
├─────────────────────────────────────────────────────────────────────┤
│  Operational       │  Logs, analytics events, billing records       │
├─────────────────────────────────────────────────────────────────────┤
│  Aggregate         │  De-identified trends, category stats          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Lineage

Every piece of data in THREAD traces back to a user action. This map shows how data flows from input to storage to derivation to output, and identifies the third-party touchpoints.

```
┌──────────────┐
│  User Action │
└──────┬───────┘
       │
       ├──► Upload Photo ──► Local Filesystem (/data/images/{user_id}/)
       │                         │
       │                         ▼
       │                    Gemini 2.5 Flash (Google API)
       │                         │
       │                         │  Photo sent to Google servers
       │                         │  Google processes and returns JSON
       │                         │  Google retention: per API ToS (review DPA)
       │                         │
       │                         ▼
       │                    Structured Attributes ──► SQLite (items table)
       │                    ┌─────────────────────────────────┐
       │                    │ category, subcategory, colors,  │
       │                    │ pattern, material, texture,     │
       │                    │ silhouette, fit, ai_description │
       │                    └─────────────────────────────────┘
       │
       ├──► Submit Feedback (thumbs up/down) ──► SQLite (item_feedback table)
       │                                              │
       │                                              ▼
       │                                         TF Training Pipeline
       │                                              │
       │                                              ▼
       │                                         Model Weights (in-memory / VPS)
       │                                         ~2,300 params per user
       │
       ├──► Request Outfit ──► Gemini 2.5 Flash (Google API)
       │                         │
       │                         │  Sends: structured wardrobe, profile,
       │                         │         weather, occasion, model scores
       │                         │  Does NOT send: original photos
       │                         │
       │                         ▼
       │                    Outfit Suggestion ──► SQLite (outfits table)
       │
       ├──► Profile / Preferences ──► SQLite (users table, preferences JSON)
       │
       └──► App Usage ──► PostHog (analytics events)
                          │
                          │  Sent to PostHog Cloud (or self-hosted)
                          │  Contains: event name, plan, item counts,
                          │            page views, feature usage
                          │  Does NOT contain: photos, wardrobe content,
                          │                    garment descriptions
```

---

## Data Ownership Matrix

This is the definitive reference for who owns what. Every data element in the system falls into one of three categories.

| Data Element | Classification | Owner | Exportable | Deletable | Notes |
|---|---|---|---|---|---|
| Uploaded photos | User-Provided | User | ✅ Yes | ✅ Yes | Original files in /data/images/ |
| Account info (name, email) | User-Provided | User | ✅ Yes | ✅ Yes | |
| Password hash | User-Provided | User | ❌ No | ✅ Yes | Hashed — no value in export |
| Style preferences | User-Provided | User | ✅ Yes | ✅ Yes | JSON blob in users table |
| Feedback history | User-Provided | User | ✅ Yes | ✅ Yes | Append-only log (see below) |
| Garment attributes | System-Derived | User* | ✅ Yes | ✅ Yes | *Derived from user photos — user's data under GDPR Art. 20 |
| AI description text | System-Derived | User* | ✅ Yes | ✅ Yes | *Same rationale as attributes |
| Outfit history | System-Derived | User* | ✅ Yes | ✅ Yes | |
| Weekly plans | System-Derived | User* | ✅ Yes | ✅ Yes | |
| Preference scores | System-Derived | User* | ✅ Yes | ✅ Yes | Per-item scores from TF model |
| TF model weights | Model Artifact | THREAD | ❌ No | ✅ Destroyed | Our IP — trained on our architecture |
| Training pipeline code | Model Artifact | THREAD | ❌ No | N/A | Source code, not user data |
| Billing events log | Operational | THREAD | ❌ No | ✅ Anonymized | Retain anonymized for financial audit |
| PostHog events | Operational | THREAD | ❌ No | ✅ Yes | Delete user-linked events on account deletion |
| Sentry error logs | Operational | THREAD | ❌ No | ⚠️ Best effort | May contain user context; PII scrubbing configured |
| Aggregate style trends | Aggregate | THREAD | ❌ No | N/A | De-identified — no user link |
| Couple coordination data | System-Derived | Both users | ✅ Yes | ✅ Yes | Both users see shared outfits in export |

---

## Data Lifecycle by Type

### User Photos

```
Upload ──► Validate (file type, size) ──► Store locally (/data/images/{user_id}/{item_id}.jpg)
                                              │
                                              ├──► Send to Gemini API (one-time)
                                              │         │
                                              │         └──► Attributes stored in SQLite
                                              │              Photo NOT sent again for outfit generation
                                              │
                                              ├──► Backed up daily to R2 (full DB + images)
                                              │
                                              └──► On deletion: rm from filesystem, rm from DB,
                                                   backups expire via R2 lifecycle (90 days max)
```

**Gemini retention:** Google's Gemini API ToS state that data submitted via the paid API is not used for model training and is not retained beyond the processing window. Verify this claim is covered by the Data Processing Agreement (DPA) in the Google Cloud terms. Document the specific DPA clause reference here once confirmed.

**Critical:** Photos are sent to Gemini exactly once — at ingestion. Outfit generation uses the stored structured attributes, not the original photo. This means the Gemini API exposure is bounded and one-time per item.

### Feedback Data

```
User submits thumbs up/down ──► item_feedback table (append-only)
                                     │
                                     ├──► Fields: user_id, item_id, feedback_value,
                                     │            context (occasion, weather, outfit_id),
                                     │            created_at
                                     │
                                     ├──► NEVER updated, NEVER deleted (until account deletion)
                                     │    This is the append-only log. Corrections are new entries.
                                     │
                                     └──► Feeds TF training pipeline on demand
                                          Model retrained from full log each time
```

**Why append-only:** The feedback log is the most valuable data asset in the system. It is the raw material for the personal model, the source of truth for user taste, and the competitive moat. Append-only ensures:

- Corrupted or gamed feedback can be excluded without data loss
- Model can be retrained from any historical point
- Different model architectures can be tested against the same feedback history
- Full audit trail of what the model was trained on

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS feedback_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  item_id         INTEGER NOT NULL,
  feedback_value  FLOAT NOT NULL,        -- -1.0 to 1.0
  context_occasion TEXT,                  -- 'work', 'casual', 'formal', etc.
  context_weather  TEXT,                  -- 'sunny_75F', 'rainy_55F', etc.
  context_outfit_id INTEGER,             -- which outfit this feedback was about
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  excluded        BOOLEAN DEFAULT 0,     -- soft-exclude from training without deleting
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Index for training queries
CREATE INDEX idx_feedback_user_active ON feedback_log(user_id, excluded) WHERE excluded = 0;
```

**Note:** This replaces the existing `item_feedback` table. Migrate existing feedback rows into `feedback_log` with null context fields.

### TF Personal Model

```
Training triggered ──► Read feedback_log WHERE user_id = ? AND excluded = 0
                            │
                            ├──► Extract features from items table
                            │
                            ├──► Train NN (~2,300 params, <1s on RTX 4000 Ada)
                            │
                            └──► Model weights held in memory (per-user)
                                 NOT persisted to disk by default
                                 Retrained from log on server restart or on demand
```

**Ownership:** Model weights are THREAD's intellectual property. They are a derivative work of our training architecture, our feature extraction pipeline, and the aggregate patterns learned from structured wardrobe data. The user's feedback that trained the model is exportable (via feedback_log). The weights are not.

**On account deletion:** Model weights are destroyed (dropped from memory). Since they are not persisted to disk, this happens automatically on the next server restart even if explicit cleanup fails.

**Model recovery:** If a user reports degraded suggestions, the `excluded` flag on feedback_log entries allows bad feedback to be soft-excluded and the model retrained cleanly. No data is lost. This is the rollback mechanism.

### Billing Data

```
Lago webhook ──► billing_events table (raw JSON payload)
                     │
                     ├──► Contains: event type, Lago IDs, plan, timestamps
                     │    Does NOT contain: card numbers, CVV, bank details
                     │    (card data never touches THREAD — Stripe handles it)
                     │
                     └──► On account deletion: anonymize, do not delete
                          Replace user_id with hash, retain for financial audit
                          Required retention: 7 years (IRS) / check state requirements
```

### Analytics Events (PostHog)

```
Client/server event ──► PostHog Cloud
                            │
                            ├──► Contains: event name, plan tier, item/outfit counts,
                            │             page views, feature usage, timestamps
                            │
                            ├──► Does NOT contain: photos, garment descriptions,
                            │    wardrobe content, personal style data
                            │
                            └──► On account deletion: delete user profile in PostHog
                                 via PostHog API (DELETE /api/persons/)
                                 Historical events may persist in aggregate — acceptable
                                 if de-identified
```

---

## Deletion Protocol

When a user requests account deletion, the following operations execute as a single atomic transaction. If any step fails, the entire transaction rolls back and the deletion is retried or flagged for manual review.

### Step 1 — Log the Deletion Request

Before deleting anything, record the request. This table persists after deletion for compliance verification.

```sql
CREATE TABLE IF NOT EXISTS deletion_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  user_email_hash TEXT NOT NULL,           -- SHA-256 of email, for audit lookup
  requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME,
  backup_expiry   DATETIME,               -- requested_at + 90 days
  status          TEXT DEFAULT 'pending'   -- pending | completed | failed
);
```

### Step 2 — Atomic Database Deletion

```javascript
// server/routes/users.js
fastify.delete('/api/v1/users/:id', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const userId = request.user.id
  const userEmail = request.user.email

  // Log deletion request BEFORE deleting anything
  const emailHash = crypto.createHash('sha256').update(userEmail).digest('hex')
  const backupExpiry = new Date()
  backupExpiry.setDate(backupExpiry.getDate() + 90)

  db.run(`
    INSERT INTO deletion_log (user_id, user_email_hash, backup_expiry, status)
    VALUES (?, ?, ?, 'pending')
  `, [userId, emailHash, backupExpiry.toISOString()])

  // Atomic deletion — all or nothing
  try {
    db.run('BEGIN TRANSACTION')

    // Delete in foreign key dependency order
    db.run('DELETE FROM feedback_log WHERE user_id = ?', [userId])
    db.run('DELETE FROM billing_events WHERE user_id = ?', [userId])
    // OR: anonymize billing_events instead of deleting
    // db.run('UPDATE billing_events SET user_id = NULL, payload = NULL WHERE user_id = ?', [userId])
    db.run('DELETE FROM ai_usage WHERE user_id = ?', [userId])
    db.run('DELETE FROM outfit_items WHERE outfit_id IN (SELECT id FROM outfits WHERE user_id = ?)', [userId])
    db.run('DELETE FROM outfits WHERE user_id = ?', [userId])
    db.run('DELETE FROM weekly_plans WHERE user_id = ?', [userId])
    db.run('DELETE FROM entitlements WHERE user_id = ?', [userId])
    db.run('DELETE FROM feature_requests WHERE user_id = ?', [userId])
    db.run('DELETE FROM items WHERE user_id = ?', [userId])
    db.run('DELETE FROM users WHERE id = ?', [userId])

    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    db.run(`UPDATE deletion_log SET status = 'failed' WHERE user_id = ?`, [userId])
    fastify.log.error({ err, userId }, 'Account deletion failed — rolled back')
    return reply.status(500).send({ error: 'Deletion failed. Our team has been notified.' })
  }

  // Step 3 — Non-transactional cleanup (best-effort)
  try {
    await deleteUserImages(userId)              // rm /data/images/{userId}/
    await lagoService.cancelSubscription(userId) // Cancel in Lago
    await posthog.deleteUser(userId)             // Delete PostHog profile
    // TF model weights: dropped from memory automatically (not persisted)
  } catch (err) {
    // Log but don't fail — DB deletion already committed
    fastify.log.warn({ err, userId }, 'Post-deletion cleanup partial failure')
  }

  db.run(`UPDATE deletion_log SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [userId])

  return reply.send({ deleted: true })
})
```

### Step 3 — Backup Expiry Verification

Backups containing deleted user data expire naturally via R2 lifecycle rules. The `deletion_log.backup_expiry` field tracks when all backup copies should be gone.

```javascript
// scripts/verify-deletion-compliance.js — run monthly via cron
// Checks that all deletion requests with backup_expiry < now have no remaining backups

const expired = db.exec(`
  SELECT * FROM deletion_log
  WHERE status = 'completed' AND backup_expiry < CURRENT_TIMESTAMP
`)

for (const entry of expired) {
  // Verify R2 has no backups older than the deletion date
  // Log compliance confirmation or flag exceptions
}
```

**Cron:**
```bash
# Monthly deletion compliance check — 1st of each month at 4am
0 4 1 * * node /home/deploy/outerfit/scripts/verify-deletion-compliance.js >> /var/log/thread-compliance.log 2>&1
```

---

## Data Export Format

When a user requests their data (GDPR Article 20 / CCPA), they receive a single JSON file containing everything classified as exportable in the ownership matrix above.

### Export Endpoint

```javascript
fastify.get('/api/v1/users/:id/export', {
  preHandler: [authenticate]
}, async (request, reply) => {
  const userId = request.user.id

  const user = db.exec('SELECT name, email, gender, preferences, created_at FROM users WHERE id = ?', [userId])
  const items = db.exec(`
    SELECT name, category, subcategory, primary_color, secondary_color, colors,
           pattern, material, texture, silhouette, fit, ai_description,
           is_loved, in_laundry, in_storage, created_at
    FROM items WHERE user_id = ?
  `, [userId])
  const outfits = db.exec('SELECT * FROM outfits WHERE user_id = ?', [userId])
  const outfitItems = db.exec(`
    SELECT oi.* FROM outfit_items oi
    JOIN outfits o ON o.id = oi.outfit_id
    WHERE o.user_id = ?
  `, [userId])
  const feedback = db.exec('SELECT * FROM feedback_log WHERE user_id = ?', [userId])
  const weeklyPlans = db.exec('SELECT * FROM weekly_plans WHERE user_id = ?', [userId])

  const exportData = {
    export_version: '1.0',
    exported_at: new Date().toISOString(),
    exported_from: 'outerfit.net',
    account: user[0] || null,
    wardrobe: {
      items: items,
      note: 'Garment attributes were generated by AI analysis of your uploaded photos.'
    },
    outfits: {
      history: outfits,
      items: outfitItems
    },
    feedback: {
      entries: feedback,
      note: 'Your feedback history. This data trained your personal style model.'
    },
    weekly_plans: weeklyPlans,
    photos: {
      note: 'Photos are included as separate files in the export archive.',
      format: 'JPEG/PNG originals as uploaded'
    }
  }

  // For JSON-only export:
  return reply
    .header('Content-Disposition', `attachment; filename="outerfit-export-${userId}.json"`)
    .send(exportData)

  // TODO: For full archive with photos, generate a ZIP:
  // Include JSON + /data/images/{userId}/* in a .zip archive
})
```

### What's Included vs. What's Not

```
INCLUDED IN EXPORT:                          NOT INCLUDED (THREAD IP):
─────────────────────                        ────────────────────────
✅ Account info (name, email, prefs)         ❌ TF model weights
✅ All uploaded photos (original files)      ❌ Training pipeline code
✅ Garment attributes + AI descriptions      ❌ Feature extraction logic
✅ Outfit history + weekly plans             ❌ Aggregate trend data
✅ Full feedback log with context            ❌ Billing event payloads
✅ Preference scores per item                ❌ Internal analytics
✅ Couple shared outfit data (both users)    ❌ Sentry error logs
```

---

## Third-Party Data Processors

Every external service that touches user data is documented here with its data handling terms.

| Service | What It Receives | Retention | DPA in Place | Notes |
|---------|-----------------|-----------|--------------|-------|
| Google Gemini API | Photos (one-time per item), structured wardrobe + context (per outfit request) | Not retained beyond processing (paid API) | ⬜ Verify Google Cloud DPA covers Gemini API | Critical: confirm no training on user data |
| Stripe | Card details (never touches THREAD) | Per Stripe ToS | ✅ Stripe DPA is standard | THREAD is SAQ-A — no card data stored |
| Lago | Customer ID, plan, subscription state | Per Lago ToS | ⬜ Review Lago Cloud DPA | No PII beyond email passed to Lago |
| PostHog | Event data: actions, plan tier, counts | Configurable retention | ⬜ Configure PostHog data retention | No photos, wardrobe content, or style data sent |
| Sentry | Error context: may include request data | 90 days default | ⬜ Configure PII scrubbing | Enable Sentry PII scrubbing before launch |
| Cloudflare | DNS, CDN, email routing | Transient | ✅ Cloudflare DPA standard | No user content processed beyond routing |
| Resend | Email addresses, names | Per Resend ToS | ⬜ Review Resend DPA | Transactional email only |
| Cloudflare R2 | Encrypted backups (DB + images) | 90 days (lifecycle rule) | ✅ Same as Cloudflare | Backups at rest — set lifecycle rule before launch |

**Action items:**
- ⬜ Verify Google Cloud DPA explicitly covers Gemini API data processing
- ⬜ Review Lago Cloud DPA for EU user data handling
- ⬜ Configure PostHog data retention to 12 months
- ⬜ Enable Sentry PII scrubbing (strip request bodies, user context)
- ⬜ Set R2 lifecycle rule: auto-delete objects older than 90 days
- ⬜ Review Resend DPA

---

## Couple Data Handling

The couple tier introduces shared data between two user accounts. This requires special handling for both export and deletion.

### Data Model

```sql
-- Couple relationship as a first-class entity
CREATE TABLE IF NOT EXISTS couples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a_id       INTEGER NOT NULL,
  user_b_id       INTEGER NOT NULL,
  status          TEXT DEFAULT 'active',    -- active | dissolved
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  dissolved_at    DATETIME,
  FOREIGN KEY (user_a_id) REFERENCES users(id),
  FOREIGN KEY (user_b_id) REFERENCES users(id),
  UNIQUE(user_a_id, user_b_id)
);

-- Coordinated outfit suggestions reference both wardrobes
CREATE TABLE IF NOT EXISTS couple_outfits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  couple_id       INTEGER NOT NULL,
  occasion        TEXT,
  weather         TEXT,
  user_a_outfit   TEXT NOT NULL,            -- JSON: selected items for user A
  user_b_outfit   TEXT NOT NULL,            -- JSON: selected items for user B
  coordination_note TEXT,                   -- AI reasoning for why these work together
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (couple_id) REFERENCES couples(id)
);
```

### Deletion Rules for Couples

- **User A deletes account:** User A's personal data is fully deleted. Couple relationship is dissolved. Couple outfit history is retained for User B but User A's items are anonymized (replaced with "Partner's [category]" placeholder text). User B's export includes the couple outfit history with anonymized partner data.
- **Both users delete:** All couple data is fully deleted.
- **Couple dissolved (breakup) without account deletion:** Couple outfits are archived. Both users retain their personal wardrobe data. Coordinated suggestions stop. Neither user sees the other's wardrobe after dissolution.

---

## Aggregate Data Policy

THREAD may generate aggregate, de-identified insights from user data for internal product improvement, public content marketing, or potential future B2B offerings (e.g., trend reports for fashion retailers). This data is governed by the following rules:

- **Minimum aggregation threshold:** No aggregate statistic is published or shared externally if it is derived from fewer than 50 distinct users. This prevents re-identification in small cohorts.
- **No individual re-identification:** Aggregate data must not be combinable to identify a specific user. Do not publish cross-tabulated statistics with small cell sizes (e.g., "users in Arvada, CO who wear size XS and prefer minimalist style" — that's one person).
- **Examples of acceptable aggregate use:**
  - "The most common color in THREAD wardrobes is black" (public marketing)
  - "Users who provide 30+ feedback interactions have 40% higher retention" (internal product)
  - "Navy blazers are the most frequently repeated item across all users" (trend report)
- **Examples of unacceptable aggregate use:**
  - Any statistic derived from fewer than 50 users
  - Any combination of attributes that narrows to a recognizable individual
  - Any aggregate that includes geographic precision below the state/province level

---

## Implementation Checklist

| Item | Priority | Status |
|------|----------|--------|
| Migrate item_feedback to feedback_log (append-only) | Before launch | ⬜ |
| Wrap deletion endpoint in transaction | Before launch | ⬜ |
| Create deletion_log table | Before launch | ⬜ |
| Set R2 lifecycle rule (90-day auto-delete) | Before launch | ⬜ |
| Verify Google Cloud DPA covers Gemini | Before launch | ⬜ |
| Enable Sentry PII scrubbing | Before launch | ⬜ |
| Configure PostHog retention (12 months) | Before launch | ⬜ |
| Build data export endpoint (JSON) | Before launch | ⬜ |
| Build data export with photos (ZIP) | Month 1 | ⬜ |
| Create couples table + couple_outfits table | Before couple tier | ⬜ |
| Implement couple dissolution logic | Before couple tier | ⬜ |
| Monthly deletion compliance cron job | Month 1 | ⬜ |
| Review all third-party DPAs | Month 1-3 | ⬜ |
| Document aggregate data policy thresholds | Before any public data use | ⬜ |

---

## New Environment Variables

```bash
# Data Governance
DATA_EXPORT_MAX_SIZE_MB=500         # Max export archive size
DELETION_BACKUP_EXPIRY_DAYS=90      # How long backups persist after deletion
AGGREGATE_MIN_COHORT_SIZE=50        # Minimum users for any aggregate statistic
```

## New Files

```
server/
├── routes/
│   └── users.js                    # Updated: transactional delete, export endpoint
├── db/
│   └── migrate.js                  # + feedback_log, deletion_log, couples, couple_outfits
└── scripts/
    └── verify-deletion-compliance.js  # Monthly compliance check
```
