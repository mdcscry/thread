#!/usr/bin/env python3
"""
Scrape Fashion Nova for female wardrobe gaps:
- pants (variety: wide-leg, cargo, trousers, skinny)
- handbags (shoulder, crossbody, clutch, tote)
- skirts (mini, midi, maxi)
- dresses (more variety)
- also fill any other thin categories
"""
import requests, json, re, time
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/fashionnova/female")
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# Collection slug → our category label → max images to grab
TARGETS = [
    ("womens-wide-leg-pants",   "pants-wide-leg",   2),
    ("womens-trousers",         "pants-trousers",   2),
    ("pants-cargo",             "pants-cargo",      2),
    ("womens-skinny-pants",     "pants-skinny",     2),
    ("sweatpants",              "pants-sweatpant",  2),
    ("handbags",                "handbag",          3),
    ("shoulder-bags",           "bag-shoulder",     2),
    ("crossbody-bags",          "bag-crossbody",    2),
    ("clutches",                "bag-clutch",       2),
    ("mini-skirts",             "skirt-mini",       2),
    ("midi-skirts",             "skirt-midi",       2),
    ("maxi-skirts",             "skirt-maxi",       2),
    ("denim-skirts",            "skirt-denim",      2),
    ("mini-dresses",            "dress-mini",       2),
    ("midi-dresses",            "dress-midi",       2),
    ("maxi-dresses",            "dress-maxi",       2),
]

def fetch_products(collection_slug, limit=10):
    url = f"https://www.fashionnova.com/collections/{collection_slug}/products.json?limit={limit}"
    r = requests.get(url, headers=HEADERS, timeout=15)
    if r.status_code != 200:
        return []
    return r.json().get("products", [])

def fetch_product_images(handle):
    url = f"https://www.fashionnova.com/products/{handle}.js"
    r = requests.get(url, headers=HEADERS, timeout=15)
    d = r.json()
    imgs = d.get("images", [])
    return [f"https:{img}" if str(img).startswith("//") else str(img) for img in imgs[:2]]

def download_image(url, dest_path):
    r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
    if r.status_code == 200 and len(r.content) > 10000:
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    return False

results = {}
for collection_slug, cat_label, max_imgs in TARGETS:
    print(f"\n[{cat_label}] collection: {collection_slug}")
    products = fetch_products(collection_slug, limit=10)
    print(f"  {len(products)} products found")
    if not products:
        results[cat_label] = 0
        continue

    saved = 0
    for product in products:
        if saved >= max_imgs:
            break
        handle = product["handle"]
        try:
            imgs = fetch_product_images(handle)
            time.sleep(0.25)
            for img_url in imgs[:1]:
                slug = re.sub(r'[^a-z0-9-]', '-', handle)[:45]
                filename = f"fn-{cat_label}-{slug}.jpg"
                dest = OUT_DIR / filename
                if dest.exists():
                    saved += 1
                    break
                print(f"  Downloading {filename}...")
                if download_image(img_url, dest):
                    print(f"  ✓ {dest.stat().st_size//1024}KB")
                    saved += 1
                    break
        except Exception as e:
            print(f"  ✗ {handle}: {e}")
        time.sleep(0.25)

    results[cat_label] = saved
    time.sleep(0.5)

print("\n=== SUMMARY ===")
for cat, count in results.items():
    status = "✓" if count > 0 else "✗ MISSING"
    print(f"  {status} {cat}: {count}")
print(f"\nTotal: {sum(results.values())} images → {OUT_DIR}")
