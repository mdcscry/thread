# Design vs Implementation Analysis

*Created: 2026-02-23*

This document compares the original design specs (01-13) to what's actually implemented.

---

## Key Changes from Design

### Stack Changes

| Design Said | What We Actually Have | Status |
|-------------|----------------------|--------|
| Knex.js | **sql.js** (SQLite in-memory, saved to disk) | ⚠️ Different |
| better-sqlite3 | **sql.js** | ⚠️ Changed |
| Zustand | **React useState/useEffect** | ⚠️ Simpler |
| TanStack Query | **fetch directly** | ⚠️ Simpler |
| BullMQ + Redis | **No background queue** | ✅ Simplified |
| JWT + bcrypt | **API key auth** + bcrypt added for sign-up | ⚠️ Hybrid |
| Caddy for HTTPS | **mkcert** for local, Cloudflare for prod | ✅ Works |

---

### AI/ML Changes

| Design Said | What We Actually Have | Status |
|-------------|----------------------|--------|
| Ollama only | **Gemini Flash** (primary) + **Ollama** (fallback) + **MiniMax** (fallback) | 🔄 More options |
| Local only | **Cloud vision API** (free tier) | ✅ Better |
| TF.js PreferenceModel | **TrainerService.js** with TF.js-node, 2,300 params | ✅ Implemented |
| Collaborative filtering | **Content-based** (single user, no matrix factorization) | ✅ Corrected |

---

### Feature Implementation Status

| Design Doc | Feature | Actual State |
|------------|---------|--------------|
| 01-ARCHITECTURE | Full stack | Partial - simplified |
| 02-DATABASE-SCHEMA | DB schema | ✅ Mostly matches |
| 03-AI-ML-DESIGN | Vision + ML | ✅ Gemini added, Ollama fallback |
| 04-INGESTION | Photo upload | ✅ Works with vision |
| 05-OUTFIT-ENGINE | Outfit gen | ✅ Works |
| 06-VACATION | Vacation mode | ✅ Works |
| 07-API-WEBHOOKS | API + webhooks | ✅ Basic |
| 08-MOBILE-PWA | PWA | ✅ Installed, offline |
| 09-FRONTEND | UI design | ✅ Implemented |
| 10-SETUP | Deployment | ✅ Local + VPS scripts |
| 11-HARD-PROBLEMS | Issues | ✅ Resolved |
| 12-FEEDBACK | Feedback system | ✅ Outfit Trainer v2 |
| 13-ML-ENSEMBLE | ML ensemble | ✅ Simplified to single NN |

---

## What's Still Accurate

### ✅ Still Matches Design
- Fastify backend
- React + Vite frontend
- SQLite for data
- Open-Meteo for weather
- PM2 for process management
- Basic API key auth
- PWA with service worker

### ✅ New Things Not in Original Design
- **Cloudflare Turnstile** for bot protection
- **User profile expansion** (gender_identity, style_presentation, etc.)
- **VPS deployment scripts** (DatabaseMart, Tailscale)
- **outerfit.net** domain
- **Neural network** (TF.js) for outfit recommendations

---

## Recommendations

1. **Update 01-ARCHITECTURE.md** to reflect sql.js instead of Knex
2. **Update 03-AI-ML-DESIGN.md** to document Gemini Flash as primary
3. **Update 13-ML-ENSEMBLE.md** to reflect single NN (not ensemble)
4. **Add new section** for Turnstile + user profiles

---

## Files Needing Updates

- [ ] 01-ARCHITECTURE.md
- [ ] 03-AI-ML-DESIGN.md  
- [ ] 13-ML-ENSEMBLE-SERVICE.md
- [ ] Add: 14-TURNSTILE-BOT-PROTECTION.md
- [ ] Add: 15-USER-PROFILES.md
