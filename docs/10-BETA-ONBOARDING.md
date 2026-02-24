# THREAD Beta Onboarding & Email Systems

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

Ten friends are your first real test. If the onboarding feels half-baked, they'll assume the whole product is. This document covers everything from the invite email to the 5-day check-in survey — every touchpoint in the beta user journey, designed to feel like a real product from the first click.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Beta User Journey                                │
├─────────────────────────────────────────────────────────────────────┤
│  Day 0    │  You send invite email (hello@outerfit.net)             │
│  Day 0    │  They click link → pre-filled registration              │
│  Day 0    │  Email verification sent (noreply@)                     │
│  Day 0    │  They verify → land in onboarding flow                  │
│  Day 0    │  Welcome email (noreply@)                               │
│  Day 1    │  Onboarding check-in if < 5 items uploaded              │
│  Day 5    │  Tally survey email (hello@)                            │
│  Day 14   │  Personal check-in email (hello@)                       │
│  Day 30   │  "Would you pay?" email (hello@)                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Email Infrastructure

### Addresses

Two addresses, two purposes. Both configured in Cloudflare Email Routing and delivered via Resend.

| Address | Purpose | Tone |
|---------|---------|------|
| `noreply@outerfit.net` | Transactional — verification, welcome, password reset, check-ins | Clean, functional |
| `hello@outerfit.net` | Human — personal outreach, survey follow-up, replies | Warm, personal |

### Cloudflare Email Routing Setup

```
Cloudflare Dashboard → outerfit.net → Email → Email Routing

Add custom address: noreply@outerfit.net → your Gmail (receive only)
Add custom address: hello@outerfit.net → your Gmail (send + receive)
```

### Resend Domain Configuration

Resend requires DNS records to send from your domain. Add these in Cloudflare DNS:

```
# Resend adds these — copy from Resend dashboard after domain verification
TXT   @              v=spf1 include:amazonses.com ~all  (Resend uses SES)
TXT   resend._domainkey  <DKIM key from Resend>
CNAME em.outerfit.net   <Resend CNAME>
```

**Sending from Resend:**
- Transactional: `from: 'outerfit <noreply@outerfit.net>'`
- Personal outreach: `from: 'outerfit <hello@outerfit.net>'`
- Reply-to on all emails: `replyTo: 'hello@outerfit.net'`

---

## Auth System — What's Missing

### Password Reset (Not Yet Built)

```sql
-- Add to migrate.js
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  DATETIME NOT NULL,
  used        INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

```javascript
// server/routes/auth.js — add these routes

