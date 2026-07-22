#!/usr/bin/env node
/** Verifica Supabase: admin UUID, lojas, slugs públicos. */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
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

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminId = process.env.VYRIA_ADMIN_USER_ID?.trim()
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

if (!url || !key) {
  console.error('Supabase URL/service role em falta')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
let ok = true

console.log('\n=== Supabase deep check ===\n')

if (adminId) {
  const { data, error } = await supabase.auth.admin.getUserById(adminId)
  if (error || !data.user) {
    ok = false
    console.log(`✗ VYRIA_ADMIN_USER_ID (${adminId}) não encontrado no Auth`)
  } else {
    console.log(`✓ Admin Auth: ${data.user.email ?? data.user.id}`)
  }
} else {
  ok = false
  console.log('✗ VYRIA_ADMIN_USER_ID em falta')
}

const { data: stores, error: storesErr } = await supabase
  .from('stores')
  .select('id, name, slug, status, plano, plano_vence_em')
  .order('name')

if (storesErr) {
  ok = false
  console.log(`✗ stores: ${storesErr.message}`)
} else {
  const list = stores ?? []
  console.log(`✓ ${list.length} loja(s) na base`)
  const ativas = list.filter((s) => String(s.status).toLowerCase() === 'ativo')
  console.log(`  ${ativas.length} ativa(s), ${list.length - ativas.length} outras`)

  for (const store of list.slice(0, 5)) {
    const slug = String(store.slug ?? '').trim()
    if (!slug) continue
    try {
      const r = await fetch(`${base}/${slug}`, { redirect: 'manual' })
      const good = r.status === 200
      if (!good) ok = false
      console.log(`${good ? '✓' : '✗'} /${slug} → ${r.status} (${store.name})`)
    } catch (e) {
      ok = false
      console.log(`✗ /${slug}: ${e.message}`)
    }
  }
  if (list.length > 5) console.log(`  … +${list.length - 5} lojas (não testadas aqui)`)
}

console.log(`\n=== ${ok ? 'OK' : 'PROBLEMAS'} ===\n`)
process.exit(ok ? 0 : 1)
