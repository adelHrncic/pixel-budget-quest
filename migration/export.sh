#!/usr/bin/env bash
set -euo pipefail
OUT=${1:-backup.dump}

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Please set SUPABASE_DB_URL environment variable to your Supabase Postgres connection string"
  exit 1
fi

echo "Exporting Supabase Postgres to $OUT..."
pg_dump --format=custom --no-owner --file="$OUT" "$SUPABASE_DB_URL"

echo "Export complete: $OUT"