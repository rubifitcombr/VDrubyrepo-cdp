#!/usr/bin/env node
/**
 * Aplica migrações pendentes de forma idempotente (ignora "already exists").
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pg from 'pg'

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
}

loadEnvLocal()

const url = process.env.DATABASE_URL_NEW?.trim()
if (!url) {
  console.error('DATABASE_URL_NEW em falta no .env.local')
  process.exit(1)
}

const SKIP_PATTERNS = [
  /already exists/i,
  /duplicate key/i,
  /duplicate_object/i,
]

function shouldSkip(error) {
  const msg = String(error?.message ?? '')
  return SKIP_PATTERNS.some((re) => re.test(msg))
}

async function runSql(client, label, sql) {
  process.stdout.write(`${label}... `)
  try {
    await client.query(sql)
    console.log('✓')
    return true
  } catch (e) {
    if (shouldSkip(e)) {
      console.log('○ já aplicado')
      return true
    }
    console.log(`✗ ${e.message}`)
    return false
  }
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
})

console.log('\n=== Aplicar migrações pendentes ===\n')
await client.connect()

let failed = 0
const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  const ok = await runSql(client, file, sql)
  if (!ok) failed++
}

const extras = [
  'scripts/supabase-product-images-storage.sql',
  'scripts/supabase-store-pix.sql',
  'scripts/supabase-store-garcons.sql',
  'scripts/supabase-store-print-paper.sql',
  'scripts/supabase-orders-public-rls.sql',
  'scripts/supabase-check-stores-indexes.sql',
]

const supplemental = `
-- Colunas opcionais de aparência / configuração (idempotente)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS subtitle text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS theme_preset text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location_enabled boolean DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location_lng double precision;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location_address text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location_label text;

-- Admin notifications — schema moderno (migra de titulo/corpo se existir)
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS mensagem text;
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

UPDATE public.admin_notifications
SET
  tipo = COALESCE(NULLIF(trim(tipo), ''), NULLIF(trim(titulo), ''), 'info'),
  mensagem = COALESCE(NULLIF(trim(mensagem), ''), NULLIF(trim(corpo), ''), NULLIF(trim(titulo), ''), '')
WHERE tipo IS NULL OR mensagem IS NULL;

SELECT pg_notify('pgrst', 'reload schema');
`

for (const rel of extras) {
  const path = resolve(process.cwd(), rel)
  if (!existsSync(path)) continue
  const sql = readFileSync(path, 'utf8')
  const ok = await runSql(client, rel, sql)
  if (!ok) failed++
}

const ok = await runSql(client, 'supplemental-store-columns.sql', supplemental)
if (!ok) failed++

const verify = await client.query(`
  SELECT
    to_regclass('public.order_payments') IS NOT NULL AS order_payments,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='subtitle') AS subtitle,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='theme_preset') AS theme_preset,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_notifications' AND column_name='tipo') AS admin_tipo,
    EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='orders_public_insert') AS orders_public_insert
`)

console.log('\n--- Verificação ---')
console.log(verify.rows[0])
await client.end()

if (failed > 0) {
  console.log(`\n${failed} ficheiro(s) com erro.\n`)
  process.exit(1)
}
console.log('\nMigrações aplicadas.\n')
