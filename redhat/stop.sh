#!/usr/bin/env bash
# Workstation Meva Online - stop the manual (non-systemd) server.
# If running under systemd, use:  sudo systemctl stop workstation-meva.service

set -euo pipefail

# SELF-HEAL: files copied from Windows/USB lose the executable bit.
SCRIPT_DIR_FOR_FIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$SCRIPT_DIR_FOR_FIX"/*.sh 2>/dev/null || true

# 1. Stop the auto-restart wrapper FIRST so it cannot respawn the server.
pkill -f "start-server-core.sh" 2>/dev/null || true
sleep 1

# 2. Stop any node process running the server entry
PIDS=$(pgrep -f "backend/dist/index.js" || true)

if [[ -n "$PIDS" ]]; then
    echo "Stopping Workstation Meva server (PIDs: $PIDS)..."
    kill $PIDS
    sleep 1

    PIDS2=$(pgrep -f "backend/dist/index.js" || true)
    if [[ -n "$PIDS2" ]]; then
        echo "Force-stopping..."
        kill -9 $PIDS2 || true
    fi
else
    echo "No running Workstation Meva server found."
fi

# 3. Stop the Caddy proxy + its watchdog if WE started it (manual mode only —
#    never touches a Caddy running as a systemd service).
pkill -f "caddy-watchdog.sh" 2>/dev/null || true
if systemctl is-active --quiet caddy 2>/dev/null; then
    echo "Caddy runs as a systemd service — leaving it running."
else
    CPIDS=$(pgrep -f "caddy run --config.*proxy/caddy/Caddyfile" || true)
    if [[ -n "$CPIDS" ]]; then
        echo "Stopping Caddy reverse proxy (PIDs: $CPIDS)..."
        kill $CPIDS 2>/dev/null || true
        sleep 1
        pkill -9 -f "caddy run --config.*proxy/caddy/Caddyfile" 2>/dev/null || true
    fi
fi

echo "Stopped."
