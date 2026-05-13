import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { gerarCupomPedido } from '@/lib/escpos'
import { parseTableFromNotes } from '@/lib/waiter-order-notes'
import {
  thermalAutoSourceFromOrderSource,
  type ThermalAutoSource,
} from '@/lib/thermal-print-source'

export type StoreThermalRow = {
  name: string | null
  print_agent_url: string | null
  print_agent_token: string | null
  print_printer_ip: string | null
  print_printer_port: number | null
  print_auto_delivery: boolean
  print_auto_autoatendimento: boolean
  print_auto_pdv: boolean
  print_auto_garcom: boolean
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

export function parseStoreThermalRow(
  row: Record<string, unknown>
): StoreThermalRow {
  const port = row.print_printer_port
  const portN =
    typeof port === 'number'
      ? port
      : Number.parseInt(String(port ?? ''), 10)
  return {
    name: typeof row.name === 'string' ? row.name : null,
    print_agent_url:
      typeof row.print_agent_url === 'string' ? row.print_agent_url.trim() : null,
    print_agent_token:
      typeof row.print_agent_token === 'string'
        ? row.print_agent_token.trim()
        : null,
    print_printer_ip:
      typeof row.print_printer_ip === 'string'
        ? row.print_printer_ip.trim()
        : null,
    print_printer_port:
      Number.isFinite(portN) && portN > 0 ? portN : 9100,
    print_auto_delivery: bool(row.print_auto_delivery, false),
    print_auto_autoatendimento: bool(row.print_auto_autoatendimento, false),
    print_auto_pdv: bool(row.print_auto_pdv, false),
    print_auto_garcom: bool(row.print_auto_garcom, false),
  }
}

function agentConfigured(s: StoreThermalRow): boolean {
  return Boolean(
    s.print_agent_url &&
      s.print_printer_ip &&
      /^https?:\/\//i.test(s.print_agent_url)
  )
}

export function thermalToggleForCategory(
  cat: ThermalAutoSource,
  s: StoreThermalRow
): boolean {
  switch (cat) {
    case 'delivery':
      return s.print_auto_delivery
    case 'autoatendimento':
      return s.print_auto_autoatendimento
    case 'pdv':
      return s.print_auto_pdv
    case 'garcom':
      return s.print_auto_garcom
    default:
      return false
  }
}

export function shouldAutoThermalPrint(
  orderSource: string | null | undefined,
  store: StoreThermalRow
): boolean {
  if (!agentConfigured(store)) return false
  const cat = thermalAutoSourceFromOrderSource(orderSource)
  if (!cat) return false
  return thermalToggleForCategory(cat, store)
}

async function postToAgent(
  store: StoreThermalRow,
  escposBase64: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = String(store.print_agent_url ?? '').replace(/\/+$/, '')
  const token =
    store.print_agent_token?.trim() || 'vyria-agent-2026'
  const printerIp = String(store.print_printer_ip ?? '').trim()
  const printerPort = store.print_printer_port || 9100

  try {
    const agentRes = await fetch(`${base}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': token,
      },
      body: JSON.stringify({
        printerIp,
        printerPort,
        data: escposBase64,
      }),
      signal: AbortSignal.timeout(8000),
    })
    const result = (await agentRes.json().catch(() => ({}))) as {
      error?: string
    }
    if (!agentRes.ok) {
      return {
        ok: false,
        message: result.error || `HTTP ${agentRes.status}`,
      }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}

type OrderItemRow = { name: string; quantity: number; unit_price: number }

function mapItems(raw: unknown): OrderItemRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => {
    const o = x as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name : 'Item'
    const quantity = Number(o.quantity) || 0
    const unit_price =
      typeof o.unit_price === 'number'
        ? o.unit_price
        : Number(String(o.unit_price ?? o.price ?? 0).replace(',', '.')) || 0
    return { name, quantity, unit_price }
  })
}

function numTotal(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(String(v ?? 0).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export async function buildEscPosForOrder(
  supabase: SupabaseClient,
  storeId: string,
  orderId: string,
  storeName: string
): Promise<{ ok: true; data: string } | { ok: false; message: string }> {
  const { data: pedido, error } = await supabase
    .from('orders')
    .select('*, order_items(name, quantity, unit_price)')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error || !pedido) {
    return { ok: false, message: error?.message || 'Pedido não encontrado.' }
  }

  const row = pedido as Record<string, unknown>
  const items = mapItems(row.order_items)
  const created =
    typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()
  const notes = typeof row.notes === 'string' ? row.notes : undefined
  const source =
    typeof row.source === 'string' ? row.source : undefined

  const data = gerarCupomPedido({
    id: String(row.id ?? orderId),
    store_name: storeName || 'Loja',
    customer_name:
      typeof row.customer_name === 'string' ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === 'string' ? row.customer_phone : undefined,
    delivery_address:
      typeof row.delivery_address === 'string'
        ? row.delivery_address
        : undefined,
    payment_method:
      typeof row.payment_method === 'string' ? row.payment_method : undefined,
    notes,
    total: numTotal(row.total),
    items,
    source,
    source_mesa: parseTableFromNotes(notes ?? null) ?? undefined,
    created_at: created,
  })

  return { ok: true, data }
}

export async function sendThermalCupomForOrder(
  supabase: SupabaseClient,
  storeId: string,
  orderId: string,
  store: StoreThermalRow
): Promise<{ ok: true } | { ok: false; message: string }> {
  const built = await buildEscPosForOrder(
    supabase,
    storeId,
    orderId,
    store.name || 'Loja'
  )
  if (!built.ok) return built
  return postToAgent(store, built.data)
}

/**
 * Impressão automática quando o toggle da origem está ativo e o agente está configurado.
 * Falhas são registadas em consola (não bloqueiam o fluxo do pedido).
 */
export async function tryAutoThermalPrint(
  supabase: SupabaseClient,
  opts: { storeId: string; orderId: string; orderSource: string | null | undefined }
): Promise<void> {
  const { data: row, error } = await supabase
    .from('stores')
    .select(
      'name, print_agent_url, print_agent_token, print_printer_ip, print_printer_port, print_auto_delivery, print_auto_autoatendimento, print_auto_pdv, print_auto_garcom'
    )
    .eq('id', opts.storeId)
    .maybeSingle()

  if (error || !row) {
    console.warn('[thermal-print] loja:', error?.message)
    return
  }

  const store = parseStoreThermalRow(row as Record<string, unknown>)
  if (!shouldAutoThermalPrint(opts.orderSource, store)) return

  const r = await sendThermalCupomForOrder(
    supabase,
    opts.storeId,
    opts.orderId,
    store
  )
  if (!r.ok) {
    console.warn(
      `[thermal-print] order ${opts.orderId}:`,
      r.message
    )
  }
}
