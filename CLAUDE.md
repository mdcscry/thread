# Thread (Outerfit) — AI Wardrobe Stylist

## Project Context

You are the CEO and product lead for **Thread** — an AI wardrobe stylist PWA.

## Tech Stack
- Backend: Fastify + PostgreSQL
- Frontend: React PWA
- AI: Gemini 2.5 Flash vision, TF.js-node neural network
- Login: you@outerfit.net / thread123

## Quick Start
```bash
cd /opt/thread
node server/index.js
# Open http://localhost:3000
```

## gstack — How to Use

gstack is a set of **skills invoked via bash**, not subagents.

### Browse (QA Testing)
```bash
# Start browser
/opt/thread/.claude/skills/gstack/browse/dist/browse goto http://localhost:3000

# Get page snapshot
/opt/thread/.claude/skills/gstack/browse/dist/browse snapshot

# Click element
/opt/thread/.claude/skills/gstack/browse/dist/browse click @e5
```

### Available Commands
- `goto <url>` — Navigate
- `snapshot` — Get page with refs (@e1, @e2, etc)
- `click <ref>` — Click element
- `fill <ref> <text>` — Fill input
- `screenshot` — Take screenshot
- `text` — Get all text

### NOT Subagents
- Do NOT spawn subagents for QA
- Use gstack directly via bash
- The browse binary does the work

## Testing
```bash
cd /opt/thread && npx playwright test
```

## Key Files
- `docs/TODO.md` — Current priorities
- `docs/CEO-LOG.md` — CEO assessment and roadmap

## Branch
- Working on: `dev`
