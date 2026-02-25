#!/usr/bin/env python3
"""Scrape Todd Snyder for men's formal categories: sportcoat, trousers/slacks, suits, ties."""
import requests, re, time
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/toddsnyder/male")
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

TARGETS = {
    "sportcoat":  {"types": ["Sportcoat", "TS SUITING"], "handle_kw": ["sport-coat","sportcoat","blazer","sutton-jacket","madison-jacket","linen-jacket","cashmere-sutton","tweed","donegal"]},
    "trousers":   {"types": ["Pants", "TS SUITING", "Suit Pant"], "handle_kw": ["trouser","slack","dress-pant","gurkha","side-tab","suit-pant","sutton-trouser","sutton-pant"]},
    "suit":       {"types": ["Sportcoat", "TS SUITING", "Suit Pant"], "handle_kw": ["suit-jacket","suit-pant","tuxedo","tux"]},
    "tie":        {"types": ["Tie", "TS SUIT ACCESS"], "handle_kw": ["tie","bowtie","bow-tie","necktie","neckwear"]},
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
    imgs = r.json().get("images", [])
    return [f"https:{img}" if str(img).startswith("//") else str(img) for img in imgs[:2]]

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
    for p in matched[:4]:
        print(f"  - {p['handle']}")

    saved = 0
    for product in matched[:6]:
        if saved >= 3:
            break
        handle = product["handle"]
        dest = OUT_DIR / f"toddsnyder-{cat}-{handle[:50]}.jpg"
        if dest.exists():
            saved += 1
            continue
        try:
            imgs = fetch_product_images(handle)
            time.sleep(0.3)
            for img_url in imgs[:1]:
                if download_image(img_url, dest):
                    print(f"  ✓ {dest.name} ({dest.stat().st_size//1024}KB)")
                    saved += 1
                    break
        except Exception as e:
            print(f"  ✗ {e}")
        time.sleep(0.3)

    results[cat] = saved
    time.sleep(0.5)

print("\n=== SUMMARY ===")
for cat, count in results.items():
    print(f"  {'✓' if count else '✗'} {cat}: {count}")
