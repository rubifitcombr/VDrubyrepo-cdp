#!/usr/bin/env node
/**
 * Transfere dados para o projeto NOVO com users criados à mão.
 *
 * 1) Tenta export rápido do projeto antigo (se responder)
 * 2) Constrói owner-map.json (id antigo → id novo) por email
 * 3) Garante public.usuarios + lojas base por lojista
 * 4) Importa JSON em .migration-export/ (stores, products, orders, …)
 *
 * Uso: node scripts/supabase-migrate/transfer-manual-users.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  TABLE_EXPORT_ORDER,
  EXPORT_DIR,
  createSvc,
  readJson,
  readProjectConfig,
  saveJson,
  ensureExportDir,
  upsertBatches,
} from './lib.mjs'

/** Lojistas alvo — emails = users criados no Auth do projeto novo. */
const MERCHANTS = [
  {
    email: 'taynarafernandes103@gmail.com',
    storeName: 'Sanduicheria Zero62',
    slug: 'zero62',
    plano: 'pro',
    operation_mode: 'delivery',
  },
  {
    email: 'cerejadonna35@gmail.com',
    storeName: 'Dona Cereja',
    slug: 'donna-cereja',
    plano: 'pro',
    operation_mode: 'hybrid',
  },
  {
    email: 'deborahvicca@gmail.com',
    storeName: 'Secret Garden Cafe',
    slug: 'secret-garden-cafe',
    plano: 'growth',
    operation_mode: 'hybrid',
  },
  {
    email: 'aleksandrarenata19@gmail.com',
    storeName: 'Sanduicheria Tudibom',
    slug: 'tudibom',
    plano: 'pro',
    operation_mode: 'delivery',
  },
  {
    email: 'arcanodigital.com.br@gmail.com',
    storeName: 'Arcano',
    slug: 'arcano',
    plano: 'pro',
    operation_mode: 'hybrid',
  },
  {
    email: 'rubiadmin@gmail.com',
    storeName: 'Vyria Admin',
    slug: 'rubiadmin',
    plano: 'master',
    operation_mode: 'hybrid',
    role: 'admin',
  },
]

/** owner_id antigo conhecido (quando export não traz email no auth_users). */
const KNOWN_OLD_OWNER_BY_EMAIL = {
  'rubiadmin@gmail.com': '48357da1-a7f3-4b97-988b-1cefff055b7e',
}

function planoVenceEm() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

async function listAllAuthUsers(svc) {
  const users = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const chunk = data?.users ?? []
    users.push(...chunk)
    if (chunk.length < 200) break
  }
  return users
}

function buildOwnerMap(newUsers, exportedAuthUsers) {
  const newByEmail = new Map(
    newUsers
      .map((u) => [String(u.email ?? '').trim().toLowerCase(), u.id])
      .filter(([e]) => e)
  )
  const map = {}

  for (const row of exportedAuthUsers ?? []) {
    const email = String(row.email ?? '').trim().toLowerCase()
    const oldId = String(row.id ?? '').trim()
    const newId = newByEmail.get(email)
    if (email && oldId && newId && oldId !== newId) {
      map[oldId] = newId
    }
  }

  for (const m of MERCHANTS) {
    const email = m.email.toLowerCase()
    const newId = newByEmail.get(email)
    const oldId = KNOWN_OLD_OWNER_BY_EMAIL[email]
    if (newId && oldId && oldId !== newId) {
      map[oldId] = newId
    }
  }

  return map
}

function remapIds(rows, field, map) {
  if (!Array.isArray(rows) || !map || Object.keys(map).length === 0) return rows
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row
    const id = row[field]
    if (id && map[id]) return { ...row, [field]: map[id] }
    return row
  })
}

function tryQuickExport() {
  console.log('\n--- Tentativa export rápido (projeto antigo, 30s) ---')
  const r = spawnSync('node', ['scripts/supabase-migrate/export-all.mjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, MIGRATION_EXPORT_TIMEOUT_MS: '30000' },
    timeout: 120_000,
  })
  if (r.status !== 0) {
    console.log('○ Export antigo indisponível — usa JSON do SQL Editor em .migration-export/\n')
  }
}

