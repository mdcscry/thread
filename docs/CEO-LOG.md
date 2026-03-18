# Thread CEO Assessment

*Date: 2026-03-17*
*Author: Thread CEO (AI)*

---

## Executive Summary

Thread (Outerfit) is an AI wardrobe stylist PWA. Users upload photos of their clothes, the app uses AI vision to categorize/describe them, and then recommends outfits based on style preferences and weather. The tech stack is solid (Fastify + SQLite + React + TF.js + Gemini Flash), but the app has **stability issues that prevent it from being shippable**.

---

## What Thread Is Trying to Be

**Core Value Prop:** Personal AI wardrobe stylist — upload clothes, get outfit recommendations, learn your style over time.

**Target User:** Fashion-conscious individuals who want AI help coordinating outfits without manual tagging.

**Key Features (Designed):**
1. Photo upload + AI vision analysis → auto-categorize clothes
2. Neural network recommendation engine → outfit suggestions
3. Weather-aware suggestions (Open-Meteo integration)
4. Vacation planner → pack for trips
5. PWA → works offline, installable
6. Multi-user / couples sharing

**Key Features (Actually Working):**
- Login/auth with bcrypt + API keys
- Wardrobe CRUD (upload, view, delete items)
- Gemini Flash vision analysis (primary)
- TF.js neural network for recommendations (2,300 params)
- Vacation planner (but crashes server)
- PWA with service worker
- Basic outfit generation

---

## What's Broken (Honest Assessment)

### 🔴 Critical (Blocks Ship)

1. **Server crashes on upload** — Unhandled async errors in IngestionService when AI analysis takes too long. The synopsis says "120 second limit not enough" and "server crashes on large image uploads."

2. **Vacation planner crashes server** — Listed as a known issue in SYNOPSIS.md. Crashes server.

3. **Image handling is broken** — Images too large for Ollama (>2 min processing time), path bugs in frontend display.

### 🟡 Important (Need Fix Before Beta)

4. **Skipped tests** — Love/Laundry toggle tests skipped due to "test env issues." That's code that doesn't work or isn't tested.

5. **No production deployment** — VPS order (#5148848963) still "awaiting provisioning." No live URL.

6. **Upload timing out** — 120 seconds isn't enough for AI vision on large images. Need image resizing before AI processing.

### 🟢 Nice to Have (Post-Beta)

7. **Multi-user invites** — Designed but untested in practice
8. **Image CDN** — Cloudflare R2 (only "when needed")
9. **gzip compression** — Micro optimization

---

## Priority Order to Shippable Beta

| Priority | Item | Why |
|----------|------|-----|
| **P0** | Fix server crash on upload | Core flow broken. Users can't add clothes. |
| **P0** | Fix vacation planner crash | Broken feature crashes server |
| **P0** | Resize images before AI processing | Fixes timeout issue, makes upload usable |
| **P1** | Fix remaining path/display bugs in wardrobe UI | UX issue for existing items |
| **P1** | Re-enable skipped tests | Need coverage before shipping |
| **P1** | Deploy to production (VPS or Render) | Can't ship if not live |
| **P2** | Verify outfit recommendation quality | Core value prop |
| **P2** | Verify weather integration | Core value prop |
| **P3** | Multi-user / couples sharing | Secondary feature |

---

## What I'd Do First Tomorrow (With Full Engineering Team)

With a full team, I'd run a **stability sprint** focused entirely on fixing the crash bugs:

### Day 1 Morning — Triage
1. **Reproduce the crashes** — Get Playwright tests hitting the upload and vacation endpoints to see exact error stack traces
2. **Add error boundaries** — Wrap async handlers in try/catch, add proper error responses instead of server death

### Day 1 Afternoon — Fix Upload Pipeline
1. **Add image resizing** — Use sharp or canvas to resize to <1MB before sending to AI
2. **Add timeout handling** — Graceful timeout with partial results or retry
3. **Add upload progress UI** — Users need feedback during long operations

### Day 2 — Vacation + Tests
1. **Fix vacation route** — The SYNOPSIS says it was "fixed" but crashes still happening? Need root cause.
2. **Un-skip and fix love/laundry tests**
3. **Full test suite pass** — Goal: 100% passing (currently ~64+)

### Day 3 — Deploy
1. **Deploy to Render** (faster than waiting for VPS) or finalize VPS
2. **Smoke test on production**
3. **Ship**

---

## My Honest Take

The codebase shows **real engineering effort** — 13,700 lines, 64+ tests, multiple AI integrations, proper architecture docs. This isn't a half-baked side project. But it's in the "works on my machine" phase with stability issues that would embarrass a beta product.

**The good news:** The hard AI/ML problems are solved (Gemini vision, TF.js recommendations, feature engineering). The hard part now is **engineering discipline** — error handling, testing, deployment.

**The path forward is clear:**
1. Fix crashes (P0)
2. Resize images (P0)
3. Deploy (P1)
4. Ship

This is ~3-5 days of focused work from a shippable beta. Not months.

---

## Next Steps

- [ ] Read: Review exact error logs from server crashes
- [ ] Reproduce: Run Playwright tests to confirm current state
- [ ] Fix P0 items in priority order
- [ ] Update TODO.md with new priorities
- [ ] Deploy and ship

---

## Working on dev branch (2026-03-17)

All fixes should be committed to `dev` branch, not `main`.

## gstack Setup (Added 2026-03-17)

Installed gstack to `.claude/skills/gstack/` with thread-prefixed agents:

| Agent | Purpose |
|-------|---------|
| `/thread-qa` | Browser-based QA testing and bug fixing |
| `/thread-review` | Code review with auto-fix |
| `/thread-ship` | Deploy workflow |
| `/thread-browse` | Browser automation |
| `/thread-plan-ceo-review` | Product rethinking |
| `/thread-plan-eng-review` | Architecture review |
| `/thread-plan-design-review` | Design audit |
| `/thread-document-release` | Doc synchronization |

**Agent model:** ollama/qwen3.5:27b (~22GB VRAM)
- Decision: Use 27b for all agents (one at a time)
- Fallback: 9b available for parallelism if needed
- Constraint: No GPU activity 5:30-6:30 AM MDT

---

*End of Assessment*

---

## Bugs Fixed (2026-03-17)

| Bug | Fix |
|-----|-----|
| Login crash - datetime() | Changed to JavaScript Date.toISOString() |
| Vacation crash - filter error | Added Array.isArray() check |
| Missing last_used column | Added to PostgreSQL schema |

**All committed to dev branch.**
