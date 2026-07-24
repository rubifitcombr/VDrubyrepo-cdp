#!/usr/bin/env node
/**
 * Aplica migrações SQL no projeto NOVO via conexão directa Postgres.
 * Lê DATABASE_URL_NEW ou monta a partir de SUPABASE_DB_PASSWORD + SUPABASE_NEW_URL.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import pg from 'pg'
import { loadEnvLocal, readProjectConfig } from './lib.mjs'

loadEnvLocal()

function buildDatabaseUrlNew() {
  if (process.env.DATABASE_URL_NEW?.trim()) {
    return process.env.DATABASE_URL_NEW.trim()
  }
  const ref = 'ijukzuwdrobtwcqqytlu'
  const pass =
    process.env.SUPABASE_DB_PASSWORD_NEW?.trim() ||
    process.env.SUPABASE_DB_PASSWORD?.trim()
  if (!pass) return null
  const enc = encodeURIComponent(pass)
  return `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`
}

const url = buildDatabaseUrlNew()
if (!url) {
  console.error('Define DATABASE_URL_NEW ou SUPABASE_DB_PASSWORD no .env.local')
  process.exit(1)
}

const dir = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
})

console.log('\n=== Aplicar schema no projeto NOVO ===\n')
await client.connect()

for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8')
  process.stdout.write(`${file}... `)
  try {
    await client.query(sql)
    console.log('✓')
  } catch (e) {
    console.log(`✗ ${e.message}`)
    await client.end()
    process.exit(1)
  }
}

const check = await client.query(
  "SELECT to_regclass('public.stores') IS NOT NULL AS stores_ok"
)
console.log('\nstores existe:', check.rows[0].stores_ok)
await client.end()
console.log('Schema aplicado com sucesso.\n')
