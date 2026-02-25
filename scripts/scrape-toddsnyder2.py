#!/usr/bin/env python3
"""
Re-scrape specific Todd Snyder categories with tighter matching.
"""
import requests, json, re, time
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/toddsnyder/male")
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# Stricter targets — handle must contain keyword, type must match exactly
TARGETS = {
    "t-shirt":   {"types": ["T-Shirt"],  "handle_kw": ["tee", "t-shirt", "pocket-tee", "graphic"]},
    "knitwear":  {"types": ["Sweater", "TS KNITS"], "handle_kw": ["sweater", "knit", "crewneck", "v-neck", "cardigan", "pullover", "merino", "cashmere-crew", "cashmere-v"]},
    "jeans":     {"types": ["Pants"],    "handle_kw": ["jean", "denim-pant", "denim-5"]},
    "pants":     {"types": ["Pants", "Sweatpant"], "handle_kw": ["chino", "trouser", "sweatpant", "cargo-pant", "dress-pant", "slim-pant", "straight-pant", "wide-pant"]},
    "shorts":    {"types": ["Shorts"],   "handle_kw": ["short"]},
    "sneakers":  {"types": ["Shoes"],    "handle_kw": ["sneaker", "trainer", "court", "runner", "tennis"]},
    "shoes":     {"types": ["Shoes"],    "handle_kw": ["loafer", "oxford", "blucher", "moc", "slip-on", "driver", "penny"]},
    "button-up": {"types": ["Shirt"],    "handle_kw": ["shirt", "oxford", "flannel", "chambray", "linen", "poplin", "button"]},
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
        time.sleep(0.3)
    return all_products

def fetch_product_images(handle):
    url = f"https://www.toddsnyder.com/products/{handle}.js"
    r = requests.get(url, headers=HEADERS, timeout=15)
    d = r.json()
    imgs = d.get("images", [])
    return [f"https:{img}" if img.startswith("//") else img for img in imgs[:2]]

def download_image(url, dest_path):
    r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
    if r.status_code == 200 and len(r.content) > 10000:
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    return False

def matches(product, cat_def):
    handle = product["handle"].lower()
    ptype = product.get("product_type", "").lower()
    type_match = ptype in [t.lower() for t in cat_def["types"]]
    handle_match = any(kw in handle for kw in cat_def["handle_kw"])
    return type_match and handle_match

print("Fetching Todd Snyder catalog...")
all_products = fetch_all_products()
print(f"Total: {len(all_products)} products\n")

results = {}
for cat, cat_def in TARGETS.items():
    matched = [p for p in all_products if matches(p, cat_def)]
    print(f"[{cat}] {len(matched)} matches")
    for p in matched[:3]:
        print(f"  - {p['handle']}")

    saved = 0
    for product in matched[:5]:
        if saved >= 2:
            break
        handle = product["handle"]
        dest = OUT_DIR / f"toddsnyder-{cat}-{handle[:50]}.jpg"
        if dest.exists():
            print(f"  ✓ Already have it")
            saved += 1
            continue
        try:
            imgs = fetch_product_images(handle)
            time.sleep(0.3)
            for img_url in imgs[:1]:
                print(f"  Downloading {dest.name}...")
                if download_image(img_url, dest):
                    print(f"  ✓ Saved ({dest.stat().st_size//1024}KB)")
                    saved += 1
                    break
        except Exception as e:
            print(f"  ✗ {e}")
        time.sleep(0.3)

    results[cat] = saved
    time.sleep(0.4)

print("\n=== SUMMARY ===")
for cat, count in results.items():
    status = "✓" if count > 0 else "✗ MISSING"
    print(f"  {status} {cat}: {count}")
