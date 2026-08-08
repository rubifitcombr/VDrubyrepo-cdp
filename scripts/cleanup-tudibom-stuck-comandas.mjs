#!/usr/bin/env node
/**
 * Cancela pedidos/comandas de teste presos — Sanduicheria Tudibom (produção).
 * Restaura stock dos itens antes de cancelar.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const STORE_ID = 'e472b84e-32c1-4a9d-87fc-756b874f793a'
const OPEN_STATUSES = ['pending', 'preparing', 'ready', 'confirmed']

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
]

function parseMesaFromOrder(order) {
  const notes = String(order.notes ?? '')
  const fromNotes =
    notes.match(/^\[Mesa\s+([^\]]+)\]/im)?.[1]?.trim() ||
    notes.match(/Mesa:\s*([^\n]+)/i)?.[1]?.trim() ||
    null
  if (fromNotes) return fromNotes
  const fromName = String(order.customer_name ?? '').match(/Mesa\s+(\S+)/i)?.[1]?.trim()
  return fromName || null
}

function isTestOrder(order, validTableNames) {
  const name = String(order.customer_name ?? '').trim()
  const notes = String(order.notes ?? '').trim()
  if (/\[Limpeza\]/i.test(notes)) return false
  if (TEST_NAME_PATTERNS.some((re) => re.test(name))) return true
  if (/pedido via qr.*teste/i.test(notes)) return true

  const mesa = parseMesaFromOrder(order)
  if (mesa && !validTableNames.has(mesa)) return true

  return false
}

async function restoreOrderStock(sb, orderId) {
  const { data: items, error } = await sb
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)

  if (error) return { ok: false, error: error.message }
  const lines = (items ?? []).filter((row) => row.product_id && Number(row.quantity) > 0)
  if (lines.length === 0) return { ok: true }

  for (const line of lines) {
    const productId = String(line.product_id)
    const qty = Math.max(0, Number(line.quantity) || 0)
    const { data: row } = await sb
      .from('store_product_stock')
      .select('quantity')
      .eq('store_id', STORE_ID)
      .eq('product_id', productId)
      .maybeSingle()
    if (!row) continue

    const next = (Number(row.quantity) || 0) + qty
    const { error: upErr } = await sb
      .from('store_product_stock')
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq('store_id', STORE_ID)
      .eq('product_id', productId)
    if (upErr) return { ok: false, error: upErr.message }
  }
  return { ok: true }
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: tables } = await sb
    .from('store_tables')
    .select('name')
    .eq('store_id', STORE_ID)
    .eq('active', true)
  const validTableNames = new Set((tables ?? []).map((t) => String(t.name).trim()))

  const { data: open, error } = await sb
    .from('orders')
    .select('id, status, source, customer_name, notes, total')
    .eq('store_id', STORE_ID)
    .in('status', OPEN_STATUSES)

  if (error) {
    console.error('Erro ao listar pedidos:', error.message)
    process.exit(1)
  }

  const targets = (open ?? []).filter((order) => isTestOrder(order, validTableNames))
  if (targets.length === 0) {
    console.log('Nenhum pedido/comanda de teste em aberto.')
    return
  }

  console.log(`A cancelar ${targets.length} pedido(s)/comanda(s) de teste…`)
  for (const order of targets) {
    const stock = await restoreOrderStock(sb, order.id)
    if (!stock.ok) {
      console.error(`⚠️  stock ${order.id.slice(0, 8)}: ${stock.error}`)
    }

    const noteBase = String(order.notes ?? '').trim()
    const cleanupLine = '[Limpeza] Pedido de teste cancelado.'
    const notes = noteBase ? `${noteBase}\n${cleanupLine}` : cleanupLine
    const { error: upErr } = await sb
      .from('orders')
      .update({ status: 'cancelled', notes })
      .eq('id', order.id)
      .eq('store_id', STORE_ID)
      .neq('status', 'cancelled')

    if (upErr) {
      console.error(`❌ ${order.id.slice(0, 8)}: ${upErr.message}`)
      continue
    }
    console.log(
      `✅ Cancelado ${order.id.slice(0, 8)} — [${order.source}] ${order.customer_name || 'sem nome'} — R$ ${order.total}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
