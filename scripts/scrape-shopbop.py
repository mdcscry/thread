#!/usr/bin/env python3
"""Scrape Shopbop for remaining categories: belt, scarf, necklace, bracelet, socks"""
import requests, re, time
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/blueowl/female")
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# Shopbop product URLs for each missing category
TARGETS = {
    "belt":     "https://www.shopbop.com/belts/br/v=1/13554.htm",
    "scarf":    "https://www.shopbop.com/scarves-wraps/br/v=1/13551.htm",
    "necklace": "https://www.shopbop.com/necklaces/br/v=1/13541.htm",
    "bracelet": "https://www.shopbop.com/bracelets/br/v=1/13544.htm",
    "socks":    "https://www.shopbop.com/socks-hosiery/br/v=1/13562.htm",
}

def get_product_urls(category_url):
    r = requests.get(category_url, headers=HEADERS, timeout=15)
    # Find product URLs like /product-name/vp/v=1/1234.htm
    urls = re.findall(r'href="(/[^"]+/vp/v=1/\d+\.htm)"', r.text)
    return list(dict.fromkeys(urls))[:5]  # deduplicated, first 5

def get_image_url(product_path):
    url = f"https://www.shopbop.com{product_path}"
    r = requests.get(url, headers=HEADERS, timeout=15)
    # Get first product image (not logo/icon)
    imgs = re.findall(r'"(https://m\.media-amazon\.com/images/G/01/Shopbop/p/prod/products/[^"]+\.jpg)"', r.text)
    # Prefer non-thumbnail (no UX suffix)
    for img in imgs:
        if '_QL90_UX' not in img:
            return img
    return imgs[0] if imgs else None

def download_image(url, dest_path):
    r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
    if r.status_code == 200 and len(r.content) > 5000:
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    return False

for cat, cat_url in TARGETS.items():
    print(f"\n[{cat}] Fetching category page...")
    try:
        product_urls = get_product_urls(cat_url)
        print(f"  Found {len(product_urls)} products")
        
        saved = 0
        for path in product_urls:
            if saved >= 2:
                break
            try:
                img_url = get_image_url(path)
                time.sleep(0.5)
                if not img_url:
                    print(f"  ✗ No image found for {path}")
                    continue
                slug = re.sub(r'[^a-z0-9]', '-', path.split('/')[1])[:40]
                filename = f"shopbop-{cat}-{slug}.jpg"
                dest = OUT_DIR / filename
                print(f"  Downloading {filename}...")
                if download_image(img_url, dest):
                    print(f"  ✓ Saved ({dest.stat().st_size//1024}KB)")
                    saved += 1
                else:
                    print(f"  ✗ Download failed")
            except Exception as e:
                print(f"  ✗ Error: {e}")
            time.sleep(0.3)
        
        if saved == 0:
            print(f"  ✗ Nothing saved for {cat}")
        
    except Exception as e:
        print(f"  ✗ Category error: {e}")
    time.sleep(1)

print("\nDone!")
