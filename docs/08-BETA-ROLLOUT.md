# THREAD Beta Tester Rollout

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

The beta program is the single most important phase of outerfit's existence. It answers the only question that matters before any marketing spend: do the outfit suggestions actually work for real people who didn't build the thing?

The program is deliberately small, structured, and observation-first. No surveys for the first two weeks. Just watch what they do.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Beta Rollout Phases                             │
├─────────────────────────────────────────────────────────────────────┤
│  Wave 0 (Week 1-2)   │  The GF. One user. Pure observation.         │
├─────────────────────────────────────────────────────────────────────┤
│  Wave 1 (Week 3-4)   │  5 hand-picked users. Free Pro. Watch.       │
├─────────────────────────────────────────────────────────────────────┤
│  Wave 2 (Week 5-8)   │  10 more users. Structured feedback begins.  │
├─────────────────────────────────────────────────────────────────────┤
│  Wave 3 (Week 9-12)  │  25 users. Couple tier tested. Churn data.   │
├─────────────────────────────────────────────────────────────────────┤
│  Public Launch       │  When Wave 3 metrics hit the bar.            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Success Metrics

These are the gates. Do not proceed to the next wave until the current wave hits its bar. Do not skip gates because you're excited.

| Wave | Gate Metric | Bar |
|------|-------------|-----|
| Wave 0 | GF uses it unprompted on Day 8+ | She opens it without being asked |
| Wave 1 | Suggestion acceptance rate | > 40% of suggestions accepted |
| Wave 2 | Would pay unprompted | 3 of 10 say yes without being asked |
| Wave 3 | 30-day retention | > 60% still active at day 30 |
| Launch | Churn signal | < 15% monthly churn in Wave 3 cohort |

---

## Churn Framework

Churn is the metric we almost forgot and the one that kills SaaS businesses quietly. A wardrobe app has a specific churn risk profile: high effort to onboard (uploading 50+ items), which means churned users are expensive to re-acquire. Get this right early.

### Churn Definitions

```
Day 1-7   — Onboarding churn: user never completes wardrobe upload
Day 8-30  — Early churn: user uploaded but stopped engaging
Day 31-90 — Disappointment churn: suggestions weren't good enough
Day 90+   — Seasonal churn: user still active but reduced frequency
```

### Churn Tracking Table

Add to `server/db/migrate.js`:

```sql
CREATE TABLE IF NOT EXISTS churn_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  signal_type     TEXT NOT NULL,
  -- signal_type:
  --   'no_upload_7d'       — registered but no items after 7 days
  --   'no_login_14d'       — no login in 14 days
  --   'no_login_30d'       — no login in 30 days
  --   'suggestion_reject_streak' — 5+ consecutive rejections
  --   'subscription_cancel' — explicit cancel
  --   'subscription_downgrade' — downgraded plan
  detected_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  actioned        INTEGER DEFAULT 0,  -- 0 = no action taken, 1 = email sent
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS churn_interventions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  intervention_type TEXT NOT NULL,
  sent_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  outcome         TEXT,  -- 'returned' | 'churned' | 'pending'
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Churn Detection Job

```javascript
// server/jobs/churnDetection.js
import cron from 'node-cron'

