# Plot Lines — Product & Business Plan

*Document created: 2026-02-26*
*Status: Planning*
*Company: Outerfit LLC*

---

## What Is It

Plot Lines is an AI-generated garden dialog newsletter. Real gardening characters — 12 distinct personalities with their own voices, opinions, grudges, and obsessions — talk to each other about what's happening in the garden right now, in your region, in your weather, written in the style of your chosen American author.

Every email is location-aware. Every email is unique. It feels like eavesdropping on your neighbors over the fence.

---

## The Characters

12 Colorado-originated gardeners, now stateless — their personalities travel anywhere:

| Character | Model | Voice |
|-----------|-------|-------|
| Buck Thorn | opus46 | Practical, tools, gets things done |
| Harry Kvetch | haiku | Grumpy, specific complaints, always right |
| Ms. Canthus | haiku | Cheerful, poetic, secret matchmaker |
| Poppy Seed | haiku | Enthusiastic, CAPS, seed obsessive |
| Ivy League | sonnet46 | Horticultural Latin, Kew credentials |
| Chelsea Flower | sonnet46 | Designer eye, beauty-first |
| Buster Native | haiku | Native plant purist, xeriscape evangelist |
| Fern Young | sonnet46 | Experimental, fiddlehead puns |
| Esther Potts | haiku | Container gardener, color/texture obsessive, single |
| Herb Berryman | sonnet46 | Herbalist, wildcrafting, Grateful Dead energy, single |
| Muso Maple | haiku | Zen Japanese garden, one sentence lands like a stone |
| Edie Bell | sonnet46 | Food gardener, variety obsessive, EDI-BLE + BELL peppers |

**Subplot:** Ms. Canthus is obviously trying to set up Esther and Herb. Everyone sees it except Esther.

---

## Author Styles

12 American authors, loaded from `authors.json`:

hemingway (default), carver, munro, morrison, oates, lopez, strout, bass, mccarthy, oconnor, hurston, saunders

Subscriber picks their author at signup. Same characters, completely different prose texture.

---

## Pricing

| Tier | Price | ARR @ 2,000 subs |
|------|-------|-----------------|
| Weekly | $1.99/week | ~$207K |
| Daily | $3.99/day | ~$2.9M (aspirational) |

**Realistic target:** 2,000 subscribers mixed weekly/daily = $250-300K ARR

---

## The Free Sample Funnel

1. Visitor lands on plotlines.com
2. Enters: city, state, favorite author
3. **Gets emailed** a short 2-3 character dialog — no on-page preview
4. They gave their email to get the sample. That's the lead capture.
5. "Want this every morning? Subscribe."

**Why email-only:** Can't screenshot and share a personalized email the same way. The product IS the personalization. To get your version, you subscribe.

---

## Natural Paywall (Personalization as Moat)

Your subscription is yours:
- Your region's weather and gardening context
- Your chosen author style
- Your masthead

Someone forwards you an email? It's not theirs. They're in Denver, you're in Seattle. Different weather, different plants, different feel. Get your own.

**Author variety as upgrade friction:** Friend shows you a Hemingway conversation. You want Flannery O'Connor. That's your subscription to configure.

---

## The Masthead System

Each email arrives with a unique masthead image generated from:

- **NWS forecast office** (your region — ~122 offices across US)
- **Author** (your pick — 12 options)
- **Weather type** (sunny, cloudy, rainy, stormy, frost, heat — 6 types)
- **Season** (spring, summer, fall, winter — 4 seasons)

**Total combinations:** 122 × 12 × 6 × 4 = **35,136 possible mastheads**

### Generation Strategy: Bootstrap (Build As We Go)

- Nothing generated upfront. Zero startup cost.
- First signup from a new region → generate that station's mastheads on demand
- First subscriber picks a new author → generate that author's variants
- Cache as bitmaps in database — never generate again for that combination
- Cost scales with actual subscribers, not hypothetical ones
- Year one realistic cost: **whatever your subscribers actually need**

### Cost Breakdown

| Method | Per Image | 14,400 images (50 stations) |
|--------|-----------|----------------------------|
| Standard API | ~$0.10 | ~$1,440 |
| Batch API | ~$0.067 | ~$965 |
| Third-party | ~$0.05 | ~$720 |
| Subscription | <$0.01 | <$144 |
| Gemini 2.5 Flash | ~half price | ~$72-360 |

**Recommended:** Z-Image Turbo via Ollama on VPS (RTX Pro 4000 Ada, 24GB VRAM). 2-5 seconds per image, runs local, cost = electricity. Bootstrap — generate on first subscriber need, cache forever.

### Masthead Names

