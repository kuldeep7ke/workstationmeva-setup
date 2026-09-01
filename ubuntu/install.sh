#!/usr/bin/env bash
# Workstation Meva Online - Ubuntu/Debian Install Helper
#
# Deploys the repository (backend + frontend) from THIS folder into
# /opt/workstation-online and registers it as a systemd service.
# The app connects to YOUR OWN Supabase PostgreSQL database
# (see docs/SETUP-SUPABASE.md to create one).
#
# Prerequisites:
#   - sudo access
#   - A Supabase project with its connection string (DATABASE_URL)
#   - Node.js 18+ (this script can install it for you)
#
# Usage:
#   sudo bash install.sh              # from a cloned repo on this machine
#
# The database is NEVER shipped: the first start creates all tables
# automatically (empty, no user data). First user to sign up becomes admin.

set -euo pipefail

# ---------- SELF-HEAL: files copied from Windows/USB lose the executable bit ------
SCRIPT_DIR_FOR_FIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$SCRIPT_DIR_FOR_FIX"/*.sh 2>/dev/null || true
# ---------------------------------------------------------------------------------

echo "============================================"
echo "  Workstation Meva Online - Ubuntu Installer"
echo "============================================"
echo ""

# ------------------ CONFIG ------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_BASE="/opt/workstation-online"
SERVICE_USER="meva"  # change if you run as a different user
PORT="${PORT:-3002}"
# -------------------------------------------

if [[ ! -d "$REPO_ROOT/backend" || ! -d "$REPO_ROOT/frontend" ]]; then
    echo "Error: repo layout not found. Expected backend/ and frontend/ next to ubuntu/."
    echo "Run this script from a full clone of the workstation-online repository."
    exit 1
fi

# --- Node.js check / install ---
# Prefer the bundled offline installer (tools/node/node-v24.19.0-linux-x64.tar.xz
# ships with the repo) so a machine without internet still works; fall back to
# NodeSource (20 LTS) when the bundle is absent.
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
    BUNDLE="$(ls "$REPO_ROOT"/tools/node/node-v*-linux-x64.tar.xz 2>/dev/null | head -1)"
    if [[ -n "$BUNDLE" ]]; then
        echo "Node.js not found. Installing from bundled offline installer ($(basename "$BUNDLE"))..."
        sudo mkdir -p /opt/workstation-node
        sudo tar -xJf "$BUNDLE" -C /opt/workstation-node --strip-components=1
        NODE_BIN="/opt/workstation-node/bin/node"
        export PATH="/opt/workstation-node/bin:$PATH"
    else
        echo "Node.js not found. Installing Node.js 20 LTS (NodeSource)..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
        NODE_BIN="$(command -v node)"
    fi
fi
NODE_VER=$("$NODE_BIN" -p "process.versions.node.split('.')[0]")
if [[ "$NODE_VER" -lt 18 ]]; then
    echo "Error: Node.js $NODE_VER detected — need 18 or newer."
    echo "Upgrade Node.js first (see docs/SETUP-GUIDE-UBUNTU.md)."
    exit 1
fi
echo "Node.js: $NODE_BIN (v$("$NODE_BIN" -v))"
echo ""

# --- Stop existing service (if any) ---
echo "Stopping any existing workstation-meva service..."
sudo systemctl stop workstation-meva.service 2>/dev/null || true
sudo systemctl disable workstation-meva.service 2>/dev/null || true
sleep 1

# --- Deploy the source tree ---
echo "Deploying to $TARGET_BASE ..."
sudo mkdir -p "$TARGET_BASE"
# Copy everything except node_modules / dist / git internals.
# The deployed .env, local database files and backups must NEVER be replaced
# by a re-run of this script, so they are excluded from the rsync --delete pass.
sudo rsync -a --delete \
    --exclude node_modules --exclude dist \
    --exclude .git --exclude '*.log' \
    --exclude 'backend/.env' --exclude '*.db' --exclude 'backups/' \
    "$REPO_ROOT/" "$TARGET_BASE/" 2>/dev/null \
    || { echo "rsync unavailable — falling back to cp"; sudo cp -r "$REPO_ROOT/backend" "$REPO_ROOT/frontend" "$REPO_ROOT/package.json" "$REPO_ROOT/.env.example" "$REPO_ROOT/create-env.sh" "$REPO_ROOT/clean-junk.sh" "$REPO_ROOT/caddy-watchdog.sh" "$REPO_ROOT/render.yaml" "$TARGET_BASE/" 2>/dev/null && sudo mkdir -p "$TARGET_BASE/docs" && sudo cp -r "$REPO_ROOT/docs/SETUP-SUPABASE.md" "$REPO_ROOT/docs/SETUP-GUIDE-UBUNTU.md" "$TARGET_BASE/docs/" 2>/dev/null; } \
    || { echo "Error: rsync and cp both failed — install rsync or check permissions."; exit 1; }

