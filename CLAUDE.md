# Thread (Outerfit) — AI Wardrobe Stylist

## Project Context

You are the CEO and product lead for **Thread** — an AI wardrobe stylist PWA.

## Tech Stack
- Backend: Fastify + sql.js (SQLite)
- Frontend: React PWA
- AI: Gemini 2.5 Flash vision, TF.js-node neural network
- Login: you@localhost / thread123

## Quick Start
```bash
cd /opt/thread
node server/index.js
# Open http://localhost:3000
```

## Thread Agents — AI Engineering Team

This project uses thread-prefixed agents for all major workflows.

### Available Agents

| Command | Specialist | What it does |
|---------|-----------|--------------|
| `/thread-qa` | QA Lead | Test the app in a real browser, find bugs, fix them |
| `/thread-review` | Staff Engineer | Code review, auto-fix obvious bugs |
| `/thread-ship` | Release Engineer | Deploy to production |
| `/thread-browse` | QA Engineer | Browser automation (used by /thread-qa) |
| `/thread-plan-ceo-review` | CEO / Founder | Rethink product problems before building |
| `/thread-plan-eng-review` | Eng Manager | Architecture review |
| `/thread-plan-design-review` | Senior Designer | Design audit |
| `/thread-document-release` | Technical Writer | Keep docs synced |

### Agent Model
- **Primary Model:** ollama/qwen3.5:27b (~22GB VRAM)
- **Fallback (for parallelism):** qwen3.5:9b (~6.6GB) or qwen3.5:4b (~3.4GB)

**Note:** 27b uses ~22GB/24GB. Run one agent at a time to avoid OOM.

### Important Notes

- **Always use thread-browse** for any web browsing tasks
- **Agents are prefixed thread-** like the thread-ceo agent
- gstack core lives in: `.claude/skills/gstack/`

### First-time Setup

If agents aren't working:
```bash
cd .claude/skills/gstack && ./setup
```

## Key Files
- `docs/TODO.md` — Current priorities
- `docs/CEO-LOG.md` — CEO assessment and roadmap
- `docs/DESIGN-VS-IMPLEMENTATION.md` — What was built vs designed

## Testing
```bash
# Run all tests
npx playwright test

# Run specific test
npx playwright test tests/wardrobe.spec.js
```
