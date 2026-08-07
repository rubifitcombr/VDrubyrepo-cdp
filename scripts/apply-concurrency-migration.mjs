#!/usr/bin/env node
/**
 * Aplica a migração de concorrência referral/loyalty na base remota.
 * Usa DATABASE_URL_NEW ou DATABASE_URL de .env.local
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Client } = pg

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}

loadEnv()

const url = process.env.DATABASE_URL_NEW || process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL_NEW ou DATABASE_URL ausente em .env.local')
  process.exit(1)
}

const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260807140000_concurrency_referral_loyalty_unique.sql'),
  'utf8'
)

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

console.log('A aplicar migração de concorrência…')
await client.connect()
await client.query(migration)
await client.end()
console.log('Migração aplicada.')
