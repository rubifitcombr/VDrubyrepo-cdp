#!/usr/bin/env bash
# Exporta todos os dados do schema public (sem auth).
# Requer DATABASE_URL_OLD
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/.migration-export"
mkdir -p "$OUT"

if [[ -z "${DATABASE_URL_OLD:-}" ]]; then
  echo "Define DATABASE_URL_OLD"
  exit 1
fi

echo "Exportando schema public (data-only)..."
pg_dump "$DATABASE_URL_OLD" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-acl \
  -f "$OUT/pgdump-public-data.sql"

echo "OK → $OUT/pgdump-public-data.sql"
