#!/usr/bin/env python3
"""
Scrape Everlane product images for missing female wardrobe categories.
Uses Shopify product JSON API — no browser needed.
"""
import requests, json, os, time, re
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/blueowl/female")
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# Map Everlane product types / tags / handles → our outerfit categories
# Key = our category slug, Value = search handles or product types
TARGETS = {
    "tank":        {"types": ["Knit Tops"], "keywords": ["tank", "cami", "sleeveless"]},
    "t-shirt":     {"types": ["Knit Tops"], "keywords": ["tee", "t-shirt", "crew"]},
    "blouse":      {"types": ["Woven Tops"], "keywords": ["blouse", "shirt", "oxford", "silk"]},
    "button-up":   {"types": ["Woven Tops"], "keywords": ["shirt", "oxford", "button"]},
    "hoodie":      {"types": ["Sweatshirts"], "keywords": ["hoodie", "hooded", "sweatshirt"]},
    "sweatshirt":  {"types": ["Sweatshirts"], "keywords": ["sweatshirt", "crew", "fleece", "terry"]},
    "cardigan":    {"types": ["Sweaters"], "keywords": ["cardigan"]},
    "leggings":    {"types": ["Bottoms"], "keywords": ["legging", "tight"]},
    "flats":       {"types": ["Shoes"], "keywords": ["flat", "ballet"]},
    "sneakers":    {"types": ["Shoes"], "keywords": ["sneaker", "trainer"]},
    "sandals":     {"types": ["Shoes"], "keywords": ["sandal"]},
    "belt":        {"types": ["Accessories"], "keywords": ["belt"]},
    "scarf":       {"types": ["Accessories"], "keywords": ["scarf"]},
    "necklace":    {"types": ["Jewelry"], "keywords": ["necklace"]},
    "bracelet":    {"types": ["Jewelry"], "keywords": ["bracelet"]},
    "socks":       {"types": ["Accessories"], "keywords": ["sock"]},
}

def fetch_products(page=1, limit=250):
    url = f"https://www.everlane.com/collections/womens-all/products.json?limit={limit}&page={page}"
    r = requests.get(url, headers=HEADERS, timeout=15)
    return r.json().get("products", [])

def fetch_product_images(handle):
    url = f"https://www.everlane.com/products/{handle}.js"
    r = requests.get(url, headers=HEADERS, timeout=15)
    d = r.json()
    return [f"https:{img}" for img in d.get("images", [])[:2]]

def download_image(url, dest_path):
    r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
    if r.status_code == 200 and len(r.content) > 5000:
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    return False

def matches(product, category_def):
    title = product["title"].lower()
    handle = product["handle"].lower()
    ptype = product.get("product_type", "").lower()
    tags = " ".join(product.get("tags", [])).lower()
    combined = f"{title} {handle} {ptype} {tags}"
    return any(kw in combined for kw in category_def["keywords"])

# Fetch all products
print("Fetching Everlane product catalog...")
all_products = []
for page in range(1, 5):
    products = fetch_products(page=page)
    if not products:
        break
    all_products.extend(products)
    print(f"  Page {page}: {len(products)} products (total: {len(all_products)})")
    time.sleep(0.5)

print(f"\nTotal products: {len(all_products)}")

# Track what we've already downloaded
existing = {f.stem for f in OUT_DIR.glob("*.jpg")}

# Match and download
results = {}
for cat, cat_def in TARGETS.items():
    matched = [p for p in all_products if matches(p, cat_def)]
    print(f"\n[{cat}] {len(matched)} matches")
    
    saved = 0
    for product in matched[:3]:  # max 3 per category
        handle = product["handle"]
        try:
            imgs = fetch_product_images(handle)
            time.sleep(0.3)
            for i, img_url in enumerate(imgs[:1]):  # 1 image per product
                slug = re.sub(r'[^a-z0-9-]', '-', handle.lower())[:50]
                filename = f"everlane-{cat}-{slug}.jpg"
                dest = OUT_DIR / filename
                if dest.exists():
                    print(f"  ✓ Already have: {filename}")
                    saved += 1
                    break
                print(f"  Downloading: {filename} from {img_url[:60]}...")
                if download_image(img_url, dest):
                    print(f"  ✓ Saved {filename} ({dest.stat().st_size//1024}KB)")
                    saved += 1
                    break
                else:
                    print(f"  ✗ Failed (bad response)")
        except Exception as e:
            print(f"  ✗ Error for {handle}: {e}")
    
    results[cat] = saved
    time.sleep(0.5)

print("\n=== SUMMARY ===")
for cat, count in results.items():
    status = "✓" if count > 0 else "✗ MISSING"
    print(f"  {status} {cat}: {count} images")
