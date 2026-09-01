#!/bin/bash
# Workstation Meva Online - Install Auto-Start on Login (Mac)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Self-heal: restore executable bits + clear quarantine.
cd "$ROOT"
chmod +x mac/*.command mac/*.sh 2>/dev/null
xattr -dr com.apple.quarantine . 2>/dev/null

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 18+ first (bundled tools/node/node-v24.19.0.pkg, or brew install node)."
  read -r -p "Press Enter to close..." _
  exit 1
fi
ENTRY="$ROOT/backend/dist/index.js"
LOG="$ROOT/server.log"

if [ ! -f "$ENTRY" ]; then
  echo "Server is not built yet. Run Start Server.command once first (it builds)."
  read -r -p "Press Enter to close..." _
  exit 1
fi

PLIST="$HOME/Library/LaunchAgents/com.workstation-meva-online.server.plist"
LABEL="com.workstation-meva-online.server"

mkdir -p "$HOME/Library/LaunchAgents"

# Run the same auto-restart wrapper as manual mode (crash limiting + logging),
# not node directly - so a crash loop gives up instead of respawning forever.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/mac/start-server-core.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>LOG</key>
    <string>${LOG}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" >/dev/null 2>&1
launchctl load -w "$PLIST" 2>/dev/null || launchctl bootstrap gui/$(id -u) "$PLIST" 2>/dev/null

echo "============================================"
echo "  Auto-start installed!"
echo "============================================"
echo ""
echo "  The server will start automatically every"
echo "  time you log in to this Mac (hidden)."
echo "  It also restarts automatically if it stops"
echo "  (and gives up after repeated crashes)."
echo ""
echo "  To remove: double-click  mac/Remove AutoStart.command"
echo "  To stop right now:        mac/Stop Server.command"
echo ""
read -r -p "Press Enter to close..." _
