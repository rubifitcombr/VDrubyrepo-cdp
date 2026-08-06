import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PdvPricedLine } from '@/lib/pdv-price.server'
import { mapPricedLinesToOrderItemRows } from '@/lib/pdv-price.server'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function rowsToRpcPayload(
  orderId: string,
  lines: PdvPricedLine[]
): Array<Record<string, unknown>> {
  return mapPricedLinesToOrderItemRows(orderId, lines).map((row) => ({
    product_id: row.product_id,
    quantity: row.quantity,
    price: row.price,
    unit_price: row.unit_price,
    name: row.name,
    unit_type: row.unit_type,
    weight_kg: row.weight_kg ?? null,
    price_per_kg_snapshot: row.price_per_kg_snapshot ?? null,
    addons: row.addons ?? null,
  }))
}

export async function replaceWaiterOrderItemsAtomic(
  db: SupabaseClient,
  orderId: string,
  storeId: string,
  lines: PdvPricedLine[]
): Promise<{ ok: true } | { ok: false; error: string; useFallback?: boolean }> {
  const payload = rowsToRpcPayload(orderId, lines)
  const { error } = await db.rpc('replace_order_items_for_order', {
    p_order_id: orderId,
    p_store_id: storeId,
    p_items: payload,
  })

  if (!error) return { ok: true }

  const msg = error.message ?? ''
  if (/function.*does not exist|42883|replace_order_items_for_order/i.test(msg)) {
    return { ok: false, error: msg, useFallback: true }
  }
  if (/empty_items/i.test(msg)) {
    return { ok: false, error: 'A comanda precisa de pelo menos um item.' }
  }
  if (/order_not_found/i.test(msg)) {
    return { ok: false, error: 'Pedido não encontrado.' }
  }
  return { ok: false, error: msg || 'Erro ao gravar itens.' }
}

export type OrderItemBackupRow = {
  product_id: string | null
  quantity: number
  unit_price: number
  price: number
  name: string
  unit_type?: string | null
  weight_kg?: number | null
  price_per_kg_snapshot?: number | null
  addons?: unknown
}

export function backupRowsToStockLines(
  rows: Array<{
    product_id: string | null
    quantity: number
    name?: string | null
  }>
): Array<{ product_id: string; quantity: number; name: string }> {
  return rows
    .filter((r) => r.product_id)
    .map((r) => ({
      product_id: String(r.product_id),
      quantity: round2(Math.max(0, Number(r.quantity) || 0)),
      name: String(r.name || 'produto'),
    }))
}
