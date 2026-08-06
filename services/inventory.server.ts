import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type ProductStockRow = {
  productId: string
  quantity: number
  lowStockAlert: number | null
}

export async function getProductStocksForStore(
  storeId: string
): Promise<
  Map<
    string,
    { quantity: number; lowStockAlert: number | null; updatedAt: string | null }
  >
> {
  const map = new Map<
    string,
    { quantity: number; lowStockAlert: number | null; updatedAt: string | null }
  >()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('store_product_stock')
    .select('product_id, quantity, low_stock_alert, updated_at')
    .eq('store_id', storeId)

  if (error) {
    if (
      error.message.includes('store_product_stock') ||
      error.message.includes('does not exist')
    ) {
      return map
    }
    console.error('[inventory] select:', error.message)
    return map
  }

  for (const row of data ?? []) {
    const pid = String(row.product_id ?? '')
    if (!pid) continue
    map.set(pid, {
      quantity: Math.max(0, Number(row.quantity) || 0),
      lowStockAlert:
        row.low_stock_alert == null
          ? null
          : Math.max(0, Number(row.low_stock_alert)),
      updatedAt: row.updated_at == null ? null : String(row.updated_at),
    })
  }
  return map
}

export async function decrementProductStockForLines(
  db: SupabaseClient,
  storeId: string,
  lines: Array<{ product_id: string; quantity: number; name?: string }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const totals = new Map<string, { qty: number; name: string }>()
  for (const line of lines) {
    const pid = String(line.product_id ?? '').trim()
    if (!pid) continue
    const qty = Math.max(0, Number(line.quantity) || 0)
    if (qty <= 0) continue
    const prev = totals.get(pid)
    totals.set(pid, {
      qty: (prev?.qty ?? 0) + qty,
      name: line.name?.trim() || prev?.name || 'produto',
    })
  }

  for (const [productId, { qty, name }] of totals) {
    const { data: row } = await db
      .from('store_product_stock')
      .select('quantity')
      .eq('store_id', storeId)
      .eq('product_id', productId)
      .maybeSingle()

    if (!row) continue

    const { data: updated, error } = await db
      .from('store_product_stock')
      .update({
        quantity: Math.max(0, (Number(row.quantity) || 0) - qty),
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)
      .eq('product_id', productId)
      .gte('quantity', qty)
      .select('quantity')
      .maybeSingle()

    if (error) {
      return { ok: false, error: error.message || 'Erro ao actualizar estoque.' }
    }
    if (!updated) {
      return {
        ok: false,
        error: `Estoque insuficiente para "${name}".`,
      }
    }
  }

  return { ok: true }
}

export async function incrementProductStockForLines(
  db: SupabaseClient,
  storeId: string,
  lines: Array<{ product_id: string; quantity: number }>
): Promise<void> {
  const totals = new Map<string, number>()
  for (const line of lines) {
    const pid = String(line.product_id ?? '').trim()
    if (!pid) continue
    const qty = Math.max(0, Number(line.quantity) || 0)
    if (qty <= 0) continue
    totals.set(pid, (totals.get(pid) ?? 0) + qty)
  }

  const now = new Date().toISOString()
  for (const [productId, qty] of totals) {
    const { data: row } = await db
      .from('store_product_stock')
      .select('quantity')
      .eq('store_id', storeId)
      .eq('product_id', productId)
      .maybeSingle()

    if (!row) continue

    await db
      .from('store_product_stock')
      .update({
        quantity: Math.max(0, (Number(row.quantity) || 0) + qty),
        updated_at: now,
      })
      .eq('store_id', storeId)
      .eq('product_id', productId)
  }
}

export async function adjustProductStockForOrderEdit(
  db: SupabaseClient,
  storeId: string,
  previousLines: Array<{ product_id: string; quantity: number; name?: string }>,
  nextLines: Array<{ product_id: string; quantity: number; name?: string }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const aggregate = (
    lines: Array<{ product_id: string; quantity: number; name?: string }>
  ) => {
    const map = new Map<string, { qty: number; name: string }>()
    for (const line of lines) {
      const pid = String(line.product_id ?? '').trim()
      if (!pid) continue
      const qty = Math.max(0, Number(line.quantity) || 0)
      if (qty <= 0) continue
      const prev = map.get(pid)
      map.set(pid, {
        qty: (prev?.qty ?? 0) + qty,
        name: line.name?.trim() || prev?.name || 'produto',
      })
    }
    return map
  }

  const prevTotals = aggregate(previousLines)
  const nextTotals = aggregate(nextLines)
  const productIds = new Set([...prevTotals.keys(), ...nextTotals.keys()])

  for (const productId of productIds) {
    const prevQty = prevTotals.get(productId)?.qty ?? 0
    const nextQty = nextTotals.get(productId)?.qty ?? 0
    const delta = round2(nextQty - prevQty)
    if (delta === 0) continue

    const name =
      nextTotals.get(productId)?.name ?? prevTotals.get(productId)?.name ?? 'produto'

    if (delta > 0) {
      const dec = await decrementProductStockForLines(db, storeId, [
        { product_id: productId, quantity: delta, name },
      ])
      if (!dec.ok) return dec
    } else {
      await incrementProductStockForLines(db, storeId, [
        { product_id: productId, quantity: -delta },
      ])
    }
  }

  return { ok: true }
}
