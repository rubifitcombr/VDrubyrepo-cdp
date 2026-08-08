#!/usr/bin/env node
/**
 * Falha rápido se os testes E2E estiverem apontando para loja de cliente real.
 */
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const BLOCKED = new Set([
  'tudibom',
  'secret-garden',
  'arcano',
  'donna-cereja',
  'zero62',
])

function parseEnvFile(name) {
  const p = resolve(root, name)
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    out[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

const env = {
  ...parseEnvFile('.env.local'),
  ...parseEnvFile('.env.test'),
  ...process.env,
}

const slug = String(env.E2E_STORE_SLUG ?? '').trim().toLowerCase()
const storeId = String(env.E2E_STORE_ID ?? '').trim()

if (!existsSync(resolve(root, '.env.test'))) {
  console.error(
    '❌ Arquivo .env.test ausente.\n' +
      '   Copie .env.test.example → .env.test e execute: npm run e2e:provision'
  )
  process.exit(1)
}

if (!slug || !storeId) {
  console.error('❌ E2E_STORE_SLUG e E2E_STORE_ID são obrigatórios em .env.test')
  process.exit(1)
}

if (env.E2E_ALLOW_PRODUCTION_STORE === 'true') {
  console.warn('⚠️  E2E_ALLOW_PRODUCTION_STORE=true — testes podem mutar loja real!')
  process.exit(0)
}

if (BLOCKED.has(slug)) {
  console.error(
    `❌ E2E_STORE_SLUG="${slug}" é uma loja de cliente real.\n` +
      '   Execute: npm run e2e:provision\n' +
      '   e use E2E_STORE_SLUG=e2e-test-store'
  )
  process.exit(1)
}

if (slug !== 'e2e-test-store') {
  console.error(
    `❌ E2E_STORE_SLUG deve ser "e2e-test-store" (atual: "${slug}").\n` +
      '   Execute: npm run e2e:provision'
  )
  process.exit(1)
}

console.log(`✓ E2E env OK — loja dedicada "${slug}" (${storeId.slice(0, 8)}…)`)
