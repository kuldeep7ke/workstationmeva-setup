#!/bin/bash
# Workstation Meva Online - auto-restart wrapper (Ubuntu/Debian manual mode)
# Runs the node server and restarts it if it crashes (up to MAX_RESTARTS
# within RESET_WINDOW; the counter resets after the server runs stably).
#
# Used by start.sh (manual mode). systemd mode uses Restart=always instead.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTRY="$ROOT/backend/dist/index.js"
# Use the log path chosen by start.sh when provided and writable; on an
# installed box (root-owned /opt) a desktop user can't write $ROOT/server.log.
LOG="${LOG:-}"
if [[ -z "$LOG" || ! -w "$(dirname "$LOG")" ]]; then
  LOG="$ROOT/server.log"
fi
if [[ ! -w "$(dirname "$LOG")" ]]; then
  LOG="/tmp/workstation-meva-server.log"
fi
MAX_RESTARTS=5          # max restarts within the window
RESET_WINDOW=60         # seconds — counter resets after server runs this long

NODE_BIN="$(command -v node)"

if [[ ! -f "$ENTRY" ]]; then
  echo "Error: $ENTRY not found. Run start.sh first (it builds)."
  exit 1
fi

restart_count=0
last_start=$(date +%s)

cleanup() { exit 0; }
trap cleanup SIGTERM SIGINT

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting server ($NODE_BIN)..." >> "$LOG"
  (cd "$ROOT/backend" && "$NODE_BIN" "$ENTRY") >> "$LOG" 2>&1 &
  NODE_PID=$!

  wait "$NODE_PID" 2>/dev/null || true
  EXIT_CODE=$?

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Server exited (code $EXIT_CODE)" >> "$LOG"

  now=$(date +%s)
  elapsed=$(( now - last_start ))

  if [[ $elapsed -ge $RESET_WINDOW ]]; then
    restart_count=0
  fi

  restart_count=$(( restart_count + 1 ))
  last_start=$(date +%s)

  if [[ $restart_count -ge $MAX_RESTARTS ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Server crashed $MAX_RESTARTS times in ${RESET_WINDOW}s — giving up." >> "$LOG"
    echo ""
    echo "Server crashed $MAX_RESTARTS times quickly. Check server.log for the reason."
    echo "Common fixes:"
    echo "  - Port 3002 already in use:  sudo ss -ltnp | grep 3002"
    echo "  - DATABASE_URL invalid:      check backend/.env"
    echo "  - Node.js error:             check server.log"
    exit 1
  fi

  echo "Restarting in 2s (attempt $restart_count/$MAX_RESTARTS)..." >> "$LOG"
  sleep 2
done
