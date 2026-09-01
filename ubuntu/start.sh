#!/usr/bin/env bash
# Workstation Meva Online - start the server hidden in the background and
# open the app in the browser (desktop sessions only).
# For a production background service, use:  sudo bash install.sh  (systemd)
#
# Usage:
#   bash start.sh               # hidden background server + open browser
#   bash start.sh --foreground  # run in the foreground (old manual mode)
#
# Does: firewall self-heal (ufw), auto-restart wrapper, optional Caddy
# auto-start (if caddy is installed and this repo's Caddyfile exists).

set -euo pipefail

# SELF-HEAL: files copied from Windows/USB lose the executable bit.
SCRIPT_DIR_FOR_FIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$SCRIPT_DIR_FOR_FIX"/*.sh 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="${MEVA_SERVER_DIR:-/opt/workstation-online}"
ENTRY="$BASE/backend/dist/index.js"
PORT="${PORT:-3002}"
URL=""
LOG=""
if [[ -w "$BASE" ]]; then
    LOG="$BASE/server.log"
else
    LOG="/tmp/workstation-meva-server.log"
fi

if [[ ! -f "$ENTRY" ]]; then
    echo "Error: $ENTRY not found."
    echo "Run sudo bash install.sh first."
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js 18+ is not installed."
    exit 1
fi
NODE_BIN="$(command -v node)"

if [[ ! -f "$BASE/backend/.env" ]]; then
    echo "Creating backend/.env (one-time setup - JWT_SECRET auto-generated)..."
    ENV_SCRIPT=""
    if [[ -f "$SCRIPT_DIR/../create-env.sh" ]]; then ENV_SCRIPT="$SCRIPT_DIR/../create-env.sh"
    elif [[ -f "$BASE/create-env.sh" ]]; then ENV_SCRIPT="$BASE/create-env.sh"; fi
    if [[ -n "$ENV_SCRIPT" ]]; then
        bash "$ENV_SCRIPT" silent || true
    else
        echo "  (create-env.sh not found - copying example instead)"
        cp "$BASE/.env.example" "$BASE/backend/.env" 2>/dev/null || true
    fi
    if [[ ! -f "$BASE/backend/.env" ]]; then
        echo "ERROR: could not create backend/.env. See docs/SETUP-SUPABASE.md"
        exit 1
    fi
    echo "backend/.env created. To use Supabase later: Backups page -> Database tab in the app."
fi

# --- auto junk cleanup (logs/tsbuildinfo older than 7 days) ---
if [[ -f "$SCRIPT_DIR/../clean-junk.sh" ]]; then
    bash "$SCRIPT_DIR/../clean-junk.sh" || true
elif [[ -f "$BASE/clean-junk.sh" ]]; then
    bash "$BASE/clean-junk.sh" || true
fi

URL="http://localhost:$PORT"

# Open the app in the default browser (desktop sessions only; safe to skip on servers).
open_browser() {
    if [ -n "${DISPLAY:-}" ] && command -v xdg-open >/dev/null 2>&1; then
        (xdg-open "$URL" >/dev/null 2>&1 &) || true
    elif [ -n "${DISPLAY:-}" ] && command -v gio >/dev/null 2>&1; then
        (gio open "$URL" >/dev/null 2>&1 &) || true
    fi
}

lan_url() {
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [[ -n "$ip" ]]; then
        echo "  LAN users:   http://$ip:$PORT   (firewall port $PORT/tcp opened by this script)"
        echo "               http://$ip        (when the bundled Caddy proxy is running)"
        echo "               http://$(hostname -s)   (computer name — resolves from most LAN machines)"
    fi
}

# Firewall self-heal: open PORT so LAN users can reach the server (needs root;
# best-effort — skips silently when no privileges).
firewall_heal() {
    if command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -qi "active"; then
        if ! sudo -n ufw status 2>/dev/null | grep -q "^$PORT/tcp"; then
            echo "Opening firewall port $PORT/tcp (ufw)..."
            sudo -n ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
        fi
    fi
}

# Optional reverse proxy (Caddy) starts with the server, mirroring Windows.
start_caddy() {
    local caddyfile="$BASE/proxy/caddy/Caddyfile"
    if command -v caddy >/dev/null 2>&1 && [[ -f "$caddyfile" ]]; then
        if pgrep -f "caddy run --config.*$caddyfile" >/dev/null 2>&1; then
            return 0
        fi
        if systemctl is-active --quiet caddy 2>/dev/null; then
            echo "Caddy is running as a systemd service — leaving it alone."
            return 0
        fi
        echo "Starting Caddy reverse proxy..."
        local clog
        if [[ -w "$BASE" ]]; then clog="$BASE/proxy/caddy-err.log"; else clog="/tmp/workstation-meva-caddy.log"; fi
        nohup caddy run --config "$caddyfile" >> "$clog" 2>&1 &
    fi
}

# Already running? Just open the app.
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "Server is already running at $URL"
    lan_url
    open_browser
    exit 0
fi

# Old manual mode: run in the foreground.
if [ "${1:-}" = "--foreground" ]; then
    cd "$BASE/backend"
    exec "$NODE_BIN" "$ENTRY"
fi

# Hidden background mode: firewall + proxy + auto-restart wrapper.
firewall_heal
start_caddy

# Caddy watchdog keeps the reverse proxy alive (port 80) in the background.
nohup bash "$SCRIPT_DIR/../caddy-watchdog.sh" "$BASE" >> "$LOG" 2>&1 &

echo "Starting Workstation Meva Online hidden in the background... (node: $NODE_BIN)"
echo "URL: $URL"
lan_url
echo "Logs: $LOG"
chmod +x "$SCRIPT_DIR/start-server-core.sh" 2>/dev/null || true
LOG="$LOG" nohup bash "$SCRIPT_DIR/start-server-core.sh" >> "$LOG" 2>&1 &

for _ in $(seq 1 60); do
    if curl -s "$URL/api/health" | grep -q '"status":"ok"'; then
        echo ""
        echo "Server started successfully: $URL"
        echo "To stop: bash $SCRIPT_DIR/stop.sh  (or systemctl for the installed service)"
        open_browser
        exit 0
    fi
    sleep 1
done

echo "Server failed to start within 60s. Check $LOG"
exit 1