// Run daily at 6am
cron.schedule('0 6 * * *', async () => {
  const db = fastify.db

  // Signal: registered 7+ days ago, zero items uploaded
  db.exec(`
    INSERT OR IGNORE INTO churn_signals (user_id, signal_type)
    SELECT u.id, 'no_upload_7d'
    FROM users u
    LEFT JOIN items i ON i.user_id = u.id
    WHERE u.created_at < datetime('now', '-7 days')
    AND i.id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM churn_signals cs
      WHERE cs.user_id = u.id AND cs.signal_type = 'no_upload_7d'
    )
  `)

  // Signal: no login in 14 days (requires last_login_at on users table)
  db.exec(`
    INSERT OR IGNORE INTO churn_signals (user_id, signal_type)
    SELECT id, 'no_login_14d'
    FROM users
    WHERE last_login_at < datetime('now', '-14 days')
    AND NOT EXISTS (
      SELECT 1 FROM churn_signals cs
      WHERE cs.user_id = users.id AND cs.signal_type = 'no_login_14d'
      AND cs.detected_at > datetime('now', '-30 days')
    )
  `)

  // Signal: 5+ consecutive outfit rejections
  db.exec(`
    INSERT OR IGNORE INTO churn_signals (user_id, signal_type)
    SELECT user_id, 'suggestion_reject_streak'
    FROM (
      SELECT user_id, COUNT(*) as reject_count
      FROM item_feedback
      WHERE feedback_value < 0.3
      AND created_at > datetime('now', '-7 days')
      GROUP BY user_id
      HAVING reject_count >= 5
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM churn_signals cs
      WHERE cs.user_id = item_feedback.user_id
      AND cs.signal_type = 'suggestion_reject_streak'
      AND cs.detected_at > datetime('now', '-7 days')
    )
  `)

  // Trigger intervention emails for unactioned signals
  await triggerChurnInterventions()
})
```

### Churn Intervention Emails

| Signal | Email | Timing |
|--------|-------|--------|
| `no_upload_7d` | "Your wardrobe is waiting — here's how to add your first 5 items in 10 minutes" | Day 7 |
| `no_login_14d` | "It's been a while — your wardrobe misses you (also here's what's new)" | Day 14 |
| `no_login_30d` | Personal note — "Is there something we got wrong?" with reply-to | Day 30 |
| `suggestion_reject_streak` | "We noticed you haven't loved our suggestions lately — tell us why" | Immediate |
| Downgrade | "Sorry to see you step back — here's what you're keeping" | Immediate |

---

## Beta User Selection Criteria

Do not post a public beta signup form. Hand-pick every person in waves 0-2.

**Wave 0 — The GF**
One user. You know who she is. She is skeptical. That is exactly correct.

**Wave 1 criteria (5 people):**
- At least one person who is not into fashion at all (tests whether the AI helps people who don't think about clothes)
- At least one person with a large, varied wardrobe (stress tests the vision AI)
- At least one person over 45 (tests age range of the UX)
- At least one couple (tests the couple tier concept even informally)
- At least one person who is deeply into fashion (tests whether it's good enough for someone who already knows what they're doing)

**Wave 2 criteria (10 people):**
- Mix of genders, ages, body types, style preferences
- At least 2 people who travel frequently (vacation planner testers)
- At least 2 people who work in offices (occasion planning)
- At least 1 person who explicitly says they hate getting dressed

**Wave 3 criteria (25 people):**
- 3-4 actual couples using the couple tier
- Geographic mix (tests weather API across climates)
- Mix of wardrobe sizes (5 items to 200 items)

---

## Beta Access Implementation

### Invite Code System

The existing `invites` table in the schema already exists. Extend it:

```sql
ALTER TABLE invites ADD COLUMN wave INTEGER DEFAULT 1;
ALTER TABLE invites ADD COLUMN tier TEXT DEFAULT 'pro';
ALTER TABLE invites ADD COLUMN notes TEXT;
ALTER TABLE invites ADD COLUMN used_at DATETIME;
ALTER TABLE invites ADD COLUMN used_by_user_id INTEGER;
```

### Invite Generation Script

```javascript
// scripts/generate-invites.js
import crypto from 'crypto'

function generateInvite({ wave, tier = 'pro', notes = '', count = 1 }) {
  const invites = []
  for (let i = 0; i < count; i++) {
    const token = crypto.randomBytes(8).toString('hex').toUpperCase()
    // Format: OF-WAVE1-XXXXXXXX
    const code = `OF-W${wave}-${token}`
    invites.push({ code, wave, tier, notes })
  }
  return invites
}

// Usage:
// node scripts/generate-invites.js --wave 1 --count 5 --tier pro
```

### Registration Flow with Invite Code

```javascript
// server/routes/auth.js
fastify.post('/api/v1/auth/register', async (request, reply) => {
  const { email, password, firstName, turnstile_token, invite_code } = request.body

  // Check if beta mode is active
  const betaMode = process.env.BETA_MODE === 'true'

  if (betaMode) {
    if (!invite_code) {
      return reply.status(403).send({
        error: 'outerfit is currently invite-only.',
        code: 'INVITE_REQUIRED'
      })
    }

    const invite = db.exec(
      `SELECT * FROM invites WHERE token = ? AND status = 'pending'`,
      [invite_code]
    )?.[0]

    if (!invite) {
      return reply.status(403).send({
        error: 'Invalid or already used invite code.',
        code: 'INVITE_INVALID'
      })
    }

    // Mark invite as used after registration
    // ... rest of registration logic ...

    // Provision the tier from the invite
    await entitlementService.provisionPlan(userId, invite.tier)

    // Mark invite used
    db.run(
      `UPDATE invites SET status = 'used', used_at = CURRENT_TIMESTAMP,
       used_by_user_id = ? WHERE token = ?`,
      [userId, invite_code]
    )
  }
})
```

### Environment Variable

```bash
BETA_MODE=true   # Set to false for public launch
```

---

## Beta Feedback Collection

### Week 1-2: Observe Only

Do not send surveys. Do not ask questions. Watch PostHog. Watch which features get used. Watch where users stop.

Look specifically at:
- Did they complete wardrobe upload? (Onboarding step 2 completion)
- How many items did they upload before stopping?
- Did they request their first outfit?
- Did they accept or reject it?
- Did they come back the next day?

### Week 3-4: Passive Feedback

The in-app "I wish outerfit could..." widget is already built. Just make sure it's visible. Don't prompt users to use it — if they care enough to type something, that's signal.

### Week 5+: Structured Outreach

One email. Short. Three questions max:

```
Subject: Quick question about outerfit

