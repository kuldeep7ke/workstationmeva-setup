#!/usr/bin/env bash
# Workstation Meva - create backend/.env (one-time, idempotent)
# Used by Mac/Linux launchers on first run. Never overwrites an existing .env.
# Usage: bash create-env.sh [silent]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="$ROOT/backend/.env"
EXAMPLE="$ROOT/backend/.env.example"

if [ -f "$ENV" ]; then
  echo "backend/.env already exists - nothing to do."
  [ "${1:-}" != "silent" ] && read -r -p "Press Enter to close..." _
  exit 0
fi

echo "Creating backend/.env ..."

SECRET="$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || uuidgen 2>/dev/null || echo "$RANDOM$RANDOM$RANDOM$RANDOM")"

if [ -f "$EXAMPLE" ]; then
  sed "s|^JWT_SECRET=.*$|JWT_SECRET=$SECRET|" "$EXAMPLE" > "$ENV"
else
  cat > "$ENV" <<EOF
# PostgreSQL connection string from Supabase - leave empty to run on the local
# database. Fill it later in the app: Backups page -> Database tab.
# Format: postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DATABASE_URL=

# JWT secret for authentication tokens - auto-generated
JWT_SECRET=$SECRET

# Server port
PORT=3002

# Node environment
NODE_ENV=production
EOF
fi

if [ -f "$ENV" ]; then
  echo "Done: $ENV"
  echo "  JWT_SECRET: auto-generated"
  echo "  DATABASE_URL: empty - to use Supabase, open the app and go to"
  echo "                Backups page -> Database tab, or edit backend/.env."
  echo "Next: double-click Start Server.command (Mac) / bash start.sh (Linux)"
else
  echo "ERROR: could not create backend/.env."
  [ "${1:-}" != "silent" ] && read -r -p "Press Enter to close..." _
  exit 1
fi

[ "${1:-}" != "silent" ] && read -r -p "Press Enter to close..." _
exit 0
