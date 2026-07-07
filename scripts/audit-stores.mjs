#!/usr/bin/env node
/**
 * Auditoria rápida de lojas/cardápios no Supabase.
 * Uso: node scripts/audit-stores.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))
loadEnvFile(resolve(process.cwd(), '.env'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local')
  process.exit(1)
}

const RESERVED = new Set([
  'login',
  'register',
  'dashboard',
  'admin',
  'blog',
  'api',
  'acesso-suspenso',
  'planos',
])

const supabase = createClient(url, key, { auth: { persistSession: false } })

const issues = []

const { data: stores, error } = await supabase
  .from('stores')
  .select('id, name, slug, operation_mode, plano, manual_closed, phone')

if (error) {
  console.error('Erro ao listar lojas:', error.message)
  process.exit(1)
}

const { data: productCounts } = await supabase
  .from('products')
  .select('store_id, active')

const activeByStore = new Map()
for (const row of productCounts ?? []) {
  if (!row.active) continue
  const sid = row.store_id
  activeByStore.set(sid, (activeByStore.get(sid) ?? 0) + 1)
}

console.log(`\nAuditoria Vyria — ${stores?.length ?? 0} loja(s)\n`)

for (const store of stores ?? []) {
  const slug = String(store.slug ?? '').trim().toLowerCase()
  const activeProducts = activeByStore.get(store.id) ?? 0
  const storeIssues = []

  if (!slug) storeIssues.push('slug vazio')
  if (RESERVED.has(slug)) storeIssues.push(`slug reservado (${slug})`)
  if (activeProducts === 0) storeIssues.push('sem produtos ativos no cardápio')
  if (!store.phone) storeIssues.push('sem telefone/WhatsApp')

  const mode = store.operation_mode
  if (mode && !['delivery', 'presencial', 'hibrido', 'híbrido'].includes(String(mode))) {
    storeIssues.push(`operation_mode inválido (${mode})`)
  }

  if (storeIssues.length) {
    issues.push({ store, storeIssues })
    console.log(`⚠ ${store.name} [${slug || '—'}]`)
    for (const i of storeIssues) console.log(`   - ${i}`)
  } else {
    console.log(`✓ ${store.name} [${slug}] — ${activeProducts} produto(s) ativo(s)`)
  }
}

console.log(`\nResumo: ${issues.length} loja(s) com alerta(s), ${(stores?.length ?? 0) - issues.length} OK\n`)
process.exit(issues.length ? 1 : 0)
