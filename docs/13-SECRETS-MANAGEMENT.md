# THREAD Secrets Management & Security SOPs

*Last Updated: 2026-02-23*
*Product: outerfit.net | Internal codename: THREAD*

---

## Overview

API keys, database credentials, and signing secrets are not environment variables sitting in a `.env` file on a server. They are managed secrets with controlled access, rotation schedules, and audit trails. This document defines how secrets are stored, accessed, rotated, and what happens when one leaks.

The stack is **Infisical** — open source, free tier, GitHub-native, and exactly right for a solo-to-small-team SaaS.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Secrets Architecture                            │
├─────────────────────────────────────────────────────────────────────┤
│  Storage       │  Infisical Cloud (encrypted at rest + in transit)  │
│  Local dev     │  Infisical CLI pulls secrets to local process      │
│  Production    │  Infisical injects secrets into PM2 at startup     │
│  GitHub CI     │  Infisical GitHub Action injects into workflows    │
│  Emergency     │  Break-glass procedure (documented below)          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Why Infisical

| Feature | Infisical | Encrypted .env | Hashicorp Vault |
|---------|-----------|---------------|-----------------|
| Free tier | ✅ Generous | ✅ Free | ❌ Self-hosted cost |
| Secret versioning | ✅ | ❌ | ✅ |
| Audit log | ✅ | ❌ | ✅ |
| Team access control | ✅ | ❌ | ✅ |
| GitHub integration | ✅ Native | ❌ Manual | ⚠️ Complex |
| Complexity | Low | Very low | Very high |
| Open source | ✅ | N/A | ✅ |
| Self-hostable | ✅ (later) | N/A | ✅ |

---

## Setup

### 1. Create Infisical Account

```
1. Go to infisical.com
2. Sign up with your GitHub account
3. Create organisation: outerfit
4. Create project: thread-production
5. Create environments: development, staging, production
```

### 2. Install Infisical CLI

```bash
# macOS
brew install infisical/get-cli/infisical

# Linux (VPS)
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' \
  | sudo -E bash
sudo apt-get install infisical

# Verify
infisical --version
```

### 3. Authenticate

```bash
# Local machine
infisical login

# VPS (non-interactive — use machine identity)
# Create a Machine Identity in Infisical dashboard:
# Project → Access Control → Machine Identities → Create
# Copy the Client ID and Client Secret

export INFISICAL_CLIENT_ID=...
export INFISICAL_CLIENT_SECRET=...
infisical login --method=universal-auth \
  --client-id=$INFISICAL_CLIENT_ID \
  --client-secret=$INFISICAL_CLIENT_SECRET
```

---

## Secret Inventory

Every secret in outerfit, its environment, rotation schedule, and owner.

| Secret Key | Description | Environment | Rotation | Leak Impact |
|------------|-------------|-------------|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini vision API | Production | 90 days | High — AI costs |
| `STRIPE_SECRET_KEY` | Stripe payment processing | Production | On team change | Critical — financial |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Production | On rotation | High — payment fraud |
| `LAGO_API_KEY` | Lago subscription management | Production | 90 days | High — billing |
| `WEBHOOK_LAGO_SECRET` | Lago webhook HMAC signing | Production | 90 days | Medium |
| `RESEND_API_KEY` | Transactional email | Production | 90 days | Medium — email spam |
| `JWT_SECRET` | Session token signing | Production | 180 days | Critical — auth bypass |
| `TURNSTILE_SECRET_KEY` | Cloudflare bot protection | Production | 180 days | Low |
| `SENTRY_DSN` | Error monitoring | Production | Never | Low |
| `ADMIN_API_KEY` | Admin route protection | Production | 90 days | High — admin access |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 backup storage | Production | 180 days | Medium |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 backup storage | Production | 180 days | Medium |
| `INFISICAL_CLIENT_ID` | Infisical machine identity | VPS only | On team change | High |
| `INFISICAL_CLIENT_SECRET` | Infisical machine identity | VPS only | On team change | High |

### Secret Classification

