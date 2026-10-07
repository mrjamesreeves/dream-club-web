#!/usr/bin/env bash
# Bring the dream game into the site.
#
# Olly keeps building the game in ollyf/dreamgame on the ps1-dream-engine
# branch. This takes the tip of that branch, runs his own publish script
# (tools/build_artifact.py, which stamps every import with the commit so a
# browser never mixes two versions), and drops the result into play/ so it
# serves at thedream.club/play/. Then it commits and pushes, and Vercel
# deploys.
#
#   tools/sync-game.sh            # sync, commit, push
#   tools/sync-game.sh --no-push  # sync and commit only
#   tools/sync-game.sh --build    # just rebuild play/, touch nothing in git
#
# The game's source is cloned the first time to ~/Dev/dreamgame (override
# with DREAMGAME_SRC). Nothing here ever writes to Olly's repo.
set -euo pipefail

WEB="$(cd "$(dirname "$0")/.." && pwd)"
# Defaults are Olly's repo and branch into play/. sync-museum.sh sets
# these to James's fork and its museum branch into museum/.
SRC="${DREAMGAME_SRC:-$HOME/Dev/dreamgame}"
REPO="${DREAMGAME_REPO:-https://github.com/ollyf/dreamgame.git}"
BRANCH="${DREAMGAME_BRANCH:-ps1-dream-engine}"
OUT="$WEB/${DREAMGAME_OUT:-play}"
LABEL="$(basename "$OUT")"
MODE="${1:-push}"

if [ ! -d "$SRC/.git" ]; then
  echo "cloning $REPO ($BRANCH) into $SRC"
  git clone --quiet --branch "$BRANCH" "$REPO" "$SRC"
fi

# Latest of Olly's branch, exactly as it is on GitHub.
git -C "$SRC" fetch --quiet origin "$BRANCH"
git -C "$SRC" checkout --quiet "$BRANCH"
git -C "$SRC" reset --quiet --hard "origin/$BRANCH"
STAMP="$(git -C "$SRC" rev-parse --short HEAD)"
FULL="$(git -C "$SRC" rev-parse HEAD)"

python3 "$SRC/tools/build_artifact.py" "$OUT" "$STAMP"
# Every page but index.html is a fragment for the claude.ai artifact host
# (the game itself, and the character/voice labs), not a web page.
find "$OUT" -maxdepth 1 -name '*.html' ! -name 'index.html' -delete
printf '%s\n' "$STAMP" > "$OUT/VERSION"

# The menu at /dreams reads this: the dreams in play order, with titles.
python3 - "$OUT" <<'PY'
import json, os, sys
out = sys.argv[1]
order = json.load(open(os.path.join(out, 'scenes', 'index.json')))
items = []
for sid in order:
    try:
        title = json.load(open(os.path.join(out, 'scenes', f'{sid}.json'))).get('title', sid)
    except Exception:
        title = sid
    items.append({'id': sid, 'title': title})
json.dump(items, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
print('manifest:', len(items), 'dreams')
PY

if [ "$MODE" = "--build" ]; then
  echo "built $LABEL/ at $STAMP (nothing committed)"
  exit 0
fi

cd "$WEB"
git add "$LABEL"
if git diff --cached --quiet; then
  echo "$LABEL/ is already at $STAMP"
  exit 0
fi
git commit --quiet -m "Game: sync $LABEL/ to $STAMP ($BRANCH)

${REPO%.git}/commit/$FULL"
echo "committed $LABEL/ at $STAMP"

if [ "$MODE" != "--no-push" ]; then
  git push --quiet
  echo "pushed; Vercel is deploying thedream.club/$LABEL/"
fi
