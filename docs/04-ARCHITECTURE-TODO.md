# THREAD Architecture TODO

*Last Updated: 2026-02-23*

---

## Overview

Outstanding infrastructure and architecture items identified prior to launch. Ordered by priority — fix the things that will hurt you silently first, then the things that will hurt growth.

---

## Priority 1 — Do Before First User

### 🔴 Error Monitoring — Sentry

Flying blind in production is how you lose users silently and never know why.

**Stack:** Sentry free tier (5k errors/mo)
**Effort:** ~30 minutes

```bash
npm install @sentry/node @sentry/react
```

**Fastify (server/index.js):**
```javascript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,
})

// Add to Fastify error handler
fastify.setErrorHandler((error, request, reply) => {
  Sentry.captureException(error)
  fastify.log.error(error)
  reply.status(500).send({ error: 'Internal server error' })
})
```

**React (client/src/main.jsx):**
```javascript
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
})
```

**Environment variables:**
```bash
SENTRY_DSN=https://...@sentry.io/...
VITE_SENTRY_DSN=https://...@sentry.io/...
```

**Status:** ⬜ Not started

---

### 🔴 Backup Strategy — SQLite + Images → Cloudflare R2

A single disk failure on the VPS loses everything. SQLite + images need daily off-site backups.

**Stack:** Cloudflare R2 (free up to 10GB) + rclone + cron
**Effort:** ~1 hour

```bash
# Install rclone on VPS
curl https://rclone.org/install.sh | sudo bash

# Configure R2 remote
rclone config
# Provider: S3
# Endpoint: https://<account_id>.r2.cloudflarestorage.com
# Access key: R2 API token
```

**Backup script (scripts/backup.sh):**
```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
BACKUP_DIR=/tmp/thread-backup-$DATE

mkdir -p $BACKUP_DIR

# SQLite — safe online backup
sqlite3 /home/deploy/outerfit/data/thread.db ".backup $BACKUP_DIR/thread-$DATE.db"

# Images
cp -r /home/deploy/outerfit/data/images $BACKUP_DIR/images

# Compress
tar -czf /tmp/thread-backup-$DATE.tar.gz $BACKUP_DIR

# Upload to R2
rclone copy /tmp/thread-backup-$DATE.tar.gz r2:thread-backups/

# Cleanup local
rm -rf $BACKUP_DIR /tmp/thread-backup-$DATE.tar.gz

echo "Backup complete: thread-backup-$DATE.tar.gz"
```

**Cron (daily at 3am):**
```bash
crontab -e
# Add:
0 3 * * * /home/deploy/outerfit/scripts/backup.sh >> /var/log/thread-backup.log 2>&1
```

**Retention:** Keep 30 days of backups. Add R2 lifecycle rule to auto-delete older files.

**Environment variables:**
```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=thread-backups
```

**Status:** ⬜ Not started

---

### 🔴 Privacy Policy + Terms of Service

You are collecting photos of people's clothing, processing them with Gemini (a third-party AI), storing them on your VPS, and charging money. You need legal docs before taking a single paying customer.

**Options:**
| Option | Cost | Notes |
|--------|------|-------|
| iubenda | ~$27/yr | Auto-generates, GDPR/CCPA compliant |
| Termly | Free tier | Similar to iubenda |
| Lawyer | ~$500 | Recommended if you scale |

**Minimum required docs:**
- Privacy Policy — covers data collection, Gemini processing, image storage, user rights
- Terms of Service — covers acceptable use, subscription terms, refund policy
- Cookie Policy — required for EU users

**Key clauses specific to THREAD:**
- Third-party AI processing (Gemini) of user-uploaded images
- Image storage and retention policy
- Subscription cancellation and refund terms
- User data deletion on account cancellation

**Where to display:**
- Footer on all pages
- Checkbox at registration (`/auth/register`)
- Billing checkout flow

**Status:** ⬜ Not started

---

## Priority 2 — Do Before Launch

### 🟡 Transactional Email — Resend

System emails are not the same as support email. These are triggered programmatically by app events.

**Stack:** Resend (free tier — 3k emails/mo, 100/day)
**Effort:** ~2 hours

```bash
npm install resend
```

**EmailService (server/services/EmailService.js):**
```javascript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export class EmailService {

  async sendWelcome({ to, name }) {
    return resend.emails.send({
      from: 'THREAD <hello@outerfit.net>',
      to,
      subject: 'Welcome to THREAD 👕',
      html: welcomeTemplate({ name }),
    })
  }

  async sendPasswordReset({ to, resetUrl }) {
    return resend.emails.send({
      from: 'THREAD <noreply@outerfit.net>',
      to,
      subject: 'Reset your THREAD password',
      html: passwordResetTemplate({ resetUrl }),
    })
  }

  async sendPaymentFailed({ to, name, billingPortalUrl }) {
    return resend.emails.send({
      from: 'THREAD <billing@outerfit.net>',
      to,
      subject: 'Action needed — payment issue with your THREAD account',
      html: paymentFailedTemplate({ name, billingPortalUrl }),
    })
  }

  async sendPaymentRecovered({ to, name }) {
    return resend.emails.send({
      from: 'THREAD <billing@outerfit.net>',
      to,
      subject: 'Payment confirmed — you\'re all set',
      html: paymentRecoveredTemplate({ name }),
    })
  }
}
```

**Trigger points:**
| Event | Email |
|-------|-------|
| `POST /auth/register` | Welcome |
| `POST /auth/forgot-password` | Password reset |
| Lago webhook: `invoice.payment_failure` | Payment failed |
| Lago webhook: `invoice.payment_success` | Payment recovered |
| Lago webhook: `subscription.terminated` | Cancellation confirmed |