async function ensureUsuariosAndStores(svc, newUsers) {
  const byEmail = new Map(
    newUsers.map((u) => [String(u.email ?? '').trim().toLowerCase(), u])
  )
  const vence = planoVenceEm()
  const usuariosRows = []
  const storeRows = []

  for (const m of MERCHANTS) {
    const user = byEmail.get(m.email.toLowerCase())
    if (!user?.id) {
      console.log(`✗ User não encontrado no Auth novo: ${m.email}`)
      continue
    }
    usuariosRows.push({
      id: user.id,
      email: m.email,
      role: m.role ?? 'lojista',
    })
    storeRows.push({
      name: m.storeName,
      slug: m.slug,
      owner_id: user.id,
      status: 'ativo',
      merchant_status: 'ativo',
      plano: m.plano,
      plan: m.plano,
      operation_mode: m.operation_mode,
      plano_vence_em: vence,
      billing_cycle: 'monthly',
    })
  }

  if (usuariosRows.length) {
    const n = await upsertBatches(svc, 'usuarios', usuariosRows)
    console.log(`✓ usuarios: ${n}`)
  }

  const { data: existingStores } = await svc.from('stores').select('id,slug,owner_id')
  const hasOwner = new Set((existingStores ?? []).map((s) => s.owner_id))
  const hasSlug = new Set(
    (existingStores ?? []).map((s) => String(s.slug ?? '').toLowerCase())
  )

  const toInsert = storeRows.filter(
    (s) => !hasOwner.has(s.owner_id) && !hasSlug.has(s.slug.toLowerCase())
  )
  if (toInsert.length) {
    const { error } = await svc.from('stores').insert(toInsert).select('id,slug')
    if (error) throw new Error(`stores insert: ${error.message}`)
    console.log(`✓ stores criadas: ${toInsert.length}`)
    for (const s of toInsert) console.log(`   - ${s.name} → /${s.slug}`)
  } else {
    console.log('○ stores: já existem para estes owners/slugs')
  }
}

async function importExportedData(svc, ownerMap) {
  const tables = TABLE_EXPORT_ORDER.filter((t) => t !== 'usuarios')
  for (const table of tables) {
    let rows = readJson(table)
    if (!Array.isArray(rows) || rows.length === 0) continue

    if (table === 'stores') {
      rows = rows.map((row) => {
        if (!row || typeof row !== 'object') return row
        const ownerId = row.owner_id
        if (ownerId && ownerMap[ownerId]) {
          return { ...row, owner_id: ownerMap[ownerId] }
        }
        return row
      })
    } else if (table === 'usuarios') {
      rows = remapIds(rows, 'id', ownerMap)
    }

    process.stdout.write(`import ${table} (${rows.length})... `)
    try {
      const n = await upsertBatches(svc, table, rows)
      console.log(`✓ ${n}`)
    } catch (e) {
      console.log(`✗ ${e.message}`)
    }
  }
}

async function main() {
  ensureExportDir()
  tryQuickExport()

  const newCfg = readProjectConfig('new')
  if (!newCfg.url || !newCfg.serviceKey) {
    console.error('Define SUPABASE_NEW_URL + SUPABASE_NEW_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const svc = createSvc(newCfg.url, newCfg.serviceKey)
  console.log(`\n=== Transfer → ${newCfg.url} ===\n`)

  const newUsers = await listAllAuthUsers(svc)
  console.log(`Auth novo: ${newUsers.length} users`)

  const exportedAuth = readJson('auth_users') ?? []
  const ownerMap = buildOwnerMap(newUsers, exportedAuth)
  if (Object.keys(ownerMap).length) {
    saveJson('owner-map', ownerMap)
    console.log(`✓ owner-map.json (${Object.keys(ownerMap).length} mapeamentos)`)
  } else {
    console.log('○ owner-map vazio (sem export auth_users ou ids iguais)')
  }

  await ensureUsuariosAndStores(svc, newUsers)
  await importExportedData(svc, ownerMap)

  const { count: storeCount } = await svc
    .from('stores')
    .select('*', { count: 'exact', head: true })
  const { count: productCount } = await svc
    .from('products')
    .select('*', { count: 'exact', head: true })

  console.log(`\nResumo novo: ${storeCount ?? 0} lojas, ${productCount ?? 0} produtos`)
  if (!exportedAuth.length && !readJson('stores')) {
    console.log(
      '\n⚠ Projeto antigo inacessível — produtos/pedidos históricos não foram importados.'
    )
    console.log(
      '  Quando tiveres JSON do SQL Editor, coloca em .migration-export/ e corre de novo este script.'
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
