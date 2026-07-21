import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { gerarCupomPedido } from '@/lib/escpos'
import type { PaperMm } from '@/lib/print/layout'
import { orderTicketVariantFromSource } from '@/lib/print/order-ticket-variant'
import { parseTableFromNotes } from '@/lib/waiter-order-notes'
import {
  shouldAutoThermalPrintForSource,
  thermalAgentConfigured,
} from '@/lib/thermal-print-policy'

export type StoreThermalRow = {
  name: string | null
  print_agent_url: string | null
  print_agent_token: string | null
  print_printer_ip: string | null
  print_printer_port: number | null
  print_paper_mm: PaperMm
  print_include_customer_details: boolean
  print_delivery_copy: boolean
  print_auto_delivery: boolean
  print_auto_autoatendimento: boolean
  print_auto_pdv: boolean
  print_auto_garcom: boolean
}

export type ThermalPrintErrorCode =
  | 'agent_not_configured'
  | 'agent_offline'
  | 'agent_http_error'
  | 'printer_offline'
  | 'printer_timeout'
  | 'printer_connection_refused'
  | 'unauthorized'
  | 'order_not_found'
  | 'build_failed'

export type ThermalPrintResult =
  | { ok: true }
  | { ok: false; code: ThermalPrintErrorCode; message: string; detail?: string }

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
    print_paper_mm: Number(row.print_paper_mm) === 58 ? 58 : 80,
    print_include_customer_details: bool(row.print_include_customer_details, false),
    print_delivery_copy: bool(row.print_delivery_copy, false),
    print_auto_delivery: bool(row.print_auto_delivery, false),
    print_auto_autoatendimento: bool(row.print_auto_autoatendimento, false),
    print_auto_pdv: bool(row.print_auto_pdv, false),
    print_auto_garcom: bool(row.print_auto_garcom, false),
  }
}

export function shouldAutoThermalPrint(
  orderSource: string | null | undefined,
  store: StoreThermalRow
): boolean {
  return shouldAutoThermalPrintForSource(orderSource, store)
}

function agentConfigured(s: StoreThermalRow): boolean {
  return thermalAgentConfigured(s)
}

async function postToAgent(
  store: StoreThermalRow,
  escposBase64: string
): Promise<ThermalPrintResult> {
  const base = String(store.print_agent_url ?? '').replace(/\/+$/, '')
  const token = store.print_agent_token?.trim()
  if (!token) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'Token do agente de impressão não configurado.',
    }
  }
  const printerIp = String(store.print_printer_ip ?? '').trim()
  const printerPort = store.print_printer_port || 9100

  if (!agentConfigured(store)) {
    return {
      ok: false,
      code: 'agent_not_configured',
      message: 'Agente ou IP da impressora não configurado.',
    }
  }

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
      code?: ThermalPrintErrorCode
      detail?: string
    }
    if (!agentRes.ok) {
      return {
        ok: false,
        code:
          result.code ??
          (agentRes.status === 401
            ? 'unauthorized'
            : agentRes.status === 504
              ? 'printer_timeout'
              : 'agent_http_error'),
        message: result.error || `Agente respondeu HTTP ${agentRes.status}.`,
        detail: result.detail,
      }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      code: 'agent_offline',
      message: `Agente offline ou URL inacessível: ${msg}`,
      detail: msg,
    }
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
  store: StoreThermalRow
): Promise<{ ok: true; data: string } | { ok: false; message: string }> {
  const { data: pedido, error } = await supabase
    .from('orders')
    .select('*, order_items(name, quantity, unit_price, price)')
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
  const deliveryFee =
    row.delivery_fee == null
      ? null
      : typeof row.delivery_fee === 'number'
        ? row.delivery_fee
        : String(row.delivery_fee)

  const data = gerarCupomPedido({
    id: String(row.id ?? orderId),
    store_name: store.name || 'Loja',
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
    payment_status:
      typeof row.payment_status === 'string' ? row.payment_status : null,
    notes,
    delivery_fee: deliveryFee,
    items_summary:
      typeof row.items_summary === 'string' && row.items_summary.trim()
        ? row.items_summary
        : null,
    total: numTotal(row.total),
    items,
    source,
    source_mesa: parseTableFromNotes(notes ?? null) ?? undefined,
    created_at: created,
    paper_mm: store.print_paper_mm,
    variant: orderTicketVariantFromSource(source, {
      delivery_address:
        typeof row.delivery_address === 'string' ? row.delivery_address : null,
      delivery_fee: deliveryFee,
    }),
    printing: {
      print_include_customer_details: store.print_include_customer_details,
      print_delivery_copy: store.print_delivery_copy,
      print_paper_mm: store.print_paper_mm,
    },
  })

  return { ok: true, data }
}

export async function sendThermalCupomForOrder(
  supabase: SupabaseClient,
  storeId: string,
  orderId: string,
  store: StoreThermalRow
): Promise<ThermalPrintResult> {
  const built = await buildEscPosForOrder(
    supabase,
    storeId,
    orderId,
    store
  )
  if (!built.ok) return { ok: false, code: 'build_failed', message: built.message }
  return postToAgent(store, built.data)
}

function logThermalPrint(
  level: 'info' | 'warn',
  payload: {
    storeId: string
    orderId: string
    source: string | null | undefined
    code?: string
    message: string
  }
) {
  const line = { service: 'thermal-print', ...payload }
  if (level === 'warn') console.warn('[thermal-print]', line)
  else console.info('[thermal-print]', line)
}

/**
 * Impressão automática quando o toggle da origem está ativo e o agente está configurado.
 * Usa service role no servidor (nunca confiar em RLS/anon para configs da loja).
 */
export async function tryAutoThermalPrint(opts: {
  storeId: string
  orderId: string
  orderSource: string | null | undefined
}): Promise<void> {
  let supabase: SupabaseClient
  try {
    supabase = createServiceRoleClient()
  } catch (e) {
    console.warn('[thermal-print] service role:', e)
    return
  }

  const { data: row, error } = await supabase
    .from('stores')
    .select(
      'name, print_agent_url, print_agent_token, print_printer_ip, print_printer_port, print_paper_mm, print_include_customer_details, print_delivery_copy, print_auto_delivery, print_auto_autoatendimento, print_auto_pdv, print_auto_garcom'
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
    logThermalPrint('warn', {
      storeId: opts.storeId,
      orderId: opts.orderId,
      source: opts.orderSource,
      code: r.code,
      message: r.message,
    })
    return
  }
  logThermalPrint('info', {
    storeId: opts.storeId,
    orderId: opts.orderId,
    source: opts.orderSource,
    message: 'Impresso via Print Agent.',
  })
}