**DNS — add to Cloudflare:**
Resend requires SPF, DKIM, and DMARC records on outerfit.net. Resend's dashboard walks through these after domain verification.

**Environment variables:**
```bash
RESEND_API_KEY=re_...
EMAIL_FROM_DOMAIN=outerfit.net
```

**Status:** ⬜ Not started

---

### 🟡 Rate Limiting on AI Endpoints

General rate limiting exists via `@fastify/rate-limit` but Gemini API calls cost real money. A free-tier user hammering outfit generation could run up a significant bill.

**Approach:** Per-user, per-plan rate limits on expensive endpoints, enforced in entitlement middleware.

**Add to EntitlementService:**
```javascript
// Add to PLAN_LIMITS
const PLAN_LIMITS = {
  free:      { ..., ai_requests_per_hour: 5,   vision_requests_per_day: 10  },
  starter:   { ..., ai_requests_per_hour: 20,  vision_requests_per_day: 50  },
  pro:       { ..., ai_requests_per_hour: 60,  vision_requests_per_day: 200 },
  unlimited: { ..., ai_requests_per_hour: 200, vision_requests_per_day: 500 },
}
```

**Rate limit tracking table:**
```sql
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id       INTEGER NOT NULL,
  endpoint      TEXT NOT NULL,      -- 'outfit_generation' | 'vision_analysis'
  window_start  DATETIME NOT NULL,
  request_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, window_start)
);
```

**Endpoints to protect:**
- `POST /api/v1/outfits` — Gemini outfit generation
- `POST /api/v1/ingestion/upload-photo` — Gemini vision analysis
- `POST /api/v1/trainer/train` — TensorFlow training

**Status:** ⬜ Not started

---

### 🟡 Onboarding Flow

New users land in an empty wardrobe with no guidance. The app lives or dies on getting users to upload their first items and see a good outfit recommendation. Without a structured first-run experience, churn will be brutal before you can even evaluate the AI quality.

**Minimum viable onboarding (3 steps):**

```
Step 1 — Welcome + Profile
  "Tell us a little about your style"
  → Render the user profile form (YAML schema from docs)
  → Optional but nudge them to fill it in

Step 2 — Upload First Items
  "Add at least 5 items to get started"
  → Drag-and-drop photo upload
  → Show progress: 0/5 items added
  → Real-time Gemini analysis feedback per item

Step 3 — First Outfit
  "You're ready — let's see what you've got"
  → Auto-trigger first outfit suggestion
  → Show result with weather context
  → Prompt for thumbs up/down feedback
```

**Track onboarding state in users table:**
```sql
ALTER TABLE users ADD COLUMN onboarding_step INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN onboarding_completed_at DATETIME;
```

**React — gate the main app until onboarding complete:**
```javascript
// App.jsx
if (user && user.onboarding_step < 3) {
  return <OnboardingFlow step={user.onboarding_step} />
}
```

**Status:** ⬜ Not started

---

## Priority 3 — Do Before Marketing

### 🟢 Product Analytics — PostHog

Without analytics you have no idea which features get used, where users drop off, or whether outfit suggestions are actually good. Essential before any marketing spend.

**Stack:** PostHog Cloud free tier (1M events/mo) or self-hosted on VPS
**Effort:** ~1 hour for basic setup, ongoing for custom events

```bash
npm install posthog-js        # React
npm install posthog-node      # Fastify
```

**Key events to track:**
```javascript
// Client-side (posthog-js)
posthog.capture('outfit_generated', { plan: user.plan, item_count: wardrobe.length })
posthog.capture('outfit_accepted', { outfit_id, weather, temperature })
posthog.capture('outfit_rejected', { outfit_id, reason })
posthog.capture('item_uploaded', { category, ai_confidence })
posthog.capture('subscription_upgrade_clicked', { from_plan, to_plan })
posthog.capture('onboarding_step_completed', { step })
```

**Environment variables:**
```bash
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://app.posthog.com
```

**Status:** ⬜ Not started

---

## Summary

| Item | Priority | Effort | Cost |
|------|----------|--------|------|
| Error Monitoring (Sentry) | 🔴 Critical | 30 min | Free |
| Backup Strategy (R2) | 🔴 Critical | 1 hr | Free |
| Privacy Policy + ToS | 🔴 Critical | 2 hrs | ~$27/yr |
| Transactional Email (Resend) | 🟡 Pre-launch | 2 hrs | Free |
| AI Endpoint Rate Limiting | 🟡 Pre-launch | 3 hrs | Free |
| Onboarding Flow | 🟡 Pre-launch | 1–2 days | Free |
| Product Analytics (PostHog) | 🟢 Pre-marketing | 1 hr | Free |

**Total estimated cost to complete everything:** ~$27/year

---

## New Environment Variables Summary

```bash
# Error Monitoring
SENTRY_DSN=...
VITE_SENTRY_DSN=...

# Backups
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=thread-backups

# Transactional Email
RESEND_API_KEY=...
EMAIL_FROM_DOMAIN=outerfit.net

# Analytics
VITE_POSTHOG_KEY=...
VITE_POSTHOG_HOST=https://app.posthog.com
```

## New Files

```
server/
├── services/
│   └── EmailService.js         # Resend transactional email
└── scripts/
    └── backup.sh               # R2 backup script

client/src/
├── pages/
│   └── OnboardingFlow.jsx      # First-run experience
└── components/
    └── Analytics.jsx           # PostHog init
```
