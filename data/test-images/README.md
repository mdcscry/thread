# Test Images

Product images for testing THREAD's upload and ingestion features.

## Structure

```
test-images/
  female/   — 127 women's garment images (Everlane, Fashion Nova, BlueOwl)
  male/     — 71 men's garment images (Todd Snyder, BlueOwl)
```

## Categories Covered

### Female
- Tops: tank, t-shirt, blouse, button-up, hoodie, sweatshirt, cardigan, camisole
- Bottoms: jeans, pants (wide-leg, straight, cargo, jogger), shorts, leggings, skirts (mini/midi/maxi/denim)
- Dresses: mini, midi, maxi, bodycon, babydoll/smock, shift
- Outerwear: jacket, coat, blazer
- Footwear: boots, heels, flats, sneakers, sandals
- Accessories: belt, scarf, necklace, bracelet, earrings, socks, handbag (tote, shoulder, crossbody, clutch)

### Male
- Tops: t-shirt, polo, button-up, hoodie, sweatshirt
- Knitwear: crewneck, v-neck, cardigan, turtleneck sweater
- Bottoms: jeans, pants, shorts, trousers/slacks
- Formal: sportcoat, suit jacket, suit pant, tie
- Outerwear: jacket, coat
- Footwear: boots, sneakers, shoes (loafer/oxford)
- Accessories: belt, hat, socks

## Re-downloading

Images are gitignored (too large). Re-run the scrapers:

```bash
python3 scripts/scrape-everlane.py        # female misc
python3 scripts/scrape-toddsnyder.py      # male basics
python3 scripts/scrape-toddsnyder2.py     # male (tighter match)
python3 scripts/scrape-toddsnyder-formal.py  # male formal
python3 scripts/scrape-fashionnova2.py    # female pants/bags/skirts
python3 scripts/scrape-shopbop2.py        # female accessories
```

Sources: Everlane (Shopify API), Todd Snyder (Shopify API), Fashion Nova (CDN), Shopbop (search CDN)
Note: Do NOT use Target — images are placeholder/broken.
