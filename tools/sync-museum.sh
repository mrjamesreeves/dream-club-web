#!/usr/bin/env bash
# The museum experiments: James's fork of the game (mrjamesreeves/dreamgame,
# branch "museum", cloned at ~/Dev/dreamgame-museum) vendored into museum/
# so it serves at thedream.club/museum/. Same flags as sync-game.sh:
#
#   tools/sync-museum.sh            # sync, commit, push
#   tools/sync-museum.sh --no-push
#   tools/sync-museum.sh --build
#
# play/ keeps tracking Olly's branch; the two never touch each other.
exec env \
  DREAMGAME_SRC="${DREAMGAME_SRC:-$HOME/Dev/dreamgame-museum}" \
  DREAMGAME_REPO="https://github.com/mrjamesreeves/dreamgame.git" \
  DREAMGAME_BRANCH="museum" \
  DREAMGAME_OUT="museum" \
  "$(dirname "$0")/sync-game.sh" "$@"