```
CRITICAL  — Immediate financial or auth impact. Rotate within 1 hour of suspected leak.
            JWT_SECRET, STRIPE_SECRET_KEY

HIGH      — Significant operational impact. Rotate within 4 hours.
            GEMINI_API_KEY, LAGO_API_KEY, ADMIN_API_KEY, INFISICAL credentials

MEDIUM    — Limited impact. Rotate within 24 hours.
            RESEND_API_KEY, WEBHOOK_LAGO_SECRET, R2 keys

LOW       — Minimal impact. Rotate within 7 days.
            TURNSTILE_SECRET_KEY, SENTRY_DSN
```

---

## Local Development

### `.env` Files Are Banned from the Repo

```bash
# .gitignore — these must always be present
.env
.env.local
.env.development
.env.production
.env.*
*.env
```

Add a pre-commit hook to enforce this:

```bash
# .git/hooks/pre-commit (or use husky)
#!/bin/bash
if git diff --cached --name-only | grep -E '\.env'; then
  echo "ERROR: Attempting to commit a .env file. Remove it from staging."
  echo "Run: git reset HEAD <filename>"
  exit 1
fi
```

### Running Locally with Infisical

```bash
# Instead of: node server/index.js
# Use:
infisical run --env=development -- node server/index.js

# Or with npm scripts — update package.json:
{
  "scripts": {
    "dev": "infisical run --env=development -- node server/index.js",
    "dev:client": "infisical run --env=development -- vite",
    "start": "infisical run --env=production -- node server/index.js"
  }
}
```

Infisical pulls secrets from the cloud and injects them as environment variables into the process — they never touch the filesystem.

### First-Time Local Setup for New Developer

```bash
# 1. Clone repo
git clone https://github.com/yourusername/outerfit.git
cd outerfit

# 2. Install deps
npm install

# 3. Install Infisical CLI
brew install infisical/get-cli/infisical

# 4. Authenticate
infisical login
# Opens browser for OAuth — log in with GitHub

# 5. Link project
infisical init
# Select: outerfit → thread-production → development

# 6. Run
npm run dev

# That's it. No .env file needed. No secret sharing over Slack.
```

---

## Production Deployment

### PM2 with Infisical

The production server runs under PM2. Infisical injects secrets at startup.

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'outerfit',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    // NO env block here — secrets come from Infisical
  }]
}
```

```bash
# Start production server with secrets injected
infisical run --env=production -- pm2 start ecosystem.config.js

# Restart with latest secrets (after rotation)
infisical run --env=production -- pm2 restart outerfit

# Alias in ~/.bashrc on VPS for convenience
alias outerfit-start='infisical run --env=production -- pm2 start ecosystem.config.js'
alias outerfit-restart='infisical run --env=production -- pm2 restart outerfit'
```

### VPS Bootstrap Script

Add to `scripts/vps-setup.sh`:

```bash
#!/bin/bash
# Install Infisical on fresh VPS

curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' \
  | sudo -E bash
sudo apt-get install -y infisical

# Authenticate with machine identity
# (Client ID and Secret provided securely out-of-band)
echo "Now run:"
echo "  infisical login --method=universal-auth \\"
echo "    --client-id=\$INFISICAL_CLIENT_ID \\"
echo "    --client-secret=\$INFISICAL_CLIENT_SECRET"
echo "  infisical init"
echo "  Then start the app with: outerfit-start"
```

---

## GitHub Actions Integration

Secrets are injected into CI/CD workflows via the official Infisical GitHub Action — never stored as GitHub repository secrets.

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Inject secrets from Infisical
        uses: Infisical/secrets-action@v1
        with:
          client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
          client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
          env-slug: production
          project-slug: thread-production
          # Secrets are now available as environment variables
          # in all subsequent steps

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Deploy to VPS
        run: |
          # Deploy script — secrets already injected above
          ssh deploy@${{ secrets.VPS_IP }} 'cd ~/outerfit && git pull && npm ci'
          ssh deploy@${{ secrets.VPS_IP }} 'outerfit-restart'
```

**Note:** `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` are the only secrets stored in GitHub — they are the keys to everything else. Protect them accordingly. Rotate immediately if a GitHub breach occurs.