Hey [name],

You've been using outerfit for [X] weeks. Three quick questions:

1. Has it actually changed what you wear in the morning? (yes / kinda / not really)
2. What's the one thing that would make you recommend it to a friend?
3. What's the one thing that almost made you stop using it?

Reply directly to this email. I read every one.

— [Your name]
```

### Beta Feedback Table

```sql
CREATE TABLE IF NOT EXISTS beta_feedback (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,
  wave          INTEGER,
  question_1    TEXT,   -- changed behavior?
  question_2    TEXT,   -- would recommend if...
  question_3    TEXT,   -- almost quit because...
  raw_response  TEXT,   -- full email reply if applicable
  collected_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Beta Dashboard (Admin)

A simple Fastify route that returns beta program health at a glance:

```javascript
// server/routes/admin.js
fastify.get('/api/v1/admin/beta', { preHandler: [requireAdmin] }, async (request, reply) => {
  const stats = {
    invites: {
      generated: db.exec('SELECT COUNT(*) FROM invites')[0],
      used: db.exec("SELECT COUNT(*) FROM invites WHERE status = 'used'")[0],
      pending: db.exec("SELECT COUNT(*) FROM invites WHERE status = 'pending'")[0],
    },
    users: {
      total: db.exec('SELECT COUNT(*) FROM users')[0],
      completed_onboarding: db.exec('SELECT COUNT(*) FROM users WHERE onboarding_step >= 3')[0],
      uploaded_items: db.exec('SELECT COUNT(DISTINCT user_id) FROM items')[0],
    },
    engagement: {
      outfits_generated: db.exec('SELECT COUNT(*) FROM outfits')[0],
      acceptance_rate: db.exec(`
        SELECT ROUND(AVG(CASE WHEN feedback_value > 0.5 THEN 1.0 ELSE 0.0 END), 2)
        FROM item_feedback
      `)[0],
      day7_retention: db.exec(`
        SELECT ROUND(COUNT(DISTINCT user_id) * 100.0 /
          (SELECT COUNT(*) FROM users WHERE created_at < datetime('now', '-7 days')), 1)
        FROM users
        WHERE last_login_at > datetime('now', '-7 days')
        AND created_at < datetime('now', '-7 days')
      `)[0],
    },
    churn: {
      signals_detected: db.exec('SELECT COUNT(*) FROM churn_signals')[0],
      no_upload_7d: db.exec("SELECT COUNT(*) FROM churn_signals WHERE signal_type = 'no_upload_7d'")[0],
      interventions_sent: db.exec('SELECT COUNT(*) FROM churn_interventions')[0],
      returned_after_intervention: db.exec("SELECT COUNT(*) FROM churn_interventions WHERE outcome = 'returned'")[0],
    }
  }
  return reply.send(stats)
})
```

---

## Launch Criteria

Do not launch publicly until ALL of the following are true:

```
□ Wave 3 day-30 retention > 60%
□ Outfit suggestion acceptance rate > 40%
□ Monthly churn in Wave 3 cohort < 15%
□ At least 1 couple has actively used the couple tier
□ At least 3 users say they'd pay unprompted
□ Zero critical bugs in production for 14 days
□ Privacy Policy and ToS live
□ LLC formed
□ Backup system tested and verified
□ Sentry error monitoring active
```

If any box is unchecked, the gate is closed. Fix the thing, re-run the wave, check the box.

---

## New Files

```
server/
├── jobs/
│   └── churnDetection.js       # Daily churn signal detection
├── routes/
│   └── admin.js                # Admin beta dashboard endpoint
└── scripts/
    └── generate-invites.js     # Invite code generation

server/db/
└── migrate.js                  # + churn_signals, churn_interventions,
                                #   beta_feedback, invite extensions
```

## New Environment Variables

```bash
BETA_MODE=true                  # Enables invite-only registration
ADMIN_API_KEY=...               # Protects admin routes
```
