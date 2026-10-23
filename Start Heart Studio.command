#!/bin/bash
# Heart Studio: double-click to run the studio offline (macOS). Keep the Terminal window open during the show; close it to stop.
# Serves this folder on http://127.0.0.1:8765 and opens it in Chrome or Edge as its own app window. The address never changes,
# so the browser remembers the microphone permission and the saved calibration between events.
cd "$(dirname "$0")" || exit 1
PORT=8765
ENTRY=index.html; [ -f "$ENTRY" ] || ENTRY=heart.html
URL="http://127.0.0.1:$PORT/$ENTRY"
PROFILE="$HOME/Library/Application Support/HeartStudio/browser"

open_studio() {
  for app in "Google Chrome" "Microsoft Edge" "Chromium" "Brave Browser"; do
    if [ -d "/Applications/$app.app" ] || [ -d "$HOME/Applications/$app.app" ]; then
      open -na "$app" --args --app="$URL" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
        --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling
      return
    fi
  done
  open "$URL"   # Safari also works, but asks for the microphone again each time
}

# The server prints one word when it has started (ready), finds a studio already running (running) or finds the port taken (busy).
LOG="$(mktemp "${TMPDIR:-/tmp}/heart-studio.XXXXXX")"
trap 'rm -f "$LOG"' EXIT
perl launcher/serve.pl >"$LOG" 2>&1 &
SERVER=$!
for _ in $(seq 50); do [ -s "$LOG" ] && break; kill -0 $SERVER 2>/dev/null || break; sleep 0.1; done
STATE="$(head -n 1 "$LOG")"
case "$STATE" in
  ready)
    echo; echo "  Heart Studio is running at $URL"
    echo "  Works without internet. Keep this window open during the show; close it to stop."; echo
    trap 'kill $SERVER 2>/dev/null; rm -f "$LOG"' EXIT
    open_studio
    wait $SERVER ;;
  running) open_studio ;;
  busy) echo "Port $PORT is taken by another program. Close it and try again." ;;
  *)
    # No Perl on this Mac: open the single-file build straight from disk instead (the microphone still works in Chrome).
    if [ -f heart-studio.html ]; then open "heart-studio.html"; else echo "Could not start the server: $STATE"; fi ;;
esac
