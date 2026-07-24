#!/usr/bin/env node
/**
 * Copia imagens públicas do projeto antigo para Storage do projeto novo.
 * Lê products.json e stores.json em .migration-export/
 *
 * Uso: node scripts/supabase-migrate/migrate-storage.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  loadEnvLocal,
  readJson,
  readProjectConfig,
} from './lib.mjs'

const MENU_IMAGE_BUCKET = 'product-images'

loadEnvLocal()

const oldUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, '') ?? ''
const newCfg = readProjectConfig('new')
if (!oldUrl || !newCfg.url || !newCfg.serviceKey) {
  console.error('Precisas de NEXT_PUBLIC_SUPABASE_URL (antigo) e SUPABASE_NEW_*')
  process.exit(1)
}

const newSvc = createClient(newCfg.url, newCfg.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function collectPaths() {
  const paths = new Set()
  const stores = readJson('stores') ?? []
  const products = readJson('products') ?? []

  for (const row of [...stores, ...products]) {
    if (!row || typeof row !== 'object') continue
    for (const key of [
      'logo_url',
      'storefront_banner_url',
      'image_url',
    ]) {
      const v = row[key]
      if (typeof v !== 'string' || !v.trim()) continue
      const path = storagePathFromUrl(v, oldUrl)
      if (path) paths.add(path)
    }
  }
  return [...paths]
}

function storagePathFromUrl(url, base) {
  const s = url.trim()
  const marker = `/storage/v1/object/public/${MENU_IMAGE_BUCKET}/`
  const i = s.indexOf(marker)
  if (i >= 0) return decodeURIComponent(s.slice(i + marker.length).split('?')[0])
  if (s.startsWith(`${base}${marker}`)) {
    return decodeURIComponent(s.slice(`${base}${marker}`.length).split('?')[0])
  }
  if (!s.includes('://') && !s.startsWith('/')) return s
  return null
}

async function copyPath(path) {
  const src = `${oldUrl}/storage/v1/object/public/${MENU_IMAGE_BUCKET}/${path}`
  const res = await fetch(src)
  if (!res.ok) {
    return { path, ok: false, error: `HTTP ${res.status}` }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const { error } = await newSvc.storage.from(MENU_IMAGE_BUCKET).upload(path, buf, {
    upsert: true,
    contentType,
  })
  if (error) return { path, ok: false, error: error.message }
  return { path, ok: true }
}

const paths = collectPaths()
console.log(`\n=== Storage: ${paths.length} ficheiros ===\n`)
if (paths.length === 0) {
  console.log('Sem paths — exporta stores.json e products.json primeiro.')
  process.exit(0)
}

let ok = 0
let fail = 0
for (const path of paths) {
  process.stdout.write(`${path}... `)
  const r = await copyPath(path)
  if (r.ok) {
    ok += 1
    console.log('✓')
  } else {
    fail += 1
    console.log(`✗ ${r.error}`)
  }
}
console.log(`\nConcluído: ${ok} ok, ${fail} falhas\n`)
