#!/bin/bash
# Workstation Meva Online - Fix Permissions (.command version)
# Same as "Fix Permissions.sh" but double-clickable.
cd "$(dirname "$0")/.."

chmod +x mac/*.command 2>/dev/null
chmod +x mac/*.sh 2>/dev/null
xattr -dr com.apple.quarantine . 2>/dev/null

echo "============================================"
echo "  Fixing launcher permissions..."
echo "============================================"
echo ""
echo "Done. You can now double-click:"
echo "    mac/Start Server.command"
echo ""
read -r -p "Press Enter to close..." _
