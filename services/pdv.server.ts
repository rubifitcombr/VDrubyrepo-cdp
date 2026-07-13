import 'server-only'

import {
  MENU_PRODUCT_PDV_SELECT,
  normalizeMenuProductRow,
  sortMenuProductRows,
  type MenuProductRow,
} from '@/lib/menu-product'
import { createClient } from '@/lib/supabase/server'

/** Produtos ativos para o PDV (mesmas colunas do cardápio). */
export async function getPdvProductsForStore(
  storeId: string
): Promise<MenuProductRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select(MENU_PRODUCT_PDV_SELECT)
    .eq('store_id', storeId)
    .eq('active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    console.warn('[pdv] select failed, fallback *:', error.message)
    const { data: all, error: e2 } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('name', { ascending: true })
    if (e2) {
      console.error('[pdv] fallback *:', e2.message)
      return []
    }
    return sortMenuProductRows(
      ((all as Record<string, unknown>[]) ?? [])
        .map((row) => normalizeMenuProductRow(row, storeId))
        .filter((r) => r.active !== false)
    )
  }
  return sortMenuProductRows(
    ((data as Record<string, unknown>[]) ?? []).map((row) =>
      normalizeMenuProductRow(row, storeId)
    )
  )
}