---

## Secret Rotation Procedures

### Standard Rotation (Scheduled)

Run this procedure on the schedule defined in the Secret Inventory table.

```bash
# 1. Generate new secret in the relevant service dashboard
# 2. Add new secret to Infisical (mark old as deprecated)
infisical secrets set RESEND_API_KEY=re_newkey123 --env=production

# 3. Restart the app to pick up new secret
outerfit-restart

# 4. Verify app is running correctly
curl https://outerfit.net/api/v1/health

# 5. Delete old secret from the service dashboard
# 6. Remove deprecated flag in Infisical
# 7. Log the rotation in the rotation log (below)
```

### Rotation Log

Keep a simple rotation log. Append to this file after every rotation:

```
# secrets/rotation-log.txt (committed to repo — dates and key names only, never values)

2026-02-23  RESEND_API_KEY          Scheduled 90-day rotation
2026-02-23  LAGO_API_KEY            Scheduled 90-day rotation
2026-03-15  JWT_SECRET              Scheduled 180-day rotation
```

### Emergency Rotation (Suspected Leak)

If a secret may have been compromised:

```bash
# CRITICAL — Do this immediately, in order

# Step 1: Revoke the compromised secret at the source
# (Stripe dashboard / Gemini console / Resend dashboard — wherever it was issued)
# This takes effect immediately. Old secret is dead.

# Step 2: Generate new secret at source

# Step 3: Update in Infisical
infisical secrets set <SECRET_KEY>=<new_value> --env=production

# Step 4: Restart app
outerfit-restart

# Step 5: Assess damage
# - Check Stripe for unauthorised charges
# - Check Gemini for unexpected API usage
# - Check Resend for sent emails you didn't send
# - Check Sentry for unusual errors

# Step 6: Document the incident (see Incident Log below)
```

---

## Break-Glass Procedure

For emergencies where Infisical itself is unavailable (outage, account issue).

### Preparation (Do This Now, Before You Need It)

```bash
# Create an encrypted emergency secrets file
# Store it somewhere you control but separate from the VPS

# Generate the file (never commit this)
cat > /tmp/outerfit-emergency.env << 'EOF'
GEMINI_API_KEY=...
STRIPE_SECRET_KEY=...
JWT_SECRET=...
# ... all production secrets ...
EOF

# Encrypt with GPG using your personal key
gpg --symmetric --cipher-algo AES256 /tmp/outerfit-emergency.env
# Creates: /tmp/outerfit-emergency.env.gpg

# Shred the plaintext
shred -u /tmp/outerfit-emergency.env

# Store outerfit-emergency.env.gpg in:
# - Your personal encrypted cloud storage (not iCloud default sync)
# - A USB drive in a secure physical location
# - A trusted password manager (1Password, Bitwarden) as a secure note
```

### Using the Break-Glass File

```bash
# Decrypt
gpg --decrypt outerfit-emergency.env.gpg > /tmp/outerfit-emergency.env

# Run app with emergency env
set -a && source /tmp/outerfit-emergency.env && set +a
pm2 start ecosystem.config.js

# Shred after use
shred -u /tmp/outerfit-emergency.env
```

**After using break-glass:** Update the emergency file immediately after resolving the Infisical issue, as it may now be stale.

---

## Access Control

### Infisical Team Permissions

| Role | Access | Who |
|------|--------|-----|
| Admin | All environments, all secrets, billing | You only |
| Developer | Development environment only | Future team members initially |
| Viewer | No secret values visible | External auditors if needed |

**Rule:** Nobody gets production access until they have demonstrated they need it. Production access is granted per-person, not per-role by default.

### VPS Access

```bash
# SSH key-based auth only — password auth disabled
# Add to /etc/ssh/sshd_config:
PasswordAuthentication no
PubkeyAuthentication yes

# Each developer gets their own SSH key — never share keys
# When someone leaves: remove their key immediately
# ~/.ssh/authorized_keys — one key per line, one key per person
```

### GitHub Repository