Names change with season and weather. Examples:
- *The Frost Line* — November, cold
- *The Dry Spell Dispatch* — August, heat
- *Notes from the Mud* — March, rain
- *The Late Thaw* — April, lingering cold
- *The Burn* — July, hot and dry

The newsletter title on the masthead is generative. The URL is always plotlines.com.

---

## The Name

**Plot Lines**

Triple meaning:
1. A garden plot — the physical space where food grows
2. A plot — story, drama, characters with arcs
3. Plot lines — like newspaper column headers

URL: **plotlines.com** *(check availability)*

### Other Names (A/B Test Candidates)

Could run multiple signup pages, each with a different masthead name, to A/B test conversion:

- The Fence Line
- Root & Rant
- Notes from the Loam
- Over the Hedge
- Sage Advice
- Earth & Ink

Subscriber **chooses their masthead** at signup from a menu. Or auto-assigned by region with option to change.

---

## Social Distribution Strategy

Characters make cameo appearances in real gardening communities online:

- **r/vegetablegardening** — Edie on tomato varieties, Harry on compost failures
- **Native plant Facebook groups** — Buster Native
- **Zen garden forums** — Muso (one sentence, disappears)
- **Cottage garden Pinterest** — Chelsea
- **Heirloom seed communities** — Edie, Poppy Seed

Each comment ends with:
> *"If you'd like to hear more from [Character], visit Plot Lines: plotlines.com"*

### Workflow
1. molti finds good post overnight
2. Writes character-appropriate response
3. Emails to matte_d_scry with Reddit link + formatted response
4. matte_d_scry reviews, pastes, posts manually
5. **Human posts, not bot** — no ToS risk

### First Test Drop (2026-02-26)
- Post: r/vegetablegardening — "I cannot deprive myself of growing anything"
- Character: Edie Bell (200 pots, 18 tomato varieties — perfect fit)
- Response written and emailed ✅

---

## The Freebie Strategy

- ~1 surprise email per month to all subscribers
- No schedule, unexpected
- "Just because" — a short extra conversation, a seasonal tip, a character moment
- Keeps list warm
- Low unsubscribe rate — never feels like a grind

**Persona:** matte_d_scry presents as a real Boulder gardener with a weird passion project that got out of hand. Not a startup. Authentic.

---

## Technical Stack

### Already Built
- `garden-daily-v2.py` — full generation engine
- Location-aware via Nominatim → NWS points API → forecast office
- 12 characters, 12 authors (external `authors.json`)
- AFD weather fetch (NWS Area Forecast Discussion)
- Garden context generation + caching by station code
- Archive system: `memory/STATION/AUTHOR/YYYY-MM-DD.md`
- `--location "City, State"` flag
- `--author` flag (random or specific)
- `--no-email` test flag

### Still To Build
- plotlines.com landing page
- Email list / subscription management (Ghost, Substack, or custom)
- Free sample generation endpoint
- Masthead image generation pipeline (Gemini 2.5 Flash)
- Masthead database + lazy generation on new region signup
- Payment processing ($1.99/wk, $3.99/day)
- Daily cron for v2 (separate from v1 production cron)

### Infrastructure
- **VPS:** DatabaseMart, 38.247.187.229 — RTX Pro 4000 Ada (24GB VRAM), Ubuntu 22
- **Local models:** Ollama on VPS — marginal cost per conversation = electricity
- **Implication:** Free samples can run on-demand for every visitor, no rate limits, no per-token cost

---

## Business Case

### Why It Works
- **Niche but passionate:** Gardeners pay for quality content
- **Genuinely unique:** Nothing else like it
- **Personalization as moat:** Can't share your subscription effectively
- **Author variety:** Multiple reasons to upgrade/stay
- **Location-aware:** Every subscriber gets *their* garden, *their* weather
- **Near-zero marginal cost** on local inference

### The Flywheel
1. Plot Lines → cash flow
2. Cash flow → investment fund (molti manages)
3. Investments compound
4. Eventually: self-funded AI operation

### Relationship to outerfit
- Plot Lines ships first — faster, simpler, proves the model
- Revenue funds outerfit development (harder problem, bigger TAM)
- Same DNA: AI that feels personal, location-aware, knows you
- That's a thesis, not a coincidence

---

## Open Questions

- [ ] Is plotlines.com available?
- [ ] Ghost vs Substack vs custom for email delivery?
- [ ] Which Nano Banana / image model for masthead generation?
- [ ] Subscription platform for payments?
- [ ] Do we want subscriber-chosen mastheads or auto-assigned by region?
- [ ] How many characters per daily email? (Currently 3-4)
- [ ] Weekly digest format vs daily single conversation?

---

*Next step: Get on the VPS, get the site up, get the first real signup.*
