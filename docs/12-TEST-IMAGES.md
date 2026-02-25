# THREAD Test Images

*Last Updated: 2026-02-25*

---

## Overview

198 curated product images for dev and test use, covering all wardrobe categories for both genders.

- **Male:** 71 images (Todd Snyder + BlueOwl)
- **Female:** 127 images (Everlane + Fashion Nova + BlueOwl + Shopbop)

---

## Image Host

**`https://glyphmatic.us/tools/thread/`** — stable, we control it.

```
https://glyphmatic.us/tools/thread/male/<filename>
https://glyphmatic.us/tools/thread/female/<filename>
```

> **Never use Shopify CDN URLs directly.** They expire when products are updated.
> Always use glyphmatic.us as the image host for THREAD testing.

---

## Local Paths (gitignored)

```
data/test-images/
  male/     — 71 images
  female/   — 127 images
```

Images are gitignored (too large). Re-download with scrapers in `scripts/`.

---

## Categories Covered

### Male
| Category | Source | Count |
|----------|--------|-------|
| T-shirt, polo | Todd Snyder | 2 each |
| Button-up, hoodie, sweatshirt | Todd Snyder | 2 each |
| Crewneck, v-neck, cardigan, turtleneck sweater | Todd Snyder | 3 each |
| Jacket | Todd Snyder | 2 |
| Sportcoat, suit, trousers, tie | Todd Snyder | 3 each |
| Jeans, pants, shorts | Todd Snyder | 2 each |
| Boots, sneakers, shoes | Todd Snyder | 2 each |
| Belt, hat, socks | Todd Snyder | 2 each |

### Female
| Category | Source | Count |
|----------|--------|-------|
| T-shirt, tank, blouse, button-up | Everlane | 3 each |
| Hoodie, sweatshirt, cardigan, leggings | Everlane | 3 each |
| Flats, sneakers, sandals | Everlane | 3 each |
| Dress (mini/midi/maxi/bodycon) | Fashion Nova | 3 each |
| Dress (babydoll/smock/shift) | Everlane | 3 |
| Skirt (mini/midi/maxi) | Fashion Nova | 2 each |
| Pants (wide-leg/straight/cargo/jogger) | Fashion Nova | 2-3 each |
| Jeans | Fashion Nova | 3 |
| Jacket, coat, blazer | BlueOwl/Kit | 4+ |
| Boots, heels | BlueOwl | 1-2 each |
| Handbag, shoulder bag, crossbody, clutch | Fashion Nova + Cuyana | 2-3 each |
| Belt, scarf, necklace, bracelet, socks | Shopbop | 2 each |
| Earrings, hat | Cuyana | 1 each |

---

## Scraper Scripts

All use Shopify JSON API or CDN extraction — no browser automation needed.

```bash
# Female misc (Everlane)
python3 scripts/scrape-everlane.py

# Male basics + formal (Todd Snyder)
python3 scripts/scrape-toddsnyder.py
python3 scripts/scrape-toddsnyder2.py
python3 scripts/scrape-toddsnyder-formal.py

# Female pants, bags, skirts (Fashion Nova)
python3 scripts/scrape-fashionnova2.py

# Female accessories (Shopbop)
python3 scripts/scrape-shopbop2.py
```

**Technique:** Shopify stores expose `GET /products/<handle>.js` returning JSON with image arrays. Fashion Nova uses HTML CDN extraction. All produce direct download URLs.

**Do NOT scrape Target** — images are broken placeholder files.

---

## Dev vs Test Usage

| Use | How |
|-----|-----|
| **Dev GUI testing** | Run `bash scripts/nuke-dev-db.sh` then upload manually via GUI |
| **Dev bulk load** | Run `bash scripts/load-dev-wardrobe.sh` (198 images via API) |
| **Test suite** | 18-image curated subset seeded automatically in `tests/setup.js` |
| **URL ingestion test** | `TEST_LIVE_URLS=1 npx vitest run tests/ingestion-upload.test.js` |

### Test Suite Subset (18 items)
9 male + 9 female, one per major category, seeded via `tests/setup.js`:

**Male:** t-shirt, button-up, sweater, jacket, jeans, pants, boots, belt, hat  
**Female:** top, blazer, pants, jeans, dress, skirt, boots, heels, handbag

---

## Notes on Image Quality

These are product shots (flat lay or model, white/clean backgrounds), not real wardrobe photos from a phone. Gemini Flash performs well on them but real phone photos will produce better attribute extraction due to more natural context.

Product shots are sufficient for:
- Testing the upload pipeline end-to-end
- Validating compression (full/medium/thumb sizes)
- Exercising the Gemini classification pipeline
- Populating the GUI for visual inspection

They are **not** representative of production user photos.