// Request password reset
fastify.post('/api/v1/auth/forgot-password', async (request, reply) => {
  const { email } = request.body
  const user = db.exec(`SELECT id FROM users WHERE email = ?`, [email])?.[0]

  // Always return 200 — never reveal whether email exists
  if (!user) return reply.send({ sent: true })

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  db.run(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `, [user.id, token, expires.toISOString()])

  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`
  await emailService.sendPasswordReset({ to: email, resetUrl })

  return reply.send({ sent: true })
})

// Confirm password reset
fastify.post('/api/v1/auth/reset-password', async (request, reply) => {
  const { token, password } = request.body

  const record = db.exec(`
    SELECT user_id FROM password_reset_tokens
    WHERE token = ? AND used = 0 AND expires_at > datetime('now')
  `, [token])?.[0]

  if (!record) {
    return reply.status(400).send({ error: 'Invalid or expired reset link.' })
  }

  const hashed = await bcrypt.hash(password, 10)
  db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, record.user_id])
  db.run(`UPDATE password_reset_tokens SET used = 1 WHERE token = ?`, [token])

  return reply.send({ reset: true })
})
```

### Email Verification (Not Yet Built)

```sql
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verify_token TEXT;
ALTER TABLE users ADD COLUMN email_verify_sent_at DATETIME;
```

```javascript
// On registration — send verification email
fastify.post('/api/v1/auth/register', async (request, reply) => {
  // ... existing registration logic ...

  const verifyToken = crypto.randomBytes(32).toString('hex')

  db.run(`
    UPDATE users SET
      email_verify_token = ?,
      email_verify_sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [verifyToken, userId])

  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verifyToken}`
  await emailService.sendEmailVerification({ to: email, firstName, verifyUrl })

  return reply.send({ registered: true, verify_email: true })
})

// Verify email
fastify.get('/api/v1/auth/verify-email', async (request, reply) => {
  const { token } = request.query

  const user = db.exec(`
    SELECT id, email FROM users
    WHERE email_verify_token = ? AND email_verified = 0
  `, [token])?.[0]

  if (!user) {
    return reply.status(400).send({ error: 'Invalid or already used verification link.' })
  }

  db.run(`
    UPDATE users SET
      email_verified = 1,
      email_verify_token = NULL
    WHERE id = ?
  `, [user.id])

  await emailService.sendWelcome({ to: user.email })

  // Redirect to app with success state
  return reply.redirect(`${process.env.APP_URL}/onboarding?verified=true`)
})

// Resend verification
fastify.post('/api/v1/auth/resend-verification', async (request, reply) => {
  const { email } = request.body
  const user = db.exec(`SELECT * FROM users WHERE email = ?`, [email])?.[0]
  if (!user || user.email_verified) return reply.send({ sent: true })

  const verifyToken = crypto.randomBytes(32).toString('hex')
  const verifyUrl = `${process.env.APP_URL}/verify-email?token=${verifyToken}`

  db.run(`UPDATE users SET email_verify_token = ? WHERE id = ?`, [verifyToken, user.id])
  await emailService.sendEmailVerification({ to: email, firstName: user.name, verifyUrl })

  return reply.send({ sent: true })
})
```

### Optional 2FA (TOTP — Google Authenticator compatible)

2FA is optional — users enable it in Settings. No friction for beta users who don't want it.

```bash
npm install speakeasy qrcode
```

```sql
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
```

```javascript
// Setup 2FA — returns QR code
fastify.post('/api/v1/auth/2fa/setup', { preHandler: [authenticate] }, async (req, reply) => {
  const secret = speakeasy.generateSecret({
    name: `outerfit (${req.user.email})`,
    issuer: 'outerfit'
  })

  db.run(`UPDATE users SET totp_secret = ? WHERE id = ?`, [secret.base32, req.user.id])

  const qrCode = await qrcode.toDataURL(secret.otpauth_url)
  return reply.send({ qr_code: qrCode, secret: secret.base32 })
})

// Confirm 2FA setup
fastify.post('/api/v1/auth/2fa/confirm', { preHandler: [authenticate] }, async (req, reply) => {
  const { code } = req.body
  const user = db.exec(`SELECT totp_secret FROM users WHERE id = ?`, [req.user.id])?.[0]

  const valid = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token: code,
    window: 2
  })

  if (!valid) return reply.status(400).send({ error: 'Invalid code' })

  db.run(`UPDATE users SET totp_enabled = 1 WHERE id = ?`, [req.user.id])
  return reply.send({ enabled: true })
})

// Login with 2FA
// After password check succeeds, if totp_enabled:
// Return { requires_2fa: true, temp_token: shortLivedToken }
// Client shows 2FA input, POSTs code + temp_token
// Server verifies TOTP, issues full JWT
```

---

## The Invite Flow

### How It Works

You generate a personal invite link for each beta user. The link pre-fills their email address in the registration form so they don't have to type it. It also marks them as a beta user with free Pro access.

```
https://outerfit.net/join?invite=OF-W1-XXXXXXXX&email=friend@gmail.com
```

### Invite Generation Script

```bash
# Run from your local machine
node scripts/generate-invites.js \
  --wave 1 \
  --emails "alice@gmail.com,bob@gmail.com,carol@work.com" \
  --tier pro \
  --notes "Wave 1 beta - close friends"
```

Output:
```
Generated 3 invites:

alice@gmail.com
→ https://outerfit.net/join?invite=OF-W1-A3F2B1C4&email=alice%40gmail.com

bob@gmail.com
→ https://outerfit.net/join?invite=OF-W1-9E7D5F2A&email=bob%40gmail.com

carol@work.com
→ https://outerfit.net/join?invite=OF-W1-2B8C4D1E&email=carol%40work.com

Copy these links into the invite email template.
```

### Registration UX with Invite Link

When a user lands on `/join?invite=OF-W1-XXXXXXXX&email=alice@gmail.com`:

```jsx
// client/src/pages/JoinPage.jsx
export function JoinPage() {
  const params = new URLSearchParams(window.location.search)
  const inviteCode = params.get('invite')
  const prefilledEmail = params.get('email')

  return (
    <div className="join-page">
      <div className="join-header">
        <img src="/logo.svg" alt="outerfit" />
        <h1>You're invited.</h1>
        <p>You've been given early access to outerfit — AI that tells you what to wear, every day, from the clothes you already own.</p>
      </div>

      <form className="join-form">
        <input
          type="text"
          placeholder="First name"
          required
        />
        <input
          type="email"
          defaultValue={prefilledEmail || ''}
          placeholder="Email"
          required
        />
        <input
          type="password"
          placeholder="Create a password"
          required
          minLength={8}
        />
        <input
          type="hidden"
          name="invite_code"
          value={inviteCode || ''}
        />

        {/* Turnstile widget */}
        <Turnstile siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                   onSuccess={setTurnstileToken} />

        <button type="submit">Create my account →</button>

        <p className="terms-note">
          By creating an account you agree to our{' '}
          <a href="/terms">Terms of Service</a> and{' '}
          <a href="/privacy">Privacy Policy</a>.
          {/* Checkbox not required if link is visible — but add one for GDPR compliance */}
        </p>
      </form>
    </div>
  )
}
```

---

## Email Templates

All sent via Resend. All plain and readable — no heavy HTML, no image-laden newsletters. These are personal-feeling emails, not marketing blasts.

### 1. Invite Email (You Send Manually from hello@)

This one you send yourself from hello@outerfit.net — not automated. Personal tone matters more than automation here.

```
Subject: You're in — early access to outerfit

