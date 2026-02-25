#!/usr/bin/env python3
"""
Scrape Todd Snyder product images for men's wardrobe categories.
Shopify JSON API — same trick as Everlane.
"""
import requests, json, re, time, os
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/toddsnyder/male")
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# Male outerfit categories → Todd Snyder product types + keywords
TARGETS = {
    "t-shirt":   {"types": ["T-Shirt"], "keywords": ["t-shirt", "tee", "pocket tee"]},
    "button-up": {"types": ["Shirt"],   "keywords": ["shirt", "oxford", "flannel", "chambray"]},
    "knitwear":  {"types": ["Sweater", "TS KNITS"], "keywords": ["sweater", "knit", "crewneck", "v-neck"]},
    "hoodie":    {"types": ["Sweatshirt"], "keywords": ["hoodie", "hooded"]},
    "sweatshirt":{"types": ["Sweatshirt"], "keywords": ["sweatshirt", "crew", "fleece"]},
    "jacket":    {"types": ["Outerwear", "Sportcoat"], "keywords": ["jacket", "blazer", "coat", "bomber", "anorak"]},
    "jeans":     {"types": ["Pants"],   "keywords": ["jean", "denim"]},
    "pants":     {"types": ["Pants", "Sweatpant"], "keywords": ["pant", "chino", "trouser", "sweatpant"]},
    "shorts":    {"types": ["Shorts"],  "keywords": ["short"]},
    "boots":     {"types": ["Shoes"],   "keywords": ["boot", "chelsea", "chukka"]},
    "sneakers":  {"types": ["Shoes"],   "keywords": ["sneaker", "trainer", "court"]},
    "shoes":     {"types": ["Shoes"],   "keywords": ["loafer", "oxford", "dress shoe", "moccasin", "slip"]},
    "belt":      {"types": ["Belt"],    "keywords": ["belt"]},
    "hat":       {"types": ["Hat"],     "keywords": ["hat", "cap", "beanie"]},
    "socks":     {"types": ["Socks"],   "keywords": ["sock"]},
    "polo":      {"types": ["Polo"],    "keywords": ["polo"]},
}

def fetch_all_products():
    all_products = []
    for page in range(1, 6):
        url = f"https://www.toddsnyder.com/collections/all/products.json?limit=250&page={page}"
        r = requests.get(url, headers=HEADERS, timeout=15)
        products = r.json().get("products", [])
        if not products:
            break
        all_products.extend(products)
        print(f"  Page {page}: {len(products)} products")
        time.sleep(0.4)
    return all_products

def fetch_product_images(handle):
    url = f"https://www.toddsnyder.com/products/{handle}.js"
    r = requests.get(url, headers=HEADERS, timeout=15)
    d = r.json()
    return [f"https:{img}" if img.startswith("//") else img for img in d.get("images", [])[:2]]

def download_image(url, dest_path):
    r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
    if r.status_code == 200 and len(r.content) > 5000:
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    return False

def matches(product, cat_def):
    title = product["title"].lower()
    handle = product["handle"].lower()
    ptype = product.get("product_type", "").lower()
    tags = " ".join(product.get("tags", [])).lower()
    combined = f"{title} {handle} {ptype} {tags}"
    type_match = ptype in [t.lower() for t in cat_def["types"]]
    kw_match = any(kw in combined for kw in cat_def["keywords"])
    return type_match or kw_match

print("Fetching Todd Snyder catalog...")
all_products = fetch_all_products()
print(f"Total: {len(all_products)} products\n")

results = {}
for cat, cat_def in TARGETS.items():
    matched = [p for p in all_products if matches(p, cat_def)]
    print(f"[{cat}] {len(matched)} matches")

    saved = 0
    for product in matched[:4]:
        if saved >= 2:
            break
        handle = product["handle"]
        try:
            imgs = fetch_product_images(handle)
            time.sleep(0.3)
            for img_url in imgs[:1]:
                slug = re.sub(r'[^a-z0-9-]', '-', handle)[:50]
                filename = f"toddsnyder-{cat}-{slug}.jpg"
                dest = OUT_DIR / filename
                if dest.exists():
                    print(f"  ✓ Already have: {filename}")
                    saved += 1
                    break
                print(f"  Downloading {filename}...")
                if download_image(img_url, dest):
                    print(f"  ✓ Saved ({dest.stat().st_size//1024}KB)")
                    saved += 1
                    break
                else:
                    print(f"  ✗ Failed")
        except Exception as e:
            print(f"  ✗ Error for {handle}: {e}")
        time.sleep(0.3)

    results[cat] = saved
    time.sleep(0.5)

print("\n=== SUMMARY ===")
for cat, count in results.items():
    status = "✓" if count > 0 else "✗ MISSING"
    print(f"  {status} {cat}: {count} images")

total = sum(results.values())
print(f"\nTotal saved: {total} images → {OUT_DIR}")
