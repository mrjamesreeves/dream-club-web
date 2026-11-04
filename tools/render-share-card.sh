#!/bin/zsh
# Render og.html to img/share.jpg (1200×630) with headless Chrome,
# against the local preview server. Start it first:
#   python3 -m http.server 8899 -d "$(dirname "$0")/.."
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=8000 \
  --screenshot="$tmp/share.png" "http://localhost:8899/og.html" >/dev/null 2>&1
sips -s format jpeg -s formatOptions 88 "$tmp/share.png" --out img/share.jpg >/dev/null
rm -rf "$tmp"
echo "img/share.jpg: $(sips -g pixelWidth -g pixelHeight img/share.jpg | awk '/pixel/ {printf "%s ", $2}')"
