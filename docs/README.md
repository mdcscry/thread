# THREAD — AI Wardrobe Stylist

Your personal AI wardrobe stylist. Upload clothes, get outfit recommendations, learn your style.

## 🚀 Quick Start

```bash
cd ~/Documents/outerfit
npm install
node server/index.js
# Open http://localhost:3000
```

**Login:** `you@localhost` / `thread123`

## 🧪 Testing

### Run All Tests
```bash
# Using the deploy script (recommended)
./scripts/deploy.sh test

# Or run manually
node tests/feature-engine.test.js    # Unit tests (41 passing)
node tests/gemini-vision.test.js     # Unit tests (20 passing)
npx playwright test tests/api-smoke.spec.js  # API tests (4 passing)
```

### Test Strategy

| Test Type | Command | Speed | When |
|-----------|---------|-------|------|
| Unit tests | `node tests/feature-engine.test.js` | <5s | Every commit |
| Unit tests | `node tests/gemini-vision.test.js` | <5s | Every commit |
| API smoke | `npx playwright test tests/api-smoke.spec.js` | ~2s | Every commit |
| Full suite | `npx playwright test` | ~2min | Before deploy |

### Regression Checklist Before Deploy
- [ ] Run unit tests (`node tests/*.test.js`)
- [ ] Run API smoke tests (`npx playwright test tests/api-smoke.spec.js`)
- [ ] Restart server (`pm2 restart thread`)
- [ ] Test manually in browser

## 🚀 Deployment

### Local Development
```bash
# Start server
pm2 start "node server/index.js" --name thread

# Restart
pm2 restart thread

# View logs
pm2 logs thread
```

### CI/CD Pipeline
```bash
# Run tests
./scripts/deploy.sh test

# Deploy to QA (requires qa branch)
./scripts/deploy.sh deploy-qa

# Promote to production
./scripts/deploy.sh promote
```

### Production (VPS)
```bash
# On VPS after provisioning:
./scripts/vps-setup.sh      # One-time setup

# Deploy updates:
./scripts/deploy-vps.sh     # Over Tailscale
```

## 📚 Documentation

### Design Docs (Historical)
- [original_design/](original_design/) — Original design specs (outdated)
- [DESIGN-VS-IMPLEMENTATION.md](DESIGN-VS-IMPLEMENTATION.md) — What changed

### Feature Docs
- [outfit-trainer-design.md](outfit-trainer-design.md) — Neural network recommendation system
- [user-profile-design.md](user-profile-design.md) — Auth & profile features
- [ONBOARDING.md](ONBOARDING.md) — User onboarding flow

### Meta
- [TODO.md](TODO.md) — Current priorities
- [SYNOPSIS.md](SYNOPSIS.md) — Session notes & current state
- [DEPLOY.md](DEPLOY.md) — Deployment guide
- [RELEASE.md](RELEASE.md) — Release notes

## 🛠️ Commands# Start2 start " server
pm

```bash
node server/index.js" --name thread

# Restart
pm2 restart thread

# View logs
pm2 logs thread

# Run tests
npx playwright test

# Build frontend
cd client && npm run build
```

## 🔗 Links

- **App:** http://localhost:3000
- **API Key:** thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934
- **Domain:** outerfit.net (Cloudflare, awaiting VPS)
- **VPS:** DatabaseMart order #5148848963 (RTX Pro 4000 Ada)

## 📊 Stats

- **~13,700 lines** of code
- **65+ tests** passing
- **Stack:** Fastify + sql.js + React + TF.js-node

## 🔄 Keeping Deployment in Sync

### When You Make Changes

1. **Code changes** → Run tests locally → Push to GitHub
2. **Config changes** (env vars, new keys) → Update `.env` on VPS manually
3. **New dependencies** → Update `package.json` → Rebuild → Redeploy
4. **Database migrations** → Run on server (`pm2 restart thread` auto-runs migrations)

### Files That Need Manual VPS Sync

| File | Sync Method |
|------|-------------|
| `.env` | Copy manually to VPS |
| `data/` | Already on VPS disk |
| `scripts/` | Deploy script syncs these |

### Deployment Checklist

Before any deploy:
```bash
# 1. Run full test suite
./scripts/deploy.sh test

# 2. Check for breaking changes
git log --oneline main..HEAD

# 3. If DB schema changed, test migration locally first
node server/db/migrate.js

# 4. Deploy
./scripts/deploy-vps.sh  # or ./scripts/deploy.sh promote
```

### If Deploy Breaks

1. **Rollback:** `git revert` + push + redeploy
2. **Hotfix:** Fix locally, test, push, redeploy
3. **Database issue:** Restore from backup `./scripts/backup-from-vps.sh`
