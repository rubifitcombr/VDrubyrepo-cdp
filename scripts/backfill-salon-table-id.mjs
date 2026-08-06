#!/usr/bin/env node
/**
 * Preenche orders.salon_table_id a partir de [Mesa …] / [Setor …] nas notas.
 *
 * Uso:
 *   node scripts/backfill-salon-table-id.mjs --store-id=<uuid>
 *   node scripts/backfill-salon-table-id.mjs --slug=secret-garden-cafe
 *   node scripts/backfill-salon-table-id.mjs --slug=secret-garden-cafe --dry-run
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

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
    /* */
  }
}
loadEnv()

function parseArgs() {
  const args = process.argv.slice(2)
  let storeId = null
  let slug = null
  let dryRun = false
  for (const a of args) {
    if (a === '--dry-run') dryRun = true
    else if (a.startsWith('--store-id=')) storeId = a.slice('--store-id='.length).trim()
    else if (a.startsWith('--slug=')) slug = a.slice('--slug='.length).trim()
  }
  return { storeId, slug, dryRun }
}

function normalizeTableLabel(value) {
  const t = String(value ?? '').trim()
  if (!t) return ''
  const m = t.match(/^mesa\s+(.+)$/i)
  return (m?.[1] ?? t).trim()
}

function tableNamesMatch(a, b) {
  const na = normalizeTableLabel(a).toLowerCase()
  const nb = normalizeTableLabel(b).toLowerCase()
  if (!na || !nb) return false
  if (na === nb) return true
  if (`mesa ${na}` === nb || na === `mesa ${nb}`) return true
  return false
}

function parseTableFromNotes(notes) {
  const t = notes?.trim()
  if (!t) return null
  const m = t.match(/^\[Mesa\s+([^\]]+)\]/im) || t.match(/\n\[Mesa\s+([^\]]+)\]/im)
  return m?.[1]?.trim() || null
}

function parseTableFromOrder(order) {
  const fromNotes = parseTableFromNotes(order.notes)
  if (fromNotes) return fromNotes
  const addr = String(order.delivery_address ?? '').trim()
  const m = addr.match(/^mesa\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

function parseSectorFromNotes(notes) {
  const t = notes?.trim()
  if (!t) return 'Salão'
  const m = t.match(/^\[Setor\s+([^\]]+)\]/im) || t.match(/\n\[Setor\s+([^\]]+)\]/im)
  return m?.[1]?.trim() || 'Salão'
}

async function resolveSalonTable(sb, storeId, tableName, sectorHint) {
  const label = tableName.trim()
  const sector = (sectorHint?.trim() || 'Salão').slice(0, 40)
  if (!label) return { tableId: null, sector, ambiguous: false }

  const { data: rows } = await sb
    .from('store_tables')
    .select('id, name, ambiente, active')
    .eq('store_id', storeId)
    .eq('active', true)

  const matches = (rows ?? []).filter((row) => tableNamesMatch(label, String(row.name ?? '')))

  if (matches.length === 1) {
    const row = matches[0]
    return {
      tableId: String(row.id),
      sector: String(row.ambiente ?? sector).trim() || sector,
      ambiguous: false,
    }
  }

  if (matches.length > 1) {
    if (sectorHint?.trim()) {
      const bySector = matches.find(
        (row) =>
          String(row.ambiente ?? '')
            .trim()
            .toLowerCase() === sectorHint.trim().toLowerCase()
      )
      if (bySector) {
        return {
          tableId: String(bySector.id),
          sector: String(bySector.ambiente ?? sector).trim() || sector,
          ambiguous: false,
        }
      }
    }
    return { tableId: null, sector, ambiguous: true }
  }

  return { tableId: null, sector, ambiguous: false }
}

async function backfillStore(sb, storeId, dryRun) {
  const { data: rows, error } = await sb
    .from('orders')
    .select('id, notes, delivery_address, source, salon_table_id')
    .eq('store_id', storeId)
    .is('salon_table_id', null)
    .in('source', ['waiter', 'autoatendimento'])
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw new Error(error.message)

  const stats = { scanned: 0, updated: 0, skipped: 0, ambiguous: 0, unresolved: 0 }

  for (const row of rows ?? []) {
    stats.scanned += 1
    const tableLabel = parseTableFromOrder(row)
    if (!tableLabel) {
      stats.unresolved += 1
      continue
    }

    const sector = parseSectorFromNotes(row.notes)
    const resolved = await resolveSalonTable(sb, storeId, tableLabel, sector)
    if (resolved.ambiguous) {
      stats.ambiguous += 1
      continue
    }
    if (!resolved.tableId) {
      stats.unresolved += 1
      continue
    }

    if (!dryRun) {
      const { error: upErr } = await sb
        .from('orders')
        .update({
          salon_table_id: resolved.tableId,
          salon_table_sector: resolved.sector,
        })
        .eq('id', row.id)
        .is('salon_table_id', null)
      if (upErr) {
        stats.unresolved += 1
        continue
      }
    }
    stats.updated += 1
  }

  return stats
}

async function main() {
  const { storeId: argStoreId, slug, dryRun } = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local')
    process.exit(1)
  }
  if (!argStoreId && !slug) {
    console.error('Informe --store-id=<uuid> ou --slug=<slug>')
    process.exit(1)
  }

  const sb = createClient(url, key)
  let storeId = argStoreId
  if (!storeId && slug) {
    const { data: store, error } = await sb.from('stores').select('id, name, slug').eq('slug', slug).single()
    if (error || !store) {
      console.error(`Loja não encontrada: ${slug}`)
      process.exit(1)
    }
    storeId = store.id
    console.log(`Loja: ${store.name} (${store.slug})`)
  }

  console.log(dryRun ? '\n🔍 Dry-run — sem alterações na base\n' : '\n🔧 Backfill salon_table_id\n')
  const stats = await backfillStore(sb, storeId, dryRun)
  console.log(`Analisados: ${stats.scanned}`)
  console.log(`Actualizados: ${stats.updated}${dryRun ? ' (simulado)' : ''}`)
  console.log(`Ambíguos: ${stats.ambiguous}`)
  console.log(`Sem mesa nas notas / não resolvido: ${stats.unresolved}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
