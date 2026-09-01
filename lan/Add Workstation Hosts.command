#!/bin/bash
# Workstation Meva - add "workstation" hostname so http://workstation:3002 works
# 192.168.1.14 is the server's current IP - re-run this if the server's IP changes.

if [ "$(id -u)" -ne 0 ]; then
  echo "Administrator rights needed - you will be asked for your Mac password."
  exec sudo "$0" "$@"
fi

HOSTS=/etc/hosts
sed -i.bak "/ workstation$/d" "$HOSTS"
echo "192.168.1.14 workstation" >> "$HOSTS"
rm -f "$HOSTS.bak"
dscacheutil -flushcache 2>/dev/null
killall -HUP mDNSResponder 2>/dev/null

echo
echo "Done. This Mac can now open:"
echo "  http://workstation:3002"
echo
exit 0
