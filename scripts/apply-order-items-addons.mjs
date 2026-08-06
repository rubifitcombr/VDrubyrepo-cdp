#!/usr/bin/env node
/**
 * Aplica scripts/apply-order-items-addons.sql na base Supabase.
 * Uso: node scripts/apply-order-items-addons.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const key = t.slice(0, i).trim()
      let val = t.slice(i + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal()

const url =
  process.env.DATABASE_URL_NEW?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.SUPABASE_DB_URL?.trim()

if (!url) {
  console.error('DATABASE_URL em falta em .env.local')
  process.exit(1)
}

const sql = readFileSync(resolve(__dirname, 'apply-order-items-addons.sql'), 'utf8')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.log('✅ Coluna order_items.addons aplicada com sucesso.')
} catch (e) {
  console.error('❌ Erro ao aplicar SQL:', e instanceof Error ? e.message : e)
  process.exit(1)
} finally {
  await client.end()
}