Hey [name],

I've been building something I think you'll find genuinely useful and I
want you to be one of the first ten people to try it.

outerfit is an AI stylist that tells you what to wear — every day, from
the clothes you already own. You photograph your wardrobe once, and from
then on it suggests outfits based on the weather, your plans, and your
actual taste. It learns what you like over time.

I'm giving you free Pro access for as long as the beta runs. No credit
card, no strings.

Your personal invite link:
→ [INVITE LINK]

It takes about 20-30 minutes to upload your wardrobe the first time.
After that, it's maybe 10 seconds a morning.

I'd genuinely love to know what you think — good or bad. Just reply
to this email.

— [Your name]

P.S. If the AI suggests something ridiculous, screenshot it and send it
to me. I want to know.
```

---

### 2. Email Verification (Automated, noreply@)

```javascript
// server/services/EmailService.js

async sendEmailVerification({ to, firstName, verifyUrl }) {
  return resend.emails.send({
    from: 'outerfit <noreply@outerfit.net>',
    replyTo: 'hello@outerfit.net',
    to,
    subject: 'Verify your outerfit email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 24px; font-weight: bold; color: #1A1A1A; margin: 0 0 8px;">
          outerfit.
        </p>
        <hr style="border: none; border-top: 1px solid #E0E0E0; margin: 16px 0 24px;" />
        <p style="color: #1A1A1A;">Hi ${firstName},</p>
        <p style="color: #555;">One quick step — verify your email to activate your account.</p>
        <a href="${verifyUrl}"
           style="display: inline-block; background: #1A1A2E; color: white;
                  padding: 12px 28px; border-radius: 6px; text-decoration: none;
                  font-weight: bold; margin: 16px 0;">
          Verify my email →
        </a>
        <p style="color: #888; font-size: 13px;">
          This link expires in 24 hours. If you didn't create an outerfit account,
          you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #E0E0E0; margin: 24px 0 16px;" />
        <p style="color: #AAA; font-size: 12px;">
          outerfit.net · Arvada, CO
          · <a href="https://outerfit.net/privacy" style="color:#AAA;">Privacy</a>
        </p>
      </div>
    `
  })
}
```

---

### 3. Welcome Email (Automated, noreply@)

Sent immediately after email verification.

```javascript
async sendWelcome({ to, firstName }) {
  return resend.emails.send({
    from: 'outerfit <noreply@outerfit.net>',
    replyTo: 'hello@outerfit.net',
    to,
    subject: "You're in. Here's where to start.",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 24px; font-weight: bold; color: #1A1A1A;">outerfit.</p>
        <hr style="border: none; border-top: 1px solid #E0E0E0; margin: 16px 0 24px;" />
        <p style="color: #1A1A1A;">Hey ${firstName} — you're in.</p>
        <p style="color: #555;">
          Here's the honest quickstart:
        </p>
        <ol style="color: #555; line-height: 1.8;">
          <li><strong>Upload your wardrobe.</strong> Aim for at least 20 items.
              The more you add, the better the suggestions get.
              Takes about 20 minutes.</li>
          <li><strong>Fill in your style profile.</strong> Optional, but it helps.
              Takes 2 minutes.</li>
          <li><strong>Ask for your first outfit.</strong> Tell it what you're doing today
              and let it suggest something.</li>
          <li><strong>Rate it.</strong> Thumbs up or down. That's how it learns
              what you actually like.</li>
        </ol>
        <a href="https://outerfit.net/wardrobe/upload"
           style="display: inline-block; background: #1A1A2E; color: white;
                  padding: 12px 28px; border-radius: 6px; text-decoration: none;
                  font-weight: bold; margin: 16px 0;">
          Start uploading →
        </a>
        <p style="color: #555; font-size: 14px;">
          Reply to this email any time. I read everything.
        </p>
        <hr style="border: none; border-top: 1px solid #E0E0E0; margin: 24px 0 16px;" />
        <p style="color: #AAA; font-size: 12px;">outerfit.net · Arvada, CO</p>
      </div>
    `
  })
}
```

---

### 4. Day 1 Upload Nudge (Automated — only if < 5 items)

Triggered by the churn detection job if user registered yesterday and has fewer than 5 items.

```javascript
async sendUploadNudge({ to, firstName }) {
  return resend.emails.send({
    from: 'outerfit <noreply@outerfit.net>',
    replyTo: 'hello@outerfit.net',
    to,
    subject: 'Quick tip for getting started with outerfit',
    html: `
      ...
      <p>Hey ${firstName},</p>
      <p>The secret to getting good suggestions is having enough items for
         outerfit to work with. Even just 15-20 items makes a big difference.</p>
      <p>If photographing your whole wardrobe feels overwhelming, here's a
         shortcut: start with the things you wear most. Grab your 10 most-used
         tops and 5 bottoms and you'll get surprisingly good results.</p>
      <a href="https://outerfit.net/wardrobe/upload">Add items now →</a>
      <p style="font-size:13px; color:#888;">
        Takes about 90 seconds per item once you get the hang of it.
      </p>
      ...
    `
  })
}
```

---

### 5. Password Reset (Automated, noreply@)

```javascript
async sendPasswordReset({ to, resetUrl }) {
  return resend.emails.send({
    from: 'outerfit <noreply@outerfit.net>',
    replyTo: 'hello@outerfit.net',
    to,
    subject: 'Reset your outerfit password',
    html: `
      ...
      <p>Someone requested a password reset for this account.
         If that was you, click below. If not, ignore this email.</p>
      <a href="${resetUrl}">Reset my password →</a>
      <p style="font-size:13px; color:#888;">This link expires in 1 hour.</p>
      ...
    `
  })
}
```

---

### 6. Day 5 Survey Email (Sent from hello@ — personal tone)

```javascript
async sendBetaSurvey({ to, firstName, surveyUrl }) {
  return resend.emails.send({
    from: 'outerfit <hello@outerfit.net>',
    to,
    subject: "Five days in — quick question",
    html: `
      ...
      <p>Hey ${firstName},</p>
      <p>You've had outerfit for five days. I'm genuinely curious how it's going.</p>
      <p>I put together a short survey — six questions, takes about 3 minutes.
         Your answers directly shape what I build next.</p>
      <a href="${surveyUrl}">Take the survey →</a>
      <p>Or just reply to this email if you'd rather talk it through.
         Both work.</p>
      <p>— [Your name]</p>
      ...
    `
  })
}
```

---

### 7. Day 14 Personal Check-In (Manual, from hello@)

Send this one yourself. Do not automate it. The personal touch at day 14 is worth more than any automated sequence.

```
Subject: Checking in on outerfit

