#!/usr/bin/env node
/**
 * Aplica correções de dados da auditoria multi-loja (Ago/2026).
 *
 * Uso:
 *   node scripts/apply-multi-store-audit-fixes.mjs --dry-run
 *   node scripts/apply-multi-store-audit-fixes.mjs
 *   node scripts/apply-multi-store-audit-fixes.mjs --slug=donna-cereja
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const OPEN_SALON = ['pending', 'preparing', 'ready', 'confirmed']
const SALON_SOURCES = ['waiter', 'autoatendimento']
const STALE_READY_DAYS = 30

const STORE_CONFIG = {
  'donna-cereja': {
    salao_attendance_mode: 'waiter',
    tables: { sector: 'Salão', from: 1, to: 12 },
  },
  'restaurante-oasis-mediterraneo': {
    salao_attendance_mode: 'waiter',
    renameGarcons: [
      { id: '8e2baa84-4c73-4cb4-a9b3-9a851537d307', nome: 'Francisco · PIN' },
      { id: 'a5695c53-a8b9-48d1-8b69-713e16c821e9', nome: 'Francisco' },
    ],
  },
  zero62: {
    salao_attendance_mode: 'waiter',
  },
}

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

function log(action, detail) {
  console.log(`${action} ${detail}`)
}

function parseTableFromNotes(notes) {
  const t = notes?.trim()
  if (!t) return null
  const m = t.match(/^\[Mesa\s+([^\]]+)\]/im) || t.match(/\n\[Mesa\s+([^\]]+)\]/im)
  return m?.[1]?.trim() || null
}

function paymentRegistered(notes) {
  const text = String(notes ?? '')
  return (
    /\[Caixa\] Fechado em /i.test(text) ||
    /\[PDV\] Recebido em /i.test(text) ||
    /\[Garçom\] Recebido em /i.test(text) ||
    /\[Sistema\] Encerrado automaticamente/i.test(text)
  )
}

function parsePaymentLinesFromCloseNote(notes, orderTotal = 0) {
  const text = String(notes ?? '')
  const patterns = [
    /\[Garçom\] Recebido em [^(]+\(([^)]+)\)/i,
    /\[Caixa\] Fechado em [^(]+\(([^)]+)\)/i,
    /\[PDV\] Recebido em [^(]+\(([^)]+)\)/i,
  ]
  const methods = new Set([
    'cash',
    'pix',
    'card',
    'card_credit',
    'card_debit',
  ])
  for (const re of patterns) {
    const m = text.match(re)
    const inner = m?.[1]?.trim()
    if (!inner) continue
    if (inner.includes(':')) {
      const lines = []
      for (const part of inner.split(',')) {
        const colon = part.trim().indexOf(':')
        if (colon < 0) continue
        const method = part.trim().slice(0, colon).toLowerCase()
        const amount = Math.round(Number(part.trim().slice(colon + 1).replace(',', '.')) * 100) / 100
        if (!methods.has(method) || amount <= 0) continue
        lines.push({ method, amount })
      }
      if (lines.length) return lines
    } else if (methods.has(inner.toLowerCase()) && orderTotal > 0) {
      return [{ method: inner.toLowerCase(), amount: orderTotal }]
    }
  }
  return []
}

async function ensureTables(sb, storeId, spec, dryRun) {
  const { sector, from, to } = spec
  const { count } = await sb
    .from('store_tables')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)

  if ((count ?? 0) > 0) {
    log('ℹ️ ', `Mesas já existem (${count}) — skip criação`)
    return 0
  }

  const rows = []
  for (let n = from; n <= to; n++) {
    rows.push({
      store_id: storeId,
      name: String(n),
      nome: String(n),
      ambiente: sector,
      sort_order: n,
      active: true,
      ativo: true,
    })
  }

  if (!dryRun) {
    const { error } = await sb.from('store_tables').insert(rows)
    if (error) throw new Error(`Criar mesas: ${error.message}`)
  }
  log('✅', `Criadas ${rows.length} mesas (${sector} ${from}–${to})${dryRun ? ' [dry-run]' : ''}`)
  return rows.length
}

async function updateStoreConfig(sb, slug, config, dryRun) {
  const patch = {}
  if (config.salao_attendance_mode) {
    patch.salao_attendance_mode = config.salao_attendance_mode
  }
  if (Object.keys(patch).length === 0) return

  if (!dryRun) {
    const { error } = await sb.from('stores').update(patch).eq('slug', slug)
    if (error) throw new Error(`stores.${slug}: ${error.message}`)
  }
  log('✅', `${slug}: salao_attendance_mode=${patch.salao_attendance_mode}${dryRun ? ' [dry-run]' : ''}`)
}

async function renameGarcons(sb, renames, dryRun) {
  for (const row of renames) {
    if (!dryRun) {
      const { error } = await sb
        .from('store_garcons')
        .update({ nome: row.nome })
        .eq('id', row.id)
      if (error) throw new Error(`garcom ${row.id}: ${error.message}`)
    }
    log('✅', `Garçom ${row.id.slice(0, 8)} → «${row.nome}»${dryRun ? ' [dry-run]' : ''}`)
  }
}

async function nameUnnamedSalonComandas(sb, storeId, dryRun) {
  const { data: orders } = await sb
    .from('orders')
    .select('id, customer_name, notes')
    .eq('store_id', storeId)
    .in('source', SALON_SOURCES)
    .in('status', OPEN_SALON)
    .is('caixa_turno_id', null)

  let updated = 0
  for (const o of orders ?? []) {
    if (String(o.customer_name ?? '').trim()) continue
    const mesa = parseTableFromNotes(o.notes)
    if (!mesa) continue
    const label = `Mesa ${mesa}`
    if (!dryRun) {
      const { error } = await sb
        .from('orders')
        .update({ customer_name: label })
        .eq('id', o.id)
      if (error) throw new Error(error.message)
    }
    updated += 1
    log('✅', `Comanda ${o.id.slice(0, 8)} nomeada «${label}»${dryRun ? ' [dry-run]' : ''}`)
  }
  return updated
}

async function repairSplitPayments(sb, storeId, dryRun) {
  const { data: splits } = await sb
    .from('orders')
    .select('id, notes, total, payment_method, caixa_turno_id, status')
    .eq('store_id', storeId)
    .eq('payment_method', 'split')

  let repaired = 0
  for (const order of splits ?? []) {
    const { count } = await sb
      .from('order_payments')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', order.id)
    if (count > 0) continue

    const lines = parsePaymentLinesFromCloseNote(order.notes, Number(order.total) || 0)
    if (lines.length === 0) {
      log('⚠️ ', `Split ${order.id.slice(0, 8)} sem linhas nas notas — ignorado`)
      continue
    }

    const turnoId = order.caixa_turno_id
    if (!turnoId) {
      log('⚠️ ', `Split ${order.id.slice(0, 8)} sem caixa_turno_id — ignorado`)
      continue
    }

    if (!dryRun) {
      const rows = lines.map((line) => ({
        store_id: storeId,
        order_id: order.id,
        payment_method: line.method,
        amount_brl: line.amount,
        caixa_turno_id: turnoId,
      }))
      const { error } = await sb.from('order_payments').insert(rows)
      if (error) throw new Error(`order_payments ${order.id}: ${error.message}`)
    }
    repaired += 1
    log(
      '✅',
      `Split ${order.id.slice(0, 8)}: ${lines.length} linha(s) em order_payments${dryRun ? ' [dry-run]' : ''}`
    )
  }
  return repaired
}

async function closeStaleReadyOrders(sb, storeId, dryRun) {
  const cutoff = new Date(Date.now() - STALE_READY_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: orders } = await sb
    .from('orders')
    .select('id, source, status, notes, payment_method, total, created_at')
    .eq('store_id', storeId)
    .eq('status', 'ready')
    .lt('created_at', cutoff)
    .in('source', ['site_pickup', 'site_live', 'pdv'])

  let closed = 0
  for (const o of orders ?? []) {
    if (paymentRegistered(o.notes)) continue
    const method = String(o.payment_method ?? 'cash').trim() || 'cash'
    const closeLine = `[Sistema] Encerrado automaticamente (auditoria) — ${new Date().toISOString()} (${method})`
    const notes = o.notes ? `${o.notes}\n${closeLine}` : closeLine

    if (!dryRun) {
      const { error } = await sb
        .from('orders')
        .update({ status: 'delivered', notes })
        .eq('id', o.id)
      if (error) throw new Error(error.message)
    }
    closed += 1
    log(
      '✅',
      `Pedido órfão ${o.id.slice(0, 8)} (${o.source}) → delivered${dryRun ? ' [dry-run]' : ''}`
    )
  }
  return closed
}

function runBackfill(slug, dryRun) {
  const args = ['scripts/backfill-salon-table-id.mjs', `--slug=${slug}`]
  if (dryRun) args.push('--dry-run')
  const r = spawnSync('node', args, { cwd: root, stdio: 'inherit', env: process.env })
  if (r.status !== 0) throw new Error(`Backfill ${slug} falhou`)
}

async function applyStoreFixes(sb, store, dryRun) {
  const slug = store.slug
  const config = STORE_CONFIG[slug] ?? {}

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`🏪 ${store.name} (${slug})`)
  console.log('─'.repeat(60))

  await updateStoreConfig(sb, slug, config, dryRun)

  if (config.tables) {
    await ensureTables(sb, store.id, config.tables, dryRun)
  }

  if (config.renameGarcons?.length) {
    await renameGarcons(sb, config.renameGarcons, dryRun)
  }

  await nameUnnamedSalonComandas(sb, store.id, dryRun)
  await repairSplitPayments(sb, store.id, dryRun)
  await closeStaleReadyOrders(sb, store.id, dryRun)

  log('🔧', `Backfill salon_table_id (${slug})`)
  runBackfill(slug, dryRun)
}

function parseArgs() {
  const args = process.argv.slice(2)
  let slug = null
  let dryRun = false
  let all = false
  for (const a of args) {
    if (a === '--dry-run') dryRun = true
    else if (a === '--all') all = true
    else if (a.startsWith('--slug=')) slug = a.slice(7).trim()
  }
  return { slug, dryRun, all }
}

async function main() {
  const { slug, dryRun, all } = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log(`\n🔧 Correções auditoria multi-loja${dryRun ? ' (dry-run)' : ''}\n`)

  const sb = createClient(url, key)
  const targetSlugs = all
    ? ['arcano', 'donna-cereja', 'restaurante-oasis-mediterraneo', 'zero62', 'rubiadmin']
  : slug
    ? [slug]
    : null

  if (!targetSlugs) {
    console.error('Uso: --all | --slug=xxx [--dry-run]')
    process.exit(1)
  }

  for (const s of targetSlugs) {
    const { data: store, error } = await sb.from('stores').select('*').eq('slug', s).single()
    if (error || !store) {
      console.error(`Loja não encontrada: ${s}`)
      process.exit(1)
    }
    await applyStoreFixes(sb, store, dryRun)
  }

  console.log(`\n── Concluído${dryRun ? ' (simulado)' : ''} ──\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
