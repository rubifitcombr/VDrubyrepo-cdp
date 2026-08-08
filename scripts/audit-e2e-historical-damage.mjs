#!/usr/bin/env node
/**
 * Auditoria de pedidos/comandas deixados por testes E2E/concorrência.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const SINCE = process.env.AUDIT_SINCE ?? '2026-08-07T13:42:45Z' // 1º commit suíte concorrência (UTC)
const TUDIBOM_ID = 'e472b84e-32c1-4a9d-87fc-756b874f793a'

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

const TEST_NAME_PATTERNS = [
  /^e2e\b/i,
  /^smoke\b/i,
  /smoke pós-deploy/i,
  /^teste\b/i,
  /^audit\b/i,
  /teste e2e/i,
  /comanda de teste/i,
  /^e2e /i,
  /^e2e stock/i,
  /^e2e concurrency/i,
  /^e2e rollback/i,
  /^e2e auto accept/i,
  /^e2e loyalty/i,
  /^e2e referral/i,
  /^e2e garçom/i,
  /^e2e garcom/i,
]

const TEST_MESAS = new Set(['77', '88', '99'])

function parseMesa(order) {
  const notes = String(order.notes ?? '')
  const fromNotes =
    notes.match(/^\[Mesa\s+([^\]]+)\]/im)?.[1]?.trim() ||
    notes.match(/Mesa:\s*([^\n]+)/i)?.[1]?.trim() ||
    null
  if (fromNotes) return fromNotes
  return String(order.customer_name ?? '').match(/Mesa\s+(\S+)/i)?.[1]?.trim() || null
}

function isTestOrder(order, validTableNames) {
  const name = String(order.customer_name ?? '').trim()
  const notes = String(order.notes ?? '').trim()
  if (TEST_NAME_PATTERNS.some((re) => re.test(name))) return true
  if (/pedido via qr.*teste/i.test(notes)) return true
  if (/\[E2E teardown\]/i.test(notes)) return true
  if (/\[Limpeza\]/i.test(notes)) return true
  const mesa = parseMesa(order)
  if (mesa && TEST_MESAS.has(mesa) && order.source === 'waiter') return true
  if (mesa && !validTableNames.has(mesa) && order.source === 'waiter') return true
  return false
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: stores } = await sb.from('stores').select('id, slug, name').eq('status', 'ativo')
  const storeMap = new Map((stores ?? []).map((s) => [String(s.id), s]))

  const { data: orders, error } = await sb
    .from('orders')
    .select(
      'id, store_id, status, source, customer_name, notes, total, created_at, updated_at, caixa_turno_id, payment_method'
    )
    .gte('created_at', SINCE)
    .order('created_at')

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const byStore = new Map()
  let financialRisk = []
  const tableCache = new Map()

  async function validTableNames(storeId) {
    if (tableCache.has(storeId)) return tableCache.get(storeId)
    const { data: tables } = await sb
      .from('store_tables')
      .select('name')
      .eq('store_id', storeId)
      .eq('active', true)
    const set = new Set((tables ?? []).map((t) => String(t.name).trim()))
    tableCache.set(storeId, set)
    return set
  }

  for (const order of orders ?? []) {
    const storeId = String(order.store_id)
    const validNames = await validTableNames(storeId)

    if (!isTestOrder(order, validNames)) continue

    const store = storeMap.get(storeId) ?? { slug: '?', name: '?' }
    const entry = {
      id: order.id,
      created_at: order.created_at,
      status: order.status,
      source: order.source,
      customer_name: order.customer_name,
      mesa: parseMesa(order),
      total: order.total,
      caixa_turno_id: order.caixa_turno_id,
    }

    if (!byStore.has(storeId)) {
      byStore.set(storeId, { store, orders: [], byStatus: {} })
    }
    const bucket = byStore.get(storeId)
    bucket.orders.push(entry)
    bucket.byStatus[order.status] = (bucket.byStatus[order.status] ?? 0) + 1

    const delivered = ['delivered', 'confirmed'].includes(String(order.status))
    const hasCaixa = Boolean(order.caixa_turno_id)
    if (delivered || hasCaixa) {
      financialRisk.push({ ...entry, store_slug: store.slug, store_name: store.name })
    }
  }

  console.log(`\n=== Auditoria E2E desde ${SINCE} ===\n`)

  if (byStore.size === 0) {
    console.log('Nenhum pedido de teste identificado no período.')
    return
  }

  for (const [storeId, { store, orders: list, byStatus }] of byStore) {
    console.log(`\n## ${store.name} (${store.slug}) — ${list.length} pedido(s) de teste`)
    console.log('   Por status:', byStatus)
    const tudibom = storeId === TUDIBOM_ID ? ' ← LOJA REAL' : ''
    console.log(`   store_id: ${storeId}${tudibom}`)
    const byDay = {}
    for (const o of list) {
      const day = o.created_at.slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + 1
    }
    console.log('   Por dia:', byDay)
  }

  const tudibomBucket = byStore.get(TUDIBOM_ID)
  if (tudibomBucket) {
    console.log(`\n### Tudibom — resumo`)
    console.log(`Total pedidos de teste: ${tudibomBucket.orders.length}`)
    const open = tudibomBucket.orders.filter((o) =>
      ['pending', 'preparing', 'ready', 'confirmed'].includes(String(o.status))
    )
    console.log(`Ainda abertos no histórico consultado: ${open.length}`)
  }

  console.log(`\n=== Risco financeiro (delivered/confirmed ou com caixa_turno_id) ===`)
  if (financialRisk.length === 0) {
    console.log('Nenhum pedido de teste entrou em fecho de caixa ou status entregue.')
  } else {
    for (const r of financialRisk) {
      console.log(
        `- ${r.created_at} | ${r.store_slug} | ${r.status} | R$ ${r.total} | ${r.customer_name} | caixa_turno: ${r.caixa_turno_id ?? '—'}`
      )
    }
  }

  const { count: openNow } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', TUDIBOM_ID)
    .in('status', ['pending', 'preparing', 'ready', 'confirmed'])
    .gte('created_at', SINCE)

  console.log(`\nTudibom — pedidos abertos agora (desde ${SINCE}): ${openNow ?? 0}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