Hey [name],

It's been two weeks. I want to know honestly — is outerfit actually
useful in your daily life, or is it something you tried a few times
and forgot about?

No wrong answer. Both are genuinely useful to me.

If you're not using it, I'd love to know why. If you are, I'd love
to know what's working and what isn't.

Reply whenever — no rush.

— [Your name]
```

---

### 8. Day 30 "Would You Pay?" Email (Manual, from hello@)

```
Subject: Real question about outerfit

Hey [name],

You've had a month with outerfit. Here's the real question:

If the free access ended tomorrow and it cost $7.99/month to keep
using it, would you?

Again — no wrong answer. A "no" is as useful as a "yes."

— [Your name]
```

---

## Tally Survey Setup

### Why Tally

Tally is free, beautiful, and embeds cleanly. The forms look like they belong in a real product — not a Google Form from 2012.

### Survey Questions (Day 5)

Create at tally.so — share the link in the Day 5 email.

```
Form title: outerfit Early Access — Quick Check-In

Q1: How many items have you added to your wardrobe?
    → Number input

Q2: Have outerfit's outfit suggestions been useful?
    → Scale 1-5
    → 1 = Not at all, 5 = Yes, genuinely

Q3: What's the best thing outerfit has done for you so far?
    → Long text (optional)

Q4: What's the most frustrating thing about it?
    → Long text (optional)

Q5: Is there something you expected outerfit to do that it doesn't?
    → Long text (optional)

Q6: If outerfit cost $7.99/month, would you pay for it?
    → Yes / Maybe / No
    → If No: What would make you say yes? (follow-up)

