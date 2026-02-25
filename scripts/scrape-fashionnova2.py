#!/usr/bin/env python3
"""
Scrape Fashion Nova collection pages via HTML — extract cdn.shopify.com images.
Targets: pants (wide-leg, cargo, skinny, straight, jogger), handbags (shoulder, crossbody, clutch, tote)
"""
import requests, re, time
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/fashionnova/female")
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
CDN = "https://cdn.shopify.com/s/files/1/0293/9277/"

# Collection URL slug → output category label
TARGETS = [
    # Pants variety
    ("womens-wide-leg-pants",           "pants-wide-leg",   3),
    ("womens-cargo-pants",              "pants-cargo",       3),
    ("jeans",                           "jeans",             3),
    ("womens-straight-leg-pants",       "pants-straight",   2),
    ("joggers",                         "pants-jogger",     2),
    # Handbags
    ("handbags",                        "handbag",           3),
    ("shoulder-bags",                   "bag-shoulder",     2),
    ("crossbody-bags",                  "bag-crossbody",    2),
    ("clutches",                        "bag-clutch",       2),
    # More skirt variety
    ("mini-skirts",                     "skirt-mini",       2),
    ("midi-skirts",                     "skirt-midi",       2),
    ("maxi-skirts",                     "skirt-maxi",       2),
]

def get_images_from_collection(slug):
    url = f"https://www.fashionnova.com/collections/{slug}"
    r = requests.get(url, headers=HEADERS, timeout=20)
    # Get unique full-size CDN images (no crop/width params)
    all_imgs = re.findall(
        r'(https://cdn\.shopify\.com/s/files/1/0293/9277/(?:files|products)/[^\s"\'&>]+\.jpg)',
        r.text
    )
    # Deduplicate, filter out tiny thumbnails and non-product images
    seen = set()
    result = []
    for img in all_imgs:
        base = img.split('?')[0]
        if base not in seen and 'Social' not in base and 'logo' not in base.lower():
            seen.add(base)
            result.append(base)
    return result

def download_image(url, dest_path):
    r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
    if r.status_code == 200 and len(r.content) > 15000:
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    return False

results = {}
for slug, cat_label, max_imgs in TARGETS:
    print(f"\n[{cat_label}] → /collections/{slug}")
    imgs = get_images_from_collection(slug)
    print(f"  Found {len(imgs)} unique images")

    saved = 0
    for i, img_url in enumerate(imgs):
        if saved >= max_imgs:
            break
        filename = f"fn-{cat_label}-{i+1}.jpg"
        dest = OUT_DIR / filename
        if dest.exists():
            saved += 1
            continue
        if download_image(img_url, dest):
            print(f"  ✓ {filename} ({dest.stat().st_size//1024}KB)")
            saved += 1
        time.sleep(0.2)

    results[cat_label] = saved
    time.sleep(1)

print("\n=== SUMMARY ===")
for cat, count in results.items():
    status = "✓" if count > 0 else "✗ MISSING"
    print(f"  {status} {cat}: {count}")
print(f"\nTotal: {sum(results.values())} new images → {OUT_DIR}")