# --- Service user (create BEFORE npm ci so deps aren't installed as root) ---
sudo useradd --system --home "$TARGET_BASE" --shell /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null || true
sudo mkdir -p "$TARGET_BASE"
sudo chown -R "$SERVICE_USER":"$SERVICE_USER" "$TARGET_BASE"

# --- Dependencies + build ---
echo "Installing dependencies (npm ci) and building..."
cd "$TARGET_BASE/backend"
sudo -u "$SERVICE_USER" env PATH="$PATH" npm ci 2>/dev/null || sudo env PATH="$PATH" npm ci
sudo -u "$SERVICE_USER" env PATH="$PATH" npm run build 2>/dev/null || sudo env PATH="$PATH" npm run build
cd "$TARGET_BASE/frontend"
sudo -u "$SERVICE_USER" env PATH="$PATH" npm ci 2>/dev/null || sudo env PATH="$PATH" npm ci
sudo -u "$SERVICE_USER" env PATH="$PATH" npm run build 2>/dev/null || sudo env PATH="$PATH" npm run build
cd "$TARGET_BASE"

# --- .env configuration (one-time; never overwrites an existing .env) ---
if [[ ! -f "$TARGET_BASE/backend/.env" ]]; then
    echo ""
    echo "Creating backend/.env (JWT_SECRET auto-generated) ..."
    SECRET="$(openssl rand -hex 32 2>/dev/null || echo "$RANDOM$RANDOM$RANDOM$RANDOM$RANDOM$RANDOM")"
    sudo cp "$TARGET_BASE/backend/.env.example" "$TARGET_BASE/backend/.env" 2>/dev/null \
      || sudo cp "$TARGET_BASE/.env.example" "$TARGET_BASE/backend/.env"
    sudo sed -i "s|^JWT_SECRET=.*$|JWT_SECRET=$SECRET|" "$TARGET_BASE/backend/.env"
    echo ""
    echo "  JWT_SECRET: auto-generated"
    echo "  DATABASE_URL: empty - the server runs on the local database for now."
    echo "  To use Supabase: open the app and go to Backups page -> Database tab, or"
    echo "  edit $TARGET_BASE/backend/.env"
    echo "  (Create a free Supabase project first - see docs/SETUP-SUPABASE.md)"
    echo ""
fi

# --- Ownership (keeps .env owned by the service user) ---
sudo chown -R "$SERVICE_USER":"$SERVICE_USER" "$TARGET_BASE"

# --- Install systemd unit ---
echo "Installing systemd unit..."
sudo cp "$SCRIPT_DIR/workstation-meva.service" /etc/systemd/system/
sudo sed -i "s|User=meva|User=$SERVICE_USER|" /etc/systemd/system/workstation-meva.service
sudo sed -i "s|WorkingDirectory=/opt/workstation-online|WorkingDirectory=$TARGET_BASE|" /etc/systemd/system/workstation-meva.service
sudo sed -i "s|ExecStart=/usr/bin/node|ExecStart=$NODE_BIN|" /etc/systemd/system/workstation-meva.service
sudo systemctl daemon-reload

# --- Enable and start ---
echo "Enabling and starting service..."
sudo systemctl enable --now workstation-meva.service
sleep 3
sudo systemctl status workstation-meva.service --no-pager

echo ""
echo "============================================"
echo "  Verification"
echo "============================================"
echo ""

if curl -s "http://localhost:$PORT/api/health" | grep -q '"status":"ok"'; then
    echo "OK  Health endpoint: http://localhost:$PORT/api/health"
else
    echo "NOTE: server may still be starting. Check logs:"
    echo "  sudo journalctl -u workstation-meva.service -n 30 --no-pager"
fi

echo ""
echo "Next steps:"
echo "  1. Open http://localhost:$PORT  (LAN users: http://<THIS-MACHINE-IP>:$PORT)"
echo "  2. First visitor signs up -> becomes admin automatically"
echo "  3. View logs: sudo journalctl -u workstation-meva.service -f"
echo "  4. LAN URL without :3002 (Caddy): see docs/SETUP-GUIDE-UBUNTU.md section 5"
echo ""
echo "============================================"
echo "  Install complete!"
echo "============================================"
