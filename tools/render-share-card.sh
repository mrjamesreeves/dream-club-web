#!/bin/zsh
# Render a share card page to a 1200×630 JPEG with headless Chrome.
#   tools/render-share-card.sh                 # og.html -> img/share.jpg
#   tools/render-share-card.sh og-index.html img/share-index.jpg
# Uses the preview server on 8899 if one is up, otherwise starts its
# own for the render and stops it after, so this runs unattended.
set -euo pipefail
cd "$(dirname "$0")/.."
page="${1:-og.html}"
out="${2:-img/share.jpg}"
tmp=$(mktemp -d)
server=""
if ! curl -sf -o /dev/null "http://localhost:8899/$page"; then
  python3 -m http.server 8899 -d . >/dev/null 2>&1 &
  server=$!
  for _ in {1..20}; do curl -sf -o /dev/null "http://localhost:8899/$page" && break; sleep 0.25; done
fi
trap '[[ -n "$server" ]] && kill "$server" 2>/dev/null; rm -rf "$tmp"' EXIT
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=10000 \
  --screenshot="$tmp/card.png" "http://localhost:8899/$page" >/dev/null 2>&1
sips -s format jpeg -s formatOptions 88 "$tmp/card.png" --out "$out" >/dev/null
echo "$out: $(sips -g pixelWidth -g pixelHeight "$out" | awk '/pixel/ {printf "%s ", $2}')"
