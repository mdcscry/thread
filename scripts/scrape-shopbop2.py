#!/usr/bin/env python3
"""Scrape Shopbop via search for remaining categories: belt, scarf, necklace, bracelet, socks"""
import requests, re, time
from pathlib import Path

OUT_DIR = Path("/Users/matthewcryer/Documents/outerfit/data/test-images/blueowl/female")
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

TARGETS = ["belt", "scarf", "necklace", "bracelet", "socks"]

def get_images_from_search(term):
    url = f"https://www.shopbop.com/search?term={term}&limit=10"
    r = requests.get(url, headers=HEADERS, timeout=15)
    # Get full-size images (no UX suffix = larger)
    all_imgs = re.findall(r'"(https://m\.media-amazon\.com/images/G/01/Shopbop/p/prod/[^"]+\.jpg)"', r.text)
    # Prefer full-size over thumbnails
    full = [img for img in all_imgs if '_QL90_UX' not in img]
    thumb = [img for img in all_imgs if '_QL90_UX564_' in img]
    return (full + thumb)[:6]

def download_image(url, dest_path):
    r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
    if r.status_code == 200 and len(r.content) > 5000:
        with open(dest_path, "wb") as f:
            f.write(r.content)
        return True
    return False

for cat in TARGETS:
    print(f"\n[{cat}] Searching...")
    imgs = get_images_from_search(cat)
    print(f"  Found {len(imgs)} images")
    
    saved = 0
    for i, img_url in enumerate(imgs):
        if saved >= 2:
            break
        filename = f"shopbop-{cat}-{i+1}.jpg"
        dest = OUT_DIR / filename
        print(f"  Downloading {filename}...")
        if download_image(img_url, dest):
            print(f"  ✓ Saved ({dest.stat().st_size//1024}KB)")
            saved += 1
        else:
            print(f"  ✗ Too small or failed")
        time.sleep(0.3)
    
    if saved == 0:
        print(f"  ✗ Nothing saved for {cat}")
    time.sleep(1)

print("\nDone!")
