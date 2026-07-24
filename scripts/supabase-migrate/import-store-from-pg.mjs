#!/usr/bin/env node
/**
 * Importa TODOS os dados de uma loja do Postgres ANTIGO → NOVO.
 *
 * Uso:
 *   node scripts/supabase-migrate/import-store-from-pg.mjs \
 *     --old-store-id=7b970cb1-35be-4a34-8329-0797201064a6 \
 *     --new-slug=secret-garden-cafe
 */
import pg from 'pg'
import { loadEnvLocal } from './lib.mjs'

loadEnvLocal()

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const OLD_STORE_ID = arg('old-store-id', '7b970cb1-35be-4a34-8329-0797201064a6')
const NEW_SLUG = arg('new-slug', 'secret-garden-cafe')

const IMPORT_ORDER = [
  { table: 'categories', where: 'store_id = $1' },
  { table: 'products', where: 'store_id = $1' },
  { table: 'store_promotions', where: 'store_id = $1' },
  { table: 'store_product_stock', where: 'store_id = $1' },
  { table: 'store_tables', where: 'store_id = $1' },
  { table: 'store_garcons', where: 'store_id = $1' },
  { table: 'store_entregadores', where: 'store_id = $1' },
  { table: 'suppliers', where: 'store_id = $1' },
  { table: 'store_fiscal_config', where: 'store_id = $1' },
  { table: 'store_push_subscriptions', where: 'store_id = $1' },
  { table: 'contrato_aceites', where: 'store_id = $1' },
  { table: 'faturas', where: 'store_id = $1' },
  { table: 'financial_entries', where: 'store_id = $1' },
  { table: 'fiscal_invoices', where: 'store_id = $1' },
  { table: 'caixas_turnos', where: 'store_id = $1' },
  {
    table: 'caixa_movimentacoes',
    where: 'store_id = $1',
  },
  { table: 'orders', where: 'store_id = $1' },
  {
    table: 'order_items',
    sql: `SELECT oi.* FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          WHERE o.store_id = $1`,
  },
  {
    table: 'order_payments',
    sql: `SELECT op.* FROM public.order_payments op
          JOIN public.orders o ON o.id = op.order_id
          WHERE o.store_id = $1`,
  },
  {
    table: 'entregas',
    where: 'store_id = $1',
  },
  {
    table: 'addon_groups',
    sql: `SELECT g.* FROM public.addon_groups g
          JOIN public.products p ON p.id = g.product_id
          WHERE p.store_id = $1`,
  },
  {
    table: 'addon_items',
    sql: `SELECT i.* FROM public.addon_items i
          JOIN public.addon_groups g ON g.id = i.group_id
          JOIN public.products p ON p.id = g.product_id
          WHERE p.store_id = $1`,
  },
  { table: 'admin_notifications', where: 'store_id = $1' },
]

