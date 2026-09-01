#!/bin/bash
# Workstation Meva Online - Fix Permissions (.sh version)
#
# Run this from Terminal with:  bash "Fix Permissions.sh"
# (No executable bit needed — bash reads the file directly.)
#
# Fixes "could not be executed because you do not have appropriate access
# privileges" errors on .command launchers copied from Windows / a USB
# stick (the Unix executable bit is lost in transit) and clears the macOS
# quarantine flag (blocks files transferred via download / AirDrop).

cd "$(dirname "$0")/.."

echo "============================================"
echo "  Fixing launcher permissions..."
echo "============================================"
echo ""

chmod +x mac/*.command 2>/dev/null
chmod +x mac/*.sh 2>/dev/null

echo "Now executable:"
ls -l mac/*.command 2>/dev/null | awk '{print "  " $1 "  " $NF}'
echo ""

echo "Clearing quarantine flag (if present)..."
xattr -dr com.apple.quarantine . 2>/dev/null && echo "  done"
echo ""

echo "You can now double-click:"
echo "    mac/Start Server.command"
echo "or run it directly:"
echo "    bash \"mac/Start Server.command\""
echo ""
read -r -p "Press Enter to close..." _
