#!/bin/bash
# Load full test image set into dev server for GUI testing.
# Pushes all male + female images through the ingestion pipeline.
# Run AFTER dev server is up: pm2 start thread (or npm run server)

API="https://localhost:3000/api/v1"
API_KEY="thread_sk_41eb7a2f83b0c870e77d87dc669e8f781dbf8de040b57934"
FEMALE_DIR="data/test-images/female"
MALE_DIR="data/test-images/male"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok=0; fail=0; skip=0

upload_file() {
  local file="$1"
  local label="$2"
  local resp=$(curl -sk -X POST "$API/ingestion/upload-photo" \
    -H "Authorization: Bearer $API_KEY" \
    -F "file=@$file" \
    -w "\n%{http_code}")
  local code=$(echo "$resp" | tail -1)
  local body=$(echo "$resp" | head -1)
  if [[ "$code" == "200" ]]; then
    echo -e "  ${GREEN}✓${NC} $label"
    ((ok++))
  else
    echo -e "  ${RED}✗${NC} $label [HTTP $code] $body"
    ((fail++))
  fi
  sleep 0.1  # gentle on the server
}

echo -e "\n${BLUE}=== THREAD Dev Wardrobe Loader ===${NC}"
echo "API: $API"
echo ""

# Check server is up — try uploading a quick ping via the ingestion endpoint
STATUS=$(curl -sk -o /dev/null -w "%{http_code}" -X POST "$API/ingestion/upload-photo" \
  -H "Authorization: Bearer $API_KEY")
if [[ "$STATUS" == "000" ]]; then
  echo -e "${RED}✗ Server not responding at $API${NC}"
  echo "  Run: pm2 restart thread"
  exit 1
fi
echo -e "Server up (HTTP $STATUS) ✓"
echo ""

# --- Female ---
echo -e "${BLUE}Female images ($(ls $FEMALE_DIR/*.jpg 2>/dev/null | wc -l | tr -d ' ')):${NC}"
for f in "$FEMALE_DIR"/*.jpg; do
  [[ -f "$f" ]] || continue
  upload_file "$f" "$(basename $f .jpg)"
done

echo ""

# --- Male ---
echo -e "${BLUE}Male images ($(ls $MALE_DIR/*.jpg 2>/dev/null | wc -l | tr -d ' ')):${NC}"
for f in "$MALE_DIR"/*.jpg; do
  [[ -f "$f" ]] || continue
  upload_file "$f" "$(basename $f .jpg)"
done

echo ""
echo -e "${BLUE}=== Done ===${NC}"
echo -e "  ${GREEN}Loaded: $ok${NC}"
[[ $fail -gt 0 ]] && echo -e "  ${RED}Failed: $fail${NC}"
echo ""
echo -e "  ${YELLOW}→ Open https://localhost:3000 to browse your wardrobe${NC}"
echo ""