async function tableExists(client, table) {
  const r = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS ok`,
    [`public.${table}`]
  )
  return r.rows[0].ok
}

async function getColumns(client, table) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table]
  )
  return new Set(r.rows.map((x) => x.column_name))
}

function remapRow(row, { oldStoreId, newStoreId, oldOwnerId, newOwnerId }, table) {
  const out = { ...row }
  if (out.store_id === oldStoreId) out.store_id = newStoreId
  if (out.owner_id === oldOwnerId) out.owner_id = newOwnerId
  if (table === 'store_tables') {
    if (out.name != null && out.nome == null) out.nome = out.name
    if (out.active != null && out.ativo == null) out.ativo = out.active
  }
  if (table === 'store_garcons' && out.name != null && out.nome == null) {
    out.nome = out.name
  }
  return out
}

async function upsertRows(newClient, table, rows, columns) {
  if (!rows.length) return 0
  let cols = [...columns].filter((c) => c in rows[0])
  if (table === 'store_tables' && !cols.includes('nome') && cols.includes('name')) {
    rows = rows.map((r) => ({ ...r, nome: r.name ?? r.nome }))
    cols = [...new Set([...cols, 'nome'])]
  }
  if (table === 'store_tables' && !cols.includes('ativo') && cols.includes('active')) {
    rows = rows.map((r) => ({ ...r, ativo: r.active ?? r.ativo ?? true }))
    cols = [...new Set([...cols, 'ativo'])]
  }
  if (!cols.length) return 0

  const colList = cols.map((c) => `"${c}"`).join(', ')
  const conflict = cols.includes('id') ? 'id' : null
  let n = 0

  for (const row of rows) {
    const vals = cols.map((c) => row[c])
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
    if (conflict) {
      const sets = cols
        .filter((c) => c !== 'id')
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(', ')
      await newClient.query(
        `INSERT INTO public.${table} (${colList}) VALUES (${ph})
         ON CONFLICT ("${conflict}") DO UPDATE SET ${sets}`,
        vals
      )
    } else {
      await newClient.query(
        `INSERT INTO public.${table} (${colList}) VALUES (${ph})`,
        vals
      )
    }
    n += 1
  }
  return n
}

async function main() {
  const oldUrl = process.env.DATABASE_URL_OLD
  const newUrl = process.env.DATABASE_URL_NEW
  if (!oldUrl || !newUrl) {
    console.error('DATABASE_URL_OLD e DATABASE_URL_NEW são obrigatórios')
    process.exit(1)
  }

  const oldDb = new pg.Client({
    connectionString: oldUrl,
    ssl: { rejectUnauthorized: false },
  })
  const newDb = new pg.Client({
    connectionString: newUrl,
    ssl: { rejectUnauthorized: false },
  })
  await oldDb.connect()
  await newDb.connect()

  const oldStoreRes = await oldDb.query(
    `SELECT * FROM public.stores WHERE id = $1`,
    [OLD_STORE_ID]
  )
  if (!oldStoreRes.rows[0]) {
    throw new Error(`Loja antiga não encontrada: ${OLD_STORE_ID}`)
  }
  const oldStore = oldStoreRes.rows[0]

  const newStoreRes = await newDb.query(
    `SELECT * FROM public.stores WHERE slug = $1`,
    [NEW_SLUG]
  )
  if (!newStoreRes.rows[0]) {
    throw new Error(`Loja nova não encontrada: slug=${NEW_SLUG}`)
  }
  const newStore = newStoreRes.rows[0]

  const oldOwnerId = oldStore.owner_id
  const newOwnerId = newStore.owner_id
  const newStoreId = newStore.id

  console.log(`\n=== Import loja ===`)
  console.log(`Antigo: ${oldStore.name} (${oldStore.slug}) ${OLD_STORE_ID}`)
  console.log(`Novo:   ${newStore.name} (${newStore.slug}) ${newStoreId}`)
  console.log(`Owner:  ${oldOwnerId} → ${newOwnerId}\n`)

  // 1) Mesclar configurações / aparência da loja antiga na loja nova
  const newStoreCols = await getColumns(newDb, 'stores')
  const merged = { ...oldStore }
  merged.id = newStoreId
  merged.owner_id = newOwnerId
  merged.slug = newStore.slug
  merged.name = newStore.name || oldStore.name

  const storeCols = [...newStoreCols].filter(
    (c) => c !== 'id' && merged[c] !== undefined
  )
  const setClause = storeCols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')
  const storeVals = storeCols.map((c) => merged[c])
  await newDb.query(
    `UPDATE public.stores SET ${setClause} WHERE id = $${storeCols.length + 1}`,
    [...storeVals, newStoreId]
  )
  console.log(`✓ stores: configurações mescladas (${storeCols.length} colunas)`)

  const remap = (row, table) =>
    remapRow(row, { oldStoreId: OLD_STORE_ID, newStoreId, oldOwnerId, newOwnerId }, table)

  const summary = []

  for (const spec of IMPORT_ORDER) {
    const { table } = spec
    if (!(await tableExists(oldDb, table))) {
      summary.push({ table, count: 0, note: 'não existe no antigo' })
      continue
    }
    if (!(await tableExists(newDb, table))) {
      summary.push({ table, count: 0, note: 'não existe no novo — ignorado' })
      continue
    }

    const fetchSql =
      spec.sql ??
      `SELECT * FROM public.${table} WHERE ${spec.where}`
    const { rows } = await oldDb.query(fetchSql, [OLD_STORE_ID])
    const remapped = rows.map((row) => remap(row, table))
    const oldCols = await getColumns(oldDb, table)
    const newCols = await getColumns(newDb, table)
    const shared = [...oldCols].filter((c) => newCols.has(c))

    try {
      const n = await upsertRows(newDb, table, remapped, shared)
      console.log(`✓ ${table}: ${n}`)
      summary.push({ table, count: n, ok: true })
    } catch (e) {
      console.log(`✗ ${table}: ${e.message}`)
      summary.push({ table, count: 0, ok: false, error: e.message })
    }
  }

  // usuarios espelho
  if (oldOwnerId && newOwnerId && oldOwnerId !== newOwnerId) {
    const u = await oldDb.query(`SELECT * FROM public.usuarios WHERE id = $1`, [
      oldOwnerId,
    ])
    if (u.rows[0]) {
      const row = { ...u.rows[0], id: newOwnerId }
      await newDb.query(
        `INSERT INTO public.usuarios (id, email, role, created_at)
         VALUES ($1, $2, $3, coalesce($4, now()))
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role`,
        [row.id, row.email, row.role, row.created_at]
      )
      console.log('✓ usuarios: espelho do dono')
    }
  }

  const counts = await newDb.query(
    `SELECT
      (SELECT count(*)::int FROM products WHERE store_id=$1) AS products,
      (SELECT count(*)::int FROM orders WHERE store_id=$1) AS orders,
      (SELECT count(*)::int FROM categories WHERE store_id=$1) AS categories,
      (SELECT count(*)::int FROM store_tables WHERE store_id=$1) AS tables,
      (SELECT count(*)::int FROM caixas_turnos WHERE store_id=$1) AS caixas`,
    [newStoreId]
  )
  console.log('\nResumo no projeto NOVO:', counts.rows[0])
  console.log('\nDetalhe:', summary.filter((s) => s.count > 0 || s.error))

  await oldDb.end()
  await newDb.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
