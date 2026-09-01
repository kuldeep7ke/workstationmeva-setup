#!/bin/bash
# Workstation Meva - clean junk files (Mac/Linux)
# Deletes temp/runtime junk older than 7 days:
#   - runtime logs  (server.log, server-err.log, smoke2*.log, caddy-*.log)
#   - TypeScript build cache (tsconfig.tsbuildinfo)
# Safe while the server is running (old files are closed, recent ones kept).
# Called automatically by the OS start launchers; also runnable manually.

ROOT="$(cd "$(dirname "$0")" && pwd)"
DAYS=7

for dir in "$ROOT" "$ROOT/backend" "$ROOT/frontend" "$ROOT/proxy" "$ROOT/proxy/caddy"; do
  [ -d "$dir" ] || continue
  find "$dir" -maxdepth 1 -type f \
    \( -name 'server.log' -o -name 'server-err.log' -o -name 'smoke2*.log' \
       -o -name 'caddy-out.log' -o -name 'caddy-err.log' -o -name '*.tsbuildinfo' \) \
    -mtime +"$DAYS" -delete 2>/dev/null || true
done

exit 0