Thank you message:
"This genuinely helps. I read every response personally.
 If you want to talk through any of this, just reply to the
 email I sent you."
```

### Tally → Notification Setup

In Tally: Integrations → Email notification → `hello@outerfit.net`

Every survey response lands directly in your inbox. No dashboard to check.

---

## Automated Email Sequence — Cron Jobs

```javascript
// server/jobs/betaEmailSequence.js
import cron from 'node-cron'

// Run daily at 9am
cron.schedule('0 9 * * *', async () => {

  // Day 1 upload nudge — users with < 5 items after 24 hours
  const needsNudge = db.exec(`
    SELECT u.id, u.email, u.name
    FROM users u
    LEFT JOIN items i ON i.user_id = u.id
    WHERE u.created_at BETWEEN datetime('now', '-2 days') AND datetime('now', '-1 day')
    AND u.email_verified = 1
    GROUP BY u.id
    HAVING COUNT(i.id) < 5
  `)
  for (const user of needsNudge || []) {
    const alreadySent = db.exec(`
      SELECT id FROM churn_interventions
      WHERE user_id = ? AND intervention_type = 'upload_nudge_day1'
    `, [user.id])?.[0]
    if (!alreadySent) {
      await emailService.sendUploadNudge({ to: user.email, firstName: user.name })
      db.run(`
        INSERT INTO churn_interventions (user_id, intervention_type)
        VALUES (?, 'upload_nudge_day1')
      `, [user.id])
    }
  }

  // Day 5 survey
  const day5Users = db.exec(`
    SELECT u.id, u.email, u.name
    FROM users u
    WHERE u.created_at BETWEEN datetime('now', '-6 days') AND datetime('now', '-5 days')
    AND u.email_verified = 1
    AND NOT EXISTS (
      SELECT 1 FROM churn_interventions ci
      WHERE ci.user_id = u.id AND ci.intervention_type = 'survey_day5'
    )
  `)
  for (const user of day5Users || []) {
    const surveyUrl = `${process.env.TALLY_SURVEY_URL}?name=${encodeURIComponent(user.name)}&uid=${user.id}`
    await emailService.sendBetaSurvey({
      to: user.email,
      firstName: user.name,
      surveyUrl
    })
    db.run(`
      INSERT INTO churn_interventions (user_id, intervention_type)
      VALUES (?, 'survey_day5')
    `, [user.id])
  }
})
```

---

## New Environment Variables

```bash
# Auth
APP_URL=https://outerfit.net
JWT_EXPIRY=7d
RESET_TOKEN_EXPIRY_HOURS=1
VERIFY_TOKEN_EXPIRY_HOURS=24

# Email
RESEND_API_KEY=re_...
EMAIL_FROM_NOREPLY=outerfit <noreply@outerfit.net>
EMAIL_FROM_HELLO=outerfit <hello@outerfit.net>
EMAIL_REPLY_TO=hello@outerfit.net

# Beta
TALLY_SURVEY_URL=https://tally.so/r/XXXXXXX
BETA_MODE=true
```

---

## New Schema Summary

```sql
-- Password reset
CREATE TABLE password_reset_tokens (...)

-- Email verification (columns on users table)
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verify_token TEXT;
ALTER TABLE users ADD COLUMN email_verify_sent_at DATETIME;
ALTER TABLE users ADD COLUMN last_login_at DATETIME;  -- needed for churn detection

-- Optional 2FA (columns on users table)
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0;
```

---

## New Files

```
server/
├── routes/
│   └── auth.js                 # + forgot-password, reset-password,
│                               #   verify-email, resend-verification,
│                               #   2fa/setup, 2fa/confirm
├── services/
│   └── EmailService.js         # + sendEmailVerification, sendWelcome,
│                               #   sendUploadNudge, sendPasswordReset,
│                               #   sendBetaSurvey
└── jobs/
    └── betaEmailSequence.js    # Day 1 nudge + Day 5 survey automation

client/src/
├── pages/
│   ├── JoinPage.jsx            # Invite landing + registration
│   ├── VerifyEmailPage.jsx     # "Check your email" holding page
│   ├── ResetPasswordPage.jsx   # Password reset form
│   └── SettingsPage.jsx        # + 2FA setup section
└── components/
    └── TwoFactorSetup.jsx      # QR code + verification input

scripts/
└── generate-invites.js         # Updated: accepts --emails flag
```

---

## The One Rule

The Day 14 and Day 30 emails are not automated. You send them yourself. A personal email from the founder at week two is worth ten automated sequences. These are your friends — they'll respond to a real message in a way they won't respond to a Mailchimp template.

The automation handles the transactional stuff. The human stuff stays human.
