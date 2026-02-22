# THREAD — TODO (2026-02-22)

## 🚧 In Progress

- **Onboarding flow** — 5-question UI, user_preferences table
- **Multi-user invites** — couples sharing via invite links

## 📋 Backlog

### Bugs
- `/items/flagged` 404 (route order issue)
- VacationPlanner crashes on bad input
- Love/Laundry toggle returns ID=0
- `subcategory` stored as string "null"

### Features
- Render deploy (free tier sleeps, $7 always-on)
- Image compression before Ollama (llava)
- Add `weft_color` attribute

### Technical Debt
- Standardize API response envelopes
- Hardcoded paths → env vars

## ✅ Done

- ✅ Export/Import — backup/restore wardrobe as zip
- ✅ Build outfit from item — select an item, get complementary pieces
- ✅ Smoke tests (160 passing)
- ✅ HTTPS with mkcert
- ✅ PM2 self-healing
- ✅ Docker setup
- ✅ Test suite refactoring

## Context
- App: ~/Documents/outerfit/
- Stack: Fastify + sql.js + React
- Server: pm2 (self-healing)
- Tests: npx playwright test
- Login: you@localhost / thread123
