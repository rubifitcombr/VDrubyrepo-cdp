#!/usr/bin/env bash
# Exporta auth.users + auth.identities com passwords (hash) preservados.
# Requer: DATABASE_URL_OLD no ambiente (Settings → Database → Connection string URI)
#
# Exemplo:
#   export DATABASE_URL_OLD='postgresql://postgres.[ref]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
#   bash scripts/supabase-migrate/pgdump-auth.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/.migration-export"
mkdir -p "$OUT"

if [[ -z "${DATABASE_URL_OLD:-}" ]]; then
  echo "Define DATABASE_URL_OLD (connection string do projeto ANTIGO)."
  exit 1
fi

echo "Exportando auth.users + auth.identities..."
pg_dump "$DATABASE_URL_OLD" \
  --data-only \
  --no-owner \
  --no-acl \
  --table=auth.users \
  --table=auth.identities \
  -f "$OUT/pgdump-auth-data.sql"

echo "OK → $OUT/pgdump-auth-data.sql"
echo "No projeto NOVO (após migrações):"
echo "  psql \"\$DATABASE_URL_NEW\" -f $OUT/pgdump-auth-data.sql"
