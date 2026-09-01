#!/bin/bash
# Workstation Meva Online - Stop Server (Mac)
cd "$(dirname "$0")/.."

# Self-heal: restore executable bits + clear quarantine.
chmod +x *.command *.sh 2>/dev/null
xattr -dr com.apple.quarantine . 2>/dev/null

# If auto-start is installed, unload it FIRST - otherwise LaunchD would
# respawn the wrapper the moment we kill it (Stop would never stick).
PLIST="$HOME/Library/LaunchAgents/com.workstation-meva-online.server.plist"
if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" >/dev/null 2>&1
  launchctl bootout gui/$(id -u) "$PLIST" 2>/dev/null || true
  echo "Auto-start unloaded - the server will stay stopped until you"
  echo "re-run mac/Install AutoStart.command or start it manually."
fi

# Kill the auto-restart wrapper first (prevents it from respawning node)
pkill -f "start-server-core.sh" 2>/dev/null || true

if lsof -ti tcp:3002 >/dev/null 2>&1; then
  lsof -ti tcp:3002 | xargs kill
  echo "Workstation Meva server stopped."
else
  echo "Server is not running."
fi

# Stop the Caddy reverse proxy + its watchdog if WE started it (manual mode only).
pkill -f "caddy-watchdog.sh" 2>/dev/null || true
if pgrep -f "caddy run --config.*proxy/caddy/Caddyfile" >/dev/null 2>&1; then
  pkill -f "caddy run --config.*proxy/caddy/Caddyfile" 2>/dev/null || true
  echo "Caddy reverse proxy stopped."
fi
read -r -p "Press Enter to close..." _
