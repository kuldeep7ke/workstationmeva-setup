#!/bin/bash
# Workstation Meva Online - Start Server (Mac)
# Works from a cloned repo: installs deps + builds if needed, then starts.
cd "$(dirname "$0")/.."

# Self-heal: restore executable bits + clear quarantine.
chmod +x *.command *.sh 2>/dev/null
xattr -dr com.apple.quarantine . 2>/dev/null

if ! command -v node >/dev/null 2>&1; then
  echo "============================================"
  echo "  Node.js is NOT installed."
  echo "============================================"
  echo ""
  echo "Install Node.js LTS first (any 18+ works):"
  echo "  Option 1:  double-click the bundled offline installer:"
  echo "             tools/node/node-v24.19.0.pkg"
  echo "  Option 2:  brew install node"
  echo "  Option 3:  Download from https://nodejs.org"
  echo "             (choose LTS version, run the .pkg installer)"
  echo ""
  read -r -p "Press Enter to close..." _
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js $NODE_MAJOR detected - version 18 or newer is required."
  echo "Update Node.js first:  brew upgrade node  (or the bundled .pkg)"
  read -r -p "Press Enter to close..." _
  exit 1
fi

# --- First-time setup: deps + build ---
if [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
  echo "Installing dependencies (this may take a few minutes)..."
  (cd backend && npm ci) || (cd backend && npm install)
  (cd frontend && npm ci) || (cd frontend && npm install)
fi
if [ ! -f "backend/dist/index.js" ] || [ ! -f "frontend/dist/index.html" ]; then
  echo "Building backend + frontend..."
  (cd backend && npm run build)
  (cd frontend && npm run build)
fi

# --- .env: auto-create on first run (one-time, idempotent) ---
if [ ! -f "backend/.env" ]; then
  echo "Creating backend/.env (one-time setup - JWT_SECRET auto-generated)..."
  bash create-env.sh silent
  if [ ! -f "backend/.env" ]; then
    echo "ERROR: could not create backend/.env. See docs/SETUP-SUPABASE.md"
    read -r -p "Press Enter to close..." _
    exit 1
  fi
  echo "  backend/.env created. To use Supabase later: Backups page -> Database tab in the app."
fi

# --- auto junk cleanup (logs/tsbuildinfo older than 7 days) ---
if [ -f clean-junk.sh ]; then
  bash clean-junk.sh || true
fi

# --- Caddy reverse proxy starts with the server (if installed) ---
start_caddy() {
  local caddyfile="$(pwd)/proxy/caddy/Caddyfile"
  if command -v caddy >/dev/null 2>&1 && [ -f "$caddyfile" ]; then
    if pgrep -f "caddy run --config.*$caddyfile" >/dev/null 2>&1; then
      return 0
    fi
    echo "Starting Caddy reverse proxy..."
    nohup caddy run --config "$caddyfile" >> "$(pwd)/proxy/caddy-err.log" 2>&1 &
  fi
}

# Real LAN IP for the "open from other machines" URLs.
lan_ip() {
  local ip
  ip=$(ipconfig getifaddr en0 2>/dev/null || true)
  if [ -z "$ip" ]; then ip=$(ipconfig getifaddr en1 2>/dev/null || true); fi
  if [ -z "$ip" ]; then ip=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' | head -1 | xargs ipconfig getifaddr 2>/dev/null || true); fi
  echo "$ip"
}

LAN_IP="$(lan_ip)"

show_urls() {
  echo "  This Mac:      http://localhost:3002"
  if [ -n "$LAN_IP" ]; then
    echo "  LAN users:     http://$LAN_IP:3002"
    echo "                 http://$LAN_IP        (when the bundled Caddy proxy is running)"
    echo "                 http://$(hostname -s)   (computer name — resolves from most LAN machines)"
    echo ""
    echo "  Tip: the first time you start the server, macOS may ask whether to"
    echo "  allow 'node' to accept incoming connections - click Allow, or LAN"
    echo "  users cannot reach http://$LAN_IP:3002."
  fi
}

if lsof -ti tcp:3002 >/dev/null 2>&1; then
  echo ""
  echo "============================================"
  echo "  Server is already running!"
  echo "============================================"
  echo ""
  show_urls
  echo ""
  sleep 1
  open "http://localhost:3002"
  exit 0
fi

start_caddy

# Caddy watchdog keeps the reverse proxy alive (port 80) in the background.
nohup bash "$(dirname "$0")/../caddy-watchdog.sh" "$(pwd)" >> server.log 2>&1 &

LOG_FILE="$(pwd)/server.log"
echo "Starting Workstation Meva Online server (hidden, background)..."
chmod +x "$(dirname "$0")/start-server-core.sh" 2>/dev/null || true
LOG="$LOG_FILE" nohup bash "$(dirname "$0")/start-server-core.sh" >> "$LOG_FILE" 2>&1 &

echo "Waiting for the server to be ready (up to 60s)..."

READY=""
for i in $(seq 1 60); do
  if curl -s "http://localhost:3002/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
    READY=1
    break
  fi
  sleep 1
done

if [ -n "$READY" ]; then
  echo ""
  echo "============================================"
  echo "  Server started successfully!"
  echo "============================================"
  echo ""
  show_urls
  echo ""
  echo "  To stop: double-click  Stop Server.command"
  echo ""
  open "http://localhost:3002"
else
  echo "Server failed to start within 60s. Check $LOG_FILE for details."
  read -r -p "Press Enter to close..." _
  exit 1
fi
