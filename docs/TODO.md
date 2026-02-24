# THREAD — TODO

*Last Updated: 2026-02-23*

## 🚧 In Progress

- **VPS deployment** — awaiting DatabaseMart provisioning (order #5148848963)
- ✅ **Profile UI expansion** — gender_identity, style_presentation, build, fit prefs, use cases

## 📋 Backlog

### Nice to Have
- Image CDN (Cloudflare R2 free tier) — only when needed
- @fastify/compress (gzip) — micro optimization
- Render deploy — only if VPS doesn't work out

### Low Priority
- Standardize API response envelopes — works fine as-is

## ✅ DONE

### This Session
- ✅ **Sign-up with Turnstile** — Cloudflare bot protection, rate limiting
- ✅ **Auth endpoints** — /auth/register, /auth/login with bcrypt
- ✅ **Docs consolidated** — all in docs/ with Mermaid diagrams
- ✅ **Design vs Implementation** — analysis doc created

### Earlier
- ✅ **Outfit Trainer v2** — TF.js neural network, 2,300 params
- ✅ **Feature Engine** — 57-dim feature vectors
- ✅ **Gemini Vision** — Gemini 2.5 Flash
- ✅ **Production hardening** — helmet, rate-limit
- ✅ **VPS scripts** — setup, deploy, backup
- ✅ **Domain** — outerfit.net
- ✅ **Export/Import** — zip backup/restore
- ✅ **Build outfit from item** — complementary pieces
- ✅ **Onboarding flow** — 5-question UI
- ✅ **Multi-user invites** — couples sharing

## 📚 Documentation (docs/)

### Design Docs (01-13)
- `01-ARCHITECTURE.md` — **Complete system architecture** with Mermaid diagrams
- `02-DATABASE-SCHEMA.md` — DB schema
- `03-AI-ML-DESIGN.md` — AI/ML design
- `04-INGESTION-PIPELINE.md` — Photo ingestion
- `05-OUTFIT-ENGINE.md` — Outfit generation
- `06-VACATION-PLANNER.md` — Vacation mode
- `07-API-WEBHOOKS.md` — API & webhooks
- `08-MOBILE-PWA.md` — Mobile/PWA
- `09-FRONTEND-DESIGN.md` — Frontend design
- `10-SETUP-DEPLOYMENT.md` — Setup & deploy
- `11-HARD-PROBLEMS-AND-REVISIONS.md` — Hard problems
- `12-FEEDBACK-AND-PHONE-INTEGRATION.md` — Feedback system
- `13-ML-ENSEMBLE-SERVICE.md` — ML ensemble

### Feature Docs
- `outfit-trainer-design.md` — Neural network recommendation system
- `user-profile-design.md` — Auth & profile features
- `ONBOARDING.md` — User onboarding flow

### Meta Docs
- `README.md` — Main readme
- `SYNOPSIS.md` — Current state overview
- `TODO.md` — This file
- `DEPLOY.md` — Deployment notes
- `RELEASE.md` — Release notes
- `DESIGN-VS-IMPLEMENTATION.md` — Design vs actual implementation

## 🔗 Quick Links

- **App:** http://localhost:3000
- **Login:** you@localhost / thread123
- **API Key:** thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934
- **Tests:** `npx playwright test`
- **Domain:** outerfit.net (Cloudflare DNS ready)

## 🧪 Test Commands

```bash
# Run all tests
cd ~/Documents/outerfit && npx playwright test

# Run specific test file
cd ~/Documents/outerfit && npx playwright test tests/wardrobe.spec.js

# Run unit tests
node tests/feature-engine.test.js
node tests/gemini-vision.test.js
```

## 📊 Stats

- **Total lines:** ~13,700
- **Tests:** 64+ passing
- **Models:** Gemini Flash, Ollama (llava:7b, llama3.2:3b)
- **Stack:** Fastify + sql.js + React + TF.js-node
