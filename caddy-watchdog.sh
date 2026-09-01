#!/usr/bin/env bash
# Workstation Meva Online - Caddy reverse-proxy watchdog (shared by the
# Ubuntu, RedHat-family and macOS launchers; Windows has its own embedded
# watchdog inside windows/start-server-core.ps1).
#
# Keeps the Caddy reverse proxy (port 80) alive: checks every 5 seconds and
# restarts it when it has crashed or been killed, so the site never drops
# silently. Best-effort and quiet — exits cleanly when Caddy is not installed,
# not configured, or is managed by systemd (Linux).
#
# Usage:  bash caddy-watchdog.sh [REPO_ROOT]     (started in the background by start.sh)

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="${1:-$(cd "$SCRIPT_DIR" && pwd)}"

CADDY="$(command -v caddy 2>/dev/null || true)"
CADDYFILE="$BASE/proxy/caddy/Caddyfile"
LOG="$BASE/proxy/caddy-err.log"

if [[ -z "$CADDY" || ! -f "$CADDYFILE" ]]; then
  exit 0
fi

# Linux systemd manages Caddy -> leave it alone.
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet caddy 2>/dev/null; then
  exit 0
fi

if [[ ! -w "$BASE" ]]; then
  LOG="/tmp/workstation-meva-caddy.log"
fi

port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":80 "
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:80 >/dev/null 2>&1
  else
    # No tool to check the port — assume it is up so we never fight an
    # existing proxy we cannot see.
    return 0
  fi
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [caddy-watchdog] $*" >> "$LOG" 2>/dev/null || true; }

log "Watchdog started (caddy: $CADDY, config: $CADDYFILE)."
while true; do
  if ! port_busy; then
    pkill -f "caddy run --config.*proxy/caddy/Caddyfile" 2>/dev/null || true
    sleep 1
    nohup "$CADDY" run --config "$CADDYFILE" >> "$LOG" 2>&1 &
    log "Caddy (re)started."
  fi
  sleep 5
done