```
Settings → Branches → main branch protection:
  ✅ Require pull request before merging
  ✅ Require status checks to pass
  ✅ Restrict who can push to matching branches

Settings → Secrets → Repository secrets:
  INFISICAL_CLIENT_ID       (machine identity — CI only)
  INFISICAL_CLIENT_SECRET   (machine identity — CI only)
  VPS_IP                    (not sensitive but convenient here)
```

---

## Incident Response

### Incident Log

```
# security/incident-log.txt (committed to repo)
# Format: DATE | SEVERITY | SECRET | WHAT HAPPENED | RESOLUTION

2026-02-23 | TEMPLATE — replace with real entries
```

### Severity Levels

```
SEV-1  CRITICAL  Financial systems (Stripe, Lago) or auth (JWT)
                 Response: immediate rotation, assess damage, notify users if impacted

SEV-2  HIGH      AI APIs (Gemini), admin access, Infisical credentials
                 Response: rotate within 4 hours, assess usage logs

SEV-3  MEDIUM    Email (Resend), storage (R2), webhooks
                 Response: rotate within 24 hours

SEV-4  LOW       Bot protection, monitoring
                 Response: rotate within 7 days
```

### .env File Accidentally Committed

This is the most common incident. The git history must be treated as permanently compromised.

```bash
# Step 1: Rotate ALL secrets in the .env immediately
# (Assume they are all leaked — don't try to figure out who saw them)

# Step 2: Remove from git history
git filter-repo --invert-paths --path .env
# Or use BFG Repo Cleaner if filter-repo isn't available
# brew install bfg
# bfg --delete-files .env

# Step 3: Force push (coordinate with anyone else on the repo)
git push --force --all

# Step 4: Notify GitHub to purge their caches
# GitHub Settings → Danger Zone → Request cache purge

# Step 5: Document in incident log

# Step 6: Add/verify .gitignore entry and pre-commit hook
```

---

## Security Checklist

Run this checklist quarterly and before any new team member is added:

```
Secrets
□ All secrets stored in Infisical, not in .env files
□ No secrets in GitHub repository (search: git log -p | grep -i 'api_key\|secret\|password')
□ No secrets in Sentry error logs (check Sentry data scrubbing settings)
□ No secrets in application logs (grep production logs for key patterns)
□ Emergency break-glass file exists and is encrypted and up to date
□ Rotation log is current

Access
□ All SSH access via keys — no password auth on VPS
□ Infisical: each person has individual account, no shared credentials
□ GitHub: 2FA enabled on all contributor accounts
□ Infisical machine identity has minimum required scopes
□ Former contributors removed from: VPS SSH, Infisical, GitHub

Rotation
□ All secrets rotated on schedule (check rotation log)
□ CRITICAL secrets (JWT, Stripe) rotated within 180 days
□ HIGH secrets rotated within 90 days

Infrastructure
□ VPS firewall: only ports 22, 80, 443 open
□ Caddy HTTPS certificate valid and auto-renewing
□ Cloudflare proxy active (hides VPS IP)
□ PM2 running as non-root user
```

---

## New Files

```
.gitignore                      # + .env* patterns (verify these exist)
.git/hooks/pre-commit           # Blocks .env commits

scripts/
└── vps-setup.sh               # + Infisical install steps

security/
├── incident-log.txt           # Append-only incident record
└── rotation-log.txt           # Append-only rotation record

# NOT committed to repo — stored in encrypted form only:
outerfit-emergency.env.gpg     # Break-glass encrypted secrets
```

---

## New Environment Variables

The only variables that live outside Infisical are the Infisical credentials themselves — and those live in GitHub Actions secrets and the VPS machine identity config.

```bash
# On VPS — set once during initial setup, then never touch
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...

# In GitHub Actions secrets — set once
INFISICAL_CLIENT_ID
INFISICAL_CLIENT_SECRET
VPS_IP
```

Everything else is in Infisical. Nothing else is in environment files.

---

## The One Rule

If a secret exists outside of Infisical — in a Slack message, a text, an email, a .env file, a GitHub secret that isn't Infisical credentials — it is compromised. Treat it as such and rotate it immediately.

Secrets are shared through Infisical. Not through anything else. Ever.
