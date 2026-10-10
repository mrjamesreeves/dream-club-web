#!/usr/bin/env bash
# The museum: mrjamesreeves/dream-museum (its own repo, built on Olly's
# engine; cloned at ~/Dev/dream-museum) vendored into museum/ so it serves
# at thedream.club/museum/. Same flags as sync-game.sh:
#
#   tools/sync-museum.sh            # sync, commit, push
#   tools/sync-museum.sh --no-push
#   tools/sync-museum.sh --build
#
# play/ keeps tracking Olly's branch; the two never touch each other.
exec env \
  DREAMGAME_SRC="${DREAMGAME_SRC:-$HOME/Dev/dream-museum}" \
  DREAMGAME_REPO="https://github.com/mrjamesreeves/dream-museum.git" \
  DREAMGAME_BRANCH="main" \
  DREAMGAME_OUT="museum" \
  "$(dirname "$0")/sync-game.sh" "$@"
