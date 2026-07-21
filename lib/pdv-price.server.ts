import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  effectiveProductPrice,
  type ProductPriceChannel,
} from '@/lib/product-pricing'
import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  type MenuProductRow,
} from '@/lib/menu-product'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type PdvPricedLine = {
  product_id: string
  quantity: number
  unit_price: number
  name: string
}

/**
 * Recalcula preços PDV no servidor (canal base/balcão) — ignora unit_price do cliente.
 */
export async function pricePdvLinesFromCatalog(
  supabase: SupabaseClient,
  storeId: string,
  items: Array<{
    product_id?: unknown
    quantity?: unknown
    unit_price?: unknown
    name?: unknown
  }>
): Promise<
  | { ok: true; lines: PdvPricedLine[] }
  | { ok: false; error: string; status: number }
> {
  const productIds = items
    .map((i) => String(i.product_id ?? '').trim())
    .filter(Boolean)

  if (productIds.length === 0) {
    return { ok: false, error: 'Cada item precisa de product_id válido.', status: 400 }
  }

  const { data: productRows, error: prodErr } = await supabase
    .from('products')
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', storeId)
    .eq('active', true)
    .in('id', productIds)

  if (prodErr) {
    return {
      ok: false,
      error: 'Não foi possível validar os produtos.',
      status: 500,
    }
  }

  const byId = new Map<string, MenuProductRow>()
  for (const raw of productRows ?? []) {
    const row = normalizeMenuProductRow(raw as Record<string, unknown>, storeId)
    if (row.id) byId.set(row.id, row)
  }

  const channel: ProductPriceChannel = 'base'
  const lines: PdvPricedLine[] = []

  for (const item of items) {
    const productId = String(item.product_id ?? '').trim()
    if (!productId) continue
    const row = byId.get(productId)
    if (!row) continue

    const serverUnit = round2(effectiveProductPrice(row, channel))
    const clientUnit = round2(Math.max(0, Number(item.unit_price) || 0))
    if (Math.abs(clientUnit - serverUnit) > 0.02) {
      return {
        ok: false,
        error: `O preço de «${row.name || 'produto'}» mudou. Actualiza o PDV e tenta de novo.`,
        status: 409,
      }
    }

    lines.push({
      product_id: productId,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      unit_price: serverUnit,
      name: row.name?.trim() || String(item.name ?? '').trim() || 'Item',
    })
  }

  if (lines.length === 0) {
    return {
      ok: false,
      error: 'Nenhum item válido para esta loja.',
      status: 400,
    }
  }

  return { ok: true, lines }
}
