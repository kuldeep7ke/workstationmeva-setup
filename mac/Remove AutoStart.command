#!/bin/bash
# Workstation Meva Online - Remove Auto-Start on Login (Mac)
PLIST="$HOME/Library/LaunchAgents/com.workstation-meva-online.server.plist"

launchctl unload "$PLIST" >/dev/null 2>&1
launchctl bootout gui/$(id -u) "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "Auto-start removed. The server will no longer start at login."
read -r -p "Press Enter to close..." _
