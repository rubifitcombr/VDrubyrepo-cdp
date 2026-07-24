#!/usr/bin/env node
/**
 * Migra todos os lojistas Vyria, um de cada vez (Postgres antigo → novo + imagens).
 * Uso: node scripts/supabase-migrate/migrate-all-users.mjs
 */
import { spawnSync } from 'node:child_process'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal } from './lib.mjs'

loadEnvLocal()

const MERCHANTS = [
  {
    label: 'Zero62 (Taynara)',
    oldStoreId: 'cff0583e-0bda-47fc-8269-ee79cd09ef67',
    newSlug: 'zero62',
  },
  {
    label: 'Dona Cereja',
    oldStoreId: '47cd0abd-9ac7-4b6d-b7bc-385fce26dc5a',
    newSlug: 'donna-cereja',
  },
  {
    label: 'Secret Garden (Deborah)',
    oldStoreId: '7b970cb1-35be-4a34-8329-0797201064a6',
    newSlug: 'secret-garden-cafe',
  },
  {
    label: 'Tudibom (Aleksandra)',
    oldStoreId: 'fdc1357a-757f-4e89-9c77-07c2ef577b87',
    newSlug: 'tudibom',
  },
  {
    label: 'Arcano (Papaléguas)',
    oldStoreId: '5b2736a7-4885-48c9-8b3c-ae16ba0eaa5c',
    newSlug: 'arcano',
  },
  {
    label: 'rubiadmin',
    oldStoreId: '86fe6eb8-da92-4917-a358-467e7ec80211',
    newSlug: 'rubiadmin',
  },
]

const BUCKET = 'product-images'

async function migrateStorage(newStoreId) {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? ''
  const newSvc = createClient(
    process.env.SUPABASE_NEW_URL,
    process.env.SUPABASE_NEW_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  const neu = new pg.Client({
    connectionString: process.env.DATABASE_URL_NEW,
    ssl: { rejectUnauthorized: false },
  })
  await neu.connect()

  const { rows: prods } = await neu.query(
    `SELECT image_url FROM public.products WHERE store_id=$1 AND image_url IS NOT NULL`,
    [newStoreId]
  )
  const { rows: storeRow } = await neu.query(
    `SELECT logo_url, cover_url FROM public.stores WHERE id=$1`,
    [newStoreId]
  )

  function pathFromUrl(url) {
    if (!url || typeof url !== 'string') return null
    const marker = `/storage/v1/object/public/${BUCKET}/`
    const i = url.indexOf(marker)
    return i >= 0
      ? decodeURIComponent(url.slice(i + marker.length).split('?')[0])
      : null
  }

  const paths = new Set()
  for (const p of prods) {
    const x = pathFromUrl(p.image_url)
    if (x) paths.add(x)
  }
  for (const k of ['logo_url', 'cover_url']) {
    const x = pathFromUrl(storeRow[0]?.[k])
    if (x) paths.add(x)
  }

  let ok = 0
  let fail = 0
  for (const path of paths) {
    try {
      const res = await fetch(
        `${oldUrl}/storage/v1/object/public/${BUCKET}/${path}`,
        { signal: AbortSignal.timeout(30000) }
      )
      if (!res.ok) {
        fail++
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      const { error } = await newSvc.storage.from(BUCKET).upload(path, buf, {
        upsert: true,
        contentType: res.headers.get('content-type') || 'application/octet-stream',
      })
      if (error) fail++
      else ok++
    } catch {
      fail++
    }
  }

  const newBase = process.env.SUPABASE_NEW_URL.replace(/\/$/, '')
  const prefix = `${newBase}/storage/v1/object/public/${BUCKET}/`
  await neu.query(
    `UPDATE public.products SET image_url = $2 || substring(image_url FROM 'product-images/(.+)$')
     WHERE store_id=$1 AND image_url LIKE '%product-images/%'`,
    [newStoreId, prefix]
  )
  await neu.query(
    `UPDATE public.stores SET logo_url = $2 || substring(logo_url FROM 'product-images/(.+)$')
     WHERE id=$1 AND logo_url LIKE '%product-images/%'`,
    [newStoreId, prefix]
  )
  await neu.query(
    `UPDATE public.stores SET cover_url = $2 || substring(cover_url FROM 'product-images/(.+)$')
     WHERE id=$1 AND cover_url LIKE '%product-images/%'`,
    [newStoreId, prefix]
  )

  await neu.end()
  return { ok, fail, total: paths.size }
}

async function main() {
  const neu = new pg.Client({
    connectionString: process.env.DATABASE_URL_NEW,
    ssl: { rejectUnauthorized: false },
  })
  await neu.connect()

  const results = []

  for (const m of MERCHANTS) {
    console.log(`\n${'='.repeat(60)}\n▶ ${m.label} (${m.newSlug})\n${'='.repeat(60)}`)

    const r = spawnSync(
      'node',
      [
        'scripts/supabase-migrate/import-store-from-pg.mjs',
        `--old-store-id=${m.oldStoreId}`,
        `--new-slug=${m.newSlug}`,
      ],
      { cwd: process.cwd(), stdio: 'inherit' }
    )

    const storeRes = await neu.query(
      `SELECT id FROM public.stores WHERE slug=$1`,
      [m.newSlug]
    )
    const newStoreId = storeRes.rows[0]?.id
    let storage = { ok: 0, fail: 0, total: 0 }
    if (newStoreId) {
      storage = await migrateStorage(newStoreId)
      console.log(
        `📷 storage: ${storage.ok}/${storage.total} ok (${storage.fail} falhas)`
      )
    }

    const counts = newStoreId
      ? await neu.query(
          `SELECT
            (SELECT count(*)::int FROM products WHERE store_id=$1) AS products,
            (SELECT count(*)::int FROM orders WHERE store_id=$1) AS orders`,
          [newStoreId]
        )
      : { rows: [{}] }

    results.push({
      label: m.label,
      slug: m.newSlug,
      importOk: r.status === 0,
      ...counts.rows[0],
      storage,
    })
  }

  await neu.end()

  console.log(`\n${'='.repeat(60)}\nRESUMO FINAL\n${'='.repeat(60)}`)
  for (const r of results) {
    console.log(
      `${r.importOk ? '✓' : '✗'} ${r.label} (/ ${r.slug}) — ${r.products ?? 0} produtos, ${r.orders ?? 0} pedidos, imagens ${r.storage.ok}/${r.storage.total}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
