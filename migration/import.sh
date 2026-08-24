#!/usr/bin/env bash
set -euo pipefail
DUMPFILE=${1:-backup.dump}

if [ -z "${VERCEL_DB_URL:-}" ]; then
  echo "Please set VERCEL_DB_URL environment variable to your Vercel Postgres connection string"
  exit 1
fi

if [ ! -f "$DUMPFILE" ]; then
  echo "Dump file not found: $DUMPFILE"
  exit 1
fi

echo "Importing $DUMPFILE into Vercel Postgres..."
pg_restore --verbose --clean --no-owner --role=postgres --dbname="$VERCEL_DB_URL" "$DUMPFILE"

echo "Import complete"