#!/bin/bash
# Test both upload methods: local files + URL ingestion
# Usage: bash scripts/test-upload.sh

API="http://localhost:3000"
API_KEY="thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934"
FEMALE_DIR="data/test-images/female"
MALE_DIR="data/test-images/male"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok=0; fail=0

upload_file() {
  local file="$1"
  local label="$2"
  local resp=$(curl -s -X POST "$API/ingestion/upload-photo" \
    -H "Authorization: Bearer $API_KEY" \
    -F "file=@$file" \
    -w "\n%{http_code}")
  local code=$(echo "$resp" | tail -1)
  local body=$(echo "$resp" | head -1)
  if [[ "$code" == "200" ]] || echo "$body" | grep -q '"itemId"'; then
    echo -e "  ${GREEN}✓${NC} $label"
    ((ok++))
  else
    echo -e "  ${RED}✗${NC} $label → $body"
    ((fail++))
  fi
}

upload_url() {
  local url="$1"
  local label="$2"
  local resp=$(curl -s -X POST "$API/ingestion/upload-from-url" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}" \
    -w "\n%{http_code}")
  local code=$(echo "$resp" | tail -1)
  local body=$(echo "$resp" | head -1)
  if [[ "$code" == "200" ]] || echo "$body" | grep -q '"itemId"'; then
    echo -e "  ${GREEN}✓${NC} [URL] $label"
    ((ok++))
  else
    echo -e "  ${RED}✗${NC} [URL] $label → $body"
    ((fail++))
  fi
}

echo -e "\n${BLUE}=== THREAD Upload Test ===${NC}"
echo "API: $API"
echo ""

# --- LOCAL: Female ---
echo -e "${BLUE}Female (local file upload):${NC}"
for f in "$FEMALE_DIR"/*.jpg; do
  upload_file "$f" "$(basename $f)"
done

# --- LOCAL: Male ---
echo ""
echo -e "${BLUE}Male (local file upload):${NC}"
for f in "$MALE_DIR"/*.jpg; do
  upload_file "$f" "$(basename $f)"
done

# --- URL: 2 female, 2 male ---
echo ""
echo -e "${BLUE}URL-based ingestion (4 images):${NC}"

# Female URLs — Everlane CDN (verified working)
upload_url \
  "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/a3b1cf3e_c713.jpg?v=1753411397" \
  "Everlane smock dress (female)"

upload_url \
  "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/ad513c4b_8afd.jpg?v=1753411465" \
  "Everlane riviera dress (female)"

# Male URLs — Todd Snyder CDN (verified working)
upload_url \
  "https://cdn.shopify.com/s/files/1/0186/1574/files/NOV25_SW3707696_BLACK_FL1_R.jpg?v=1760641963" \
  "Todd Snyder cashmere turtleneck (male)"

upload_url \
  "https://cdn.shopify.com/s/files/1/0186/1574/files/black-formal-silk-tietodd-snyder-431851.jpg?v=1713323780" \
  "Todd Snyder formal silk tie (male)"

# --- Summary ---
echo ""
echo -e "${BLUE}=== Results ===${NC}"
echo -e "  ${GREEN}Passed: $ok${NC}"
echo -e "  ${RED}Failed: $fail${NC}"
echo ""
